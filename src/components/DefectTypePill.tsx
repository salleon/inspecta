import type { DefectType } from "../db/types";
import { defectTypeStyle } from "../lib/defectTypes";

// Coloured bubble for a finding's defect type. Renders nothing when the
// finding has no type, so callers can drop it in unconditionally.
export default function DefectTypePill({
  type,
  size = "md",
  onPaper = false,
}: {
  type: DefectType | undefined;
  size?: "sm" | "md";
  // on a white/paper background — outlines the white "Note only" bubble
  onPaper?: boolean;
}) {
  const style = defectTypeStyle(type);
  if (!style) return null;
  const outlined = onPaper && style.value === "note-only";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        alignSelf: "flex-start",
        borderRadius: 999,
        background: style.bg,
        color: style.text,
        border: outlined ? "1px solid #c9c4b8" : "none",
        fontSize: size === "sm" ? 10 : 12,
        fontWeight: 800,
        letterSpacing: 0.1,
        padding: size === "sm" ? "3px 8px" : "5px 11px",
        whiteSpace: "nowrap",
        lineHeight: 1.2,
      }}
    >
      {style.label}
    </span>
  );
}
