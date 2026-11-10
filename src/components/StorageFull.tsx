import { useEffect, useState } from "react";
import ConfirmDialog from "./ConfirmDialog";

// The phone ran out of room while something was being saved. Saves happen in
// the background all over the app, so the failure is caught here, wherever
// it came from, and said once (not again until it's been closed).
const isFull = (e: unknown): boolean => {
  const x = e as { name?: string; inner?: { name?: string }; message?: string } | null;
  return !!x && (x.name === "QuotaExceededError" || x.inner?.name === "QuotaExceededError" || /quota/i.test(x.message ?? ""));
};

export default function StorageFull() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onRejection = (e: PromiseRejectionEvent) => {
      if (!isFull(e.reason)) return;
      e.preventDefault();
      setOpen(true);
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
        title="The phone is out of storage"
        message="The last change couldn't be saved. Free up space on the phone, or back up in Settings and delete sites you no longer need, then do it again."
        confirmLabel="OK"
        onCancel={() => setOpen(false)}
        onConfirm={() => setOpen(false)}
      />
    </div>
  );
}
