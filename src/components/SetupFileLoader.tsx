import { useEffect, useRef, useState } from "react";
import { applySetupFile, fileNeedsPin, filePinMatches, readSetupFile, type SetupFile } from "../lib/setupFile";
import { useBackHandler } from "../lib/backButton";
import { say } from "./Message";

// Loading a company setup file (lib/setupFile): reads it, then sets this
// phone up from it. A company's file just asks to join (the manager's PIN
// comes with it, unseen); an EnFact file asks for the admin PIN first.
// Used by the new-phone welcome (Join a company) and Admin → Load setup file.
export default function SetupFileLoader({ file, onDone, onCancel }: { file: File; onDone: () => void; onCancel: () => void }) {
  const [setup, setSetup] = useState<SetupFile | null>(null);
  const [pin, setPinDigits] = useState("");
  const [message, setMessage] = useState("");
  const cancel = useRef(onCancel);
  cancel.current = onCancel;

  useBackHandler(() => {
    onCancel();
    return true;
  });

  useEffect(() => {
    let live = true;
    file
      .text()
      .then((text) => {
        if (live) setSetup(readSetupFile(text));
      })
      .catch(() => {
        if (!live) return;
        say("Couldn't read the file", "That isn't an Inspecta setup file.");
        cancel.current();
      });
    return () => {
      live = false;
    };
  }, [file]);

  async function press(k: string) {
    if (!setup) return;
    setMessage("");
    const next = k === "del" ? pin.slice(0, -1) : pin + k;
    if (next.length < 4) {
      setPinDigits(next);
      return;
    }
    setPinDigits("");
    if (await filePinMatches(setup, next)) {
      applySetupFile(setup, next);
      onDone();
    } else setMessage("Wrong PIN");
  }

  if (!setup) return null;
  const who = setup.mode === "enfact" ? "EnFact" : setup.company.name || "Company";
  const key = { height: 58, borderRadius: 14, border: "1px solid var(--border)", background: "var(--panel)", color: "var(--text)", fontSize: 22, fontWeight: 700 };

  if (!fileNeedsPin(setup)) {
    return (
      <div role="dialog" aria-label="Join company" style={{ position: "fixed", inset: 0, zIndex: 50, background: "var(--bg)", display: "flex", flexDirection: "column", padding: "calc(24px + var(--sa-top)) 24px calc(24px + var(--sa-bottom))" }}>
        <button type="button" onClick={onCancel} style={{ alignSelf: "flex-start", height: 44, border: "none", background: "none", color: "var(--muted)", fontSize: 15, fontWeight: 700, padding: 0 }}>
          Cancel
        </button>
        <div style={{ flexGrow: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, textAlign: "center" }}>
          <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--accent)" }}>{who} setup</div>
          <div style={{ fontSize: 20, fontWeight: 800 }}>Join {who}?</div>
          <div style={{ fontSize: 14, fontWeight: 500, color: "var(--muted)", lineHeight: 1.5, maxWidth: 300 }}>This phone takes {who}'s name, logo and colours for its reports. Admin stays with whoever looks after the company's phones.</div>
        </div>
        <button
          type="button"
          onClick={() => {
            applySetupFile(setup);
            onDone();
          }}
          style={{ height: 54, borderRadius: 14, border: "none", background: "var(--accent)", color: "var(--accent-text)", fontSize: 16, fontWeight: 800 }}
        >
          Join {who}
        </button>
      </div>
    );
  }

  return (
    <div role="dialog" aria-label="Setup file PIN" style={{ position: "fixed", inset: 0, zIndex: 50, background: "var(--bg)", display: "flex", flexDirection: "column", padding: "calc(24px + var(--sa-top)) 24px calc(24px + var(--sa-bottom))" }}>
      <button type="button" onClick={onCancel} style={{ alignSelf: "flex-start", height: 44, border: "none", background: "none", color: "var(--muted)", fontSize: 15, fontWeight: 700, padding: 0 }}>
        Cancel
      </button>
      <div style={{ flexGrow: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--accent)" }}>{who} setup</div>
        <div style={{ fontSize: 18, fontWeight: 800 }}>Enter the admin PIN</div>
        <div style={{ display: "flex", gap: 14 }}>
          {[0, 1, 2, 3].map((i) => (
            <span key={i} style={{ width: 14, height: 14, borderRadius: "50%", border: "2px solid var(--accent)", background: i < pin.length ? "var(--accent)" : "transparent" }} />
          ))}
        </div>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#e07a7a", minHeight: 16 }}>{message}</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"].map((k, i) =>
          k ? (
            <button key={i} type="button" aria-label={k === "del" ? "Delete" : k} onClick={() => void press(k)} style={key}>
              {k === "del" ? "⌫" : k}
            </button>
          ) : (
            <span key={i} />
          ),
        )}
      </div>
    </div>
  );
}
