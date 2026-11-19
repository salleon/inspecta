import EnfactSplash from "./EnfactSplash";
import reportLogo from "../assets/flow-logo.png?inline";
import homeLogo from "../assets/logo.png";
import wordmark from "../assets/enfact-wordmark.png";
import coverAfss from "../assets/cover-bg-afss.jpg";
import coverProjects from "../assets/cover-bg-projects.jpg";
import type { EditionArt } from "./art";

// EnFact's artwork, in the EnFact build only (see art.ts)
const art: EditionArt = { Splash: EnfactSplash, reportLogo, homeLogo, wordmark, coverAfss, coverProjects };
export default art;
