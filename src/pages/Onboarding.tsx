import { useState, type FormEvent } from "react";
import enfactWordmark from "../assets/enfact-wordmark.png";
import { setInspectorName } from "../lib/profile";

// Shown once, on first launch only (App.tsx gates on hasInspectorName()) —
// captures the inspector's name locally, since this app has no login. Used
// afterwards to label reports.
export default function Onboarding({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setInspectorName(trimmed);
    onDone();
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ flexGrow: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "32px 28px", gap: 28 }}>
        <img
          src={enfactWordmark}
          alt="EnFact"
          style={{ width: 150, height: "auto", display: "block", margin: "0 auto 4px" }}
        />

        <div style={{ display: "flex", flexDirection: "column", gap: 8, textAlign: "center" }}>
          <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: -0.2 }}>Welcome to Inspecta</div>
          <div style={{ fontSize: 14, fontWeight: 500, color: "var(--muted)", lineHeight: 1.5 }}>
            Your name is only used to label each generated report with an author — nothing is sent anywhere.
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            style={{
              background: "var(--panel-2)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              padding: "15px 16px",
              color: "var(--text)",
              fontSize: 16,
              fontWeight: 600,
              outline: "none",
            }}
          />
          <button
            type="submit"
            disabled={!name.trim()}
            className="glow-sweep"
            style={{
              position: "relative",
              display: "block",
              textAlign: "center",
              padding: "16px 0",
              borderRadius: 14,
              background: "var(--accent)",
              border: "none",
              fontSize: 15,
              fontWeight: 800,
              color: "var(--accent-text)",
              overflow: "hidden",
            }}
          >
            Continue
          </button>
        </div>
      </div>
    </form>
  );
}
