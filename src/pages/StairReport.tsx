import { say } from "../components/Message";
import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { columnWidths, lowerTables, photosTitle, stairPages, type StairPage, type StairTable, type StairTile } from "../lib/stairPrint";
import type { StairTest } from "../db/types";
import { numericDate } from "../lib/dates";
import { KIND_LABEL, stairFileName } from "../lib/stairTest";
import { exportTests, type TestsFormat } from "../lib/testsExport";
import ProgressOverlay from "../components/ProgressOverlay";
import { PageHeader, useStairTest } from "../components/StairUi";
import { reportLogoUrl } from "../lib/branding";
import { appendixPhotos, PHOTO_H, PHOTO_W, type AppendixPhoto } from "../lib/stairPhotos";
import { useReportPhotos } from "../components/FindingsOnPaper";

// A stair test's report, previewed as it prints (lib/stairPrint): a page
// per stair, swiped sideways, then the test's photo appendix
// (lib/stairPhotos), then Export PDF or Excel.

const MIN_LOADER_MS = 3000;

export default function StairReport() {
  const { siteId, testId } = useParams<{ siteId: string; testId: string }>();
  const navigate = useNavigate();
  const { site, test } = useStairTest(siteId, testId);
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState<{ percent: number; step: string; kind: TestsFormat } | null>(null);
  const started = useRef(0);
  const strip = useRef<HTMLDivElement>(null);

  const stairs = site?.spf && test ? stairPages(test, site.spf, site) : [];
  // Photos & notes, with their photos' thumbnails
  const photoData = useReportPhotos(test ? [test] : []);
  const appendix = test && site?.spf ? appendixPhotos((photoData.byTest[test.id] || []), test, site.spf) : [];
  const withPhotos = appendix.length > 0 && stairs.length > 0;
  const pages: (StairPage | "photos")[] = withPhotos ? [...stairs, "photos"] : stairs;
  const go = (i: number) => strip.current?.scrollTo({ left: i * strip.current.clientWidth, behavior: "smooth" });

  async function share(kind: TestsFormat) {
    if (!site || !test || busy) return;
    started.current = performance.now();
    setBusy({ kind, percent: 10, step: "Getting ready…" });
    try {
      await exportTests({ flow: [], stair: [test], site, formats: [kind], fileName: (ext) => stairFileName(site, ext, test.testedAt) }, (percent, step) => setBusy({ kind, percent, step }));
    } catch (err) {
      if (!(err instanceof Error) || !/cancell?ed/i.test(err.message)) {
        console.error("stair export failed", err);
        say(`Couldn't export the ${kind === "pdf" ? "PDF" : "Excel file"}`);
      }
    } finally {
      const left = MIN_LOADER_MS - (performance.now() - started.current);
      if (left > 0) await new Promise((r) => setTimeout(r, Math.min(left, 600)));
      setBusy(null);
    }
  }

  const btn: CSSProperties = { width: "100%", padding: "14px 0", borderRadius: 12, fontSize: 15, fontWeight: 800 };
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", position: "relative" }}>
      <PageHeader title="The report" sub={`${site?.name ?? ""} · ${test ? KIND_LABEL[test.kind] : ""}`} onBack={() => navigate(`/site/${siteId}/spf/${testId}`, { replace: true })} />
      {pages.length > 1 && (
        <div style={{ flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px 4px", fontSize: 13, fontWeight: 800 }}>
          <button aria-label="Previous page" disabled={page === 0} onClick={() => go(page - 1)} style={{ border: "none", background: "none", color: page === 0 ? "var(--muted-2)" : "var(--accent)", fontSize: 18, padding: "0 8px" }}>
            ‹
          </button>
          <span>
            {pages[page] === "photos" ? "Photo appendix" : (pages[page] as StairPage | undefined)?.stair} <span style={{ color: "var(--muted)", fontWeight: 700 }}>· page {page + 1} of {pages.length}</span>
          </span>
          <button aria-label="Next page" disabled={page >= pages.length - 1} onClick={() => go(page + 1)} style={{ border: "none", background: "none", color: page >= pages.length - 1 ? "var(--muted-2)" : "var(--accent)", fontSize: 18, padding: "0 8px" }}>
            ›
          </button>
        </div>
      )}
      <div
        ref={strip}
        onScroll={(e) => setPage(Math.round(e.currentTarget.scrollLeft / Math.max(1, e.currentTarget.clientWidth)))}
        style={{ flexGrow: 1, minHeight: 0, display: "flex", overflowX: "auto", overflowY: "hidden", scrollSnapType: "x mandatory" }}
      >
        {pages.map((p, i) => (
          <div key={i} style={{ flex: "0 0 100%", scrollSnapAlign: "center", overflowY: "auto", padding: "6px 14px 12px", boxSizing: "border-box" }}>
            {p === "photos" ? test && site && <PhotosPaper test={test} photos={appendix} thumbs={photoData.thumbs} site={site} /> : <Paper page={p} />}
          </div>
        ))}
      </div>
      <div style={{ flexShrink: 0, padding: "10px 16px calc(24px + var(--sa-bottom))", borderTop: "1px solid var(--border)", display: "flex", gap: 8 }}>
        <button disabled={!pages.length || !!busy} onClick={() => void share("xlsx")} style={{ ...btn, flex: 1, border: "1px solid rgba(var(--accent-rgb), .55)", background: "rgba(var(--accent-rgb), .12)", color: "var(--accent)" }}>
          Export Excel
        </button>
        <button disabled={!pages.length || !!busy} onClick={() => void share("pdf")} style={{ ...btn, flex: 1, border: "none", background: "var(--accent)", color: "var(--accent-text)" }}>
          Export PDF
        </button>
      </div>
      {busy && <ProgressOverlay percent={busy.percent} title={busy.kind === "pdf" ? "Preparing PDF" : "Preparing Excel"} step={busy.step} art={busy.kind === "pdf" ? "conveyor" : "sheet"} startedAt={started.current} minMs={MIN_LOADER_MS} />}
    </div>
  );
}

// The pages as they print (lib/stairPrint, lib/stairPdf): drawn at the
// PDF's own size, 595 pt across, and scaled down to fit the screen.
const INK = "#14212e";
const SOFT = "#4a6175";
const NAVY = "#0b3550";
const LINE = "#d5dee6";
const WIDTH = 515; // the PDF's content width

function Scaled({ children, testId }: { children: ReactNode; testId: string }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState({ scale: 1, h: 0 });
  useLayoutEffect(() => {
    const measure = () => {
      if (!outer.current || !inner.current) return;
      const scale = Math.min(1, outer.current.clientWidth / 595);
      setFit({ scale, h: inner.current.offsetHeight * scale });
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (outer.current) ro.observe(outer.current);
    if (inner.current) ro.observe(inner.current);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={outer} style={{ width: "100%", height: fit.h || undefined, position: "relative" }}>
      <div
        ref={inner}
        data-testid={testId}
        style={{ width: 595, minHeight: 842, boxSizing: "border-box", padding: 40, background: "#fff", color: INK, fontFamily: "Helvetica, Arial, sans-serif", fontSize: 8.5, lineHeight: 1.25, position: "absolute", left: 0, top: 0, transformOrigin: "0 0", transform: `scale(${fit.scale})`, boxShadow: "0 8px 24px rgba(0,0,0,.35)", borderRadius: 4, display: "flex", flexDirection: "column", gap: 14 }}
      >
        {children}
      </div>
    </div>
  );
}

function Heading({ title, stair, note }: { title: string; stair: string; note: string }) {
  const logo = reportLogoUrl();
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 16.5, fontWeight: 700, lineHeight: "20px", paddingTop: 6 }}>{title}</div>
        <div style={{ width: 46, height: 2.5, background: "#1f6fb2", marginTop: 6 }} />
        <div style={{ fontSize: 16.5, fontWeight: 700, lineHeight: "20px", marginTop: 10 }}>{stair}</div>
        {note && <div style={{ fontSize: 9, color: SOFT }}>{note}</div>}
      </div>
      {logo && <img src={logo} alt="" style={{ height: 58, maxWidth: 240, objectFit: "contain", flexShrink: 0, marginTop: -16 }} />}
    </div>
  );
}

const sectionTitle: CSSProperties = { fontWeight: 700, fontSize: 8, color: NAVY, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 5 };

function Details({ details }: { details: StairPage["details"] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", borderTop: `1px solid ${LINE}`, borderBottom: `1px solid ${LINE}` }}>
      {details.map((d, i) => (
        <div key={d.label} style={{ display: "grid", gridTemplateColumns: "56px 1fr", padding: "5px 0", borderTop: i >= 3 ? `1px solid ${LINE}` : undefined, minWidth: 0 }}>
          <b style={{ color: NAVY }}>{d.label}</b>
          <span style={{ overflowWrap: "anywhere" }}>{d.value || "–"}</span>
        </div>
      ))}
    </div>
  );
}

function Tiles({ tiles }: { tiles: StairTile[] }) {
  return (
    <div data-testid="spf-tiles">
      <div style={sectionTitle}>Stair readings</div>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${tiles.length <= 4 ? 4 : 3}, 1fr)`, gap: 6 }}>
        {tiles.map((t) => (
          <div key={t.label} style={{ border: `1px solid ${t.fail ? "#b3261e" : "#c9d6e0"}`, borderRadius: 3, minHeight: 50, boxSizing: "border-box", padding: "5px 6px" }}>
            <div style={{ fontSize: 7, color: SOFT }}>{t.label}</div>
            <div style={{ fontSize: 11, fontWeight: 700, margin: "2px 0", color: t.fail ? "#b3261e" : INK }}>{t.value}</div>
            {t.lines.map((l, i) => (
              <div key={i} style={{ fontSize: 6.5, color: t.fail ? "#b3261e" : SOFT }}>
                {l}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// a table as it prints: full width, fails in red, a pass that's only just one in yellow
function PaperTable({ t }: { t: StairTable }) {
  const widths = columnWidths(t, WIDTH);
  const cell: CSSProperties = { border: `1px solid ${LINE}`, padding: "2px 4px", height: 15, boxSizing: "border-box", overflowWrap: "anywhere" };
  return (
    <div data-testid={/run by run/.test(t.title) ? "spf-run-table" : "spf-table"}>
      <div style={sectionTitle}>{t.title}</div>
      <table style={{ borderCollapse: "collapse", width: "100%", tableLayout: "fixed", fontSize: 8.5, color: INK }}>
        <colgroup>
          {widths.map((w, i) => (
            <col key={i} style={{ width: `${(w / WIDTH) * 100}%` }} />
          ))}
        </colgroup>
        {t.head && (
          <thead>
            <tr>
              {t.head.map((h, i) => (
                <th key={i} style={{ background: NAVY, color: "#fff", fontWeight: 700, fontSize: 7.5, height: 24, padding: "0 3px", whiteSpace: "pre-line", lineHeight: 1.15, border: `1px solid ${NAVY}` }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {t.rows.map((r, k) => (
            <tr key={k}>
              {r.cells.map((c, j) => {
                const fail = r.fails[j];
                const warn = !fail && !!r.warns?.[j];
                return (
                  <td key={j} style={{ ...cell, textAlign: (t.align[j] ?? "c") === "l" ? "left" : "center", fontWeight: (j === 0 && t.bold) || fail || warn ? 700 : 400, background: fail ? "#ffd9d4" : warn ? "#fff0b8" : undefined, color: fail ? "#b3261e" : warn ? "#6b4a00" : c === "–" ? "#9aabb9" : undefined }}>
                    {c}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {t.key && <div style={{ fontSize: 7.5, color: SOFT, marginTop: 4 }}>{t.key}</div>}
    </div>
  );
}

const Footer = ({ text }: { text: string }) => (
  <div style={{ marginTop: "auto", paddingTop: 6, borderTop: `1px solid ${LINE}`, color: SOFT, fontSize: 7.5 }}>{text}</div>
);

// one stair's page; the checks two to a row while it fits on one sheet, else one
function Paper({ page }: { page: StairPage }) {
  const [twoUp, setTwoUp] = useState(true);
  const box = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (twoUp && page.checks && (box.current?.offsetHeight ?? 0) > 762) setTwoUp(false);
  }, [twoUp, page]);
  return (
    <Scaled testId="spf-page">
      <div ref={box} style={{ display: "flex", flexDirection: "column", gap: 14, flexGrow: 1 }}>
        <Heading title={page.title} stair={page.stair} note={page.note} />
        <Details details={page.details} />
        {page.tiles.length > 0 && <Tiles tiles={page.tiles} />}
        {[...page.tables, ...lowerTables(page, twoUp)].map((t, i) => (
          <PaperTable key={i} t={t} />
        ))}
        <Footer text={page.footer} />
      </div>
    </Scaled>
  );
}

// the photo appendix: each photo 5 × 6.61 cm, three to a row, a label table under it
function PhotosPaper({ test, photos, thumbs, site }: { test: StairTest; photos: AppendixPhoto[]; thumbs: Record<string, string>; site: { name: string } }) {
  return (
    <Scaled testId="spf-photos-page">
      <Heading title={photosTitle(test)} stair="Photo appendix" note={`Photos & notes from every stair in this test · ${[site.name.trim(), numericDate(test.testedAt)].filter(Boolean).join(" · ")}`} />
      <div>
        <div style={sectionTitle}>Photo appendix</div>
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", rowGap: 14 }}>
          {photos.map((p) => (
            <div key={p.n} style={{ width: PHOTO_W }}>
              <div style={{ width: PHOTO_W, height: PHOTO_H, background: "#f3f6f9", border: p.photo ? undefined : "1px solid #c9d6e0", boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center", color: SOFT, fontSize: 8, overflow: "hidden" }}>
                {p.photo ? thumbs[p.photo.id] && <img src={thumbs[p.photo.id]} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /> : "No photo"}
              </div>
              <table style={{ borderCollapse: "collapse", width: "100%", tableLayout: "fixed", fontSize: 7.5, marginTop: 4 }}>
                <colgroup>
                  <col style={{ width: 44 }} />
                  <col />
                </colgroup>
                <thead>
                  <tr>
                    <th colSpan={2} style={{ background: NAVY, color: "#fff", textAlign: "left", padding: "0 4px", height: 14 }}>
                      Photo {p.n}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {p.rows.map(([k, v]) => (
                    <tr key={k}>
                      <td style={{ border: `1px solid ${LINE}`, background: "#f3f6f9", color: NAVY, fontWeight: 700, padding: "1px 4px" }}>{k}</td>
                      <td style={{ border: `1px solid ${LINE}`, padding: "1px 4px", overflowWrap: "anywhere" }}>{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
          {photos.length % 3 === 2 && <div style={{ width: PHOTO_W }} />}
        </div>
      </div>
      <Footer text={[site.name.trim(), "Photo appendix"].filter(Boolean).join(" · ")} />
    </Scaled>
  );
}
