import { companyName, companyScheme } from "./company";
import { IS_CONTRACTOR } from "./edition";

// How the reports differ between the apps beyond the logo (lib/branding):
// the "Contractor site report" design. Kept apart from lib/branding so the
// report drawing code loads without the app's artwork (unit tests).

// the short rule under every report title (lib/reportHeading, and the
// flow and FFCP sheets' bar): EnFact's blue, or the company's accent
// (the "Contractor site report" design, colours option B)
export function reportAccent(): string {
  return IS_CONTRACTOR ? companyScheme().secondary : "#1f6fb2";
}

// the middle of every report footer: the company's name in Contractor
// mode (design option B: whose report it is, logo or not); none in EnFact's
export function footerCompany(): string {
  return IS_CONTRACTOR ? companyName() : "";
}

// the Excel findings register: title rows above it (logo or name, report,
// site, date, inspector) and its sheet called "Findings" in Contractor
// mode; EnFact's stays exactly its own template
export const REGISTER_TITLE = IS_CONTRACTOR;
