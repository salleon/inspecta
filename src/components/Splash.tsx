import letterE from "../assets/splash/letter-E.png";
import letterN from "../assets/splash/letter-n.png";
import letterF from "../assets/splash/letter-F.png";
import letterA from "../assets/splash/letter-a.png";
import letterC from "../assets/splash/letter-c.png";
import letterT from "../assets/splash/letter-t.png";
import { IS_TEST_BUILD } from "../lib/buildInfo";
import "./Splash.css";

// Shown once while the app boots — purely cosmetic, fades itself out and
// unmounts via the timer in App.tsx. Sits above everything else on a solid
// background so there's no flash of an empty screen while the rest of the
// app (and the onboarding check) mounts underneath it. The animation itself
// is all CSS: see Splash.css.
const LETTERS = [letterE, letterN, letterF, letterA, letterC, letterT];

export default function Splash({ leaving }: { leaving: boolean }) {
  return (
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
  );
}
