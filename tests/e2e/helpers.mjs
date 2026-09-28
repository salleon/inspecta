// Shared set-up for the browser tests: serves the built app (dist/, from
// `npm run build`) with `vite preview`, opens it in headless Chromium as a
// phone-sized screen, and seeds the database directly.

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { chromium } from "playwright";

// a different port per test file, since node --test runs files in parallel
export async function startApp(testFile) {
  const port = 4300 + (parseInt(createHash("md5").update(testFile).digest("hex").slice(0, 4), 16) % 600);
  const server = spawn("npx", ["vite", "preview", "--port", String(port), "--strictPort"], { stdio: "ignore", detached: true });
  const url = `http://localhost:${port}`;
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(url)).ok) break;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  return {
    url,
    browser,
    async close() {
      await browser.close();
      try {
        process.kill(-server.pid);
      } catch {
        // already gone
      }
    },
  };
}

// A new phone-sized page with an inspector name set (skips onboarding) and
// window.__pressBack() standing in for the Android back button: it fires
// the app's back event and, if no screen handles it, goes to the parent
// screen the same way App.tsx does.
export async function openPage(app, { advanced = true } = {}) {
  const context = await app.browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript((adv) => {
    localStorage.setItem("inspecta.inspectorName", "Test Inspector");
    if (localStorage.getItem("inspecta.advancedControls") === null) localStorage.setItem("inspecta.advancedControls", adv ? "1" : "0");
    window.__pressBack = () => {
      const e = new Event("inspecta:back", { cancelable: true });
      window.dispatchEvent(e);
      if (e.defaultPrevented) return;
      const h = location.hash.slice(1) || "/";
      let parent = "/";
      const m = /^\/site\/([^/]+)\/(findings|export|finding\/[^/]+\/note)$/.exec(h);
      if (m) parent = m[2] === "findings" ? "/" : `/site/${m[1]}/findings`;
      else if (h.startsWith("/admin/")) parent = h.replace(/\/[^/]+$/, "");
      location.replace("#" + parent);
    };
  }, advanced);
  await page.goto(app.url + "/");
  await page.waitForTimeout(2300); // splash
  return { page, errors };
}

// (reloads when already there, so each test starts from a fresh screen)
export async function go(page, app, hash, wait = 1200) {
  const target = `${app.url}/#${hash}`;
  if (page.url() === target) await page.reload();
  else await page.goto(target);
  await page.waitForTimeout(wait);
}

export async function pressBack(page) {
  await page.evaluate(() => window.__pressBack());
  await page.waitForTimeout(500);
}

// sites: [{ id, name, ... }], findings: [{ id, siteId, note, ... }],
// photos: [{ id, findingId, siteId, color? }] (small generated JPEGs)
export async function seed(page, { sites = [], findings = [], photos = [] }) {
  await page.evaluate(
    async ({ sites, findings, photos }) => {
      const req = indexedDB.open("inspecta");
      const idb = await new Promise((r) => (req.onsuccess = () => r(req.result)));
      const blobs = [];
      for (const ph of photos) {
        const c = document.createElement("canvas");
        c.width = 400;
        c.height = 300;
        const g = c.getContext("2d");
        g.fillStyle = ph.color ?? "#6d7b86";
        g.fillRect(0, 0, 400, 300);
        blobs.push(await new Promise((r) => c.toBlob(r, "image/jpeg", 0.9)));
      }
      const now = Date.now();
      const tx = idb.transaction(["sites", "findings", "photos"], "readwrite");
      for (const s of sites) tx.objectStore("sites").put({ address: "", kind: "afss", createdAt: now, updatedAt: now, ...s });
      findings.forEach((f, i) => tx.objectStore("findings").put({ location: "", order: i, createdAt: now, updatedAt: now, ...f }));
      photos.forEach(({ color: _c, ...ph }, i) => tx.objectStore("photos").put({ takenAt: now, order: 0, ...ph, blob: blobs[i] }));
      await new Promise((r) => (tx.oncomplete = r));
      idb.close();
    },
    { sites, findings, photos },
  );
}

// finding id -> ESR category ("-" for none)
export async function categories(page) {
  return page.evaluate(async () => {
    const req = indexedDB.open("inspecta");
    const idb = await new Promise((r) => (req.onsuccess = () => r(req.result)));
    const all = await new Promise((r) => {
      const q = idb.transaction("findings").objectStore("findings").getAll();
      q.onsuccess = () => r(q.result);
    });
    idb.close();
    return Object.fromEntries(all.map((f) => [f.id, f.esrCategory ?? "-"]));
  });
}

export async function scrollFindingToBottom(page) {
  await page.evaluate(() => {
    const s = document.querySelector(".finding-scroll");
    if (s) s.scrollTop = s.scrollHeight;
  });
  await page.waitForTimeout(150);
}

export async function download(page, action) {
  const dl = page.waitForEvent("download");
  await action();
  const d = await dl;
  return { name: d.suggestedFilename(), path: await d.path() };
}
