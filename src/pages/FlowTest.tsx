import { useEffect, useRef, useState, type CSSProperties, type FocusEvent, type MouseEvent, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { FlowTest as FlowTestRecord, FlowReading, FlowUnit, Site } from "../db/types";
import { deleteFlowTest, getFlowTest, getSite, saveFlowTest } from "../db/db";
import {
  chartSvg,
  FAIL_COLOUR,
  graphLines,
  lineShown,
  type LineKind,
  extraHeading,
  flowUnitFor,
  isReference,
  lmin,
  nextReading,
  NEUTRAL_COLOUR,
  PASS_COLOUR,
  pumpColumns,
  REFERENCE_COLOUR,
  sectionColour,
  sectionName,
  sectionVerdicts,
  showFlow,
  blankRows,
  nameKinds,
  nameOptions,
  renumber,
  verdict,
} from "../lib/flowTest";
import { IconChevronLeft } from "../components/Icons";
import RoundIconButton from "../components/RoundIconButton";
import ConfirmDialog from "../components/ConfirmDialog";
import { useBackHandler } from "../lib/backButton";
import FlowConverter from "../components/FlowConverter";
import { useFlowMode } from "../lib/settings";

// One flow test (see lib/flowTest), as mocked up on the design canvas:
// the graph and pass lines at the top follow the readings as they're typed.
// Sprinkler and hydrant tests have a tab per supply (Town main, Electric
// pump, Diesel pump; renamable, + adds another), a combined system a tab
// per pump; a blank sheet is the inspector's own columns and rows.
// Saved as it's typed.

const SAVE_DELAY_MS = 400;

const card: CSSProperties = { background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 14, padding: 12, display: "flex", flexDirection: "column", gap: 8 };
const lbl: CSSProperties = { fontSize: 11, fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--muted-2)" };
const th: CSSProperties = { fontSize: 10.5, fontWeight: 800, color: "var(--muted)", textAlign: "center", lineHeight: 1.25 };
const cellStyle = (font: number, auto = false): CSSProperties => ({
  width: "100%",
  minWidth: 0,
  background: "var(--panel-2)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: "8px 4px",
  fontSize: font,
  fontWeight: auto ? 600 : 700,
  color: auto ? "var(--muted)" : "var(--text)",
  textAlign: "center",
  outline: "none",
});
const addButton: CSSProperties = { width: "100%", padding: "10px 0", borderRadius: 10, background: "none", border: "1px dashed var(--border-strong)", color: "var(--accent)", fontSize: 13, fontWeight: 800 };
const xButton: CSSProperties = { width: 26, height: 26, borderRadius: "50%", border: "none", background: "none", color: "var(--muted-2)", fontSize: 13, padding: 0 };
const resultBox = (colour: string): CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "6px 16px",
  borderRadius: 999,
  border: `1px solid ${colour}99`,
  background: `${colour}1f`,
  color: colour,
  fontSize: 12.5,
  fontWeight: 800,
  letterSpacing: "0.06em",
  whiteSpace: "nowrap",
});

// a small two-way switch (unit, suction source); value null = neither picked
function Segmented<T extends string>({ label, value, options, onChange, grow = false }: { label: string; value: T | null; options: [T, string][]; onChange: (v: T) => void; grow?: boolean }) {
  return (
    <div role="radiogroup" aria-label={label} style={{ display: "flex", gap: 3, padding: 3, borderRadius: 10, background: "var(--bg)", border: "1px solid var(--border)", flex: grow ? 1 : "0 0 auto" }}>
      {options.map(([v, text]) => {
        const on = value === v;
        return (
          <button
            key={v}
            role="radio"
            aria-checked={on}
            onClick={() => onChange(v)}
            style={{ flex: 1, padding: "6px 12px", borderRadius: 8, border: `1px solid ${on ? "rgba(46,196,182,.6)" : "transparent"}`, background: on ? "rgba(46,196,182,.14)" : "none", color: on ? "var(--accent)" : "var(--muted)", fontSize: 12, fontWeight: 800, whiteSpace: "nowrap" }}
          >
            {text}
          </button>
        );
      })}
    </div>
  );
}

const dutyTag: CSSProperties = { padding: "4px 0", borderRadius: 999, border: "1px solid rgba(255,90,74,.5)", background: "rgba(255,90,74,.1)", color: "#ff7a6a", fontSize: 10.5, fontWeight: 800, textAlign: "center", whiteSpace: "nowrap" };

// PASS / FAIL against the demand (duty) points (none for town main)
function ResultBox({ test, index, unit }: { test: FlowTestRecord; index: number; unit: FlowUnit }) {
  if (isReference(test, index)) return null;
  const v = verdict(test, test.sections[index].rows, unit);
  if (v.pass === null) return null;
  return <span style={resultBox(v.pass ? PASS_COLOUR : FAIL_COLOUR)}>{v.pass ? "✓ PASS" : "✕ FAIL"}</span>;
}


function PencilIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

// a dashed box with a pencil, so it's obvious the name can be changed
function RenameField({ value, onChange, placeholder, label, size = 16, dot }: { value: string; onChange: (v: string) => void; placeholder: string; label: string; size?: number; dot?: string }) {
  return (
    <label style={{ flexGrow: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 10, border: "1px dashed var(--border-strong)", background: "#0b2238", cursor: "text" }}>
      {dot && <span style={{ color: dot, fontSize: 12 }}>●</span>}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        placeholder={placeholder}
        style={{ flexGrow: 1, minWidth: 0, background: "none", border: "none", outline: "none", color: "var(--text)", fontSize: size, fontWeight: 800, padding: 0 }}
      />
      <PencilIcon size={size - 1} />
    </label>
  );
}

const two = (n: number) => String(n).padStart(2, "0");
function dateInputValue(ms: number) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
}

export default function FlowTest() {
  const { siteId, testId } = useParams<{ siteId: string; testId: string }>();
  const navigate = useNavigate();
  const [site, setSite] = useState<Site | null>(null);
  const [test, setTest] = useState<FlowTestRecord | null>(null);
  const [sel, setSel] = useState(0); // the supply / pump being looked at
  // EnFact mode (Admin): the graph has no line options (see lineShown)
  const enfact = useFlowMode() === "enfact";
  const [wide, setWide] = useState(false); // readings full screen, sideways
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [chartW, setChartW] = useState(340);
  const chartBox = useRef<HTMLDivElement>(null);

  // saved a moment after the last change, and when leaving
  const pending = useRef<FlowTestRecord | null>(null);
  const timer = useRef<number | null>(null);
  const flush = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    if (pending.current) void saveFlowTest(pending.current);
    pending.current = null;
  };
  useEffect(() => flush, []);

  useEffect(() => {
    if (!siteId || !testId) return;
    let cancelled = false;
    (async () => {
      const [s, t] = await Promise.all([getSite(siteId), getFlowTest(testId)]);
      if (cancelled) return;
      if (!t) {
        navigate(`/site/${siteId}/findings?tab=flow`, { replace: true });
        return;
      }
      setSite(s ?? null);
      setTest(t);
    })();
    return () => {
      cancelled = true;
    };
  }, [siteId, testId, navigate]);

  useEffect(() => {
    const el = chartBox.current;
    if (!el) return;
    const measure = () => setChartW(el.clientWidth || 340);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [test !== null]);

  if (!test || !siteId) return null;
  // hydrants and combined systems are read in L/s, sprinklers in L/min
  const unit: FlowUnit = flowUnitFor(test);

  function change(fn: (t: FlowTestRecord) => void) {
    setTest((prev) => {
      if (!prev) return prev;
      const next = structuredClone(prev);
      fn(next);
      pending.current = next;
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(flush, SAVE_DELAY_MS);
      return next;
    });
  }

  const back = () => {
    flush();
    navigate(`/site/${siteId}/findings?tab=flow`);
  };

  // Save & close: everything's saved as it's typed; this saves anything still
  // waiting and goes back to the flow tests list
  async function saveAndClose() {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    const last = pending.current;
    pending.current = null;
    if (last) await saveFlowTest(last);
    navigate(`/site/${siteId}/findings?tab=flow`);
  }

  async function handleDelete() {
    if (!test || deleting) return;
    setDeleting(true);
    pending.current = null;
    if (timer.current !== null) window.clearTimeout(timer.current);
    await deleteFlowTest(test.id);
    navigate(`/site/${siteId}/findings?tab=flow`, { replace: true });
  }

  const header = (
    <div style={{ flexShrink: 0, padding: "12px 12px 8px", display: "flex", alignItems: "center", gap: 10 }}>
      <RoundIconButton ariaLabel="Back to flow tests" onClick={back}>
        <IconChevronLeft size={20} strokeWidth={2.2} />
      </RoundIconButton>
      <div style={{ flexGrow: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
        <RenameField value={test.name} onChange={(v) => change((t) => void (t.name = v))} placeholder={test.kind === "blank" ? "Name this sheet" : "Name this test"} label={test.kind === "blank" ? "Sheet name" : "Test name"} />
        <div style={{ fontSize: 12, color: "var(--muted)", paddingLeft: 2 }}>
          {site?.name ?? ""}
          {test.kind === "blank" ? " · blank sheet" : ""}
        </div>
      </div>
    </div>
  );

  const footer = (
    <>
      <FlowConverter />
      <button
        onClick={() => void saveAndClose()}
        style={{ marginTop: 2, padding: "14px 0", borderRadius: 12, background: "var(--accent)", border: "none", color: "var(--accent-text)", fontSize: 14, fontWeight: 800 }}
      >
        Save & close
      </button>
      <button
        onClick={() => setConfirmingDelete(true)}
        style={{ marginTop: 2, padding: "12px 0", borderRadius: 12, background: "none", border: "1px solid rgba(255,107,107,.45)", color: "#ff6b6b", fontSize: 13, fontWeight: 800 }}
      >
        Delete flow test
      </button>
    </>
  );

  const removeDialog = confirmingRemove && test.kind !== "blank" && (() => {
    const i = Math.min(sel, test.sections.length - 1);
    const n = test.sections[i].rows.filter((r) => r.dis.trim() || r.suc.trim() || r.flow.trim()).length;
    const what = test.kind === "combined" ? "pump" : "supply";
    return (
      <ConfirmDialog
        title={`Remove ${sectionName(test, i)}?`}
        message={`${n ? `This ${what} and its ${n} reading${n === 1 ? "" : "s"} will be permanently deleted.` : `This ${what} will be removed. It has no readings yet.`} This can't be undone.`}
        confirmLabel="Remove"
        confirmingLabel="Removing…"
        onCancel={() => setConfirmingRemove(false)}
        onConfirm={() => {
          change((t) => {
            t.sections.splice(i, 1);
            renumber(t.sections, nameKinds(t));
            delete t.graph; // ticks are by position, so start again
          });
          setSel(Math.max(0, i - 1));
          setConfirmingRemove(false);
        }}
      />
    );
  })();

  const dialog = confirmingDelete && (
    <ConfirmDialog
      title="Delete this flow test?"
      message={`"${test.name || "Untitled"}" and its readings will be permanently deleted. This can't be undone.`}
      busy={deleting}
      onCancel={() => setConfirmingDelete(false)}
      onConfirm={handleDelete}
    />
  );

  const shell = (body: ReactNode, note: string, bottom?: ReactNode) => (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", position: "relative" }}>
      {header}
      <div style={{ flexGrow: 1, overflowY: "auto", padding: `4px 16px ${bottom ? 64 : 24}px`, display: "flex", flexDirection: "column", gap: 12 }}>
        {body}
        {footer}
        {/* where it goes: at the end of the page, not a fixed bar */}
        <div style={{ padding: "6px 8px calc(4px + env(safe-area-inset-bottom))", fontSize: 11.5, fontWeight: 700, color: "var(--muted-2)", textAlign: "center", lineHeight: 1.5 }}>
          {note}
          <br />
          (Export → Share Excel)
        </div>
      </div>
      {/* pass / fail at the bottom of the screen, for a quick look */}
      {bottom && (
        <div style={{ position: "absolute", left: 0, right: 0, bottom: "calc(14px + env(safe-area-inset-bottom))", display: "flex", justifyContent: "center", pointerEvents: "none" }}>
          <div style={{ borderRadius: 999, background: "var(--bg)", boxShadow: "0 6px 18px rgba(0,0,0,.45)" }}>{bottom}</div>
        </div>
      )}
      {dialog}
      {removeDialog}
    </div>
  );

  // ---- blank sheet ----
  if (test.kind === "blank") {
    const cols = test.columns ?? [];
    const cells = test.cells ?? [];
    const cellW: CSSProperties = { width: 76, flexShrink: 0 };
    return shell(
      <div style={card}>
        <div style={lbl}>Sheet</div>
        <div style={{ fontSize: 11.5, color: "var(--muted-2)", lineHeight: 1.45 }}>Everything is editable, headings too, and nothing is worked out for you. Add rows and columns as you need.</div>
        <div style={{ overflowX: "auto", margin: "0 -4px", padding: "0 4px 4px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, width: "max-content" }}>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              {cols.map((c, j) => (
                <input
                  key={j}
                  value={c}
                  aria-label="Column heading"
                  onChange={(e) => change((t) => void (t.columns![j] = e.target.value))}
                  style={{ ...cellStyle(11.5), ...cellW, background: "#0b2238", color: "var(--muted)", fontWeight: 800 }}
                />
              ))}
              <button
                aria-label="Add column"
                onClick={() => change((t) => {
                  t.columns!.push(`Column ${t.columns!.length + 1}`);
                  t.cells!.forEach((r) => r.push(""));
                })}
                style={{ width: 30, height: 34, borderRadius: 8, border: "1px dashed var(--border-strong)", background: "none", color: "var(--accent)", fontSize: 16, fontWeight: 800 }}
              >
                +
              </button>
            </div>
            {cells.map((row, i) => (
              <div key={i} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                {row.map((c, j) => (
                  <input key={j} value={c} aria-label="Cell" onChange={(e) => change((t) => void (t.cells![i][j] = e.target.value))} style={{ ...cellStyle(14), ...cellW }} />
                ))}
                <button aria-label="Remove row" onClick={() => change((t) => void t.cells!.splice(i, 1))} style={{ ...xButton, width: 30 }}>
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
        <button style={addButton} onClick={() => change((t) => void t.cells!.push(t.columns!.map(() => "")))}>
          + Add row
        </button>
      </div>,
      "Goes into the site's Excel as its own tab",
    );
  }

  // ---- sprinkler / hydrant / combined ----
  const combined = test.kind === "combined";
  const hydrant = test.kind === "hydrant";
  const current = Math.min(sel, test.sections.length - 1);
  const section = test.sections[current];
  const rows = section.rows;
  const show = (v: number | null) => showFlow(v, unit);
  // a typed value: as typed if typed in the unit shown now, else converted
  const shown = (val: string, u: FlowUnit | undefined) => (val === "" ? "" : (u ?? "min") === unit ? val : show(lmin(val, u)));
  const verdicts = sectionVerdicts(test, unit);
  const lineVerdicts = verdicts.length || isReference(test, current) ? verdicts : [{ index: current, name: sectionName(test, current), ...verdict(test, rows, unit) }];
  const lines = graphLines(test, current);
  // the key lists what's drawn; suction shares its supply's colour
  const legend = lines.filter((l) => l.kind === "dis" && lineShown(test, "dis", l.index)).map((l) => l.index);
  const sucShown = lines.some((l) => l.kind === "suc" && lineShown(test, "suc", l.index));
  // The first columns: a hydrant's flow in L/s; " Hg and the flow side by
  // side for a sprinkler (L/min) or combined system (L/s), the flow worked
  // out from " Hg, or typed. Then discharge, suction, and
  // RPM for a diesel pump or Amps for an electric one.
  const pumps = pumpColumns(test, current);
  const nPump = Number(pumps.rpm) + Number(pumps.amps);
  const split = !hydrant;
  const gridCols = `${split ? "52px 68px" : "70px"} 1fr 1fr${" 1fr".repeat(nPump)} 26px`;
  const gap = nPump > 1 || (split && nPump) ? 4 : 6;
  const font = nPump > 1 || (split && nPump) ? 12 : 14;
  const updateRow = (i: number, fn: (r: FlowReading) => void) => change((t) => fn(t.sections[current].rows[i]));
  const kindNote = { sprinkler: "Goes into the site's Excel as a SPRINKLER tab", hydrant: "Goes into the site's Excel as a HYDRANT tab", combined: "Goes into the site's Excel as a Combined System tab" }[test.kind];
  const unitLabel = unit === "sec" ? "L/s" : "L/min";
  const addReading = () => change((t) => void t.sections[current].rows.push(nextReading(t)));

  const hgCell = (r: FlowReading, i: number, f: number, props: { tabIndex?: number } = {}) => (
    <input {...props} style={cellStyle(f)} inputMode="decimal" value={r.hg} aria-label='" Hg' onChange={(e) => updateRow(i, (x) => void (x.hg = e.target.value))} />
  );
  // typed, in the test's unit (working it out from " Hg depends on the rig)
  const flowCell = (r: FlowReading, i: number, f: number, props: { className?: string; tabIndex?: number } = {}) => (
    <input
      {...props}
      style={hydrant ? cellStyle(f) : { ...cellStyle(f), borderColor: "rgba(46,196,182,.35)" }}
      inputMode="decimal"
      value={shown(r.flow, r.flowUnit)}
      aria-label="Flow"
      onChange={(e) => updateRow(i, (x) => void Object.assign(x, { flow: e.target.value, flowUnit: unit }))}
    />
  );
  const stepHead = hydrant ? (
    <div style={th}>
      Flow
      <br />
      L/s
    </div>
  ) : (
    <>
      <div style={th}>" Hg</div>
      <div style={th}>
        Flow
        <br />
        {unitLabel}
      </div>
    </>
  );
  const stepCell = (r: FlowReading, i: number, f: number) =>
    hydrant ? (
      flowCell(r, i, f)
    ) : (
      <>
        {hgCell(r, i, f)}
        {flowCell(r, i, f)}
      </>
    );
  // the same, one column at a time, for full screen (the first one is pinned)
  const stepHeadParts = hydrant
    ? [
        <div key="f" style={th}>
          Flow
          <br />
          L/s
        </div>,
      ]
    : [
        <div key="h" style={th}>
          " Hg
        </div>,
        <div key="f" style={th}>
          Flow
          <br />
          {unitLabel}
        </div>,
      ];
  const stepCellParts = (r: FlowReading, i: number, f: number) => (hydrant ? [flowCell(r, i, f)] : [hgCell(r, i, f), flowCell(r, i, f)]);
  const pumpHeads = (
    <>
      {pumps.rpm && <div style={th}>RPM</div>}
      {pumps.amps && <div style={th}>Amps</div>}
    </>
  );
  // full screen only: a combined system's engine temp and oil pressure (Contractor)
  const engine = combined && !enfact;
  const engineHeads = engine && (
    <>
      <div style={th}>
        Temp
        <br />
        °C
      </div>
      <div style={th}>
        Oil pressure
        <br />
        kPa
      </div>
    </>
  );
  const engineCells = (r: FlowReading, i: number, style: CSSProperties) =>
    engine && (
      <>
        <input style={style} inputMode="decimal" value={r.temp ?? ""} aria-label="Temp" onChange={(e) => updateRow(i, (x) => void (x.temp = e.target.value))} />
        <input style={style} inputMode="decimal" value={r.oil ?? ""} aria-label="Oil pressure" onChange={(e) => updateRow(i, (x) => void (x.oil = e.target.value))} />
      </>
    );
  const pumpCells = (r: FlowReading, i: number, style: CSSProperties) => (
    <>
      {pumps.rpm && <input style={style} inputMode="decimal" value={r.rpm ?? ""} aria-label="RPM" onChange={(e) => updateRow(i, (x) => void (x.rpm = e.target.value))} />}
      {pumps.amps && <input style={style} inputMode="decimal" value={r.amps ?? ""} aria-label="Amps" onChange={(e) => updateRow(i, (x) => void (x.amps = e.target.value))} />}
    </>
  );
  const removeRow = (i: number) => change((t) => void t.sections[current].rows.splice(i, 1));
  // what's in a reading, for "Delete reading 3?"
  const rowSummary = (r: FlowReading) => {
    const v = (x: string | undefined) => x?.trim() || "–";
    const flow = shown(r.flow, r.flowUnit);
    return [
      ...(hydrant ? [] : [`" Hg ${v(r.hg)}`]),
      `Flow ${v(flow)} ${unitLabel}`,
      `Discharge ${v(r.dis)}`,
      `Suction ${v(r.suc)}`,
      ...(pumps.rpm ? [`RPM ${v(r.rpm)}`] : []),
      ...(pumps.amps ? [`Amps ${v(r.amps)}`] : []),
    ].join("  ·  ");
  };

  return shell(
    <>
      {/* the template's header and comment lines */}
      <div style={card}>
        <div style={lbl}>Test details</div>
        {(
          [
            ["Date", "date"],
            ["Equipment", "equipment"],
            ["Tested by", "testedBy"],
          ] as const
        ).map(([label, key]) => (
          <label key={key} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ width: 78, flexShrink: 0, fontSize: 12.5, fontWeight: 700, color: "var(--muted)" }}>{label}</span>
            {key === "date" ? (
              <input
                type="date"
                value={dateInputValue(test.testedAt)}
                onChange={(e) => {
                  const [y, m, d] = e.target.value.split("-").map(Number);
                  if (y && m && d) change((t) => void (t.testedAt = new Date(y, m - 1, d, 12).getTime()));
                }}
                style={{ ...cellStyle(14), textAlign: "left", padding: "8px 10px", colorScheme: "dark" }}
              />
            ) : (
              <input
                value={test[key] ?? ""}
                placeholder={key === "equipment" ? "e.g. 80 mm / 20T Ambient" : "e.g. Chubb"}
                onChange={(e) => change((t) => void (t[key] = e.target.value))}
                style={{ ...cellStyle(14), textAlign: "left", padding: "8px 10px" }}
              />
            )}
          </label>
        ))}
        {combined && !enfact && (
          <label style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ width: 78, flexShrink: 0, fontSize: 12.5, fontWeight: 700, color: "var(--muted)" }}>Year installed</span>
            <input
              value={test.yearInstalled ?? ""}
              inputMode="numeric"
              aria-label="Year installed"
              placeholder="e.g. 2006"
              onChange={(e) => change((t) => void (t.yearInstalled = e.target.value))}
              style={{ ...cellStyle(14), textAlign: "left", padding: "8px 10px" }}
            />
          </label>
        )}
      </div>
      {/* demand points */}
      <div style={card}>
        {combined ? (
          // a combined system's duty: its own unit (the readings follow it), the first point the pump duty
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ ...lbl, flexGrow: 1 }}>System pump duty</div>
            <Segmented
              label="Pump duty unit"
              value={unit}
              options={[
                ["min", "L/min"],
                ["sec", "L/s"],
              ]}
              onChange={(u) => change((t) => void (t.unit = u))}
            />
          </div>
        ) : (
          <div style={lbl}>Demand points</div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: combined ? "1fr 1fr 76px 26px" : "1fr 1fr 26px", gap: 6 }}>
          <div style={th}>
            Flow {unitLabel}
          </div>
          <div style={th}>Pressure kPa</div>
          {combined && <div />}
          <div />
        </div>
        {test.demand.map((d, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: combined ? "1fr 1fr 76px 26px" : "1fr 1fr 26px", gap: 6, alignItems: "center" }}>
            <input
              style={cellStyle(14)}
              inputMode="decimal"
              value={shown(d.flow, d.flowUnit)}
              aria-label="Demand flow"
              onChange={(e) => change((t) => void Object.assign(t.demand[i], { flow: e.target.value, flowUnit: unit }))}
            />
            <input style={cellStyle(14)} inputMode="decimal" value={d.kpa} aria-label="Demand pressure" onChange={(e) => change((t) => void (t.demand[i].kpa = e.target.value))} />
            {combined && (i === 0 ? <span style={dutyTag}>Pump duty</span> : <span />)}
            <button style={xButton} aria-label="Remove demand point" onClick={() => change((t) => void t.demand.splice(i, 1))}>
              ✕
            </button>
          </div>
        ))}
        <button style={addButton} onClick={() => change((t) => void t.demand.push({ flow: "", kpa: "" }))}>
          + Add demand point
        </button>
      </div>

      {/* graph */}
      <div style={{ ...card, padding: "10px 8px 6px", gap: 2 }}>
        <div ref={chartBox} style={{ width: "100%", height: 210 }} dangerouslySetInnerHTML={{ __html: chartSvg(test, chartW, 210, { unit, current }) }} />
        <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap", fontSize: 11, fontWeight: 700, color: "var(--muted)", paddingTop: 2 }}>
          {legend.map((i) =>
            isReference(test, i) ? (
              <span key={i}>
                <span style={{ color: REFERENCE_COLOUR }}>- -</span> {sectionName(test, i)}
              </span>
            ) : (
              <span key={i}>
                <span style={{ color: sectionColour(i) }}>●</span> {sectionName(test, i)}
              </span>
            ),
          )}
          {combined ? (
            <>
              <span>
                <span style={{ color: "#ff5a4a" }}>◆</span> Pump duty
              </span>
              {test.demand.length > 1 && (
                <span>
                  <span style={{ color: "#ff5a4a" }}>◇</span> Demand
                </span>
              )}
            </>
          ) : (
            <span>
              <span style={{ color: "#ff5a4a" }}>◆</span> Demand
            </span>
          )}
          {sucShown && (
            <span>
              <span style={{ color: NEUTRAL_COLOUR }}>····</span> Suction
            </span>
          )}
        </div>
        {!enfact && (
          <GraphLines
            test={test}
            lines={lines}
            onChange={(set) =>
              change((t) => {
                t.graph = { ...t.graph };
                for (const [k, v] of Object.entries(set)) {
                  // back to its default: drop it
                  const [kind] = k.split(":");
                  if (v === (kind === "dis")) delete t.graph[k];
                  else t.graph[k] = v;
                }
              })
            }
          />
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "center" }}>
        {lineVerdicts.map((v) => (
          <div key={v.index} style={{ fontSize: 12.5, fontWeight: 800, color: v.colour, textAlign: "center" }}>
            <span style={{ color: sectionColour(v.index) }}>●</span> {v.name}: {v.text}
          </div>
        ))}
      </div>

      {/* readings */}
      <div style={card}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingBottom: 6, borderBottom: "1px solid var(--border)" }}>
          <div style={lbl}>{combined ? "Pumps" : "Supply"}</div>
          <SectionTabs
            test={test}
            current={current}
            onSelect={setSel}
            onAdd={() => {
              const n = test.sections.length;
              change((t) => void t.sections.push({ name: "", rows: blankRows(t.kind) }));
              setSel(n);
            }}
            onName={(name) =>
              change((t) => {
                t.sections[current].name = name;
                renumber(t.sections, nameKinds(t));
              })
            }
            onRemove={() => setConfirmingRemove(true)}
          />
        </div>

        {/* where the pump's suction comes from (not for the town main
            itself), and a combined system's cut-in (Contractor) */}
        {!isReference(test, current) && (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ width: 64, flexShrink: 0, fontSize: 12.5, fontWeight: 700, color: "var(--muted)" }}>Suction</span>
            <Segmented
              label="Suction from"
              value={section.suction ?? null}
              options={[
                ["tank", "Tank"],
                ["town", "Town main"],
              ]}
              onChange={(v) => change((t) => void (t.sections[current].suction = t.sections[current].suction === v ? undefined : v))}
              grow
            />
          </div>
        )}
        {combined && !enfact && (
          <label style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ width: 64, flexShrink: 0, fontSize: 12.5, fontWeight: 700, color: "var(--muted)" }}>Cut-in</span>
            <input
              value={section.cutIn ?? ""}
              inputMode="decimal"
              aria-label="Cut-in kPa"
              placeholder="kPa"
              onChange={(e) => change((t) => void (t.sections[current].cutIn = e.target.value))}
              style={{ ...cellStyle(14), textAlign: "left", padding: "8px 10px" }}
            />
          </label>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ ...lbl, flexGrow: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Readings · {sectionName(test, current)}</div>
          <button
            onClick={() => setWide(true)}
            aria-label="Full screen, sideways"
            style={{ flexShrink: 0, height: 28, display: "flex", alignItems: "center", gap: 5, padding: "0 9px", borderRadius: 9, border: "1px solid rgba(46,196,182,.55)", background: "rgba(46,196,182,.14)", color: "var(--accent)", fontSize: 11.5, fontWeight: 800 }}
          >
            <TurnIcon />
            Full screen
          </button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: gridCols, gap, alignItems: "end" }}>
          {stepHead}
          <div style={th}>
            Discharge
            <br />
            kPa
          </div>
          <div style={th}>
            Suction
            <br />
            kPa
          </div>
          {pumpHeads}
          <div />
        </div>
        {rows.map((r, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: gridCols, gap, alignItems: "center" }}>
            {stepCell(r, i, font)}
            <input style={cellStyle(font)} inputMode="decimal" value={r.dis} aria-label="Discharge" onChange={(e) => updateRow(i, (x) => void (x.dis = e.target.value))} />
            <input style={cellStyle(font)} inputMode="decimal" value={r.suc} aria-label="Suction" onChange={(e) => updateRow(i, (x) => void (x.suc = e.target.value))} />
            {pumpCells(r, i, cellStyle(font))}
            <button style={xButton} aria-label="Remove reading" onClick={() => removeRow(i)}>
              ✕
            </button>
          </div>
        ))}
        <button style={addButton} onClick={addReading}>
          + Add reading
        </button>
        {!!test.extraCols?.length && (
          <div style={{ fontSize: 11.5, color: "var(--muted)", textAlign: "center" }}>
            Added columns ({test.extraCols.map((c) => c.name).join(", ")}) are in full screen
          </div>
        )}
        <div style={{ fontSize: 11.5, color: "var(--muted-2)", lineHeight: 1.45 }}>
          {hydrant ? "Flows in L/s. " : `Type the flow in ${unitLabel}. `}
          {test.kind === "combined" ? "RPM shows for diesel pumps, Amps for electric." : "RPM shows for a diesel pump, Amps for an electric pump."}
        </div>
      </div>

      {wide && (
        <WideReadings
          test={test}
          current={current}
          onSelect={setSel}
          onClose={() => setWide(false)}
          stepHeads={stepHeadParts}
          stepCells={stepCellParts}
          engineHeads={engineHeads}
          engineCells={engineCells}
          engineCols={engine ? 2 : 0}
          pumpHeads={pumpHeads}
          pumpCells={pumpCells}
          updateRow={updateRow}
          removeRow={removeRow}
          rowSummary={rowSummary}
          addReading={addReading}
          onColumns={(fn) => change(fn)}
          verdictLine={
            isReference(test, current)
              ? null
              : (() => {
                  const v = verdict(test, rows, unit);
                  return { colour: v.colour, text: `${sectionName(test, current)}: ${v.text}` };
                })()
          }
        />
      )}
      {/* comments, for the report */}
      <div style={card}>
        <div style={{ display: "flex", alignItems: "center" }}>
          <div style={{ ...lbl, flexGrow: 1 }}>Comments</div>
          <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--muted-2)" }}>on the report</span>
        </div>
        <textarea
          value={test.comment ?? ""}
          aria-label="Comments"
          placeholder="Anything to note on the report, e.g. Diesel pump fuel tank at 60%."
          rows={3}
          onChange={(e) => change((t) => void (t.comment = e.target.value))}
          style={{ ...cellStyle(14), textAlign: "left", padding: "10px 12px", fontWeight: 600, lineHeight: 1.45, resize: "vertical", fontFamily: "inherit", minHeight: 84 /* never dragged too small to open again */ }}
        />
        <div style={{ fontSize: 11, color: "var(--muted-2)" }}>Printed under the graph in the export.</div>
      </div>

    </>,
    kindNote,
    ResultBox({ test, index: current, unit }),
  );
}

// The supply / pump tabs. The one you're on has a pencil: tap it for a
// floating list of names (numbered automatically, see lib/flowTest's
// nameOptions), Custom… / Rename… to type one, and Remove (which asks
// first). + adds a supply with no name yet.
function SectionTabs({
  test,
  current,
  onSelect,
  onAdd,
  onName,
  onRemove,
}: {
  test: FlowTestRecord;
  current: number;
  onSelect: (i: number) => void;
  onAdd: () => void;
  onName: (name: string) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState<string | null>(null);
  const combined = test.kind === "combined";
  const named = !!test.sections[current]?.name;
  const close = () => {
    setOpen(false);
    setCustom(null);
  };
  useBackHandler(() => {
    if (!open) return false;
    close();
    return true;
  });
  const row: CSSProperties = { display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 1, width: "100%", padding: "11px 12px", border: "none", borderBottom: "1px solid var(--border)", background: "none", color: "var(--text)", textAlign: "left" };
  return (
    <div style={{ position: "relative" }}>
      <div style={{ display: "flex", gap: 4, padding: 4, borderRadius: 12, background: "var(--bg)", border: "1px solid var(--border)", overflowX: "auto" }}>
        {test.sections.map((s, i) => {
          const on = i === current;
          return (
            <button
              key={i}
              aria-label={on ? `${sectionName(test, i)}: change name` : sectionName(test, i)}
              onClick={() => {
                if (on) setOpen(!open);
                else {
                  onSelect(i);
                  close();
                }
              }}
              style={{
                flex: "1 0 auto",
                minWidth: 84,
                maxWidth: 190,
                height: 40,
                padding: "0 5px 0 10px",
                display: "flex",
                alignItems: "center",
                gap: 6,
                borderRadius: 10,
                border: on ? "1px dashed #2e6a8e" : "1px solid transparent",
                background: on ? "var(--panel-2)" : "none",
                color: on ? "var(--text)" : "var(--muted)",
                fontSize: 12.5,
                fontWeight: 800,
                whiteSpace: "nowrap",
              }}
            >
              <span style={{ color: sectionColour(i), flexShrink: 0, fontSize: 11, lineHeight: 1 }}>●</span>
              <span style={{ flexGrow: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", textAlign: "left" }}>{s.name || sectionName(test, i)}</span>
              {on && (
                <span style={{ flexShrink: 0, width: 28, height: 28, borderRadius: 8, background: "rgba(46,196,182,.14)", border: "1px solid rgba(46,196,182,.4)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <PencilIcon size={15} />
                </span>
              )}
            </button>
          );
        })}
        <button
          aria-label={combined ? "Add a pump" : "Add a supply"}
          onClick={() => {
            close();
            onAdd();
          }}
          style={{ flex: "0 0 auto", width: 38, borderRadius: 10, border: "1px dashed var(--border-strong)", background: "none", color: "var(--accent)", fontSize: 18, fontWeight: 800, padding: 0 }}
        >
          +
        </button>
      </div>

      {open && (
        <>
          <div onClick={close} style={{ position: "fixed", inset: 0, zIndex: 29 }} />
          <div
            className="dropbox"
            role="menu"
            style={{ position: "absolute", top: "calc(100% + 6px)", left: 4, width: 248, zIndex: 30, borderRadius: 14, background: "var(--panel-2)", border: "1px solid #2e6a8e", boxShadow: "0 16px 36px rgba(0,0,0,.55), 0 2px 6px rgba(0,0,0,.4)", overflow: "hidden" }}
          >
            {nameOptions(test, current).map((o) => (
              <button
                key={o.base}
                role="menuitem"
                style={row}
                onClick={() => {
                  onName(o.base);
                  close();
                }}
              >
                <span style={{ fontSize: 14, fontWeight: 800 }}>{o.name}</span>
                {o.note && <span style={{ fontSize: 11, fontWeight: 700, color: "var(--muted-2)" }}>{o.note}</span>}
              </button>
            ))}
            {custom === null ? (
              <button role="menuitem" style={{ ...row, flexDirection: "row", alignItems: "center", gap: 8, color: "var(--accent)", fontSize: 14, fontWeight: 800 }} onClick={() => setCustom(test.sections[current].name)}>
                <PencilIcon size={14} />
                {named ? "Rename…" : "Custom…"}
              </button>
            ) : (
              <div style={{ display: "flex", gap: 8, padding: "8px 10px", borderBottom: "1px solid var(--border)" }}>
                <input
                  autoFocus
                  value={custom}
                  aria-label={combined ? "Pump name" : "Supply name"}
                  placeholder="Type the equipment, e.g. Fire pump 3"
                  onChange={(e) => setCustom(e.target.value)}
                  style={{ ...cellStyle(14), textAlign: "left", padding: "8px 10px", flexGrow: 1 }}
                />
                <button
                  onClick={() => {
                    if (custom.trim()) onName(custom.trim());
                    close();
                  }}
                  style={{ flexShrink: 0, padding: "0 14px", borderRadius: 8, border: "none", background: "var(--accent)", color: "var(--accent-text)", fontSize: 13, fontWeight: 800 }}
                >
                  Use
                </button>
              </div>
            )}
            {test.sections.length > 1 && (
              <button
                role="menuitem"
                style={{ ...row, borderBottom: "none", color: "#ff6b6b", fontSize: 13, fontWeight: 800 }}
                onClick={() => {
                  close();
                  onRemove();
                }}
              >
                ✕ Remove this {combined ? "pump" : "supply"}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function TurnIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <rect x="3" y="8" width="13" height="8" rx="1.6" />
      <path d="M8 4.5A7 7 0 0 1 19.5 8" />
      <path d="M19.8 4.6 19.5 8l-3.3-.6" />
    </svg>
  );
}

// The readings full screen (canvas FlowWide, FlowKeypadB): on an upright
// phone it twists a quarter-turn to lie sideways. The same columns as the card
// (" Hg and the flow, or a hydrant's L/s; Discharge; Suction; RPM or Amps),
// then any added ones, at full size: the table scrolls both ways under its
// own number pad, with the first column pinned on the left. The phone's
// keyboard stays shut (it would come up sideways). Done or the back button
// twists it back; everything is already saved.
const KEY_CELL = 96; // a column's width
const KEY_GAP = 6;
const PAD_MIN = 242; // the keypad never gets narrower than this
function WideReadings({
  test,
  current,
  onSelect,
  onClose,
  stepHeads,
  stepCells,
  engineHeads,
  engineCells,
  engineCols,
  pumpHeads,
  pumpCells,
  updateRow,
  removeRow,
  rowSummary,
  addReading,
  onColumns,
  verdictLine,
}: {
  test: FlowTestRecord;
  current: number;
  onSelect: (i: number) => void;
  onClose: () => void;
  stepHeads: ReactNode[]; // " Hg and the flow, or a hydrant's L/s
  stepCells: (r: FlowReading, i: number, f: number) => ReactNode[];
  engineHeads: ReactNode;
  engineCells: (r: FlowReading, i: number, style: CSSProperties) => ReactNode;
  engineCols: number;
  pumpHeads: ReactNode;
  pumpCells: (r: FlowReading, i: number, style: CSSProperties) => ReactNode;
  updateRow: (i: number, fn: (r: FlowReading) => void) => void;
  removeRow: (i: number) => void;
  rowSummary: (r: FlowReading) => string;
  addReading: () => void;
  onColumns: (fn: (t: FlowTestRecord) => void) => void;
  verdictLine: { colour: string; text: string } | null; // none for town main
}) {
  // the reading waiting on "Delete reading 3?", and the one just added
  const [ask, setAsk] = useState<number | null>(null);
  const [added, setAdded] = useState<number | null>(null);
  // the add / edit column box: null closed, -1 adding, else the column
  const [colEdit, setColEdit] = useState<number | null>(null);
  const [closing, setClosing] = useState(false);
  // turned a quarter-turn on an upright screen, flat on a sideways one;
  // checked again whenever the screen changes shape, so it never ends up
  // turned on a screen that's already sideways (the app is locked upright on
  // Android, but a tablet or the web version can still rotate)
  const [turn, setTurn] = useState(() => window.innerHeight > window.innerWidth);
  useEffect(() => {
    const onResize = () => setTurn(window.innerHeight > window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const [padOn, setPadOn] = useState(false);
  const [bodyW, setBodyW] = useState(0);
  const bodyRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const active = useRef<HTMLInputElement | null>(null);
  const fresh = useRef(false); // the next key replaces the cell
  const before = useRef<{ left: number; top: number } | null>(null); // where the table sat before the keypad came in
  const close = () => {
    if (closing) return;
    setClosing(true);
    window.setTimeout(onClose, 380);
  };
  const hidePad = () => {
    active.current?.blur();
    delete active.current?.dataset.fresh;
    active.current = null;
    setPadOn(false);
    const b = before.current;
    before.current = null;
    if (b) scrollRef.current?.scrollTo({ left: b.left, behavior: "smooth" });
  };
  useBackHandler(() => {
    if (colEdit !== null) setColEdit(null);
    else if (ask !== null) setAsk(null);
    else if (padOn) hidePad();
    else close();
    return true;
  });
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBodyW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // the cells come from the upright card, which wants the phone's keyboard
  useEffect(() => {
    scrollRef.current?.querySelectorAll("input").forEach((el) => (el.inputMode = "none"));
  });
  const rows = test.sections[current].rows;
  const extras = test.extraCols ?? [];
  const pumps = pumpColumns(test, current);
  const nCols = stepHeads.length + 2 + Number(pumps.rpm) + Number(pumps.amps) + engineCols + extras.length;
  const tableW = nCols * KEY_CELL + (nCols - 1) * KEY_GAP;
  // the keypad takes the room the columns leave, never less than PAD_MIN
  const padW = Math.max(PAD_MIN, bodyW - 8 - tableW - KEY_GAP - 22);
  const cols = `repeat(${nCols}, ${KEY_CELL}px) ${padW + 10}px`;
  const headBtn: CSSProperties = { ...th, position: "relative", border: "1px dashed #2e6a8e", background: "#0b2238", borderRadius: 7, padding: "3px 2px", color: "var(--text)" };
  const pump: CSSProperties = { ...cellStyle(17), borderColor: "rgba(245,165,92,.4)" };
  const big = cellStyle(17);

  // keep the cell being typed in clear of the keypad and the pinned column
  const reveal = (el: HTMLElement) => {
    const sc = scrollRef.current;
    if (!sc) return;
    const pin = el.closest<HTMLElement>(".wide-pin");
    const box = pin ?? el;
    let left = sc.scrollLeft;
    let top = sc.scrollTop;
    const view = sc.clientWidth - padW - 18;
    if (pin) left = 0;
    else {
      const x = el.offsetLeft;
      if (x - KEY_CELL - 14 < left) left = x - KEY_CELL - 14;
      else if (x + el.offsetWidth + 8 > left + view) left = x + el.offsetWidth + 8 - view;
    }
    const y = box.offsetTop;
    if (y - 44 < top) top = y - 44;
    else if (y + box.offsetHeight + 8 > top + sc.clientHeight) top = y + box.offsetHeight + 8 - sc.clientHeight;
    sc.scrollTo({ left: Math.max(0, left), top: Math.max(0, top), behavior: "smooth" });
  };
  const onFocusCell = (e: FocusEvent) => {
    const el = e.target;
    if (!(el instanceof HTMLInputElement)) return;
    if (active.current && active.current !== el) delete active.current.dataset.fresh;
    active.current = el;
    fresh.current = true;
    el.dataset.fresh = "1";
    if (!padOn) {
      const sc = scrollRef.current;
      before.current = sc ? { left: sc.scrollLeft, top: sc.scrollTop } : null;
      setPadOn(true);
    }
    window.setTimeout(() => reveal(el), 0);
  };
  // The cells can't be touched themselves (index.css): on Android a drag
  // that starts on a text box goes to the box, not the table, so the table
  // wouldn't scroll. A tap lands on the table instead and picks the cell
  // under the finger here.
  const onTapTable = (e: MouseEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    const cell = [...(scrollRef.current?.querySelectorAll<HTMLInputElement>(".wide-grid input") ?? [])].find((el) => {
      const r = el.getBoundingClientRect();
      return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    });
    cell?.focus({ preventScroll: true });
  };
  // a key goes into the cell as if typed, so the cell's own rules apply
  const press = (key: string) => {
    const el = active.current;
    if (!el) return;
    let v = fresh.current ? "" : el.value;
    if (key === "bs") v = v.slice(0, -1);
    else if (key === "." && v.includes(".")) return;
    else if (v.length < 9) v += key;
    fresh.current = false;
    delete el.dataset.fresh;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  };
  const addRow = () => {
    const n = rows.length;
    addReading();
    setAdded(n);
    window.setTimeout(() => scrollRef.current?.querySelectorAll<HTMLInputElement>(".wide-pin input")[n]?.focus(), 30);
  };
  const key = (k: string, label: ReactNode = k, extra = "") => (
    <button
      key={k}
      type="button"
      tabIndex={-1}
      className={`wide-key${extra}`}
      aria-label={k === "bs" ? "Backspace" : k === "." ? "Decimal point" : k}
      // keep the cell focused
      onPointerDown={(e) => e.preventDefault()}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => press(k)}
    >
      {label}
    </button>
  );

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 40 }}>
      <div className={closing ? "wide-dim out" : "wide-dim"} onClick={close} style={{ position: "absolute", inset: 0, background: "rgba(3,13,22,.78)" }} />
      <div
        className={`${turn ? "wide-turn" : "wide-flat"}${closing ? " closing" : ""}`}
        role="dialog"
        aria-label="Readings, full screen"
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: turn ? "100vh" : "100vw",
          height: turn ? "100vw" : "100vh",
          boxSizing: "border-box",
          background: "var(--panel)",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 800 }}>Readings</div>
          <div style={{ display: "flex", gap: 4, padding: 3, borderRadius: 10, background: "var(--bg)", border: "1px solid var(--border)", overflowX: "auto", minWidth: 0 }}>
            {test.sections.map((_, i) => {
              const on = i === current;
              const ref = isReference(test, i);
              return (
                <button
                  key={i}
                  onClick={() => {
                    hidePad();
                    onSelect(i);
                  }}
                  style={{ flexShrink: 0, padding: "6px 10px", borderRadius: 8, border: "none", background: on ? "var(--panel-2)" : "none", color: on ? "var(--text)" : "var(--muted)", fontSize: 12, fontWeight: 800, whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 5 }}
                >
                  <span style={{ color: ref ? REFERENCE_COLOUR : sectionColour(i) }}>●</span>
                  {sectionName(test, i)}
                </button>
              );
            })}
          </div>
          {/* the pump's cut-in and suction source, as recorded */}
          {(() => {
            const sec = test.sections[current];
            const bits = [sec.cutIn?.trim() && test.kind === "combined" ? `cut-in ${sec.cutIn.trim()} kPa` : "", sec.suction ? `suction from ${sec.suction === "tank" ? "tank" : "town main"}` : ""].filter(Boolean);
            return bits.length ? <span style={{ flexShrink: 0, fontSize: 11.5, fontWeight: 700, color: "var(--muted)" }}>{bits.join(" · ")}</span> : null;
          })()}
          <div style={{ flexGrow: 1 }} />
          <button
            aria-label="Add a column"
            onClick={() => {
              hidePad();
              setColEdit(-1);
            }}
            style={{ flexShrink: 0, height: 30, padding: "0 10px", borderRadius: 9, border: "1px dashed #2e6a8e", background: "none", color: "var(--accent)", fontSize: 12, fontWeight: 800 }}
          >
            + Column
          </button>
          <button onClick={close} style={{ flexShrink: 0, padding: "7px 14px", borderRadius: 10, border: "none", background: "var(--accent)", color: "var(--accent-text)", fontSize: 12.5, fontWeight: 800 }}>
            Done
          </button>
        </div>
        <div ref={bodyRef} style={{ flexGrow: 1, minHeight: 0, position: "relative", overflow: "hidden" }}>
          <div ref={scrollRef} className="wide-scroll" onFocus={onFocusCell} onClick={onTapTable}>
            <div className="wide-grid" style={{ gridTemplateColumns: cols }}>
              {stepHeads.map((h, j) => (
                <div key={`h${j}`} className={j === 0 ? "wide-head wide-pin" : "wide-head"}>
                  {h}
                </div>
              ))}
              <div className="wide-head">
                <div style={th}>
                  Discharge
                  <br />
                  kPa
                </div>
              </div>
              <div className="wide-head">
                <div style={th}>
                  Suction
                  <br />
                  kPa
                </div>
              </div>
              {[pumpHeads, engineHeads].map((g, j) => (
                <div key={`g${j}`} style={{ display: "contents" }} className="wide-heads">
                  {g}
                </div>
              ))}
              {extras.map((c, j) => (
                <div key={`x${j}`} className="wide-head">
                  <button
                    style={headBtn}
                    aria-label={`Edit column ${c.name}`}
                    onClick={() => {
                      hidePad();
                      setColEdit(j);
                    }}
                  >
                    {c.name}
                    {c.unit?.trim() && (
                      <>
                        <br />
                        {c.unit}
                      </>
                    )}
                    <span style={{ position: "absolute", top: -6, right: -4, width: 13, height: 13, borderRadius: 4, background: "var(--panel-2)", border: "1px solid #2e6a8e", fontSize: 8, lineHeight: "12px", color: "var(--accent)" }}>✎</span>
                  </button>
                </div>
              ))}
              <div className="wide-head" />
              {rows.map((r, i) => {
                const [first, ...rest] = stepCells(r, i, 17);
                return (
                  <div key={i} style={{ display: "contents" }} className={i === added ? "wide-added" : undefined}>
                    <div className="wide-pin">
                      <span className="wide-num">{i + 1}</span>
                      {first}
                    </div>
                    {rest}
                    <input style={big} inputMode="none" value={r.dis} aria-label="Discharge" onChange={(e) => updateRow(i, (x) => void (x.dis = e.target.value))} />
                    <input style={big} inputMode="none" value={r.suc} aria-label="Suction" onChange={(e) => updateRow(i, (x) => void (x.suc = e.target.value))} />
                    {pumpCells(r, i, pump)}
                    {engineCells(r, i, big)}
                    {extras.map((c, j) => (
                      <input
                        key={j}
                        style={big}
                        inputMode="none"
                        value={r.extra?.[j] ?? ""}
                        aria-label={c.name}
                        onChange={(e) =>
                          updateRow(i, (x) => {
                            x.extra = extras.map((_, k) => x.extra?.[k] ?? "");
                            x.extra[j] = e.target.value;
                          })
                        }
                      />
                    ))}
                    <div className="wide-xcell">
                      <button className={padOn ? "wide-x off" : "wide-x"} tabIndex={padOn ? -1 : 0} aria-label={`Delete reading ${i + 1}`} onClick={() => setAsk(i)}>
                        ✕
                      </button>
                    </div>
                  </div>
                );
              })}
              {/* where the next reading goes, numbered for it */}
              <button className="wide-ghost" style={{ gridColumn: `1 / span ${nCols}` }} onClick={addRow}>
                <span className="wide-num">{rows.length + 1}</span>
                <span className="wide-ghost-label">
                  <b>＋</b> Add reading {rows.length + 1}
                </span>
              </button>
            </div>
            <div className="wide-foot" style={{ width: Math.max(260, bodyW - (padOn ? padW + 30 : 20)) }}>
              <div style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 800, color: verdictLine?.colour }}>{verdictLine && `● ${verdictLine.text}`}</div>
              {ResultBox({ test, index: current, unit: flowUnitFor(test) })}
            </div>
          </div>
          {ask !== null && rows[ask] && (
            <div className="wide-ask" onClick={() => setAsk(null)}>
              <div role="dialog" aria-label="Delete reading" className="wide-ask-box" onClick={(e) => e.stopPropagation()}>
                <div style={{ fontSize: 16, fontWeight: 800 }}>Delete reading {ask + 1}?</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", lineHeight: 1.5 }}>{rowSummary(rows[ask])}</div>
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 6 }}>
                  <button className="wide-ask-btn" onClick={() => setAsk(null)}>
                    Cancel
                  </button>
                  <button
                    className="wide-ask-btn del"
                    onClick={() => {
                      removeRow(ask);
                      setAsk(null);
                      setAdded(null);
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          )}
          <div className={padOn ? "wide-pad" : "wide-pad off"} style={{ width: padW }} aria-hidden={!padOn}>
            <button type="button" tabIndex={-1} className="wide-key hide" onPointerDown={(e) => e.preventDefault()} onMouseDown={(e) => e.preventDefault()} onClick={hidePad}>
              Hide keypad ›
            </button>
            {["7", "8", "9", "4", "5", "6", "1", "2", "3"].map((k) => key(k))}
            {key(".", ".")}
            {key("0")}
            {key("bs", "⌫", " fn")}
          </div>
        </div>
      </div>
      {/* upright, not turned with the readings: the keyboard comes up upright */}
      {colEdit !== null && (
        <ColumnBox
          test={test}
          index={colEdit}
          onClose={() => setColEdit(null)}
          onSave={(col) =>
            onColumns((t) => {
              t.extraCols = [...(t.extraCols ?? [])];
              if (colEdit < 0) t.extraCols.push(col);
              else t.extraCols[colEdit] = col;
            })
          }
          onRemove={() =>
            onColumns((t) => {
              t.extraCols = (t.extraCols ?? []).filter((_, k) => k !== colEdit);
              for (const sec of t.sections) for (const r of sec.rows) if (r.extra) r.extra = r.extra.filter((_, k) => k !== colEdit);
            })
          }
        />
      )}
    </div>
  );
}

const QUICK_COLUMNS = [
  { name: "Oil pressure", unit: "kPa" },
  { name: "Engine temp", unit: "°C" },
  { name: "Fuel level", unit: "%" },
  { name: "Battery", unit: "V" },
  { name: "Jacket water", unit: "°C" },
];

// Add a column (index -1) or change / remove one, inside the full-screen view
// so it's the same way up. Every supply in the test gets the column.
function ColumnBox({ test, index, onClose, onSave, onRemove }: { test: FlowTestRecord; index: number; onClose: () => void; onSave: (c: { name: string; unit?: string }) => void; onRemove: () => void }) {
  const existing = index >= 0 ? test.extraCols?.[index] : undefined;
  const [name, setName] = useState(existing?.name ?? "");
  const [unitText, setUnitText] = useState(existing?.unit ?? "");
  const [confirming, setConfirming] = useState(false);
  const used = index >= 0 && test.sections.some((s) => s.rows.some((r) => (r.extra?.[index] ?? "").trim() !== ""));
  const save = () => {
    if (!name.trim()) return;
    onSave({ name: name.trim(), unit: unitText.trim() || undefined });
    onClose();
  };
  const field: CSSProperties = { ...cellStyle(14), textAlign: "left", padding: "9px 12px" };
  const quiet: CSSProperties = { padding: "9px 14px", borderRadius: 10, border: "1px solid var(--border-strong)", background: "none", color: "var(--muted)", fontSize: 13, fontWeight: 800 };
  return (
    <div style={{ position: "absolute", inset: 0, background: "rgba(3,13,22,.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: "calc(16px + var(--sa-top)) 16px calc(16px + var(--sa-bottom))", zIndex: 2 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-label={existing ? "Edit column" : "Add a column"} style={{ width: 340, maxWidth: "100%", boxSizing: "border-box", background: "var(--panel)", border: "1px solid #2e6a8e", borderRadius: 16, padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ fontSize: 15, fontWeight: 800 }}>{existing ? "Column" : "Add a column"}</div>
        <div style={{ display: "flex", gap: 8 }}>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Name, e.g. Oil pressure" aria-label="Column name" style={{ ...field, flex: 2 }} />
          <input value={unitText} onChange={(e) => setUnitText(e.target.value)} placeholder="Unit" aria-label="Column unit" style={{ ...field, flex: 1 }} />
        </div>
        {!existing && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {QUICK_COLUMNS.map((q) => (
              <button
                key={q.name}
                onClick={() => {
                  setName(q.name);
                  setUnitText(q.unit);
                }}
                style={{ padding: "4px 10px", borderRadius: 999, border: "1px solid var(--border-strong)", background: "none", color: "var(--muted)", fontSize: 11.5, fontWeight: 800 }}
              >
                {extraHeading(q)}
              </button>
            ))}
          </div>
        )}
        <div style={{ fontSize: 11.5, color: "var(--muted-2)" }}>Added to every supply in this test, and to the Excel after Amps.</div>
        {confirming ? (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div style={{ flex: 1, fontSize: 12.5, color: "#ff6b6b", fontWeight: 700 }}>Remove it and its readings?</div>
            <button style={quiet} onClick={() => setConfirming(false)}>
              Keep
            </button>
            <button
              style={{ ...quiet, borderColor: "rgba(255,107,107,.5)", color: "#ff6b6b" }}
              onClick={() => {
                onRemove();
                onClose();
              }}
            >
              Remove
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 8 }}>
            {existing && (
              <button
                style={{ ...quiet, borderColor: "rgba(255,107,107,.5)", color: "#ff6b6b" }}
                onClick={() => {
                  if (used) setConfirming(true);
                  else {
                    onRemove();
                    onClose();
                  }
                }}
              >
                Remove
              </button>
            )}
            <div style={{ flexGrow: 1 }} />
            <button style={quiet} onClick={onClose}>
              Cancel
            </button>
            <button onClick={save} disabled={!name.trim()} style={{ padding: "9px 18px", borderRadius: 10, border: "none", background: "var(--accent)", color: "var(--accent-text)", fontSize: 13, fontWeight: 800, opacity: name.trim() ? 1 : 0.5 }}>
              {existing ? "Save" : "Add"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// The graph's line ticks (canvas FlowLegend): one row of chips that switch
// a whole group (Discharge, Town main, Suction), then More ▾ for the full
// list, a tick per line, supplies added or named by hand included. A chip
// whose group is only partly on shows a dash.
function GraphLines({ test, lines, onChange }: { test: FlowTestRecord; lines: { kind: LineKind; index: number }[]; onChange: (set: Record<string, boolean>) => void }) {
  const [open, setOpen] = useState(false);
  useBackHandler(() => {
    if (!open) return false;
    setOpen(false);
    return true;
  });
  const key = (l: { kind: LineKind; index: number }) => `${l.kind}:${l.index}`;
  const groups = [
    { label: "Discharge", dash: "", lines: lines.filter((l) => l.kind === "dis" && !isReference(test, l.index)) },
    { label: "Town main", dash: "5 3", lines: lines.filter((l) => l.kind === "dis" && isReference(test, l.index)) },
    { label: "Suction", dash: "2 2.5", lines: lines.filter((l) => l.kind === "suc") },
  ].filter((g) => g.lines.length);
  if (!lines.length) return null;
  const shown = (l: { kind: LineKind; index: number }) => lineShown(test, l.kind, l.index);
  const setAll = (ls: typeof lines, v: boolean) => onChange(Object.fromEntries(ls.map((l) => [key(l), v])));
  const kinds = nameKinds(test);
  const custom = (i: number) => {
    const n = test.sections[i].name.trim();
    return !!n && !kinds.some((b) => n === b || new RegExp(`^${b} \\d+$`).test(n));
  };
  const chip = (on: boolean, part: boolean): CSSProperties => ({
    flexShrink: 0,
    display: "inline-flex",
    alignItems: "center",
    gap: 3,
    padding: "3px 6px 3px 4px",
    borderRadius: 999,
    border: `1px solid ${on || part ? "rgba(46,196,182,.55)" : "var(--border-strong)"}`,
    background: on || part ? "rgba(46,196,182,.12)" : "none",
    color: on || part ? "var(--text)" : "var(--muted-2)",
    fontSize: 10,
    fontWeight: 800,
    whiteSpace: "nowrap",
  });
  const box = (on: boolean, part = false, size = 12) => (
    <span
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        boxSizing: "border-box",
        borderRadius: 3,
        border: `1.5px solid ${on || part ? "var(--accent)" : "#3f5a73"}`,
        background: on || part ? "var(--accent)" : "none",
        color: "var(--accent-text)",
        fontSize: size - 3.5,
        fontWeight: 900,
        lineHeight: 1,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {on ? "✓" : part ? "–" : ""}
    </span>
  );
  const swatch = (colour: string, dash: string, width = 14, faded = false) => (
    <svg width={width} height="8" style={{ flexShrink: 0, opacity: faded ? 0.45 : 1 }}>
      <line x1="1" y1="4" x2={width - 1} y2="4" stroke={colour} strokeWidth={dash === "2 2.5" ? 1.8 : dash ? 2 : 2.6} strokeDasharray={dash || undefined} />
    </svg>
  );
  const item = (l: { kind: LineKind; index: number }) => {
    const on = shown(l);
    const colour = isReference(test, l.index) ? REFERENCE_COLOUR : sectionColour(l.index);
    const dash = l.kind === "suc" ? "2 2.5" : isReference(test, l.index) ? "5 3" : "";
    return (
      <button
        key={key(l)}
        role="menuitemcheckbox"
        aria-checked={on}
        onClick={() => onChange({ [key(l)]: !on })}
        style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 12px", border: "none", background: "none", color: on ? "var(--text)" : "var(--muted)", fontSize: 13, fontWeight: 700, textAlign: "left" }}
      >
        {box(on, false, 15)}
        {swatch(colour, dash, 20, !on)}
        <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sectionName(test, l.index)}</span>
        {custom(l.index) && <span style={{ flexShrink: 0, padding: "1px 5px", borderRadius: 999, border: "1px solid #2e4a63", fontSize: 8.5, fontWeight: 800, color: "var(--muted)" }}>custom</span>}
      </button>
    );
  };
  const groupHead: CSSProperties = { fontSize: 9.5, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted-2)", padding: "7px 12px 3px" };
  const small: CSSProperties = { padding: "5px 9px", borderRadius: 999, border: "1px solid var(--border-strong)", background: "none", color: "var(--muted)", fontSize: 11, fontWeight: 800 };
  const sucLines = lines.filter((l) => l.kind === "suc");
  return (
    <div style={{ position: "relative", marginTop: 4, paddingTop: 6, borderTop: "1px solid var(--border)" }}>
      <div style={{ display: "flex", gap: 3, justifyContent: "safe center", alignItems: "center", flexWrap: "nowrap", overflowX: "auto" }}>
        {groups.map((g) => {
          const n = g.lines.filter(shown).length;
          const on = n === g.lines.length;
          return (
            <button key={g.label} aria-pressed={on} onClick={() => setAll(g.lines, !on)} style={chip(on, n > 0 && !on)}>
              {box(on, n > 0 && !on, 11)}
              {swatch(g.label === "Town main" ? REFERENCE_COLOUR : "var(--text)", g.dash, 11, n === 0)}
              {g.label}
            </button>
          );
        })}
        <button
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 2, padding: "3px 7px", borderRadius: 999, border: open ? "1px solid var(--accent)" : "1px dashed #2e6a8e", background: open ? "var(--accent)" : "none", color: open ? "var(--accent-text)" : "var(--accent)", fontSize: 10, fontWeight: 800, whiteSpace: "nowrap" }}
        >
          More <span style={{ fontSize: 9 }}>▾</span>
        </button>
      </div>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 29 }} />
          <div
            className="dropbox"
            role="menu"
            style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, width: 260, maxWidth: "100%", zIndex: 30, borderRadius: 14, background: "var(--panel-2)", border: "1px solid #2e6a8e", boxShadow: "0 16px 36px rgba(0,0,0,.55), 0 2px 6px rgba(0,0,0,.4)", padding: "4px 0", transformOrigin: "100% 0" }}
          >
            <div style={groupHead}>Discharge</div>
            {lines.filter((l) => l.kind === "dis").map(item)}
            {sucLines.length > 0 && <div style={groupHead}>Suction</div>}
            {sucLines.map(item)}
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 10px 4px", marginTop: 4, borderTop: "1px solid var(--border)" }}>
              {sucLines.length > 0 && (
                <button style={small} onClick={() => setAll(sucLines, true)}>
                  All suction
                </button>
              )}
              <button style={small} onClick={() => onChange(Object.fromEntries(lines.map((l) => [key(l), l.kind === "dis"])))}>
                Reset
              </button>
              <div style={{ flexGrow: 1 }} />
              <button onClick={() => setOpen(false)} style={{ padding: "6px 14px", borderRadius: 8, border: "none", background: "var(--accent)", color: "var(--accent-text)", fontSize: 12, fontWeight: 800 }}>
                Done
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
