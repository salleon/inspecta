import type { ComponentType } from "react";

// EnFact's own artwork, which only the EnFact app carries. Code imports it
// from "virtual:edition-art", which vite.config points at edition/enfact.ts
// or edition/contractor.ts (every piece null), so none of it is in the
// Contractor build (scripts/check-edition.mjs checks). Use a piece only
// where the app is EnFact (lib/edition).
export type EditionArt = {
  // the splash: EnFact's logo built up letter by letter
  Splash: ComponentType<{ leaving: boolean }> | null;
  // EnFact's logo on flow and stair reports (a data URL)
  reportLogo: string | null;
  // the home screen's top-left mark
  homeLogo: string | null;
  // the name screen's EnFact wordmark
  wordmark: string | null;
  // the PDF cover backgrounds, with EnFact's masthead baked in
  coverAfss: string | null;
  coverProjects: string | null;
};
