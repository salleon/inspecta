import { useEffect, type CSSProperties, type ReactNode } from "react";
import { App as CapacitorApp } from "@capacitor/app";
import { checkForUpdate, dismissUpdate, finishUpdate, startUpdate, useAppUpdate } from "../lib/appUpdate";
import { useBackHandler } from "../lib/backButton";
import { IconRetake } from "./Icons";
import UpdateScreen from "./UpdateScreen";

// App-wide: checks Play for a newer version when the app opens (and when
// it comes back to the front), offers it in a popup, then covers the app
// with the updating screen while it downloads and installs. See
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
  if (status === "downloading" || status === "downloaded") {
    return <UpdateScreen downloaded={status === "downloaded"} progress={progress} />;
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

// Settings → Check for updates: what Play says, and the next step
export function UpdateSettingsRow({ rowStyle, hintStyle, onAction, icon, version }: { rowStyle: CSSProperties; hintStyle: CSSProperties; onAction: () => void; icon?: ReactNode; version?: string }) {
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
    <button type="button" onClick={tap} style={{ ...rowStyle, ...(badge && rowStyle.border !== "none" ? { borderColor: "var(--accent)" } : {}) }}>
      {icon}
      <div style={{ flexGrow: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
        <span style={{ fontSize: 14, fontWeight: 700 }}>Check for updates</span>
        <span style={hintStyle}>
          {hint}
          {version ? ` · ${version}` : ""}
        </span>
      </div>
      {badge && (
        <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 800, padding: "3px 8px", borderRadius: 999, background: "var(--accent)", color: "var(--accent-text)" }}>{badge}</span>
      )}
    </button>
  );
}
