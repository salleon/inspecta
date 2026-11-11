import { deleteAllData } from "../db/db";
import { clearOldExports } from "./cacheFile";

// Admin → Wipe app: puts the phone back to how a brand-new install looks,
// for testing the first-run experience. Everything goes — sites, findings,
// photos, flow and stair tests, the inspector's name, mode, company,
// settings, keyword changes, learned keywords, tour progress and the admin
// PIN — then the app reloads into first-run setup. Not undoable.
export async function wipeApp() {
  await deleteAllData();
  try {
    localStorage.clear();
  } catch {
    // best effort
  }
  try {
    sessionStorage.clear();
  } catch {
    // best effort
  }
  await clearOldExports(0).catch(() => {});
  try {
    if ("caches" in window) for (const key of await caches.keys()) await caches.delete(key);
  } catch {
    // best effort
  }
  // start from the top, as a fresh launch would
  window.location.replace(window.location.pathname);
}
