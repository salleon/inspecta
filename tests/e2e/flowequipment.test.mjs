// Flow tests: the Equipment field suggests flow equipment from EnFact's flow
// charts as it's typed; picking one fills every reading's flow in from its
// " Hg (and the graph and result follow); typed flows are kept; past a
// device's limit the flow's orange with a note; equipment that isn't in the
// charts leaves the flows typed.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startApp, openPage, go, seed } from "./helpers.mjs";

let app;
let page;
let errors;

const r = (list) => list.map(([hg, dis]) => ({ hg: String(hg), flow: "", dis: String(dis), suc: "", rpm: "", amps: "" }));
const flows = () => page.locator('input[aria-label="Flow"]').evaluateAll((els) => els.map((e) => e.value));
const autos = () => page.locator('input[aria-label="Flow"]').evaluateAll((els) => els.map((e) => e.dataset.auto ?? ""));
const equipment = () => page.getByLabel("Equipment", { exact: true });

before(async () => {
  app = await startApp(import.meta.url);
  ({ page, errors } = await openPage(app));
  await seed(page, {
    sites: [{ id: "s1", name: "Coles Turramurra" }],
    flowTests: [
      {
        id: "t1", siteId: "s1", kind: "sprinkler", name: "Sprinkler", k: 0, testedAt: Date.now(), equipment: "", testedBy: "Wormald",
        sections: [{ name: "Town main", rows: r([[0, 460], [2, 250], [4, 240], [6, 205], [8, 180]]) }],
        demand: [{ flow: "1100", kpa: "200" }],
      },
    ],
  });
  await go(page, app, "/site/s1/flow/t1", 1500);
});

after(async () => {
  await app?.close();
});

test("typing equipment suggests matching flow equipment", async () => {
  await equipment().click();
  await equipment().pressSequentially("20t 80", { delay: 20 });
  const options = page.getByRole("option");
  assert.ok((await options.count()) >= 1);
  assert.match(await options.first().innerText(), /Ambit\s+20T DN80[\s\S]*Medium steel · 534 L\/min at 1" Hg · max 18" Hg/);
  assert.deepEqual(await flows(), ["", "", "", "", ""], "nothing fills in until one's picked");
});

test("picking one fills in each reading's flow from its \" Hg", async () => {
  await page.getByRole("option").first().click();
  assert.equal(await equipment().inputValue(), "Ambit 20T DN80 · Medium steel");
  assert.equal(await page.getByRole("listbox").count(), 0, "the list closes");
  await page.getByTestId("equipment-flows").waitFor();
  // 534.13 × √" Hg, as the chart
  assert.deepEqual(await flows(), ["0", "755", "1068", "1308", "1511"]);
  assert.deepEqual(await autos(), ["yes", "yes", "yes", "yes", "yes"]);
  assert.equal(await page.getByText(/no flow, so/).count(), 0, "every reading's on the graph");
  // a " Hg changed: its flow follows
  await page.locator('input[aria-label=\'" Hg\']').nth(4).fill("10");
  assert.equal((await flows())[4], "1689");
});

test("typing over a flow keeps it; left empty, the worked-out one comes back", async () => {
  const flow = page.locator('input[aria-label="Flow"]').nth(2);
  await flow.fill("760");
  await page.locator('input[aria-label=\'" Hg\']').nth(2).fill("4.5");
  assert.equal(await flow.inputValue(), "760", "typed: kept when its \" Hg changes");
  assert.equal((await autos())[2], "");
  await flow.fill("");
  assert.equal(await flow.inputValue(), "", "empty while it's being typed");
  await page.locator('input[aria-label=\'" Hg\']').nth(0).click(); // off it
  assert.equal(await flow.inputValue(), "1133", "the worked-out flow back (534.13 × √4.5)");
});

test("past the device's limit: orange, with a note to use the 21T", async () => {
  await page.locator('input[aria-label=\'" Hg\']').nth(4).fill("20");
  assert.equal((await autos())[4], "over");
  assert.match(await page.getByTestId("flow-over-limit").innerText(), /Over the 20T DN80's limit of 18" Hg[\s\S]*use the 21T/);
  await page.locator('input[aria-label=\'" Hg\']').nth(4).fill("8");
  assert.equal(await page.getByTestId("flow-over-limit").count(), 0);
});

test("kept: the flows are saved with the test", async () => {
  await page.waitForTimeout(1200); // saved a moment after the last change
  await go(page, app, "/site/s1/flow/t1", 1500);
  assert.equal(await equipment().inputValue(), "Ambit 20T DN80 · Medium steel");
  assert.deepEqual(await flows(), ["0", "755", "1133", "1308", "1511"]);
});

test("equipment that isn't in the flow charts: the worked-out flows go, typed ones stay", async () => {
  // a typed one first
  await page.locator('input[aria-label="Flow"]').nth(1).fill("800");
  await equipment().fill("65 mm / Pitot");
  assert.match(await page.getByRole("listbox").innerText(), /No flow chart for “65 mm \/ Pitot”/);
  await page.locator('input[aria-label=\'" Hg\']').nth(0).click(); // off it
  assert.deepEqual(await flows(), ["", "800", "", "", ""]);
  assert.equal(await page.getByText("Not in the flow charts: type the flows").count(), 1);
  assert.deepEqual(errors, []);
});
