// Visual-only on/off pill — the row it sits in is the actual switch button.
export default function Switch({ on }: { on: boolean }) {
  return (
    <div
      style={{
        flexShrink: 0,
        position: "relative",
        width: 44,
        height: 26,
        borderRadius: 13,
        background: on ? "var(--accent)" : "var(--muted-2)",
        transition: "background 0.18s ease",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 3,
          left: 3,
          width: 20,
          height: 20,
          borderRadius: "50%",
          background: on ? "var(--accent-text)" : "var(--text)",
          transform: `translateX(${on ? 18 : 0}px)`,
          transition: "transform 0.22s cubic-bezier(0.2, 0.8, 0.2, 1), background 0.18s ease",
        }}
      />
    </div>
  );
}
