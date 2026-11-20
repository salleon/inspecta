// The web version's offline cache (a service worker, sw.js) is gone, with
// the web version itself (claude-project/SPLIT_PLAN.md). In the apps it
// was never wanted: the app's files are on the phone already, and a cached
// copy made the app keep showing the old version after an update. So any
// worker left over from earlier versions is removed with its caches, and
// the page reloads once from the real files if one was found.
const RELOADED_KEY = "inspecta.swRemoved";

export async function removeOldOfflineCache() {
  if (!("serviceWorker" in navigator)) return;
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
