import { useState, type CSSProperties } from "react";
import type { SpfStair } from "../db/types";
import { fanIsDefault, fanName, stairDoors, stairRange, wellIsDefault, wellName } from "../lib/stairTest";
import { useBackHandler } from "../lib/backButton";
import { DEFAULT_NAME } from "./StairUi";

// Before a stair report: the stairs still going by placeholder names (SPF-2,
// Stair 2), their fan and stairwell boxes filled with the suggestions to type
// over. "Save names" keeps what's in the boxes as the stairs' real names
// (a right suggestion is then confirmed, not a placeholder any more, and
// isn't asked about again); "Not now" goes on with the placeholders.

export const stairsToName = (stairs: SpfStair[]) => stairs.filter((st) => fanIsDefault(st) || wellIsDefault(st));

export default function StairNameCheck({ stairs, onSave, onSkip, onCancel, go = "preview" }: { stairs: SpfStair[]; onSave: (stairs: SpfStair[]) => void; onSkip: () => void; onCancel: () => void; go?: "preview" | "export" }) {
  const unnamed = stairsToName(stairs);
  const [names, setNames] = useState<Record<string, { fan: string; well: string }>>(() =>
    Object.fromEntries(unnamed.map((st) => [st.id, { fan: fanName(st, stairs.indexOf(st)), well: wellName(st, stairs.indexOf(st)) }])),
  );
  useBackHandler(() => {
    onCancel();
    return true;
  });

  const save = () =>
    onSave(
      stairs.map((st) => {
        const n = names[st.id];
        if (!n) return st;
        // "SPF-" alone is no fan name
        const fan = /^SPF-?\s*$/i.test(n.fan.trim()) ? "" : n.fan.trim();
        return { ...st, fan, name: n.well.trim() };
      }),
    );

  return (
    <div className="sheet-backdrop" style={{ position: "absolute", inset: 0, background: "rgba(4,12,20,.62)", display: "flex", alignItems: "flex-end", zIndex: 20 }} onClick={onCancel}>
      <div
        role="dialog"
        aria-label="Check the stair names"
        className="sheet-panel"
        onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxHeight: "88%", overflowY: "auto", background: "#0c2236", borderRadius: "20px 20px 0 0", borderTop: "1px solid #1f4566", padding: "18px 16px calc(24px + env(safe-area-inset-bottom))", display: "flex", flexDirection: "column", gap: 10 }}
      >
        <div style={{ width: 40, height: 4, borderRadius: 2, background: "#2a4a66", alignSelf: "center", marginBottom: 4 }} />
        <div style={{ fontSize: 18, fontWeight: 800 }}>Check the stair names</div>
        <div style={{ fontSize: 12.5, color: "var(--muted)", fontWeight: 600, lineHeight: 1.45 }}>
          {unnamed.length} stair{unnamed.length === 1 ? " still has" : "s still have"} <span style={DEFAULT_NAME}>suggested names</span>. Type the real ones, or keep the suggestions if they're right. Either way they're saved and you won't be asked again.
        </div>
        <div style={{ display: "flex", gap: 6, fontSize: 10.5, fontWeight: 800, color: "#6a8098", letterSpacing: ".05em", padding: "0 12px 0 37px" }}>
          <span style={{ flex: 1 }}>FAN</span>
          <span style={{ flex: 1 }}>STAIRWELL</span>
        </div>
        {unnamed.map((st) => {
          const i = stairs.indexOf(st);
          const n = names[st.id];
          const set = (patch: Partial<{ fan: string; well: string }>) => setNames((all) => ({ ...all, [st.id]: { ...all[st.id], ...patch } }));
          // still the untouched suggestion: amber, as everywhere else
          const fanSuggested = fanIsDefault(st) && n.fan === fanName(st, i);
          const wellSuggested = wellIsDefault(st) && n.well === wellName(st, i);
          return (
            <div key={st.id} data-stair-check={st.id} style={{ background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 12, padding: "9px 10px", display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11.5, color: "var(--muted)", fontWeight: 700 }}>
                <span style={{ width: 20, height: 20, borderRadius: "50%", background: "var(--panel-2)", color: "var(--text)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800 }}>{i + 1}</span>
                {stairRange(st)} · {stairDoors(st).length} doors
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <input aria-label={`Stair ${i + 1} fan name`} value={n.fan} onChange={(e) => set({ fan: e.target.value })} style={{ ...box, ...(fanSuggested ? DEFAULT_NAME : null) }} />
                <input aria-label={`Stair ${i + 1} stairwell name`} value={n.well} onChange={(e) => set({ well: e.target.value })} style={{ ...box, ...(wellSuggested ? DEFAULT_NAME : null) }} />
              </div>
            </div>
          );
        })}
        <button onClick={save} style={{ marginTop: 6, padding: "15px 0", borderRadius: 14, border: "none", background: "var(--accent)", color: "var(--accent-text)", fontSize: 15.5, fontWeight: 800 }}>
          Save names and {go === "export" ? "export" : "preview"} ›
        </button>
        <button onClick={onSkip} style={{ padding: "6px 0", border: "none", background: "none", color: "var(--muted)", fontSize: 13, fontWeight: 800 }}>
          Not now: {go === "export" ? "export" : "preview"} with the suggestions
        </button>
      </div>
    </div>
  );
}

const box: CSSProperties = {
  flex: 1,
  minWidth: 0,
  background: "#0a2135",
  border: "1px solid var(--border-strong)",
  borderRadius: 10,
  padding: "9px 10px",
  fontSize: 14,
  fontWeight: 800,
  color: "var(--text)",
  outline: "none",
};
