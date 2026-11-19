// Admin in the Contractor app (lib/adminPin): the company chooses its own
// PIN the first time (EnFact's 2021 never works) and gets the admin tools.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startApp, openPage, go } from "./helpers.mjs";

let app;

before(async () => {
  app = await startApp(import.meta.url, { edition: "contractor" });
});

after(async () => {
  await app?.close();
});

const enterPin = async (page, digits) => {
  for (const d of digits) await page.click(`button[aria-label="${d}"]`);
  await page.waitForTimeout(300);
};

// a Contractor phone, its company set up, as given
async function contractorPhone(storage = {}) {
  const { page, errors } = await openPage(app);
  const company = { name: "Coastline Fire Services", logo: null, plate: false, logoColours: [], schemeId: "default", custom: { primary: "#071b2c", secondary: "#2ec4b6", light: "#f4f7f9" }, setUp: true };
  await page.evaluate(
    (s) => {
      for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v);
    },
    { "inspecta.company": JSON.stringify(company), ...storage },
  );
  return { page, errors };
}

test("a Contractor phone chooses its own PIN the first time", async () => {
  const { page, errors } = await contractorPhone();
  await go(page, app, "/admin", 600);
  assert.equal(await page.getByText("Enter admin PIN").count(), 0, "no PIN to enter yet");
  await page.getByText("Choose a new PIN").waitFor();
  assert.equal(await page.getByText("keeps the admin tools away from staff").count(), 1);
  await enterPin(page, "4826");
  await enterPin(page, "4826");
  await page.getByRole("button", { name: /Keywords/ }).waitFor();
  assert.equal(await page.getByRole("button", { name: /Share setup file/ }).count(), 1, "the company's admin tools are there");
  assert.equal(await page.getByRole("button", { name: /Change PIN/ }).count(), 1);
  assert.equal(await page.evaluate(() => localStorage.getItem("inspecta.adminPin")), "4826");

  // after a restart: their PIN, and EnFact's 2021 doesn't open it
  await page.reload();
  await go(page, app, "/admin", 600);
  await enterPin(page, "2021");
  assert.equal(await page.getByText("Wrong PIN").count(), 1);
  await enterPin(page, "4826");
  await page.getByRole("button", { name: /Keywords/ }).waitFor();
  assert.deepEqual(errors, []);
  await page.context().close();
});

test("a forgotten Contractor PIN is reset with the phone's recovery code", async () => {
  const { page } = await contractorPhone({ "inspecta.adminPin": "4826", "inspecta.adminRecovery": "K7QM-2XPA" });
  await go(page, app, "/admin", 600);
  await page.click("text=Forgot PIN?");
  await page.fill('input[aria-label="Recovery code"]', "K7QM-2XPA");
  await page.click('button:has-text("Continue")');
  await enterPin(page, "1357");
  await enterPin(page, "1357");
  await page.getByRole("button", { name: /Keywords/ }).waitFor();
  assert.equal(await page.evaluate(() => localStorage.getItem("inspecta.adminPin")), "1357");
  await page.context().close();
});
