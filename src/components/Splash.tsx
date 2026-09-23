import enfactWordmark from "../assets/enfact-wordmark.png";

// Shown once, briefly, while the app boots — purely cosmetic, fades itself
// out and unmounts via the timer in App.tsx. Sits above everything else on
// a solid background so there's no flash of an empty screen while the rest
// of the app (and the onboarding check) mounts underneath it.
export default function Splash({ leaving }: { leaving: boolean }) {
  return (
    <div
      className={leaving ? "splash-leaving" : undefined}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "var(--bg)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 22,
      }}
    >
      <div className="splash-logo-wrap">
        <img src={enfactWordmark} alt="EnFact" style={{ width: 220, height: "auto", display: "block" }} />
      </div>

      <div className="splash-tagline" style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ width: 24, height: 1, background: "rgba(46,196,182,0.45)", display: "block" }} />
        <span style={{ fontSize: 14, fontWeight: 700, color: "var(--accent)", letterSpacing: 2, textTransform: "uppercase", whiteSpace: "nowrap" }}>
          Site inspection app
        </span>
        <span style={{ width: 24, height: 1, background: "rgba(46,196,182,0.45)", display: "block" }} />
      </div>
    </div>
  );
}
