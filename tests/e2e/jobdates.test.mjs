// Jobs made when an AFSS site's tests move into their own job (db
// splitSiteTests) keep the date the work was done: the oldest test's, or the
// site's for a stair system with no tests, not the day of the move. Jobs
// already moved and dated today are put back the same way on the next open.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startApp, openPage, go, seed } from "./helpers.mjs";

let app;
let page;
let errors;
const DAY = 86400000;
const now = Date.now();

before(async () => {
  app = await startApp(import.meta.url);
  ({ page, errors } = await openPage(app));
  await go(page, app, "/", 1500);
  await seed(page, {
    sites: [
      // old site: a flow test from 30 days ago and a stair system, moved on this open
      { id: "a1", name: "155 Kent St", kind: "afss", createdAt: now - 60 * DAY, spf: { edition: "1998", type: "Purge", notes: "", stairs: [] } },
      // moved on an earlier open, its job dated today
      { id: "a2", name: "Riverside Plaza", kind: "afss", createdAt: now - 90 * DAY },
      { id: "a2-flow", name: "Riverside Plaza", kind: "flow", attachedTo: "a2", createdAt: now },
      // a new job for a new test today stays today
      { id: "j3", name: "Pump room", kind: "flow" },
    ],
    flowTests: [
      { id: "t1", siteId: "a1", kind: "sprinkler", createdAt: now - 30 * DAY },
      { id: "t2", siteId: "a2-flow", kind: "hydrant", createdAt: now - 10 * DAY },
      { id: "t3", siteId: "j3", kind: "sprinkler" },
    ],
  });
});

after(async () => {
  await app?.close();
});

const created = () =>
  page.evaluate(async () => {
    const req = indexedDB.open("inspecta");
    const idb = await new Promise((r) => (req.onsuccess = () => r(req.result)));
    const all = await new Promise((r) => (idb.transaction("sites").objectStore("sites").getAll().onsuccess = (e) => r(e.target.result)));
    idb.close();
    return Object.fromEntries(all.map((s) => [s.id, s.createdAt]));
  });

test("moved tests' jobs keep the date the work was done", async () => {
  const c = await created();
  const days = (id) => Math.abs(Math.round((now - c[id]) / DAY));
  assert.equal(days("a1-flow"), 30, "the flow job: its oldest test's date");
  assert.equal(days("a1-spf"), 60, "the stair job with only its system: the site's date");
  assert.equal(days("a2-flow"), 10, "moved earlier and dated today: put back");
  assert.equal(days("j3"), 0, "a job made today stays today");
  // home: the moved jobs below today's
  await go(page, app, "/", 1200);
  const text = await page.locator("body").innerText();
  assert.ok(text.indexOf("Pump room") < text.indexOf("Riverside Plaza"), "today's job first");
  assert.deepEqual(errors, []);
});
