import { IS_TEST_BUILD } from "../lib/buildInfo";
import { companyName, useCompany } from "../lib/company";
import { CompanyLogo } from "./CompanySetup";
import InspectaWordmark from "./InspectaWordmark";
import "./ContractorSplash.css";

// The launch splash in Contractor mode (canvas "Inspecta Contractor Splash",
// option B "Under the lens"), in place of EnFact's: the company's logo pops
// in, the Inspecta logotype plays its lens reveal (InspectaWordmark), and
// "for <company>" fades in underneath.
// Shown and faded out by the same timer in App.tsx as EnFact's (2.9s); the
// animation is all CSS, see ContractorSplash.css.
export default function ContractorSplash({ leaving }: { leaving: boolean }) {
  const c = useCompany();
  const name = companyName(c);
  const setUp = c.setUp && !!name;
  return (
    <div className={leaving ? "cs splash-leaving" : "cs"} role="img" aria-label={`Inspecta${setUp ? ` for ${name}` : ""}${IS_TEST_BUILD ? ", test version" : ""}`}>
      <div className="cs-center" aria-hidden="true">
        {setUp && (
          <div className="cs-logo">
            <CompanyLogo height={80} maxWidth={220} />
          </div>
        )}
        <InspectaWordmark reveal />
        <div className="cs-tag">{setUp ? `for ${name}` : "Site inspection tool"}</div>
      </div>
      {IS_TEST_BUILD && <div className="splash-test">Test version</div>}
    </div>
  );
}
