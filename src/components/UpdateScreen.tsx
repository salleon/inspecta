import { useEffect, useRef, useState } from "react";
import { finishUpdate } from "../lib/appUpdate";
import { useBackHandler } from "../lib/backButton";
import { mountGears, type UpdateStep } from "./updateGears";

// Full-screen while an update from Play is under way (after Update now):
// the gear picture (updateGears), the real download percentage, then
// Installing, when it hands over to Play to install and reopen the app.
// Covers the app on purpose; Android back does nothing meanwhile.
const STEPS: UpdateStep[] = ["downloading", "installing", "restarting"];
const STEP_TEXT: Record<UpdateStep, string> = {
  downloading: "Downloading the update",
  installing: "Installing",
  restarting: "Restarting…",
};
// long enough for the new gear to lift into place before Play takes over
const INSTALL_MS = 1400;

export default function UpdateScreen({ downloaded, progress }: { downloaded: boolean; progress: number }) {
  const [step, setStep] = useState<UpdateStep>(downloaded ? "installing" : "downloading");
  useBackHandler(() => true);

  useEffect(() => {
    if (!downloaded) return;
    setStep((s) => (s === "downloading" ? "installing" : s));
    const timer = window.setTimeout(() => {
      setStep("restarting");
      void finishUpdate();
    }, INSTALL_MS);
    return () => window.clearTimeout(timer);
  }, [downloaded]);

  const pct = step === "downloading" ? Math.max(0, Math.min(100, Math.round(progress * 100))) : 100;
  const stepIndex = STEPS.indexOf(step);

  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-label="Updating Inspecta"
      className="sheet-backdrop"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        background: "radial-gradient(120% 70% at 50% 38%, #0c2a44 0%, var(--bg) 60%, #04121e 100%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "0 32px",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, marginTop: -60 }}>
        <Gears step={step} pct={pct} />
        <div style={{ fontSize: 34, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
          {pct}
          <span style={{ fontSize: 16, color: "var(--muted)", marginLeft: 1 }}>%</span>
        </div>
        <div style={{ fontSize: 19, fontWeight: 800 }}>Updating Inspecta</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--muted)", minHeight: 20 }}>{STEP_TEXT[step]}</div>
        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          {STEPS.map((s, i) => (
            <span key={s} style={{ position: "relative", width: 28, height: 4, borderRadius: 2, background: "var(--border)", overflow: "hidden" }}>
              <span
                style={{
                  position: "absolute",
                  inset: 0,
                  background: "var(--accent)",
                  transformOrigin: "left",
                  // download: its real progress; installing / restarting fill over their time
                  transform: `scaleX(${i < stepIndex ? 1 : i === stepIndex ? (i === 0 ? pct / 100 : 1) : 0})`,
                  transition: i === stepIndex && i > 0 ? `transform ${INSTALL_MS}ms linear` : "transform 300ms",
                }}
              />
            </span>
          ))}
        </div>
      </div>
      <div style={{ position: "absolute", left: 32, right: 32, bottom: "calc(54px + env(safe-area-inset-bottom))", textAlign: "center", fontSize: 13, lineHeight: 1.5, color: "var(--muted-2)" }}>
        Your sites and findings stay exactly as they are.
      </div>
    </div>
  );
}

// Drawn once, then moved every frame from the latest step and percentage
// (kept in a ref, so a new percentage doesn't rebuild it).
function Gears({ step, pct }: { step: UpdateStep; pct: number }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const latest = useRef({ step, pct, since: 0 });
  if (latest.current.step !== step) latest.current = { step, pct, since: performance.now() };
  latest.current.pct = pct;
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const update = mountGears(svg);
    const start = performance.now();
    latest.current.since ||= start;
    let frame = 0;
    const tick = (now: number) => {
      const { step, pct, since } = latest.current;
      update((now - start) / 1000, step, (now - since) / 1000, pct);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);
  return <svg ref={svgRef} width={260} height={260} viewBox="0 0 260 260" style={{ display: "block", overflow: "visible" }} aria-hidden="true" />;
}
