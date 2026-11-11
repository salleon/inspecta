import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { Share } from "@capacitor/share";
import RoundIconButton from "../components/RoundIconButton";
import { IconCheck, IconChevronLeft } from "../components/Icons";
import ConfirmDialog from "../components/ConfirmDialog";
import ProgressOverlay from "../components/ProgressOverlay";
import { listSites, markBackedUp, sitePhotoStats } from "../db/db";
import type { Site } from "../db/types";
import { backupFileName, writeBackup, type BackupKind } from "../lib/backup";
import { siteBackupState } from "../lib/backupNames";
import { LAST_BACKUP_KEY } from "../lib/backupDue";
import { CacheFileWriter } from "../lib/cacheFile";
import { numberedExport } from "../lib/exportName";

// Settings → Back up: what goes in the backup file. Full backup (every
// site), Choose sites, or New since last backup (sites never backed up, or
// changed since their last backup). Every kind is the same format, one
// folder per site (lib/backup), and each site's backedUpAt is set once the
// file has been shared.

interface Row {
  site: Site;
  photos: number;
  bytes: number;
  state: "new" | "changed" | "saved";
}

const plural = (n: number, word: string) => `${n.toLocaleString("en-AU")} ${word}${n === 1 ? "" : "s"}`;

function size(bytes: number): string {
  if (bytes >= 1e9) return `about ${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `about ${Math.max(1, Math.round(bytes / 1e6))} MB`;
  return "under 1 MB";
}

const summary = (rows: Row[]) => `${plural(rows.length, "site")} · ${plural(rows.reduce((n, r) => n + r.photos, 0), "photo")} · ${size(rows.reduce((n, r) => n + r.bytes, 0))}`;

const day = (ms: number) => new Date(ms).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });

const OPTIONS: { kind: BackupKind; title: string; hint: string }[] = [
  { kind: "full", title: "Full backup", hint: "Every site on this phone." },
  { kind: "chosen", title: "Choose sites", hint: "Pick the sites to back up." },
  { kind: "since", title: "New since last backup", hint: "Sites added or changed since their last backup." },
];

export default function Backup() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [kind, setKind] = useState<BackupKind>("full");
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [progress, setProgress] = useState<{ percent: number; step: string } | null>(null);
  const [message, setMessage] = useState<{ title: string; text: string } | null>(null);

  useEffect(() => {
    void (async () => {
      const [sites, stats] = await Promise.all([listSites(), sitePhotoStats()]);
      setRows(
        sites
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((site) => ({ site, photos: stats.get(site.id)?.photos ?? 0, bytes: stats.get(site.id)?.bytes ?? 0, state: siteBackupState(site) })),
      );
    })();
  }, []);

  const pending = useMemo(() => (rows ?? []).filter((r) => r.state !== "saved"), [rows]);
  const selected = useMemo(() => {
    if (!rows) return [];
    if (kind === "full") return rows;
    if (kind === "since") return pending;
    return rows.filter((r) => chosen.has(r.site.id));
  }, [rows, kind, chosen, pending]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (rows ?? []).filter((r) => !q || r.site.name.toLowerCase().includes(q) || r.site.address.toLowerCase().includes(q));
  }, [rows, query]);

  function toggle(id: string) {
    setChosen((was) => {
      const next = new Set(was);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  async function backup() {
    if (!selected.length) return;
    const ids = selected.map((r) => r.site.id);
    // "since" names the file after the oldest backup it follows on from
    const since = kind === "since" ? Math.min(...selected.map((r) => r.site.backedUpAt || Infinity)) : undefined;
    const numbered = numberedExport(backupFileName(kind, ids.length, since !== Infinity ? since : undefined));
    const filename = numbered.name;
    const onPhoto = (done: number, total: number) => setProgress({ percent: total ? (95 * done) / total : 95, step: `Adding photos: ${done.toLocaleString("en-AU")} of ${total.toLocaleString("en-AU")}` });
    setProgress({ percent: 0, step: "Getting ready…" });
    try {
      let startedAt: number;
      if (Capacitor.isNativePlatform()) {
        // streamed into a file one photo at a time, then shared
        const out = new CacheFileWriter(filename);
        startedAt = await writeBackup(ids, kind, (b) => out.write(b), onPhoto);
        const uri = await out.close();
        setProgress(null);
        await Share.share({ title: "Inspecta backup", url: uri });
      } else {
        const parts: Uint8Array[] = [];
        startedAt = await writeBackup(ids, kind, async (b) => void parts.push(b), onPhoto);
        setProgress(null);
        const url = URL.createObjectURL(new Blob(parts as BlobPart[], { type: "application/zip" }));
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      }
      numbered.shared();
      await markBackedUp(ids, startedAt);
      try {
        localStorage.setItem(LAST_BACKUP_KEY, String(startedAt));
      } catch {
        // best-effort
      }
      navigate("/settings");
    } catch (err) {
      if (!(err instanceof Error) || !/cancell?ed/i.test(err.message)) {
        console.error("backup failed", err);
        setMessage({ title: "Backup failed", text: "Couldn't make the backup. Check there's enough free space on the phone, then try again." });
      }
    } finally {
      setProgress(null);
    }
  }

  const stat = (k: BackupKind) => {
    if (!rows) return "";
    if (k === "full") return summary(rows);
    if (k === "since") return pending.length ? summary(pending) : "Nothing new: every site is backed up.";
    return chosen.size ? `${chosen.size} chosen` : "";
  };

  const listStyle = { display: "flex", flexDirection: "column", borderRadius: 16, background: "var(--panel)", border: "1px solid var(--border)", overflow: "hidden", flexShrink: 0 } as const;
  const rowStyle = { display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", borderTop: "1px solid var(--border)", minHeight: 44, boxSizing: "border-box" } as const;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", position: "relative" }}>
      <div style={{ flexShrink: 0, padding: "18px 18px 8px", display: "flex", alignItems: "center", gap: 12 }}>
        <RoundIconButton size={32} ariaLabel="Back" onClick={() => navigate("/settings")}>
          <IconChevronLeft size={20} strokeWidth={2.2} />
        </RoundIconButton>
        <div style={{ fontSize: 20, fontWeight: 800 }}>Back up</div>
      </div>
      <div style={{ flexGrow: 1, overflowY: "auto", padding: "4px 16px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
        <div role="radiogroup" aria-label="What to back up" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {OPTIONS.map((o) => {
            const on = kind === o.kind;
            return (
              <button
                key={o.kind}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setKind(o.kind)}
                style={{ textAlign: "left", display: "flex", gap: 12, alignItems: "flex-start", padding: 14, borderRadius: 16, background: "var(--panel)", border: `2px solid ${on ? "var(--accent)" : "var(--border)"}`, color: "var(--text)" }}
              >
                <span style={{ flexGrow: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
                  <span style={{ fontSize: 15, fontWeight: 700 }}>{o.title}</span>
                  <span style={{ fontSize: 12, lineHeight: 1.45, color: "var(--muted)" }}>{o.hint}</span>
                  {stat(o.kind) && <span style={{ fontSize: 12, fontWeight: 700, color: "var(--accent)" }}>{stat(o.kind)}</span>}
                </span>
                <span
                  aria-hidden="true"
                  style={{ flexShrink: 0, width: 22, height: 22, borderRadius: 11, boxSizing: "border-box", marginTop: 2, display: "flex", alignItems: "center", justifyContent: "center", background: on ? "var(--accent)" : "transparent", border: on ? "none" : "2px solid var(--border-strong)" }}
                >
                  {on && <IconCheck size={14} strokeWidth={3.4} color="var(--accent-text)" />}
                </span>
              </button>
            );
          })}
        </div>

        {kind === "chosen" && rows && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search sites"
                aria-label="Search sites"
                style={{ flexGrow: 1, minWidth: 0, height: 44, padding: "0 14px", borderRadius: 14, background: "var(--panel)", border: "1px solid var(--border-strong)", color: "var(--text)", fontSize: 14 }}
              />
              <button
                type="button"
                onClick={() => setChosen((was) => (shown.every((r) => was.has(r.site.id)) ? new Set([...was].filter((id) => !shown.some((r) => r.site.id === id))) : new Set([...was, ...shown.map((r) => r.site.id)])))}
                style={{ height: 44, padding: "0 6px", border: "none", background: "transparent", color: "var(--accent)", fontSize: 14, fontWeight: 700 }}
              >
                {shown.length && shown.every((r) => chosen.has(r.site.id)) ? "Clear" : "Select all"}
              </button>
            </div>
            <div style={listStyle}>
              {shown.map((r, i) => (
                <label key={r.site.id} style={{ ...rowStyle, borderTop: i ? rowStyle.borderTop : "none" }}>
                  <input type="checkbox" checked={chosen.has(r.site.id)} onChange={() => toggle(r.site.id)} style={{ width: 20, height: 20, margin: 0, flexShrink: 0, accentColor: "var(--accent)" }} />
                  <span style={{ flexGrow: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                    <span style={{ fontSize: 14, fontWeight: 700 }}>{r.site.name || "Untitled"}</span>
                    <span style={{ fontSize: 12, color: "var(--muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {[r.site.address, r.site.backedUpAt ? `Backed up ${day(r.site.backedUpAt)}` : "Never backed up"].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <span style={{ flexShrink: 0, fontSize: 12, fontWeight: 600, color: "var(--muted)" }}>{size(r.bytes).replace("about ", "")}</span>
                </label>
              ))}
              {!shown.length && <div style={{ padding: 14, fontSize: 13, color: "var(--muted)" }}>No sites match.</div>}
            </div>
          </>
        )}

        {kind === "since" && pending.length > 0 && (
          <div style={listStyle}>
            {pending.map((r, i) => (
              <div key={r.site.id} style={{ ...rowStyle, borderTop: i ? rowStyle.borderTop : "none" }}>
                <span style={{ flexGrow: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                  <span style={{ fontSize: 14, fontWeight: 700 }}>{r.site.name || "Untitled"}</span>
                  <span style={{ fontSize: 12, color: "var(--muted)" }}>{r.state === "new" ? "Never backed up" : `Changed since its backup on ${day(r.site.backedUpAt!)}`}</span>
                </span>
                <span
                  style={{ flexShrink: 0, fontSize: 11, fontWeight: 800, letterSpacing: "0.04em", padding: "4px 8px", borderRadius: 8, background: r.state === "new" ? "var(--accent)" : "var(--border-strong)", color: r.state === "new" ? "var(--accent-text)" : "var(--text)" }}
                >
                  {r.state === "new" ? "NEW" : "CHANGED"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ flexShrink: 0, padding: "10px 16px calc(16px + env(safe-area-inset-bottom))", display: "flex", flexDirection: "column", gap: 10, borderTop: "1px solid var(--border)" }}>
        <button
          type="button"
          disabled={!selected.length}
          onClick={() => void backup()}
          style={{ height: 52, border: "none", borderRadius: 26, background: "var(--accent)", color: "var(--accent-text)", fontSize: 16, fontWeight: 800, opacity: selected.length ? 1 : 0.4 }}
        >
          {rows && !rows.length ? "No sites to back up" : `Back up ${plural(selected.length, "site")}`}
        </button>
      </div>

      {message && (
        <ConfirmDialog
          title={message.title}
          message={message.text}
          confirmLabel="OK"
          tone="primary"
          infoOnly
          onCancel={() => setMessage(null)}
          onConfirm={() => setMessage(null)}
        />
      )}
      {progress && <ProgressOverlay percent={progress.percent} title="Backing up" step={progress.step} art="box" />}
    </div>
  );
}
