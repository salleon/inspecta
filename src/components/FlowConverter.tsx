import { useState } from "react";
import { num } from "../lib/flowTest";

// L/s ⇄ L/min on the fly: a tool, not part of any test (nothing typed here
// is saved). Dashed so it doesn't read as a box to fill in.
export default function FlowConverter() {
  const [ls, setLs] = useState("");
  const [lmin, setLmin] = useState("");
  const field = (value: string, onChange: (v: string) => void, unit: string, label: string) => (
    <div style={{ flex: 1, display: "flex", alignItems: "baseline", gap: 6, borderBottom: "2px solid rgba(46,196,182,.4)", padding: "2px 2px 4px" }}>
      <input
        inputMode="decimal"
        placeholder="0"
        value={value}
        aria-label={label}
        onChange={(e) => onChange(e.target.value)}
        style={{ width: "100%", minWidth: 0, background: "none", border: "none", outline: "none", color: "var(--text)", fontSize: 18, fontWeight: 800, padding: 0 }}
      />
      <span style={{ fontSize: 12, fontWeight: 800, color: "var(--muted-2)" }}>{unit}</span>
    </div>
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 12, borderRadius: 14, border: "1px dashed rgba(46,196,182,.45)", background: "rgba(46,196,182,.05)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
          <rect x="5" y="2" width="14" height="20" rx="2" />
          <path d="M8 6h8M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15h.01M8 18h8" />
        </svg>
        <span style={{ fontSize: 12, fontWeight: 800, color: "var(--accent)" }}>Converter tool</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {field(ls, (v) => {
          const n = num(v);
          setLs(v);
          setLmin(n === null ? "" : String(Math.round(n * 60 * 10) / 10));
        }, "L/s", "Litres per second")}
        <div style={{ color: "var(--accent)", fontSize: 16, fontWeight: 800 }}>=</div>
        {field(lmin, (v) => {
          const n = num(v);
          setLmin(v);
          setLs(n === null ? "" : String(Math.round((n / 60) * 100) / 100));
        }, "L/min", "Litres per minute")}
      </div>
    </div>
  );
}
