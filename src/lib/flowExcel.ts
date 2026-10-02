import type { Workbook, Worksheet } from "exceljs";
import type { FlowTest, Site } from "../db/types";
import { num } from "./flowTest";
import { ZipWriter } from "./zip";
import { chartAxes, chartSeries, printDemand, printDetails, printSubtitle, printTables, printTitle, printUnit, PRINT_DEMAND, type PrintSeries } from "./flowPrint";
// the EnFact logo, as on the preview
import logoUrl from "../assets/flow-logo.png?inline";

// Flow tests in Excel, laid out like the export preview and the PDF (design
// canvas FlowExports): the title and logo, the details and demand, a table
// per supply or pump with PASS / FAIL, the graph and the comments. Built
// from the same pieces as the preview (lib/flowPrint), so what's previewed
// is what's exported. The graph is a real Excel chart, added to the file
// after ExcelJS has written it (ExcelJS can't make charts): see
// addFlowCharts. Its points sit in hidden columns to the right.

const SHEET = { sprinkler: "SPRINKLER", hydrant: "HYDRANT", combined: "Combined System", blank: "Flow test" } as const;

const FONT = "Arial";
const INK = "FF1C2833";
const HEAD_FILL = "FFE6EEF5";
const HEAD_LINE = "FFB8C6D2";
const CELL_LINE = "FFD3DBE2";
const BLUE = "FF1F6FB2";
const PASS = "FF127A3E";
const FAIL = "FFC62828";
const CHART_ROWS = 17; // the graph's height, in rows of 15 pt

const colLetter = (n: number) => {
  let s = "";
  for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};

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

// numbers as numbers, so they can be worked with in Excel
const cellValue = (v: string) => {
  const t = v.trim();
  if (!t) return null;
  const n = num(t);
  return n !== null && String(n) === t ? n : t;
};

// Adds a sheet per flow test to `wb` and returns the charts to add once it's
// written (see addFlowCharts).
// byTest: each sheet named after its test (a flow testing site's own
// workbook) rather than SPRINKLER / HYDRANT (a tab in the site's report)
export async function addFlowSheets(wb: Workbook, tests: FlowTest[], site: Pick<Site, "name" | "address">, byTest = false): Promise<FlowChart[]> {
  const charts: FlowChart[] = [];
  let logo: number | null = null;
  for (const test of tests) {
    logo ??= wb.addImage({ buffer: new Uint8Array(await (await fetch(logoUrl)).arrayBuffer()) as never, extension: "png" });
    const kindName = SHEET[test.kind];
    const name = sheetName(wb, byTest || test.kind === "blank" ? test.name.trim() || kindName : kindName);
    const chart = fillSheet(wb.addWorksheet(name), name, test, site, logo);
    if (chart) charts.push(chart);
  }
  return charts;
}

function fillSheet(ws: Worksheet, name: string, test: FlowTest, site: Pick<Site, "name" | "address">, logo: number): FlowChart | null {
  const tables = printTables(test);
  const cols = Math.max(4, ...tables.map((t) => t.head.length));
  const first = 2; // column B (A is a narrow margin)
  const last = first + cols - 1;
  const font = (extra: Partial<import("exceljs").Font> = {}) => ({ name: FONT, size: 10, color: { argb: INK }, ...extra });
  const line = (argb: string, style: "thin" | "medium" = "thin") => ({ style, color: { argb } });
  const box = (argb: string, style: "thin" | "medium" = "thin") => ({ left: line(argb, style), right: line(argb, style), top: line(argb, style), bottom: line(argb, style) });

  // columns: wide enough for their headings and values, B also for the detail labels
  ws.getColumn(1).width = 2;
  for (let j = 0; j < cols; j++) {
    const texts = tables.flatMap((t) => [t.head[j] ?? "", ...t.rows.map((r) => r[j] ?? "")]);
    const longest = Math.max(0, ...texts.map((t) => t.length));
    ws.getColumn(first + j).width = Math.min(30, Math.max(j === 0 ? 14 : 11, longest + 3));
  }

  let r = 1;
  // title, the short blue bar under it, the test's own name
  ws.getRow(r).height = 22;
  ws.getCell(r, first).value = printTitle(test);
  ws.getCell(r, first).font = font({ size: 14, bold: true });
  ws.getCell(r, first).alignment = { vertical: "bottom" };
  r++;
  ws.getRow(r).height = 4;
  ws.getCell(r, first).fill = { type: "pattern", pattern: "solid", fgColor: { argb: BLUE } };
  r++;
  const sub = printSubtitle(test);
  if (sub) {
    ws.getCell(r, first).value = sub;
    ws.getCell(r, first).font = font({ size: 11, bold: true });
    r++;
  }
  r++;

  // details, then the demand
  const details = printDetails(test, site);
  const demand = printDemand(test);
  if (demand.length) details.push({ label: "Demand", value: demand.join(", ") });
  for (const d of details) {
    ws.getCell(r, first).value = d.label;
    ws.getCell(r, first).font = font({ bold: true });
    ws.mergeCells(r, first + 1, r, last);
    ws.getCell(r, first + 1).value = d.value || "–";
    ws.getCell(r, first + 1).font = font();
    r++;
  }

  // a table per supply: its name and PASS / FAIL, the headings, the readings
  for (const t of tables) {
    r++;
    if (t.name) {
      ws.getCell(r, first).value = t.name;
      ws.getCell(r, first).font = font({ size: 11, bold: true });
      if (t.result) {
        const c = ws.getCell(r, last);
        const argb = t.result === "PASS" ? PASS : FAIL;
        c.value = t.result;
        c.font = font({ bold: true, color: { argb } });
        c.border = box(argb, "medium");
        c.alignment = { horizontal: "center", vertical: "middle" };
      }
      r++;
    }
    t.head.forEach((h, j) => {
      const c = ws.getCell(r, first + j);
      c.value = h;
      c.font = font({ bold: true, size: 9 });
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEAD_FILL } };
      c.border = box(HEAD_LINE);
      c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    });
    r++;
    for (const row of t.rows) {
      row.forEach((v, j) => {
        const c = ws.getCell(r, first + j);
        c.value = cellValue(v);
        c.font = font({ size: 9 });
        c.border = box(CELL_LINE);
        c.alignment = { horizontal: "center" };
      });
      r++;
    }
  }

  // the graph's rows, then the comments
  let chart: FlowChart | null = null;
  if (test.kind !== "blank") {
    r++;
    const top = r;
    r += CHART_ROWS;
    chart = graph(ws, name, test, { col: first - 1, row: top - 1 }, { col: last, row: top - 1 + CHART_ROWS }, last + 3);
    r++;
  }
  if (test.comment?.trim()) {
    ws.getCell(r, first).value = "Comments:";
    ws.getCell(r, first).font = font({ bold: true });
    ws.getCell(r, first).alignment = { vertical: "top" };
    ws.mergeCells(r, first + 1, r, last);
    const c = ws.getCell(r, first + 1);
    c.value = test.comment.trim();
    c.font = font();
    c.alignment = { wrapText: true, vertical: "top" };
    ws.getRow(r).height = Math.max(15, Math.ceil(test.comment.length / 70) * 13);
    r++;
  }

  // the logo, top right (848 × 401)
  ws.addImage(logo, { tl: { col: last - 1, row: 0 } as never, ext: { width: 110, height: 52 }, editAs: "oneCell" });
  ws.pageSetup = { fitToPage: true, fitToWidth: 1, fitToHeight: 0, orientation: "portrait", paperSize: 9, horizontalCentered: true, printArea: `A1:${colLetter(last + 1)}${r}`, margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 } };
  ws.views = [{ showGridLines: false }];
  return chart;
}

// The graph: each line's points and the demand points go in hidden columns
// from `dataCol`, and the chart (drawn later) reads them.
function graph(ws: Worksheet, sheet: string, test: FlowTest, from: FlowChart["from"], to: FlowChart["to"], dataCol: number): FlowChart | null {
  const { series, demand } = chartSeries(test);
  if (!series.length && !demand.length) return null;
  const refs: ChartSeries[] = [];
  let col = dataCol;
  const put = (label: string, pts: { x: number; y: number }[]) => {
    ws.getCell(1, col).value = label;
    pts.forEach((p, i) => {
      ws.getCell(2 + i, col).value = Math.round(p.x * 100) / 100;
      ws.getCell(2 + i, col + 1).value = p.y;
    });
    ws.getColumn(col).hidden = true;
    ws.getColumn(col + 1).hidden = true;
    const end = 1 + Math.max(pts.length, 1);
    const ref = { x: `$${colLetter(col)}$2:$${colLetter(col)}$${end}`, y: `$${colLetter(col + 1)}$2:$${colLetter(col + 1)}$${end}` };
    col += 2;
    return ref;
  };
  for (const s of series) refs.push({ ...s, ...put(s.label, s.pts) });
  if (demand.length) refs.push({ label: "Demand", colour: PRINT_DEMAND, dash: [], dots: false, width: 0, pts: demand, demand: true, ...put("Demand", demand) });
  const { ax, ay } = chartAxes(test, [...series.flatMap((s) => s.pts), ...demand]);
  return { sheet, from, to, xml: chartXml(sheet, refs, { x: ax, y: ay }, printUnit(test)) };
}

// ---- the chart ----

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function numRef(sheet: string, range: string, values: number[]) {
  return `<c:numRef><c:f>${esc(`'${sheet.replace(/'/g, "''")}'!${range}`)}</c:f><c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${values.length}"/>${values
    .map((v, i) => `<c:pt idx="${i}"><c:v>${v}</c:v></c:pt>`)
    .join("")}</c:numCache></c:numRef>`;
}

function richText(text: string, size: number, rot?: number) {
  return `<c:tx><c:rich><a:bodyPr${rot !== undefined ? ` rot="${rot}" vert="horz"` : ""}/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="${size}" b="0"><a:solidFill><a:srgbClr val="595959"/></a:solidFill></a:defRPr></a:pPr><a:r><a:rPr lang="en-AU" sz="${size}" b="0"><a:solidFill><a:srgbClr val="595959"/></a:solidFill></a:rPr><a:t>${esc(text)}</a:t></a:r></a:p></c:rich></c:tx>`;
}

type Scale = { min: number; max: number; step: number };

function axis(id: number, cross: number, pos: "b" | "l", title: string, scale: Scale) {
  return `<c:valAx><c:axId val="${id}"/><c:scaling><c:orientation val="minMax"/><c:max val="${scale.max}"/><c:min val="${scale.min}"/></c:scaling><c:delete val="0"/><c:axPos val="${pos}"/><c:majorGridlines><c:spPr><a:ln w="6350"><a:solidFill><a:srgbClr val="E3E8EC"/></a:solidFill></a:ln></c:spPr></c:majorGridlines><c:title>${richText(title, 900, pos === "l" ? -5400000 : undefined)}<c:overlay val="0"/></c:title><c:numFmt formatCode="General" sourceLinked="0"/><c:majorTickMark val="out"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:spPr><a:ln w="9525"><a:solidFill><a:srgbClr val="9AA6B1"/></a:solidFill></a:ln></c:spPr><c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="900"><a:solidFill><a:srgbClr val="55636F"/></a:solidFill></a:defRPr></a:pPr><a:endParaRPr lang="en-AU"/></a:p></c:txPr><c:crossAx val="${cross}"/><c:crosses val="autoZero"/><c:crossBetween val="midCat"/><c:majorUnit val="${scale.step}"/></c:valAx>`;
}

export type ChartSeries = PrintSeries & { x: string; y: string; demand?: boolean };

const hex = (c: string) => c.replace("#", "").toUpperCase();

// A scatter chart like the preview's: each line in its colour (town main
// dashed, suction dotted), the demand points as red diamonds, the legend on
// the right and the same axes. The cached values let viewers that don't
// recalculate (phone previews) draw it too.
export function chartXml(sheet: string, series: ChartSeries[], scale: { x: Scale; y: Scale }, unit = "L/min"): string {
  const sers = series.map((s, i) => {
    const colour = hex(s.colour);
    const ln = s.demand
      ? `<a:ln w="19050"><a:noFill/></a:ln>`
      : `<a:ln w="${s.dash.length ? 19050 : 22225}" cap="rnd"><a:solidFill><a:srgbClr val="${colour}"/></a:solidFill>${s.dash.length ? `<a:prstDash val="${s.dash[0] > 2 ? "dash" : "sysDot"}"/>` : ""}<a:round/></a:ln>`;
    const marker = s.demand
      ? `<c:marker><c:symbol val="diamond"/><c:size val="8"/><c:spPr><a:noFill/><a:ln w="15875"><a:solidFill><a:srgbClr val="${colour}"/></a:solidFill></a:ln></c:spPr></c:marker>`
      : s.dots
        ? `<c:marker><c:symbol val="circle"/><c:size val="4"/><c:spPr><a:solidFill><a:srgbClr val="${colour}"/></a:solidFill><a:ln w="9525"><a:solidFill><a:srgbClr val="${colour}"/></a:solidFill></a:ln></c:spPr></c:marker>`
        : `<c:marker><c:symbol val="none"/></c:marker>`;
    return `<c:ser><c:idx val="${i}"/><c:order val="${i}"/><c:tx><c:v>${esc(s.label)}</c:v></c:tx><c:spPr>${ln}</c:spPr>${marker}<c:xVal>${numRef(sheet, s.x, s.pts.map((p) => Math.round(p.x * 100) / 100))}</c:xVal><c:yVal>${numRef(sheet, s.y, s.pts.map((p) => p.y))}</c:yVal><c:smooth val="0"/></c:ser>`;
  });
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><c:roundedCorners val="0"/><c:chart><c:autoTitleDeleted val="1"/><c:plotArea><c:layout/><c:scatterChart><c:scatterStyle val="lineMarker"/><c:varyColors val="0"/>${sers.join("")}<c:axId val="510001"/><c:axId val="510002"/></c:scatterChart>${axis(510001, 510002, "b", `Flow (${unit})`, scale.x)}${axis(510002, 510001, "l", "Pressure (kPa)", scale.y)}<c:spPr><a:noFill/><a:ln w="9525"><a:solidFill><a:srgbClr val="9AA6B1"/></a:solidFill></a:ln></c:spPr></c:plotArea><c:legend><c:legendPos val="r"/><c:overlay val="0"/><c:spPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:ln w="9525"><a:solidFill><a:srgbClr val="B8C6D2"/></a:solidFill></a:ln></c:spPr><c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="900"><a:solidFill><a:srgbClr val="1C2833"/></a:solidFill></a:defRPr></a:pPr><a:endParaRPr lang="en-AU"/></a:p></c:txPr></c:legend><c:plotVisOnly val="0"/><c:dispBlanksAs val="gap"/></c:chart><c:spPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:ln><a:noFill/></a:ln></c:spPr></c:chartSpace>`;
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

// A flow testing site's own workbook: a sheet per flow test, named after it
// (design canvas FlowExports), laid out like the preview, with its graph.
export async function buildFlowWorkbook(tests: FlowTest[], site: Pick<Site, "name" | "address">): Promise<Blob> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const charts = await addFlowSheets(wb, tests, site, true);
  const buffer = await wb.xlsx.writeBuffer({ zip: { compression: "STORE" } } as never);
  const bytes = await addFlowCharts(new Uint8Array(buffer as ArrayBuffer), charts);
  return new Blob([bytes as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
