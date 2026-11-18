// The same level changes on other stairs (pages/LevelReview copy card, lib
// stairTest levelEdits / applyLevelEdits): after a change in Review level
// layout a card offers it for the other stairs. Apply to all makes it there
// and then and turns into Undo; Choose stairs… lists each stair with how
// many of the changes fit it, to tick. Nothing changes until asked.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startApp, openPage, go } from "./helpers.mjs";

let app;
let page;
let errors;

before(async () => {
  app = await startApp(import.meta.url);
  ({ page, errors } = await openPage(app));
  await go(page, app, "/", 1500);
  await page.evaluate(async () => {
    const req = indexedDB.open("inspecta");
    const idb = await new Promise((r) => (req.onsuccess = () => r(req.result)));
    const now = Date.now();
    const st = (id, fan, name, to) => ({ id, name, from: "G", to, extra: [], fan });
    const tx = idb.transaction(["sites"], "readwrite");
    tx.objectStore("sites").put({
      id: "s1",
      name: "Harbour Tower",
      address: "",
      kind: "spf",
      createdAt: now,
      updatedAt: now,
      spf: { edition: "1998", type: "Purge", notes: "", stairs: [st("a", "SPF 1", "East", "5"), st("b", "SPF 2", "West", "5"), st("c", "SPF 3", "Core", "2")] },
    });
    await new Promise((r) => (tx.oncomplete = r));
    idb.close();
  });
});

after(async () => {
  await app?.close();
});

const saved = () =>
  page.evaluate(async () => {
    const req = indexedDB.open("inspecta");
    const idb = await new Promise((r) => (req.onsuccess = () => r(req.result)));
    const site = await new Promise((r) => {
      const q = idb.transaction("sites").objectStore("sites").get("s1");
      q.onsuccess = () => r(q.result);
    });
    idb.close();
    return Object.fromEntries(site.spf.stairs.map((s) => [s.id, { levels: s.levels ?? null, reviewed: !!s.reviewed }]));
  });

const card = () => page.getByTestId("copy-card");

// on SPF 1's review: Plant room above 5, and level 1 removed
async function editFirstStair() {
  await go(page, app, "/site/s1/spf-system", 1200);
  await page.locator('[data-stair="a"]').click();
  await page.getByRole("button", { name: /Review level layout/ }).click();
  const list = page.getByTestId("level-list");
  await list.waitFor();
  assert.equal(await card().count(), 0, "nothing offered before a change");
  await list.locator('[data-level="5"]').click();
  await page.getByRole("button", { name: "+ Custom name…" }).click();
  await page.getByLabel("Level name").fill("Plant room");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  // the card waits while a level's tools are open (the new one is picked)
  assert.equal(await card().count(), 0);
  await list.locator('[data-level="Plant room"]').click();
  const box = await list.locator('[data-level="1"]').boundingBox();
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width - 30, y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(box.x + box.width - 30 - i * 15, y);
  await page.mouse.up();
  await page.getByRole("button", { name: "Remove Level 1" }).click();
  await page.locator(".lr-dlg").getByRole("button", { name: "Remove", exact: true }).click();
  await card().waitFor();
}

test("Apply to all: made straight away on every stair it fits, then Undo", async () => {
  await editFirstStair();
  assert.match(await card().innerText(), /Same changes on other stairs\?\s*2 changes · 2 other stairs/);
  // nothing applied yet
  assert.deepEqual((await saved()).b, { levels: null, reviewed: false });
  const h0 = (await card().boundingBox()).height;
  await card().getByRole("button", { name: "Apply to all 2" }).click();
  // turned into Undo in the same space: the list above doesn't move
  assert.equal((await card().boundingBox()).height, h0);
  assert.match(await card().innerText(), /Applied\s*To SPF 2 · West and SPF 3 · Core/);
  await page.waitForTimeout(500);
  const s = await saved();
  // SPF 2 took both and counts as looked over; SPF 3 (G to 2) only the removal
  assert.deepEqual(s.b, { levels: ["Plant room", "5", "4", "3", "2", "G"], reviewed: true });
  assert.deepEqual(s.c, { levels: ["2", "G"], reviewed: false });
  await card().getByRole("button", { name: "Undo" }).click();
  await page.waitForTimeout(500);
  const u = await saved();
  assert.deepEqual(u.b, { levels: null, reviewed: false });
  assert.deepEqual(u.c, { levels: null, reviewed: false });
  // offered again
  assert.match(await card().innerText(), /Same changes on other stairs\?/);
});

test("Choose stairs…: each stair's fit, ticked ones only", async () => {
  await card().getByRole("button", { name: "Choose stairs…" }).click();
  const dlg = page.getByRole("dialog", { name: "Choose stairs" });
  assert.match(await dlg.innerText(), /No level 1[\s\S]*Plant room above 5/);
  assert.ok(await dlg.getByRole("button", { name: "Apply", exact: true }).isDisabled(), "nothing ticked to start");
  const core = dlg.getByRole("checkbox", { name: /SPF 3 · Core/ });
  assert.match(await core.innerText(), /1 of 2 · no 5/);
  assert.equal(await core.locator("small").evaluate((e) => getComputedStyle(e).color), "rgb(247, 185, 119)");
  assert.match(await dlg.getByRole("checkbox", { name: /SPF 2 · West/ }).innerText(), /All 2/);
  await core.click();
  await dlg.getByRole("button", { name: "Apply to 1 stair" }).click();
  assert.match(await card().innerText(), /Applied\s*To SPF 3 · Core/);
  await page.waitForTimeout(500);
  const s = await saved();
  assert.deepEqual(s.b, { levels: null, reviewed: false });
  assert.deepEqual(s.c, { levels: ["2", "G"], reviewed: false });
});

test("✕ puts the card away", async () => {
  await card().getByRole("button", { name: "Undo" }).click();
  await card().getByRole("button", { name: "Not now" }).click();
  assert.equal(await card().count(), 0);
  assert.deepEqual(errors, []);
});
