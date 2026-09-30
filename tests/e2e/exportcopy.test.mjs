// Exports work from a smaller copy of each photo (lib/exportCopy): the
// PDF / Excel photos come out at most 1200 px, the copy is kept for next
// time, the photos zip still has the full-resolution originals, and older
// photos get their copies in the background (lib/copyBackfill).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { startApp, openPage, go, seed, download } from "./helpers.mjs";

let app;
let page;
let errors;

// width × height of a JPEG, from its SOF marker
function jpegSize(buf) {
  let i = 2;
  while (i < buf.length) {
    const marker = buf[i + 1];
    const len = buf.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xc3) return [buf.readUInt16BE(i + 7), buf.readUInt16BE(i + 5)];
    i += 2 + len;
  }
  return null;
}

before(async () => {
  app = await startApp(import.meta.url);
  ({ page, errors } = await openPage(app));
  await seed(page, {
    sites: [{ id: "s1", name: "Harbour Tower", kind: "afss" }],
    findings: [{ id: "f1", siteId: "s1", note: "Exit sign not illuminated", esrCategory: "3.1" }],
    photos: [{ id: "p1", findingId: "f1", siteId: "s1", width: 4000, height: 3000 }],
  });
});

after(async () => {
  await app?.close();
});

const copies = () =>
  page.evaluate(async () => {
    const req = indexedDB.open("inspecta");
    const idb = await new Promise((r) => (req.onsuccess = () => r(req.result)));
    const n = await new Promise((r) => {
      const q = idb.transaction("exportCopies").objectStore("exportCopies").count();
      q.onsuccess = () => r(q.result);
    });
    idb.close();
    return n;
  });

test("the Excel photo comes from a 1200 px copy, which is kept", async () => {
  assert.equal(await copies(), 0, "seeded photos have no copy yet");
  await go(page, app, "/site/s1/export", 2500);
  const xlsx = await download(page, async () => {
    await page.click("text=Share Excel");
    await page.waitForTimeout(600);
    if (await page.locator("text=Skip to export").count()) await page.click("text=Skip to export");
  });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(xlsx.path);
  const [image] = wb.worksheets[0].getImages();
  assert.deepEqual(jpegSize(Buffer.from(wb.getImage(Number(image.imageId)).buffer)), [1200, 900]);
  assert.equal(await copies(), 1, "made once and saved for the next export");
});

test("the photos zip still has the full-resolution original", async () => {
  const zip = await download(page, () => page.click("text=Send Photos Only"));
  const files = await JSZip.loadAsync(fs.readFileSync(zip.path));
  const jpgs = Object.values(files.files).filter((f) => f.name.endsWith(".jpg"));
  assert.equal(jpgs.length, 1);
  assert.deepEqual(jpegSize(await jpgs[0].async("nodebuffer")), [4000, 3000]);
});

test("photos from before the update get their copies in the background, without opening the export", async () => {
  await seed(page, {
    sites: [{ id: "s2", name: "Old site", kind: "afss" }],
    findings: [{ id: "g1", siteId: "s2", note: "Extinguisher obstructed", esrCategory: "5.5" }],
    photos: [
      { id: "q1", findingId: "g1", siteId: "s2", width: 2000, height: 1500 },
      { id: "q2", findingId: "g1", siteId: "s2", width: 2000, height: 1500 },
    ],
  });
  await go(page, app, "/", 500);
  await page.reload(); // the app starts with them already there
  assert.equal(await copies(), 1, "only the photo exported earlier");
  await page.waitForTimeout(13000); // starts 8 s after opening, one photo at a time
  assert.equal(await copies(), 3);
});

test("no page errors", () => {
  assert.deepEqual(errors, []);
});
