import { Share } from "@capacitor/share";
import { Capacitor } from "@capacitor/core";
import type { FlowTest, Site, SpfSystem, StairTest } from "../db/types";
import { writeBlobToCache } from "./cacheFile";
import { numberedExport } from "./exportName";
import { testsFileName } from "./stairTest";

// Exporting a site's other tests (design canvas SiteTests, "Export tests"):
// the flow and stair tests picked, as one PDF (a page per flow test, a page
// per stair of each stair test) and / or one Excel (a sheet each), shared
// together.

export async function buildTestsPdf(flow: FlowTest[], stair: StairTest[], sys: SpfSystem | undefined, site: Pick<Site, "name" | "address">): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  if (flow.length) {
    await (await import("./flowPdf")).appendFlowPages(doc, flow, site);
    doc.deletePage(1); // appendFlowPages starts each test on a new page
  }
  if (stair.length && sys) await (await import("./stairPdf")).appendStairPages(doc, stair, sys, site, !flow.length);
  return doc.output("blob");
}

export async function buildTestsWorkbook(flow: FlowTest[], stair: StairTest[], sys: SpfSystem | undefined, site: Pick<Site, "name" | "address">): Promise<Blob> {
  const ExcelJS = (await import("exceljs")).default;
  const { addFlowSheets, addFlowCharts } = await import("./flowExcel");
  const wb = new ExcelJS.Workbook();
  const charts = flow.length ? await addFlowSheets(wb, flow, site, true) : [];
  if (stair.length && sys) (await import("./stairExcel")).addStairSheets(wb, stair, sys, site);
  const buffer = await wb.xlsx.writeBuffer({ zip: { compression: "STORE" } } as never);
  const bytes = await addFlowCharts(new Uint8Array(buffer as ArrayBuffer), charts);
  return new Blob([bytes as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

export type TestsFormat = "pdf" | "xlsx";

// builds the chosen formats and opens the share menu with them all
export async function exportTests(
  opts: { flow: FlowTest[]; stair: StairTest[]; site: Site; formats: TestsFormat[]; fileName?: (ext: TestsFormat) => string },
  onStep: (percent: number, step: string) => void,
): Promise<void> {
  const { flow, stair, site, formats } = opts;
  const files: { blob: Blob; name: string; shared: () => void }[] = [];
  for (const [i, f] of formats.entries()) {
    onStep(15 + i * 35, f === "pdf" ? "Drawing the pages…" : "Building the sheets…");
    const blob = f === "pdf" ? await buildTestsPdf(flow, stair, site.spf, site) : await buildTestsWorkbook(flow, stair, site.spf, site);
    const numbered = numberedExport((opts.fileName ?? ((ext) => testsFileName(site, ext)))(f));
    files.push({ blob, name: numbered.name, shared: numbered.shared });
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
