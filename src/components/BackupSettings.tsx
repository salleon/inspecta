import { useRef, useState, type CSSProperties } from "react";
import { Capacitor } from "@capacitor/core";
import { Share } from "@capacitor/share";
import ConfirmDialog from "./ConfirmDialog";
import ProgressOverlay from "./ProgressOverlay";
import { IconChevronRight } from "./Icons";
import { CacheFileWriter } from "../lib/cacheFile";
import { applyRestore, backupCounts, backupFileName, readBackup, writeBackup, type RestorePlan } from "../lib/backup";

// Settings rows: "Back up all data" and "Restore from backup" (see
// lib/backup). Both show the same progress ring as the exports.

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export default function BackupSettings({ rowStyle, hintStyle, onRestored }: { rowStyle: CSSProperties; hintStyle: CSSProperties; onRestored: () => void }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<{ title: string; percent: number; step: string } | null>(null);
  const [plan, setPlan] = useState<RestorePlan | null>(null);
  const [message, setMessage] = useState<{ title: string; text: string } | null>(null);

  async function backup() {
    const counts = await backupCounts();
    if (!counts.sites) {
      setMessage({ title: "Nothing to back up", text: "There are no sites on this phone yet." });
      return;
    }
    const filename = backupFileName();
    const onPhoto = (done: number, total: number) =>
      setProgress({ title: "Backing up", percent: total ? (95 * done) / total : 95, step: `Adding photos: ${done} of ${total}` });
    setProgress({ title: "Backing up", percent: 0, step: "Getting ready…" });
    try {
      if (Capacitor.isNativePlatform()) {
        // streamed into a file one photo at a time, then shared
        const out = new CacheFileWriter(filename);
        await writeBackup((b) => out.write(b), onPhoto);
        const uri = await out.close();
        setProgress(null);
        await Share.share({ title: "Inspecta backup", url: uri });
      } else {
        const parts: Uint8Array[] = [];
        await writeBackup(async (b) => void parts.push(b), onPhoto);
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
    } catch (err) {
      if (!(err instanceof Error) || !/cancell?ed/i.test(err.message)) {
        console.error("backup failed", err);
        setMessage({ title: "Backup failed", text: "Couldn't make the backup. Please try again." });
      }
    } finally {
      setProgress(null);
    }
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    try {
      setPlan(await readBackup(file));
    } catch (err) {
      setMessage({ title: "Can't restore this file", text: err instanceof Error && /newer version/.test(err.message) ? err.message + "." : "That isn't an Inspecta backup file." });
    }
  }

  async function restore(p: RestorePlan) {
    setPlan(null);
    setProgress({ title: "Restoring", percent: 0, step: "Adding sites…" });
    try {
      const result = await applyRestore(p, (done, total) =>
        setProgress({ title: "Restoring", percent: total ? (100 * done) / total : 100, step: `Adding photos: ${done} of ${total}` }),
      );
      onRestored();
      setMessage({
        title: "Restore finished",
        text:
          `Added ${plural(result.sites, "site")}, ${plural(result.findings, "finding")} and ${plural(result.photos, "photo")}.` +
          (result.skipped ? ` ${plural(result.skipped, "site")} already on this phone ${result.skipped === 1 ? "was" : "were"} left as ${result.skipped === 1 ? "it is" : "they are"}.` : ""),
      });
    } catch (err) {
      console.error("restore failed", err);
      onRestored();
      setMessage({ title: "Restore stopped", text: "Something went wrong part way through. Sites added before that are kept; restoring again adds the rest." });
    } finally {
      setProgress(null);
    }
  }

  const planText = (p: RestorePlan) => {
    const findings = p.json.findings.filter((f) => p.newSites.some((s) => s.id === f.siteId)).length;
    const photos = p.json.photos.filter((ph) => p.newSites.some((s) => s.id === ph.siteId)).length;
    const adds = p.newSites.length
      ? `This adds ${plural(p.newSites.length, "site")} (${plural(findings, "finding")}, ${plural(photos, "photo")}): ${p.newSites.map((s) => s.name || "Untitled").join(", ")}.`
      : "Every site in this backup is already on this phone, so there's nothing to add.";
    const skips = p.existingSites.length ? ` ${plural(p.existingSites.length, "site")} already here will be left as ${p.existingSites.length === 1 ? "it is" : "they are"}.` : "";
    return `${adds}${skips} Nothing on this phone is overwritten.`;
  };

  return (
    <>
      <button type="button" onClick={backup} style={rowStyle}>
        <div style={{ flexGrow: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
          <span style={{ fontSize: 14, fontWeight: 700 }}>Back up all data</span>
          <span style={hintStyle}>Every site, finding and photo in one file. Save it to OneDrive.</span>
        </div>
        <IconChevronRight color="var(--muted)" />
      </button>
      <button type="button" onClick={() => fileInput.current?.click()} style={rowStyle}>
        <div style={{ flexGrow: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
          <span style={{ fontSize: 14, fontWeight: 700 }}>Restore from backup</span>
          <span style={hintStyle}>Adds the sites from a backup file. Nothing already on this phone is overwritten.</span>
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
          confirmLabel={plan.newSites.length ? "Restore" : "OK"}
          tone="primary"
          infoOnly={!plan.newSites.length}
          onCancel={() => setPlan(null)}
          onConfirm={() => (plan.newSites.length ? void restore(plan) : setPlan(null))}
        />
      )}
      {message && <ConfirmDialog title={message.title} message={message.text} confirmLabel="OK" tone="primary" infoOnly onCancel={() => setMessage(null)} onConfirm={() => setMessage(null)} />}
      {progress && <ProgressOverlay percent={progress.percent} title={progress.title} step={progress.step} />}
    </>
  );
}
