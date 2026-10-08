import { useRef, useState, type CSSProperties } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { stairPages, type StairPage } from "../lib/stairPrint";
import { KIND_LABEL, stairFileName } from "../lib/stairTest";
import { exportTests, type TestsFormat } from "../lib/testsExport";
import ProgressOverlay from "../components/ProgressOverlay";
import { PageHeader, useStairTest } from "../components/StairUi";
import logo from "../assets/flow-logo.png";

// A stair test's report, previewed as it prints (lib/stairPrint): a page
// per stair, swiped sideways, then Export PDF or Excel.

const MIN_LOADER_MS = 3000;

export default function StairReport() {
  const { siteId, testId } = useParams<{ siteId: string; testId: string }>();
  const navigate = useNavigate();
  const { site, test } = useStairTest(siteId, testId);
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState<{ percent: number; step: string; kind: TestsFormat } | null>(null);
  const started = useRef(0);
  const strip = useRef<HTMLDivElement>(null);

  const pages = site?.spf && test ? stairPages(test, site.spf, site) : [];
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
        alert(`Couldn't export the ${kind === "pdf" ? "PDF" : "Excel file"}. Please try again.`);
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
            {pages[page]?.subtitle} <span style={{ color: "var(--muted)", fontWeight: 700 }}>· page {page + 1} of {pages.length}</span>
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
            <Paper page={p} />
          </div>
        ))}
      </div>
      <div style={{ flexShrink: 0, padding: "10px 16px calc(24px + env(safe-area-inset-bottom))", borderTop: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ fontSize: 11.5, color: "var(--muted-2)", textAlign: "center" }}>Each stair is a page in the PDF and a sheet in the Excel. Anything not tested is left blank.</div>
        <button disabled={!pages.length || !!busy} onClick={() => void share("xlsx")} style={{ ...btn, border: "1px solid rgba(46,196,182,.55)", background: "rgba(46,196,182,.12)", color: "var(--accent)" }}>
          Export Excel
        </button>
        <button disabled={!pages.length || !!busy} onClick={() => void share("pdf")} style={{ ...btn, padding: "16px 0", border: "none", background: "var(--accent)", color: "var(--accent-text)" }}>
          Export PDF
        </button>
      </div>
      {busy && <ProgressOverlay percent={busy.percent} title={busy.kind === "pdf" ? "Preparing PDF" : "Preparing Excel"} step={busy.step} art={busy.kind === "pdf" ? "conveyor" : "sheet"} startedAt={started.current} minMs={MIN_LOADER_MS} />}
    </div>
  );
}

// one stair as it prints, on white paper
function Paper({ page }: { page: StairPage }) {
  const cell: CSSProperties = { border: "1px solid #d5dee6", padding: "2px 3px", textAlign: "center" };
  return (
    <div data-testid="spf-page" style={{ background: "#fff", color: "#14212e", borderRadius: 6, padding: "16px 14px", display: "flex", flexDirection: "column", gap: 7, boxShadow: "0 8px 24px rgba(0,0,0,.35)", fontFamily: "Helvetica, Arial, sans-serif", fontSize: 10 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 800, color: "#0b3550" }}>{page.title}</div>
          <div style={{ width: 40, height: 2.5, background: "#1f6fb2", marginTop: 4 }} />
          <div style={{ fontSize: 11, fontWeight: 700, marginTop: 4 }}>{page.subtitle}</div>
        </div>
        <img src={logo} alt="" style={{ height: 22, flexShrink: 0 }} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto 1fr", gap: "1px 6px", fontSize: 9 }}>
        {page.details.map((d) => (
          <Detail key={d.label} label={d.label} value={d.value} />
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 5 }}>
        {page.boxes.map((b) => (
          <div key={b.label} style={{ border: "1px solid #c9d6e0", borderRadius: 5, padding: "4px 5px", fontSize: 8, color: "#4a6175", minHeight: 34 }}>
            {b.label}
            <b style={{ display: "block", fontSize: 11, color: b.fail ? "#b3261e" : "#14212e" }}>{b.value || " "}</b>
            {b.ref && <span style={{ fontSize: 7.5 }}>{b.ref}</span>}
          </div>
        ))}
      </div>
      <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 9 }}>
        <thead>
          <tr>
            {page.head.map((h) => (
              <th key={h} style={{ background: "#0b3550", color: "#fff", fontWeight: 700, padding: "4px 3px", fontSize: 8, lineHeight: 1.2 }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {page.rows.map((r) => (
            <tr key={r.cells[0]}>
              {r.cells.map((c, j) => (
                <td key={j} style={{ ...cell, fontWeight: j === 0 || r.fails[j] ? 700 : 400, background: r.fails[j] ? "#ffd9d4" : undefined, color: r.fails[j] ? "#b3261e" : undefined }}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <Block label={page.fanLabel} lines={[page.fan || " "]} />
      {page.quick !== null && <Block label="Three-monthly check (AS 1851-2012 Table 13.4.2.2)" lines={[page.quick || " "]} />}
      {page.siteNotes && <Block label="Site notes" lines={[page.siteNotes]} />}
      {page.notes.length > 0 && <Block label="Notes" lines={page.notes} />}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <>
      <b style={{ color: "#0b3550" }}>{label}</b>
      <span>{value || "–"}</span>
    </>
  );
}

function Block({ label, lines }: { label: string; lines: string[] }) {
  return (
    <div style={{ fontSize: 9 }}>
      <b>{label}</b>
      {lines.map((l, i) => (
        <div key={i} style={{ whiteSpace: "pre-wrap", borderBottom: "1px solid #e3e9ee", padding: "2px 0" }}>
          {l}
        </div>
      ))}
    </div>
  );
}
