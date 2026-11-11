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

test("Listen shows an A-weighted level and the diagnostics line", async () => {
  await go(page, app, "/site/s1/spf/t1/noise?stair=st1", 1200);
  await page.getByRole("button", { name: "Listen" }).click();
  const diag = page.getByTestId("meter-diagnostics");
  await diag.waitFor();
  await page.waitForFunction(() => /Unweighted \d/.test(document.querySelector('[data-testid="meter-diagnostics"]')?.textContent ?? ""));
  const text = await diag.innerText();
  assert.match(text, /Noise suppr\. (off|ON|\?)/);
  assert.match(text, /\d+(\.\d)? kHz/);
  assert.match(text, /Cal\. 100/);
  // the fake microphone beeps now and then: wait for the max to catch one
  const maxOf = () => page.getByText("Max", { exact: false }).locator("b").innerText();
  await page.waitForFunction(() => {
    const b = [...document.querySelectorAll("b")].find((x) => x.parentElement?.textContent?.startsWith("Max"));
    return b && parseFloat(b.textContent) > 20;
  }, null, { timeout: 15000 });
  assert.ok(parseFloat(await maxOf()) > 20);
  await page.getByRole("button", { name: "Stop" }).click();
});

test("no page errors", () => {
  assert.deepEqual(errors, []);
});
