import { say } from "./Message";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import type { FlowKind, FlowTest, Site, StairTest } from "../db/types";
import { addFlowTest, deleteFlowTest, deleteStairTest, listFlowTests, listStairTests } from "../db/db";
import { blankThumbSvg, chartSvg, KIND_HINT, KIND_LABEL, newFlowTest, readingCount, summary } from "../lib/flowTest";
import { KIND_LABEL as STAIR_KIND, stairTestSummary, systemLine } from "../lib/stairTest";
import { exportTests, type TestsFormat } from "../lib/testsExport";
import { useBackHandler } from "../lib/backButton";
import ConfirmDialog from "./ConfirmDialog";
import SwipeRow from "./SwipeRow";
import ProgressOverlay from "./ProgressOverlay";
import SiteKindIcon from "./SiteKindIcon";
import { Pill } from "./StairUi";

// The Other tests tab of an AFSS or project site, and a stair pressurisation
// site's list (design canvas SiteTests): every test on the site, flow and
// stair, each with its icon; swipe left to delete. + Add a test asks which
// kind (more kinds join that list later); Export asks which tests, as PDF
// and / or Excel. Once a site's stair pressurisation system is set up, it
// sits at the top with Edit, so it can be changed any time.

const FLOW_KINDS: FlowKind[] = ["sprinkler", "hydrant", "combined", "blank"];
const MIN_LOADER_MS = 3000;

type Item = { kind: "flow"; test: FlowTest } | { kind: "stair"; test: StairTest };

const formatDay = (ms: number) => new Date(ms).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });

const sheetPanel: CSSProperties = {
  width: "100%",
  background: "var(--panel)",
  borderRadius: "20px 20px 0 0",
  padding: "22px 20px calc(28px + env(safe-area-inset-bottom))",
  display: "flex",
  flexDirection: "column",
  gap: 10,
};
const option: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  textAlign: "left",
  width: "100%",
  padding: "13px 14px",
  borderRadius: 14,
  background: "var(--panel-2)",
  border: "1px solid var(--border)",
  color: "var(--text)",
};
const cancelBtn: CSSProperties = { width: "100%", padding: "13px 0", borderRadius: 12, border: "1px solid var(--border-strong)", background: "none", color: "var(--text)", fontSize: 14.5, fontWeight: 800 };

function Sheet({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  return (
    <div className="sheet-backdrop" onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(10,11,13,0.6)", display: "flex", alignItems: "flex-end", zIndex: 5 }}>
      <div className="sheet-panel" onClick={(e) => e.stopPropagation()} style={sheetPanel}>
        {children}
      </div>
    </div>
  );
}

export default function TestsList({ site, mode, onCount }: { site: Site; mode: "other" | "spf"; onCount: (n: number) => void }) {
  const navigate = useNavigate();
  const [items, setItems] = useState<Item[] | null>(null);
  const [sheet, setSheet] = useState<null | "add" | "flow" | "export">(null);
  const [openSwipeId, setOpenSwipeId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<Item | null>(null);
  const [busy, setBusy] = useState(false);
  // export: the tests picked, and the formats
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [formats, setFormats] = useState<Set<TestsFormat>>(new Set(["pdf", "xlsx"]));
  const [exporting, setExporting] = useState<{ percent: number; step: string } | null>(null);
  const started = useRef(0);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([mode === "other" ? listFlowTests(site.id) : Promise.resolve([]), listStairTests(site.id)]).then(([flow, stair]) => {
      if (cancelled) return;
      const all: Item[] = [...flow.map((test) => ({ kind: "flow" as const, test })), ...stair.map((test) => ({ kind: "stair" as const, test }))];
      all.sort((a, b) => a.test.order - b.test.order);
      setItems(all);
      onCount(all.length);
    });
    return () => {
      cancelled = true;
    };
  }, [site.id, mode, onCount]);

  useBackHandler(() => {
    if (!sheet) return false;
    setSheet(sheet === "flow" ? "add" : null);
    return true;
  });

  async function pickFlow(kind: FlowKind) {
    if (busy) return;
    setBusy(true);
    try {
      const test = await addFlowTest(newFlowTest(site.id, kind));
      navigate(`/site/${site.id}/flow/${test.id}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    const item = confirming;
    if (!item || busy) return;
    setBusy(true);
    try {
      if (item.kind === "flow") await deleteFlowTest(item.test.id);
      else await deleteStairTest(item.test.id);
      const left = (items ?? []).filter((i) => i.test.id !== item.test.id);
      setItems(left);
      onCount(left.length);
      setConfirming(null);
      setOpenSwipeId(null);
    } finally {
      setBusy(false);
    }
  }

  function openExport() {
    setPicked(new Set((items ?? []).map((i) => i.test.id)));
    setSheet("export");
  }

  async function runExport() {
    const chosen = (items ?? []).filter((i) => picked.has(i.test.id));
    if (!chosen.length || !formats.size || exporting) return;
    setSheet(null);
    started.current = performance.now();
    setExporting({ percent: 5, step: "Getting ready…" });
    try {
      await exportTests(
        {
          flow: chosen.flatMap((i) => (i.kind === "flow" ? [i.test] : [])),
          stair: chosen.flatMap((i) => (i.kind === "stair" ? [i.test] : [])),
          site,
          formats: (["pdf", "xlsx"] as TestsFormat[]).filter((f) => formats.has(f)),
        },
        (percent, step) => setExporting({ percent, step }),
      );
    } catch (err) {
      if (!(err instanceof Error) || !/cancell?ed/i.test(err.message)) {
        console.error("tests export failed", err);
        say("Couldn't export the tests");
      }
    } finally {
      const left = MIN_LOADER_MS - (performance.now() - started.current);
      if (left > 0) await new Promise((r) => setTimeout(r, Math.min(left, 600)));
      setExporting(null);
    }
  }

  const n = picked.size;
  const all = !!items && n === items.length;
  const exportLabel =
    n === 0 || !formats.size
      ? "Pick a test to export"
      : `Export ${all && n > 1 ? (n === 2 ? "both tests" : `all ${n} tests`) : `${n} test${n === 1 ? "" : "s"}`}${formats.size === 1 ? (formats.has("pdf") ? " · PDF" : " · Excel") : ""}`;
  const toggle = (id: string) =>
    setPicked((p) => {
      const next = new Set(p);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <>
      <div style={{ flexGrow: 1, overflowY: "auto", padding: "4px 16px 12px", display: "flex", flexDirection: "column", gap: 10 }}>
        {!!site.spf?.stairs.length && (
          <div data-testid="spf-system" style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--panel-2)", border: "1px solid var(--border-strong)", borderRadius: 12, padding: "9px 11px", fontSize: 12, color: "#bfd0de", lineHeight: 1.4 }}>
            <span style={{ flexGrow: 1 }}>
              <b style={{ color: "var(--text)" }}>{mode === "spf" ? "The system" : "Stair pressurisation system"}</b>
              <br />
              {systemLine(site.spf)}
            </span>
            <Pill onClick={() => navigate(`/site/${site.id}/spf-system?back=${encodeURIComponent(`/site/${site.id}/findings?tab=flow`)}`)}>Edit</Pill>
          </div>
        )}
        {items?.length === 0 && (
          <div style={{ padding: "40px 8px", textAlign: "center", color: "var(--muted-2)", fontSize: 14, fontWeight: 500 }}>
            {mode === "spf" ? "No stair tests on this site yet." : "No other tests on this site yet: tap + Add a test."}
          </div>
        )}
        {items?.map((item, i) => (
          <SwipeRow
            key={item.test.id}
            index={i}
            label={item.kind === "flow" ? "Delete flow test" : "Delete stair test"}
            swipeOpen={openSwipeId === item.test.id}
            onSwipeOpen={() => setOpenSwipeId(item.test.id)}
            onSwipeClose={() => setOpenSwipeId((id) => (id === item.test.id ? null : id))}
            onOpen={() => navigate(item.kind === "flow" ? `/site/${site.id}/flow/${item.test.id}` : `/site/${site.id}/spf/${item.test.id}`)}
            onDelete={() => setConfirming(item)}
          >
            {item.kind === "flow" ? <FlowCard test={item.test} /> : <StairCard test={item.test} site={site} />}
          </SwipeRow>
        ))}
        {!!items?.length && <div style={{ fontSize: 11.5, color: "var(--muted-2)", textAlign: "center" }}>Swipe a test left to delete it.</div>}
      </div>

      <div style={{ flexShrink: 0, padding: "12px 16px calc(28px + env(safe-area-inset-bottom))", borderTop: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 10 }}>
        {!!items?.length && (
          <button
            data-tour="flow-export-only"
            onClick={openExport}
            style={{ width: "100%", padding: "13px 0", borderRadius: 12, border: "1px solid rgba(90,176,255,.55)", background: "rgba(90,176,255,.1)", color: "#5ab0ff", fontSize: 14.5, fontWeight: 800 }}
          >
            {mode === "spf" ? "Export" : "Export Other Tests Only"}
          </button>
        )}
        <button
          data-tour="new-flow-test"
          onClick={() => (mode === "spf" ? navigate(`/site/${site.id}/spf/new`) : setSheet("add"))}
          className="glow-sweep"
          style={{ position: "relative", overflow: "hidden", width: "100%", padding: "17px 0", borderRadius: 14, background: "var(--accent)", color: "var(--accent-text)", border: "none", fontSize: 16, fontWeight: 800 }}
        >
          {mode === "spf" ? "+ New stair test" : "+ Add a test"}
        </button>
      </div>

      {sheet === "add" && (
        <Sheet onClose={() => setSheet(null)}>
          <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>Add a test</div>
          <button style={option} onClick={() => setSheet("flow")}>
            <span style={{ width: 42, height: 42, borderRadius: 11, background: "rgba(90,176,255,.14)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <SiteKindIcon kind="flow" size={22} />
            </span>
            <span style={{ flexGrow: 1 }}>
              <span style={{ display: "block", fontSize: 15, fontWeight: 800 }}>Flow test</span>
              <span style={{ display: "block", fontSize: 12, color: "var(--muted)", marginTop: 2 }}>Sprinkler, hydrant or combined system: readings, graph and demand points.</span>
            </span>
            <span style={{ color: "var(--muted-2)", fontSize: 18 }}>›</span>
          </button>
          <button style={option} onClick={() => navigate(`/site/${site.id}/spf/new`)}>
            <span style={{ width: 42, height: 42, borderRadius: 11, background: "rgba(177,140,255,.14)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <SiteKindIcon kind="spf" size={22} />
            </span>
            <span style={{ flexGrow: 1 }}>
              <span style={{ display: "block", fontSize: 15, fontWeight: 800 }}>Stair pressurisation (SPF)</span>
            </span>
            <span style={{ color: "var(--muted-2)", fontSize: 18 }}>›</span>
          </button>
          <div style={{ fontSize: 12, color: "var(--muted-2)", textAlign: "center" }}>More tests will be added here.</div>
          <button style={cancelBtn} onClick={() => setSheet(null)}>
            Cancel
          </button>
        </Sheet>
      )}

      {sheet === "flow" && (
        <Sheet onClose={() => setSheet("add")}>
          <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>New flow test</div>
          {FLOW_KINDS.map((k) => (
            <button
              key={k}
              disabled={busy}
              onClick={() => pickFlow(k)}
              style={{ display: "flex", flexDirection: "column", gap: 2, textAlign: "left", width: "100%", padding: "12px 14px", borderRadius: 14, background: "var(--panel-2)", border: "1px solid var(--border)", color: "var(--text)" }}
            >
              <span style={{ fontSize: 14, fontWeight: 800 }}>{KIND_LABEL[k]}</span>
              <span style={{ fontSize: 12, color: "var(--muted)" }}>{KIND_HINT[k]}</span>
            </button>
          ))}
        </Sheet>
      )}

      {sheet === "export" && items && (
        <Sheet onClose={() => setSheet(null)}>
          <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>Export tests</div>
          <CheckRow on={all} onClick={() => setPicked(all ? new Set() : new Set(items.map((i) => i.test.id)))} plain>
            <b style={{ display: "block", fontSize: 14.5 }}>All tests</b>
            <span style={{ fontSize: 11.5, color: "var(--muted)", fontWeight: 600 }}>{items.length === 2 ? "Both of this site’s tests" : `All ${items.length} of this site’s tests`}</span>
          </CheckRow>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: "40vh", overflowY: "auto" }}>
            {items.map((i) => (
              <CheckRow key={i.test.id} on={picked.has(i.test.id)} onClick={() => toggle(i.test.id)}>
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <SiteKindIcon kind={i.kind === "flow" ? "flow" : "spf"} size={16} />
                  <span>
                    <b style={{ display: "block", fontSize: 14.5 }}>{i.kind === "flow" ? i.test.name || "Untitled" : STAIR_KIND[i.test.kind]}</b>
                    <span style={{ fontSize: 11.5, color: "var(--muted)", fontWeight: 600 }}>
                      {i.kind === "flow" ? "Flow test" : "Stair pressurisation"} · {formatDay(i.test.testedAt)}{i.test.fromBackup ? " · From backup" : ""}
                    </span>
                  </span>
                </span>
              </CheckRow>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {(["pdf", "xlsx"] as TestsFormat[]).map((f) => {
              const on = formats.has(f);
              return (
                <button
                  key={f}
                  aria-pressed={on}
                  onClick={() =>
                    setFormats((s) => {
                      const next = new Set(s);
                      if (next.has(f)) next.delete(f);
                      else next.add(f);
                      return next;
                    })
                  }
                  style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: on ? "1px solid rgba(90,176,255,.6)" : "1px solid var(--border-strong)", background: on ? "rgba(90,176,255,.12)" : "none", color: on ? "#5ab0ff" : "var(--muted)", fontSize: 13.5, fontWeight: 800 }}
                >
                  {f === "pdf" ? "PDF" : "Excel"}
                </button>
              );
            })}
          </div>
          <button
            onClick={() => void runExport()}
            disabled={!n || !formats.size}
            style={{ width: "100%", padding: "16px 0", borderRadius: 14, border: "none", background: "var(--accent)", color: "var(--accent-text)", fontSize: 16, fontWeight: 800, opacity: !n || !formats.size ? 0.4 : 1 }}
          >
            {exportLabel}
          </button>
          <button style={cancelBtn} onClick={() => setSheet(null)}>
            Cancel
          </button>
        </Sheet>
      )}

      {confirming && (
        <ConfirmDialog
          title={confirming.kind === "flow" ? "Delete this flow test?" : "Delete this stair test?"}
          message={`"${confirming.kind === "flow" ? confirming.test.name || "Untitled" : STAIR_KIND[confirming.test.kind]}" and its readings will be permanently deleted. This can't be undone.`}
          busy={busy}
          onCancel={() => setConfirming(null)}
          onConfirm={handleDelete}
        />
      )}

      {exporting && <ProgressOverlay percent={exporting.percent} title="Preparing export" step={exporting.step} art="conveyor" startedAt={started.current} minMs={MIN_LOADER_MS} />}
    </>
  );
}

function CheckRow({ on, onClick, plain, children }: { on: boolean; onClick: () => void; plain?: boolean; children: ReactNode }) {
  return (
    <button
      role="checkbox"
      aria-checked={on}
      onClick={onClick}
      style={{ display: "flex", alignItems: "center", gap: 11, width: "100%", textAlign: "left", padding: "11px 12px", borderRadius: 12, background: plain ? "none" : "var(--panel-2)", border: "1px solid var(--border)", color: "var(--text)" }}
    >
      <span style={{ width: 22, height: 22, borderRadius: 7, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, border: on ? "2px solid var(--accent)" : "2px solid var(--border-strong)", background: on ? "var(--accent)" : "none", color: "var(--accent-text)" }}>
        {on ? "✓" : ""}
      </span>
      {children}
    </button>
  );
}

function FlowCard({ test }: { test: FlowTest }) {
  const v = summary(test);
  const sub =
    test.kind === "blank"
      ? `${test.cells?.length ?? 0} rows · ${test.columns?.length ?? 0} columns · ${formatDay(test.testedAt)}`
      : `Flow test · ${readingCount(test)} readings · ${formatDay(test.testedAt)}`;
  const tag = test.fromBackup ? " · From backup" : "";
  const thumb = test.kind === "blank" ? blankThumbSvg(72, 52) : chartSvg(test, 72, 52, { small: true });
  return (
    <>
      <div style={{ width: 72, height: 52, flexShrink: 0, borderRadius: 8, background: "var(--bg)", overflow: "hidden" }} dangerouslySetInnerHTML={{ __html: thumb }} />
      <div style={{ flexGrow: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, fontWeight: 800, overflow: "hidden", whiteSpace: "nowrap" }}>
          <SiteKindIcon kind="flow" size={13} />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{test.name || "Untitled"}</span>
        </div>
        <div style={{ fontSize: 12, color: "var(--muted)" }}>{sub}{tag}</div>
        <div style={{ fontSize: 11, fontWeight: 800, color: v.colour }}>{v.text}</div>
      </div>
    </>
  );
}

function StairCard({ test, site }: { test: StairTest; site: Site }) {
  const v = stairTestSummary(test, site.spf);
  const stairs = site.spf?.stairs.length ?? 0;
  return (
    <>
      <div style={{ width: 72, height: 52, flexShrink: 0, borderRadius: 8, background: "rgba(177,140,255,.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <SiteKindIcon kind="spf" size={30} />
      </div>
      <div style={{ flexGrow: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, fontWeight: 800, overflow: "hidden", whiteSpace: "nowrap" }}>
          <SiteKindIcon kind="spf" size={13} />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{site.kind === "spf" ? STAIR_KIND[test.kind] : "Stair pressurisation"}</span>
        </div>
        <div style={{ fontSize: 12, color: "var(--muted)" }}>
          {site.kind === "spf" ? `${stairs} stair${stairs === 1 ? "" : "s"}` : STAIR_KIND[test.kind]} · {formatDay(test.testedAt)}{test.fromBackup ? " · From backup" : ""}
        </div>
        <div style={{ fontSize: 11, fontWeight: 800, color: v.fail ? "#ff7a6a" : "var(--muted)" }}>{v.text}</div>
      </div>
    </>
  );
}
