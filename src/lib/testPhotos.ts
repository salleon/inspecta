import type { NavigateFunction } from "react-router-dom";
import { addPhoto, createFinding } from "../db/db";
import { capturePhoto } from "./capture";

// Photos & notes in a stair test: findings that belong to the test (not the
// site's findings list), taken while testing. Each opens on the app's own
// Finding screen (pages/Note, its stair test mode), which comes back to
// wherever it was opened from. A level is optional: the one being read when
// the camera was tapped, if any.

// a stair's level code as a finding's level: "12" → "Level 12", "G" →
// "Ground", "B2" → "Basement 2"; anything else ("P3", "Plant room") as it is
export function findingLevel(code: string | undefined): string | undefined {
  const c = code?.trim();
  if (!c) return undefined;
  const u = c.toUpperCase().replace(/^L(?=\d)/, "");
  if (/^\d+$/.test(u)) return `Level ${Number(u)}`;
  if (u === "G") return "Ground";
  if (u === "M") return "Mezzanine";
  if (u === "R" || u === "ROOF") return "Roof";
  const b = /^B(\d+)$/.exec(u);
  if (b) return `Basement ${Number(b[1])}`;
  return c;
}

// the Finding screen for one of a test's photos or notes, coming back to `back`
export const testFindingUrl = (siteId: string, testId: string, findingId: string, back: string) =>
  `/site/${siteId}/finding/${findingId}/note?test=${encodeURIComponent(testId)}&back=${encodeURIComponent(back)}`;

// the camera, then the new photo's Finding screen; nothing is made if the camera's cancelled
export async function takeTestPhoto(navigate: NavigateFunction, o: { siteId: string; testId: string; level?: string; back: string }) {
  const shot = await capturePhoto({ title: "Stair test photo", level: o.level, siteId: o.siteId });
  if (!shot) return;
  const finding = await createFinding(o.siteId, { stairTestId: o.testId, ...(o.level ? { level: o.level } : {}) });
  await addPhoto(finding.id, o.siteId, shot.blob, undefined, shot.marks);
  navigate(testFindingUrl(o.siteId, o.testId, finding.id, o.back));
}

// a note with no photo yet: its Finding screen with the keyboard up
export async function addTestNote(navigate: NavigateFunction, o: { siteId: string; testId: string; level?: string; back: string }) {
  const finding = await createFinding(o.siteId, { stairTestId: o.testId, ...(o.level ? { level: o.level } : {}) });
  navigate(testFindingUrl(o.siteId, o.testId, finding.id, o.back), { state: { noteOnly: true } });
}
