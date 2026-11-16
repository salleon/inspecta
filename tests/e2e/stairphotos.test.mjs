// Photos & notes in a stair test (lib/testPhotos): taken from the overview
// or a reading screen, the whole test's (not a stair's), a level only if
// one was being read, back to where they were taken from, kept out of the
// site's own findings, and on their own page of the report.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startApp, openPage, go } from "./helpers.mjs";

let app;
let page;
let errors;

const stair = (id, fan, from, to) => ({ id, name: "", from, to, extra: [], fan, reviewed: true });

// the stair test's own photos and notes, from the database
const testFindings = () =>
  page.evaluate(async () => {
    const req = indexedDB.open("inspecta");
    const idb = await new Promise((r) => (req.onsuccess = () => r(req.result)));
    const all = await new Promise((r) => {
      const q = idb.transaction("findings").objectStore("findings").getAll();
      q.onsuccess = () => r(q.result);
    });
    idb.close();
    return all.filter((f) => f.stairTestId === "t1").sort((a, b) => a.createdAt - b.createdAt);
  });

before(async () => {
  app = await startApp(import.meta.url, { args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] });
  ({ page, errors } = await openPage(app));
  await page.context().grantPermissions(["camera"]);
  await go(page, app, "/", 1500);
  await page.evaluate(async (s) => {
    const req = indexedDB.open("inspecta");
    const idb = await new Promise((r) => (req.onsuccess = () => r(req.result)));
    const now = Date.now();
    const tx = idb.transaction(["sites", "stairTests"], "readwrite");
    tx.objectStore("sites").put({ id: "p1", name: "Harbour Point", address: "", kind: "afss", createdAt: now, updatedAt: now, spf: { edition: "2015", type: "One test", notes: "", stairs: s } });
    tx.objectStore("stairTests").put({ id: "t1", siteId: "p1", kind: "general", sections: ["vel"], testedAt: now, doors: {}, once: {}, notes: [], order: 0, createdAt: now, updatedAt: now });
    await new Promise((r) => (tx.oncomplete = r));
    idb.close();
  }, [stair("s1", "SPF-01", "G", "3"), stair("s2", "SPF-02", "G", "3")]);
});

after(async () => {
  await app?.close();
});

test("the overview: Photos & notes after the tests in use; a note comes back to the overview", async () => {
  await go(page, app, "/site/p1/spf/t1?stair=s1", 1500);
  const card = page.getByTestId("spf-photos");
  assert.match(await card.innerText(), /Photos & notes\s*Whole test · None yet/);
  // straight after the tests in use, before the ones not added
  const order = await page.evaluate(() => {
    const t = document.body.innerText;
    return [t.indexOf("Velocity"), t.indexOf("Photos & notes"), t.indexOf("Additional tests")];
  });
  assert.ok(order[0] < order[1] && order[1] < order[2], `in order: ${order}`);
  await card.click();
  await page.getByTestId("spf-photos-sheet").waitFor();
  await page.getByRole("button", { name: "Add a note" }).click();
  await page.waitForURL(/\/finding\/[^/?]+\/note\?test=t1/);
  assert.match(await page.locator("body").innerText(), /Photo or note\s*Stair test · Photos & notes/);
  // not in the site's report, so no ESR category
  assert.equal(await page.getByText("ESR category").count(), 0);
  await page.locator("#noteInput").fill("Fan room locked, key from FM");
  await page.getByRole("button", { name: "Back to the test", exact: true }).click();
  await page.waitForURL(/\/spf\/t1\?stair=s1$/);
  await page.getByTestId("spf-photos").waitFor();
  assert.match(await page.getByTestId("spf-photos").innerText(), /Whole test · 1 note/);
  const [note] = await testFindings();
  assert.equal(note.note, "Fan room locked, key from FM");
  assert.equal(note.level, undefined, "no level from the overview");
});

test("a reading screen: the camera takes the level being read; back on the same screen", async () => {
  await go(page, app, "/site/p1/spf/t1/vel?stair=s2&run=0", 1500);
  assert.match(await page.getByTestId("spf-photos-chip").innerText(), /Photos & notes\s*1/);
  await page.getByRole("button", { name: "Level 2", exact: true }).click();
  await page.getByRole("button", { name: "Take a photo for this test" }).click();
  await page.getByTestId("in-app-camera").waitFor();
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: "Take photo" }).click();
  await page.getByRole("button", { name: "Use ✓" }).click();
  await page.waitForURL(/\/finding\/[^/?]+\/note\?test=t1/);
  await page.locator("#noteInput").fill("Door closer arm loose");
  await page.getByRole("button", { name: "Back to the test", exact: true }).click();
  await page.waitForURL(/\/spf\/t1\/vel\?stair=s2&run=0$/);
  const [, shot] = await testFindings();
  assert.equal(shot.level, "Level 2");
  assert.equal(shot.stairTestId, "t1");
  // both counted once they've loaded
  await page.getByTestId("spf-photos-chip").filter({ hasText: "2" }).waitFor();
  await page.getByTestId("spf-photos-chip").click();
  const sheet = await page.getByTestId("spf-photos-sheet").innerText();
  assert.match(sheet, /this test, all stairs/);
  assert.match(sheet, /No level\s*Fan room locked[\s\S]*Level 2\s*Door closer arm loose/);
});

test("kept out of the site's findings; their own page in the report", async () => {
  await go(page, app, "/site/p1/findings", 1500);
  assert.equal(await page.getByText("Door closer arm loose").count(), 0, "not in the site's findings list");
  await go(page, app, "/site/p1/spf/t1/report", 2500);
  const photosPage = page.getByTestId("spf-photos-page");
  await photosPage.waitFor({ state: "attached" });
  const text = await photosPage.innerText();
  assert.match(text, /Photos & notes/);
  assert.match(text, /1\s*Fan room locked, key from FM/);
  assert.match(text, /2 · Level 2\s*Door closer arm loose/);
  assert.equal(await photosPage.locator("img[src^='blob:']").count(), 1, "the photo");
});

test("no errors", () => {
  assert.deepEqual(errors, []);
});
