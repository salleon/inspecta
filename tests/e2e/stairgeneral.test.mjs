// General system testing (the Stair general system testing canvas): the test
// kinds by mode and in their order, velocities run against run, a door added
// at a level, a pass that's only just one in
// yellow, the report run by run, and in Review level layout the groups and
// the pop-up that changes the other car parks to basements.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startApp, openPage, go, seed } from "./helpers.mjs";

let app;
let page;
let errors;

const stair = (id, fan, from, to) => ({ id, name: "", from, to, extra: [], fan, reviewed: true });
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
        spf: { edition: "2015", type: "Zone", notes: "", stairs: [stair("s1", "SPF 1", "P3", "P1"), stair("s2", "SPF 2", "P3", "P1"), stair("s3", "SPF 3", "G", "12")] },
      },
    ],
  });
});

after(async () => {
  await app?.close();
});

test("the kinds: General first and picked, Commissioning last; Contractor adds the Three-monthly check; no Custom", async () => {
  await go(page, app, "/site/g1/spf/new", 1200);
  const kinds = async () => (await page.getByRole("radio").allInnerTexts()).map((t) => t.split("\n")[0].replace(/\s*Contractor$/, ""));
  assert.deepEqual(await kinds(), ["General system testing", "Annual Testing", "Commissioning"]);
  assert.equal(await page.getByRole("radio", { name: /General system testing/ }).getAttribute("aria-checked"), "true");
  await page.evaluate(() => localStorage.setItem("inspecta.flowMode", "contractor"));
  await go(page, app, "/site/g1/spf/new", 1200);
  assert.deepEqual(await kinds(), ["General system testing", "Annual Testing", "Three-monthly check", "Commissioning"]);
  await page.evaluate(() => localStorage.removeItem("inspecta.flowMode"));
  await go(page, app, "/site/g1/spf/new", 1200);
});

test("General system testing: any tests, none ticked to start; Start opens the overview", async () => {
  const general = page.getByRole("radio", { name: /General system testing/ });
  assert.match(await general.innerText(), /Velocity\s*Door force\s*Door closes & latches\s*Noise\s*Pressure restoration\s*Stair pressure, doors closed\s*Fan checks/);
  assert.equal(await general.locator('button[aria-pressed="true"]').count(), 0, "nothing ticked");
  assert.ok(await page.getByRole("button", { name: "Pick what you're testing" }).isDisabled());
  await general.getByRole("button", { name: "Velocity" }).click();
  await page.getByRole("button", { name: "Start · 1 test ›" }).click();
  // the overview first, then into its velocities
  await page.getByRole("button", { name: "Preview the report" }).waitFor();
  await page.getByRole("button", { name: /^\S+ Velocity/ }).click();
  await page.waitForURL(/\/spf\/[^/]+\/vel/);
  await page.getByTestId("spf-runs").waitFor();
  assert.match(await page.locator("body").innerText(), /General system testing\s*Velocity · SPF 1/);
  assert.match(await page.getByTestId("spf-stairs").innerText(), /SPF 1[\s\S]*SPF 2[\s\S]*SPF 3/);
  assert.match(await page.getByTestId("spf-tests").innerText(), /Velocity\s*\+ Test/);
});

test("a pass within 0.1 m/s is marginal; + Door adds a door at a level", async () => {
  await page.getByRole("button", { name: "Level P1", exact: true }).click();
  // the pad: ⌫ top right, ▲ ▼ together, < beside 0
  assert.deepEqual(await page.locator(".np-key").allInnerTexts(), ["7", "8", "9", "⌫", "4", "5", "6", "▲", "1", "2", "3", "▼", ".", "0", "Done ✓"]);
  await tap(["1", ".", "0", "5", "Done"]);
  assert.match(await page.locator('[data-i="0"]').innerText(), /P1[\s\S]*1\.05\s*Pass/);
  assert.match(await page.locator("body").innerText(), /1 of 3 · 1 marginal/);
  assert.equal(await page.getByRole("button", { name: "Level P1", exact: true }).evaluate((el) => getComputedStyle(el).color), "rgb(247, 201, 72)", "yellow");
  await page.getByRole("button", { name: "Add a door on level P2" }).click();
  await page.getByRole("button", { name: "Level P2 door B" }).click();
  await tap(["0", ".", "2"]);
  assert.equal((await page.getByTestId("spf-value").innerText()).replace(/\s+/g, ""), "0.2m/s");
  await tap(["Done"]);
  assert.match(await page.locator('[data-i="1"]').innerText(), /P2[\s\S]*A\s*—[\s\S]*B\s*0\.2\s*Fail/);
  assert.match(await page.locator("body").innerText(), /2 of 4 · 1 fail · 1 marginal/);
});

test("+ Run: what changed, then the same doors again beside the last run's", async () => {
  await page.getByRole("button", { name: "+ Run" }).click();
  await page.getByLabel("What changed").fill("P3 relief damper shut");
  await page.getByRole("button", { name: "Start run 2" }).click();
  await onRun(2);
  assert.match(await page.getByTestId("spf-runs").innerText(), /Run 1\s*Run 2\s*P3 relief damper shut\s*\+ Run/);
  // nothing read in this run yet: run 1's reading is beside the blank
  assert.match(await page.locator('[data-i="1"]').innerText(), /B\s*—\s*0\.2/);
  await page.getByRole("button", { name: "Level P2 door B" }).click();
  await tap(["1", ".", "3", "Done"]);
  assert.match(await page.locator('[data-i="1"]').innerText(), /B\s*1\.3\s*0\.2 ↑/);
  // the stair counts each door's latest reading
  assert.match(await page.locator("body").innerText(), /2 of 4 · 1 marginal/);
  // run 1 is still as it was
  await page.getByRole("button", { name: "Run 1", exact: true }).click();
  await onRun(1);
  assert.match(await page.locator('[data-i="1"]').innerText(), /B\s*0\.2\s*Fail/);
  // another stair, from its card
  await page.getByTestId("spf-stairs").getByRole("button", { name: /SPF 2/ }).click();
  await page.getByText("Velocity · SPF 2").waitFor();
  assert.match(await page.locator("body").innerText(), /Velocity · SPF 2[\s\S]*0 of 3/);
});

test("the report: a page per stair, its runs side by side, a dash where a door wasn't read", async () => {
  await page.getByRole("button", { name: "Back" }).click();
  await page.getByRole("button", { name: "Preview the report" }).click();
  // the stairs still on placeholder names: on with the suggestions
  await page.getByRole("button", { name: /Not now/ }).click();
  await page.getByTestId("spf-page").first().waitFor();
  assert.equal(await page.getByTestId("spf-page").count(), 6, "a page per stair, then a summary page per stair");
  assert.match(await page.getByTestId("spf-page").nth(3).innerText(), /General system testing · Summary\s*SPF 1 · Stair 1 · latest reading at each door[\s\S]*P2 B\s*\S+\s*1\.3/);
  const first = page.getByTestId("spf-page").first();
  assert.match(await first.innerText(), /Stair pressurisation · General system testing\s*SPF 1 · Stair 1/);
  const tables = await first.getByTestId("spf-run-table").allInnerTexts();
  assert.equal(tables.length, 1);
  assert.match(tables[0], /Average velocity m\/s \(min 1\), run by run\s*Level\s*Adjacent door open\s*Run 1\s*\d\d:\d\d\s*Run 2\s*\d\d:\d\d/);
  assert.match(tables[0], /P1\s*\S+\s*1\.05\s*–[\s\S]*P2 A\s*\S+\s*–\s*–[\s\S]*P2 B\s*\S+\s*0\.2\s*1\.3/);
  assert.match(await first.innerText(), /Runs\s*Run 1 · \d\d:\d\d · As found\s*Run 2 · \d\d:\d\d · P3 relief damper shut\s*– not read in that run/);
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
  // swiped left, Remove, asked first
  const swipeLeft = async (text) => {
    const box = await page.getByRole("button", { name: new RegExp(`^\\S+ ${text}`) }).boundingBox();
    await page.mouse.move(box.x + box.width - 30, box.y + box.height / 2);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) await page.mouse.move(box.x + box.width - 30 - i * 15, box.y + box.height / 2);
    await page.mouse.up();
  };
  await swipeLeft("Door closes & latches");
  await page.getByRole("button", { name: "Remove the Door closes & latches test" }).click();
  await page.getByText("Remove Door closes & latches?").waitFor();
  await page.getByRole("button", { name: "Remove", exact: true }).click();
  await page.getByText("Additional tests").waitFor();
  assert.equal(await page.getByRole("button", { name: /^\S+ Door closes & latches/ }).count(), 0);
  // the last test can't be swiped away (a plain row, no Remove behind it)
  assert.equal(await page.getByRole("button", { name: "Remove the Velocity test" }).count(), 0, "the last test stays");
  assert.deepEqual(errors, []);
});

test("many doors on a level: each keeps a usable width, and the row scrolls sideways", async () => {
  await page.getByRole("button", { name: /^\S+ Velocity/ }).click();
  await page.getByTestId("spf-stairs").getByRole("button", { name: /SPF 2/ }).click();
  await page.getByText("Velocity · SPF 2").waitFor();
  for (let i = 0; i < 5; i++) await page.getByRole("button", { name: "Add a door on level P1" }).click();
  const doors = page.getByRole("button", { name: /^Level P1 door / });
  assert.equal(await doors.count(), 6);
  const widths = await doors.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().width));
  assert.ok(widths.every((w) => w >= 72), `door widths ${widths.map(Math.round)}`);
  const row = await doors.first().evaluate((e) => ({ scroll: e.parentElement.scrollWidth, shown: e.parentElement.clientWidth }));
  assert.ok(row.scroll > row.shown, "more than fit: it scrolls");
  // typing into the last door brings it into view
  await doors.last().click();
  const inView = await doors.last().evaluate((e) => {
    const d = e.getBoundingClientRect();
    const r = e.parentElement.getBoundingClientRect();
    return d.right <= r.right + 1 && d.left >= r.left - 1;
  });
  assert.ok(inView);
  await tap(["Done"]);
});

test("the chin bar: swipe to the next stair and stay on the same level, keypad open", async () => {
  const chin = page.getByTestId("stair-chin");
  const swipe = async (dx) => {
    const box = await chin.boundingBox();
    const y = box.y + box.height / 2;
    await page.mouse.move(box.x + box.width / 2, y);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) await page.mouse.move(box.x + box.width / 2 + (dx * i) / 8, y);
    await page.mouse.up();
  };
  // from SPF 2 back to SPF 1: a swipe right
  await swipe(120);
  await page.getByText("Velocity · SPF 1").waitFor();
  await page.getByRole("button", { name: "Level P3", exact: true }).click();
  await page.getByTestId("spf-value").waitFor();
  // the bar rides on the keypad
  const [bar, pad] = await Promise.all([chin.boundingBox(), page.locator(".np").boundingBox()]);
  assert.ok(bar.y + bar.height <= pad.y, "above the keypad");
  // on to SPF 2: still on P3, keypad still open
  await swipe(-120);
  await page.getByText("Velocity · SPF 2").waitFor();
  assert.match(page.url(), /stair=s2/);
  await page.getByTestId("spf-value").waitFor();
  assert.match(await page.locator(".np").innerText(), /P3/);
  await tap(["Done"]);
});

test("Review level layout: groups that open, and P to B offers to change the rest", async () => {
  await go(page, app, "/site/g1/spf-system", 1200);
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
  // a level with readings is asked about before it's removed: swiped left, Remove
  {
    const box = await page.locator('[data-level="B1"]').boundingBox();
    const y = box.y + box.height / 2;
    await page.mouse.move(box.x + box.width - 30, y);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) await page.mouse.move(box.x + box.width - 30 - i * 15, y);
    await page.mouse.up();
  }
  await page.getByRole("button", { name: "Remove Basement 1" }).click();
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
