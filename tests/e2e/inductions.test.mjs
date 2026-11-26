// Settings → Site inductions: groups (with a shared code, or a code on its
// own), sites using the group's code or their own, Copy, due dates that
// change colour, and every backup carrying them so a restore brings them back.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { startApp, openPage, go, seed, download } from "./helpers.mjs";

let app;
let page;
let errors;

const zipText = (path, name) => execFileSync("python3", ["-I", "-c", "import sys,zipfile\nsys.stdout.write(zipfile.ZipFile(sys.argv[1]).read(sys.argv[2]).decode())", path, name]).toString();

const day = (offset) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const store = (name) =>
  page.evaluate(async (name) => {
    const req = indexedDB.open("inspecta");
    const idb = await new Promise((r) => (req.onsuccess = () => r(req.result)));
    const all = await new Promise((r) => (idb.transaction(name).objectStore(name).getAll().onsuccess = (e) => r(e.target.result)));
    idb.close();
    return all;
  }, name);

const sheet = () => page.locator("form.sheet-panel");

before(async () => {
  app = await startApp(import.meta.url);
  ({ page, errors } = await openPage(app));
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await seed(page, { sites: [{ id: "s1", name: "Harbour Tower" }] });
});

after(async () => {
  await app?.close();
});

test("Settings has Site inductions under You", async () => {
  await go(page, app, "/settings");
  assert.equal(await page.getByTestId("inductions-hint").innerText(), "None yet");
  await page.getByRole("button", { name: /Site inductions/ }).click();
  await page.getByText("No inductions yet").waitFor();
  assert.match(page.url(), /#\/settings\/inductions$/);
});

test("a group can stand on its own, with just its code", async () => {
  await page.getByRole("button", { name: "Add" }).click();
  await sheet().getByRole("button", { name: "Group", exact: true }).click();
  await sheet().getByPlaceholder("e.g. Mirvac").fill("Mirvac");
  await sheet().getByPlaceholder("e.g. MIR-883120").fill("MIR-40213");
  await sheet().getByLabel("Expires").fill(day(75));
  await sheet().getByRole("button", { name: "Save" }).click();
  const g = page.getByTestId("ind-group");
  await g.waitFor();
  assert.equal(await g.getByTestId("code").innerText(), "MIR-40213");
  assert.equal(await g.getByTestId("due").getAttribute("data-stage"), "far");
  // nothing to collapse
  assert.equal(await g.locator("[aria-expanded]").count(), 0);
  const [group] = await store("inductionGroups");
  assert.equal(group.name, "Mirvac");
  assert.equal(group.expires, day(75));
});

test("a site in a group uses the group's code, or its own", async () => {
  // uses Mirvac's code (on by default)
  await page.getByRole("button", { name: "Add" }).click();
  await sheet().getByPlaceholder("e.g. Barangaroo Tower 2").fill("Harold Park");
  await sheet().getByRole("button", { name: "Mirvac" }).click();
  assert.equal(await sheet().getByRole("switch", { name: /Use Mirvac's code/ }).getAttribute("aria-checked"), "true");
  assert.equal(await sheet().getByPlaceholder("e.g. MIR-883120").count(), 0);
  await sheet().getByRole("button", { name: "Save" }).click();
  await page.getByText("Group code", { exact: true }).waitFor();

  // its own code, due in 5 days
  await page.getByRole("button", { name: "Add" }).click();
  await sheet().getByPlaceholder("e.g. Barangaroo Tower 2").fill("200 George St");
  await sheet().getByRole("button", { name: "Mirvac" }).click();
  await sheet().getByRole("switch", { name: /Use Mirvac's code/ }).click();
  await sheet().getByPlaceholder("e.g. MIR-883120").fill("MIR-772041");
  await sheet().getByLabel("Expires").fill(day(5));
  await sheet().getByRole("button", { name: "Save" }).click();
  await page.getByText("Own code").waitFor();
  const g = page.getByTestId("ind-group");
  assert.deepEqual(await g.getByTestId("code").allInnerTexts(), ["MIR-40213", "MIR-772041"]);
  assert.deepEqual(await g.getByTestId("due").evaluateAll((els) => els.map((e) => e.dataset.stage)), ["far", "7"]);
  // collapses to just the group's code
  await g.locator("[aria-expanded]").click();
  assert.equal(await g.getByTestId("ind-site").count(), 0);
  await g.locator("[aria-expanded]").click();
  assert.equal(await g.getByTestId("ind-site").count(), 2);
  const sites = await store("inductions");
  assert.deepEqual(sites.map((s) => [s.name, s.useGroup, s.code]).sort(), [["200 George St", false, "MIR-772041"], ["Harold Park", true, ""]]);
});

test("a site in no group, already expired, goes red", async () => {
  await page.getByRole("button", { name: "Add" }).click();
  await sheet().getByPlaceholder("e.g. Barangaroo Tower 2").fill("RPA Hospital");
  await sheet().getByPlaceholder("e.g. MIR-883120").fill("SLHD-0937");
  await sheet().getByLabel("Expires").fill(day(-3));
  await sheet().getByRole("button", { name: "Save" }).click();
  await page.getByText("No group", { exact: true }).waitFor();
  const card = page.getByTestId("ind-site").filter({ hasText: "RPA Hospital" });
  assert.equal(await card.getByTestId("due").innerText(), "Expired 3 days ago");
  assert.equal(await card.getByTestId("due").getAttribute("data-stage"), "gone");
});

test("Copy puts the code on the clipboard", async () => {
  await page.getByRole("button", { name: "Copy MIR-40213" }).click();
  await page.getByRole("status").filter({ hasText: "Copied MIR-40213" }).waitFor();
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), "MIR-40213");
  assert.equal(await page.getByRole("button", { name: "Copy MIR-40213" }).innerText(), "Copied");
});

test("search finds a group by name or code, and a site by name", async () => {
  await page.getByLabel("Search").fill("mir-4");
  assert.equal(await page.getByTestId("ind-group").count(), 1);
  assert.equal(await page.getByText("RPA Hospital").count(), 0);
  await page.getByLabel("Search").fill("rpa");
  assert.equal(await page.getByTestId("ind-group").count(), 0);
  assert.equal(await page.getByText("RPA Hospital").count(), 1);
  await page.getByLabel("Search").fill("");
});

test("Settings shows the count and what's expired", async () => {
  await go(page, app, "/settings");
  assert.equal(await page.getByTestId("inductions-hint").innerText(), "3 inductions · 1 expired");
});

test("every backup carries the inductions; restoring brings them back", async () => {
  const groups = await store("inductionGroups");
  const sites = await store("inductions");
  await go(page, app, "/settings/backup");
  const file = await download(page, () => page.getByRole("button", { name: "Back up 1 site" }).click());
  const json = JSON.parse(zipText(file.path, "inductions.json"));
  assert.equal(json.type, "inspecta-inductions");
  assert.deepEqual(json.groups.map((g) => g.code), ["MIR-40213"]);
  assert.equal(json.sites.length, 3);

  // gone from the phone, then restored
  await page.evaluate(async () => {
    const req = indexedDB.open("inspecta");
    const idb = await new Promise((r) => (req.onsuccess = () => r(req.result)));
    const tx = idb.transaction(["inductions", "inductionGroups"], "readwrite");
    tx.objectStore("inductions").clear();
    tx.objectStore("inductionGroups").clear();
    await new Promise((r) => (tx.oncomplete = r));
    idb.close();
  });
  await go(page, app, "/settings");
  assert.equal(await page.getByTestId("inductions-hint").innerText(), "None yet");
  await page.setInputFiles('input[type=file][accept*=".zip"]', file.path);
  await page.waitForTimeout(500);
  assert.match(await page.locator("text=Your site inductions are merged in.").innerText(), /merged in/);
  await page.getByRole("button", { name: "Restore", exact: true }).click();
  await page.getByText("Restore finished").waitFor();
  assert.match(await page.locator("text=brought in").innerText(), /4 site inductions brought in\./);
  await page.getByRole("button", { name: "OK", exact: true }).click();
  // (as JSON: a field left empty is the same whether written as undefined or not at all)
  const sortById = (a) => JSON.parse(JSON.stringify([...a].sort((x, y) => x.id.localeCompare(y.id))));
  assert.deepEqual(sortById(await store("inductionGroups")), sortById(groups));
  assert.deepEqual(sortById(await store("inductions")), sortById(sites));
  await go(page, app, "/settings");
  assert.equal(await page.getByTestId("inductions-hint").innerText(), "3 inductions · 1 expired");
});

test("deleting a group keeps its sites, with its code", async () => {
  await go(page, app, "/settings/inductions");
  await page.getByTestId("ind-group").getByRole("button", { name: "Edit" }).click();
  await sheet().getByRole("button", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).last().click();
  await page.getByText("Group deleted, its sites kept").waitFor();
  assert.equal(await page.getByTestId("ind-group").count(), 0);
  const harold = (await store("inductions")).find((s) => s.name === "Harold Park");
  assert.equal(harold.code, "MIR-40213");
  assert.equal(harold.groupId, undefined);
  assert.deepEqual(errors, []);
});
