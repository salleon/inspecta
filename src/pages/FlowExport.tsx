import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Share } from "@capacitor/share";
import { Capacitor } from "@capacitor/core";
import type { FlowTest, Site } from "../db/types";
import { getSite, listFlowTests } from "../db/db";
import { chartModel, chartModelSvg, flowFileName, printDemand, printDetails, printSubtitle, printTables, printTitle, type PrintTable } from "../lib/flowPrint";
import { writeBlobToCache } from "../lib/cacheFile";
import { IconChevronLeft } from "../components/Icons";
import RoundIconButton from "../components/RoundIconButton";
import ProgressOverlay from "../components/ProgressOverlay";
import logo from "../assets/flow-logo.png";

// A flow testing site's export (design canvas FlowSiteType / FlowExports): a
// preview of the results, a page per flow test laid out as they print, then
// Export PDF (a full page per test) or Export Excel (a sheet per test).

const MIN_LOADER_MS = 4000;
type Kind = "pdf" | "excel";

export default function FlowExport() {
  const { siteId } = useParams<{ siteId: string }>();
  const navigate = useNavigate();
  const [site, setSite] = useState<Site | null>(null);
  const [tests, setTests] = useState<FlowTest[]>([]);
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState<{ kind: Kind; percent: number; step: string } | null>(null);
  const started = useRef(0);
  const strip = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!siteId) return;
    void Promise.all([getSite(siteId), listFlowTests(siteId)]).then(([s, t]) => {
      setSite(s ?? null);
      setTests(t);
    });
  }, [siteId]);

  const go = (i: number) => {
    const el = strip.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
  };

  async function share(kind: Kind) {
    if (!site || busy) return;
    started.current = performance.now();
    setBusy({ kind, percent: 10, step: kind === "pdf" ? "Drawing the pages…" : "Building the sheets…" });
    try {
      const blob =
        kind === "pdf"
          ? await (await import("../lib/flowPdf")).buildFlowPdf(tests, site)
          : await (await import("../lib/flowExcel")).buildFlowWorkbook(tests, site);
      const filename = flowFileName(site, kind === "pdf" ? "pdf" : "xlsx");
      setBusy({ kind, percent: 90, step: "Opening share menu…" });
      const native = Capacitor.isNativePlatform();
      const uri = native ? await writeBlobToCache(blob, filename) : null;
      setBusy({ kind, percent: 100, step: "Finishing up…" });
      const left = MIN_LOADER_MS - (performance.now() - started.current);
      if (left > 0) await new Promise((r) => setTimeout(r, left));
      setBusy(null);
      const title = `${site.name} flow tests`;
      if (uri) await Share.share({ title, url: uri });
      else {
        const file = new File([blob], filename, { type: blob.type });
        if (navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], title });
        else {
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
    } catch (err) {
      if (!(err instanceof Error) || !/cancell?ed/i.test(err.message)) {
        console.error(`${kind} export failed`, err);
        alert(`Couldn't export the ${kind === "pdf" ? "PDF" : "Excel file"}. Please try again.`);
      }
    } finally {
      setBusy(null);
    }
  }

  const back = () => navigate(`/site/${siteId}/findings`);
  const btn: CSSProperties = { width: "100%", padding: "14px 0", borderRadius: 12, fontSize: 15, fontWeight: 800 };
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", position: "relative" }}>
      <div style={{ flexShrink: 0, padding: "12px 12px 6px", display: "flex", alignItems: "center", gap: 10 }}>
        <RoundIconButton ariaLabel="Back to flow tests" onClick={back}>
          <IconChevronLeft size={20} strokeWidth={2.2} />
        </RoundIconButton>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 800 }}>Export</div>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>
            {site?.name ?? ""} · {tests.length} flow test{tests.length === 1 ? "" : "s"}
          </div>
        </div>
      </div>
      {tests.length > 0 && (
        <div style={{ flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 16px", fontSize: 13, fontWeight: 800 }}>
          <button aria-label="Previous page" disabled={page === 0} onClick={() => go(page - 1)} style={{ border: "none", background: "none", color: page === 0 ? "var(--muted-2)" : "var(--accent)", fontSize: 18, padding: "0 8px" }}>
            ‹
          </button>
          <span>
            {tests[page]?.name || "Flow test"} <span style={{ color: "var(--muted)", fontWeight: 700 }}>· page {page + 1} of {tests.length}</span>
          </span>
          <button aria-label="Next page" disabled={page >= tests.length - 1} onClick={() => go(page + 1)} style={{ border: "none", background: "none", color: page >= tests.length - 1 ? "var(--muted-2)" : "var(--accent)", fontSize: 18, padding: "0 8px" }}>
            ›
          </button>
        </div>
      )}
      <div
        ref={strip}
        onScroll={(e) => setPage(Math.round(e.currentTarget.scrollLeft / Math.max(1, e.currentTarget.clientWidth)))}
        style={{ flexGrow: 1, minHeight: 0, display: "flex", overflowX: "auto", overflowY: "hidden", scrollSnapType: "x mandatory" }}
      >
        {site &&
          tests.map((t) => (
            <div key={t.id} style={{ flex: "0 0 100%", scrollSnapAlign: "center", overflowY: "auto", padding: "6px 16px 12px", boxSizing: "border-box" }}>
              <PreviewPage test={t} site={site} />
            </div>
          ))}
      </div>
      {tests.length > 1 && (
        <div style={{ flexShrink: 0, display: "flex", justifyContent: "center", gap: 6, padding: "6px 0" }}>
          {tests.map((_, i) => (
            <span key={i} style={{ width: i === page ? 16 : 5, height: 5, borderRadius: 3, background: i === page ? "var(--accent)" : "var(--border-strong)", transition: "width .2s" }} />
          ))}
        </div>
      )}
      <div style={{ flexShrink: 0, padding: "10px 16px calc(24px + env(safe-area-inset-bottom))", borderTop: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ fontSize: 11.5, color: "var(--muted-2)", textAlign: "center" }}>Each test is one page in the PDF and one sheet in the Excel.</div>
        <button disabled={!tests.length || !!busy} onClick={() => void share("excel")} style={{ ...btn, border: "1px solid rgba(46,196,182,.55)", background: "rgba(46,196,182,.12)", color: "var(--accent)" }}>
          Export Excel
        </button>
        <button disabled={!tests.length || !!busy} onClick={() => void share("pdf")} style={{ ...btn, padding: "16px 0", border: "none", background: "var(--accent)", color: "var(--accent-text)" }}>
          Export PDF
        </button>
      </div>
      {busy && (
        <ProgressOverlay
          percent={busy.percent}
          title={busy.kind === "pdf" ? "Preparing PDF" : "Preparing Excel"}
          step={busy.step}
          art={busy.kind === "pdf" ? "conveyor" : "sheet"}
          startedAt={started.current}
          minMs={MIN_LOADER_MS}
        />
      )}
    </div>
  );
}

// one flow test as it prints, on white paper
function PreviewPage({ test, site }: { test: FlowTest; site: Site }) {
  const demand = printDemand(test);
  const sub = printSubtitle(test);
  const tables = printTables(test);
  const paper: CSSProperties = { background: "#fff", color: "#1c2833", borderRadius: 6, padding: "16px 14px", display: "flex", flexDirection: "column", gap: 6, boxShadow: "0 8px 24px rgba(0,0,0,.35)", fontFamily: "Helvetica, Arial, sans-serif" };
  return (
    <div data-testid="flow-page" style={paper}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: "0.02em" }}>{printTitle(test)}</div>
          <div style={{ width: 40, height: 2.5, background: "#1f6fb2", marginTop: 4 }} />
          {sub && <div style={{ fontSize: 10.5, fontWeight: 700, marginTop: 4 }}>{sub}</div>}
        </div>
        <img src={logo} alt="" style={{ height: 22, flexShrink: 0 }} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "1px 8px", fontSize: 9.5 }}>
        {printDetails(test, site).map((d) => (
          <Detail key={d.label} label={d.label} value={d.value} />
        ))}
        {demand.length > 0 && <Detail label="Demand" value={demand.join(", ")} />}
      </div>
      {tables.map((t, i) => (
        <PreviewTable key={i} table={t} />
      ))}
      {test.kind !== "blank" && <div style={{ marginTop: 4 }} dangerouslySetInnerHTML={{ __html: chartModelSvg(chartModel(test, 460, 230, 8), 8) }} />}
      {test.comment?.trim() && (
        <div style={{ fontSize: 9.5, lineHeight: 1.45 }}>
          <b>Comments:</b> {test.comment}
        </div>
      )}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <>
      <b>{label}</b>
      <span>{value || "–"}</span>
    </>
  );
}

function PreviewTable({ table }: { table: PrintTable }) {
  const cell: CSSProperties = { border: "1px solid #d3dbe2", padding: "2px 3px", textAlign: "center" };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 2 }}>
      {table.name && (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ fontSize: 10.5, fontWeight: 800, flexGrow: 1 }}>{table.name}</div>
          {table.result && (
            <span style={{ fontSize: 9, fontWeight: 800, color: table.result === "PASS" ? "#127a3e" : "#c62828", border: `1.5px solid ${table.result === "PASS" ? "#127a3e" : "#c62828"}`, borderRadius: 3, padding: "0 6px" }}>
              {table.result}
            </span>
          )}
        </div>
      )}
      <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 8.5 }}>
        <thead>
          <tr>
            {table.head.map((h, j) => (
              <th key={j} style={{ ...cell, background: "#e6eef5", border: "1px solid #b8c6d2", fontWeight: 700 }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((r, i) => (
            <tr key={i}>
              {r.map((v, j) => (
                <td key={j} style={cell}>
                  {v}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
