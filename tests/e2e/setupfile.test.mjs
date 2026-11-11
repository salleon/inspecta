// The company setup file (lib/setupFile): shared from Admin, loaded on a
// new phone with Join a company. It carries the mode, company, keyword
// changes and the PIN (as a salted fingerprint), and asks for the PIN.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startApp, openPage, go, download } from "./helpers.mjs";

let app;
const KEYWORDS = { "4.1": { added: [{ text: "spit fire", kind: "" }], removed: [] } };

before(async () => {
  app = await startApp(import.meta.url);
});

after(async () => {
  await app?.close();
});

const enterPin = async (page, digits) => {
  for (const d of digits) await page.click(`button[aria-label="${d}"]`);
  await page.waitForTimeout(300);
};

// a phone already set up (as given), sharing its setup file from Admin
async function shareFrom(storage) {
  const { page } = await openPage(app);
  await page.evaluate((s) => {
    for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v);
  }, storage);
  await page.reload(); // so the app reads them afresh
  await go(page, app, "/admin", 600);
  await enterPin(page, storage["inspecta.adminPin"]);
  const file = await download(page, () => page.getByRole("button", { name: /Share setup file/ }).click());
  // kept past the page closing (Playwright deletes its downloads)
  const path = join(await mkdtemp(join(tmpdir(), "setup-")), file.name);
  await writeFile(path, await readFile(file.path));
  await page.context().close();
  return { name: file.name, path };
}

// a brand new phone, joining with the file
async function freshPhone() {
  const context = await app.browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addInitScript(() => localStorage.setItem("inspecta.tourOffered", "1"));
  const page = await context.newPage();
  await page.goto(app.url + "/");
  await page.waitForTimeout(2300);
  return page;
}

let enfactFile;
let fileKeywords;

test("Admin shares a setup file with the mode, keywords and a PIN fingerprint (not the PIN)", async () => {
  enfactFile = await shareFrom({ "inspecta.flowMode": "enfact", "inspecta.adminPin": "4321", "inspecta.esrKeywordEdits": JSON.stringify(KEYWORDS) });
  assert.match(enfactFile.name, /^EnFact setup\.inspecta$/);
  const text = (await readFile(enfactFile.path)).toString();
  const body = JSON.parse(text);
  assert.equal(body.type, "inspecta-setup");
  assert.equal(body.mode, "enfact");
  assert.match(JSON.stringify(body.keywords), /spit fire/);
  fileKeywords = body.keywords;
  assert.ok(!text.includes("4321"), "the PIN itself isn't in the file");
});

test("a new phone joins with the file: wrong PIN refused, right PIN sets it up as EnFact", async () => {
  const page = await freshPhone();
  await page.setInputFiles('input[aria-label="Setup file"]', enfactFile.path);
  await page.getByText("EnFact setup").waitFor();
  await enterPin(page, "2021");
  assert.equal(await page.getByText("Wrong PIN").count(), 1);
  await enterPin(page, "4321");
  await page.waitForTimeout(500);
  const stored = await page.evaluate(() => ({ mode: localStorage.getItem("inspecta.flowMode"), pin: localStorage.getItem("inspecta.adminPin"), kw: JSON.parse(localStorage.getItem("inspecta.esrKeywordEdits") || "{}") }));
  assert.equal(stored.mode, "enfact");
  assert.equal(stored.pin, "4321", "the office PIN comes across");
  assert.deepEqual(stored.kw, fileKeywords);
  // straight on to the name prompt, in EnFact's colours
  assert.equal(await page.locator('img[alt="EnFact"]').count(), 1);
  await page.context().close();
});

test("a contractor file brings the company's name, logo and colours", async () => {
  const company = { name: "Coastline Fire Services", logo: null, plate: false, logoColours: [], schemeId: "firetruck", custom: { primary: "#071b2c", secondary: "#2ec4b6", light: "#f4f7f9" }, setUp: true };
  const file = await shareFrom({ "inspecta.flowMode": "contractor", "inspecta.adminPin": "1111", "inspecta.company": JSON.stringify(company) });
  assert.match(file.name, /^Coastline Fire Services setup\.inspecta$/);
  const page = await freshPhone();
  await page.setInputFiles('input[aria-label="Setup file"]', file.path);
  await page.getByText("Coastline Fire Services setup").waitFor();
  await enterPin(page, "1111");
  await page.waitForTimeout(500);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("inspecta.company")).name), "Coastline Fire Services");
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("inspecta.company")).schemeId), "firetruck");
  assert.equal(await page.getByRole("button", { name: "Set up your company" }).count(), 0, "no setup screens needed");
  await page.context().close();
});

test("any other file is turned away", async () => {
  const page = await freshPhone();
  await page.setInputFiles('input[aria-label="Setup file"]', { name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") });
  await page.getByText("That isn't an Inspecta setup file.").waitFor();
  assert.equal(await page.evaluate(() => localStorage.getItem("inspecta.flowMode")), "contractor");
  await page.context().close();
});
