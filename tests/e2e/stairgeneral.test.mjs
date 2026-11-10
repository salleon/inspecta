// General system testing (the Stair general system testing canvas): the test
// kinds by mode and in their order, velocities run against run, a door added
// at a level, "<" for below the meter, a pass that's only just one in
// yellow, the report run by run, and in Review level layout the groups and
// the pop-up that changes the other car parks to basements.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startApp, openPage, go, seed } from "./helpers.mjs";

let app;
let page;
let errors;

const stair = (id, fan, from, to, group) => ({ id, name: "", from, to, extra: [], fan, group, reviewed: true });
const onRun = (n) => page.locator(`[data-testid="spf-runs"] button[aria-pressed="true"]`, { hasText: `Run ${n}` }).waitFor();
const tap = async (keys) => {
  for (const k of keys) await page.getByRole("button", { name: k, exact: true }).dispatchEvent("pointerdown");
};

before(async () => {
  app = await startApp(import.meta.url);
  ({ page, errors } = await openPage(app));
  await go(page, app, "/", 1500);
  await seed(page, {
    sites: [
      {
        id: "g1",
        name: "Northshore",
        kind: "spf",
        spf: { edition: "2015", type: "Zone", notes: "", stairs: [stair("s1", "SPF 1", "P3", "P1", "Basement"), stair("s2", "SPF 2", "P3", "P1", "Basement"), stair("s3", "SPF 3", "G", "12", "Tower")] },
      },
    ],
  });
});

after(async () => {
  await app?.close();
});

test("the kinds: General first; Contractor mode adds Commissioning and the Three-monthly check", async () => {
  await go(page, app, "/site/g1/spf/new", 1200);
  const kinds = async () => (await page.getByRole("radio").allInnerTexts()).map((t) => t.split("\n")[0]);
  assert.deepEqual(await kinds(), ["General system testing", "Annual Testing", "Custom"]);
  await page.evaluate(() => localStorage.setItem("inspecta.flowMode", "contractor"));
  await go(page, app, "/site/g1/spf/new", 1200);
  assert.deepEqual(await kinds(), ["General system testing", "Annual Testing", "Commissioning", "Three-monthly check", "Custom"]);
  await page.evaluate(() => localStorage.removeItem("inspecta.flowMode"));
  await go(page, app, "/site/g1/spf/new", 1200);
});

test("General system testing starts on its velocities, with other tests to add", async () => {
  await page.getByRole("radio", { name: /General system testing/ }).click({ position: { x: 30, y: 16 } });
  assert.match(await page.getByRole("radio", { name: /General system testing/ }).innerText(), /Velocity[\s\S]*\+\s*Door force[\s\S]*\+\s*Noise/);
  await page.getByRole("button", { name: "Start ›" }).click();
  await page.waitForURL(/\/spf\/[^/]+\/vel/);
  await page.getByTestId("spf-runs").waitFor();
  assert.match(await page.locator("body").innerText(), /General system testing\s*Velocity · Stair 1/);
  assert.match(await page.getByTestId("spf-stairs").innerText(), /SPF 1 · Basement[\s\S]*SPF 2 · Basement[\s\S]*SPF 3 · Tower/);
  assert.match(await page.getByTestId("spf-tests").innerText(), /Velocity\s*\+ Test/);
});

test("a pass within 0.1 m/s is marginal; < is below the meter; + Door adds a door at a level", async () => {
  await page.getByRole("button", { name: "Level P1", exact: true }).click();
  // the pad: ⌫ top right, ▲ ▼ together, < beside 0
  assert.deepEqual(await page.locator(".np-key").allInnerTexts(), ["7", "8", "9", "⌫", "4", "5", "6", "▲", "1", "2", "3", "▼", ".", "0", "<", "Done ✓"]);
  await tap(["1", ".", "0", "5", "Done"]);
  assert.match(await page.locator('[data-i="0"]').innerText(), /P1[\s\S]*1\.05\s*Pass/);
  assert.match(await page.locator("body").innerText(), /1 of 3 · 1 marginal/);
  assert.equal(await page.getByRole("button", { name: "Level P1", exact: true }).evaluate((el) => getComputedStyle(el).color), "rgb(247, 201, 72)", "yellow");
  await page.getByRole("button", { name: "Add a door on level P2" }).click();
  await page.getByRole("button", { name: "Level P2 door B" }).click();
  await tap(["Below the meter", "0", ".", "2", "5"]);
  assert.equal((await page.getByTestId("spf-value").innerText()).replace(/\s+/g, ""), "<0.25m/s");
  await tap(["Done"]);
  assert.match(await page.locator('[data-i="1"]').innerText(), /P2[\s\S]*A\s*—[\s\S]*B\s*<0\.25\s*Fail/);
  assert.match(await page.locator("body").innerText(), /2 of 4 · 1 fail · 1 marginal/);
});

test("+ Run: what changed, then the same doors again beside the last run's", async () => {
  await page.getByRole("button", { name: "+ Run" }).click();
  await page.getByLabel("What changed").fill("P3 relief damper shut");
  await page.getByRole("button", { name: "Start run 2" }).click();
  await onRun(2);
  assert.match(await page.getByTestId("spf-runs").innerText(), /Run 1\s*Run 2\s*P3 relief damper shut\s*\+ Run/);
  // nothing read in this run yet: run 1's reading is beside the blank
  assert.match(await page.locator('[data-i="1"]').innerText(), /B\s*—\s*<0\.25/);
  await page.getByRole("button", { name: "Level P2 door B" }).click();
  await tap(["1", ".", "3", "Done"]);
  assert.match(await page.locator('[data-i="1"]').innerText(), /B\s*1\.3\s*<0\.25 ↑/);
  // the stair counts each door's latest reading
  assert.match(await page.locator("body").innerText(), /2 of 4 · 1 marginal/);
  // run 1 is still as it was
  await page.getByRole("button", { name: "Run 1", exact: true }).click();
  await onRun(1);
  assert.match(await page.locator('[data-i="1"]').innerText(), /B\s*<0\.25\s*Fail/);
  // another stair, from its card
  await page.getByTestId("spf-stairs").getByRole("button", { name: /SPF 2/ }).click();
  await page.getByText("Velocity · Stair 2").waitFor();
  assert.match(await page.locator("body").innerText(), /Velocity · Stair 2[\s\S]*0 of 3/);
});

test("the report: a page per group, a table per run with its stairs side by side", async () => {
  await page.getByRole("button", { name: "Back" }).click();
  await page.getByRole("button", { name: "Preview the report" }).click();
  const sheet = await page.getByTestId("spf-page").first().innerText();
  assert.match(sheet, /Stair pressurisation · General system testing\s*Basement/);
  const tables = await page.getByTestId("spf-page").first().getByTestId("spf-run-table").allInnerTexts();
  assert.equal(tables.length, 2);
  assert.match(tables[0], /Run 1 · \d\d:\d\d · As found · Average velocity m\/s \(min 1\)\s*Level\s*SPF 1 A\s*SPF 1 B\s*P1\s*1\.05\s*P2\s*<0\.25/);
  assert.match(tables[1], /Run 2 · \d\d:\d\d · P3 relief damper shut[\s\S]*P2\s*1\.3/);
  assert.equal(await page.getByTestId("spf-page").count(), 2, "Basement and Tower");
  assert.deepEqual(errors, []);
});

test("what's added can be taken away: a Yes / No answer, a door, a run, a test", async () => {
  await page.getByRole("button", { name: "Back" }).click();
  // Door closes & latches added to the test, an answer given and cleared again
  await page.getByRole("button", { name: "+ Add" }).nth(1).click();
  await page.getByRole("button", { name: /Door closes & latches/ }).first().click();
  await page.getByRole("button", { name: "Level P1", exact: true }).click();
  await tap(["Yes"]);
  assert.match(await page.getByTestId("spf-value").innerText(), /Yes/);
  await tap(["Clear"]);
  assert.match(await page.getByTestId("spf-value").innerText(), /Yes \/ No/);
  await tap(["Done"]);
  // the door added at P2: Remove door in the pad's heading, asked first as it has readings
  await page.getByRole("button", { name: "Level P2 door B" }).click();
  await page.getByRole("button", { name: "Remove door B" }).click();
  const dlg = page.getByText("Remove door B on P2?");
  await dlg.waitFor();
  await page.getByRole("button", { name: "Remove", exact: true }).click();
  await page.getByRole("button", { name: "Level P2", exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Level P2 door B" }).count(), 0);
  // (added back, for the setup screen below)
  await page.getByRole("button", { name: "Add a door on level P2" }).click();
  await page.getByRole("button", { name: "Level P2 door B" }).waitFor();
  // run 2: Delete run in its sheet
  await page.getByRole("button", { name: "P3 relief damper shut" }).click();
  await page.getByRole("button", { name: "Delete run 2" }).click();
  await page.getByText("Delete run 2?").waitFor();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await onRun(1);
  assert.match(await page.getByTestId("spf-runs").innerText(), /^Run 1\s*As found\s*\+ Run$/);
  // the test comes off the stair test again
  await page.getByRole("button", { name: "Back" }).click();
  await page.getByRole("button", { name: "Remove the Door closes & latches test" }).click();
  await page.getByText("Additional tests").waitFor();
  assert.equal(await page.getByRole("button", { name: "Remove the Door closes & latches test" }).count(), 0);
  assert.equal(await page.getByRole("button", { name: "Remove the Velocity test" }).count(), 0, "the last test stays");
  assert.deepEqual(errors, []);
});

test("Review level layout: groups that open, and P to B offers to change the rest", async () => {
  await go(page, app, "/site/g1/spf-system", 1200);
  assert.match(await page.locator("body").innerText(), /BASEMENT\s*2 stairs[\s\S]*TOWER\s*1 stair/i);
  // a big group starts closed, a small one open
  await page.locator('[data-stair="s3"]').click();
  await page.getByRole("button", { name: /Review level layout/ }).click();
  const list = page.getByTestId("level-list");
  assert.match(await list.innerText(), /^Levels\s*12 to G · 13 levels\s*▾$/);
  await list.locator('[data-group="Levels"]').click();
  assert.equal(await list.locator("[data-level]").count(), 13);
  await page.getByRole("button", { name: "Back" }).click();
  await page.getByRole("button", { name: "Close the stair" }).click();
  await page.locator('[data-stair="s1"]').click();
  // a door was added at P2 while testing
  assert.match(await page.locator('[data-stair="s1"]').innerText(), /4 doors[\s\S]*Added while testing: P2 \+1/);
  await page.getByRole("button", { name: /Review level layout/ }).click();
  assert.match(await list.innerText(), /Basement\s*P1 to P3 · 3 levels/);
  await list.locator('[data-level="P1"]').click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const edit = page.getByTestId("edit-level-pad");
  await edit.getByRole("button", { name: "Level type" }).click();
  await page.getByRole("option", { name: /^Basement/ }).click();
  await edit.getByRole("button", { name: "1", exact: true }).click();
  await edit.getByRole("button", { name: "Done" }).click();
  const dlg = page.getByRole("dialog", { name: "P1 is now B1" });
  assert.match(await dlg.innerText(), /Do you want to change the other basement levels to match\? P2 and P3 would become B2 and B3\./);
  await dlg.getByRole("button", { name: "Change all" }).click();
  assert.match(await list.innerText(), /Basement\s*B1 to B3 · 3 levels[\s\S]*B1[\s\S]*B2[\s\S]*B3/);
  // the readings went with the names: P1's velocity is now B1's
  await page.waitForTimeout(400);
  const keys = await page.evaluate(async () => {
    const req = indexedDB.open("inspecta");
    const idb = await new Promise((r) => (req.onsuccess = () => r(req.result)));
    const all = await new Promise((r) => {
      const q = idb.transaction("stairTests").objectStore("stairTests").getAll();
      q.onsuccess = () => r(q.result);
    });
    idb.close();
    return all.map((t) => [Object.keys(t.doors.s1 ?? {}).sort().join(","), t.doors.s1?.B1?.vel]);
  });
  assert.deepEqual(keys, [["B1", "1.05"]]);
  // a level with readings is asked about before it's removed (B1 is still picked)
  await page.getByRole("button", { name: "Remove", exact: true }).click();
  const ask = page.getByRole("dialog", { name: "Remove B1?" });
  assert.match(await ask.innerText(), /It has readings in a stair test/);
  await ask.getByRole("button", { name: "Keep it" }).click();
  assert.equal(await list.locator('[data-level="B1"]').count(), 1);
  // the door added at P2 is now at B2
  await page.getByRole("button", { name: /Looks right/ }).click();
  await page.locator('[data-stair="s1"]').click();
  assert.match(await page.locator('[data-stair="s1"]').innerText(), /Added while testing: B2 \+1/);
  assert.deepEqual(errors, []);
});
