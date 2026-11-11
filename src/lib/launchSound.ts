import { Capacitor, registerPlugin } from "@capacitor/core";
import { isContractor } from "./settings";

// The launch sound, played by the app's own LaunchSound plugin (Android:
// LaunchSoundPlugin.java, iPhone: LaunchSoundPlugin.swift) as the splash
// starts. The plugin decides whether the phone's sound is on and plays it at
// most once per app run. The browser version stays silent.
//
// The sound (scripts/splash-jingle.py) is timed to EnFact's splash: its last
// note lands at 1.56s, as "Inspecta" lights up. The Contractor splash's
// beat is the tick landing on the i (about 2.12s), so there it starts later.
const CONTRACTOR_DELAY_MS = 560;

const LaunchSound = registerPlugin<{ play(options: { delay: number }): Promise<{ played: boolean }> }>("LaunchSound");

export function playLaunchSound(): void {
  if (!Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable("LaunchSound")) return;
  LaunchSound.play({ delay: isContractor() ? CONTRACTOR_DELAY_MS : 0 }).catch(() => {});
}
