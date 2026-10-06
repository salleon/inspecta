// The tour (canvas TourFull): offered once per phone (new users after their
// name, existing users on the first opening after the update); 8 topics
// through every screen on temporary example sites that are removed at the
// end (Done, Skip, Android back, or on the next opening if the app was
// closed mid-tour); Pick a topic runs one; taps only reach the tour;
// Settings → Replay tour.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startApp, openPage, go, seed, pressBack } from "./helpers.mjs";

let app;
let page;
let errors;

const sites = () =>
  page.evaluate(async () => {
    const req = indexedDB.open("inspecta");
    const idb = await new Promise((r) => (req.onsuccess = () => r(req.result)));
    const all = await new Promise((r) => {
      const q = idb.transaction("sites").objectStore("sites").getAll();
      q.onsuccess = () => r(q.result);
    });
    idb.close();
    return all.map((s) => s.name).sort();
  });

const tipTitle = async () => {
  await page.waitForTimeout(700); // screen change + the tip settling
  return page.locator('[aria-live="polite"] [role="dialog"]').getAttribute("aria-label");
};
const topic = async () => {
  await page.waitForTimeout(100);
  return page.locator('[aria-live="polite"] [role="dialog"] span', { hasText: / of \d+$/ }).first().innerText();
};
const next = () => page.getByRole("button", { name: "Next", exact: true }).click();
const reopen = async () => {
  await page.reload();
  await page.waitForTimeout(2600);
};

before(async () => {
  app = await startApp(import.meta.url);
  ({ page, errors } = await openPage(app));
  await seed(page, { sites: [{ id: "real", name: "Harbour Tower", kind: "afss" }], findings: [], photos: [] });
});

after(async () => {
  await app?.close();
});

test("a new user gets the welcome once, right after entering their name", async () => {
  const context = await app.browser.newContext({ viewport: { width: 390, height: 844 } });
  const fresh = await context.newPage();
  await fresh.goto(app.url + "/");
  await fresh.waitForTimeout(2600);
  await fresh.locator("input").first().fill("Leon Salvaggio");
  await fresh.keyboard.press("Enter");
  await fresh.waitForTimeout(800);
  assert.match(await fresh.locator('[role="dialog"][aria-label="Welcome"]').innerText(), /Welcome to Inspecta, Leon/);
  await fresh.getByRole("button", { name: "Skip, I'll explore" }).click();
  await fresh.reload();
  await fresh.waitForTimeout(2600);
  assert.equal(await fresh.locator('[role="dialog"][aria-label="Welcome"]').count(), 0, "only once");
  await context.close();
});

test("someone already using the app gets it once, on the next opening", async () => {
  await page.evaluate(() => localStorage.removeItem("inspecta.tourOffered")); // as before this update
  await reopen();
  assert.match(await page.locator('[role="dialog"][aria-label="Welcome"]').innerText(), /Welcome to Inspecta, Test/);
  await page.getByRole("button", { name: "Skip, I'll explore" }).click();
  await reopen();
  assert.equal(await page.locator('[role="dialog"][aria-label="Welcome"]').count(), 0, "only once");
  assert.deepEqual(await sites(), ["Harbour Tower"], "their site is untouched");
});

test("Show me around walks through all 8 topics on example sites, then removes them", async () => {
  await page.evaluate(() => localStorage.removeItem("inspecta.tourOffered"));
  await reopen();
  await page.getByRole("button", { name: "Show me around" }).click();
  assert.equal(await tipTitle(), "Start a site");
  assert.deepEqual(await sites(), ["Example pump room", "Example site", "Harbour Tower"]);
  assert.equal(await topic(), "SITES · 1 OF 2");
  assert.match(new URL(page.url()).hash, /^(#\/)?$/, "on the sites screen");
  await page.mouse.click(341, 787); // the lit-up + : does nothing during the tour
  await page.waitForTimeout(300);
  assert.equal(await page.locator("text=Start inspection").count(), 0, "taps don't reach the app");

  // each step's title, and what its screen shows
  const want = [
    ["Pick the kind of site", async () => assert.equal(await page.locator('[data-tour="site-kinds"]').count(), 1, "the New site sheet opens")],
    ["Log a finding", async () => assert.match(page.url(), /#\/site\/[^/]+\/findings$/)],
    ["Photos", async () => assert.match(page.url(), /\/finding\/[^/]+\/note$/)],
    ["Save & next"],
    ["ESR category", async () => assert.ok(await page.locator("text=Browse all categories").count(), "Quick add open")],
    ["Level, defect type, category"],
    ["No rush on site", async () => assert.ok(await page.locator('[data-tour="categorise-ask"]').count(), "the uncategorised question")],
    ["Flow tests on a site"],
    ["In the site's report", async () => assert.match(page.url(), /\?tab=flow$/)],
    ["Or on its own"],
    ["Its report", async () => assert.match(page.url(), /\/flow-export$/)],
    ["Details and demand", async () => assert.match(page.url(), /\/flow\/[^/]+$/)],
    ["Graph and pass / fail"],
    ["A tab per supply"],
    ["Full screen with a keypad", async () => {
      await page.waitForTimeout(900);
      assert.equal(await page.locator(".wide-pad.off").count(), 0, "the keypad is out");
    }],
    ["Add, delete, your own columns", async () => assert.equal(await page.locator(".wide-pad.off").count(), 1, "the keypad is away")],
    ["Check it first", async () => assert.equal(await page.locator('[role="dialog"][aria-label="Readings, full screen"]').count(), 0, "full screen closed")],
    ["Send it"],
    ["Good to know"],
    ["Customised reports"],
    ["Name it, pick quickly", async () => assert.equal(await page.locator('[role="dialog"][aria-label="Create Customised Report"]').count(), 1, "the sheet opens")],
    ["It's saved", async () => assert.equal(await page.locator('[role="dialog"][aria-label="Create Customised Report"]').count(), 0, "and closes")],
    ["Back up your work", async () => assert.match(page.url(), /#\/settings$/)],
    ["Settings"],
  ];
  for (const [title, check] of want) {
    await next();
    assert.equal(await tipTitle(), title);
    if (check) await check();
  }
  assert.equal(await topic(), "BACKUPS & SETTINGS · 2 OF 2");
  assert.equal(await page.getByRole("button", { name: "Skip", exact: true }).count(), 0, "last step: just Done");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.waitForTimeout(500);

  assert.deepEqual(await sites(), ["Harbour Tower"], "example sites gone, real site untouched");
  assert.equal(await page.locator('[aria-live="polite"]').count(), 0);
  assert.equal(await page.locator("text=Example site").count(), 0, "gone from the list too");
  await reopen();
  assert.equal(await page.locator('[role="dialog"][aria-label="Welcome"]').count(), 0, "not offered again");
});

test("Pick a topic runs just that topic, then comes back to the list", async () => {
  await page.evaluate(() => localStorage.removeItem("inspecta.tourOffered"));
  await reopen();
  await page.getByRole("button", { name: "☰ Pick a topic" }).click();
  await page.waitForTimeout(500);
  const list = page.locator('[role="dialog"][aria-label="Pick a topic"]');
  assert.equal(await list.locator("button", { hasText: /^\d/ }).count(), 8);
  await list.getByRole("button", { name: /Customised reports/ }).click();
  assert.equal(await tipTitle(), "Customised reports");
  assert.equal(await topic(), "CUSTOMISED REPORTS · 1 OF 3");
  await next();
  await tipTitle();
  await next();
  assert.equal(await tipTitle(), "It's saved");
  await page.getByRole("button", { name: "Topics", exact: true }).click();
  await page.waitForTimeout(400);
  assert.equal(await list.count(), 1, "back on the list");
  // ☰ Topics on a tip opens it too; Done ends the tour
  await list.getByRole("button", { name: /Sites/ }).click();
  assert.equal(await tipTitle(), "Start a site");
  await page.getByRole("button", { name: "☰ Topics" }).click();
  await page.waitForTimeout(300);
  await list.getByRole("button", { name: "Done", exact: true }).click();
  await page.waitForTimeout(500);
  assert.deepEqual(await sites(), ["Harbour Tower"]);
});

test("an old Advanced controls switch-off is ignored: the ESR steps are always in", async () => {
  await page.evaluate(() => localStorage.setItem("inspecta.advancedControls", "0"));
  await reopen();
  await page.click('button[aria-label="Settings"]');
  await page.click('button:has-text("Replay tour")');
  const titles = [await tipTitle()];
  for (let i = 0; i < 5; i++) {
    await next();
    titles.push(await tipTitle());
  }
  assert.deepEqual(titles, ["Start a site", "Pick the kind of site", "Log a finding", "Photos", "Save & next", "ESR category"]);
  await page.getByRole("button", { name: "Skip", exact: true }).click();
  await page.waitForTimeout(500);
  await page.evaluate(() => localStorage.removeItem("inspecta.advancedControls"));
});

test("Android back ends the tour, even on the finding screen", async () => {
  await reopen();
  await page.click('button[aria-label="Settings"]');
  await page.click('button:has-text("Replay tour")');
  for (let i = 0; i < 4; i++) {
    await tipTitle();
    await next();
  }
  assert.equal(await tipTitle(), "Save & next");
  await pressBack(page);
  await page.waitForTimeout(500);
  assert.equal(await page.locator('[aria-live="polite"]').count(), 0);
  assert.deepEqual(await sites(), ["Harbour Tower"]);
});

test("closed mid-tour: the example sites are cleared away on the next opening", async () => {
  await page.click('button[aria-label="Settings"]');
  await page.click('button:has-text("Replay tour")');
  await tipTitle();
  assert.deepEqual(await sites(), ["Example pump room", "Example site", "Harbour Tower"]);
  await reopen(); // as if the app had been closed
  assert.deepEqual(await sites(), ["Harbour Tower"]);
  assert.equal(await page.locator("text=Example site").count(), 0);
});

test("on a smaller phone with status and navigation bars, every tip is on screen and clear of what it lights up", async () => {
  const context = await app.browser.newContext({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true });
  const small = await context.newPage();
  await small.addInitScript(() => {
    localStorage.setItem("inspecta.inspectorName", "Test Inspector");
    // as the phone's status and navigation bars do (see index.css --sa-*)
    document.addEventListener("DOMContentLoaded", () => {
      const st = document.createElement("style");
      st.textContent = ":root{--safe-area-inset-top:42px;--safe-area-inset-bottom:48px}";
      document.head.appendChild(st);
    });
  });
  await small.goto(app.url + "/");
  await small.waitForTimeout(2600);
  await small.getByRole("button", { name: "Show me around" }).click();
  for (let i = 0; i < 25; i++) {
    await small.waitForTimeout(i === 15 ? 1800 : 1100);
    const r = await small.evaluate(() => {
      const card = document.querySelector('[aria-live="polite"] [role="dialog"]').getBoundingClientRect();
      const rings = [...document.querySelectorAll('[aria-live="polite"] svg > rect[stroke]')].map((e) => e.getBoundingClientRect());
      const hit = (a, b) => a.left < b.right - 2 && b.left < a.right - 2 && a.top < b.bottom - 2 && b.top < a.bottom - 2;
      const on = (b) => b.right > 0 && b.bottom > 0 && b.left < innerWidth && b.top < innerHeight;
      return {
        title: document.querySelector('[aria-live="polite"] [role="dialog"]').getAttribute("aria-label"),
        rings: rings.length,
        covered: rings.some((x) => hit(card, x)),
        ringsOn: rings.every(on),
        cardOn: card.left >= -1 && card.top >= -1 && card.right <= innerWidth + 1 && card.bottom <= innerHeight + 1,
      };
    });
    assert.ok(r.rings > 0 && r.ringsOn, `${r.title}: lit up and on screen`);
    assert.ok(r.cardOn && !r.covered, `${r.title}: tip on screen, not covering what it lights up`);
    const nextButton = small.locator('[aria-live="polite"] [role="dialog"] button', { hasText: /^(Next|Done)$/ });
    await nextButton.click();
  }
  await context.close();
});

test("no page errors", () => {
  assert.deepEqual(errors, []);
});
