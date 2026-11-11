// The phone meter on a stair test's Noise page (lib/soundMeter): listens
// through the A-weighting filter and shows a level, with a diagnostics line
// (the unweighted level, and whether the phone turned its noise
// suppression, auto gain and echo cancelling off). Chromium's fake
// microphone plays a steady beep.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startApp, openPage, go } from "./helpers.mjs";

let app;
let page;
let errors;

before(async () => {
  app = await startApp(import.meta.url, { args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] });
  ({ page, errors } = await openPage(app));
  await go(page, app, "/", 1500);
  await page.evaluate(async () => {
    const req = indexedDB.open("inspecta");
    const idb = await new Promise((r) => (req.onsuccess = () => r(req.result)));
    const now = Date.now();
    const stair = { id: "st1", name: "Front", from: "G", to: "3", extra: [], fan: "SPF-1" };
    const tx = idb.transaction(["sites", "stairTests"], "readwrite");
    tx.objectStore("sites").put({ id: "s1", name: "Harbour Tower", address: "", kind: "spf", createdAt: now, updatedAt: now, spf: { edition: "1998", type: "Purge", stairs: [stair], notes: "" } });
    tx.objectStore("stairTests").put({ id: "t1", siteId: "s1", kind: "custom", sections: ["noise"], testedAt: now, doors: {}, once: {}, notes: [], order: 0, createdAt: now, updatedAt: now });
    await new Promise((r) => (tx.oncomplete = r));
    idb.close();
  });
});

after(async () => {
  await app?.close();
});

const stat = (label) =>
  page.evaluate((l) => {
    const b = [...document.querySelectorAll("b")].find((x) => x.parentElement?.firstChild?.textContent === l);
    return b?.textContent ?? "";
  }, label);
const savedOnce = () =>
  page.evaluate(async () => {
    const req = indexedDB.open("inspecta");
    const idb = await new Promise((r) => (req.onsuccess = () => r(req.result)));
    const t = await new Promise((r) => {
      const q = idb.transaction("stairTests").objectStore("stairTests").get("t1");
      q.onsuccess = () => r(q.result);
    });
    idb.close();
    return t.once.st1 ?? {};
  });

test("Listen shows the level, average and max, with the diagnostics line", async () => {
  await go(page, app, "/site/s1/spf/t1/noise?stair=st1", 1200);
  assert.equal(await page.getByRole("button", { name: /^[−+]1$/ }).count(), 0, "no calibration nudges");
  await page.getByRole("button", { name: "Listen" }).click();
  await page.getByTestId("meter-diagnostics").waitFor();
  const text = await page.getByTestId("meter-diagnostics").innerText();
  assert.match(text, /Noise suppr\. (off|ON|\?)/);
  assert.match(text, /\d+(\.\d)? kHz/);
  // the fake microphone beeps now and then: wait for the max to catch one
  await page.waitForFunction(() => {
    const b = [...document.querySelectorAll("b")].find((x) => x.parentElement?.firstChild?.textContent === "Max");
    return b && parseFloat(b.textContent) > 20;
  }, null, { timeout: 15000 });
  assert.match(await page.getByTestId("meter-status").innerText(), /Listening/);
});

test("Stop saves the average and max to the stair; Clear takes them off", async () => {
  await page.getByRole("button", { name: "Stop" }).click();
  await page.getByText("Saved to this stair").waitFor();
  await page.waitForTimeout(800);
  const once = await savedOnce();
  assert.ok(parseFloat(once.noiseRef) > 20, `max ${once.noiseRef}`);
  assert.ok(parseFloat(once.noiseRefAvg) <= parseFloat(once.noiseRef), `avg ${once.noiseRefAvg} ≤ max ${once.noiseRef}`);
  // still there when the page is opened again
  await go(page, app, "/site/s1/spf/t1/noise?stair=st1", 1200);
  assert.equal(await stat("Max"), once.noiseRef);
  assert.equal(await stat("Average"), once.noiseRefAvg);
  await page.getByRole("button", { name: "Clear the saved reading" }).click();
  await page.waitForTimeout(800);
  const cleared = await savedOnce();
  assert.equal(cleared.noiseRef, undefined);
  assert.equal(cleared.noiseRefAvg, undefined);
  assert.equal(await stat("Max"), "–");
});

test("no page errors", () => {
  assert.deepEqual(errors, []);
});
