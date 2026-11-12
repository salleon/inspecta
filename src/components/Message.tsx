import { useEffect, useState } from "react";
import ConfirmDialog from "./ConfirmDialog";

// The app's own "something failed" dialog, in place of the phone's plain
// alert box: say(title, text) from anywhere shows it over the current screen.
// confirmFirst(title, text, onYes) asks before something is deleted (nothing
// is deleted by a single tap, so a slip on site can't lose anything).
type Said = { title: string; text: string; yes?: { label: string; go: () => void } };
let show: ((m: Said) => void) | null = null;

export function say(title: string, text = "Please try again.") {
  show?.({ title, text });
}

export function confirmFirst(title: string, text: string, go: () => void, label = "Delete") {
  show?.({ title, text, yes: { label, go } });
}

export default function Message() {
  const [said, setSaid] = useState<Said | null>(null);
  useEffect(() => {
    show = setSaid;
    return () => {
      show = null;
    };
  }, []);
  if (!said) return null;
  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 50 }}>
      {said.yes ? (
        <ConfirmDialog
          title={said.title}
          message={said.text}
          confirmLabel={said.yes.label}
          onCancel={() => setSaid(null)}
          onConfirm={() => {
            said.yes!.go();
            setSaid(null);
          }}
        />
      ) : (
        <ConfirmDialog infoOnly tone="primary" title={said.title} message={said.text} confirmLabel="OK" onCancel={() => setSaid(null)} onConfirm={() => setSaid(null)} />
      )}
    </div>
  );
}
