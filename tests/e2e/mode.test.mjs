// The app's mode (lib/settings): a new phone starts in Contractor, a phone
// already in use stays EnFact, and naming a new phone doesn't change it.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startApp, openPage } from "./helpers.mjs";

let app;

before(async () => {
  app = await startApp(import.meta.url);
});

after(async () => {
  await app?.close();
});

const mode = (page) => page.evaluate(() => localStorage.getItem("inspecta.flowMode"));

test("a new phone starts in Contractor, and stays so once named", async () => {
  const context = await app.browser.newContext({ viewport: { width: 390, height: 844 } });
  const fresh = await context.newPage();
  await fresh.goto(app.url + "/");
  await fresh.waitForTimeout(500);
  assert.equal(await mode(fresh), "contractor");
  await fresh.evaluate(() => localStorage.setItem("inspecta.inspectorName", "New Starter"));
  await fresh.reload();
  await fresh.waitForTimeout(500);
  assert.equal(await mode(fresh), "contractor");
  await context.close();
});

test("a phone already in use (it has a name) stays EnFact", async () => {
  const { page } = await openPage(app);
  assert.equal(await mode(page), "enfact");
  await page.context().close();
});
