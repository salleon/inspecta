import { backupDue, lastBackupAt } from "../lib/backupDue";
import { listSites } from "../db/db";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import ConfirmDialog from "./ConfirmDialog";
import ProgressOverlay from "./ProgressOverlay";
import { IconChevronRight } from "./Icons";
import { applyRestore, readBackup, type RestorePlan, type SharedChoice } from "../lib/backup";
import { COPY_SUFFIX, type MergePlan } from "../lib/siteMerge";

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
const hasWork = (p: RestorePlan) => p.newSites.length + p.unfinished.length + p.sharedSites.length > 0;

// "a", "a and b", "a, b and c"
const list = (parts: string[]) => (parts.length < 2 ? parts.join("") : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`);
const counted = (items: [number, string][]) => list(items.filter(([n]) => n > 0).map(([n, w]) => plural(n, w)));

// one site's differences, for the Merge / Keep both question
function differences(name: string, c: MergePlan["counts"]): string {
  const extra = counted([
    [c.findingsAdded, "finding"],
    [c.photosAdded, "photo"],
    [c.testsAdded, "test"],
  ]);
  const edits = counted([
    [c.findingsUpdated, "finding"],
    [c.testsUpdated, "test"],
    [c.photosUpdated, "photo"],
    [c.reportsUpdated, "customised report"],
  ]);
  const backup = [extra && `${extra} this phone doesn't`, edits && `later edits to ${edits}`, c.detailsUpdated && "a later name, address or stair setup"].filter(Boolean) as string[];
  const mine = counted([
    [c.phoneOnlyFindings, "finding"],
    [c.phoneOnlyPhotos, "photo"],
    [c.phoneOnlyTests, "test"],
  ]);
  return [
    `${name || "Untitled"}: the backup has ${list(backup)}.`,
    mine && `This phone has ${mine} the backup doesn't; ${mine.includes(" and ") || !mine.startsWith("1 ") ? "they're" : "it's"} kept.`,
    c.testsKeptBoth && `${plural(c.testsKeptBoth, "test")} changed on both: the backup's copy is added beside this phone's.`,
  ]
    .filter(Boolean)
    .join(" ");
}

// what a merge did, for the message after
function merged(name: string, c: MergePlan["counts"]): string {
  const added = counted([
    [c.findingsAdded, "finding"],
    [c.photosAdded, "photo"],
    [c.testsAdded + c.testsKeptBoth, "test"],
  ]);
  const updated = counted([
    [c.findingsUpdated, "finding"],
    [c.testsUpdated, "test"],
    [c.photosUpdated, "photo"],
    [c.reportsUpdated, "customised report"],
  ]);
  const did = [added && `added ${added}`, updated && `updated ${updated}`, c.detailsUpdated && "took the backup's later details"].filter(Boolean) as string[];
  return `Merged ${name || "Untitled"}${did.length ? `: ${list(did)}` : ""}.`;
}

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

  // Restore pressed: ask about the sites on both first, if there are any
  function confirmPlan(p: RestorePlan) {
    setPlan(null);
    if (p.sharedSites.length) setAsking(p);
    else void restore(p, "leave");
  }

  async function restore(p: RestorePlan, choice: SharedChoice) {
    setAsking(null);
    if (choice === "leave" && !p.newSites.length && !p.unfinished.length) {
      setMessage({ title: "Nothing restored", text: "The sites on this phone were left as they are." });
      return;
    }
    setProgress({ title: "Restoring", percent: 0, step: "Adding sites…" });
    try {
      const result = await applyRestore(p, choice, (done, total) =>
        setProgress({ title: "Restoring", percent: total ? (100 * done) / total : 100, step: `Adding photos: ${done} of ${total}` }),
      );
      onRestored();
      setChecked((n) => n + 1);
      const parts = [
        result.sites ? `Added ${plural(result.sites, "site")}, ${plural(result.findings, "finding")} and ${plural(result.photos, "photo")}.` : "",
        ...result.merged.map((m) => merged(m.name, m.counts)),
        result.copies.length ? `Kept both copies of ${plural(result.copies.length, "site")}; the backup's ${result.copies.length === 1 ? "is" : "are"} ${list(result.copies.map((n) => `"${n}"`))}.` : "",
        result.finished ? `Finished restoring ${plural(result.finished, "site")} that ${result.finished === 1 ? "was" : "were"} left part way last time.` : "",
        !result.sites && !result.merged.length && result.finished ? `${plural(result.photos, "photo")} added.` : "",
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
    const left = p.unfinished.map((u) => u.target);
    const finishes = left.length ? `This finishes ${plural(left.length, "site")} an earlier restore left part way: ${names(left)}.` : "";
    const shared = p.sharedSites.map((x) => x.site);
    const both = shared.length
      ? `${plural(shared.length, "site")} ${shared.length === 1 ? "is" : "are"} on this phone too, with differences: ${names(shared)}. You'll choose what to do with ${shared.length === 1 ? "it" : "them"} next.`
      : "";
    const skips = p.existingSites.length ? `${plural(p.existingSites.length, "site")} already here ${p.existingSites.length === 1 ? "has" : "have"} nothing new and will be left as ${p.existingSites.length === 1 ? "it is" : "they are"}.` : "";
    if (!hasWork(p)) return `Every site in this backup is already on this phone, with nothing new, so there's nothing to add. Nothing on this phone is overwritten.`;
    return [adds, finishes, both, skips].filter(Boolean).join(" ");
  };

  const askText = (p: RestorePlan) =>
    [
      ...p.sharedSites.map(({ site, merge }) => differences(site.name, merge.counts)),
      `Merge: nothing on this phone is deleted. A finding changed on both keeps the later edit.\nKeep both: the backup's copy comes in as its own site, "${p.sharedSites[0].site.name || "Untitled"}${COPY_SUFFIX}"${p.sharedSites.length > 1 ? " and so on" : ""}.`,
    ].join("\n\n");

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
          <span style={hintStyle}>Adds sites from a backup file; never deletes anything here.</span>
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
          title={asking.sharedSites.length === 1 ? `${asking.sharedSites[0].site.name || "This site"} is on this phone too` : `${asking.sharedSites.length} sites are on this phone too`}
          message={askText(asking)}
          tone="primary"
          confirmLabel="Merge"
          extraLabel="Keep both"
          onExtra={() => void restore(asking, "copy")}
          cancelLabel={asking.sharedSites.length === 1 ? "Leave as it is" : "Leave as they are"}
          onCancel={() => void restore(asking, "leave")}
          onDismiss={() => setAsking(null)}
          onConfirm={() => void restore(asking, "merge")}
        />
      )}
      {message && <ConfirmDialog title={message.title} message={message.text} confirmLabel="OK" tone="primary" infoOnly onCancel={() => setMessage(null)} onConfirm={() => setMessage(null)} />}
      {progress && <ProgressOverlay percent={progress.percent} title={progress.title} step={progress.step} art="box" />}
    </>
  );
}
