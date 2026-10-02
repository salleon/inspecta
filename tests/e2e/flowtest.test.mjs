// Flow tests (the Flow tests tab on a site): making one, the graph and
// result following the readings, and the site's Excel getting a tab per
// flow test in EnFact's template layout, with a real chart.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { startApp, openPage, go, seed, download, pressBack } from "./helpers.mjs";

let app;
let page;
let errors;

const rows = (list) => list.map(([hg, dis, suc = "", rpm = "", amps = "", flow = "", flowUnit]) => ({ hg: String(hg), flow: String(flow), flowUnit, dis: String(dis), suc: String(suc), rpm: String(rpm), amps: String(amps) }));
// flows are typed, never worked out from " Hg: these are what the inspector
// typed off each rig (k × √" Hg, in L/min)
const typedFlows = (k, list) => list.map((r) => (r.flow === "" && r.hg !== "" ? { ...r, flow: String(Math.round(k * Math.sqrt(+r.hg) * 10) / 10) } : r));
const day = (y, m, d) => new Date(y, m - 1, d, 12).getTime();

// Three sites, also used for the example exports (FLOW_EXAMPLES=<dir>
// saves each site's Excel there)
export const SITES = [
  { id: "s1", name: "Coles Turramurra", address: "1 Rohini St, Turramurra", kind: "afss" },
  { id: "s2", name: "Westfield Hornsby", address: "236 Pacific Hwy, Hornsby", kind: "afss" },
  { id: "s3", name: "Coles NDC", address: "10 Roberts Rd, Eastern Creek", kind: "afss" },
];
export const FLOW_TESTS = [
  // 1. the usual: town main (fails the second demand point) and the electric pump, diesel not tested
  {
    id: "t1", siteId: "s1", kind: "sprinkler", name: "Sprinkler", k: 534.15, testedAt: day(2026, 9, 30),
    equipment: "80 mm / 20T Ambient", testedBy: "Wormald", comment: "Town main below demand at 1350 L/min. Electric pump satisfactory.",
    sections: [
      { name: "Town main", rows: rows([[0, 460], [2, 250], [4, 240], [6, 205], [8, 180]]) },
      { name: "Electric pump", rows: rows([[0, 980, 120, 2950, 48], [2, 750, 110, 2940, 52], [4, 670, 100, 2930, 55], [6, 430, 95, 2920, 58], [8, 250, 90, 2910, 61]]).map((r, i) => ({ ...r, extra: [String(420 - i * 5)] })) },
      { name: "Diesel pump", rows: rows([[0, ""], [2, ""], [4, ""], [6, ""], [8, ""]]) },
    ],
    demand: [{ flow: "1100", kpa: "270" }, { flow: "1350", kpa: "240" }],
    extraCols: [{ name: "Oil pressure", unit: "kPa" }],
  },
  // 1b. hydrant on the same site: flows typed in L/s off the pitot
  {
    id: "t2", siteId: "s1", kind: "hydrant", name: "Hydrant", k: 0, testedAt: day(2026, 9, 30),
    equipment: "65 mm / Pitot", testedBy: "Wormald", comment: "Hydrant booster satisfactory.",
    sections: [
      { name: "Town main", rows: rows([["", 750, 300, "", "", 0, "sec"], ["", 700, 290, "", "", 2, "sec"], ["", 560, 280, "", "", 4.5, "sec"], ["", 420, 270, "", "", 6, "sec"]]) },
      { name: "Electric pump", rows: rows([["", ""]]) },
      { name: "Diesel pump", rows: rows([["", ""]]) },
    ],
    demand: [{ flow: "4.5", flowUnit: "sec", kpa: "275" }],
  },
  // 2. two diesels and a jockey pump: renamed and added supplies, four blocks
  {
    id: "t3", siteId: "s2", kind: "sprinkler", name: "Sprinkler · Zone B", k: 534.15, testedAt: day(2026, 10, 2),
    equipment: "100 mm / 20T", testedBy: "Chubb", comment: "All pumps satisfactory. Diesel 2 fuel tank at 60%.",
    sections: [
      { name: "Town main", rows: rows([[0, 520], [2, 380], [4, 330], [6, 260], [8, 190]]) },
      { name: "Diesel pump 1", rows: rows([[0, 1150, 30, 1920], [2, 1110, 30, 1926], [4, 1040, 20, 1923], [6, 970, 20, 1921], [8, 910, 10, 1917], [10, 830, 10, 1915]]) },
      { name: "Diesel pump 2", rows: rows([[0, 1140, 30, 1923], [2, 1090, 30, 1912], [4, 1040, 20, 1911], [6, 1000, 20, 1910], [8, 920, 10, 1908], [10, 850, 10, 1906]]) },
      { name: "Jockey pump", rows: rows([[0, 1200], [1, 1050], [2, 900]]) },
    ],
    demand: [{ flow: "900", kpa: "600" }, { flow: "1400", kpa: "450" }],
  },
  // 2b. a blank sheet for something that doesn't fit
  {
    id: "t4", siteId: "s2", kind: "blank", name: "Drencher valve test", testedAt: day(2026, 10, 2),
    columns: ["Valve", "Static (kPa)", "Residual (kPa)", "Time to open (s)", "Result"],
    cells: [["DV-1", "650", "480", "4", "Pass"], ["DV-2", "640", "455", "6", "Pass"], ["DV-3", "655", "300", "12", "Slow - service"]],
  },
  // 3. their Coles NDC combined system sheet
  {
    id: "t5", siteId: "s3", kind: "combined", name: "Combined system · Diesel 1 & 2", k: 3440.5, testedAt: day(2026, 9, 11),
    testedBy: "Chubb", comment: "PASS",
    sections: [
      { name: "Diesel 1", rows: rows([[0, 1150, 30, 1920], [5, 1110, 30, 1926], [10, 1040, 20, 1923], [15, 970, 20, 1921], [20, 910, 10, 1917]]) },
      { name: "Diesel 2", rows: rows([[0, 1150, 30, 1923], [5, 1090, 30, 1912], [10, 1040, 20, 1911], [15, 1000, 20, 1910], [20, 920, 10, 1908]]) },
    ],
    demand: [{ flow: "9970", kpa: "900" }, { flow: "14955", kpa: "585" }],
  },
];

for (const t of FLOW_TESTS) if (t.k) for (const sec of t.sections) sec.rows = typedFlows(t.k, sec.rows);

before(async () => {
  app = await startApp(import.meta.url);
  ({ page, errors } = await openPage(app));
  await seed(page, { sites: SITES, findings: SITES.map((s, i) => ({ id: `f${i}`, siteId: s.id, note: "Exit sign not illuminated", esrCategory: "3.1" })), flowTests: FLOW_TESTS });
});

after(async () => {
  await app?.close();
});

async function exportExcel(siteId) {
  await go(page, app, `/site/${siteId}/export`, 1500);
  const file = await download(page, async () => {
    await page.click("text=Share Excel");
    await page.waitForTimeout(600);
    if (await page.locator("text=Skip to export").count()) await page.click("text=Skip to export");
  });
  if (process.env.FLOW_EXAMPLES) fs.copyFileSync(file.path, path.join(process.env.FLOW_EXAMPLES, `${siteId} ${file.name}`));
  return fs.readFileSync(file.path);
}

test("the Flow tests tab lists the site's tests with their results", async () => {
  await go(page, app, "/site/s1/findings");
  await page.click("text=Flow tests");
  await page.waitForTimeout(500);
  assert.ok(page.url().endsWith("?tab=flow"));
  assert.equal(await page.locator("text=ALPHA TEST").count(), 0);
  // the town main is only a reference, so the line is the electric pump's
  assert.equal(await page.locator("text=Electric pump above all demand points").count(), 1);
  // the converter is hidden until it's switched on in Settings
  assert.equal(await page.locator("text=Converter tool").count(), 0);
  await go(page, app, "/");
  await page.click('[aria-label="Settings"]');
  await page.click('[role="switch"]:has-text("Converter tool")');
  assert.equal(await page.getAttribute('[role="switch"]:has-text("Converter tool")', "aria-checked"), "true");
  await go(page, app, "/site/s1/findings?tab=flow");
  assert.equal(await page.locator("text=Converter tool").count(), 1);
  await page.fill('[aria-label="Litres per second"]', "4.5");
  assert.equal(await page.inputValue('[aria-label="Litres per minute"]'), "270");
});

test("a new sprinkler test: flows are typed (never worked out from \" Hg), the result follows, and it's saved", async () => {
  await go(page, app, "/site/s1/findings?tab=flow");
  await page.click("text=+ New flow test");
  await page.click("text=Sprinkler >> nth=-1");
  await page.waitForTimeout(800);
  assert.match(page.url(), /\/site\/s1\/flow\//);
  // rows start empty: nothing suggested
  const hg = page.locator('[aria-label=\'" Hg\']');
  assert.equal(await hg.count(), 6);
  assert.deepEqual(await hg.evaluateAll((els) => els.map((e) => e.value)), ["", "", "", "", "", ""]);
  for (const [i, v] of ["0", "2", "4", "6", "8"].entries()) await hg.nth(i).fill(v);
  // nothing is worked out from " Hg (that depends on the rig): the flow is typed,
  // in its own L/min column beside " Hg (no flip)
  const flow = page.locator('[aria-label="Flow"]');
  assert.deepEqual(await flow.evaluateAll((els) => els.map((e) => e.value)), ["", "", "", "", "", ""]);
  for (const [i, v] of ["0", "755.4", "1068.3", "1308.4", "1510.8"].entries()) await flow.nth(i).fill(v);
  assert.equal(await flow.nth(1).inputValue(), "755.4");
  assert.equal(await page.locator('[aria-label^="Show flow in"]').count(), 0);
  const hgBox = await hg.nth(1).boundingBox();
  const flowBox = await page.locator('[aria-label="Flow"]').nth(1).boundingBox();
  assert.ok(flowBox.x > hgBox.x + hgBox.width - 1 && Math.abs(flowBox.y - hgBox.y) < 2, "side by side");
  assert.equal(await page.locator('[aria-label="Change flow unit"]').count(), 0, "no L/s for sprinklers");
  // an unnamed supply: no RPM or Amps
  assert.equal(await page.locator('[aria-label="RPM"], [aria-label="Amps"]').count(), 0);
  const dis = page.locator('[aria-label="Discharge"]');
  for (const [i, v] of ["600", "500", "420", "350", "300"].entries()) await dis.nth(i).fill(v);
  await page.fill('[aria-label="Demand flow"]', "1000");
  await page.fill('[aria-label="Demand pressure"]', "300");
  await page.waitForTimeout(300);
  assert.equal(await page.locator("text=Supply 1: Above all demand points").count(), 1);
  // name it from the tab's list, then a second of the same kind numbers both
  await page.click('[aria-label="Supply 1: change name"]');
  await page.click('[role="menuitem"]:has-text("Diesel pump")');
  await page.click('[aria-label="Add a supply"]');
  await page.click('[aria-label="Supply 2: change name"]');
  assert.equal(await page.getByText('"Diesel pump" becomes "Diesel pump 1"').count(), 1);
  await page.click('[role="menuitem"]:has-text("Diesel pump 2")');
  assert.equal(await page.locator('[aria-label="Diesel pump 1"]').count(), 1);
  // a third, custom-named
  await page.click('[aria-label="Add a supply"]');
  await page.click('[aria-label="Supply 3: change name"]');
  await page.click('[role="menuitem"]:has-text("Custom…")');
  await page.fill('[aria-label="Supply name"]', "Fire pump 3");
  await page.click('button:has-text("Use")');
  // removing asks first; the other diesel goes back to its plain name
  await page.click('[aria-label="Diesel pump 2"]');
  await page.click('[aria-label="Diesel pump 2: change name"]');
  await page.click('[role="menuitem"]:has-text("Remove this supply")');
  await page.click('button:has-text("Cancel")');
  assert.equal(await page.locator('[aria-label="Diesel pump 2: change name"]').count(), 1, "kept after Cancel");
  await page.click('[aria-label="Diesel pump 2: change name"]');
  await page.click('[role="menuitem"]:has-text("Remove this supply")');
  await page.click('button:has-text("Remove")');
  await page.waitForTimeout(700);
  await pressBack(page);
  await page.waitForTimeout(600);
  assert.ok(page.url().endsWith("/site/s1/findings?tab=flow"), page.url());
  assert.equal(await page.locator("text=Flow tests · 3").count(), 1);
  const saved = await page.evaluate(async () => {
    const req = indexedDB.open("inspecta");
    const idb = await new Promise((r) => (req.onsuccess = () => r(req.result)));
    const all = await new Promise((r) => {
      const q = idb.transaction("flowTests").objectStore("flowTests").getAll();
      q.onsuccess = () => r(q.result);
    });
    idb.close();
    return all.find((t) => !["t1", "t2", "t3", "t4", "t5"].includes(t.id));
  });
  assert.deepEqual(saved.sections.map((s) => s.name), ["Diesel pump", "Fire pump 3"]);
  // the " Hg typed; the last row left empty
  assert.deepEqual(saved.sections[0].rows.map((r) => r.hg), ["0", "2", "4", "6", "8", ""]);
  assert.deepEqual(saved.sections[0].rows.map((r) => r.dis), ["600", "500", "420", "350", "300", ""]);
});

test("a new hydrant test: flows in L/s, PASS / FAIL at the bottom, RPM for a diesel pump, no pass or fail for town main, full screen", async () => {
  await go(page, app, "/site/s1/findings?tab=flow");
  await page.click("text=+ New flow test");
  await page.click("text=Hydrant >> nth=-1");
  await page.waitForTimeout(800);
  const flow = page.locator('[aria-label="Flow"]');
  assert.deepEqual(await flow.evaluateAll((els) => els.map((e) => e.value)), ["", "", "", "", ""], "no prefilled flows");
  assert.equal(await page.locator('[aria-label=\'" Hg\']').count(), 0, "no \" Hg for hydrants");
  assert.equal(await page.getByText("+ Add reading", { exact: true }).count(), 1);
  for (const [i, v] of ["0", "5", "10"].entries()) await flow.nth(i).fill(v);
  const dis = page.locator('[aria-label="Discharge"]');
  for (const [i, v] of ["640", "585", "500"].entries()) await dis.nth(i).fill(v);
  await page.fill('[aria-label="Demand flow"]', "10");
  await page.fill('[aria-label="Demand pressure"]', "350");
  await page.waitForTimeout(300);
  assert.equal(await page.getByText("✓ PASS").count(), 1);
  await page.fill('[aria-label="Demand pressure"]', "550");
  await page.waitForTimeout(300);
  assert.equal(await page.getByText("✕ FAIL").count(), 1);
  // a diesel pump gets RPM, an electric pump Amps
  await page.click('[aria-label="Supply 1: change name"]');
  await page.click('[role="menuitem"]:has-text("Electric pump")');
  assert.equal(await page.locator('[aria-label="Amps"]').count(), 5);
  assert.equal(await page.locator('[aria-label="RPM"]').count(), 0);
  await page.click('[aria-label="Electric pump: change name"]');
  await page.click('[role="menuitem"]:has-text("Diesel pump")');
  assert.equal(await page.locator('[aria-label="RPM"]').count(), 5);
  assert.equal(await page.locator('[aria-label="Amps"]').count(), 0);
  // full screen, sideways, with the same columns; Done (or back) closes it.
  // Turned clockwise, its left side keeps clear of the phone's status bar
  // and its right side of the navigation buttons (as Capacitor reports them)
  await page.evaluate(() => {
    document.documentElement.style.setProperty("--safe-area-inset-top", "30px");
    document.documentElement.style.setProperty("--safe-area-inset-bottom", "48px");
  });
  await page.click('[aria-label="Full screen, sideways"]');
  await page.waitForTimeout(700);
  const wide = page.locator('[role="dialog"][aria-label="Readings, full screen"]');
  const pad = await wide.evaluate((e) => [getComputedStyle(e).paddingLeft, getComputedStyle(e).paddingRight]);
  assert.deepEqual(pad, ["46px", "64px"]);
  await page.evaluate(() => {
    document.documentElement.style.removeProperty("--safe-area-inset-top");
    document.documentElement.style.removeProperty("--safe-area-inset-bottom");
  });
  assert.equal(await wide.locator('[aria-label="RPM"]').count(), 5);
  assert.equal(await wide.locator('[aria-label="Amps"]').count(), 0);
  assert.equal(await wide.locator('[aria-label=\'" Hg\']').count(), 0);
  // the phone's keyboard stays shut: tapping a cell slides the app's own
  // number pad in from the right, and it types into that cell
  const keypad = wide.locator(".wide-pad");
  assert.equal(await keypad.evaluate((e) => e.classList.contains("off")), true, "no keypad until a cell is tapped");
  const rpm = wide.locator('[aria-label="RPM"]').first();
  assert.equal(await rpm.getAttribute("inputmode"), "none");
  // a touch on a cell goes to the table (so a drag scrolls it); a tap still picks the cell
  assert.equal(await rpm.evaluate((e) => getComputedStyle(e).pointerEvents), "none");
  await rpm.click({ force: true });
  await page.waitForTimeout(400);
  assert.equal(await rpm.evaluate((e) => e === document.activeElement), true, "the tap picked the cell under it");
  assert.equal(await keypad.evaluate((e) => e.classList.contains("off")), false, "tapping a cell brings the keypad in");
  for (const k of ["1", "9", "2", "2", "Backspace", "0"]) await keypad.locator(`[aria-label="${k}"]`).click();
  assert.equal(await rpm.inputValue(), "1920");
  // the first key after tapping a cell replaces what's there
  await rpm.click({ force: true });
  await wide.locator('[aria-label="Discharge"]').first().click({ force: true });
  await keypad.locator('[aria-label="7"]').click();
  assert.equal(await wide.locator('[aria-label="Discharge"]').first().inputValue(), "7");
  await keypad.locator('[aria-label="Backspace"]').click();
  // the screen turning while it's open: flat on a sideways screen, turned again upright
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(400);
  assert.equal(await wide.evaluate((e) => e.classList.contains("wide-flat")), true, "flat on a sideways screen");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  assert.equal(await wide.evaluate((e) => e.classList.contains("wide-turn")), true, "turned again upright");
  // back hides the keypad first, then closes the full screen
  await pressBack(page);
  await page.waitForTimeout(400);
  assert.equal(await keypad.evaluate((e) => e.classList.contains("off")), true, "back hid the keypad");
  assert.equal(await wide.count(), 1);
  // + Add reading is a row where the next reading goes; it opens the keypad on it
  await wide.locator('button:has-text("Add reading 6")').click();
  await page.waitForTimeout(400);
  assert.equal(await wide.locator('[aria-label="RPM"]').count(), 6);
  assert.equal(await keypad.evaluate((e) => e.classList.contains("off")), false);
  await wide.locator('button:has-text("Hide keypad")').click();
  await page.waitForTimeout(300);
  // each reading's ✕ asks first
  await wide.locator('[aria-label="Delete reading 6"]').click();
  const ask = wide.locator('[role="dialog"][aria-label="Delete reading"]');
  assert.match(await ask.innerText(), /Delete reading 6\?/);
  await ask.locator('button:has-text("Cancel")').click();
  assert.equal(await wide.locator('[aria-label="RPM"]').count(), 6);
  await wide.locator('[aria-label="Delete reading 6"]').click();
  await ask.locator('button:has-text("Delete")').click();
  assert.equal(await wide.locator('[aria-label="RPM"]').count(), 5);
  await pressBack(page);
  await page.waitForTimeout(600);
  assert.equal(await wide.count(), 0);
  assert.ok(page.url().includes("/flow/"), "back closed the full screen, not the test");
  assert.equal(await page.locator('[aria-label="RPM"]').first().inputValue(), "1920");
  // named Town main: graphed, never passed or failed
  await page.click('[aria-label="Diesel pump: change name"]');
  await page.click('[role="menuitem"]:has-text("Town main")');
  await page.waitForTimeout(300);
  assert.equal(await page.getByText("✕ FAIL").count(), 0);
  assert.equal(await page.getByText("✓ PASS").count(), 0);
  assert.equal(await page.getByText(/reference/i).count(), 0);
  // RPM already read stays showing
  assert.equal(await page.locator('[aria-label="RPM"]').count(), 5);
  // add a column in full screen: every row gets it; the upright view says it's there
  await page.click('[aria-label="Full screen, sideways"]');
  await page.waitForTimeout(700);
  await wide.locator('[aria-label="Add a column"]').click();
  // the box is upright, not turned with the readings, so the keyboard matches it
  const box = page.locator('[role="dialog"][aria-label="Add a column"]');
  assert.equal(await box.evaluate((e) => !!e.closest(".wide-turn")), false);
  await page.locator('button:has-text("Oil pressure (kPa)")').click();
  await box.locator('button:has-text("Add")').click();
  assert.equal(await wide.locator('[aria-label="Oil pressure"]').count(), 5);
  await wide.locator('[aria-label="Oil pressure"]').first().fill("420");
  await wide.locator('[aria-label="Edit column Oil pressure"]').click();
  await page.locator('[aria-label="Column name"]').fill("Oil press");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  assert.equal(await wide.locator('[aria-label="Oil press"]').first().inputValue(), "420");
  await wide.locator('button:has-text("Hide keypad")').click();
  await pressBack(page);
  await page.waitForTimeout(600);
  assert.equal(await page.getByText("Added columns (Oil press) are in full screen").count(), 1);
  // comments for the report
  await page.fill('[aria-label="Comments"]', "Booster pump satisfactory.");
  await page.waitForTimeout(600);
  const saved = await page.evaluate(async () => {
    const req = indexedDB.open("inspecta");
    const idb = await new Promise((r) => (req.onsuccess = () => r(req.result)));
    const all = await new Promise((r) => {
      const q = idb.transaction("flowTests").objectStore("flowTests").getAll();
      q.onsuccess = () => r(q.result);
    });
    idb.close();
    return all.find((t) => t.kind === "hydrant" && t.id !== "t2");
  });
  assert.deepEqual(saved.extraCols, [{ name: "Oil press", unit: "kPa" }]);
  assert.equal(saved.sections[0].rows[0].extra[0], "420");
  assert.equal(saved.comment, "Booster pump satisfactory.");
  // tidy up so the other tests see the site as before
  await page.click("text=Delete flow test");
  await page.click("button:has-text('Delete') >> nth=-1");
  await page.waitForTimeout(700);
});

test("EnFact mode (the default): always discharge and town main, no line options, three supply types plus custom", async () => {
  await go(page, app, "/site/s1/findings?tab=flow");
  await page.click("text=Sprinkler >> nth=0");
  await page.waitForTimeout(800);
  assert.equal(await page.locator('[stroke-dasharray="2 3"]').count(), 0, "no suction");
  assert.equal(await page.locator('polyline[stroke-dasharray="5 4"]').count(), 1, "town main shown");
  assert.equal(await page.locator('button[aria-pressed]').count(), 0, "no line chips");
  assert.equal(await page.locator('button:has-text("More")').count(), 0);
  await page.click('[aria-label$=": change name"]');
  const items = await page.locator('[role="menuitem"]').allInnerTexts();
  assert.ok(items.some((t) => /Electric pump/.test(t)) && items.some((t) => /Diesel pump/.test(t)) && items.some((t) => /Town main/.test(t)));
  assert.ok(!items.some((t) => /Booster|Jockey/.test(t)), items.join(" | "));
  assert.ok(items.some((t) => /Custom…|Rename…/.test(t)), "custom names kept");
  await pressBack(page);
});

test("the graph's line chips and More list (Contractor mode): suction off until ticked, kept with the test", async () => {
  await page.evaluate(() => localStorage.setItem("inspecta.flowMode", "contractor"));
  await go(page, app, "/site/s1/findings?tab=flow");
  await page.reload();
  await page.waitForTimeout(600);
  await page.click("text=Sprinkler >> nth=0");
  await page.waitForTimeout(800);
  const dotted = () => page.locator('[stroke-dasharray="2 3"]').count();
  const dashed = () => page.locator('polyline[stroke-dasharray="5 4"]').count();
  assert.equal(await dotted(), 0, "suction starts hidden");
  assert.equal(await dashed(), 1, "town main shown");
  await page.click('button[aria-pressed]:has-text("Suction")');
  assert.equal(await dotted(), 1, "the electric pump's suction");
  await page.click('button[aria-pressed]:has-text("Town main")');
  assert.equal(await dashed(), 0);
  // More: single lines, then Reset
  await page.click('button[aria-expanded]:has-text("More")');
  assert.equal(await page.locator('[role="menuitemcheckbox"]').count(), 3);
  await page.click('[role="menuitemcheckbox"]:has-text("Electric pump") >> nth=0');
  assert.equal(await page.locator("polyline[stroke-width]:not([stroke-dasharray])").count(), 0, "electric discharge hidden");
  await page.click('[role="menu"] button:has-text("Reset")');
  assert.equal(await dotted(), 0);
  assert.equal(await dashed(), 1);
  await page.click('[role="menuitemcheckbox"]:has-text("Electric pump") >> nth=1');
  await page.click('[role="menu"] button:has-text("Done")');
  await page.waitForTimeout(600);
  await pressBack(page);
  await page.waitForTimeout(500);
  await page.click("text=Sprinkler >> nth=0");
  await page.waitForTimeout(800);
  assert.equal(await dotted(), 1, "kept with the test");
  await pressBack(page);
  await page.waitForTimeout(500);
  await page.evaluate(() => localStorage.setItem("inspecta.flowMode", "enfact"));
});

test("deleting a flow test asks first", async () => {
  await go(page, app, "/site/s1/findings?tab=flow");
  await page.click("text=Sprinkler >> nth=-1");
  await page.waitForTimeout(700);
  await page.click("text=Delete flow test");
  await page.click("button:has-text('Delete') >> nth=-1");
  await page.waitForTimeout(700);
  assert.equal(await page.locator("text=Flow tests · 2").count(), 1);
});

test("the Excel gets a SPRINKLER and a HYDRANT tab in the template layout, with charts", async () => {
  const buf = await exportExcel("s1");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  assert.deepEqual(wb.worksheets.map((w) => w.name).slice(1), ["SPRINKLER", "HYDRANT"]);
  const s = wb.getWorksheet("SPRINKLER");
  assert.equal(s.getCell("C1").value, "SPRINKLER FLOW TEST RESULTS");
  assert.equal(s.getCell("F3").value, "Coles Turramurra, 1 Rohini St, Turramurra");
  assert.equal(s.getCell("F6").value, "Wormald");
  assert.equal(s.getCell("I6").value, 1350);
  // Town main block, then Electric pump; the untested diesel is left out
  assert.equal(s.getCell("C9").value, "Town main");
  assert.equal(s.getCell("D12").value, 755.4);
  // sprinklers in L/min
  assert.equal(s.getCell("D10").value, "Flow Rate (L/min)");
  assert.equal(s.getCell("I4").value, " (L/min)");
  assert.equal(s.getCell("F12").value, 250);
  // the town main gets no PASS or FAIL
  assert.equal(s.getCell("N12").value, "Conclusion:");
  assert.equal(s.getCell("N15").value, null);
  assert.equal(s.getCell("C21").value, "Electric pump");
  assert.equal(s.getCell("G23").value, 120);
  assert.equal(s.getCell("H23").value, 2950);
  assert.equal(s.getCell("I22").value, "Amps");
  // an added column goes after Amps, with its heading
  assert.equal(s.getCell("J22").value, "Oil pressure (kPa)");
  assert.equal(s.getCell("J23").value, 420);
  assert.equal(s.getCell("N26").value, "PASS");
  assert.notEqual(s.getCell("C33").value, "Diesel pump");
  const h = wb.getWorksheet("HYDRANT");
  assert.equal(h.getCell("B9").value, "Town main");
  // hydrants in L/s, as typed in the app
  assert.equal(h.getCell("B13").value, 4.5);
  assert.equal(h.getCell("B10").value, "Flow Rate (L/s)");
  assert.equal(h.getCell("H4").value, " (L/s)");
  assert.equal(h.getCell("H5").value, 4.5);

  const zip = await JSZip.loadAsync(buf);
  const charts = Object.keys(zip.files).filter((n) => /^xl\/charts\/chart\d+\.xml$/.test(n));
  assert.equal(charts.length, 2);
  const chart = await zip.file(charts[0]).async("string");
  assert.match(chart, /'SPRINKLER'!\$D\$11:\$D\$15/);
  assert.match(chart, /Electric pump - 2026/);
  assert.match(chart, /Flow \(L\/min\)/);
  assert.match(await zip.file(charts[1]).async("string"), /Flow \(L\/s\)/);
  assert.match(await zip.file("[Content_Types].xml").async("string"), /drawingml\.chart\+xml/);
  // desktop Excel needs <sheetPr>'s children in the schema's order
  // (tabColor, outlinePr, pageSetUpPr), or it blanks the sheet
  for (const n of Object.keys(zip.files).filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))) {
    const pr = /<sheetPr>(.*?)<\/sheetPr>/.exec(await zip.file(n).async("string"))?.[1] ?? "";
    const order = [...pr.matchAll(/<(tabColor|outlinePr|pageSetUpPr)\b/g)].map((m) => ["tabColor", "outlinePr", "pageSetUpPr"].indexOf(m[1]));
    assert.deepEqual(order, [...order].sort(), `${n}: ${pr}`);
  }
});

test("more supplies than the template has get their own blocks", async () => {
  const buf = await exportExcel("s2");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  assert.deepEqual(wb.worksheets.map((w) => w.name).slice(1), ["SPRINKLER", "Drencher valve test"]);
  const s = wb.getWorksheet("SPRINKLER");
  assert.deepEqual(["C9", "C21", "C33", "C45"].map((c) => s.getCell(c).value), ["Town main", "Diesel pump 1", "Diesel pump 2", "Jockey pump"]);
  assert.equal(wb.getWorksheet("Drencher valve test").getCell("C6").value, 300);
});

test("a combined system: pump duty with its own unit, Tank / Town main per pump; Contractor adds year installed, cut-in, temp and oil", async () => {
  await go(page, app, "/site/s3/flow/t5", 900);
  // the duty card: the first point is the pump duty; L/s to start, like hydrants
  assert.equal(await page.getByText("System pump duty").count(), 1);
  assert.equal(await page.getByText("Pump duty", { exact: true }).count(), 1);
  const unitIs = (u) => page.getAttribute(`[role="radiogroup"][aria-label="Pump duty unit"] [role="radio"]:has-text("${u}")`, "aria-checked");
  assert.equal(await unitIs("L/s"), "true");
  assert.equal(await page.inputValue('[aria-label="Demand flow"] >> nth=0'), "166.2");
  // switching the duty's unit switches the readings' flow too, nothing lost
  await page.click('[aria-label="Pump duty unit"] [role="radio"]:has-text("L/min")');
  assert.equal(await page.inputValue('[aria-label="Demand flow"] >> nth=0'), "9970");
  assert.equal(await page.inputValue('[aria-label="Flow"] >> nth=1'), "7693.2");
  assert.equal(await page.locator("text=Flow L/min").count() > 0, true);
  await page.click('[aria-label="Pump duty unit"] [role="radio"]:has-text("L/s")');
  assert.equal(await page.inputValue('[aria-label="Flow"] >> nth=1'), "128.2");
  // suction from tank (any test type); EnFact has no cut-in or year installed
  await page.click('[aria-label="Suction from"] [role="radio"]:has-text("Tank")');
  assert.equal(await page.locator('[aria-label="Cut-in kPa"]').count(), 0);
  assert.equal(await page.locator('[aria-label="Year installed"]').count(), 0);
  // Contractor: year installed, cut-in, and temp and oil pressure in full screen
  await page.waitForTimeout(600); // saved
  await page.evaluate(() => localStorage.setItem("inspecta.flowMode", "contractor"));
  await page.reload();
  await page.waitForTimeout(900);
  await page.fill('[aria-label="Year installed"]', "2006");
  await page.fill('[aria-label="Cut-in kPa"]', "790");
  await page.click('[aria-label="Full screen, sideways"]');
  await page.waitForTimeout(700);
  const wide = page.locator('[role="dialog"][aria-label="Readings, full screen"]');
  const heads = await wide.evaluate((d) => [...d.querySelectorAll("div")].filter((e) => e.children.length <= 1 && /^(" Hg|Flow|Discharge|Suction|RPM|Temp|Oil pressure)/.test(e.textContent.trim()) && e.closest("[style*=grid]") && !e.querySelector("input")).map((e) => /^(" Hg|Flow|Discharge|Suction|RPM|Temp|Oil)/.exec(e.textContent.trim())[1]));
  assert.deepEqual([...new Set(heads)].slice(0, 7), ['" Hg', "Flow", "Discharge", "Suction", "RPM", "Temp", "Oil"]);
  await wide.locator('[aria-label="Temp"]').first().fill("52");
  await wide.locator('[aria-label="Oil pressure"]').first().fill("300");
  await pressBack(page);
  await page.waitForTimeout(700);
  await page.evaluate(() => localStorage.setItem("inspecta.flowMode", "enfact"));
});

test("a combined system goes on a Combined System tab like their sheet", async () => {
  const buf = await exportExcel("s3");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const s = wb.getWorksheet("Combined System");
  assert.equal(s.getCell("C1").value, "COMBINED SYSTEM FLOW TEST RESULTS");
  // headed with where its suction comes from, and its cut-in
  assert.equal(s.getCell("C9").value, "Diesel 1 - TANK (cut-in 790 kPa)");
  assert.equal(s.getCell("J10").value, "Temp (°C)");
  assert.equal(s.getCell("J11").value, 52);
  assert.equal(s.getCell("K10").value, "Oil pressure (kPa)");
  assert.match(String(s.getCell("F5").value ?? ""), /installed 2006/);
  // combined systems in L/s, like hydrants (5" Hg × 3440.5 = 7693.2 L/min)
  assert.equal(s.getCell("D12").value, 128.22);
  assert.equal(s.getCell("D10").value, "Flow Rate (L/s)");
  assert.equal(s.getCell("C21").value, "Diesel 2");
  assert.equal(s.getCell("N14").value, "PASS");
  assert.equal(s.getCell("N26").value, "PASS");
  assert.deepEqual(errors, []);
});

test("Save & close, above Delete flow test, saves and goes back to the flow tests list", async () => {
  await go(page, app, "/site/s2/flow/t3", 1500);
  const buttons = await page.evaluate(() => [...document.querySelectorAll("button")].map((b) => b.textContent.trim()).filter((t) => t === "Save & close" || t === "Delete flow test"));
  assert.deepEqual(buttons, ["Save & close", "Delete flow test"]);
  // the Comments box can't be dragged smaller than about three lines
  const box = page.locator('[aria-label="Comments"]');
  await box.evaluate((e) => (e.style.height = "4px"));
  assert.ok((await box.boundingBox()).height >= 84, "kept big enough to open again");
  await page.fill('[aria-label="Comments"]', "Saved with Save & close");
  await page.click('button:has-text("Save & close")');
  await page.waitForTimeout(600);
  assert.ok(page.url().endsWith("/site/s2/findings?tab=flow"), page.url());
  const comment = await page.evaluate(async () => {
    const req = indexedDB.open("inspecta");
    const idb = await new Promise((r) => (req.onsuccess = () => r(req.result)));
    const t = await new Promise((r) => {
      const q = idb.transaction("flowTests").objectStore("flowTests").get("t3");
      q.onsuccess = () => r(q.result);
    });
    idb.close();
    return t.comment;
  });
  assert.equal(comment, "Saved with Save & close");
});

test("readings are saved straight away, and ones without a flow say why they're not on the graph", async () => {
  await go(page, app, "/site/s2/flow/t3", 1500);
  const dis = page.locator('[aria-label="Discharge"]').first();
  await dis.fill("777");
  // the app closed straight after typing (no back, no Save & close)
  await page.waitForTimeout(150);
  await page.reload();
  await page.waitForTimeout(1500);
  assert.equal(await page.locator('[aria-label="Discharge"]').first().inputValue(), "777");
  // a reading with a pressure but no flow can't be graphed: the note says so
  assert.equal(await page.getByText(/no flow, so/).count(), 0);
  await page.locator('[aria-label="Flow"]').first().fill("");
  await page.waitForTimeout(150);
  assert.match(await page.getByText(/no flow, so it isn't on the graph/).innerText(), /Type the flow for each reading/);
});

test("an AFSS site's Flow tests tab: Export Flow Tests Only opens the flow test export (a sheet per test, no findings)", async () => {
  await go(page, app, "/site/s1/findings?tab=flow", 1200);
  await page.click('button:has-text("Export Flow Tests Only")');
  await page.waitForTimeout(1500);
  assert.ok(page.url().endsWith("/site/s1/flow-export"), page.url());
  const file = await download(page, () => page.click('button:has-text("Export Excel")'));
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(fs.readFileSync(file.path));
  const names = wb.worksheets.map((w) => w.name);
  assert.ok(names.length >= 1 && !names.some((n) => /finding/i.test(n)), names.join(", "));
  // back goes to the Flow tests tab
  await pressBack(page);
  assert.ok(page.url().endsWith("/site/s1/findings?tab=flow"), page.url());
});
