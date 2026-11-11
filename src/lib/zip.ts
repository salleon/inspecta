// Minimal streaming .zip writer. Files are "stored" (not compressed): the
// contents are JPEGs, which don't compress further, and storing means each
// file can be written out and forgotten immediately — a zip of hundreds of
// full-resolution photos never has to sit in memory at once. Windows'
// "Extract All" (and every unzip tool) reads it normally.
//
// Zip64: the classic format stores sizes, offsets and the file count in 32
// (and 16) bits, so it stops at 4 GB and 65,535 files. Past that, the
// parts that don't fit are written in Zip64 form (a Zip64 "extra field" on
// the entry, and a Zip64 end record), which Windows, macOS, Android and
// every current unzip tool read. A zip that fits stays exactly classic.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// MS-DOS date/time, which zip entries use (local time, 2-second steps)
function dosDateTime(d: Date): { time: number; date: number } {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

const UTF8_NAMES = 0x0800; // general-purpose flag: file names are UTF-8
const MAX32 = 0xffffffff; // classic field limit (4 GB); also the "see Zip64" marker
const MAX16 = 0xffff; // classic file-count limit; also its "see Zip64" marker
const ZIP64_EXTRA = 0x0001;

interface Entry {
  name: Uint8Array;
  crc: number;
  size: number;
  offset: number;
  time: number;
  date: number;
  isDir: boolean;
}

function zip64Extra(values: number[]): Uint8Array {
  const v = new DataView(new ArrayBuffer(4 + 8 * values.length));
  v.setUint16(0, ZIP64_EXTRA, true);
  v.setUint16(2, 8 * values.length, true);
  values.forEach((n, i) => v.setBigUint64(4 + 8 * i, BigInt(n), true));
  return new Uint8Array(v.buffer);
}

export class ZipWriter {
  private offset = 0;
  private entries: Entry[] = [];
  private write: (bytes: Uint8Array) => Promise<void>;
  // values at or over these go in Zip64 form; lowered only by the tests,
  // to try the Zip64 path without writing 4 GB
  private byteLimit: number;
  private countLimit: number;

  // `write` receives the zip's bytes in order, e.g. to append to a file
  constructor(write: (bytes: Uint8Array) => Promise<void>, { zip64Over = MAX32 }: { zip64Over?: number } = {}) {
    this.write = write;
    this.byteLimit = Math.min(zip64Over, MAX32);
    this.countLimit = Math.min(zip64Over, MAX16);
  }

  async addFolder(path: string, modified: Date) {
    await this.add(path.endsWith("/") ? path : `${path}/`, new Uint8Array(0), modified, true);
  }

  async addFile(path: string, data: Uint8Array, modified: Date) {
    await this.add(path, data, modified, false);
  }

  private async add(path: string, data: Uint8Array, modified: Date, isDir: boolean) {
    const name = new TextEncoder().encode(path);
    const { time, date } = dosDateTime(modified);
    const entry: Entry = { name, crc: crc32(data), size: data.length, offset: this.offset, time, date, isDir };
    // the local header's sizes, in Zip64 form if they don't fit (a local
    // Zip64 extra holds both sizes)
    const big = data.length >= this.byteLimit;
    const extra = big ? zip64Extra([data.length, data.length]) : new Uint8Array(0);

    const header = new DataView(new ArrayBuffer(30));
    header.setUint32(0, 0x04034b50, true); // local file header
    header.setUint16(4, big ? 45 : 20, true); // version needed (4.5 for Zip64)
    header.setUint16(6, UTF8_NAMES, true);
    header.setUint16(8, 0, true); // method: stored
    header.setUint16(10, time, true);
    header.setUint16(12, date, true);
    header.setUint32(14, entry.crc, true);
    header.setUint32(18, big ? MAX32 : data.length, true); // compressed size
    header.setUint32(22, big ? MAX32 : data.length, true); // uncompressed size
    header.setUint16(26, name.length, true);
    header.setUint16(28, extra.length, true); // extra field length

    await this.emit(new Uint8Array(header.buffer));
    await this.emit(name);
    if (extra.length) await this.emit(extra);
    if (data.length) await this.emit(data);
    this.entries.push(entry);
  }

  // writes the central directory; call once, after the last file
  async finish() {
    const start = this.offset;
    for (const e of this.entries) {
      // what doesn't fit in 32 bits goes in the Zip64 extra, in this order
      const bigSize = e.size >= this.byteLimit;
      const bigOffset = e.offset >= this.byteLimit;
      const values = [...(bigSize ? [e.size, e.size] : []), ...(bigOffset ? [e.offset] : [])];
      const extra = values.length ? zip64Extra(values) : new Uint8Array(0);
      const rec = new DataView(new ArrayBuffer(46));
      rec.setUint32(0, 0x02014b50, true); // central directory header
      rec.setUint16(4, 45, true); // version made by (4.5: knows Zip64)
      rec.setUint16(6, values.length ? 45 : 20, true); // version needed
      rec.setUint16(8, UTF8_NAMES, true);
      rec.setUint16(10, 0, true); // stored
      rec.setUint16(12, e.time, true);
      rec.setUint16(14, e.date, true);
      rec.setUint32(16, e.crc, true);
      rec.setUint32(20, bigSize ? MAX32 : e.size, true);
      rec.setUint32(24, bigSize ? MAX32 : e.size, true);
      rec.setUint16(28, e.name.length, true);
      rec.setUint16(30, extra.length, true); // extra
      rec.setUint16(32, 0, true); // comment
      rec.setUint16(34, 0, true); // disk number
      rec.setUint16(36, 0, true); // internal attributes
      rec.setUint32(38, e.isDir ? 0x10 : 0, true); // external: MS-DOS directory flag
      rec.setUint32(42, bigOffset ? MAX32 : e.offset, true);
      await this.emit(new Uint8Array(rec.buffer));
      await this.emit(e.name);
      if (extra.length) await this.emit(extra);
    }
    const size = this.offset - start;
    const count = this.entries.length;
    const bigCount = count >= this.countLimit;
    const bigSize = size >= this.byteLimit;
    const bigStart = start >= this.byteLimit;
    if (bigCount || bigSize || bigStart) {
      // Zip64 end of central directory record, then its locator
      const zip64End = this.offset;
      const rec = new DataView(new ArrayBuffer(56));
      rec.setUint32(0, 0x06064b50, true);
      rec.setBigUint64(4, 44n, true); // size of the rest of this record
      rec.setUint16(12, 45, true); // version made by
      rec.setUint16(14, 45, true); // version needed
      rec.setUint32(16, 0, true); // this disk
      rec.setUint32(20, 0, true); // disk with the central directory
      rec.setBigUint64(24, BigInt(count), true); // entries on this disk
      rec.setBigUint64(32, BigInt(count), true); // entries in all
      rec.setBigUint64(40, BigInt(size), true);
      rec.setBigUint64(48, BigInt(start), true);
      await this.emit(new Uint8Array(rec.buffer));
      const loc = new DataView(new ArrayBuffer(20));
      loc.setUint32(0, 0x07064b50, true);
      loc.setUint32(4, 0, true); // disk with the Zip64 end record
      loc.setBigUint64(8, BigInt(zip64End), true);
      loc.setUint32(16, 1, true); // disks in all
      await this.emit(new Uint8Array(loc.buffer));
    }
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); // end of central directory
    end.setUint16(4, 0, true);
    end.setUint16(6, 0, true);
    end.setUint16(8, bigCount ? MAX16 : count, true);
    end.setUint16(10, bigCount ? MAX16 : count, true);
    end.setUint32(12, bigSize ? MAX32 : size, true);
    end.setUint32(16, bigStart ? MAX32 : start, true);
    end.setUint16(20, 0, true);
    await this.emit(new Uint8Array(end.buffer));
  }

  private async emit(bytes: Uint8Array) {
    await this.write(bytes);
    this.offset += bytes.length;
  }
}

// ---- reading ----

// A file in the zip, read only when it's used.
export type ZipEntry = () => Promise<Blob>;

// Reads the entries of a zip straight from the file, only the part being
// used: nothing is loaded until an entry is read. Ours are stored
// (uncompressed), but a zip that went through a computer or a cloud drive
// may come back compressed (deflate), so both are read; and Zip64, ours
// past 4 GB or anyone else's.
export async function readZip(file: Blob): Promise<Map<string, ZipEntry>> {
  const tailSize = Math.min(file.size, 65557 + 20);
  const tailStart = file.size - tailSize;
  const tail = new DataView(await file.slice(tailStart).arrayBuffer());
  let eocd = -1;
  for (let i = tail.byteLength - 22; i >= 0; i--) {
    if (tail.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("This file isn't a zip file.");
  let count = tail.getUint16(eocd + 10, true);
  let dirSize = tail.getUint32(eocd + 12, true);
  let dirOffset = tail.getUint32(eocd + 16, true);
  if (count === MAX16 || dirSize === MAX32 || dirOffset === MAX32) {
    // Zip64: the real values are in the Zip64 end record, which the
    // locator just before the classic end record points to
    if (eocd >= 20 && tail.getUint32(eocd - 20, true) === 0x07064b50) {
      const at = Number(tail.getBigUint64(eocd - 20 + 8, true));
      const rec = new DataView(await file.slice(at, at + 56).arrayBuffer());
      if (rec.byteLength < 56 || rec.getUint32(0, true) !== 0x06064b50) throw new Error("This zip file is damaged.");
      count = Number(rec.getBigUint64(32, true));
      dirSize = Number(rec.getBigUint64(40, true));
      dirOffset = Number(rec.getBigUint64(48, true));
    }
  }
  const dir = new DataView(await file.slice(dirOffset, dirOffset + dirSize).arrayBuffer());
  const entries = new Map<string, ZipEntry>();
  let p = 0;
  for (let n = 0; n < count; n++) {
    if (p + 46 > dir.byteLength || dir.getUint32(p, true) !== 0x02014b50) throw new Error("This zip file is damaged.");
    const method = dir.getUint16(p + 10, true);
    let compressed = dir.getUint32(p + 20, true);
    const uncompressed = dir.getUint32(p + 24, true);
    const nameLen = dir.getUint16(p + 28, true);
    const extraLen = dir.getUint16(p + 30, true);
    const commentLen = dir.getUint16(p + 32, true);
    let localOffset = dir.getUint32(p + 42, true);
    const name = new TextDecoder().decode(new Uint8Array(dir.buffer, dir.byteOffset + p + 46, nameLen));
    if (compressed === MAX32 || uncompressed === MAX32 || localOffset === MAX32) {
      // the Zip64 extra holds, in order, only the fields marked as too big
      for (let x = p + 46 + nameLen; x + 4 <= p + 46 + nameLen + extraLen; ) {
        const id = dir.getUint16(x, true);
        const len = dir.getUint16(x + 2, true);
        if (id === ZIP64_EXTRA) {
          let v = x + 4;
          const next = () => {
            const n = Number(dir.getBigUint64(v, true));
            v += 8;
            return n;
          };
          if (uncompressed === MAX32) next();
          if (compressed === MAX32) compressed = next();
          if (localOffset === MAX32) localOffset = next();
          break;
        }
        x += 4 + len;
      }
    }
    p += 46 + nameLen + extraLen + commentLen;
    if (method !== 0 && method !== 8) continue;
    entries.set(name, async () => {
      const local = new DataView(await file.slice(localOffset, localOffset + 30).arrayBuffer());
      const dataStart = localOffset + 30 + local.getUint16(26, true) + local.getUint16(28, true);
      const data = file.slice(dataStart, dataStart + compressed);
      if (method === 0) return data;
      return new Response(data.stream().pipeThrough(new DecompressionStream("deflate-raw"))).blob();
    });
  }
  return entries;
}
