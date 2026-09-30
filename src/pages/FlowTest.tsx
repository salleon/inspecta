import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { FlowTest as FlowTestRecord, FlowReading, FlowUnit, Site } from "../db/types";
import { deleteFlowTest, getFlowTest, getSite, saveFlowTest } from "../db/db";
import {
  chartSvg,
  flowOf,
  isTested,
  lmin,
  nextReading,
  NEUTRAL_COLOUR,
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
const unitPill: CSSProperties = { marginTop: 3, padding: "2px 7px", borderRadius: 999, border: "1px solid rgba(46,196,182,.5)", background: "rgba(46,196,182,.12)", color: "var(--accent)", fontSize: 10.5, fontWeight: 800 };

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
  const [unit, setUnit] = useState<FlowUnit>("min");
  const [more, setMore] = useState(false); // RPM and Amps columns
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
      setMore(t.sections.some((sec) => sec.rows.some((r) => r.rpm || r.amps)));
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

  const shell = (body: ReactNode, note: string) => (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", position: "relative" }}>
      {header}
      <div style={{ flexGrow: 1, overflowY: "auto", padding: "4px 16px 24px", display: "flex", flexDirection: "column", gap: 12 }}>
        {body}
        {footer}
        {/* where it goes: at the end of the page, not a fixed bar */}
        <div style={{ padding: "6px 8px calc(4px + env(safe-area-inset-bottom))", fontSize: 11.5, fontWeight: 700, color: "var(--muted-2)", textAlign: "center", lineHeight: 1.5 }}>
          {note}
          <br />
          (Export → Share Excel)
        </div>
      </div>
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
  const current = Math.min(sel, test.sections.length - 1);
  const section = test.sections[current];
  const rows = section.rows;
  const show = (v: number | null) => showFlow(v, unit);
  // a typed value: as typed if typed in the unit shown now, else converted
  const shown = (val: string, u: FlowUnit | undefined) => (val === "" ? "" : (u ?? "min") === unit ? val : show(lmin(val, u)));
  const verdicts = sectionVerdicts(test, unit);
  const lineVerdicts = verdicts.length ? verdicts : [{ index: current, name: sectionName(test, current), ...verdict(test, rows, unit) }];
  const legend = test.sections.map((_, i) => i).filter((i) => isTested(test, i) || i === current);
  const hasSuction = !combined && rows.some((r) => r.suc.trim() !== "");
  const gridCols = more ? "40px 1fr 1fr 1fr 1fr 1fr 22px" : "54px 1fr 1fr 1fr 26px";
  const gap = more ? 4 : 6;
  const font = more ? 12 : 14;
  const updateRow = (i: number, fn: (r: FlowReading) => void) => change((t) => fn(t.sections[current].rows[i]));
  const kindNote = { sprinkler: "Goes into the site's Excel as a SPRINKLER tab", hydrant: "Goes into the site's Excel as a HYDRANT tab", combined: "Goes into the site's Excel as a Combined System tab" }[test.kind];

  return shell(
    <>
      {/* graph */}
      <div style={{ ...card, padding: "10px 8px 6px", gap: 2 }}>
        <div ref={chartBox} style={{ width: "100%", height: 210 }} dangerouslySetInnerHTML={{ __html: chartSvg(test, chartW, 210, { unit, current }) }} />
        <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap", fontSize: 11, fontWeight: 700, color: "var(--muted)", paddingTop: 2 }}>
          {legend.map((i) => (
            <span key={i}>
              <span style={{ color: sectionColour(i) }}>●</span> {sectionName(test, i)}
            </span>
          ))}
          <span>
            <span style={{ color: "#ff5a4a" }}>◆</span> Demand
          </span>
          {hasSuction && (
            <span>
              <span style={{ color: NEUTRAL_COLOUR }}>- -</span> Suction ({sectionName(test, current)})
            </span>
          )}
        </div>
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

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={lbl}>Readings · {sectionName(test, current)}</div>
          <button
            onClick={() => setMore(!more)}
            style={{
              padding: "4px 10px",
              borderRadius: 999,
              border: `1px solid ${more ? "rgba(46,196,182,.5)" : "var(--border-strong)"}`,
              background: more ? "rgba(46,196,182,.12)" : "none",
              color: more ? "var(--accent)" : "var(--muted)",
              fontSize: 11,
              fontWeight: 800,
            }}
          >
            {more ? "− RPM & Amps" : "+ RPM & Amps"}
          </button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: gridCols, gap, alignItems: "end" }}>
          <div style={th}>" Hg</div>
          <div style={th}>
            Flow
            <br />
            <button style={unitPill} onClick={() => setUnit(unit === "sec" ? "min" : "sec")} aria-label="Change flow unit">
              {unit === "sec" ? "L/s" : "L/min"} ⇄
            </button>
          </div>
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
          {more && <div style={th}>RPM</div>}
          {more && <div style={th}>Amps</div>}
          <div />
        </div>
        {rows.map((r, i) => {
          const auto = r.flow === "";
          const autoFlow = flowOf(test, { ...r, flow: "" });
          return (
            <div key={i} style={{ display: "grid", gridTemplateColumns: gridCols, gap, alignItems: "center" }}>
              <input style={cellStyle(font)} inputMode="decimal" value={r.hg} aria-label='" Hg' onChange={(e) => updateRow(i, (x) => void (x.hg = e.target.value))} />
              <input
                style={cellStyle(font, auto && autoFlow !== null)}
                inputMode="decimal"
                value={auto ? show(autoFlow) : shown(r.flow, r.flowUnit)}
                aria-label="Flow"
                onChange={(e) =>
                  updateRow(i, (x) => {
                    const v = e.target.value;
                    // clearing it (or typing the " Hg figure) goes back to automatic
                    x.flow = v === "" || (autoFlow !== null && v === show(autoFlow)) ? "" : v;
                    x.flowUnit = unit;
                  })
                }
              />
              <input style={cellStyle(font)} inputMode="decimal" value={r.dis} aria-label="Discharge" onChange={(e) => updateRow(i, (x) => void (x.dis = e.target.value))} />
              <input style={cellStyle(font)} inputMode="decimal" value={r.suc} aria-label="Suction" onChange={(e) => updateRow(i, (x) => void (x.suc = e.target.value))} />
              {more && <input style={cellStyle(font)} inputMode="decimal" value={r.rpm ?? ""} aria-label="RPM" onChange={(e) => updateRow(i, (x) => void (x.rpm = e.target.value))} />}
              {more && <input style={cellStyle(font)} inputMode="decimal" value={r.amps ?? ""} aria-label="Amps" onChange={(e) => updateRow(i, (x) => void (x.amps = e.target.value))} />}
              <button style={xButton} aria-label="Remove reading" onClick={() => change((t) => void t.sections[current].rows.splice(i, 1))}>
                ✕
              </button>
            </div>
          );
        })}
        <button style={addButton} onClick={() => change((t) => void t.sections[current].rows.push(nextReading(t, t.sections[current].rows)))}>
          + Add reading
        </button>
        <div style={{ fontSize: 11.5, color: "var(--muted-2)", lineHeight: 1.45 }}>
          {test.k ? 'Flow fills in from " Hg. Type a flow to use your own. ' : "Type each flow. "}
          Tap the unit under Flow to switch between L/min and L/s.
        </div>
      </div>

      {/* demand points */}
      <div style={card}>
        <div style={lbl}>Demand points</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 26px", gap: 6 }}>
          <div style={th}>
            Flow{" "}
            <button style={unitPill} onClick={() => setUnit(unit === "sec" ? "min" : "sec")} aria-label="Change flow unit">
              {unit === "sec" ? "L/s" : "L/min"} ⇄
            </button>
          </div>
          <div style={th}>Pressure kPa</div>
          <div />
        </div>
        {test.demand.map((d, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 26px", gap: 6, alignItems: "center" }}>
            <input
              style={cellStyle(14)}
              inputMode="decimal"
              value={shown(d.flow, d.flowUnit)}
              aria-label="Demand flow"
              onChange={(e) => change((t) => void Object.assign(t.demand[i], { flow: e.target.value, flowUnit: unit }))}
            />
            <input style={cellStyle(14)} inputMode="decimal" value={d.kpa} aria-label="Demand pressure" onChange={(e) => change((t) => void (t.demand[i].kpa = e.target.value))} />
            <button style={xButton} aria-label="Remove demand point" onClick={() => change((t) => void t.demand.splice(i, 1))}>
              ✕
            </button>
          </div>
        ))}
        <button style={addButton} onClick={() => change((t) => void t.demand.push({ flow: "", kpa: "" }))}>
          + Add demand point
        </button>
      </div>

      {/* the template's header and comment lines */}
      <div style={card}>
        <div style={lbl}>Test details</div>
        {(
          [
            ["Date", "date"],
            ["Equipment", "equipment"],
            ["Tested by", "testedBy"],
            ["Comment", "comment"],
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
                placeholder={key === "equipment" ? "e.g. 80 mm / 20T Ambient" : key === "testedBy" ? "e.g. Chubb" : "e.g. PASS"}
                onChange={(e) => change((t) => void (t[key] = e.target.value))}
                style={{ ...cellStyle(14), textAlign: "left", padding: "8px 10px" }}
              />
            )}
          </label>
        ))}
      </div>
    </>,
    kindNote,
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
