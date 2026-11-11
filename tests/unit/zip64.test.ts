// Zip64: past 4 GB or 65,535 files a zip has to be written in Zip64 form,
// and backups get that big. Each zip here is read back by our own reader
// (what Restore uses) and checked by Python's zipfile (as an independent
// unzip tool would read it).
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readZip, ZipWriter } from "../../src/lib/zip";

async function makeZip(files: [string, Uint8Array][], options?: { zip64Over?: number }) {
  const parts: Uint8Array[] = [];
  const zip = new ZipWriter(async (b) => void parts.push(b.slice()), options);
  const when = new Date(2026, 10, 11, 9, 30);
  for (const [name, data] of files) await zip.addFile(name, data, when);
  await zip.finish();
  return new Blob(parts as BlobPart[]);
}

// Python's own check: every entry's contents match its CRC
function pythonReads(zip: Blob, bytes: Uint8Array, expectCount: number) {
  const path = join(mkdtempSync(join(tmpdir(), "zip64-")), "test.zip");
  writeFileSync(path, bytes);
  const out = execFileSync("python3", ["-I", "-c", "import sys,zipfile\nz=zipfile.ZipFile(sys.argv[1])\nassert z.testzip() is None\nprint(len(z.namelist()))", path]).toString().trim();
  assert.equal(Number(out), expectCount, `python read ${zip.size} bytes`);
}

const has = (bytes: Uint8Array, sig: number) => {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let i = 0; i + 4 <= bytes.length; i++) if (v.getUint32(i, true) === sig) return true;
  return false;
};

const photo = (n: number, size: number) => Uint8Array.from({ length: size }, (_, i) => (i * 31 + n * 7) & 0xff);

test("a zip that fits stays classic (no Zip64 records)", async () => {
  const zip = await makeZip([["photos/a.jpg", photo(1, 500)], ["backup.json", new TextEncoder().encode("{}")]]);
  const bytes = new Uint8Array(await zip.arrayBuffer());
  assert.equal(has(bytes, 0x06064b50), false);
  pythonReads(zip, bytes, 2);
  const entries = await readZip(zip);
  assert.deepEqual(new Uint8Array(await (await entries.get("photos/a.jpg")!()).arrayBuffer()), photo(1, 500));
});

test("past the limit, sizes and offsets go in Zip64 form and read back exactly", async () => {
  // the limit lowered to 300 bytes stands in for 4 GB: the first photo
  // fits, the rest start past it, and one is itself "too big"
  const files: [string, Uint8Array][] = [
    ["photos/0.jpg", photo(0, 200)],
    ["photos/1.jpg", photo(1, 250)],
    ["photos/big.jpg", photo(2, 900)],
    ["Harbour Tower/photos/2.jpg", photo(3, 120)],
    ["backup.json", new TextEncoder().encode('{"type":"inspecta-backup"}')],
  ];
  const zip = await makeZip(files, { zip64Over: 300 });
  const bytes = new Uint8Array(await zip.arrayBuffer());
  assert.equal(has(bytes, 0x06064b50), true, "Zip64 end record");
  assert.equal(has(bytes, 0x07064b50), true, "Zip64 locator");
  pythonReads(zip, bytes, files.length);
  const entries = await readZip(zip);
  assert.deepEqual([...entries.keys()], files.map(([n]) => n));
  for (const [name, data] of files) assert.deepEqual(new Uint8Array(await (await entries.get(name)!()).arrayBuffer()), data, name);
});

test("more than 65,535 files: the count goes in Zip64 form", async () => {
  const files: [string, Uint8Array][] = Array.from({ length: 70000 }, (_, i) => [`photos/${i}.jpg`, photo(i, 3)]);
  const zip = await makeZip(files);
  const bytes = new Uint8Array(await zip.arrayBuffer());
  pythonReads(zip, bytes, 70000);
  const entries = await readZip(zip);
  assert.equal(entries.size, 70000);
  assert.deepEqual(new Uint8Array(await (await entries.get("photos/69999.jpg")!()).arrayBuffer()), photo(69999, 3));
});
