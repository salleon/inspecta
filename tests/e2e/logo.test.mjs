// Company logos (lib/company): any picture the phone can open is taken,
// from an upload or a setup file, and kept as a PNG of at most 800 x 400
// (an SVG drawn at full size). One that prints soft on the cover gets a
// warning; one that isn't a picture, can't be read or is over 25 MB is
// turned away with the reason. A logo saved before this is made a PNG.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { writeFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startApp } from "./helpers.mjs";

let app;
const errors = [];

before(async () => {
  app = await startApp(import.meta.url);
});

after(async () => {
  await app?.close();
});

async function freshPhone(storage = {}) {
  const context = await app.browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addInitScript((s) => {
    localStorage.setItem("inspecta.tourOffered", "1");
    for (const [k, v] of Object.entries(s)) if (!localStorage.getItem(k)) localStorage.setItem(k, v);
  }, storage);
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(app.url + "/");
  await page.waitForTimeout(2300);
  return page;
}

// a picture drawn in the page: a data URL of the given type and size
const picture = (page, type, w, h) =>
  page.evaluate(
    ({ type, w, h }) => {
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const g = c.getContext("2d");
      g.fillStyle = "#d7262e";
      g.fillRect(0, 0, w / 3, h);
      g.fillStyle = "#1d2833";
      g.fillRect(w / 2, h / 4, w / 3, h / 2);
      return c.toDataURL(type, 0.9);
    },
    { type, w, h },
  );
const bytes = (dataUrl) => Buffer.from(dataUrl.split(",")[1], "base64");

// the stored logo: its type and size
const storedLogo = (page) =>
  page.evaluate(async () => {
    const logo = JSON.parse(localStorage.getItem("inspecta.company") ?? "{}").logo;
    if (!logo) return null;
    const img = new Image();
    await new Promise((r) => {
      img.onload = r;
      img.src = logo;
    });
    return { png: logo.startsWith("data:image/png;base64,"), w: img.naturalWidth, h: img.naturalHeight };
  });

async function toLogoStep(page) {
  await page.getByRole("button", { name: "Set up your company" }).click();
  await page.fill("#company-name", "Coastline Fire Services");
  await page.getByRole("button", { name: "Next" }).click();
}

test("a small logo is taken, with a warning it may print blurry", async () => {
  const page = await freshPhone();
  await toLogoStep(page);
  const png = await picture(page, "image/png", 200, 60);
  await page.setInputFiles('input[aria-label="Upload logo"]', { name: "logo.png", mimeType: "image/png", buffer: bytes(png) });
  await page.getByText("This logo is small").waitFor();
  assert.equal(await page.getByText(/It's 200 × 60 pixels, so it may look blurry on report covers/).count(), 1);
  assert.deepEqual(await storedLogo(page), { png: true, w: 200, h: 60 });
  await page.context().close();
});

test("a big photo (JPEG) is shrunk to 800 x 400 and kept as a PNG, no warning", async () => {
  const page = await freshPhone();
  await toLogoStep(page);
  const jpeg = await picture(page, "image/jpeg", 2400, 1200);
  await page.setInputFiles('input[aria-label="Upload logo"]', { name: "logo.jpg", mimeType: "image/jpeg", buffer: bytes(jpeg) });
  await page.getByText("White background behind logo").waitFor();
  assert.deepEqual(await storedLogo(page), { png: true, w: 800, h: 400 });
  assert.equal(await page.getByText("This logo is small").count(), 0);
  await page.context().close();
});

test("a file that isn't a picture, or a damaged one, is turned away with why", async () => {
  const page = await freshPhone();
  await toLogoStep(page);
  await page.setInputFiles('input[aria-label="Upload logo"]', { name: "notes.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4") });
  await page.getByText("That file isn't a picture.").waitFor();
  await page.getByRole("button", { name: "OK" }).click();
  await page.setInputFiles('input[aria-label="Upload logo"]', { name: "logo.png", mimeType: "image/png", buffer: Buffer.from("\x89PNG\r\n\x1a\nnot really") });
  await page.getByText(/That picture can't be read/).waitFor();
  assert.equal(await storedLogo(page), null);
  await page.context().close();
});

// a contractor setup file carrying this logo
async function setupFile(logo) {
  const body = {
    type: "inspecta-setup",
    version: 1,
    exportedAt: new Date().toISOString(),
    mode: "contractor",
    company: { name: "Coastline Fire Services", logo, plate: false, logoColours: [], schemeId: "default", custom: { primary: "#071b2c", secondary: "#2ec4b6", light: "#f4f7f9" } },
    keywords: {},
    pin: { salt: "c2FsdA==", hash: "aGFzaA==" },
  };
  const path = join(await mkdtemp(join(tmpdir(), "logo-")), "Coastline setup.inspecta");
  await writeFile(path, JSON.stringify(body));
  return path;
}

async function loadFile(page, path) {
  await page.setInputFiles('input[aria-label="Setup file"]', path);
  await page.waitForTimeout(800);
}

test("a setup file's SVG logo is drawn at full size as a PNG", async () => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="40"><rect width="40" height="40" fill="#d7262e"/><rect x="50" y="10" width="65" height="20" fill="#1d2833"/></svg>`;
  const page = await freshPhone();
  await loadFile(page, await setupFile(`data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`));
  await page.getByRole("button", { name: "Join Coastline Fire Services" }).click();
  await page.waitForTimeout(500);
  assert.deepEqual(await storedLogo(page), { png: true, w: 800, h: 267 });
  await page.context().close();
});

for (const [what, logo, message] of [
  ["isn't a picture", "data:text/html;base64,PGgxPmhpPC9oMT4=", "The logo in this setup file isn't a picture."],
  ["can't be read", "data:image/png;base64,bm90IGEgcGljdHVyZQ==", /The logo in this setup file can't be read/],
  ["is over 25 MB", `data:image/png;base64,${"A".repeat(36 * 1024 * 1024)}`, "The logo in this setup file is too big (over 25 MB)."],
]) {
  test(`a setup file whose logo ${what} is turned away, and nothing is set up`, async () => {
    const page = await freshPhone();
    await loadFile(page, await setupFile(logo));
    await page.getByText("Can't use this setup file").waitFor();
    assert.equal(await page.getByText(message).count(), 1);
    assert.equal(await page.getByRole("button", { name: /Join Coastline/ }).count(), 0);
    assert.equal(await page.evaluate(() => localStorage.getItem("inspecta.company")), null);
    await page.context().close();
  });
}

test("a logo saved before logos were checked (a JPEG) is made a PNG on start", async () => {
  const draw = await freshPhone();
  const jpeg = await picture(draw, "image/jpeg", 300, 100);
  await draw.context().close();
  const company = { name: "Coastline Fire Services", logo: jpeg, plate: false, logoColours: [], schemeId: "default", custom: { primary: "#071b2c", secondary: "#2ec4b6", light: "#f4f7f9" }, setUp: true };
  const page = await freshPhone({ "inspecta.flowMode": "contractor", "inspecta.company": JSON.stringify(company), "inspecta.inspectorName": "Tester" });
  assert.deepEqual(await storedLogo(page), { png: true, w: 300, h: 100 });
  await page.context().close();
});

test("no page errors", () => {
  assert.deepEqual(errors, []);
});
