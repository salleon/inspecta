import { Directory, Filesystem } from "@capacitor/filesystem";

// Writes a file into the app's cache a few MB at a time, for handing to the
// Android share sheet (navigator.share doesn't work for files inside the
// WebView). Capacitor's Filesystem only takes base64 text, so writing a big
// export as one giant string could run the WebView out of memory; this
// never holds more than one chunk. Chunks are a multiple of 3 bytes so
// each base64-encodes cleanly on its own.

const CHUNK_BYTES = 3 * 1024 * 1024;

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

export class CacheFileWriter {
  private pending: Uint8Array[] = [];
  private pendingBytes = 0;
  private started = false;
  private uri = "";
  private filename: string;

  constructor(filename: string) {
    this.filename = filename;
  }

  async write(bytes: Uint8Array) {
    this.pending.push(bytes);
    this.pendingBytes += bytes.length;
    if (this.pendingBytes >= CHUNK_BYTES) await this.flush(false);
  }

  // finishes the file and returns its URI for Share.share()
  async close(): Promise<string> {
    await this.flush(true);
    if (!this.started) await this.append(new Uint8Array(0));
    return this.uri;
  }

  private async flush(all: boolean) {
    const joined = new Uint8Array(this.pendingBytes);
    let at = 0;
    for (const p of this.pending) {
      joined.set(p, at);
      at += p.length;
    }
    // everything but a remainder that isn't a multiple of 3 (unless final)
    const take = all ? joined.length : joined.length - (joined.length % 3);
    for (let i = 0; i < take; i += CHUNK_BYTES) await this.append(joined.subarray(i, Math.min(take, i + CHUNK_BYTES)));
    const rest = joined.subarray(take);
    this.pending = rest.length ? [rest.slice()] : [];
    this.pendingBytes = rest.length;
  }

  private async append(bytes: Uint8Array) {
    const data = toBase64(bytes);
    if (!this.started) {
      const written = await Filesystem.writeFile({ path: this.filename, data, directory: Directory.Cache });
      this.uri = written.uri;
      this.started = true;
    } else {
      await Filesystem.appendFile({ path: this.filename, data, directory: Directory.Cache });
    }
  }
}

// a finished Blob (the PDF / Excel file), streamed into the cache
export async function writeBlobToCache(blob: Blob, filename: string): Promise<string> {
  const out = new CacheFileWriter(filename);
  for (let offset = 0; offset < blob.size; offset += CHUNK_BYTES) {
    await out.write(new Uint8Array(await blob.slice(offset, offset + CHUNK_BYTES).arrayBuffer()));
  }
  return out.close();
}
