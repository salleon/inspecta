import { backupDue, lastBackupAt } from "../lib/backupDue";
import { listSites } from "../db/db";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import ConfirmDialog from "./ConfirmDialog";
import ProgressOverlay from "./ProgressOverlay";
import { IconChevronRight } from "./Icons";
import { applyRestore, readBackup, type RestorePlan } from "../lib/backup";
import { siteChangedAt } from "../lib/backupNames";

// Settings rows: "Back up" (opens the Back up page, pages/Backup) and
// "Restore from backup" (see lib/backup). Restoring shows the packed-box
// animation from the moment the file is picked (reading a big backup takes
// a while).

// when the last backup was made on this phone (not whether the file was kept)
function lastBackup(): string {
  try {
    const at = lastBackupAt();
    return at ? `Last backup made ${new Date(at).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}` : "Not backed up yet";
  } catch {
    return "Not backed up yet";
  }
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const names = (sites: { name: string }[]) => sites.map((s) => s.name || "Untitled").join(", ");
const day = (ms: number) => new Date(ms).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
const hasWork = (p: RestorePlan) => p.newSites.length + p.unfinishedSites.length + p.newerSites.length > 0;

export default function BackupSettings({ rowStyle, hintStyle, onRestored, icons }: { rowStyle: CSSProperties; hintStyle: CSSProperties; onRestored: () => void; icons?: [ReactNode, ReactNode] }) {
  const navigate = useNavigate();
  const fileInput = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<{ title: string; percent: number; step: string } | null>(null);
  const [plan, setPlan] = useState<RestorePlan | null>(null);
  // the plan, while asking whether to replace the sites the backup has newer copies of
  const [asking, setAsking] = useState<RestorePlan | null>(null);
  const [message, setMessage] = useState<{ title: string; text: string } | null>(null);
  // a backup is overdue (the amber dot on the home screen's cog): the row pulses amber
  const [due, setDue] = useState(false);
  const [checked, setChecked] = useState(0);
  useEffect(() => {
    void listSites().then((sites) => setDue(backupDue(sites, Date.now())));
  }, [checked]);

  async function onFile(file: File | undefined) {
    if (!file) return;
    // reading a big backup takes a while: show the ring from the start
    setProgress({ title: "Restoring", percent: 0, step: "Reading the backup…" });
    try {
      setPlan(await readBackup(file));
    } catch (err) {
      setMessage({ title: "Can't restore this file", text: err instanceof Error && err.message.endsWith(".") ? err.message : "That isn't an Inspecta backup file." });
    } finally {
      setProgress(null);
    }
  }

  // Restore pressed: ask about the newer copies first, if there are any
  function confirmPlan(p: RestorePlan) {
    setPlan(null);
    if (p.newerSites.length) setAsking(p);
    else void restore(p, false);
  }

  async function restore(p: RestorePlan, replace: boolean) {
    setAsking(null);
    if (!replace && !p.newSites.length && !p.unfinishedSites.length) {
      setMessage({ title: "Nothing restored", text: "The sites on this phone were left as they are." });
      return;
    }
    setProgress({ title: "Restoring", percent: 0, step: "Adding sites…" });
    try {
      const result = await applyRestore(p, replace, (done, total) =>
        setProgress({ title: "Restoring", percent: total ? (100 * done) / total : 100, step: `Adding photos: ${done} of ${total}` }),
      );
      onRestored();
      setChecked((n) => n + 1);
      const parts = [
        result.sites ? `Added ${plural(result.sites, "site")}, ${plural(result.findings, "finding")} and ${plural(result.photos, "photo")}.` : "",
        result.replaced ? `Replaced ${plural(result.replaced, "site")} with the backup's newer copy.` : "",
        result.finished ? `Finished restoring ${plural(result.finished, "site")} that ${result.finished === 1 ? "was" : "were"} left part way last time.` : "",
        !result.sites && (result.replaced || result.finished) ? `${plural(result.photos, "photo")} added.` : "",
        result.unreadable ? `${plural(result.unreadable, "photo")} couldn't be read from the backup and ${result.unreadable === 1 ? "was" : "were"} left out.` : "",
        result.skipped ? `${plural(result.skipped, "site")} already on this phone ${result.skipped === 1 ? "was" : "were"} left as ${result.skipped === 1 ? "it is" : "they are"}.` : "",
      ];
      setMessage({ title: "Restore finished", text: parts.filter(Boolean).join(" ") });
    } catch (err) {
      console.error("restore failed", err);
      onRestored();
      setMessage({ title: "Restore stopped", text: "Something went wrong part way through (the phone may be full). Sites restored before that are kept. A site that was only partly restored is marked on the home screen; restoring the same backup again finishes it and adds the rest." });
    } finally {
      setProgress(null);
    }
  }

  const planText = (p: RestorePlan) => {
    const units = p.newSites.map((s) => p.units.get(s.id)!);
    const findings = units.reduce((n, u) => n + u.findings.length, 0);
    const photos = units.reduce((n, u) => n + u.photos.length, 0);
    const adds = p.newSites.length ? `This adds ${plural(p.newSites.length, "site")} (${plural(findings, "finding")}, ${plural(photos, "photo")}): ${names(p.newSites)}.` : "";
    const finishes = p.unfinishedSites.length ? `This finishes ${plural(p.unfinishedSites.length, "site")} an earlier restore left part way, adding the photos still missing: ${names(p.unfinishedSites)}.` : "";
    const newer = p.newerSites.length
      ? `${plural(p.newerSites.length, "site")} on this phone ${p.newerSites.length === 1 ? "has a newer copy" : "have newer copies"} in this backup: ${names(p.newerSites)}. You'll be asked before ${p.newerSites.length === 1 ? "it's" : "they're"} replaced.`
      : "";
    const skips = p.existingSites.length ? `${plural(p.existingSites.length, "site")} already here will be left as ${p.existingSites.length === 1 ? "it is" : "they are"}.` : "";
    if (!hasWork(p)) return `Every site in this backup is already on this phone, so there's nothing to add. Nothing on this phone is overwritten.`;
    return [adds, finishes, newer, skips].filter(Boolean).join(" ");
  };

  const askText = (p: RestorePlan) =>
    `The backup's copy of ${p.newerSites.length === 1 ? "this site was" : "these sites were"} changed later than this phone's: ` +
    p.newerSites.map((s) => `${s.name || "Untitled"} (backup ${day(siteChangedAt(s))}, this phone ${day(p.phoneChangedAt.get(s.id) ?? 0)})`).join(", ") +
    `. Replacing deletes this phone's copy, with its findings and photos, and puts the backup's in its place.`;

  return (
    <>
      <button type="button" data-testid="backup-row" onClick={() => navigate("/settings/backup")} className={due ? "backup-due" : undefined} style={rowStyle}>
        {icons?.[0]}
        <div style={{ flexGrow: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
          <span style={{ fontSize: 14, fontWeight: 700 }}>Back up</span>
          <span data-testid="last-backup" style={hintStyle}>
            {lastBackup()}
          </span>
        </div>
        <IconChevronRight color="var(--muted)" />
      </button>
      <button type="button" onClick={() => fileInput.current?.click()} style={rowStyle}>
        {icons?.[1]}
        <div style={{ flexGrow: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
          <span style={{ fontSize: 14, fontWeight: 700 }}>Restore from backup</span>
          <span style={hintStyle}>Adds sites from a backup file; asks before replacing any.</span>
        </div>
        <IconChevronRight color="var(--muted)" />
      </button>
      <input
        ref={fileInput}
        type="file"
        accept=".zip,application/zip"
        style={{ display: "none" }}
        onChange={(e) => {
          void onFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />

      {plan && (
        <ConfirmDialog
          title="Restore from backup?"
          message={planText(plan)}
          confirmLabel={hasWork(plan) ? "Restore" : "OK"}
          tone="primary"
          infoOnly={!hasWork(plan)}
          onCancel={() => setPlan(null)}
          onConfirm={() => (hasWork(plan) ? confirmPlan(plan) : setPlan(null))}
        />
      )}
      {asking && (
        <ConfirmDialog
          title={asking.newerSites.length === 1 ? "Replace with the backup's copy?" : `Replace ${asking.newerSites.length} sites with the backup's copies?`}
          message={askText(asking)}
          confirmLabel="Replace"
          cancelLabel="Keep this phone's"
          onCancel={() => void restore(asking, false)}
          onDismiss={() => setAsking(null)}
          onConfirm={() => void restore(asking, true)}
        />
      )}
      {message && <ConfirmDialog title={message.title} message={message.text} confirmLabel="OK" tone="primary" infoOnly onCancel={() => setMessage(null)} onConfirm={() => setMessage(null)} />}
      {progress && <ProgressOverlay percent={progress.percent} title={progress.title} step={progress.step} art="box" />}
    </>
  );
}
