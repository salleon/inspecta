// The in-app camera (no Android camera app): quick check after the shot
// (Retake / ✎ Mark up / Use ✓), and ✎ Mark up: red circles and measurements
// kept apart from the original photo so they can be changed later. Uses
// Chromium's fake camera.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startApp, openPage, go, seed } from "./helpers.mjs";

let app;
let page;
let errors;

before(async () => {
  app = await startApp("camera.test.mjs", { args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] });
  ({ page, errors } = await openPage(app));
  await page.context().grantPermissions(["camera"]);
  await seed(page, { sites: [{ id: "s1", name: "Cam site", address: "", kind: "afss" }] });
});
after(async () => {
  await app?.close();
});

const photos = () =>
  page.evaluate(async () => {
    const req = indexedDB.open("inspecta");
    const idb = await new Promise((r) => (req.onsuccess = () => r(req.result)));
    const all = await new Promise((r) => {
      const q = idb.transaction("photos").objectStore("photos").getAll();
      q.onsuccess = () => r(q.result);
    });
    idb.close();
    return all.map((p) => ({ id: p.id, findingId: p.findingId, marks: p.marks, blob: p.blob.size, marked: p.marked?.size }));
  });

async function canvasBox() {
  return page.getByTestId("markup-canvas").boundingBox();
}

test("✕ closes the camera without making a finding", async () => {
  await go(page, app, "/site/s1/findings");
  await page.getByRole("button", { name: "New finding", exact: true }).click();
  await page.getByTestId("in-app-camera").waitFor();
  await page.getByLabel("Close camera").click();
  await page.waitForTimeout(400);
  assert.equal(await page.getByTestId("in-app-camera").count(), 0);
  assert.match(page.url(), /\/findings$/);
  assert.equal((await photos()).length, 0);
});

test("shoot, retake, mark up with a circle and a measurement, use", async () => {
  await go(page, app, "/site/s1/findings");
  await page.getByRole("button", { name: "New finding", exact: true }).click();
  await page.getByTestId("in-app-camera").waitFor();
  await page.waitForTimeout(1200);
  assert.match(await page.locator(".cam-chip").innerText(), /New finding/);

  // tap to focus: the square shows where you tapped
  const pic = await page.evaluate(() => {
    const v = document.querySelector(".cam video");
    const r = v.getBoundingClientRect();
    const s = Math.min(r.width / v.videoWidth, r.height / v.videoHeight);
    return { top: r.top + (r.height - v.videoHeight * s) / 2, height: v.videoHeight * s };
  });
  await page.mouse.click(195, pic.top + pic.height / 2);
  await page.waitForTimeout(100);
  assert.equal(await page.locator(".cam-focus").count(), 1, "focus square shown");

  // no grey ▶ placeholder before the picture comes through
  assert.match(await page.locator(".cam video").getAttribute("poster"), /^data:image\/gif/);
  // zoom: the fake camera has none of its own, so 1× / 2× zoom digitally
  // and the photo is cropped to match
  assert.deepEqual(await page.locator(".cam-zoom button").allInnerTexts(), ["1×", "2×"]);
  await page.locator(".cam-zoom button", { hasText: "2×" }).click();
  await page.getByLabel("Take photo").click();
  await page.getByRole("button", { name: /Retake/ }).waitFor();
  const size = await page.evaluate(() => {
    const v = document.querySelector(".cam video");
    const img = document.querySelector(".cam-shot");
    return { vw: v.videoWidth, iw: img.naturalWidth };
  });
  assert.ok(Math.abs(size.iw - size.vw / 2) < 4, `2× keeps the middle half (${size.iw} of ${size.vw})`);
  await page.getByRole("button", { name: /Retake/ }).click();
  await page.locator(".cam-zoom button", { hasText: "1×" }).click();
  await page.getByLabel("Take photo").click();
  await page.getByRole("button", { name: /Retake/ }).waitFor();
  await page.getByRole("button", { name: /Retake/ }).click();
  await page.getByLabel("Take photo").waitFor();
  await page.waitForTimeout(300);
  await page.getByLabel("Take photo").click();
  await page.getByRole("button", { name: /Mark up/ }).click();
  await page.getByTestId("markup-editor").waitFor();
  await page.waitForTimeout(500);

  // a red circle: tap the photo
  let c = await canvasBox();
  await page.mouse.click(c.x + c.width * 0.3, c.y + c.height * 0.5);
  // a measurement: drag, then type it with its unit
  await page.getByRole("button", { name: /Measure/ }).click();
  await page.mouse.move(c.x + c.width * 0.55, c.y + c.height * 0.3);
  await page.mouse.down();
  await page.mouse.move(c.x + c.width * 0.9, c.y + c.height * 0.7, { steps: 8 });
  await page.mouse.up();
  await page.getByTestId("measure-label").waitFor();
  await page.keyboard.type("1.2 m");
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Done" }).click();
  await page.waitForURL(/\/note$/);
  await page.waitForTimeout(1500);

  const [p] = await photos();
  assert.ok(p, "photo saved");
  assert.equal(p.marks.length, 2);
  assert.equal(p.marks[0].t, "circle");
  assert.deepEqual([p.marks[1].t, p.marks[1].label], ["measure", "1.2 m"], "the unit is as typed");
  assert.ok(p.marked > 0 && p.marked !== p.blob, "a marked copy, the original kept");
  assert.equal(await page.getByLabel("Marked up").count(), 1, "✎ on the thumbnail");
});

test("✎ Mark up on a finding opens the marks again to change them", async () => {
  await page.getByRole("button", { name: "✎ Mark up" }).click();
  await page.getByTestId("markup-editor").waitFor();
  await page.waitForTimeout(500);
  const before = (await photos())[0];
  // select the circle and delete it
  const c = await canvasBox();
  const m = before.marks[0];
  await page.mouse.click(c.x + m.cx * c.width + m.rx * c.width, c.y + m.cy * c.height);
  await page.waitForTimeout(200);
  await page.getByRole("button", { name: "🗑 Delete" }).click();

  // tap the measurement's number to change it
  const e = before.marks[1];
  await page.mouse.click(c.x + ((e.x0 + e.x1) / 2) * c.width, c.y + ((e.y0 + e.y1) / 2) * c.height);
  await page.getByTestId("measure-label").fill("1.25 m");
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Done" }).click();
  await page.waitForTimeout(1500);
  const after = (await photos())[0];
  assert.equal(after.marks.length, 1);
  assert.equal(after.marks[0].label, "1.25 m");
  assert.equal(after.blob, before.blob, "original untouched");

  // and Undo puts back what was removed (Cancel leaves it as saved)
  await page.getByRole("button", { name: "✎ Mark up" }).click();
  await page.getByTestId("markup-editor").waitFor();
  const c2 = await canvasBox();
  await page.mouse.click(c2.x + c2.width * 0.2, c2.y + c2.height * 0.2);
  await page.getByRole("button", { name: "↶ Undo" }).click();
  await page.getByRole("button", { name: "Cancel" }).click();
  await page.waitForTimeout(500);
  assert.equal((await photos())[0].marks.length, 1);
  assert.deepEqual(errors, []);
});

test("in-app camera off in Settings: the Android camera (file input on web)", async () => {
  await page.evaluate(() => localStorage.setItem("inspecta.inAppCamera", "0"));
  await go(page, app, "/site/s1/findings");
  const chooser = page.waitForEvent("filechooser", { timeout: 5000 });
  await page.getByRole("button", { name: "New finding", exact: true }).click();
  await chooser;
  assert.equal(await page.getByTestId("in-app-camera").count(), 0);
  await page.evaluate(() => localStorage.removeItem("inspecta.inAppCamera"));
});
