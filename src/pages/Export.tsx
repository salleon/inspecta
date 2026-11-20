import { say } from "../components/Message";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { jsPDF } from "jspdf";
import { Share } from "@capacitor/share";
import { Capacitor } from "@capacitor/core";
import type { Finding, FlowTest, Photo, Site, SiteReport, SpfSystem, StairTest } from "../db/types";
import { countExportCopies, getExportCopy, getSite, listAttachedJobs, listFindings, listFlowTests, listPhotos, listStairTests, saveSiteReports, saveSiteSpf, updateFinding } from "../db/db";
import { modesTested } from "../lib/ffcp";
import StairNameCheck, { stairsToName } from "../components/StairNameCheck";
import { stairTestHasData } from "../lib/stairTest";
import { IconChevronLeft, IconShare } from "../components/Icons";
import RoundIconButton from "../components/RoundIconButton";
import ProgressOverlay from "../components/ProgressOverlay";
import { getInitials, getInspectorName } from "../lib/profile";
import { PREVIEW_MAX_EDGE, watermark } from "../lib/watermark";
import { CacheFileWriter, writeBlobToCache } from "../lib/cacheFile";
import { numberedExport } from "../lib/exportName";
import { startExportTimer } from "../lib/exportTimings";
import { pauseCopyBackfill } from "../lib/copyBackfill";
import { countPhotos, photosZipName, writePhotosZip } from "../lib/photosZip";
import DefectTypePill from "../components/DefectTypePill";
import CategoriseFlow from "../components/CategoriseFlow";
import { BAR_FILL, headingText, reportRows, type Heading } from "../lib/esrGrouping";
import { forProjectReport } from "../lib/projectReport";
import { newSince, reportEntries } from "../lib/customReports";
import { flowTestHasData } from "../lib/flowTest";
import CustomReport, { ReportChips } from "../components/CustomReport";
import { esrItem } from "../lib/esrCategories";
import { learnCategory, unlearnCategory } from "../lib/esrSuggest";
import { useBackHandler } from "../lib/backButton";
import art from "virtual:edition-art";
import { IS_CONTRACTOR } from "../lib/edition";
import { coverBackground, coverColours, drawCoverLogo } from "../lib/contractorCover";
import { getCompany } from "../lib/company";
import { useTourScene } from "../lib/tour";
import { DEFECT_TYPES } from "../lib/defectTypes";
import { numericDate } from "../lib/dates";

// the export loading screen shows for at least this long: a quick export
// still gets its animation, counting smoothly up to 100%
const MIN_LOADER_MS = 4000;

// Blob -> base64 (without the data: URL prefix), which is what
// Filesystem.writeFile wants for a binary file.
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

type ShareKind = "pdf" | "excel" | "photos";
const SHARE_LABEL: Record<ShareKind, string> = { pdf: "PDF", excel: "Excel file", photos: "photos" };

interface FindingImages {
  finding: Finding;
  photos: Photo[]; // the exports stamp their own copies (see lib/exportCopy)
}


const formatDate = numericDate;

// "Tuesday, 22 September 2026" — the cover page's date badge, spelled out
// in full since it's the largest, most prominent date on the report.
function formatFullDate(ms: number) {
  return new Date(ms).toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

// "Site name - Full name" — shown as the document heading, the in-app
// preview header, and the native share-sheet title, so every surface
// agrees on whose report this is. Falls back gracefully if the inspector
// hasn't set a name (shouldn't happen — Onboarding gates the whole app).
function reportTitle(siteName: string | undefined, inspectorName: string) {
  const site = siteName ?? "Inspection";
  return inspectorName ? `${site} - ${inspectorName}` : site;
}

// "harbourline-apartments-LS.pdf" — site name slugified, plus the
// inspector's capitalised initials, so reports from different team members
// never collide or get mixed up once they're all sitting in one inbox.
function reportFilename(siteName: string | undefined, inspectorName: string, ext: "pdf" | "xlsx" = "pdf") {
  const slug = (siteName ?? "inspection").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  const initials = getInitials(inspectorName);
  return initials ? `${slug}-${initials}.${ext}` : `${slug}.${ext}`;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// Fetches a bundled static asset (e.g. an imported PNG's built URL) and
// returns it as a base64 data URL, plus its natural size read from a second
// Image loaded off that data URL. Passing jsPDF a data URL *string* rather
// than an HTMLImageElement matters: doc.addImage() with an element draws it
// onto an offscreen canvas internally and reads the pixels back out via
// canvas.toDataURL(), and on a Capacitor Android WebView that readback can
// throw a "tainted canvas" SecurityError for bundled assets even though the
// same image displays fine as a plain <img> — it only ever showed up on
// device, never in the desktop preview. A data URL skips that canvas
// round-trip entirely, so it can't be tainted.
async function loadAssetAsDataUrl(src: string): Promise<{ dataUrl: string; naturalWidth: number; naturalHeight: number }> {
  const res = await fetch(src);
  const blob = await res.blob();
  const base64 = await blobToBase64(blob);
  const dataUrl = `data:${blob.type || "image/png"};base64,${base64}`;
  const img = await loadImage(dataUrl);
  return { dataUrl, naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight };
}

export default function ExportPreview() {
  const { siteId } = useParams<{ siteId: string }>();
  const navigate = useNavigate();
  const [site, setSite] = useState<Site | null>(null);
  // every finding on the site, in list order (not yet in report order)
  const [allItems, setAllItems] = useState<FindingImages[]>([]);
  // the customised report being looked at (null: the whole site)
  const [reportId, setReportId] = useState<string | null>(null);
  // Create Customised Report open: a new one, or one being changed
  const [editing, setEditing] = useState<SiteReport | "new" | null>(null);
  useTourScene("custom-report", () => setEditing("new"), () => setEditing(null));
  const report = site?.reports?.find((r) => r.id === reportId) ?? null;
  // what this report exports, in its order: the whole site (Projects sites
  // in the order the photos were taken, with no ESR sections), or the
  // customised report's findings
  const siteItems = site?.kind === "project" ? forProjectReport(allItems) : allItems;
  const items = report ? reportEntries(allItems, report) : siteItems;

  async function saveReports(reports: SiteReport[]) {
    if (!site) return;
    await saveSiteReports(site.id, reports);
    setSite({ ...site, reports });
  }
  const [loading, setLoading] = useState(true);
  // the preview's small stamped photos, by photo id, filled in after the
  // findings show (the share buttons don't wait for them)
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [sharing, setSharing] = useState<ShareKind | null>(null);
  // an export pauses the previews so it has the phone to itself
  const sharingRef = useRef(false);
  useEffect(() => {
    sharingRef.current = sharing !== null;
    // and the background copies for older photos (lib/copyBackfill)
    pauseCopyBackfill(sharing !== null);
  }, [sharing]);
  // Loading screen for both exports: 0–85% while photos are stamped and
  // added (nearly all the time), then building the file, then handing it to
  // the share menu
  const [exportProgress, setExportProgress] = useState<{ percent: number; step: string } | null>(null);
  // when the current export started (performance.now()), for the loading screen's minimum time
  const shareStartRef = useRef(0);
  // ESR categories: before a PDF / Excel export with
  // Uncategorised findings, offer to categorise them first — the popup, then
  // the Categorise screen. Asked once per visit to this screen.
  const [askCategorise, setAskCategorise] = useState<ShareKind | null>(null);
  // the tour shows the uncategorised question and the Create Customised Report sheet
  useTourScene("categorise", () => setAskCategorise("pdf"), () => setAskCategorise(null));
  const [categorising, setCategorising] = useState<ShareKind | null>(null);
  // the findings the Categorise screen goes through, fixed when it opens
  // (so "‹ Previous" can return to ones categorised since)
  const [categoriseIds, setCategoriseIds] = useState<string[]>([]);
  const [categoriseAsked, setCategoriseAsked] = useState(false);
  // an export to start once the categories just picked are in `items`
  const [pendingShare, setPendingShare] = useState<ShareKind | null>(null);
  // the stair name check before an export with stair tests in it, and the
  // export to carry on with once the names are in `site`
  const [nameCheck, setNameCheck] = useState<{ kind: ShareKind; job: Site } | null>(null);
  const [unnamedJob, setUnnamedJob] = useState<Site | null>(null);
  const [afterNames, setAfterNames] = useState<ShareKind | null>(null);

  useEffect(() => {
    if (!afterNames) return;
    setAfterNames(null);
    void requestShare(afterNames, true);
    // runs once, with the render that has the names just saved
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [afterNames]);

  // Back with the popup open closes it and goes back as usual (to the
  // findings list) — no extra press.
  useBackHandler(() => {
    setAskCategorise(null);
    return false;
  });

  useEffect(() => {
    if (!pendingShare) return;
    setPendingShare(null);
    void handleShare(pendingShare);
    // runs once per requested export, with that render's items
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingShare]);

  useEffect(() => {
    if (!siteId) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      const s = await getSite(siteId!);
      const findings = await listFindings(siteId!);
      const built: FindingImages[] = [];
      for (const finding of findings) built.push({ finding, photos: await listPhotos(finding.id) });
      // an attached stair job still on placeholder stair names (asked before an export)
      const unnamed = (await attachedTests(siteId)).stairs.find((x) => stairsToName(x.sys.stairs).length);
      if (cancelled) return;
      setUnnamedJob(unnamed?.job ?? null);
      setSite(s ?? null);
      // Projects sites: no ESR sections, in the order the photos were taken
      const ordered = s?.kind === "project" ? forProjectReport(built) : built;
      setAllItems(built);
      setLoading(false);

      // then the preview photos, top to bottom. Making them also makes each
      // photo's export copy, so an export after this is quicker.
      for (const { photos } of ordered) {
        for (const p of photos) {
          while (sharingRef.current && !cancelled) await new Promise((r) => setTimeout(r, 300));
          if (cancelled) return;
          const url = await watermark(await getExportCopy(p), p.takenAt, { maxEdge: PREVIEW_MAX_EDGE }).catch(() => null);
          if (cancelled) return;
          if (url) setPreviews((prev) => ({ ...prev, [p.id]: url }));
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [siteId]);

  if (!siteId) return null;

  // The inspection date on every report (PDF cover, preview, Excel "Date
  // identified"): the day the findings were entered — a site visit happens
  // on one day, so the earliest finding's date stands for all of them. Not
  // the export date, since reports are often sent days later.
  const inspectionMs = items.length
    ? Math.min(...items.map((i) => i.finding.createdAt))
    : (site?.createdAt ?? Date.now());

  // Full-bleed cover page. The gradient wash, EnFact masthead wordmark AND
  // the classification watermark (AFSS or Projects) are all baked ahead of
  // time into a single flat JPEG per site kind (src/assets/cover-bg-*.jpg)
  // — nothing about the cover is assembled from multiple images at
  // PDF-build time. The watermark's position/size is fixed (not resized to
  // the actual title/address/badge content the way the approved mockup
  // shows), which is a deliberate trade against pixel-perfect fidelity: a
  // single baked-per-kind image, with only plain text drawn on top of it,
  // is the simplest and most robust thing this cover can be, after the
  // original per-report compositing (multiple doc.addImage() calls plus
  // jsPDF's GState opacity API) proved unreliable in the field.
  async function drawCoverPage(doc: jsPDF, entries: FindingImages[]) {
    const findingsCount = entries.length;
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 40;
    const contentW = pageW - margin * 2;

    // Contractor mode: the company's own cover (lib/contractorCover)
    const contractor = IS_CONTRACTOR;
    const colours = contractor ? coverColours() : { accent: [46, 196, 182] as [number, number, number], onAccent: [4, 20, 15] as [number, number, number], address: [195, 211, 224] as [number, number, number], pill: [35, 50, 60] as [number, number, number] };
    if (contractor) {
      doc.addImage(await coverBackground(pageW, pageH, site?.kind === "project" ? "project" : "afss"), "JPEG", 0, 0, pageW, pageH);
      await drawCoverLogo(doc, margin, 44);
    } else {
      const bg = await loadAssetAsDataUrl((site?.kind === "project" ? art.coverProjects : art.coverAfss)!);
      doc.addImage(bg.dataUrl, "JPEG", 0, 0, pageW, pageH);
    }

    // report title + address, built bottom-up so we know exactly how tall
    // the details block is
    const title = report ? `${site?.name || "Inspection"} - ${report.name}` : site?.name || "Inspection";
    doc.setFont("helvetica", "bold");
    doc.setFontSize(40);
    const titleLines: string[] = doc.splitTextToSize(title, contentW);
    const titleLineH = 46;
    const titleH = titleLines.length * titleLineH;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(32);
    const addressH = site?.address ? 38 : 0;

    const badgePillH = 28;
    const accentH = 4;
    const bottomPad = 56;
    // under the badges, a count per risk level: the new findings on one row,
    // the re-inspected ones (Rectified, Outstanding) on a row of their own
    const countOf = (v: string) => entries.filter((e) => e.finding.defectType === v).length;
    const countRows = [
      DEFECT_TYPES.filter((t) => !t.previousInspection && countOf(t.value)),
      DEFECT_TYPES.filter((t) => t.previousInspection && countOf(t.value)),
    ].filter((r) => r.length);
    const countsH = countRows.length * 26;
    const detailsH =
      accentH + 16 + titleH + (addressH ? 4 + addressH : 0) + 16 + badgePillH + (countsH ? 10 + countsH : 0) + bottomPad;

    // details block, anchored to the bottom of the page
    let dy = pageH - detailsH;
    doc.setFillColor(...colours.accent);
    doc.rect(margin, dy, 56, accentH, "F");
    if (contractor && getCompany().logo) {
      // the report kind beside the accent bar (with no logo it's in the square), where EnFact's cover has it in the artwork
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(...colours.accent);
      doc.text(site?.kind === "project" ? "PROJECT REPORT" : "AFSS", margin + 70, dy + 4.5, { charSpace: 2.5 });
    }
    dy += accentH + 16;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(40);
    doc.setTextColor(255, 255, 255);
    doc.text(titleLines, margin, dy + 34);
    dy += titleH;

    if (site?.address) {
      dy += 4;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(32);
      doc.setTextColor(...colours.address);
      doc.text(site.address, margin, dy + 26);
      dy += addressH;
    }
    dy += 16;

    // badge row: date (solid teal, reads first), then finding count and
    // inspector name as translucent white pills
    type Badge = { text: string; solid: [number, number, number] | null };
    const badges: Badge[] = [
      { text: formatFullDate(inspectionMs), solid: colours.accent },
      { text: `${findingsCount} finding${findingsCount === 1 ? "" : "s"}`, solid: null },
    ];
    const inspectorName = getInspectorName();
    if (inspectorName) {
      badges.push({ text: inspectorName, solid: null });
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    let bx = margin;
    for (const badge of badges) {
      const pillW = doc.getTextWidth(badge.text) + 28;
      if (badge.solid) {
        doc.setFillColor(...badge.solid);
        doc.roundedRect(bx, dy, pillW, badgePillH, 14, 14, "F");
        doc.setTextColor(...colours.onAccent);
      } else {
        // A plain solid fill standing in for "white at 12% opacity over
        // the cover's dark background" — precomputed rather than drawn
        // with jsPDF's GState opacity API, which this cover used to
        // depend on for every translucent pill. Removing that runtime
        // compositing (along with the multi-image watermark it also
        // gated) is the whole point of this rework: fewer moving parts
        // that can fail on-device.
        doc.setFillColor(...colours.pill);
        doc.roundedRect(bx, dy, pillW, badgePillH, 14, 14, "F");
        doc.setTextColor(244, 247, 249);
      }
      doc.text(badge.text, bx + 14, dy + badgePillH / 2 + 4.5);
      bx += pillW + 10;
    }
    dy += badgePillH + 10;
    countRows.forEach((row, i) => {
      let cx = margin;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      if (i === 1) {
        doc.setTextColor(...colours.address);
        doc.text("Re-inspected", cx, dy + 13);
        cx += doc.getTextWidth("Re-inspected") + 10;
      }
      for (const t of row) {
        const text = `${countOf(t.value)} ${t.label}`;
        const w = doc.getTextWidth(text) + 16;
        doc.setFillColor(...t.bgRgb);
        doc.roundedRect(cx, dy, w, 19, 3, 3, "F");
        doc.setTextColor(...t.textRgb);
        doc.text(text, cx + 8, dy + 13);
        cx += w + 6;
      }
      dy += 26;
    });
  }

  // the tests of the flow and stair jobs attached to the site (db testJobs),
  // the ones with readings only; stair tests with their job's system
  async function attachedTests(id = site?.id) {
    const jobs = id ? await listAttachedJobs(id) : [];
    const flowTests: FlowTest[] = [];
    const stairs: { job: Site; tests: StairTest[]; sys: SpfSystem }[] = [];
    // FFCP tests with anything ticked
    const ffcp = jobs.flatMap((j) => (j.kind === "ffcp" ? (j.ffcp ?? []).filter((t) => modesTested(t).length) : []));
    for (const job of jobs) {
      if (job.kind === "flow") flowTests.push(...(await listFlowTests(job.id)).filter(flowTestHasData));
      else if (job.kind === "spf" && job.spf?.stairs.length) {
        const tests = (await listStairTests(job.id)).filter(stairTestHasData);
        if (tests.length) stairs.push({ job, tests, sys: job.spf });
      }
    }
    return { flowTests, stairs, ffcp };
  }

  // The PDF (the "AFSS & Project report layout" design, lib/siteReportPdf):
  // the cover, the summary, the findings as cards, then the attached tests;
  // every page after the cover with the site's footer (the stair pages carry
  // their own). The summary's pages are kept free first and drawn last, once
  // the page each finding and test landed on is known.
  async function buildPdf(onPhoto: (done: number, total: number) => void): Promise<Blob> {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const sr = await import("../lib/siteReportPdf");
    const info = { kind: site?.kind === "project" ? ("project" as const) : ("afss" as const), siteName: site?.name ?? "Inspection", reportName: report?.name, address: site?.address ?? "", dateMs: inspectionMs, inspector: getInspectorName() };
    await drawCoverPage(doc, items);
    const cards = sr.cardRows(items, info.kind);
    const { flowTests, stairs, ffcp } = await attachedTests();
    const testCount = flowTests.length + stairs.reduce((n, x) => n + x.tests.length, 0) + ffcp.length;
    const summaryPages = sr.summaryPageCount(doc, cards, items, testCount);
    for (let i = 0; i < summaryPages; i++) doc.addPage();
    doc.addPage();
    const { pageOf } = await sr.drawCards(doc, cards, info, onPhoto);

    // the attached jobs' tests at the end (as the Excel's tabs): flow, stair, then FFCP
    const tests: { label: string; done: number; page: number }[] = [];
    const stairPages = new Set<number>();
    if (site && flowTests.length) {
      setExportProgress({ percent: 86, step: "Adding flow tests…" });
      await (await import("../lib/flowPdf")).appendFlowPages(doc, flowTests, site, (t, page) => tests.push({ label: `Flow test · ${t.name.trim() || "Flow test"}`, done: t.testedAt, page }), false);
    }
    if (site && stairs.length) setExportProgress({ percent: 87, step: "Adding stair tests…" });
    for (const stair of stairs) {
      if (!site) continue;
      const { appendStairPages } = await import("../lib/stairPdf");
      const { KIND_LABEL } = await import("../lib/stairTest");
      for (const test of stair.tests) {
        const from = doc.getNumberOfPages() + 1;
        await appendStairPages(doc, [test], stair.sys, site, false);
        for (let p = from; p <= doc.getNumberOfPages(); p++) stairPages.add(p);
        tests.push({ label: `Stair pressurisation · ${KIND_LABEL[test.kind]} (${stair.sys.stairs.length} stair${stair.sys.stairs.length === 1 ? "" : "s"})`, done: test.testedAt, page: from });
      }
    }
    if (site && ffcp.length) {
      const { logoImage } = await import("../lib/flowPdf");
      (await import("../lib/ffcpPdf")).appendFfcpPages(doc, ffcp, site, false, await logoImage().catch(() => null), (t, page) => tests.push({ label: "Fire fan control panel", done: t.testedAt, page }), false);
    }

    const { logoImage } = await import("../lib/flowPdf");
    sr.drawSummary(doc, 2, info, items, cards, pageOf, tests, await logoImage().catch(() => null));
    for (let p = 2; p <= doc.getNumberOfPages(); p++) if (!stairPages.has(p)) sr.drawFooter(doc, info, p);

    setExportProgress({ percent: 88, step: "Building PDF…" });
    // let the "Building PDF…" step paint before jsPDF's synchronous output
    await new Promise((r) => setTimeout(r, 30));
    return doc.output("blob");
  }

  // Share button: first offers to categorise any Uncategorised findings
  // (PDF and Excel only — the photos zip isn't grouped).
  function requestShare(kind: ShareKind, namesChecked = false) {
    // stair tests go in the PDF and Excel: first, any stairs still on placeholder names
    if (kind !== "photos" && !namesChecked && unnamedJob) return setNameCheck({ kind, job: unnamedJob });
    const uncategorised = items.some((i) => !esrItem(i.finding.esrCategory));
    if (kind !== "photos" && site?.kind !== "project" && !categoriseAsked && uncategorised) setAskCategorise(kind);
    else void handleShare(kind);
  }

  function handleCategorisePick(finding: Finding, code: string) {
    // re-picking one that was already set replaces what was learnt from it
    const previous = items.find((i) => i.finding.id === finding.id)?.finding.esrCategory;
    if (previous === code) return;
    if (previous) unlearnCategory(finding.note, previous);
    learnCategory(finding.note, code);
    void updateFinding(finding.id, { esrCategory: code });
    setAllItems((prev) => prev.map((i) => (i.finding.id === finding.id ? { ...i, finding: { ...i.finding, esrCategory: code } } : i)));
  }

  // Builds the PDF, Excel file or photos zip and hands it to the native
  // share sheet (or a download, on desktop web).
  async function handleShare(kind: ShareKind) {
    shareStartRef.current = performance.now();
    setSharing(kind);
    setExportProgress({ percent: 0, step: "Getting ready…" });
    const photoIds = items.flatMap((i) => i.photos.map((p) => p.id));
    const timer = startExportTimer(kind === "pdf" ? "PDF" : kind === "excel" ? "Excel" : "Photos zip", photoIds.length, await countExportCopies(photoIds));
    let photosTimed = false;
    const photoProgress = (done: number, total: number, upTo = 85) => {
      setExportProgress({ percent: total ? (upTo * done) / total : 0, step: `Adding photos: ${done} of ${total}` });
      if (done === total && !photosTimed) {
        photosTimed = true;
        timer.mark("photos");
      }
    };
    const native = Capacitor.isNativePlatform();
    const inspectorName = getInspectorName();
    const title = report ? `${site?.name ?? "Inspection"} - ${report.name}` : reportTitle(site?.name, inspectorName);
    // a customised report's files are named after it too
    const fileSite = report ? `${site?.name ?? "Inspection"} ${report.name}` : site?.name;
    try {
      let filename: string;
      let numbered: ReturnType<typeof numberedExport>;
      let blob: Blob | null = null; // web: the file to share / download
      let uri: string | null = null; // Android: the file written to the cache
      if (kind === "photos") {
        // streamed straight into the file one photo at a time — never
        // held in memory as a whole
        numbered = numberedExport(photosZipName(fileSite));
        filename = numbered.name;
        const onPhoto = (done: number, total: number) => photoProgress(done, total, 95);
        if (native) {
          const out = new CacheFileWriter(filename);
          await writePhotosZip(items, fileSite, (b) => out.write(b), onPhoto);
          uri = await out.close();
          timer.mark("saving");
        } else {
          const parts: Uint8Array[] = [];
          await writePhotosZip(items, fileSite, async (b) => void parts.push(b), onPhoto);
          blob = new Blob(parts as BlobPart[], { type: "application/zip" });
        }
      } else {
        numbered = numberedExport(reportFilename(fileSite, inspectorName, kind === "pdf" ? "pdf" : "xlsx"));
        filename = numbered.name;
        if (kind === "pdf") {
          blob = await buildPdf(photoProgress);
        } else {
          const { buildFindingsWorkbook, buildProjectWorkbook } = await import("../lib/excelExport");
          const onProgress = (p: { stage: "photos"; done: number; total: number } | { stage: "building" }) =>
            p.stage === "photos" ? photoProgress(p.done, p.total) : setExportProgress({ percent: 88, step: "Building spreadsheet…" });
          // the site's flow tests go in as tabs after the findings, the
          // ones with readings only
          const { flowTests, stairs, ffcp } = await attachedTests();
          const flow = site && (flowTests.length || stairs.length || ffcp.length) ? { tests: flowTests, site, stairs, ffcp } : undefined;
          // the register's title rows (Contractor's Excel; lib/branding REGISTER_TITLE)
          const heading = { kind: site?.kind === "project" ? ("project" as const) : ("afss" as const), siteName: site?.name ?? "Inspection", reportName: report?.name, address: site?.address ?? "", dateMs: inspectionMs, inspector: getInspectorName() };
          blob = site?.kind === "project" ? await buildProjectWorkbook(items, onProgress, flow, heading) : await buildFindingsWorkbook(items, inspectionMs, onProgress, flow, heading);
        }
        timer.mark("building");
        setExportProgress({ percent: 97, step: "Opening share menu…" });
        if (native) {
          uri = await writeBlobToCache(blob, filename);
          timer.mark("saving");
        }
      }
      timer.finish();
      // the loading screen stays up at least MIN_LOADER_MS, the percentage
      // running smoothly on to 100 meanwhile (see ProgressOverlay)
      setExportProgress({ percent: 100, step: "Finishing up…" });
      const left = MIN_LOADER_MS - (performance.now() - shareStartRef.current);
      if (left > 0) await new Promise((r) => setTimeout(r, left));
      setExportProgress(null); // the share menu takes over from here

      if (uri) {
        // navigator.share() doesn't work for files inside an Android
        // WebView, so hand the native share sheet the cached file's URI
        await Share.share({ title, url: uri });
      } else if (blob) {
        // plain web fallback (e.g. previewing in a desktop browser)
        const file = new File([blob], filename, { type: blob.type || "application/octet-stream" });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title });
        } else {
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(url);
        }
      }
      numbered.shared();
    } catch (err) {
      // a genuine failure (not the user cancelling the share sheet) —
      // surface it instead of silently doing nothing
      if (!(err instanceof Error) || !/cancell?ed/i.test(err.message)) {
        console.error(`${kind} share failed`, err);
        say(`Couldn't share the ${SHARE_LABEL[kind]}`);
      }
    } finally {
      setSharing(null);
      setExportProgress(null);
    }
  }


  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", position: "relative" }}>
      {/* top bar */}
      <div style={{ flexShrink: 0, height: 64, padding: "0 12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <RoundIconButton ariaLabel="Back to findings" onClick={() => navigate(`/site/${siteId}/findings`)}>
          <IconChevronLeft size={20} strokeWidth={2.2} />
        </RoundIconButton>
        <div style={{ fontSize: 14, fontWeight: 700 }}>Export preview</div>
        <div style={{ width: 40, height: 40 }} />
      </div>

      {/* the whole site and each customised report (long-press one to
          change or delete it) */}
      <ReportChips
        total={allItems.length}
        reports={site?.reports ?? []}
        current={report?.id ?? null}
        onSelect={setReportId}
        onChange={(r) => setEditing(r)}
        onDelete={(r) => {
          if (reportId === r.id) setReportId(null);
          void saveReports((site?.reports ?? []).filter((x) => x.id !== r.id));
        }}
      />

      {/* paper preview */}
      <div data-tour="preview" style={{ flexGrow: 1, overflowY: "auto", padding: "8px 16px 12px" }}>
        <div style={{ background: "var(--paper)", borderRadius: 12, padding: "22px 18px", display: "flex", flexDirection: "column", gap: 18 }}>
          <div data-tour="preview-head" style={{ display: "flex", flexDirection: "column", gap: 2, borderBottom: "1px solid var(--paper-border)", paddingBottom: 14 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: "var(--paper-text)" }}>{report ? `${site?.name ?? "Inspection"} - ${report.name}` : reportTitle(site?.name, getInspectorName())}</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--muted-2)" }}>
              {site?.address ? `${site.address} · ` : ""}Inspected {formatDate(inspectionMs)}
              {report && ` · ${report.findingIds.length} finding${report.findingIds.length === 1 ? "" : "s"} · by ${report.order === "time" ? "time taken" : "ESR category"}`}
            </div>
            {!loading && allItems.length > 0 && (
              <button
                data-tour="custom-report"
                onClick={() => setEditing("new")}
                style={{ marginTop: 10, alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 999, background: "#e3efe9", border: "1px solid #9fd3c6", color: "#1f6b5b", fontSize: 12, fontWeight: 800 }}
              >
                ✎ Create Customised Report
              </button>
            )}
            {report && newSince(allItems, report) > 0 && (
              <button onClick={() => setEditing(report)} style={{ marginTop: 8, alignSelf: "flex-start", border: "none", background: "none", padding: 0, textAlign: "left", fontSize: 11.5, fontWeight: 700, color: "#b26a1f" }}>
                {newSince(allItems, report)} finding{newSince(allItems, report) === 1 ? "" : "s"} added since this report, not in it: tap to change it
              </button>
            )}
          </div>

          {loading && (
            <div style={{ textAlign: "center", color: "var(--muted-2)", fontSize: 13, fontWeight: 600, padding: "20px 0" }}>
              Loading findings…
            </div>
          )}

          {!loading && items.length === 0 && (
            <div style={{ textAlign: "center", color: "var(--muted-2)", fontSize: 13, fontWeight: 600, padding: "20px 0" }}>
              No findings to export yet.
            </div>
          )}

          {reportRows(items).map((row, idx, rows) =>
            row.kind === "finding" ? (
              // no divider line straight under a heading
              <PreviewFinding key={row.entry.finding.id} entry={row.entry} previews={previews} first={idx === 0 || rows[idx - 1].kind !== "finding"} />
            ) : (
              <PreviewHeading key={row.kind === "uncategorised" ? "uncategorised" : `${row.kind}-${row.code}`} row={row} />
            ),
          )}
        </div>
      </div>

      {editing && (
        <CustomReport
          entries={siteItems}
          previews={previews}
          existing={editing === "new" ? null : editing}
          onCancel={() => setEditing(null)}
          onSave={(r) => {
            const others = (site?.reports ?? []).filter((x) => x.id !== r.id);
            const at = (site?.reports ?? []).findIndex((x) => x.id === r.id);
            void saveReports(at < 0 ? [...others, r] : [...others.slice(0, at), r, ...others.slice(at)]);
            setReportId(r.id);
            setEditing(null);
          }}
        />
      )}

      {/* share bar */}
      <div data-tour="share-bar" style={{ flexShrink: 0, padding: "12px 16px calc(28px + var(--sa-bottom))", borderTop: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 10 }}>
        {/* every photo at full resolution, stamped, zipped in a folder
            named after the site (see lib/photosZip) */}
        <button
          onClick={() => void requestShare("photos")}
          disabled={loading || sharing !== null || countPhotos(items) === 0}
          style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", padding: "12px 0", borderRadius: 12, background: "none", border: "1px dashed var(--border-strong)", fontSize: 14, fontWeight: 700, color: "var(--text)" }}
        >
          <IconShare size={16} />
          Send Photos Only
        </button>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={() => void requestShare("pdf")}
            disabled={loading || sharing !== null || items.length === 0}
            style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, textAlign: "center", padding: "15px 0", borderRadius: 12, background: "var(--panel)", border: "1px solid var(--border)", fontSize: 14, fontWeight: 700, color: "var(--text)" }}
          >
            <IconShare size={16} />
            {sharing === "pdf" ? "Preparing…" : "Share PDF"}
          </button>
          {/* the main one: the Excel register is what gets worked on */}
          <button
            onClick={() => void requestShare("excel")}
            disabled={loading || sharing !== null || items.length === 0 || !site}
            className="glow-sweep"
            style={{ position: "relative", flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, textAlign: "center", padding: "15px 0", borderRadius: 12, background: "var(--accent)", border: "none", fontSize: 14, fontWeight: 800, color: "var(--accent-text)", overflow: "hidden" }}
          >
            <IconShare size={16} />
            {sharing === "excel" ? "Preparing…" : "Share Excel"}
          </button>
        </div>
      </div>

      {nameCheck?.job.spf && (
        <StairNameCheck
          go="export"
          stairs={nameCheck.job.spf.stairs}
          onCancel={() => setNameCheck(null)}
          onSkip={() => {
            setAfterNames(nameCheck.kind);
            setNameCheck(null);
          }}
          onSave={async (named) => {
            await saveSiteSpf(nameCheck.job.id, { ...nameCheck.job.spf!, stairs: named });
            setUnnamedJob(null);
            setAfterNames(nameCheck.kind);
            setNameCheck(null);
          }}
        />
      )}

      {askCategorise && (
        <div
          className="sheet-backdrop"
          onClick={() => setAskCategorise(null)}
          style={{ position: "absolute", inset: 0, zIndex: 5, background: "rgba(3,10,18,0.7)", display: "flex", alignItems: "center", justifyContent: "center", padding: 22 }}
        >
          <div data-tour="categorise-ask" onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 360, background: "var(--panel)", border: "1px solid var(--border-strong)", borderRadius: 20, padding: "22px 20px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
            {(() => {
              const n = items.filter((i) => !esrItem(i.finding.esrCategory)).length;
              return (
                <div style={{ fontSize: 18, fontWeight: 800 }}>
                  {n} finding{n === 1 ? " is" : "s are"} uncategorised
                </div>
              );
            })()}
            <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}>
              Categorise them now so they go under the right headings? Anything you skip goes under <b style={{ color: "var(--text)" }}>Uncategorised</b> at the end of the report.
            </div>
            <button
              onClick={() => {
                setCategoriseIds(
                  reportRows(items.filter((i) => !esrItem(i.finding.esrCategory))).flatMap((r) => (r.kind === "finding" ? [r.entry.finding.id] : [])),
                );
                setCategorising(askCategorise);
                setAskCategorise(null);
              }}
              style={{ marginTop: 6, padding: "14px 0", borderRadius: 14, background: "var(--accent)", border: "none", fontSize: 14, fontWeight: 800, color: "var(--accent-text)" }}
            >
              Categorise now
            </button>
            <button
              onClick={() => {
                const kind = askCategorise;
                setAskCategorise(null);
                setCategoriseAsked(true);
                void handleShare(kind);
              }}
              style={{ padding: "13px 0", borderRadius: 14, background: "var(--panel)", border: "1px solid var(--border)", fontSize: 14, fontWeight: 700, color: "var(--text)" }}
            >
              Export anyway
            </button>
          </div>
        </div>
      )}

      {categorising && (
        <CategoriseFlow
          entries={categoriseIds.flatMap((id) =>
            items
              .filter((i) => i.finding.id === id)
              // the preview photos made so far (the rest fill in as they're ready)
              .map((i) => ({ ...i, dataUrls: i.photos.flatMap((p) => (previews[p.id] ? [previews[p.id]] : [])) })),
          )}
          onPick={handleCategorisePick}
          onExport={() => {
            setCategoriseAsked(true);
            setPendingShare(categorising);
            setCategorising(null);
          }}
          onClose={() => setCategorising(null)}
        />
      )}

      {exportProgress && sharing && (
        <ProgressOverlay
          percent={exportProgress.percent}
          title={sharing === "pdf" ? "Preparing PDF" : sharing === "excel" ? "Preparing Excel" : "Preparing photos"}
          step={exportProgress.step}
          art={sharing === "pdf" ? "conveyor" : sharing === "excel" ? "sheet" : "zip"}
          startedAt={shareStartRef.current}
          minMs={MIN_LOADER_MS}
        />
      )}
    </div>
  );
}

// Export preview: blue bar per section, underlined line per item, grey bar
// for Uncategorised — same as the PDF.
function PreviewHeading({ row }: { row: Heading }) {
  if (row.kind === "item") {
    return (
      <div style={{ fontSize: 12, fontWeight: 800, color: "var(--paper-text)", borderBottom: "1.5px solid #99ccff", paddingBottom: 4, marginBottom: -6, lineHeight: 1.35 }}>
        {headingText(row)}
      </div>
    );
  }
  return (
    <div style={{ fontSize: 12, fontWeight: 800, color: "#04213a", background: BAR_FILL[row.kind], borderRadius: 5, padding: "7px 10px", marginBottom: -6, lineHeight: 1.35 }}>
      {headingText(row)}
    </div>
  );
}

function PreviewFinding({ entry: { finding, photos }, previews, first }: { entry: FindingImages; previews: Record<string, string>; first: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        borderTop: first ? "none" : "1px solid var(--paper-border)",
        paddingTop: first ? 0 : 18,
      }}
    >
      <div style={{ flexShrink: 0, width: 92, display: "flex", flexDirection: "column", gap: 4 }}>
        {/* a scanning line while each is being made (see .scan-box) */}
        {photos.map((p) => (
          <div key={p.id} className={previews[p.id] ? "scan-box ready" : "scan-box waiting"}>
            {previews[p.id] && <img src={previews[p.id]} alt="" style={{ width: "100%", display: "block" }} />}
          </div>
        ))}
        {photos.length === 0 && (
          <div style={{ height: 46, borderRadius: 6, border: "1px dashed #c9c4b8", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 600, color: "var(--muted-2)" }}>
            Note
          </div>
        )}
      </div>
      <div style={{ flexGrow: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6, paddingTop: 2 }}>
        <DefectTypePill type={finding.defectType} size="sm" onPaper />
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--paper-text)", lineHeight: 1.35 }}>
          {finding.note || "Untitled finding"}
        </div>
        {(finding.level || finding.location) && (
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {finding.level && <div style={{ fontSize: 11, fontWeight: 600, color: "var(--muted-2)" }}>{finding.level}</div>}
            {finding.location && <div style={{ fontSize: 11, fontWeight: 600, color: "var(--muted-2)" }}>{finding.location}</div>}
          </div>
        )}
      </div>
    </div>
  );
}
