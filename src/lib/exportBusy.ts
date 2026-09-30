// Set while an export (or anything else heavy) runs: background copy
// making (db/getExportCopy, lib/copyBackfill) waits until it's clear, so it
// never competes with the export for the phone.
let busy = false;

export function setExportBusy(on: boolean) {
  busy = on;
}

export function isExportBusy() {
  return busy;
}
