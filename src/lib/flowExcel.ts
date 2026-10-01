import type { Workbook, Worksheet } from "exceljs";
import type { FlowTest, Site } from "../db/types";
import { demandPoints, flowOf, hasData, isReference, isTested, num, sectionName, sectionVerdicts } from "./flowTest";
import { ZipWriter } from "./zip";
// EnFact's own flow test sheets, cut down to the one tab each (their
// Combined System tab, which is the sprinkler tab with suction and RPM
// columns, and their HYDRANT tab), with the readings cleared. Inlined so
// the export works offline.
import sprinklerTemplateUrl from "../assets/flow-sprinkler.xlsx?inline";
import hydrantTemplateUrl from "../assets/flow-hydrant.xlsx?inline";
// the EnFact logo from the top right of their sheets
import logoUrl from "../assets/flow-logo.png?inline";

// Flow tests go into the site's Excel, each as its own tab laid out like
// EnFact's sheet: the header (location, date, equipment, tested by, demand
// points), a block per supply or pump (" Hg, flow, discharge, suction,
// RPM, amps, and PASS / FAIL), the graph, and the comment line. Blocks are
// copied from the template's first, as many as there are tested supplies
// or pumps, so a fourth supply or a second diesel fits. The graph is a
// real Excel chart, added to the file after ExcelJS has written it (ExcelJS
// can't make charts): see addFlowCharts.

interface Layout {
  url: string;
  lastCol: number; // copy columns A..this (the rest are the template's chart helpers)
  titleCell: string;
  location: string;
  date: string;
  equipment: string;
  testedBy: string;
  demandCols: [number, number]; // flow, kPa (from row 5)
  blockStart: number; // the first block's name row
  blockRows: number; // name row to the next block
  dataOffset: number; // name row to the first reading
  dataRows: number; // readings in the template's block
  col: { name: number; year: number; hg: number; flow: number; dis: number; suc: number; rpm: number; amps: number; result: number };
  conclusionOffset: number; // name row to the "Conclusion:" row
  passOffset: number; // name row to PASS (FAIL is the row below)
  chart: { from: number; to: number; fromCol: number; toCol: number };
  tail: { from: number; to: number };
  comment: string; // in the tail
  logo: { col: number; colOff: number; rowOff: number }; // 0-based column, EMU offsets
  // the date cell is too narrow for a date (Excel shows ###), so it's text
  // that runs on into the next cells
  dateAsText?: boolean;
}

// column letters → numbers
const C = (l: string) => l.charCodeAt(0) - 64;

const SPRINKLER: Layout = {
  url: sprinklerTemplateUrl,
  lastCol: C("N"),
  titleCell: "C1",
  location: "F3",
  date: "F4",
  equipment: "F5",
  testedBy: "F6",
  demandCols: [C("I"), C("J")],
  blockStart: 9,
  blockRows: 12,
  dataOffset: 2,
  dataRows: 8,
  col: { name: C("C"), year: C("F"), hg: C("C"), flow: C("D"), dis: C("F"), suc: C("G"), rpm: C("H"), amps: C("I"), result: C("N") },
  conclusionOffset: 3,
  passOffset: 5,
  chart: { from: 33, to: 44, fromCol: 2, toCol: 13 },
  tail: { from: 45, to: 45 },
  comment: "D45",
  logo: { col: 10, colOff: 533400, rowOff: 133350 },
};

const HYDRANT: Layout = {
  url: hydrantTemplateUrl,
  lastCol: C("M"),
  titleCell: "B1",
  location: "D3",
  date: "D4",
  equipment: "D5",
  testedBy: "D6",
  demandCols: [C("H"), C("I")],
  blockStart: 9,
  blockRows: 10,
  dataOffset: 2,
  dataRows: 7,
  col: { name: C("B"), year: C("E"), hg: C("C"), flow: C("B"), dis: C("E"), suc: C("F"), rpm: C("G"), amps: C("H"), result: C("M") },
  conclusionOffset: 2,
  passOffset: 4,
  chart: { from: 19, to: 31, fromCol: 1, toCol: 12 },
  tail: { from: 32, to: 47 },
  comment: "E32",
  logo: { col: 9, colOff: 638176, rowOff: 120039 },
  dateAsText: true,
};

const TITLE = { sprinkler: "SPRINKLER FLOW TEST RESULTS", hydrant: "HYDRANT FLOW TEST RESULTS", combined: "COMBINED SYSTEM FLOW TEST RESULTS" } as const;
const SHEET = { sprinkler: "SPRINKLER", hydrant: "HYDRANT", combined: "Combined System", blank: "Flow test" } as const;
// the app's curve colours, a touch darker for a white page
const EXCEL_COLOURS = ["1FA89B", "E8903A", "8E6CD9", "3A8EE6", "E0529C", "B89F1E"];

// Excel dates have no time zone: the local calendar day, in UTC
function excelDate(ms: number): Date {
  const d = new Date(ms);
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

const colLetter = (n: number) => String.fromCharCode(64 + n);

// a sheet name Excel accepts, not already taken
function sheetName(wb: Workbook, base: string): string {
  const clean = base.replace(/[[\]:*?/\\]/g, " ").trim().slice(0, 31) || "Flow test";
  let name = clean;
  for (let n = 2; wb.worksheets.some((w) => w.name.toLowerCase() === name.toLowerCase()); n++) name = `${clean.slice(0, 26)} (${n})`;
  return name;
}

// one chart to add to the written file
export interface FlowChart {
  sheet: string;
  from: { col: number; row: number }; // 0-based, like the drawing XML
  to: { col: number; row: number };
  xml: string;
}

type TemplateCache = Map<string, Workbook>;

async function loadTemplate(ExcelJS: typeof import("exceljs"), cache: TemplateCache, url: string): Promise<Workbook> {
  let wb = cache.get(url);
  if (!wb) {
    wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await (await fetch(url)).arrayBuffer());
    cache.set(url, wb);
  }
  return wb;
}

// Adds a tab per flow test to `wb` and returns the charts to add once it's
// written (see addFlowCharts). Blank sheets get a plain table.
export async function addFlowSheets(wb: Workbook, tests: FlowTest[], site: Pick<Site, "name" | "address">): Promise<FlowChart[]> {
  const ExcelJS = (await import("exceljs")).default;
  const cache: TemplateCache = new Map();
  const charts: FlowChart[] = [];
  let logo: number | null = null;
  for (const test of tests) {
    if (test.kind === "blank") {
      addBlankSheet(wb, test);
      continue;
    }
    const layout = test.kind === "hydrant" ? HYDRANT : SPRINKLER;
    const tplWb = await loadTemplate(ExcelJS as never, cache, layout.url);
    logo ??= wb.addImage({ buffer: new Uint8Array(await (await fetch(logoUrl)).arrayBuffer()) as never, extension: "png" });
    const chart = fillSheet(wb, tplWb, layout, test, site, logo);
    if (chart) charts.push(chart);
  }
  return charts;
}

function addBlankSheet(wb: Workbook, test: FlowTest) {
  // prints on one page wide, however many columns
  const ws = wb.addWorksheet(sheetName(wb, test.name || SHEET.blank), {
    pageSetup: { fitToPage: true, fitToWidth: 1, fitToHeight: 0, orientation: (test.columns?.length ?? 0) > 6 ? "landscape" : "portrait" },
  });
  const font = { name: "Arial", size: 10 };
  const thin = { style: "thin" as const, color: { argb: "FF000000" } };
  const border = { left: thin, right: thin, top: thin, bottom: thin };
  ws.getCell(1, 1).value = test.name;
  ws.getCell(1, 1).font = { ...font, size: 14, bold: true };
  const cols = test.columns ?? [];
  cols.forEach((h, j) => {
    const cell = ws.getCell(3, j + 1);
    cell.value = h;
    cell.font = { ...font, bold: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9D9D9" } };
    cell.border = border;
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    ws.getColumn(j + 1).width = 16;
  });
  (test.cells ?? []).forEach((row, i) =>
    row.forEach((v, j) => {
      const cell = ws.getCell(4 + i, j + 1);
      const n = num(v);
      // numbers as numbers, so they can be worked with in Excel
      cell.value = v.trim() === "" ? null : n !== null && String(n) === v.trim() ? n : v;
      cell.font = font;
      cell.border = border;
      cell.alignment = { horizontal: "center" };
    }),
  );
}

// copies one template row onto `out` row `to`: values, styles and height
function copyRow(tpl: Worksheet, ws: Worksheet, from: number, to: number, lastCol: number, values = true) {
  const src = tpl.getRow(from);
  const dst = ws.getRow(to);
  if (src.height) dst.height = src.height;
  for (let c = 1; c <= lastCol; c++) {
    const s = src.getCell(c);
    const d = dst.getCell(c);
    d.style = structuredClone(s.style);
    if (values && s.value !== null && s.value !== undefined && typeof s.value !== "object") d.value = s.value;
    else if (values && s.value && typeof s.value === "object" && "richText" in s.value) d.value = structuredClone(s.value);
  }
}

function fillSheet(wb: Workbook, tplWb: Workbook, L: Layout, test: FlowTest, site: Pick<Site, "name" | "address">, logo: number): FlowChart | null {
  const tpl = tplWb.worksheets[0];
  const name = sheetName(wb, SHEET[test.kind as keyof typeof TITLE]);
  const ws = wb.addWorksheet(name, { views: structuredClone(tpl.views), pageSetup: structuredClone(tpl.pageSetup), properties: structuredClone(tpl.properties) });
  for (let c = 1; c <= L.lastCol; c++) {
    const w = tpl.getColumn(c).width;
    if (w) ws.getColumn(c).width = w;
  }

  // template row → first row it lands on (header, chart and tail), for the merges
  const moved = new Map<number, number>();
  let out = 1;
  for (let r = 1; r < L.blockStart; r++, out++) {
    copyRow(tpl, ws, r, out, L.lastCol);
    moved.set(r, out);
  }

  const sections = test.sections.map((s, i) => ({ s, i })).filter(({ i }) => isTested(test, i));
  const verdicts = new Map(sectionVerdicts(test).map((v) => [v.index, v]));
  const year = String(new Date(test.testedAt).getFullYear());
  const series: { name: string; flow: string; dis: string; pts: { x: number; y: number }[] }[] = [];
  const hasAmps = sections.some(({ s }) => s.rows.some((r) => (r.amps ?? "").trim()));
  const hasRpm = sections.some(({ s }) => s.rows.some((r) => (r.rpm ?? "").trim()));

  for (const { s, i } of sections) {
    const top = out;
    // rows still holding only the prefilled step aren't readings
    const readings = s.rows.filter(hasData);
    const dataRows = Math.max(L.dataRows, readings.length);
    // name and heading rows, the readings (extra ones styled like the last), then the gap
    for (let r = 0; r < L.dataOffset; r++) copyRow(tpl, ws, L.blockStart + r, out++, L.lastCol);
    for (let j = 0; j < dataRows; j++) copyRow(tpl, ws, L.blockStart + L.dataOffset + Math.min(j, L.dataRows - 1), out++, L.lastCol);
    for (let r = L.dataOffset + L.dataRows; r < L.blockRows; r++) copyRow(tpl, ws, L.blockStart + r, out++, L.lastCol);

    ws.getCell(top, L.col.name).value = sectionName(test, i);
    ws.getCell(top, L.col.year).value = year;
    const head = top + 1;
    const headStyle = ws.getCell(head, L.col.dis).style;
    const heading = (col: number, text: string) => {
      const cell = ws.getCell(head, col);
      cell.value = text;
      cell.style = structuredClone(headStyle);
    };
    heading(L.col.suc, "Suction\n (kPa)");
    if (hasRpm || test.kind !== "hydrant") heading(L.col.rpm, "RPM");
    if (hasAmps) heading(L.col.amps, "Amps");

    const pts: { x: number; y: number }[] = [];
    readings.forEach((r, j) => {
      const row = top + L.dataOffset + j;
      const put = (col: number, v: string | undefined) => {
        const n = num(v);
        ws.getCell(row, col).value = n ?? (v?.trim() ? v.trim() : null);
      };
      put(L.col.hg, r.hg);
      const flow = flowOf(test, r);
      const flowCell = ws.getCell(row, L.col.flow);
      flowCell.value = flow === null ? null : Math.round(flow * 100) / 100;
      flowCell.numFmt = "0.00";
      put(L.col.dis, r.dis);
      put(L.col.suc, r.suc);
      if (hasRpm || test.kind !== "hydrant") put(L.col.rpm, r.rpm);
      if (hasAmps) put(L.col.amps, r.amps);
      const y = num(r.dis);
      if (flow !== null && y !== null) pts.push({ x: flow, y });
    });
    const first = top + L.dataOffset;
    const last = first + Math.max(readings.length, 1) - 1;
    series.push({
      name: `${sectionName(test, i)} - ${year}`,
      flow: `$${colLetter(L.col.flow)}$${first}:$${colLetter(L.col.flow)}$${last}`,
      dis: `$${colLetter(L.col.dis)}$${first}:$${colLetter(L.col.dis)}$${last}`,
      pts,
    });

    // "Conclusion:" then PASS (in the template's PASS cell) or FAIL (its FAIL cell)
    // (town main is a reference: no pass or fail)
    ws.getCell(top + L.conclusionOffset, L.col.result).value = isReference(test, i) ? "Conclusion: reference only" : "Conclusion:";
    const v = verdicts.get(i);
    if (v?.pass === true) ws.getCell(top + L.passOffset, L.col.result).value = "PASS";
    if (v?.pass === false) ws.getCell(top + L.passOffset + 1, L.col.result).value = "FAIL";
  }

  const chartTop = out;
  for (let r = L.chart.from; r <= L.chart.to; r++, out++) {
    copyRow(tpl, ws, r, out, L.lastCol);
    moved.set(r, out);
  }
  const tailShift = out - L.tail.from;
  for (let r = L.tail.from; r <= L.tail.to; r++, out++) {
    copyRow(tpl, ws, r, out, L.lastCol);
    moved.set(r, out);
  }

  // the template's merges, where they landed
  const merges: string[] = ((tpl.model as unknown as { merges?: string[] }).merges ?? []) as string[];
  for (const m of merges) {
    const mm = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(m);
    if (!mm) continue;
    const r1 = moved.get(Number(mm[2]));
    const r2 = moved.get(Number(mm[4]));
    if (r1 !== undefined && r2 !== undefined) ws.mergeCells(`${mm[1]}${r1}:${mm[3]}${r2}`);
  }

  // header
  ws.getCell(L.titleCell).value = TITLE[test.kind as keyof typeof TITLE];
  ws.getCell(L.location).value = [site.name, site.address].filter((x) => x?.trim()).join(", ");
  if (L.dateAsText) {
    const d = new Date(test.testedAt);
    ws.getCell(L.date).value = `${String(d.getDate()).padStart(2, "0")}-${d.toLocaleString("en-AU", { month: "short" }).slice(0, 3)}-${String(d.getFullYear() % 100).padStart(2, "0")}`;
  } else {
    ws.getCell(L.date).value = excelDate(test.testedAt);
    ws.getCell(L.date).numFmt = "dd-mmm-yy";
  }
  ws.getCell(L.equipment).value = test.equipment?.trim() || null;
  ws.getCell(L.testedBy).value = test.testedBy?.trim() || null;
  const dem = demandPoints(test.demand).slice(0, 4);
  dem.forEach((d, j) => {
    ws.getCell(5 + j, L.demandCols[0]).value = Math.round(d.x * 100) / 100;
    ws.getCell(5 + j, L.demandCols[1]).value = d.y;
  });
  const commentRef = /^([A-Z]+)(\d+)$/.exec(L.comment)!;
  ws.getCell(`${commentRef[1]}${Number(commentRef[2]) + tailShift}`).value = test.comment?.trim() || null;

  ws.pageSetup.printArea = `A1:${colLetter(L.lastCol)}${out - 1}`;

  // the logo, where the template has it (848 × 401)
  ws.addImage(logo, {
    tl: { nativeCol: L.logo.col, nativeColOff: L.logo.colOff, nativeRow: 0, nativeRowOff: L.logo.rowOff } as never,
    ext: { width: 180, height: 85 },
    editAs: "oneCell",
  });

  if (!series.length && !dem.length) return null;
  return {
    sheet: name,
    from: { col: L.chart.fromCol, row: chartTop - 1 },
    to: { col: L.chart.toCol, row: chartTop - 1 + (L.chart.to - L.chart.from) },
    xml: chartXml(
      TITLE[test.kind as keyof typeof TITLE].replace(/\w\S*/g, (w) => w[0] + w.slice(1).toLowerCase()),
      name,
      series,
      {
        name: "Demand Points",
        flow: `$${colLetter(L.demandCols[0])}$5:$${colLetter(L.demandCols[0])}$${4 + Math.max(dem.length, 1)}`,
        kpa: `$${colLetter(L.demandCols[1])}$5:$${colLetter(L.demandCols[1])}$${4 + Math.max(dem.length, 1)}`,
        pts: dem,
      },
    ),
  };
}

// ---- the chart ----

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function numRef(sheet: string, range: string, values: number[]) {
  return `<c:numRef><c:f>${esc(`'${sheet.replace(/'/g, "''")}'!${range}`)}</c:f><c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${values.length}"/>${values
    .map((v, i) => `<c:pt idx="${i}"><c:v>${v}</c:v></c:pt>`)
    .join("")}</c:numCache></c:numRef>`;
}

function richText(text: string, size: number, rot?: number) {
  return `<c:tx><c:rich><a:bodyPr${rot !== undefined ? ` rot="${rot}" vert="horz"` : ""}/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="${size}" b="1"><a:solidFill><a:srgbClr val="595959"/></a:solidFill></a:defRPr></a:pPr><a:r><a:rPr lang="en-AU" sz="${size}" b="1"><a:solidFill><a:srgbClr val="595959"/></a:solidFill></a:rPr><a:t>${esc(text)}</a:t></a:r></a:p></c:rich></c:tx>`;
}

function axis(id: number, cross: number, pos: "b" | "l", title: string) {
  return `<c:valAx><c:axId val="${id}"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="${pos}"/><c:majorGridlines><c:spPr><a:ln w="6350"><a:solidFill><a:srgbClr val="D9D9D9"/></a:solidFill></a:ln></c:spPr></c:majorGridlines><c:title>${richText(title, 1000, pos === "l" ? -5400000 : undefined)}<c:overlay val="0"/></c:title><c:numFmt formatCode="General" sourceLinked="0"/><c:majorTickMark val="out"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:spPr><a:ln w="9525"><a:solidFill><a:srgbClr val="BFBFBF"/></a:solidFill></a:ln></c:spPr><c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="900"><a:solidFill><a:srgbClr val="595959"/></a:solidFill></a:defRPr></a:pPr><a:endParaRPr lang="en-AU"/></a:p></c:txPr><c:crossAx val="${cross}"/><c:crosses val="autoZero"/><c:crossBetween val="midCat"/></c:valAx>`;
}

// A scatter chart like the template's: each supply's discharge curve against
// flow, and the demand points as red diamonds. The cached values let
// viewers that don't recalculate (phone previews) draw it too.
export function chartXml(
  title: string,
  sheet: string,
  series: { name: string; flow: string; dis: string; pts: { x: number; y: number }[] }[],
  demand: { name: string; flow: string; kpa: string; pts: { x: number; y: number }[] },
): string {
  const sers = series.map((s, i) => {
    const colour = EXCEL_COLOURS[i % EXCEL_COLOURS.length];
    return `<c:ser><c:idx val="${i}"/><c:order val="${i}"/><c:tx><c:v>${esc(s.name)}</c:v></c:tx><c:spPr><a:ln w="28575" cap="rnd"><a:solidFill><a:srgbClr val="${colour}"/></a:solidFill><a:round/></a:ln></c:spPr><c:marker><c:symbol val="circle"/><c:size val="6"/><c:spPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:ln w="19050"><a:solidFill><a:srgbClr val="${colour}"/></a:solidFill></a:ln></c:spPr></c:marker><c:xVal>${numRef(sheet, s.flow, s.pts.map((p) => p.x))}</c:xVal><c:yVal>${numRef(sheet, s.dis, s.pts.map((p) => p.y))}</c:yVal><c:smooth val="0"/></c:ser>`;
  });
  const d = series.length;
  sers.push(
    `<c:ser><c:idx val="${d}"/><c:order val="${d}"/><c:tx><c:v>${esc(demand.name)}</c:v></c:tx><c:spPr><a:ln w="19050"><a:noFill/></a:ln></c:spPr><c:marker><c:symbol val="diamond"/><c:size val="9"/><c:spPr><a:noFill/><a:ln w="19050"><a:solidFill><a:srgbClr val="E0301E"/></a:solidFill></a:ln></c:spPr></c:marker><c:xVal>${numRef(sheet, demand.flow, demand.pts.map((p) => p.x))}</c:xVal><c:yVal>${numRef(sheet, demand.kpa, demand.pts.map((p) => p.y))}</c:yVal><c:smooth val="0"/></c:ser>`,
  );
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><c:roundedCorners val="0"/><c:chart><c:title>${richText(title, 1400)}<c:overlay val="0"/></c:title><c:autoTitleDeleted val="0"/><c:plotArea><c:layout/><c:scatterChart><c:scatterStyle val="lineMarker"/><c:varyColors val="0"/>${sers.join("")}<c:axId val="510001"/><c:axId val="510002"/></c:scatterChart>${axis(510001, 510002, "b", "Flow (L/min)")}${axis(510002, 510001, "l", "Pressure (kPa)")}</c:plotArea><c:legend><c:legendPos val="r"/><c:overlay val="0"/></c:legend><c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart><c:spPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:ln w="9525"><a:solidFill><a:srgbClr val="D9D9D9"/></a:solidFill></a:ln></c:spPr></c:chartSpace>`;
}

// ---- adding the charts to the written file ----

// the entries of a zip whose files are all stored (ExcelJS with STORE)
function readStoredZip(bytes: Uint8Array): Map<string, Uint8Array> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Not a zip file");
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const files = new Map<string, Uint8Array>();
  for (let n = 0; n < count; n++) {
    const method = view.getUint16(p + 10, true);
    const size = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const local = view.getUint32(p + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (method !== 0) throw new Error(`Compressed entry in the workbook: ${name}`);
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    files.set(name, bytes.subarray(start, start + size));
  }
  return files;
}

const DRAWING_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing";
const CHART_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart";
const CHART_TYPE = "application/vnd.openxmlformats-officedocument.drawingml.chart+xml";
const DRAWING_TYPE = "application/vnd.openxmlformats-officedocument.drawing+xml";

// resolves "../drawings/drawing1.xml" against "xl/worksheets/"
function resolve(dir: string, target: string): string {
  if (target.startsWith("/")) return target.slice(1);
  const parts = dir.split("/").filter(Boolean);
  for (const seg of target.split("/")) {
    if (seg === "..") parts.pop();
    else if (seg !== ".") parts.push(seg);
  }
  return parts.join("/");
}

function nextRelId(rels: string): string {
  let n = 1;
  while (rels.includes(`Id="rId${n}"`)) n++;
  return `rId${n}`;
}

function anchor(chart: FlowChart, relId: string, id: number) {
  const pos = (p: { col: number; row: number }) => `<xdr:col>${p.col}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${p.row}</xdr:row><xdr:rowOff>0</xdr:rowOff>`;
  return `<xdr:twoCellAnchor><xdr:from>${pos(chart.from)}</xdr:from><xdr:to>${pos(chart.to)}</xdr:to><xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${id}" name="Chart ${id}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="${relId}"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>`;
}

// Puts each chart into the written workbook: its chart part, an anchor in
// the sheet's drawing (made if the sheet has none) and the content types.
export async function addFlowCharts(xlsx: Uint8Array, charts: FlowChart[]): Promise<Uint8Array> {
  if (!charts.length) return xlsx;
  const files = readStoredZip(xlsx);
  const text = (name: string) => new TextDecoder().decode(files.get(name)!);
  const put = (name: string, s: string) => files.set(name, new TextEncoder().encode(s));

  const workbook = text("xl/workbook.xml");
  const wbRels = text("xl/_rels/workbook.xml.rels");
  let types = text("[Content_Types].xml");
  let chartNo = 1;
  let drawingNo = 1;
  const nextFree = (prefix: string, n: number) => {
    while (files.has(`${prefix}${n}.xml`)) n++;
    return n;
  };

  for (const chart of charts) {
    const sheetEl = [...workbook.matchAll(/<sheet\b[^>]*>/g)].map((m) => m[0]).find((el) => el.includes(`name="${esc(chart.sheet)}"`));
    const rid = sheetEl && /r:id="([^"]+)"/.exec(sheetEl)?.[1];
    const target = rid && new RegExp(`<Relationship [^>]*Id="${rid}"[^>]*>`).exec(wbRels)?.[0].match(/Target="([^"]+)"/)?.[1];
    if (!target) continue;
    const sheetPath = resolve("xl", target);
    const sheetRelsPath = sheetPath.replace(/([^/]+)$/, "_rels/$1.rels");

    chartNo = nextFree("xl/charts/chart", chartNo);
    const chartPath = `xl/charts/chart${chartNo}.xml`;
    put(chartPath, chart.xml);
    types = types.replace("</Types>", `<Override PartName="/${chartPath}" ContentType="${CHART_TYPE}"/></Types>`);

    let sheetRels = files.has(sheetRelsPath)
      ? text(sheetRelsPath)
      : `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`;
    const drawingRel = new RegExp(`<Relationship [^>]*Type="${DRAWING_REL}"[^>]*>`).exec(sheetRels)?.[0];
    let drawingPath: string;
    if (drawingRel) {
      drawingPath = resolve(sheetPath.replace(/[^/]+$/, ""), /Target="([^"]+)"/.exec(drawingRel)![1]);
    } else {
      // no drawing on the sheet yet: make one
      drawingNo = nextFree("xl/drawings/drawing", drawingNo);
      drawingPath = `xl/drawings/drawing${drawingNo}.xml`;
      put(
        drawingPath,
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"></xdr:wsDr>`,
      );
      types = types.replace("</Types>", `<Override PartName="/${drawingPath}" ContentType="${DRAWING_TYPE}"/></Types>`);
      const id = nextRelId(sheetRels);
      sheetRels = sheetRels.replace("</Relationships>", `<Relationship Id="${id}" Type="${DRAWING_REL}" Target="../drawings/drawing${drawingNo}.xml"/></Relationships>`);
      put(sheetRelsPath, sheetRels);
      let sheet = text(sheetPath);
      if (!sheet.includes("xmlns:r=")) sheet = sheet.replace("<worksheet ", `<worksheet xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" `);
      // <drawing> goes before these, if the sheet has them
      const before = /<(legacyDrawing|legacyDrawingHF|drawingHF|picture|oleObjects|controls|webPublishItems|tableParts|extLst)\b|<\/worksheet>/.exec(sheet)!;
      sheet = sheet.slice(0, before.index) + `<drawing r:id="${id}"/>` + sheet.slice(before.index);
      put(sheetPath, sheet);
    }

    const drawingRelsPath = drawingPath.replace(/([^/]+)$/, "_rels/$1.rels");
    let drawingRels = files.has(drawingRelsPath)
      ? text(drawingRelsPath)
      : `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`;
    const chartRelId = nextRelId(drawingRels);
    drawingRels = drawingRels.replace("</Relationships>", `<Relationship Id="${chartRelId}" Type="${CHART_REL}" Target="../charts/chart${chartNo}.xml"/></Relationships>`);
    put(drawingRelsPath, drawingRels);
    let drawing = text(drawingPath);
    if (!drawing.includes("xmlns:a=")) drawing = drawing.replace("<xdr:wsDr ", `<xdr:wsDr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" `);
    const ids = [...drawing.matchAll(/cNvPr id="(\d+)"/g)].map((m) => Number(m[1]));
    drawing = drawing.replace("</xdr:wsDr>", `${anchor(chart, chartRelId, Math.max(1, ...ids) + 1)}</xdr:wsDr>`);
    put(drawingPath, drawing);
  }
  put("[Content_Types].xml", types);

  const parts: Uint8Array[] = [];
  const zip = new ZipWriter(async (b) => void parts.push(b.slice()));
  const now = new Date();
  // [Content_Types].xml first, as Excel expects
  for (const name of ["[Content_Types].xml", ...[...files.keys()].filter((n) => n !== "[Content_Types].xml")]) await zip.addFile(name, files.get(name)!, now);
  await zip.finish();
  const total = parts.reduce((n, p) => n + p.length, 0);
  const outBytes = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    outBytes.set(p, o);
    o += p.length;
  }
  return outBytes;
}
