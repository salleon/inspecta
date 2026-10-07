// A big site stays quick: 500 findings with 1,000 photos.
// Opening the findings list, coming back to it, opening a finding, and adding
// findings one after another with the in-app camera are timed against
// budgets, so a change that makes big sites slow fails here. The budgets
// are generous (CI machines vary); each is several times what it takes
// here, and far under what the same things took before the speed work.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startApp, openPage } from "./helpers.mjs";

let app;
let page;

const FINDINGS = 500;
const PHOTOS_EACH = 2;
const SITE = "big";
const timings = {};

// Timed inside the page, from the action to the result being on screen (a
// check each frame), so the test tool's own delays aren't counted.
// action / done: function bodies run in the page.
async function timeInPage(name, action, done, limit = 15000) {
  const ms = await page.evaluate(
    async ({ action, done, limit }) => {
      const act = new Function(`return (async () => { ${action} })()`);
      const ok = new Function(`return (${done})`);
      const t0 = performance.now();
      await act();
      while (!ok()) {
        if (performance.now() - t0 > limit) throw new Error("never finished");
        await new Promise((r) => requestAnimationFrame(r));
      }
      return Math.round(performance.now() - t0);
    },
    { action, done, limit },
  );
  timings[name] = ms;
  return ms;
}

// some text on screen
const shows = (text) => `[...document.querySelectorAll("body *")].some((e) => e.childElementCount === 0 && e.textContent.trim() === ${JSON.stringify(text)})`;
// at least n loaded pictures on screen
const picturesShown = (n) => `[...document.querySelectorAll("img")].filter((i) => i.complete && i.naturalWidth > 0 && i.getBoundingClientRect().top < innerHeight && i.getBoundingClientRect().bottom > 0).length >= ${n}`;
const findingPhotoShown = `(() => { const i = document.querySelector('button[aria-label="View photo full screen"] img'); return !!i && i.complete && i.naturalWidth > 0; })()`;
const list = `[...document.querySelectorAll("*")].find((e) => e.scrollHeight > e.clientHeight + 1000 && getComputedStyle(e).overflowY !== "visible")`;

before(async () => {
  app = await startApp("stress.test.mjs", { args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] });
  ({ page } = await openPage(app));
  await page.context().grantPermissions(["camera"]);
  await page.waitForTimeout(2300); // splash
  // the site: one 12 MP photo (with detail, so it's a realistic decode)
  // saved 1,000 times, a thumbnail for each finding's first photo (as a
  // site that's been open before has), but the last 20 (made on view)
  const seedSite = () => page.evaluate(
    async ({ FINDINGS, PHOTOS_EACH, SITE }) => {
      const jpeg = (w, h, q, detail) => {
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        const g = c.getContext("2d");
        const grad = g.createLinearGradient(0, 0, w, h);
        grad.addColorStop(0, "#8a8f86");
        grad.addColorStop(1, "#3c4a56");
        g.fillStyle = grad;
        g.fillRect(0, 0, w, h);
        for (let i = 0; i < detail; i++) {
          g.fillStyle = `hsl(${(i * 37) % 360} 40% ${30 + (i % 40)}%)`;
          g.fillRect((i * 97) % w, (i * 53) % h, 8 + (i % 60), 8 + (i % 45));
        }
        return new Promise((r) => c.toBlob(r, "image/jpeg", q));
      };
      // full 12 MP where the app decodes one (the finding opened, and the
      // findings whose thumbnails are made on view), a small one elsewhere
      // (the same number of photos; gigabytes of test data would only slow
      // the test machine's disk)
      const photo = await jpeg(4000, 3000, 0.85, 4000);
      const small = await jpeg(640, 480, 0.85, 300);
      const thumb = await jpeg(320, 240, 0.82, 200);
      const req = indexedDB.open("inspecta");
      const idb = await new Promise((r) => (req.onsuccess = () => r(req.result)));
      const now = Date.now();
      const tx = idb.transaction(["sites", "findings", "photos", "thumbnails"], "readwrite");
      tx.objectStore("sites").put({ id: SITE, name: "Big site", address: "", kind: "afss", createdAt: now, updatedAt: now });
      for (let f = 0; f < FINDINGS; f++) {
        tx.objectStore("findings").put({ id: `f${f}`, siteId: SITE, note: `Finding ${f + 1}`, location: "", order: f, createdAt: now - (FINDINGS - f) * 60000, updatedAt: now });
        for (let p = 0; p < PHOTOS_EACH; p++) {
          const big = f === 0 || (f >= FINDINGS - 20 && p === 0);
          tx.objectStore("photos").put({ id: `f${f}p${p}`, findingId: `f${f}`, siteId: SITE, blob: big ? photo : small, takenAt: now, order: p });
        }
        if (f < FINDINGS - 20) tx.objectStore("thumbnails").put({ photoId: `f${f}p0`, siteId: SITE, blob: thumb });
      }
      await new Promise((r) => (tx.oncomplete = r));
      idb.close();
      return photo.size;
    },
    { FINDINGS, PHOTOS_EACH, SITE },
  );
  // (once more if the app was still settling and reloaded the page)
  for (let i = 0; ; i++) {
    try {
      await seedSite();
      break;
    } catch (e) {
      if (i === 2 || !/context was destroyed|navigation/.test(String(e))) throw e;
      await page.waitForLoadState("load");
      await page.waitForTimeout(1000);
    }
  }
  // the app picks the new data up from a fresh start
  await page.reload();
  await page.waitForTimeout(2300);
});

after(async () => {
  console.log("stress timings (ms):", JSON.stringify(timings));
  await app?.close();
});

test(`opening a site's findings list with ${FINDINGS} findings`, async () => {
  // (navigated inside the app, like a tap: no page reload)
  const ms = await timeInPage("list open", `location.hash = "#/site/${SITE}/findings"`, `${shows(`Findings · ${FINDINGS}`)} && ${shows("Finding 1")} && ${picturesShown(4)}`);
  assert.ok(ms < 1000, `list open took ${ms} ms`);
});

test("every row's made in the end, and rows off screen aren't drawn", async () => {
  await page.waitForFunction((n) => document.querySelectorAll(".pop-in").length >= n, FINDINGS);
  const skipped = await page.evaluate(() => [...document.querySelectorAll(".pop-in")].filter((r) => getComputedStyle(r).contentVisibility === "auto").length);
  assert.ok(skipped >= FINDINGS, `${skipped} rows drawn only when on screen`);
});

test("scrolling to the end of the list", async () => {
  const ms = await timeInPage(
    "scroll to end",
    `const l = ${list}; for (let i = 0; i < 30; i++) { l.scrollTop += l.scrollHeight / 30; await new Promise((r) => requestAnimationFrame(r)); }`,
    shows(`Finding ${FINDINGS}`),
  );
  assert.ok(ms < 2000, `scrolling took ${ms} ms`);
  await page.evaluate(`${list}.scrollTop = 0`);
  await page.waitForTimeout(300);
});

test("opening a finding with a 12 MP photo", async () => {
  const ms = await timeInPage(
    "finding open",
    `location.hash = "#/site/${SITE}/finding/f0/note"`,
    `location.href.endsWith("/finding/f0/note") && ${findingPhotoShown}`,
  );
  assert.ok(ms < 1000, `finding open took ${ms} ms`);
});

test("back to the list is near instant (it's kept)", async () => {
  const ms = await timeInPage("back to list", "window.__pressBack()", `${shows(`Findings · ${FINDINGS}`)} && ${shows("Finding 1")} && ${picturesShown(4)}`);
  assert.ok(ms < 800, `back to the list took ${ms} ms`);
});

test("adding 10 findings one after another with the camera doesn't slow down", async () => {
  await page.getByText("Finding 1", { exact: true }).click();
  await page.waitForURL(/\/finding\/f0\/note$/);
  const cycles = [];
  for (let i = 0; i < 10; i++) {
    const from = page.url();
    const t0 = Date.now();
    await page.getByRole("button", { name: "Save & next", exact: true }).click();
    const shutter = page.getByLabel("Take photo", { exact: true });
    await shutter.waitFor();
    await page.waitForFunction(() => !document.querySelector('[aria-label="Take photo"]')?.disabled);
    await shutter.click();
    await page.getByRole("button", { name: "Use ✓" }).click();
    await page.waitForFunction((f) => location.href !== f && /\/note$/.test(location.href), from);
    await page.waitForFunction(() => {
      const img = document.querySelector('button[aria-label="View photo full screen"] img');
      return img && img.complete && img.naturalWidth > 0;
    });
    cycles.push(Date.now() - t0);
  }
  timings["add cycles"] = cycles;
  // the middle of the first five against the middle of the last five (one
  // slow one either way, e.g. the test machine busy, doesn't count)
  const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
  const first = median(cycles.slice(0, 5)), last = median(cycles.slice(-5));
  assert.ok(median(cycles) < 2000, `adding a finding took ${median(cycles)} ms (middle of 10)`);
  assert.ok(Math.max(...cycles) < 5000, `slowest add took ${Math.max(...cycles)} ms`);
  assert.ok(last < first * 1.5 + 300, `slowed down: first five ${first} ms, last five ${last} ms`);
  const n = await page.evaluate(async (site) => {
    const req = indexedDB.open("inspecta");
    const idb = await new Promise((r) => (req.onsuccess = () => r(req.result)));
    const c = await new Promise((r) => (idb.transaction("findings").objectStore("findings").index("siteId").count(site).onsuccess = (e) => r(e.target.result)));
    idb.close();
    return c;
  }, SITE);
  assert.equal(n, FINDINGS + 10, "all 10 saved");
});
