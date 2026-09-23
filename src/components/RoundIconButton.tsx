import type { CSSProperties, ReactNode } from "react";

// A circular, borderless icon button — the back/edit/share buttons in every
// top bar across the app. Centralized so all of them stay pixel-identical
// instead of each screen re-typing the same style object.
export default function RoundIconButton({
  size = 40,
  ariaLabel,
  onClick,
  disabled,
  style,
  children,
}: {
  size?: number;
  ariaLabel: string;
  onClick: () => void;
  disabled?: boolean;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <button
      aria-label={ariaLabel}
      onClick={onClick}
      disabled={disabled}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: "none",
        border: "none",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--text)",
        padding: 0,
        ...style,
      }}
    >
      {children}
    </button>
  );
}
