import { useSyncExternalStore } from "react";
import { currentPhotoTool, subscribePhotoTools } from "../lib/capture";
import InAppCamera from "./InAppCamera";
import MarkupEditor from "./MarkupEditor";

// Shows the in-app camera or the markup editor when lib/capture asks for
// one (capturePhoto / markUpPhoto), over whatever screen is open.
export default function PhotoToolsHost() {
  const req = useSyncExternalStore(subscribePhotoTools, currentPhotoTool);
  if (!req) return null;
  if (req.kind === "camera") return <InAppCamera label={req.label} onDone={req.resolve} />;
  return <MarkupEditor blob={req.blob} marks={req.marks} onCancel={() => req.resolve(null)} onDone={req.resolve} />;
}
