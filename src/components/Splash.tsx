import art from "virtual:edition-art";
import { IS_CONTRACTOR } from "../lib/edition";
import ContractorSplash from "./ContractorSplash";

// Shown once while the app boots — purely cosmetic, fades itself out and
// unmounts via the timer in App.tsx. Sits above everything else on a solid
// background so there's no flash of an empty screen while the rest of the
// app (and the onboarding check) mounts underneath it. The Contractor app
// has its own in the company's colours; EnFact's comes with its artwork
// (edition/EnfactSplash).
export default function Splash({ leaving }: { leaving: boolean }) {
  if (IS_CONTRACTOR || !art.Splash) return <ContractorSplash leaving={leaving} />;
  return <art.Splash leaving={leaving} />;
}
