// Settings: the build label, Back up (full, chosen sites, new since last
// backup) and Restore. A backup has a folder per site; restoring brings back
// every site, finding and photo exactly, never duplicates, and a site on
// both the phone and the backup is merged (nothing on the phone deleted),
// kept beside the phone's, or left, as chosen. Version 1
// backups (one backup.json, photos by id) still restore.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { startApp, openPage, go, seed, download, scrollFindingToBottom } from "./helpers.mjs";

let app;
let page;
let errors;
let backupPath;

// everything that matters, with a fingerprint of each photo's bytes.
// backedUpAt (when a site was last backed up) is left out: backing up and
// restoring set it.
const snapshot = () =>
  page.evaluate(async () => {
    const req = indexedDB.open("inspecta");
    const idb = await new Promise((r) => (req.onsuccess = () => r(req.result)));
    const all = (s) =>
      new Promise((r) => {
        const q = idb.transaction(s).objectStore(s).getAll();
        q.onsuccess = () => r(q.result);
      });
    const sites = await all("sites");
    const findings = await all("findings");
    const photos = await all("photos");
    const hashes = [];
    for (const ph of photos.sort((a, b) => a.id.localeCompare(b.id))) {
      const d = new Uint8Array(await crypto.subtle.digest("SHA-256", await ph.blob.arrayBuffer()));
      hashes.push([ph.id, ph.findingId, ph.siteId, ph.takenAt, ph.order, ph.blob.type, d.slice(0, 8).join(",")]);
    }
    idb.close();
    const strip = (o) => JSON.stringify(Object.keys(o).filter((k) => k !== "backedUpAt").sort().map((k) => [k, o[k]]));
    return JSON.stringify({ sites: sites.map(strip).sort(), findings: findings.map(strip).sort(), hashes });
  });

// change records straight in the database
// (fn is sent into the page, so it sees nothing outside it but arg)
const dbEdit = (fn, arg) =>
  page.evaluate(async ({ src, arg }) => {
    const req = indexedDB.open("inspecta");
    const idb = await new Promise((r) => (req.onsuccess = () => r(req.result)));
    const tx = idb.transaction(["sites", "findings", "photos", "thumbnails", "flowTests", "stairTests"], "readwrite");
    const get = (store, id) => new Promise((r) => (tx.objectStore(store).get(id).onsuccess = (e) => r(e.target.result)));
    const put = (store, value) => tx.objectStore(store).put(value);
    await new Function("tx", "get", "put", "arg", `return (${src})(tx, get, put, arg)`)(tx, get, put, arg);
    await new Promise((r) => (tx.oncomplete = r));
    idb.close();
  }, { src: fn.toString(), arg });

const wipe = () =>
  dbEdit((tx) => {
    for (const s of ["sites", "findings", "photos", "thumbnails"]) tx.objectStore(s).clear();
  });

// every record in a store
const rows = (store) =>
  page.evaluate(async (store) => {
    const req = indexedDB.open("inspecta");
    const idb = await new Promise((r) => (req.onsuccess = () => r(req.result)));
    const all = await new Promise((r) => (idb.transaction(store).objectStore(store).getAll().onsuccess = (e) => r(e.target.result)));
    idb.close();
    return all.map(({ blob: _b, ...rest }) => rest);
  }, store);

const findingNote = (id) =>
  page.evaluate(async (id) => {
    const req = indexedDB.open("inspecta");
    const idb = await new Promise((r) => (req.onsuccess = () => r(req.result)));
    const f = await new Promise((r) => (idb.transaction("findings").objectStore("findings").get(id).onsuccess = (e) => r(e.target.result)));
    idb.close();
    return f.note;
  }, id);

// the names inside a zip, as an unzip tool lists them
const zipNames = (path) => execFileSync("python3", ["-I", "-c", "import sys,zipfile\nprint('\\n'.join(zipfile.ZipFile(sys.argv[1]).namelist()))", path]).toString().trim().split("\n");
const zipText = (path, name) => execFileSync("python3", ["-I", "-c", "import sys,zipfile\nsys.stdout.write(zipfile.ZipFile(sys.argv[1]).read(sys.argv[2]).decode())", path, name]).toString();

async function backUp(kind) {
  await go(page, app, "/settings/backup");
  await page.getByRole("radio", { name: new RegExp(`^${kind}`) }).click();
}

async function pickRestore(path) {
  await go(page, app, "/settings");
  await page.setInputFiles('input[type=file][accept*=".zip"]', path);
  await page.waitForTimeout(500);
}

before(async () => {
  app = await startApp(import.meta.url);
  ({ page, errors } = await openPage(app));
  await seed(page, {
    sites: [
      { id: "s1", name: "Harbour Tower", address: "1 Harbour St" },
      { id: "s2", name: "Riverside Plaza", kind: "project" },
    ],
    findings: [
      { id: "f0", siteId: "s1", note: "Exit sign out", esrCategory: "3.1", level: "Level 2", defectType: "critical" },
      { id: "f1", siteId: "s1", note: "1.8.1 still present", esrCategory: "1.8" },
      { id: "f2", siteId: "s2", note: "Hose reel tag missing" },
    ],
    photos: [
      { id: "p0", findingId: "f0", siteId: "s1", color: "#a33" },
      { id: "p1", findingId: "f0", siteId: "s1", color: "#3a3", order: 1 },
      { id: "p2", findingId: "f2", siteId: "s2", color: "#33a" },
    ],
  });
});

after(async () => {
  await app?.close();
});

test("Settings shows the build label from BUILD_LABEL", async () => {
  await go(page, app, "/");
  await page.click('button[aria-label="Settings"]');
  const label = (await readFile(new URL("../../BUILD_LABEL", import.meta.url), "utf8")).trim();
  // Settings is its own page now: wait for it to slide in
  await page.locator(`text=Inspecta · Build ${label}`).waitFor();
  assert.equal(await page.locator(`text=Inspecta · Build ${label}`).count(), 1);
});

test("Back up offers full, chosen sites and new since last backup", async () => {
  await go(page, app, "/settings");
  await page.getByTestId("backup-row").click();
  await page.getByRole("radio", { name: /^Full backup/ }).waitFor();
  assert.match(await page.getByRole("radio", { name: /^Full backup/ }).innerText(), /2 sites · 3 photos/);
  // never backed up: both count as new
  assert.match(await page.getByRole("radio", { name: /^New since last backup/ }).innerText(), /2 sites · 3 photos/);
  assert.equal(await page.getByRole("radio", { checked: true }).count(), 1);
  assert.equal(await page.getByRole("button", { name: "Back up 2 sites" }).count(), 1);
});

test("full backup: a folder per site, photos named after their finding", async () => {
  const before = await snapshot();
  await backUp("Full backup");
  const file = await download(page, () => page.getByRole("button", { name: "Back up 2 sites" }).click());
  assert.match(file.name, /^inspecta-backup-\d{4}-\d{2}-\d{2} \(full\)\.zip$/);
  backupPath = file.path;
  assert.deepEqual(zipNames(backupPath).sort(), [
    "Harbour Tower - 1 Harbour St/photos/F01 Level 2 - Exit sign out (1).jpg",
    "Harbour Tower - 1 Harbour St/photos/F01 Level 2 - Exit sign out (2).jpg",
    "Harbour Tower - 1 Harbour St/site.json",
    "README.txt",
    "Riverside Plaza/photos/F01 Hose reel tag missing.jpg",
    "Riverside Plaza/site.json",
    "backup.json",
  ]);
  const siteJson = JSON.parse(zipText(backupPath, "Riverside Plaza/site.json"));
  assert.equal(siteJson.site.name, "Riverside Plaza");
  assert.deepEqual(siteJson.findings.map((f) => f.id), ["f2"]);
  assert.equal(siteJson.photos[0].file, "photos/F01 Hose reel tag missing.jpg");
  // back on Settings, which says so; nothing changed by backing up
  await page.getByText(/^Last backup made \d+ \w+ \d{4}$/).waitFor();
  assert.equal(await snapshot(), before);

  // both sites are in a backup now: nothing new since
  await backUp("New since last backup");
  assert.match(await page.getByRole("radio", { name: /^New since last backup/ }).innerText(), /Nothing new: every site is backed up/);
  assert.equal(await page.getByRole("button", { name: "Back up 0 sites" }).isDisabled(), true);
});

test("back up, wipe, restore: everything comes back identical", async () => {
  const before = await snapshot();
  await wipe();
  await go(page, app, "/");
  assert.equal(await page.locator("text=Harbour Tower").count(), 0, "wiped");

  await pickRestore(backupPath);
  assert.match(await page.locator("text=This adds").innerText(), /2 sites \(3 findings, 3 photos\)/);
  await page.getByRole("button", { name: "Restore", exact: true }).click();
  await page.waitForTimeout(1200);
  assert.match(await page.locator("text=Added").innerText(), /Added 2 sites, 3 findings and 3 photos/);
  await page.getByRole("button", { name: "OK", exact: true }).click();
  assert.equal(await snapshot(), before);
});

test("restoring the same backup again adds nothing and overwrites nothing", async () => {
  const before = await snapshot();
  await pickRestore(backupPath);
  assert.equal(await page.locator("text=Every site in this backup is already on this phone").count(), 1);
  assert.equal(await page.getByRole("button", { name: "Cancel" }).count(), 0);
  await page.getByRole("button", { name: "OK", exact: true }).click();
  assert.equal(await snapshot(), before);
});

test("a restore that stopped part way is finished by restoring again", async () => {
  const before = await snapshot();
  // as a restore leaves things when it stops during Harbour Tower's photos
  // (phone full, app closed): the site's records are in, still marked, and
  // one of its photos never made it
  await dbEdit(async (tx, get, put) => {
    put("sites", { ...(await get("sites", "s1")), restoreIncomplete: true });
    tx.objectStore("photos").delete("p1");
  });
  await go(page, app, "/");
  assert.equal(await page.locator("text=Restore didn't finish").count(), 1);

  await pickRestore(backupPath);
  assert.match(await page.locator("text=This finishes").innerText(), /This finishes 1 site .*: Harbour Tower\./);
  await page.getByRole("button", { name: "Restore", exact: true }).click();
  await page.waitForTimeout(1200);
  assert.match(await page.locator("text=Finished restoring").innerText(), /Finished restoring 1 site .* 1 photo added\./);
  await page.getByRole("button", { name: "OK", exact: true }).click();
  assert.equal(await snapshot(), before);
  await go(page, app, "/");
  assert.equal(await page.locator("text=Restore didn't finish").count(), 0);
});

let sincePath;
test("new since last backup: only the sites changed since their backup", async () => {
  // Riverside Plaza changes after its backup
  await dbEdit(async (_tx, get, put) => {
    put("findings", { ...(await get("findings", "f2")), note: "Hose reel tag replaced" });
    put("sites", { ...(await get("sites", "s2")), changedAt: Date.now() });
  });
  await backUp("New since last backup");
  assert.match(await page.getByRole("radio", { name: /^New since last backup/ }).innerText(), /1 site · 1 photo/);
  assert.equal(await page.getByText("CHANGED", { exact: true }).count(), 1);
  assert.equal(await page.getByText("Riverside Plaza", { exact: true }).count(), 1);
  const file = await download(page, () => page.getByRole("button", { name: "Back up 1 site" }).click());
  await page.getByTestId("backup-row").waitFor(); // back on Settings once it's shared
  assert.match(file.name, /\(since \d+ \w+\)\.zip$/);
  sincePath = file.path;
  assert.deepEqual(zipNames(sincePath).sort(), ["README.txt", "Riverside Plaza/photos/F01 Hose reel tag replaced.jpg", "Riverside Plaza/site.json", "backup.json"]);
});

test("choose sites: only the ticked ones go in", async () => {
  await backUp("Choose sites");
  assert.equal(await page.getByRole("button", { name: "Back up 0 sites" }).isDisabled(), true);
  await page.getByRole("checkbox", { name: /Harbour Tower/ }).check();
  const file = await download(page, () => page.getByRole("button", { name: "Back up 1 site" }).click());
  await page.getByTestId("backup-row").waitFor();
  assert.match(file.name, /\(1 site\)\.zip$/);
  assert.equal(zipNames(file.path).filter((n) => n.endsWith("site.json")).join(), "Harbour Tower - 1 Harbour St/site.json");
});

// Riverside Plaza handed to a coworker at H (this phone's last backup of
// it), and changed on both phones since
let coworkerPath;
let H;
test("a site on both: Leave changes nothing, Merge keeps everything on the phone", async () => {
  H = Date.now();
  // the coworker's copy: a later note on f2, a finding and photo of their
  // own, and readings in a flow test
  await dbEdit(async (_tx, get, put) => {
    put("findings", { ...(await get("findings", "f2")), note: "Coworker note", updatedAt: Date.now() + 10 });
    put("flowTests", { id: "ft", siteId: "s2", kind: "sprinkler", name: "Coworker readings", testedAt: 1, k: 0, sections: [], demand: [], order: 0, createdAt: 1, updatedAt: Date.now() + 20 });
  });
  await seed(page, {
    findings: [{ id: "cw", siteId: "s2", note: "Coworker finding", order: 5, updatedAt: Date.now() + 15 }],
    photos: [{ id: "cwp", findingId: "cw", siteId: "s2", color: "#a3a" }],
  });
  await backUp("Choose sites");
  await page.getByRole("checkbox", { name: /Riverside Plaza/ }).check();
  coworkerPath = (await download(page, () => page.getByRole("button", { name: "Back up 1 site" }).click())).path;
  await page.getByTestId("backup-row").waitFor();

  // this phone, since the hand-over: the coworker's things aren't here, a
  // later note on f2, a finding of its own, and its own readings in the test
  await dbEdit(async (tx, get, put, H) => {
    tx.objectStore("findings").delete("cw");
    tx.objectStore("photos").delete("cwp");
    put("findings", { ...(await get("findings", "f2")), note: "My note", updatedAt: Date.now() + 30 });
    put("findings", { id: "mine", siteId: "s2", note: "My finding", location: "", order: 6, createdAt: Date.now(), updatedAt: Date.now() + 40 });
    put("flowTests", { ...(await get("flowTests", "ft")), name: "My readings", updatedAt: Date.now() + 50 });
    put("sites", { ...(await get("sites", "s2")), backedUpAt: H - 1, changedAt: Date.now() + 50 });
  }, H);

  await pickRestore(coworkerPath);
  assert.match(await page.locator("text=on this phone too").first().innerText(), /1 site is on this phone too, with differences: Riverside Plaza\. You'll choose/);
  await page.getByRole("button", { name: "Restore", exact: true }).click();
  await page.getByText("Riverside Plaza is on this phone too").waitFor();
  const question = await page.locator("text=nothing on this phone is deleted").innerText();
  assert.match(question, /Riverside Plaza: the backup has 1 finding and 1 photo this phone doesn't\./);
  assert.match(question, /This phone has 1 finding the backup doesn't; it's kept\./);
  assert.match(question, /1 test changed on both: the backup's copy is added beside this phone's\./);
  assert.match(question, /Keep both: the backup's copy comes in as its own site, "Riverside Plaza \(from backup\)"/);

  const before = await snapshot();
  await page.getByRole("button", { name: "Leave as it is" }).click();
  await page.getByText("Nothing restored").waitFor();
  await page.getByRole("button", { name: "OK", exact: true }).click();
  assert.equal(await snapshot(), before);

  await pickRestore(coworkerPath);
  await page.getByRole("button", { name: "Restore", exact: true }).click();
  await page.getByRole("button", { name: "Merge", exact: true }).click();
  await page.getByText("Restore finished").waitFor();
  assert.match(await page.locator("text=Merged").innerText(), /Merged Riverside Plaza: added 1 finding, 1 photo and 1 test\./);
  await page.getByRole("button", { name: "OK", exact: true }).click();

  // nothing on the phone went: its own finding and its later note stay
  assert.equal(await findingNote("mine"), "My finding");
  assert.equal(await findingNote("f2"), "My note");
  // the coworker's finding and photo came in
  assert.equal(await findingNote("cw"), "Coworker finding");
  assert.deepEqual((await rows("photos")).filter((p) => p.siteId === "s2").map((p) => p.id).sort(), ["cwp", "p2"]);
  // the test changed on both: both kept, the backup's marked
  const tests = (await rows("flowTests")).filter((t) => t.siteId === "s2").map((t) => [t.name, !!t.fromBackup]).sort();
  assert.deepEqual(tests, [["Coworker readings", true], ["My readings", false]]);
  const s2 = (await rows("sites")).find((x) => x.id === "s2");
  assert.equal(s2.restoreIncomplete, undefined);
  assert.equal(s2.backedUpAt, H - 1, "a merged site still needs backing up");
});

test("merging the same backup again adds nothing", async () => {
  const before = await snapshot();
  await pickRestore(coworkerPath);
  assert.equal(await page.locator("text=Every site in this backup is already on this phone").count(), 1);
  await page.getByRole("button", { name: "OK", exact: true }).click();
  assert.equal(await snapshot(), before);
  assert.equal((await rows("flowTests")).filter((t) => t.siteId === "s2").length, 2);
});

test("a merge that stopped part way is finished by restoring again", async () => {
  const before = await snapshot();
  await dbEdit(async (tx, get, put) => {
    put("sites", { ...(await get("sites", "s2")), restoreIncomplete: "merge" });
    tx.objectStore("photos").delete("cwp");
  });
  await pickRestore(coworkerPath);
  assert.match(await page.locator("text=This finishes").innerText(), /This finishes 1 site .*: Riverside Plaza\./);
  await page.getByRole("button", { name: "Restore", exact: true }).click();
  await page.getByText("Restore finished").waitFor();
  assert.match(await page.locator("text=Finished restoring").innerText(), /Finished restoring 1 site .* 1 photo added\./);
  await page.getByRole("button", { name: "OK", exact: true }).click();
  // everything's back (the site's changedAt moves: the merge changed it again)
  const [a, b] = [JSON.parse(await snapshot()), JSON.parse(before)];
  assert.deepEqual([a.findings, a.hashes], [b.findings, b.hashes]);
  const s2 = (await rows("sites")).find((x) => x.id === "s2");
  assert.equal(s2.restoreIncomplete, undefined);
  assert.equal(s2.backedUpAt, H - 1, "finishing a merge doesn't count as a backup");
});

test("Keep both: the backup's copy as a separate site, the phone's untouched", async () => {
  // the coworker's note on f2 is now the later one, so there's something to bring in
  await dbEdit(async (_tx, get, put, H) => {
    put("findings", { ...(await get("findings", "f2")), note: "My older note", updatedAt: H + 5 });
  }, H);
  const mine = JSON.stringify((await rows("findings")).filter((f) => f.siteId === "s2").sort((a, b) => a.id.localeCompare(b.id)));
  await pickRestore(coworkerPath);
  await page.getByRole("button", { name: "Restore", exact: true }).click();
  await page.getByRole("button", { name: "Keep both", exact: true }).click();
  await page.getByText("Restore finished").waitFor();
  assert.match(await page.locator("text=Kept both").innerText(), /Kept both copies of 1 site; the backup's is "Riverside Plaza \(from backup\)"\./);
  await page.getByRole("button", { name: "OK", exact: true }).click();

  assert.equal(JSON.stringify((await rows("findings")).filter((f) => f.siteId === "s2").sort((a, b) => a.id.localeCompare(b.id))), mine, "the phone's site is untouched");
  const copy = (await rows("sites")).find((x) => x.copyOf === "s2");
  assert.equal(copy.name, "Riverside Plaza (from backup)");
  assert.equal(copy.restoreIncomplete, undefined);
  const notes = (await rows("findings")).filter((f) => f.siteId === copy.id).map((f) => f.note).sort();
  assert.deepEqual(notes, ["Coworker finding", "Coworker note"]);
  assert.equal((await rows("photos")).filter((p) => p.siteId === copy.id).length, 2);
  await go(page, app, "/");
  assert.equal(await page.getByText("Riverside Plaza (from backup)").count(), 1);

  // stopped part way (a photo missing, still marked): restoring again finishes the copy
  const done = await snapshot();
  const lost = (await rows("photos")).find((p) => p.siteId === copy.id).id;
  await dbEdit(
    async (tx, get, put, { site, photo }) => {
      put("sites", { ...(await get("sites", site)), restoreIncomplete: true });
      tx.objectStore("photos").delete(photo);
    },
    { site: copy.id, photo: lost },
  );
  await pickRestore(coworkerPath);
  assert.match(await page.locator("text=This finishes").innerText(), /Riverside Plaza \(from backup\)/);
  await page.getByRole("button", { name: "Restore", exact: true }).click();
  // Riverside Plaza itself is asked about again (the backup's f2 is still later): leave it
  await page.getByRole("button", { name: "Leave as it is" }).click();
  await page.getByText("Restore finished").waitFor();
  await page.getByRole("button", { name: "OK", exact: true }).click();
  const after = JSON.parse(await snapshot());
  const was = JSON.parse(done);
  assert.deepEqual(after.hashes, was.hashes);
  assert.equal((await rows("sites")).find((x) => x.id === copy.id).restoreIncomplete, undefined);
});

test("a version 1 backup (before site folders) still restores", async () => {
  const photo = execFileSync("python3", ["-I", "-c", "import sys,zipfile\nsys.stdout.buffer.write(zipfile.ZipFile(sys.argv[1]).read('Riverside Plaza/photos/F01 Hose reel tag missing.jpg'))", backupPath]);
  const now = Date.now();
  const v1 = {
    type: "inspecta-backup",
    version: 1,
    createdAt: new Date(now).toISOString(),
    sites: [{ id: "old1", name: "Old Format Site", address: "", kind: "afss", createdAt: now, updatedAt: now }],
    findings: [{ id: "of1", siteId: "old1", note: "From an old backup", location: "", order: 0, createdAt: now, updatedAt: now }],
    photos: [{ id: "op1", findingId: "of1", siteId: "old1", takenAt: now, order: 0, file: "photos/op1.jpg", mime: "image/jpeg" }],
  };
  const v1Path = `${backupPath}.v1.zip`;
  execFileSync("python3", ["-I", "-c", "import sys,zipfile\nz=zipfile.ZipFile(sys.argv[1],'w')\nz.writestr('backup.json', sys.argv[2])\nz.writestr('photos/op1.jpg', sys.stdin.buffer.read())\nz.close()", v1Path, JSON.stringify(v1)], { input: photo });
  await pickRestore(v1Path);
  assert.match(await page.locator("text=This adds").innerText(), /1 site \(1 finding, 1 photo\): Old Format Site/);
  await page.getByRole("button", { name: "Restore", exact: true }).click();
  await page.waitForTimeout(1000);
  assert.match(await page.locator("text=Added").innerText(), /Added 1 site, 1 finding and 1 photo/);
  await page.getByRole("button", { name: "OK", exact: true }).click();
});

test("a file that isn't a backup is refused", async () => {
  await go(page, app, "/settings");
  await page.setInputFiles('input[type=file][accept*=".zip"]', { name: "notes.zip", mimeType: "application/zip", buffer: Buffer.from("not a zip") });
  await page.waitForTimeout(300);
  assert.equal(await page.locator("text=isn't a zip file").count(), 1);
  await page.getByRole("button", { name: "OK", exact: true }).click();
});

test("a backup re-zipped (compressed, inside a folder) still reads", async () => {
  // as when a backup goes through a computer or a cloud drive
  const remade = `${backupPath}.remade.zip`;
  execFileSync("python3", ["-c", "import sys,zipfile\nsrc=zipfile.ZipFile(sys.argv[1])\nout=zipfile.ZipFile(sys.argv[2],'w',zipfile.ZIP_DEFLATED)\nfor n in src.namelist(): out.writestr('Inspecta backup/'+n, src.read(n))\nout.close()", backupPath, remade]);
  await pickRestore(remade);
  // Harbour Tower is as backed up, and everything in the backup's Riverside
  // Plaza is on the phone, or older than the phone's copy
  assert.equal(await page.locator("text=Every site in this backup is already on this phone").count(), 1);
  await page.getByRole("button", { name: "OK", exact: true }).click();
});

test("a change made in the app counts for new since last backup", async () => {
  await backUp("New since last backup");
  assert.equal(await page.getByText("Harbour Tower", { exact: true }).count(), 0, "Harbour Tower is backed up");
  // clearing a finding's ESR category is a change to the site (it doesn't
  // move the site on the home page, so updatedAt alone wouldn't show it)
  await go(page, app, "/site/s1/finding/f0/note", 1500);
  await scrollFindingToBottom(page);
  await page.click('button[aria-label="Clear ESR category"]');
  await page.waitForTimeout(400);
  await backUp("New since last backup");
  assert.equal(await page.getByText("Harbour Tower", { exact: true }).count(), 1);
  // Harbour Tower, and Riverside Plaza, merged earlier and not backed up since
  assert.equal(await page.getByText("CHANGED", { exact: true }).count(), 2);
});

test("no page errors", () => {
  assert.deepEqual(errors, []);
});
