// Minimal streaming .zip writer. Files are "stored" (not compressed): the
// contents are JPEGs, which don't compress further, and storing means each
// file can be written out and forgotten immediately — a zip of hundreds of
// full-resolution photos never has to sit in memory at once. Windows'
// "Extract All" (and every unzip tool) reads it normally.

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
const MAX_ZIP_BYTES = 0xffffffff; // classic (non-Zip64) format limit, 4 GB

interface Entry {
  name: Uint8Array;
  crc: number;
  size: number;
  offset: number;
  time: number;
  date: number;
  isDir: boolean;
}

export class ZipWriter {
  private offset = 0;
  private entries: Entry[] = [];
  private write: (bytes: Uint8Array) => Promise<void>;

  // `write` receives the zip's bytes in order, e.g. to append to a file
  constructor(write: (bytes: Uint8Array) => Promise<void>) {
    this.write = write;
  }

  async addFolder(path: string, modified: Date) {
    await this.add(path.endsWith("/") ? path : `${path}/`, new Uint8Array(0), modified, true);
  }

  async addFile(path: string, data: Uint8Array, modified: Date) {
    await this.add(path, data, modified, false);
  }

  private async add(path: string, data: Uint8Array, modified: Date, isDir: boolean) {
    if (this.offset + data.length + 1024 > MAX_ZIP_BYTES || this.entries.length >= 0xfffe) {
      throw new Error("Too many photos for one zip file (over 4 GB)");
    }
    const name = new TextEncoder().encode(path);
    const { time, date } = dosDateTime(modified);
    const entry: Entry = { name, crc: crc32(data), size: data.length, offset: this.offset, time, date, isDir };

    const header = new DataView(new ArrayBuffer(30));
    header.setUint32(0, 0x04034b50, true); // local file header
    header.setUint16(4, 20, true); // version needed (2.0)
    header.setUint16(6, UTF8_NAMES, true);
    header.setUint16(8, 0, true); // method: stored
    header.setUint16(10, time, true);
    header.setUint16(12, date, true);
    header.setUint32(14, entry.crc, true);
    header.setUint32(18, data.length, true); // compressed size
    header.setUint32(22, data.length, true); // uncompressed size
    header.setUint16(26, name.length, true);
    header.setUint16(28, 0, true); // extra field length

    await this.emit(new Uint8Array(header.buffer));
    await this.emit(name);
    if (data.length) await this.emit(data);
    this.entries.push(entry);
  }

  // writes the central directory; call once, after the last file
  async finish() {
    const start = this.offset;
    for (const e of this.entries) {
      const rec = new DataView(new ArrayBuffer(46));
      rec.setUint32(0, 0x02014b50, true); // central directory header
      rec.setUint16(4, 20, true); // version made by
      rec.setUint16(6, 20, true); // version needed
      rec.setUint16(8, UTF8_NAMES, true);
      rec.setUint16(10, 0, true); // stored
      rec.setUint16(12, e.time, true);
      rec.setUint16(14, e.date, true);
      rec.setUint32(16, e.crc, true);
      rec.setUint32(20, e.size, true);
      rec.setUint32(24, e.size, true);
      rec.setUint16(28, e.name.length, true);
      rec.setUint16(30, 0, true); // extra
      rec.setUint16(32, 0, true); // comment
      rec.setUint16(34, 0, true); // disk number
      rec.setUint16(36, 0, true); // internal attributes
      rec.setUint32(38, e.isDir ? 0x10 : 0, true); // external: MS-DOS directory flag
      rec.setUint32(42, e.offset, true);
      await this.emit(new Uint8Array(rec.buffer));
      await this.emit(e.name);
    }
    const size = this.offset - start;
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); // end of central directory
    end.setUint16(4, 0, true);
    end.setUint16(6, 0, true);
    end.setUint16(8, this.entries.length, true);
    end.setUint16(10, this.entries.length, true);
    end.setUint32(12, size, true);
    end.setUint32(16, start, true);
    end.setUint16(20, 0, true);
    await this.emit(new Uint8Array(end.buffer));
  }

  private async emit(bytes: Uint8Array) {
    await this.write(bytes);
    this.offset += bytes.length;
  }
}
