import { useEffect, useState } from "react";
import ConfirmDialog from "./ConfirmDialog";

// The app's own "something failed" dialog, in place of the phone's plain
// alert box: say(title, text) from anywhere shows it over the current screen.
type Said = { title: string; text: string };
let show: ((m: Said) => void) | null = null;

export function say(title: string, text = "Please try again.") {
  show?.({ title, text });
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
      <ConfirmDialog infoOnly tone="primary" title={said.title} message={said.text} confirmLabel="OK" onCancel={() => setSaid(null)} onConfirm={() => setSaid(null)} />
    </div>
  );
}
