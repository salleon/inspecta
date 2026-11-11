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
  cancelLabel = "Cancel",
  onDismiss,
  extraLabel,
  onExtra,
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
  // the second button's label, when it's a choice rather than Cancel
  cancelLabel?: string;
  // tapping outside the dialog, when that shouldn't count as the second
  // button (defaults to onCancel)
  onDismiss?: () => void;
  // a third choice: the buttons stack, confirm on top, this, then the
  // second button
  extraLabel?: string;
  onExtra?: () => void;
}) {
  const stacked = !!extraLabel && !!onExtra;
  const second = {
    flex: stacked ? "none" : 1,
    textAlign: "center" as const,
    padding: "13px 0",
    borderRadius: 12,
    background: "var(--panel-2)",
    border: "1px solid var(--border)",
    fontSize: 14,
    fontWeight: 700,
    color: "var(--text)",
  };
  return (
    <div
      style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", padding: "0 32px" }}
      onClick={onDismiss ?? onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", background: "var(--panel)", borderRadius: 18, padding: "24px 22px", display: "flex", flexDirection: "column", gap: 8, boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}
      >
        <div style={{ fontSize: 16, fontWeight: 800 }}>{title}</div>
        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--muted)", lineHeight: 1.45, marginBottom: 10, whiteSpace: "pre-line" }}>
          {message}
        </div>
        <div style={{ display: "flex", flexDirection: stacked ? "column-reverse" : "row", gap: 10 }}>
          {!infoOnly && (
            <button type="button" onClick={onCancel} style={second}>
              {cancelLabel}
            </button>
          )}
          {stacked && (
            <button type="button" onClick={onExtra} style={second}>
              {extraLabel}
            </button>
          )}
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            style={{ flex: stacked ? "none" : 1, textAlign: "center", padding: "13px 0", borderRadius: 12, background: tone === "danger" ? "#ff6b6b" : "var(--accent)", border: "none", fontSize: 14, fontWeight: 800, color: tone === "danger" ? "#2a0808" : "var(--accent-text)" }}
          >
            {busy ? confirmingLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
