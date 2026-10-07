// Finding screen: tapping the big photo opens it full screen; swipe between
// photos, zoom, drag down / ✕ / back to close (back stays on the finding).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startApp, openPage, go, seed, pressBack } from "./helpers.mjs";

let app;
let page;
let errors;

const viewer = () => page.locator('button[aria-label="Close photo"]');
const counter = () => viewer().locator("xpath=..").locator("text=/^\\d+ \\/ \\d+$/").innerText();
const current = () => page.locator('img[alt^="Photo "]').evaluateAll((imgs) => imgs.find((i) => Math.abs(i.getBoundingClientRect().left) < innerWidth / 2 && getComputedStyle(i).opacity === "1")?.alt);

const drag = async (x0, y0, x1, y1) => {
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(x0 + ((x1 - x0) * i) / 8, y0 + ((y1 - y0) * i) / 8);
  await page.mouse.up();
  await page.waitForTimeout(450);
};

const openViewer = async () => {
  await page.click('button[aria-label="View photo full screen"]');
  await page.waitForTimeout(450);
  assert.equal(await viewer().count(), 1, "viewer open");
};

before(async () => {
  app = await startApp(import.meta.url);
  ({ page, errors } = await openPage(app));
  await seed(page, {
    sites: [{ id: "s1", name: "Harbour Tower" }],
    findings: [
      { id: "f0", siteId: "s1", note: "Exit sign not illuminated", location: "Stair 2", level: "Level 3" },
      { id: "f1", siteId: "s1", note: "No photo yet" },
    ],
    photos: [
      { id: "p0", findingId: "f0", siteId: "s1", color: "#a33" },
      { id: "p1", findingId: "f0", siteId: "s1", color: "#3a3", order: 1 },
      { id: "p2", findingId: "f0", siteId: "s1", color: "#33a", order: 2 },
    ],
  });
});

after(async () => {
  await app?.close();
});

test("tap the photo: opens full screen with the note; swipe between photos", async () => {
  await go(page, app, "/site/s1/finding/f0/note", 1500);
  await openViewer();
  assert.equal(await counter(), "1 / 3");
  assert.equal(await page.locator("text=Exit sign not illuminated").count(), 2, "note shown in the viewer too");
  assert.equal(await page.locator("text=Stair 2 · Level 3").count(), 1);

  await drag(300, 420, 60, 425);
  assert.equal(await counter(), "2 / 3");
  assert.equal(await current(), "Photo 2 of 3");
  await drag(300, 420, 60, 425);
  await drag(300, 420, 60, 425); // already on the last one: stays
  assert.equal(await counter(), "3 / 3");
  await drag(60, 420, 300, 425);
  assert.equal(await counter(), "2 / 3");
});

test("drag down closes it, back on the photo it was showing", async () => {
  await drag(195, 400, 200, 620);
  assert.equal(await viewer().count(), 0, "closed");
  assert.match(page.url(), /finding\/f0\/note$/);
  await openViewer();
  assert.equal(await counter(), "2 / 3", "reopens on the photo it closed on");
});

test("double-tap zooms in and out; a drag while zoomed pans instead of swiping", async () => {
  const scale = () => page.locator('img[alt="Photo 2 of 3"]').evaluate((i) => new DOMMatrix(getComputedStyle(i).transform).a);
  await page.mouse.click(195, 420);
  await page.mouse.click(195, 420);
  await page.waitForTimeout(450);
  assert.ok((await scale()) > 2, "zoomed");
  await drag(250, 420, 80, 420);
  assert.equal(await counter(), "2 / 3", "panned, didn't change photo");
  await page.mouse.click(195, 420);
  await page.mouse.click(195, 420);
  await page.waitForTimeout(450);
  assert.equal(await scale(), 1, "zoomed back out");
});

test("a single tap hides and shows the controls", async () => {
  const shown = () => viewer().evaluate((b) => getComputedStyle(b.parentElement).opacity);
  await page.mouse.click(195, 420);
  await page.waitForTimeout(600);
  assert.equal(await shown(), "0");
  await page.mouse.click(195, 420);
  await page.waitForTimeout(600);
  assert.equal(await shown(), "1");
});

test("Android back closes the viewer and stays on the finding; ✕ closes too", async () => {
  await pressBack(page);
  assert.equal(await viewer().count(), 0, "closed");
  assert.match(page.url(), /finding\/f0\/note$/, "still on the finding");
  await openViewer();
  await viewer().click();
  await page.waitForTimeout(450);
  assert.equal(await viewer().count(), 0);
});

test("a finding without a photo still opens the camera from the photo area", async () => {
  await go(page, app, "/site/s1/finding/f1/note", 1500);
  assert.equal(await page.locator('button[aria-label="Take a photo for this finding"]').count(), 1);
  assert.equal(await page.locator('button[aria-label="View photo full screen"]').count(), 0);
});

test("no page errors", () => {
  assert.deepEqual(errors, []);
});

test("a finding shows the photo's small saved copy; the full-size original only loads when zoomed in", async () => {
  await seed(page, {
    findings: [{ id: "f2", siteId: "s1", note: "Big photo", order: 2 }],
    photos: [{ id: "p3", findingId: "f2", siteId: "s1", color: "#884", width: 2400, height: 1800 }],
  });
  // its screen-size copy, as made in the background after it's taken
  const sizes = await page.evaluate(async () => {
    const req = indexedDB.open("inspecta");
    const idb = await new Promise((r) => (req.onsuccess = () => r(req.result)));
    const c = document.createElement("canvas");
    c.width = 1200;
    c.height = 900;
    c.getContext("2d").fillRect(0, 0, 1200, 900);
    const copy = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.8));
    const tx = idb.transaction(["exportCopies", "photos"], "readwrite");
    tx.objectStore("exportCopies").put({ photoId: "p3", siteId: "s1", blob: copy });
    const original = await new Promise((r) => (tx.objectStore("photos").get("p3").onsuccess = (e) => r(e.target.result.blob.size)));
    await new Promise((r) => (tx.oncomplete = r));
    idb.close();
    return { copy: copy.size, original };
  });
  const size = (sel) => page.locator(sel).first().evaluate(async (i) => (await (await fetch(i.src)).blob()).size);
  await go(page, app, "/site/s1/finding/f2/note", 1500);
  assert.equal(await size('button[aria-label="View photo full screen"] img'), sizes.copy, "the finding shows the small copy");
  await openViewer();
  assert.equal(await size('img[alt="Photo 1 of 1"]'), sizes.copy, "full screen too");
  assert.equal(await page.locator('img[alt=""][src^="blob:"]').evaluateAll((imgs) => imgs.filter((i) => i.closest('[aria-label="Close photo"]') === null && i.style.position === "absolute").length), 0, "no original until zoomed");
  await page.mouse.click(195, 420);
  await page.mouse.click(195, 420);
  await page.waitForTimeout(600);
  const full = page.locator('img[alt=""]').filter({ has: page.locator("xpath=self::*[@src]") });
  const origSizes = await full.evaluateAll(async (imgs) => Promise.all(imgs.map(async (i) => (await (await fetch(i.src)).blob()).size)));
  assert.ok(origSizes.includes(sizes.original), "zoomed in: the original loads over it");
  await viewer().click();
  await page.waitForTimeout(450);
});

test("full screen only makes the photo shown and its neighbours", async () => {
  await go(page, app, "/site/s1/finding/f0/note", 1500);
  await openViewer();
  assert.equal(await counter(), "1 / 3");
  assert.equal(await page.locator('img[alt^="Photo "]').count(), 2, "photo 1 and 2, not 3");
  await viewer().click();
  await page.waitForTimeout(450);
});
