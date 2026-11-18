// A flow test's defects (lib/testPhotos): a note or a photo from the
// Comments card, back to the same test, kept out of the site's own
// findings, on the page after the test in the export preview and PDF, a
// findings register sheet in the Excel, and deleted with the test.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ExcelJS from "exceljs";
import { startApp, openPage, go, download } from "./helpers.mjs";

let app;
let page;
let errors;

const rows = (list) => list.map(([hg, dis, flow]) => ({ hg: String(hg), flow: String(flow), dis: String(dis), suc: "", rpm: "", amps: "" }));

// the flow test's defects, from the database
const defects = () =>
  page.evaluate(async () => {
    const req = indexedDB.open("inspecta");
    const idb = await new Promise((r) => (req.onsuccess = () => r(req.result)));
    const all = await new Promise((r) => {
      const q = idb.transaction("findings").objectStore("findings").getAll();
      q.onsuccess = () => r(q.result);
    });
    idb.close();
    return all.filter((f) => f.flowTestId === "ft1").sort((a, b) => a.createdAt - b.createdAt);
  });

before(async () => {
  app = await startApp(import.meta.url, { args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] });
  ({ page, errors } = await openPage(app));
  await page.context().grantPermissions(["camera"]);
  await go(page, app, "/", 1500);
  await page.evaluate(async (sections) => {
    const req = indexedDB.open("inspecta");
    const idb = await new Promise((r) => (req.onsuccess = () => r(req.result)));
    const now = Date.now();
    const tx = idb.transaction(["sites", "flowTests"], "readwrite");
    tx.objectStore("sites").put({ id: "s1", name: "Harbour Point", address: "", kind: "afss", createdAt: now, updatedAt: now });
    tx.objectStore("flowTests").put({ id: "ft1", siteId: "s1", kind: "sprinkler", name: "Sprinkler", k: 0, testedAt: now, comment: "Town main below demand.", sections, demand: [{ flow: "1100", kpa: "270" }], order: 0, createdAt: now, updatedAt: now });
    await new Promise((r) => (tx.oncomplete = r));
    idb.close();
  }, [{ name: "Town main", rows: rows([[0, 460, 0], [4, 300, 860], [8, 180, 1210]]) }]);
  // as the app opening on it: the site's flow test moves into its flow job "s1-flow"
  await page.reload();
  await page.waitForTimeout(600);
});

after(async () => {
  await app?.close();
});

test("a note from the Comments card, back to the flow test", async () => {
  await go(page, app, "/site/s1-flow/flow/ft1", 1500);
  const row = page.getByTestId("flow-defects");
  assert.match(await row.innerText(), /Photos & defects\s*Note\s*Photo/i);
  await page.getByRole("button", { name: "Add a defect note" }).click();
  await page.waitForURL(/\/finding\/[^/?]+\/note\?flow=ft1/);
  assert.match(await page.locator("body").innerText(), /Photo or defect\s*Flow test · Defects/);
  assert.equal(await page.getByText("ESR category").count(), 0, "not in the site's report");
  await page.locator("#noteInput").fill("Main isolating valve not locked open");
  await page.locator("#locationInput").fill("Valve room");
  await page.getByRole("button", { name: "Back to the flow test", exact: true }).click();
  await page.waitForURL(/\/site\/s1-flow\/flow\/ft1$/);
  await page.getByTestId("flow-defects").filter({ hasText: "· 1" }).waitFor();
  const [note] = await defects();
  assert.equal(note.note, "Main isolating valve not locked open");
  assert.equal(note.location, "Valve room");
  assert.equal(note.stairTestId, undefined);
});

test("a photo, and back to where the page was scrolled", async () => {
  await go(page, app, "/site/s1-flow/flow/ft1", 1500);
  await page.getByRole("button", { name: "Take a defect photo" }).scrollIntoViewIfNeeded();
  const before = await page.evaluate(() => Math.max(...[...document.querySelectorAll("div")].map((d) => d.scrollTop)));
  await page.getByRole("button", { name: "Take a defect photo" }).click();
  await page.getByTestId("in-app-camera").waitFor();
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: "Take photo" }).click();
  await page.getByRole("button", { name: "Use ✓" }).click();
  await page.waitForURL(/\/finding\/[^/?]+\/note\?flow=ft1/);
  await page.locator("#noteInput").fill("Pump room door closer missing");
  await page.getByRole("button", { name: "Back to the flow test", exact: true }).click();
  await page.waitForURL(/\/site\/s1-flow\/flow\/ft1$/);
  await page.getByTestId("flow-defects").filter({ hasText: "· 2" }).waitFor();
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => Math.max(...[...document.querySelectorAll("div")].map((d) => d.scrollTop)));
  assert.ok(before > 0 && Math.abs(after - before) < 4, `scrolled back to ${before}, at ${after}`);
  assert.equal(await page.getByTestId("flow-defects").locator("img").count(), 1, "the photo's thumbnail");
  const all = await defects();
  assert.equal(all.length, 2);
});

test("kept out of the site's findings; on the page after the test in the preview", async () => {
  await go(page, app, "/site/s1/findings", 1500);
  assert.equal(await page.getByText("Pump room door closer missing").count(), 0, "not in the site's findings list");
  await go(page, app, "/site/s1-flow/flow-export", 2000);
  const defectsPage = page.getByTestId("flow-defects-page");
  await defectsPage.waitFor({ state: "attached" });
  const text = await defectsPage.innerText();
  assert.match(text, /Defects found during testing/);
  assert.match(text, /Main isolating valve not locked open\s*Valve room/);
  assert.match(text, /No photo/, "the note has no photo");
  assert.match(text, /Pump room door closer missing/);
  assert.match(await page.locator("body").innerText(), /page 1 of 2/);
});

test("the Excel: the test's sheet, then its defects as a findings register", async () => {
  await go(page, app, "/site/s1-flow/flow-export", 2000);
  const file = await download(page, () => page.click('button:has-text("Export Excel")'));
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(fs.readFileSync(file.path));
  assert.deepEqual(wb.worksheets.map((w) => w.name), ["Sprinkler", "Sprinkler defects"]);
  const ws = wb.worksheets[1];
  // the findings register's heading row, then a row each
  assert.match(String(ws.getCell(1, 2).value), /Location/i);
  assert.match(String(ws.getCell(1, 3).value), /Description/i);
  assert.equal(ws.getCell(2, 2).value, "Valve room");
  assert.equal(ws.getCell(2, 3).value, "Main isolating valve not locked open");
  assert.equal(ws.getCell(3, 3).value, "Pump room door closer missing");
  assert.equal(ws.getImages().length, 1, "the photo");
});

test("the PDF: the test, then its defects on the next page", async () => {
  await go(page, app, "/site/s1-flow/flow-export", 2000);
  const file = await download(page, () => page.click('button:has-text("Export PDF")'));
  const pdf = fs.readFileSync(file.path, "latin1");
  assert.equal((pdf.match(/\/Type \/Page\b/g) ?? []).length, 2);
  assert.match(pdf, /Defects found during testing/);
});

test("deleting the flow test deletes its defects", async () => {
  await go(page, app, "/site/s1-flow/flow/ft1", 1500);
  await page.getByRole("button", { name: "Delete flow test" }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.waitForURL(/tab=flow/);
  await page.waitForTimeout(300);
  assert.equal((await defects()).length, 0);
});

test("no errors", () => {
  assert.deepEqual(errors, []);
});
