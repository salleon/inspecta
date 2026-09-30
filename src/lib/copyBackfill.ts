import { getExportCopy, photoIdsWithoutExportCopy, getPhoto } from "../db/db";
import { isExportBusy, setExportBusy } from "./exportBusy";

// Photos taken before export copies existed (see lib/exportCopy) get theirs
// here, in the background, so an older site's first export is as quick as
// a new one's. Starts once the splash has gone (App), then works through
// them one at a time, most recently worked-on sites first, with a short
// pause between photos so the app stays responsive. It waits while the app is
// in the background or an export is running, and only runs once per
// launch (whatever's left carries on next time). New photos don't need
// it: they get their copy just after they're taken.

const BETWEEN_MS = 100;

// an export (or anything else heavy) holds this while it runs
export function pauseCopyBackfill(on: boolean) {
  setExportBusy(on);
}

let started = false;
export function startCopyBackfill() {
  if (started) return;
  started = true;
  void run().catch(() => {});
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function run() {
  for (const id of await photoIdsWithoutExportCopy()) {
    while (isExportBusy() || document.hidden) await sleep(1000);
    const photo = await getPhoto(id);
    if (photo) await getExportCopy(photo).catch(() => {});
    await sleep(BETWEEN_MS);
  }
}
