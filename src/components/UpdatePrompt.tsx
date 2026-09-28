import { useEffect, type CSSProperties, type ReactNode } from "react";
import { App as CapacitorApp } from "@capacitor/app";
import { checkForUpdate, dismissUpdate, finishUpdate, startUpdate, useAppUpdate } from "../lib/appUpdate";
import { useBackHandler } from "../lib/backButton";
import { IconRetake } from "./Icons";

// App-wide: checks Play for a newer version when the app opens (and when
// it comes back to the front), offers it in a popup, then shows a slim bar
// while it downloads and a Restart button once it's ready. See
// lib/appUpdate. `ready` holds it back until the splash / name screen are
// out of the way.
export default function UpdatePrompt({ ready }: { ready: boolean }) {
  const { status, progress, dismissed } = useAppUpdate();

  useEffect(() => {
    if (!ready) return;
    void checkForUpdate();
    const resume = CapacitorApp.addListener("resume", () => void checkForUpdate());
    return () => {
      void resume.then((l) => l.remove());
    };
  }, [ready]);

  if (!ready) return null;
  if (status === "available" && !dismissed) return <UpdateDialog />;
  if (status === "downloading") {
    return (
      <UpdateBar passThrough>
        <span style={{ flexGrow: 1, fontSize: 13, fontWeight: 700 }}>Downloading update… {Math.round(progress * 100)}%</span>
        <span style={{ fontSize: 12, color: "var(--muted)" }}>keep working</span>
        <div style={{ position: "absolute", left: 0, bottom: 0, height: 3, width: `${Math.round(progress * 100)}%`, background: "var(--accent)", transition: "width 300ms" }} />
      </UpdateBar>
    );
  }
  if (status === "downloaded") {
    return (
      <UpdateBar>
        <span style={{ flexGrow: 1, fontSize: 13, fontWeight: 700 }}>Update downloaded</span>
        <button type="button" onClick={() => void finishUpdate()} style={{ padding: "9px 14px", borderRadius: 10, background: "var(--accent)", color: "var(--accent-text)", border: "none", fontSize: 13, fontWeight: 800 }}>
          Restart
        </button>
      </UpdateBar>
    );
  }
  return null;
}

function UpdateDialog() {
  // Android back = Later (mounted only while showing, so it goes first)
  useBackHandler(() => {
    dismissUpdate();
    return true;
  });
  return (
    <div
      className="sheet-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Update ready"
      style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(3,13,22,0.72)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
    >
      <div
        className="pop-in"
        style={{ width: "100%", maxWidth: 360, padding: "24px 22px 16px", borderRadius: 22, background: "var(--panel)", border: "1px solid var(--border-strong)", boxShadow: "0 20px 50px rgba(0,0,0,0.5)", display: "flex", flexDirection: "column", gap: 14 }}
      >
        <span style={{ width: 56, height: 56, borderRadius: 16, background: "var(--panel-2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <IconRetake size={28} color="var(--accent)" strokeWidth={2} style={{ transform: "scaleX(-1)" }} />
        </span>
        <div style={{ fontSize: 20, fontWeight: 800 }}>Update ready</div>
        <div style={{ fontSize: 14, color: "var(--muted)", lineHeight: 1.5 }}>
          A new version of Inspecta is available. It takes about a minute and your sites and findings stay exactly as they are.
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 6 }}>
          <button type="button" onClick={() => void startUpdate()} style={{ padding: "15px 0", borderRadius: 14, background: "var(--accent)", color: "var(--accent-text)", border: "none", fontSize: 15, fontWeight: 800 }}>
            Update now
          </button>
          <button type="button" onClick={dismissUpdate} style={{ padding: "12px 0", background: "none", border: "none", fontSize: 14, fontWeight: 700, color: "var(--muted)" }}>
            Later
          </button>
        </div>
      </div>
    </div>
  );
}

// Just below the screens' top bars, so it covers neither their back /
// settings buttons nor the save buttons at the bottom of a finding. While
// downloading it's only a notice, so taps go straight through it.
function UpdateBar({ children, passThrough = false }: { children: ReactNode; passThrough?: boolean }) {
  return (
    <div
      role="status"
      className="pop-in"
      style={{
        position: "fixed",
        left: 12,
        right: 12,
        top: "calc(66px + env(safe-area-inset-top))",
        pointerEvents: passThrough ? "none" : "auto",
        zIndex: 55,
        padding: "10px 14px",
        borderRadius: 14,
        background: "var(--panel-2)",
        border: "1px solid var(--border-strong)",
        display: "flex",
        alignItems: "center",
        gap: 12,
        overflow: "hidden",
        boxShadow: "0 10px 30px rgba(0,0,0,0.45)",
      }}
    >
      {children}
    </div>
  );
}

// Settings → Check for updates: what Play says, and the next step
export function UpdateSettingsRow({ rowStyle, hintStyle, onAction }: { rowStyle: CSSProperties; hintStyle: CSSProperties; onAction: () => void }) {
  const { status, progress } = useAppUpdate();
  const hint = {
    unsupported: "Updates come through Google Play.",
    checking: "Checking…",
    none: "You're on the latest version.",
    available: "A new version is ready to install.",
    downloading: `Downloading… ${Math.round(progress * 100)}%`,
    downloaded: "Downloaded. Tap to restart into it.",
    failed: "The update didn't finish. Tap to try again.",
  }[status];
  const badge = status === "available" ? "NEW VERSION" : status === "downloaded" ? "READY" : null;

  function tap() {
    if (status === "available") {
      onAction(); // close Settings so the download bar is in view
      void startUpdate();
    } else if (status === "downloaded") void finishUpdate();
    else if (status !== "downloading" && status !== "checking") void checkForUpdate();
  }

  return (
    <button type="button" onClick={tap} style={{ ...rowStyle, borderColor: badge ? "var(--accent)" : (rowStyle.borderColor as string | undefined) }}>
      <div style={{ flexGrow: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
        <span style={{ fontSize: 14, fontWeight: 700 }}>Check for updates</span>
        <span style={hintStyle}>{hint}</span>
      </div>
      {badge && (
        <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 800, padding: "3px 8px", borderRadius: 999, background: "var(--accent)", color: "var(--accent-text)" }}>{badge}</span>
      )}
    </button>
  );
}
