// Full-screen "are you sure?" confirmation used before a destructive,
// unrecoverable action (currently: deleting a site). Shared by Dashboard
// (swipe-to-delete) and Findings (delete from the Edit site sheet) so both
// entry points present the exact same dialog.
export default function ConfirmDialog({
  title,
  message,
  busy = false,
  confirmLabel = "Delete",
  confirmingLabel = "Deleting…",
  onCancel,
  onConfirm,
  tone = "danger",
  infoOnly = false,
}: {
  title: string;
  message: string;
  busy?: boolean;
  confirmLabel?: string;
  confirmingLabel?: string;
  onCancel: () => void;
  onConfirm: () => void;
  // "primary" (teal) for a non-destructive confirm, e.g. restoring a backup
  tone?: "danger" | "primary";
  // just a message with one button (no Cancel)
  infoOnly?: boolean;
}) {
  return (
    <div
      style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", padding: "0 32px" }}
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", background: "var(--panel)", borderRadius: 18, padding: "24px 22px", display: "flex", flexDirection: "column", gap: 8, boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}
      >
        <div style={{ fontSize: 16, fontWeight: 800 }}>{title}</div>
        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--muted)", lineHeight: 1.45, marginBottom: 10 }}>
          {message}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          {!infoOnly && (
            <button
              type="button"
              onClick={onCancel}
              style={{ flex: 1, textAlign: "center", padding: "13px 0", borderRadius: 12, background: "var(--panel-2)", border: "1px solid var(--border)", fontSize: 14, fontWeight: 700, color: "var(--text)" }}
            >
              Cancel
            </button>
          )}
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            style={{ flex: 1, textAlign: "center", padding: "13px 0", borderRadius: 12, background: tone === "danger" ? "#ff6b6b" : "var(--accent)", border: "none", fontSize: 14, fontWeight: 800, color: tone === "danger" ? "#2a0808" : "var(--accent-text)" }}
          >
            {busy ? confirmingLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
