import letterE from "../assets/splash/letter-E.png";
import letterN from "../assets/splash/letter-n.png";
import letterF from "../assets/splash/letter-F.png";
import letterA from "../assets/splash/letter-a.png";
import letterC from "../assets/splash/letter-c.png";
import letterT from "../assets/splash/letter-t.png";
import { IS_TEST_BUILD } from "../lib/buildInfo";
import { useRef } from "react";
import { getFlowMode, isContractor } from "../lib/settings";
import { switchMode } from "../lib/adminPin";
import ContractorSplash from "./ContractorSplash";
import "./Splash.css";

// Shown once while the app boots — purely cosmetic, fades itself out and
// unmounts via the timer in App.tsx. Sits above everything else on a solid
// background so there's no flash of an empty screen while the rest of the
// app (and the onboarding check) mounts underneath it. The animation itself
// is all CSS: see Splash.css.
const LETTERS = [letterE, letterN, letterF, letterA, letterC, letterT];

// The owner's switch between the modes: five quick taps in the top left
// corner of the splash switch a Contractor phone to EnFact, or an EnFact
// phone to Contractor, and restart the app. Nothing shows, before or after
// a tap. Into EnFact the admin PIN goes back to 2021; into Contractor the
// phone keeps the PIN it opens with.
const SECRET_TAPS = 5;
const SECRET_GAP_MS = 800; // a longer pause starts the count again

function SecretCorner() {
  const taps = useRef({ count: 0, last: 0 });
  return (
    <div
      aria-hidden="true"
      data-testid="splash-corner"
      onPointerDown={() => {
        const now = Date.now();
        const t = taps.current;
        t.count = now - t.last > SECRET_GAP_MS ? 1 : t.count + 1;
        t.last = now;
        if (t.count < SECRET_TAPS) return;
        switchMode(getFlowMode() === "enfact" ? "contractor" : "enfact");
        window.location.reload();
      }}
      style={{ position: "fixed", top: 0, left: 0, width: 96, height: "calc(96px + env(safe-area-inset-top, 0px))", zIndex: 1001 }}
    />
  );
}

export default function Splash({ leaving }: { leaving: boolean }) {
  // Contractor mode has its own splash in the company's colours
  if (isContractor()) {
    return (
      <>
        <ContractorSplash leaving={leaving} />
        <SecretCorner />
      </>
    );
  }
  return (
    <>
      <SecretCorner />
      <div className={leaving ? "splash splash-leaving" : "splash"} role="img" aria-label={IS_TEST_BUILD ? "EnFact Inspecta, site inspection tool, test version" : "EnFact Inspecta, site inspection tool"}>
        <div className="splash-center" aria-hidden="true">
          <div className="splash-stage">
            <i className="splash-sw splash-hot" />
            <i className="splash-sw splash-cool" />
            <div className="splash-rise">
              {LETTERS.map((src) => (
                <img key={src} className="splash-letter" src={src} alt="" />
              ))}
              <div className="splash-flash" />
            </div>
            <div className="splash-tip" />
          </div>
          <div className="splash-name">Inspecta</div>
        </div>
        {IS_TEST_BUILD && <div className="splash-test">Test version</div>}
        <div className="splash-chin" aria-hidden="true">
          <span />
          <b>Site inspection tool</b>
          <span />
        </div>
      </div>
    </>
  );
}
