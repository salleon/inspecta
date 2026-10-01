import { useRef, useState, type CSSProperties } from "react";
import type { Finding, Photo, SiteReport } from "../db/types";
import { bulkGroups, bulkTicked } from "../lib/customReports";
import { useBackHandler } from "../lib/backButton";
import ConfirmDialog from "./ConfirmDialog";

// Customised reports on the export page (canvas ExportReports): the row of
// report chips, and Create Customised Report: name it, bulk refine findings
// (Skip, or tick a level / location / type / ESR category in one go), pick
// the findings in the preview, organise by time taken or ESR category, Done.

type Entry = { finding: Finding; photos: Photo[] };

const chip = (on: boolean): CSSProperties => ({
  flexShrink: 0,
  padding: "7px 12px",
  borderRadius: 999,
  border: `1px solid ${on ? "rgba(46,196,182,.6)" : "var(--border-strong)"}`,
  background: on ? "rgba(46,196,182,.14)" : "none",
  color: on ? "var(--accent)" : "var(--muted)",
  fontSize: 12,
  fontWeight: 800,
  whiteSpace: "nowrap",
});
// Skip: translucent orange while nothing is picked to bulk tick
const skipChip = (on: boolean): CSSProperties => ({
  ...chip(false),
  ...(on ? { border: "1px solid rgba(245,165,92,.6)", background: "rgba(245,165,92,.14)", color: "#f5a55c" } : null),
});
const label: CSSProperties = { fontSize: 11, fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--muted-2)" };
const primary = (off = false): CSSProperties => ({ flex: 1, padding: "13px 0", borderRadius: 12, border: "none", background: "var(--accent)", color: "var(--accent-text)", fontSize: 14, fontWeight: 800, opacity: off ? 0.45 : 1 });
const quiet: CSSProperties = { flex: 1, padding: "13px 0", borderRadius: 12, border: "1px solid var(--border-strong)", background: "var(--panel)", color: "var(--muted)", fontSize: 14, fontWeight: 800 };

// Whole site, then each customised report, with its count. Tap to look at
// one; long-press a customised one to change it or delete it.
export function ReportChips({
  total,
  reports,
  current,
  onSelect,
  onChange,
  onDelete,
}: {
  total: number;
  reports: SiteReport[];
  current: string | null;
  onSelect: (id: string | null) => void;
  onChange: (r: SiteReport) => void;
  onDelete: (r: SiteReport) => void;
}) {
  const [menu, setMenu] = useState<SiteReport | null>(null);
  const [confirming, setConfirming] = useState<SiteReport | null>(null);
  const timer = useRef<number | null>(null);
  const held = useRef(false);
  useBackHandler(() => {
    if (!menu) return false;
    setMenu(null);
    return true;
  });
  const press = (r: SiteReport) => ({
    onPointerDown: () => {
      held.current = false;
      timer.current = window.setTimeout(() => {
        held.current = true;
        setMenu(r);
      }, 500);
    },
    onPointerUp: () => timer.current !== null && window.clearTimeout(timer.current),
    onPointerLeave: () => timer.current !== null && window.clearTimeout(timer.current),
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  });
  if (!reports.length) return null;
  const row: CSSProperties = { width: "100%", padding: "14px 4px", border: "none", borderBottom: "1px solid var(--border)", background: "none", textAlign: "left", fontSize: 15, fontWeight: 700, color: "var(--text)" };
  return (
    <>
      <div style={{ flexShrink: 0, display: "flex", gap: 6, overflowX: "auto", padding: "0 16px 4px" }}>
        <button style={chip(current === null)} onClick={() => onSelect(null)}>
          Whole site · {total}
        </button>
        {reports.map((r) => (
          <button
            key={r.id}
            style={chip(current === r.id)}
            aria-label={`${r.name} report`}
            {...press(r)}
            onClick={() => {
              if (!held.current) onSelect(r.id);
            }}
          >
            {r.name} · {r.findingIds.length}
          </button>
        ))}
      </div>
      {menu && (
        <div onClick={() => setMenu(null)} style={{ position: "absolute", inset: 0, zIndex: 50, background: "rgba(3,13,22,.62)", display: "flex", alignItems: "flex-end" }}>
          <div onClick={(e) => e.stopPropagation()} role="menu" aria-label={`${menu.name} report`} style={{ width: "100%", background: "var(--panel)", borderRadius: "20px 20px 0 0", padding: "18px 20px calc(24px + env(safe-area-inset-bottom))", display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 17, fontWeight: 800, paddingBottom: 6 }}>{menu.name}</div>
            <button
              role="menuitem"
              style={row}
              onClick={() => {
                setMenu(null);
                onChange(menu);
              }}
            >
              Change name, findings or order
            </button>
            <button
              role="menuitem"
              style={{ ...row, borderBottom: "none", color: "#ff6b6b" }}
              onClick={() => {
                setConfirming(menu);
                setMenu(null);
              }}
            >
              Delete this report
            </button>
          </div>
        </div>
      )}
      {confirming && (
        <ConfirmDialog
          title={`Delete "${confirming.name}"?`}
          message="The report is removed from the export page. Its findings stay on the site and in the whole-site report."
          onCancel={() => setConfirming(null)}
          onConfirm={() => {
            onDelete(confirming);
            setConfirming(null);
          }}
        />
      )}
    </>
  );
}

export default function CustomReport({
  entries,
  previews,
  existing,
  onCancel,
  onSave,
}: {
  entries: Entry[];
  previews: Record<string, string>;
  existing: SiteReport | null;
  onCancel: () => void;
  onSave: (r: SiteReport) => void;
}) {
  const [step, setStep] = useState<"sheet" | "pick">("sheet");
  const [name, setName] = useState(existing?.name ?? "");
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [ticked, setTicked] = useState<Set<string>>(new Set(existing?.findingIds ?? []));
  const [order, setOrder] = useState<SiteReport["order"]>(existing?.order ?? "esr");
  const groups = bulkGroups(entries);
  const bulk = bulkTicked(groups, chosen);

  useBackHandler(() => {
    if (step === "pick") setStep("sheet");
    else onCancel();
    return true;
  });

  const toPick = () => {
    if (!name.trim()) return;
    // a bulk pick ticks its findings; Skip keeps what's ticked (nothing, for
    // a new report)
    if (chosen.size) setTicked(new Set(bulk));
    setStep("pick");
  };
  const toggleBulk = (key: string) =>
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const toggle = (id: string) =>
    setTicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const done = () => {
    if (!ticked.size) return;
    const now = Date.now();
    onSave({
      id: existing?.id ?? crypto.randomUUID(),
      name: name.trim(),
      findingIds: entries.map((e) => e.finding.id).filter((id) => ticked.has(id)),
      order,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });
  };

  if (step === "pick") {
    return (
      <div role="dialog" aria-label="Pick findings" style={{ position: "absolute", inset: 0, zIndex: 45, background: "var(--bg)", display: "flex", flexDirection: "column" }}>
        <div style={{ flexShrink: 0, height: 64, padding: "0 12px", display: "flex", alignItems: "center", gap: 10 }}>
          <button aria-label="Back" onClick={() => setStep("sheet")} style={{ width: 40, height: 40, borderRadius: "50%", border: "1px solid var(--border)", background: "var(--panel)", color: "var(--text)", fontSize: 18 }}>
            ‹
          </button>
          <div style={{ flex: 1, minWidth: 0, textAlign: "center", fontSize: 14, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name.trim()}: findings</div>
          <div style={{ width: 40 }} />
        </div>
        <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 8, padding: "0 16px 8px" }}>
          <span style={{ flex: 1, fontSize: 12.5, fontWeight: 700, color: "var(--muted)" }}>
            {ticked.size} of {entries.length} ticked
          </span>
          <button style={chip(false)} onClick={() => setTicked(new Set(entries.map((e) => e.finding.id)))}>
            All
          </button>
          <button style={chip(false)} onClick={() => setTicked(new Set())}>
            None
          </button>
        </div>
        <div style={{ flexGrow: 1, overflowY: "auto", padding: "0 16px 12px" }}>
          <div style={{ background: "var(--paper)", borderRadius: 12, padding: "8px 14px" }}>
            {entries.map(({ finding, photos }, i) => {
              const on = ticked.has(finding.id);
              const img = photos.map((p) => previews[p.id]).find(Boolean);
              return (
                <button
                  key={finding.id}
                  role="checkbox"
                  aria-checked={on}
                  aria-label={finding.note || "Untitled finding"}
                  onClick={() => toggle(finding.id)}
                  style={{ width: "100%", display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 0", border: "none", borderTop: i ? "1px solid var(--paper-border)" : "none", background: "none", textAlign: "left", opacity: on ? 1 : 0.4 }}
                >
                  <span style={{ width: 22, height: 22, marginTop: 2, flexShrink: 0, boxSizing: "border-box", borderRadius: 6, border: `2px solid ${on ? "var(--accent)" : "#b9c3cc"}`, background: on ? "var(--accent)" : "none", color: "var(--accent-text)", fontSize: 13, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {on ? "✓" : ""}
                  </span>
                  <span style={{ width: 70, height: 52, flexShrink: 0, borderRadius: 5, overflow: "hidden", background: "#e2ddd0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 600, color: "var(--muted-2)" }}>
                    {img ? <img src={img} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : photos.length ? "" : "No photo"}
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 13, fontWeight: 700, color: "var(--paper-text)", lineHeight: 1.35 }}>{finding.note || "Untitled finding"}</span>
                    <span style={{ display: "block", marginTop: 3, fontSize: 11, fontWeight: 600, color: "var(--muted-2)", lineHeight: 1.45 }}>{[finding.level, finding.location].filter(Boolean).join(" · ")}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        <div style={{ flexShrink: 0, padding: "10px 16px calc(24px + env(safe-area-inset-bottom))", borderTop: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={label}>Organise by</div>
          <div role="radiogroup" aria-label="Organise by" style={{ display: "flex", gap: 4, padding: 4, borderRadius: 12, background: "var(--bg)", border: "1px solid var(--border)" }}>
            {(
              [
                ["time", "Time taken"],
                ["esr", "ESR category"],
              ] as const
            ).map(([v, l]) => (
              <button key={v} role="radio" aria-checked={order === v} onClick={() => setOrder(v)} style={{ flex: 1, padding: "9px 0", borderRadius: 9, border: `1px solid ${order === v ? "rgba(46,196,182,.6)" : "transparent"}`, background: order === v ? "rgba(46,196,182,.14)" : "none", color: order === v ? "var(--accent)" : "var(--muted)", fontSize: 13, fontWeight: 800 }}>
                {l}
              </button>
            ))}
          </div>
          <button style={primary(!ticked.size)} disabled={!ticked.size} onClick={done}>
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 45, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
      <div onClick={onCancel} style={{ position: "absolute", inset: 0, background: "rgba(3,13,22,.62)" }} />
      <div role="dialog" aria-label="Create Customised Report" style={{ position: "relative", maxHeight: "88%", overflowY: "auto", background: "var(--panel)", borderRadius: "20px 20px 0 0", padding: "22px 20px calc(28px + env(safe-area-inset-bottom))", display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ fontSize: 17, fontWeight: 800 }}>{existing ? "Change report" : "Create Customised Report"}</div>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="Report name"
          placeholder="Name this report, e.g. Level 2 defects"
          style={{ width: "100%", boxSizing: "border-box", padding: "13px 14px", borderRadius: 12, background: "var(--panel-2)", border: "1px solid var(--border-strong)", fontSize: 15, fontWeight: 700, color: "var(--text)", outline: "none" }}
        />
        <div style={label}>Bulk refine findings</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {groups.map((g, gi) => (
            <div key={g.heading || "all"} style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {g.heading && <div style={{ fontSize: 10.5, fontWeight: 800, color: "var(--muted-2)" }}>{g.heading}</div>}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {gi === 0 && (
                  <button style={skipChip(!chosen.size)} onClick={() => setChosen(new Set())}>
                    Skip
                  </button>
                )}
                {g.options.map((o) => (
                  <button key={o.key} style={chip(chosen.has(o.key))} aria-pressed={chosen.has(o.key)} onClick={() => toggleBulk(o.key)}>
                    {o.label} · {o.ids.length}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.45 }}>
          {chosen.size
            ? `${bulk.size} finding${bulk.size === 1 ? "" : "s"} will start ticked; then tick or untick them in the preview.`
            : existing
              ? "Skip: keeps the findings already in the report; change them in the preview."
              : "Skip: nothing ticked to start; tick each finding yourself in the preview."}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button style={quiet} onClick={onCancel}>
            Cancel
          </button>
          <button style={primary(!name.trim())} disabled={!name.trim()} onClick={toPick}>
            Pick findings
          </button>
        </div>
      </div>
    </div>
  );
}
