// Test jobs attached to sites (db testJobs): a flow job's Attach to site
// chip, searched by name; the site's Other tests show it; home leaves it out
// of the whole list but its chip or a search shows it with the link; Detach
// puts it back; deleting the site leaves the job stand-alone.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startApp, openPage, go, seed } from "./helpers.mjs";

let app;
let page;
let errors;

before(async () => {
  app = await startApp(import.meta.url);
  ({ page, errors } = await openPage(app));
  await go(page, app, "/", 1500);
  await seed(page, {
    sites: [
      { id: "a1", name: "155 Kent St", kind: "afss" },
      { id: "a2", name: "Riverside Plaza", kind: "project" },
      { id: "j1", name: "Pump room", kind: "flow" },
    ],
    flowTests: [{ id: "t1", siteId: "j1", kind: "sprinkler", name: "Sprinkler" }],
  });
});

after(async () => {
  await app?.close();
});

const jobOf = (id) =>
  page.evaluate(async (id) => {
    const req = indexedDB.open("inspecta");
    const idb = await new Promise((r) => (req.onsuccess = () => r(req.result)));
    const site = await new Promise((r) => (idb.transaction("sites").objectStore("sites").get(id).onsuccess = (e) => r(e.target.result)));
    idb.close();
    return site;
  }, id);

test("Attach to site: search, pick, and the site shows the job", async () => {
  await go(page, app, "/site/j1/findings", 1200);
  const chip = page.getByTestId("attach-chip");
  assert.equal(await chip.innerText(), "Attach to site");
  await chip.click();
  // AFSS and project sites only, narrowed by the search
  const panel = page.locator(".sheet-panel");
  assert.match(await panel.innerText(), /155 Kent St[\s\S]*Riverside Plaza|Riverside Plaza[\s\S]*155 Kent St/);
  assert.doesNotMatch(await panel.innerText(), /Pump room/);
  await page.getByPlaceholder("Search sites").fill("kent");
  assert.doesNotMatch(await panel.innerText(), /Riverside Plaza/);
  await page.getByRole("button", { name: /155 Kent St/ }).click();
  await chip.filter({ hasText: "155 Kent St" }).waitFor();
  assert.equal((await jobOf("j1")).attachedTo, "a1");
  // the site's Other tests: the job, opening it
  await go(page, app, "/site/a1/findings?tab=flow", 1200);
  await page.getByRole("button", { name: /Other tests · 1/ }).waitFor();
  await page.getByRole("button", { name: /Flow testing/ }).click();
  await page.waitForURL(/\/site\/j1\/findings/);
});

test("home: an attached job is left out of the whole list; its chip or a search shows it, with its site", async () => {
  await go(page, app, "/", 1200);
  const row = page.locator('[data-site-id="j1"]');
  await page.locator('[data-site-id="a1"]').waitFor();
  assert.equal(await row.count(), 0, "reached through its site");
  // the Flow chip shows every flow job, attached or not
  const flow = page.locator('[role="group"][aria-label="Show job types"] button:has-text("Flow")');
  await flow.click();
  assert.match(await row.innerText(), /Pump room[\s\S]*155 Kent St/);
  await flow.click();
  assert.equal(await row.count(), 0);
  // a search finds it too
  await page.fill('input[placeholder="Search sites"]', "pump");
  assert.match(await row.innerText(), /Pump room[\s\S]*155 Kent St/);
  await page.fill('input[placeholder="Search sites"]', "");
  assert.equal(await row.count(), 0);
});

test("Detach: stand-alone again", async () => {
  await go(page, app, "/site/j1/findings", 1200);
  await page.getByTestId("attach-chip").click();
  await page.getByRole("button", { name: "Detach" }).click();
  await page.getByTestId("attach-chip").filter({ hasText: "Attach to site" }).waitFor();
  assert.equal((await jobOf("j1")).attachedTo, undefined);
  // stand-alone again: back in the whole list on home
  await go(page, app, "/", 1200);
  await page.locator('[data-site-id="j1"]').waitFor();
});

test("deleting a site keeps its attached job, stand-alone", async () => {
  await go(page, app, "/site/j1/findings", 1200);
  await page.getByTestId("attach-chip").click();
  await page.getByRole("button", { name: /Riverside Plaza/ }).click();
  await page.getByTestId("attach-chip").filter({ hasText: "Riverside Plaza" }).waitFor();
  assert.equal((await jobOf("j1")).attachedTo, "a2");
  // delete Riverside Plaza from its Edit site sheet
  await go(page, app, "/site/a2/findings", 1200);
  await page.getByRole("button", { name: "Edit site" }).click();
  await page.getByRole("button", { name: "Delete site" }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.waitForTimeout(800);
  assert.equal(await jobOf("a2"), undefined);
  const job = await jobOf("j1");
  assert.equal(job.name, "Pump room");
  assert.equal(job.attachedTo, undefined);
});

test("no page errors", () => {
  assert.deepEqual(errors, []);
});
