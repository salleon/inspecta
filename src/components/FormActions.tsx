// Cancel / Save button row at the bottom of a bottom-sheet form. Shared by
// Dashboard's "Your name" sheet and Findings' "Edit site" sheet — both used
// the exact same two buttons.
export default function FormActions({
  onCancel,
  saveLabel = "Save",
}: {
  onCancel: () => void;
  saveLabel?: string;
}) {
  return (
    <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
      <button
        type="button"
        onClick={onCancel}
        style={{ flex: 1, textAlign: "center", padding: "14px 0", borderRadius: 12, background: "var(--panel-2)", border: "1px solid var(--border)", fontSize: 14, fontWeight: 700, color: "var(--text)" }}
      >
        Cancel
      </button>
      <button
        type="submit"
        style={{ flex: 1, textAlign: "center", padding: "14px 0", borderRadius: 12, background: "var(--accent)", border: "none", fontSize: 14, fontWeight: 800, color: "var(--accent-text)" }}
      >
        {saveLabel}
      </button>
    </div>
  );
}
