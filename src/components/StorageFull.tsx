import { useEffect, useState } from "react";
import Dexie from "dexie";
import ConfirmDialog from "./ConfirmDialog";

// The phone ran out of room while something was being saved. Saves happen in
// the background all over the app, so the failure is caught here, wherever
// it came from, and said once (not again until it's been closed). Any other
// save the phone's storage refuses gets a plainer "Couldn't save".
const isFull = (e: unknown): boolean => {
  const x = e as { name?: string; inner?: { name?: string }; message?: string } | null;
  return !!x && (x.name === "QuotaExceededError" || x.inner?.name === "QuotaExceededError" || /quota/i.test(x.message ?? ""));
};

// the phone's storage (the database) refused something
const isSave = (e: unknown): boolean => e instanceof Dexie.DexieError;

export default function StorageFull() {
  const [open, setOpen] = useState<"full" | "failed" | null>(null);
  useEffect(() => {
    const onRejection = (e: PromiseRejectionEvent) => {
      const what = isFull(e.reason) ? "full" : isSave(e.reason) ? "failed" : null;
      if (!what) return;
      e.preventDefault();
      console.error("save failed", e.reason);
      setOpen((was) => (was === "full" ? was : what));
    };
    window.addEventListener("unhandledrejection", onRejection);
    return () => window.removeEventListener("unhandledrejection", onRejection);
  }, []);
  if (!open) return null;
  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 50 }}>
      <ConfirmDialog
        infoOnly
        tone="primary"
        title={open === "full" ? "The phone is out of storage" : "Couldn't save"}
        message={open === "full" ? "The last change couldn't be saved. Free up space on the phone, or back up in Settings and delete sites you no longer need, then do it again." : "The last change wasn't saved. Please try again."}
        confirmLabel="OK"
        onCancel={() => setOpen(null)}
        onConfirm={() => setOpen(null)}
      />
    </div>
  );
}
