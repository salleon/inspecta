import art from "virtual:edition-art";
import { companyName, getCompany } from "./company";
import { IS_CONTRACTOR } from "./edition";

// Whose name and logo go on reports: EnFact's in EnFact mode, the
// company's (Settings → Company) in Contractor mode. Contractor reports
// never carry EnFact's.

// the logo at the top of flow and stair reports (PDF, Excel and their
// previews); none in Contractor mode until a logo is uploaded
export function reportLogoUrl(): string | null {
  return IS_CONTRACTOR ? getCompany().logo : art.reportLogo;
}

// standard wording written for EnFact ("EnFact recommend…") speaks for
// the company in Contractor mode
export function brandWording(text: string): string {
  if (!IS_CONTRACTOR) return text;
  return text.replace(/\bEnFact\b/g, companyName() || "the inspector");
}
