// Finding screen: adding photos from the gallery (the tile after the +, and
// the button on an empty photo box), and the + / gallery tiles staying in
// view however many photos a finding has.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startApp, openPage, go, seed } from "./helpers.mjs";

let app;
let page;
let errors;

// small JPEG files, as if picked in the photo picker
const jpegs = async (colors) =>
  (
    await page.evaluate(
      (colors) =>
        colors.map((c) => {
          const cv = document.createElement("canvas");
          cv.width = 320;
          cv.height = 240;
          const g = cv.getContext("2d");
          g.fillStyle = c;
          g.fillRect(0, 0, 320, 240);
          return cv.toDataURL("image/jpeg", 0.8).split(",")[1];
        }),
      colors,
    )
  ).map((b64, i) => ({ name: `IMG_${i}.jpg`, mimeType: "image/jpeg", buffer: Buffer.from(b64, "base64") }));

const pick = async (open, colors) => {
  const files = await jpegs(colors);
  const chooser = page.waitForEvent("filechooser");
  await open();
  const fc = await chooser;
  assert.equal(fc.isMultiple(), true, "several photos can be picked at once");
  await fc.setFiles(files);
  await page.waitForTimeout(800);
};

const photoCount = (findingId) =>
  page.evaluate(async (findingId) => {
    const req = indexedDB.open("inspecta");
    const idb = await new Promise((r) => (req.onsuccess = () => r(req.result)));
    const all = await new Promise((r) => {
      const q = idb.transaction("photos").objectStore("photos").getAll();
      q.onsuccess = () => r(q.result);
    });
    idb.close();
    return all.filter((p) => p.findingId === findingId).sort((a, b) => a.order - b.order).map((p) => p.order);
  }, findingId);

const inView = (label) =>
  page.locator(`button[aria-label="${label}"]`).evaluate((b) => {
    const r = b.getBoundingClientRect();
    return r.left >= 0 && r.right <= innerWidth;
  });

before(async () => {
  app = await startApp(import.meta.url);
  ({ page, errors } = await openPage(app));
  await seed(page, {
    sites: [{ id: "s1", name: "Harbour Tower" }],
    findings: [
      { id: "f0", siteId: "s1", note: "Fire door closer not self-closing" },
      { id: "f1", siteId: "s1", note: "Emergency lighting test overdue" },
    ],
    photos: [{ id: "p0", findingId: "f0", siteId: "s1" }],
  });
});

after(async () => {
  await app?.close();
});

test("the gallery tile adds several photos after the others and shows the first one added", async () => {
  await go(page, app, "/site/s1/finding/f0/note", 1500);
  await pick(() => page.click('button[aria-label="Add photos from the gallery"]'), ["#a33", "#3a3"]);
  assert.deepEqual(await photoCount("f0"), [0, 1, 2]);
  assert.equal(await page.locator("text=2 / 3").count(), 1, "the first picked photo is shown");
});

test("with lots of photos the strip scrolls, but + and gallery stay on screen", async () => {
  await pick(() => page.click('button[aria-label="Add photos from the gallery"]'), ["#33a", "#aa3", "#3aa", "#a3a", "#777", "#222"]);
  assert.equal((await photoCount("f0")).length, 9);
  assert.equal(await inView("Add another photo to this finding"), true);
  assert.equal(await inView("Add photos from the gallery"), true);
  assert.equal(await inView("View photo 4"), true, "the first new one is scrolled into view");
  const wide = await page.evaluate(() => {
    const f = document.querySelector(".finding-scroll");
    return document.documentElement.scrollWidth > innerWidth || f.scrollWidth > f.clientWidth;
  });
  assert.equal(wide, false, "nothing pushed off the side of the screen");
});

test("a finding with no photo: Choose from gallery on the empty photo box", async () => {
  await go(page, app, "/site/s1/finding/f1/note", 1500);
  await pick(() => page.click('button:has-text("Choose from gallery")'), ["#a33"]);
  assert.deepEqual(await photoCount("f1"), [0]);
  assert.equal(await page.locator('button[aria-label="View photo full screen"]').count(), 1);
  assert.equal(await page.locator('button:has-text("Choose from gallery")').count(), 0, "gone once there's a photo");
});

test("cancelling the picker adds nothing", async () => {
  const before = await photoCount("f1");
  const chooser = page.waitForEvent("filechooser");
  await page.click('button[aria-label="Add photos from the gallery"]');
  const fc = await chooser;
  await fc.setFiles([]);
  await page.waitForTimeout(500);
  assert.deepEqual(await photoCount("f1"), before);
  assert.equal(await page.locator('button[aria-label="Add photos from the gallery"]').isEnabled(), true);
});

test("no page errors", () => {
  assert.deepEqual(errors, []);
});
