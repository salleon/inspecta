// A finding with more photos than fit on a page: its photos carry on over
// the next page under its strip again, marked "continued", none cut off at
// the bottom. (Two photos sit beside the note and the rest go four across
// under it, so it takes 20 to fill more than a page.)
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { startApp, openPage, go, seed, download } from "./helpers.mjs";

let app;
let page;
let errors;

before(async () => {
  app = await startApp(import.meta.url);
  ({ page, errors } = await openPage(app));
  await seed(page, {
    sites: [{ id: "s1", name: "Harbour Tower" }],
    findings: [
      { id: "f0", siteId: "s1", note: "Fire door hinge damaged", esr: "1.6" },
      { id: "f1", siteId: "s1", note: "Exit sign not illuminated", esr: "3.1" },
    ],
    photos: [...Array.from({ length: 20 }, (_, i) => ({ id: `p${i}`, findingId: "f0", siteId: "s1", color: `hsl(${i * 30},40%,45%)` })), { id: "q0", findingId: "f1", siteId: "s1" }],
  });
});

after(async () => {
  await app?.close();
});

test("20 photos on one finding run onto the next page, none past the page edge", async () => {
  await go(page, app, "/site/s1/export", 2500);
  const pdf = await download(page, async () => {
    await page.click("text=Share PDF");
    await page.waitForTimeout(600);
    if (await page.locator("text=Export anyway").count()) await page.click("text=Export anyway");
  });
  const text = (await readFile(pdf.path)).toString("latin1");
  assert.ok(text.includes("\\(continued\\)"), "the finding is marked continued");
  const pages = text.match(/\/Type \/Page\b/g)?.length ?? 0;
  assert.ok(pages >= 3, `cover + at least 2 pages, got ${pages}`);
  // every photo inside the page (A4 is 842 pt tall; jsPDF draws from the bottom)
  const images = [...text.matchAll(/([\d.]+) 0 0 ([\d.]+) ([\d.]+) ([\d.-]+) cm\s*\/I/g)].map((m) => ({ h: +m[2], y: +m[4] })).filter((im) => im.h < 400 && im.h > 100); // the photos (not the cover or the logo)
  assert.ok(images.length >= 21, `21 photos drawn, got ${images.length}`);
  for (const im of images) assert.ok(im.y >= 39 && im.y + im.h <= 803, JSON.stringify(im));
});

test("no page errors", () => {
  assert.deepEqual(errors, []);
});
