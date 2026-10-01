// The in-app update popup, with a stand-in for Google Play (the real one
// only exists in the Play-installed Android app): offered on opening,
// Later / Android back put it off, Update now covers the app with the
// updating screen (download percentage, then Installing, then it restarts
// into the new version); Settings → Check for updates says what's going on.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startApp, openPage, go, pressBack } from "./helpers.mjs";

let app;
let page;
let plain;
let errors;

// Play says there's an update; the test drives the download from here
const fakePlay = () => {
  window.__appUpdateBackend = {
    getAppUpdateInfo: async () => ({ updateAvailability: 2, flexibleUpdateAllowed: true }),
    startFlexibleUpdate: async () => ({ code: 0 }),
    completeFlexibleUpdate: async () => {
      window.__restarted = true;
    },
    onStateChange: (fn) => {
      window.__playSays = fn;
    },
  };
};

before(async () => {
  app = await startApp(import.meta.url);
  ({ page, errors } = await openPage(app));
  await page.addInitScript(fakePlay);
  await page.reload();
  await page.waitForTimeout(2400); // splash
  ({ page: plain } = await openPage(app));
});

after(async () => {
  await app?.close();
});

const dialog = () => page.locator('[role="dialog"][aria-label="Update ready"]');

test("the popup appears once the app has opened; Later puts it off", async () => {
  assert.equal(await dialog().count(), 1);
  assert.match(await dialog().innerText(), /A new version of Inspecta is available/);
  await page.getByRole("button", { name: "Later", exact: true }).click();
  assert.equal(await dialog().count(), 0);
  await go(page, app, "/site/none/findings", 400); // moving around doesn't bring it back
  assert.equal(await dialog().count(), 0);
  await go(page, app, "/", 400);
});

test("reopening the app asks again; Android back counts as Later", async () => {
  await page.reload();
  await page.waitForTimeout(2400);
  assert.equal(await dialog().count(), 1);
  await pressBack(page);
  assert.equal(await dialog().count(), 0);
  assert.match(page.url(), /#\/$/, "back didn't leave the screen underneath");
});

test("Settings shows the new version; Update now shows the updating screen, which installs once downloaded", async () => {
  await page.click('button[aria-label="Settings"]');
  const row = page.locator('button:has-text("Check for updates")');
  assert.match(await row.innerText(), /NEW VERSION/);
  await row.click();
  await page.waitForTimeout(300);
  const screen = page.locator('[role="progressbar"][aria-label="Updating Inspecta"]');
  assert.equal(await screen.count(), 1, "Settings closed, updating screen showing");
  assert.match(await screen.innerText(), /0%[\s\S]*Downloading the update/);

  await page.evaluate(() => window.__playSays({ installStatus: 2, bytesDownloaded: 31, totalBytesToDownload: 50 }));
  await page.waitForTimeout(100);
  assert.equal(await screen.getAttribute("aria-valuenow"), "62");
  // the small gear rides the bar to the real progress (62% of 250 px), turning as it rolls
  await page.waitForTimeout(400);
  const gear = await page.locator('[data-testid="progress-gear"] svg').evaluate((g) => ({ left: parseFloat(g.style.left), turn: g.querySelector("g").style.transform }));
  assert.equal(gear.left, 250 * 0.62 - 13);
  assert.match(gear.turn, /rotate\((\d+\.?\d*)deg\)/);
  await pressBack(page);
  assert.equal(await screen.count(), 1, "back doesn't close it");

  await page.evaluate(() => window.__playSays({ installStatus: 11, bytesDownloaded: 50, totalBytesToDownload: 50 }));
  await page.waitForTimeout(200);
  assert.match(await screen.innerText(), /100%[\s\S]*Installing/);
  assert.notEqual(await page.evaluate(() => window.__restarted), true, "a moment on Installing first");
  await page.waitForTimeout(1500);
  assert.match(await screen.innerText(), /Restarting/);
  assert.equal(await page.evaluate(() => window.__restarted), true, "handed over to Play to install and reopen");
});

test("outside the Play app: no popup, and Settings says updates come through Play", async () => {
  await go(plain, app, "/");
  assert.equal(await plain.locator('[role="dialog"][aria-label="Update ready"]').count(), 0);
  await plain.click('button[aria-label="Settings"]');
  assert.match(await plain.locator('button:has-text("Check for updates")').innerText(), /Updates come through Google Play/);
});

test("no page errors", () => {
  assert.deepEqual(errors, []);
});
