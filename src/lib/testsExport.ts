import { Share } from "@capacitor/share";
import { Capacitor } from "@capacitor/core";
import type { FfcpTest, FlowTest, Site, SpfSystem, StairTest } from "../db/types";
import { writeBlobToCache } from "./cacheFile";
import { numberedExport } from "./exportName";
import { ZipWriter } from "./zip";
import { testsFileName } from "./stairTest";

// Exporting a site's other tests (design canvas SiteTests, "Export tests"):
// the flow, stair and FFCP tests picked, as one PDF (a contents page, lib/testsContents, then a page per flow test,
// a page per stair of each stair test, a page per FFCP test) and / or one
// Excel (a sheet each; the FFCP tests share one). With
// both picked they go out as one zip holding the two, so they travel as a
// single attachment.

// contents: the contents page first (Export Other Tests Only; a stair or FFCP job's own export goes without)
async function buildTestsPdf(flow: FlowTest[], stair: StairTest[], sys: SpfSystem | undefined, site: Pick<Site, "name" | "address">, ffcp: FfcpTest[], contents: boolean): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const { logoImage, appendFlowPages, flowFooter } = await import("./flowPdf");
  const tc = await import("./testsContents");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const logo = await logoImage().catch(() => null);
  const stairs = stair.length && sys ? stair : [];
  // the contents page(s) first (measured with page 0 for now), then the tests
  const rough = [...flow.map((t) => tc.flowRow(t, 0)), ...stairs.map((t) => tc.stairRow(t, sys!, 0)), ...ffcp.map((t) => tc.ffcpRow(t, 0))];
  const front = contents ? tc.contentsPageCount(doc, rough) : 0;
  for (let i = 1; i < front; i++) doc.addPage();
  const rows: import("./testsContents").ContentsRow[] = [];
  // without a contents page, the first test goes on the blank first page
  let blank = !front;
  // the flow pages' footers once they're where they stay (the blank page gone)
  let flowPages: [number, number] = [0, -1];
  if (flow.length) {
    const shift = blank ? 1 : 0;
    await appendFlowPages(doc, flow, site, (t, page) => rows.push(tc.flowRow(t, page - shift)), false);
    if (blank) doc.deletePage(1); // appendFlowPages starts each test on a new page
    flowPages = [front + 1, doc.getNumberOfPages()];
    blank = false;
  }
  if (stairs.length) {
    const { appendStairPages } = await import("./stairPdf");
    for (const t of stairs) {
      rows.push(tc.stairRow(t, sys!, blank ? 1 : doc.getNumberOfPages() + 1));
      await appendStairPages(doc, [t], sys!, site, blank);
      blank = false;
    }
  }
  if (ffcp.length) (await import("./ffcpPdf")).appendFfcpPages(doc, ffcp, site, blank, logo, (t, page) => rows.push(tc.ffcpRow(t, page)));
  if (front) tc.drawContents(doc, 1, site, rows, doc.getNumberOfPages(), logo);
  for (let p = 1; p <= front; p++) flowFooter(doc, site, p);
  for (let p = flowPages[0]; p <= flowPages[1]; p++) flowFooter(doc, site, p);
  doc.setPage(doc.getNumberOfPages());
  return doc.output("blob");
}

async function buildTestsWorkbook(flow: FlowTest[], stair: StairTest[], sys: SpfSystem | undefined, site: Pick<Site, "name" | "address">, ffcp: FfcpTest[]): Promise<Blob> {
  const ExcelJS = (await import("exceljs")).default;
  const { addFlowSheets, addFlowCharts } = await import("./flowExcel");
  const wb = new ExcelJS.Workbook();
  const charts = flow.length ? await addFlowSheets(wb, flow, site, true) : [];
  if (flow.length) await (await import("./flowExcel")).addFlowDefectSheets(wb, flow);
  if (stair.length && sys) {
    const { addStairSheets, addStairPhotoSheets } = await import("./stairExcel");
    addStairSheets(wb, stair, sys, site);
    await addStairPhotoSheets(wb, stair, sys);
  }
  if (ffcp.length) await (await import("./ffcpExcel")).addFfcpSheet(wb, ffcp, site);
  const buffer = await wb.xlsx.writeBuffer({ zip: { compression: "STORE" } } as never);
  const bytes = await addFlowCharts(new Uint8Array(buffer as ArrayBuffer), charts);
  return new Blob([bytes as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

export type TestsFormat = "pdf" | "xlsx";

// builds the chosen formats and opens the share menu with them all
export async function exportTests(
  // sys: the stair tests' system (the site's own, unless given)
  opts: { flow: FlowTest[]; stair: StairTest[]; ffcp?: FfcpTest[]; site: Site; sys?: SpfSystem; formats: TestsFormat[]; contents?: boolean; fileName?: (ext: TestsFormat) => string },
  onStep: (percent: number, step: string) => void,
): Promise<void> {
  const { flow, stair, site, formats } = opts;
  const baseName = opts.fileName ?? ((ext: TestsFormat) => testsFileName(site, ext));
  const built: { blob: Blob; ext: TestsFormat }[] = [];
  for (const [i, f] of formats.entries()) {
    onStep(15 + i * 35, f === "pdf" ? "Drawing the pages…" : "Building the sheets…");
    const sys = opts.sys ?? site.spf;
    const ffcp = opts.ffcp ?? [];
    const blob = f === "pdf" ? await buildTestsPdf(flow, stair, sys, site, ffcp, !!opts.contents) : await buildTestsWorkbook(flow, stair, sys, site, ffcp);
    built.push({ blob, ext: f });
  }
  const files: { blob: Blob; name: string; shared: () => void }[] = [];
  if (built.length > 1) {
    // both formats: one zip, named like the reports, with the files inside
    // carrying the zip's name (and copy number)
    onStep(85, "Zipping…");
    const zipped = numberedExport(withExt(baseName(built[0].ext), "zip"));
    const chunks: Uint8Array[] = [];
    const zip = new ZipWriter(async (bytes) => void chunks.push(bytes.slice()));
    const now = new Date();
    for (const b of built) await zip.addFile(withExt(zipped.name, b.ext), new Uint8Array(await b.blob.arrayBuffer()), now);
    await zip.finish();
    files.push({ blob: new Blob(chunks as BlobPart[], { type: "application/zip" }), name: zipped.name, shared: zipped.shared });
  } else
    for (const b of built) {
      const numbered = numberedExport(baseName(b.ext));
      files.push({ blob: b.blob, name: numbered.name, shared: numbered.shared });
    }
  onStep(90, "Opening share menu…");
  const title = `${site.name} tests`;
  if (Capacitor.isNativePlatform()) {
    const uris: string[] = [];
    for (const f of files) uris.push(await writeBlobToCache(f.blob, f.name));
    onStep(100, "Finishing up…");
    await Share.share(uris.length === 1 ? { title, url: uris[0] } : { title, files: uris });
  } else {
    onStep(100, "Finishing up…");
    const list = files.map((f) => new File([f.blob], f.name, { type: f.blob.type }));
    if (navigator.canShare && navigator.canShare({ files: list })) await navigator.share({ files: list, title });
    else
      for (const f of files) {
        const url = URL.createObjectURL(f.blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = f.name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      }
  }
  files.forEach((f) => f.shared());
}

function withExt(name: string, ext: string): string {
  const dot = name.lastIndexOf(".");
  return `${dot > 0 ? name.slice(0, dot) : name}.${ext}`;
}
