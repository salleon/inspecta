import { Capacitor } from "@capacitor/core";

// The offline cache (the PWA service worker, sw.js) is only for the web
// version. Inside the Android app it's switched off: the app's files are on
// the phone already, and a cached copy made the app keep showing the old
// version after an update (Restart, or even reopening) until it was swiped
// out of the recent-apps tray. So in the app, any worker left over from
// earlier versions is removed with its caches, and the page reloads once
// from the real files if one was found.
const RELOADED_KEY = "inspecta.swRemoved";

export async function setUpOfflineCache() {
  if (!("serviceWorker" in navigator)) return;
  if (!Capacitor.isNativePlatform()) {
    window.addEventListener("load", () => void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {}));
    return;
  }
  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    for (const r of registrations) await r.unregister();
    if ("caches" in window) for (const key of await caches.keys()) await caches.delete(key);
    const controlled = !!navigator.serviceWorker.controller;
    if (controlled && sessionStorage.getItem(RELOADED_KEY) !== "1") {
      sessionStorage.setItem(RELOADED_KEY, "1");
      location.reload();
    }
  } catch {
    // nothing to clean up, or not allowed: carry on as normal
  }
}
