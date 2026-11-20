// Which app this is, fixed when it's built (claude-project/SPLIT_PLAN.md):
// "enfact", Inspecta - EnFact, EnFact's own staff (its branding, and the
// stripped-down flow tests for its consultants: graph always discharge +
// town main, no line options; supplies Town main / Electric / Diesel or a
// custom name), or "contractor", Inspecta - Site Inspections, for other
// companies (their own name, logo and colours, every flow option).
//
// Set by VITE_EDITION when building (vite.config); a phone can't change it.
// Keep the differences between the apps behind these, in as few places as
// possible. EnFact's own artwork comes from "virtual:edition-art" instead,
// so the Contractor build doesn't carry it (src/edition).
export type Edition = "enfact" | "contractor";

declare const __EDITION__: Edition;

// (unit tests run without vite: EnFact unless a test sets __EDITION__)
export const EDITION: Edition = typeof __EDITION__ !== "undefined" && __EDITION__ === "contractor" ? "contractor" : "enfact";
export const IS_CONTRACTOR = EDITION === "contractor";
export const IS_ENFACT = !IS_CONTRACTOR;

