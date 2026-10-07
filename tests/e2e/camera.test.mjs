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
  // count camera opens, and slow them down when a test asks
  await page.addInitScript(() => {
    const md = navigator.mediaDevices;
    const open = md.getUserMedia.bind(md);
    window.__opens = 0;
    md.getUserMedia = async (c) => {
      window.__opens++;
      const delay = Number(sessionStorage.getItem("gumDelay") || 0);
      if (delay) await new Promise((r) => setTimeout(r, delay));
      return open(c);
    };
  });
  await page.reload();
  await page.waitForTimeout(2300); // splash
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

async function padKeys(keys) {
  for (const k of keys) {
    await page.locator(`[data-testid="measure-pad"] [data-key="${k}"]`).dispatchEvent("pointerdown");
    await page.waitForTimeout(30);
  }
}

async function canvasBox() {
  return page.getByTestId("markup-canvas").boundingBox();
}

test("a slow camera shows the start screen, then the aperture opens onto the picture", async () => {
  await page.evaluate(() => sessionStorage.setItem("gumDelay", "1500"));
  await go(page, app, "/site/s1/findings");
  await page.getByRole("button", { name: "New finding", exact: true }).click();
  await page.getByTestId("in-app-camera").waitFor();
  await page.waitForTimeout(150);
  assert.equal(await page.getByTestId("camera-start").count(), 0, "nothing for the first moment");
  await page.getByTestId("camera-start").waitFor({ timeout: 1000 });
  assert.ok(await page.locator(".cam-icon canvas").count(), "the swoosh is drawn");
  // the picture comes through: the aperture opens, then the start screen goes
  await page.locator(".cam-start.opening").waitFor({ timeout: 4000 });
  await page.getByTestId("camera-start").waitFor({ state: "detached", timeout: 2000 });
  await page.getByLabel("Close camera").click();
  await page.evaluate(() => sessionStorage.removeItem("gumDelay"));
});

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
  // the shutter is instant: the picture stops at once and the quick check follows
  const t0 = Date.now();
  await page.getByLabel("Take photo").click();
  assert.equal(await page.evaluate(() => document.querySelector(".cam video").paused), true, "picture held at the press");
  await page.getByRole("button", { name: /Retake/ }).waitFor();
  assert.ok(Date.now() - t0 < 1500, `quick check after ${Date.now() - t0} ms`);
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
  // the yellow number pad, not the keyboard: .5 becomes 0.5, a unit gets a
  // space before it, ⌫ takes off the character before the cursor
  await padKeys([".", "5"]);
  assert.equal(await page.getByTestId("measure-label").textContent(), "0.5");
  await padKeys(["bs", "bs", "bs", "1", ".", "2", "m"]);
  assert.equal(await page.getByTestId("measure-label").textContent(), "1.2 m");
  await padKeys(["ok"]);
  await page.waitForTimeout(400);
  assert.match(await page.getByTestId("measure-pad").getAttribute("class"), /\boff\b/, "Done puts the pad away");
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

test("the camera stays warm: the next photo opens instantly, with no start screen", async () => {
  const before = await page.evaluate(() => window.__opens);
  await page.getByRole("button", { name: "Add another photo to this finding" }).click();
  await page.getByTestId("in-app-camera").waitFor();
  await page.waitForTimeout(600);
  assert.equal(await page.getByTestId("camera-start").count(), 0);
  assert.equal(await page.evaluate(() => window.__opens), before, "the running camera was reused");
  assert.equal(await page.evaluate(() => document.querySelector(".cam video").style.opacity), "1", "picture showing");
  await page.getByLabel("Close camera").click();
  await page.waitForTimeout(300);
});

// the phone locking / unlocking, as the app sees it
const setVisible = (visible, laterMs = 0) =>
  page.evaluate(
    ({ visible, laterMs }) => {
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (visible ? "visible" : "hidden") });
      if (laterMs) {
        const now = Date.now;
        Date.now = () => now() + laterMs;
      }
      document.dispatchEvent(new Event("visibilitychange"));
    },
    { visible, laterMs },
  );

test("locked for under 5 minutes: the camera is started again on unlock; longer, it stays off", async () => {
  const opens = () => page.evaluate(() => window.__opens);
  // the camera's ready (just used); the phone locks, then unlocks
  let before = await opens();
  await setVisible(false);
  await setVisible(true);
  await page.waitForTimeout(800);
  assert.equal(await opens(), before + 1, "started again straight after unlocking");
  // locked longer than 5 minutes: not started again
  before = await opens();
  await setVisible(false);
  await setVisible(true, 6 * 60_000);
  await page.waitForTimeout(800);
  assert.equal(await opens(), before, "left off");
  // it still opens normally when next used
  await page.reload();
  await page.waitForTimeout(2300);
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
  await page.getByTestId("measure-label").waitFor();
  // (the photo makes room as the pad slides up, moving the box: let it settle)
  await page.waitForTimeout(500);
  // the cursor in the box: put it after the 2, then type 5
  const two = page.locator('[data-testid="measure-label"] [data-i="2"]');
  const r = await two.boundingBox();
  await page.mouse.click(r.x + r.width - 1, r.y + r.height / 2);
  await padKeys(["5"]);
  await padKeys(["ok"]);
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

  // tapping the tool that's on turns it off: taps then add nothing
  await page.getByRole("button", { name: "✎ Mark up" }).click();
  await page.getByTestId("markup-editor").waitFor();
  const circle = page.getByRole("button", { name: /Circle/ });
  assert.equal(await circle.getAttribute("aria-pressed"), "true");
  await circle.click();
  assert.equal(await circle.getAttribute("aria-pressed"), "false");
  assert.match(await page.locator(".mk-hint").innerText(), /Tap a mark to move or change it/);
  const c3 = await canvasBox();
  await page.mouse.click(c3.x + c3.width * 0.15, c3.y + c3.height * 0.2);
  await page.mouse.move(c3.x + c3.width * 0.1, c3.y + c3.height * 0.8);
  await page.mouse.down();
  await page.mouse.move(c3.x + c3.width * 0.3, c3.y + c3.height * 0.9, { steps: 5 });
  await page.mouse.up();
  assert.equal(await page.getByRole("button", { name: "↶ Undo" }).isDisabled(), true, "nothing was added");
  await circle.click();
  assert.equal(await circle.getAttribute("aria-pressed"), "true", "and on again");
  await page.getByRole("button", { name: "Cancel" }).click();
  await page.waitForTimeout(300);
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
