import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { dismissWelcome, endTour, initTour, setTourScene, setTourStep, showTopics, startTour, useTour, type TourIds } from "../lib/tour";
import { getInspectorName } from "../lib/profile";
import { useBackHandler } from "../lib/backButton";

// The tour (see lib/tour, canvas TourFull): the screen dims, the real
// buttons are lit up with a tip, and Next moves on — to the next screen
// too. 8 topics; Pick a topic jumps to one. While it runs, taps only reach
// the tour (the lit-up buttons don't open the camera or start exports).

interface Step {
  chapter: number;
  route: (ids: TourIds) => string;
  // what to light up: a CSS selector each (the tip points at the first)
  targets: (ids: TourIds) => string[];
  scene?: string; // what the screen acts out (see useTourScene)
  sideways?: boolean; // on the turned full-screen readings: the tip turns too
  title: string;
  body: ReactNode;
}

const b = (t: string) => <b style={{ color: "var(--text)" }}>{t}</b>;
const t = (sel: string) => () => [sel];

export const TOPICS: { name: string; hint: string; time: string }[] = [
  { name: "Sites", hint: "AFSS, project or flow testing", time: "20 s" },
  { name: "Findings", hint: "With a photo or just a note", time: "30 s" },
  { name: "ESR categories", hint: "Categories, levels, defect types", time: "30 s" },
  { name: "Flow tests on a site", hint: "On a site or on its own", time: "30 s" },
  { name: "Entering a flow test", hint: "Readings, graph, full screen", time: "45 s" },
  { name: "Exporting", hint: "PDF, Excel, photos", time: "30 s" },
  { name: "Customised reports", hint: "Just the findings you pick", time: "30 s" },
  { name: "Backups & settings", hint: "Keep your data safe", time: "15 s" },
];

const site = (ids: TourIds) => `/site/${ids.siteId}`;

// canvas TourFull: 8 topics, 24 steps
const STEPS: Step[] = [
  // 1. sites
  { chapter: 0, route: () => "/", targets: t('[data-tour="new-site"]'), title: "Start a site", body: <>Tap {b("+")} to start a new site. Each site holds its own findings, photos and flow tests, and makes its own report.</> },
  {
    chapter: 0,
    route: () => "/",
    targets: t('[data-tour="site-kinds"]'),
    scene: "new-site",
    title: "Pick the kind of site",
    body: (
      <>
        {b("AFSS")}: the annual fire safety inspection. Findings filed under ESR categories, a Flow tests tab, and the ESR report and register.
        <br />
        {b("Projects")}: fit-outs and construction. Findings and defects in the project report layout.
        <br />
        {b("Flow testing")}: just flow tests, no findings. A page per test in the PDF, a sheet per test in the Excel.
      </>
    ),
  },
  // 2. findings
  {
    chapter: 1,
    route: (ids) => `${site(ids)}/findings`,
    targets: t('[data-tour="new-finding"]'),
    title: "Log a finding",
    body: (
      <>
        {b("New finding")} opens the camera: take the photo, then write the note.
        <br />
        {b("✎ Pen")}: a finding without a photo, just the note. Good for missing items or paperwork.
      </>
    ),
  },
  { chapter: 1, route: (ids) => `${site(ids)}/finding/${ids.findingId}/note`, targets: () => ['[data-tour="photo"]', '[data-tour="photo-strip"]'], title: "Photos", body: <>Tap the photo to see it full screen. {b("+")} takes another, the picture button adds one from the gallery. A finding can have several.</> },
  {
    chapter: 1,
    route: (ids) => `${site(ids)}/finding/${ids.findingId}/note`,
    targets: () => ['[data-tour="save-next"]', '[data-tour="save-close"]'],
    title: "Save & next",
    body: (
      <>
        {b("📷 Save & next")}: saves and opens the camera for the next finding.
        <br />
        {b("✎")}: saves; the next one starts without a photo.
        <br />
        {b("Save & close")}: back to the list. The level carries on to the next finding.
      </>
    ),
  },
  // 3. ESR categories
  {
    chapter: 2,
    route: (ids) => `${site(ids)}/finding/${ids.noteId}/note`,
    targets: t('[data-tour="esr"]'),
    scene: "quick-add",
    title: "ESR category",
    body: (
      <>
        As you type the note, {b("Quick add")} suggests the categories it fits, best first. Tap one to file the finding under it. {b("Browse all categories")} has the full list. It learns from your picks.
      </>
    ),
  },
  {
    chapter: 2,
    route: (ids) => `${site(ids)}/finding/${ids.findingId}/note`,
    targets: () => ['[data-tour="defect-type"]', '[data-tour="level"]'],
    title: "Level, defect type, category",
    body: (
      <>
        {b("Level")}: − and + step through floors; it carries on to your next finding.
        <br />
        {b("Defect type")}: critical, non-critical, non-compliance… it colours the finding in the report.
        <br />
        The {b("ESR category")} decides where it sits in the report and fills in the corrective action wording.
      </>
    ),
  },
  {
    chapter: 2,
    route: (ids) => `${site(ids)}/export`,
    targets: () => ['[data-tour="categorise-ask"] button:nth-of-type(1)', '[data-tour="categorise-ask"] button:nth-of-type(2)'],
    scene: "categorise",
    title: "No rush on site",
    body: <>Busy? Leave it blank. When you export, Inspecta offers to categorise them then, or puts them under {b("Uncategorised")}.</>,
  },
  // 4. flow tests on a site
  { chapter: 3, route: (ids) => `${site(ids)}/findings`, targets: t('[data-tour="flow-tab"]'), title: "Other tests on a site", body: <>AFSS and project sites have an {b("Other tests")} tab next to the findings. Add the site's flow tests (sprinkler, hydrant or combined system) and stair pressurisation tests here.</> },
  {
    chapter: 3,
    route: (ids) => `${site(ids)}/findings?tab=flow`,
    targets: () => ['[data-tour="flow-export-only"]', '[data-tour="new-flow-test"]'],
    title: "In the site's report",
    body: (
      <>
        {b("+ Add a test")} adds one: a flow test or a stair test. The site's PDF then ends with a page per test, and its Excel gets a tab per test, each with its graph.
        <br />
        {b("Export Other Tests Only")} sends just the tests you pick, as PDF and / or Excel.
      </>
    ),
  },
  { chapter: 3, route: () => "/", targets: (ids) => [`[data-site-id="${ids.flowSiteId}"]`], title: "Or on its own", body: <>For a site that's only flow testing or stair pressurisation, make a {b("Flow testing")} or {b("Stair pressurisation")} site from {b("+")}: just its tests, no findings.</> },
  { chapter: 3, route: (ids) => `/site/${ids.flowSiteId}/flow-export`, targets: t('[data-tour="flow-export-buttons"]'), title: "Its report", body: <>A preview of each test as it prints. {b("Export PDF")}: a page per test. {b("Export Excel")}: a sheet per test, laid out the same, each A4.</> },
  // 5. entering a flow test
  {
    chapter: 4,
    route: (ids) => `${site(ids)}/flow/${ids.testId}`,
    targets: () => ['[data-tour="flow-demand"]', '[data-tour="flow-details"]'],
    title: "Details and demand",
    body: <>Fill in the date, equipment and who tested it. Add the system's {b("demand points")} (flow and pressure); every supply is checked against them.</>,
  },
  { chapter: 4, route: (ids) => `${site(ids)}/flow/${ids.testId}`, targets: t('[data-tour="flow-graph"]'), title: "Graph and pass / fail", body: <>The graph draws each supply's curve with the demand points as diamonds, and says straight away whether each supply passes.</> },
  {
    chapter: 4,
    route: (ids) => `${site(ids)}/flow/${ids.testId}`,
    targets: t('[data-tour="flow-supplies"]'),
    title: "A tab per supply",
    body: (
      <>
        {b("Town main")}, {b("Electric pump")}… {b("+")} adds one, {b("✎")} renames or removes it. Type each reading: " Hg, flow, discharge and suction. It saves as you type.
      </>
    ),
  },
  {
    chapter: 4,
    route: (ids) => `${site(ids)}/flow/${ids.testId}`,
    targets: t(".wide-pad"),
    scene: "wide-keypad",
    sideways: true,
    title: "Full screen with a keypad",
    body: <>{b("Full screen")} lays the readings out sideways at full size. Tap a cell: the number pad slides in, and each key presses in as you tap. {b("Hide keypad")} puts it away.</>,
  },
  {
    chapter: 4,
    route: (ids) => `${site(ids)}/flow/${ids.testId}`,
    targets: () => [".wide-ghost", ".wide-x", '[aria-label="Add a column"]'],
    scene: "wide",
    sideways: true,
    title: "Add, delete, your own columns",
    body: <>The dashed row adds a reading. A red {b("✕")} deletes one (it asks first). {b("+ Column")} adds a reading of your own, like oil pressure. {b("Done")} goes back.</>,
  },
  // 6. exporting
  { chapter: 5, route: (ids) => `${site(ids)}/export`, targets: t('[data-tour="preview-head"]'), title: "Check it first", body: <>This is the report as it will print: findings grouped under their ESR headings, coloured by defect type, with photos.</> },
  {
    chapter: 5,
    route: (ids) => `${site(ids)}/export`,
    targets: t('[data-tour="share-bar"]'),
    title: "Send it",
    body: (
      <>
        {b("Share PDF")}: the report. {b("Share Excel")}: the register. {b("Send Photos Only")}: a zip of the photos. Each opens your phone's share menu: email, OneDrive, Teams…
      </>
    ),
  },
  {
    chapter: 5,
    route: (ids) => `${site(ids)}/export`,
    targets: t('[data-tour="share-bar"]'),
    title: "Good to know",
    body: (
      <>
        • The Excel {b("pre-fills the corrective action")} where it's sure, in red with how sure, so you can check it.
        <br />• Exporting again names the copy {b("(1)")}, {b("(2)")}… so it uploads beside the last one.
        <br />• Flow tests go at the end of the PDF and as tabs in the Excel.
      </>
    ),
  },
  // 7. customised reports
  { chapter: 6, route: (ids) => `${site(ids)}/export`, targets: t('[data-tour="custom-report"]'), title: "Customised reports", body: <>{b("Create Customised Report")} makes a report of just the findings you pick, like only the fire doors or one floor, for the people who need it.</> },
  {
    chapter: 6,
    route: (ids) => `${site(ids)}/export`,
    targets: t('[role="dialog"][aria-label="Create Customised Report"] input'),
    scene: "custom-report",
    title: "Name it, pick quickly",
    body: (
      <>
        Name it, then {b("bulk refine")}: tick a level, location, defect type or ESR category to start with those ticked (or {b("Skip")}). Then tick or untick each finding, and choose {b("Organise by")} time taken or ESR.
      </>
    ),
  },
  { chapter: 6, route: (ids) => `${site(ids)}/export`, targets: t('[aria-label$=" report"]'), title: "It's saved", body: <>Each report gets a chip at the top. Tap it to preview and export it again; it keeps up as findings change. {b("Press and hold")} to change or delete it.</> },
  // 8. backups & settings
  { chapter: 7, route: () => "/settings", targets: t('[data-tour="backup"]'), title: "Back up your work", body: <>Everything lives only on this phone. {b("Back up all data")} saves every site, finding and photo in one file: put it on OneDrive. {b("Restore")} brings it back on any phone.</> },
  { chapter: 7, route: () => "/settings", targets: t('[data-tour="replay-tour"]'), title: "Settings", body: <>Your {b("name")} for the reports, the {b("L/s ⇄ L/min converter")}, updates, and {b("Replay tour")} to see any of this again. That's it!</> },
];

const firstOf = (chapter: number) => STEPS.findIndex((s) => s.chapter === chapter);

export default function Tour({ ready }: { ready: boolean }) {
  const tour = useTour();

  useEffect(() => {
    if (ready) void initTour();
  }, [ready]);

  if (!ready) return null;
  if (tour.welcome) return <Welcome />;
  if (tour.active && tour.ids && tour.topics) return <Topics />;
  if (tour.active && tour.ids) return <Walkthrough ids={tour.ids} step={tour.step} single={tour.single} />;
  return null;
}

const primary = { padding: "15px 0", borderRadius: 14, background: "var(--accent)", color: "var(--accent-text)", border: "none", fontSize: 15, fontWeight: 800 } as const;
const quiet = { padding: "12px 0", background: "none", border: "none", fontSize: 14, fontWeight: 700, color: "var(--muted)" } as const;
const panel = { width: "100%", maxWidth: 360, borderRadius: 22, background: "var(--panel)", border: "1px solid var(--border-strong)", boxShadow: "0 20px 50px rgba(0,0,0,0.5)", display: "flex", flexDirection: "column" } as const;
const backdrop = { position: "fixed", inset: 0, zIndex: 70, background: "rgba(3,13,22,0.82)", display: "flex", alignItems: "center", justifyContent: "center", padding: 22 } as const;

function Welcome() {
  useBackHandler(() => {
    dismissWelcome();
    return true;
  }, true);
  const name = getInspectorName().trim().split(/\s+/)[0];
  return (
    <div role="dialog" aria-modal="true" aria-label="Welcome" className="sheet-backdrop" style={backdrop}>
      <div className="pop-in" style={{ ...panel, padding: "26px 22px 18px", gap: 12, alignItems: "center", textAlign: "center" }}>
        <div style={{ width: 64, height: 64, borderRadius: 18, background: "#022a4c", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30 }} aria-hidden="true">
          👋
        </div>
        <div style={{ fontSize: 21, fontWeight: 800 }}>Welcome to Inspecta{name ? `, ${name}` : ""}</div>
        <div style={{ fontSize: 14, color: "var(--muted)", lineHeight: 1.55 }}>A walk through the app on an example site, about 4 minutes. Do it all, or pick a topic.</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, alignSelf: "stretch", marginTop: 8 }}>
          <button type="button" onClick={() => void startTour()} style={primary}>
            Show me around
          </button>
          <button
            type="button"
            onClick={() => void startTour({ topics: true })}
            style={{ padding: "13px 0", borderRadius: 14, border: "1px solid rgba(46,196,182,.55)", background: "rgba(46,196,182,.1)", color: "var(--accent)", fontSize: 14.5, fontWeight: 800 }}
          >
            ☰ Pick a topic
          </button>
          <button type="button" onClick={dismissWelcome} style={quiet}>
            Skip, I'll explore
          </button>
        </div>
        <div style={{ fontSize: 11.5, color: "var(--muted-2)" }}>You can replay it any time in Settings.</div>
      </div>
    </div>
  );
}

// the Pick a topic list: a topic runs on its own and comes back here
function Topics() {
  const navigate = useNavigate();
  const finish = async () => {
    navigate("/");
    await endTour();
  };
  useBackHandler(() => {
    void finish();
    return true;
  }, true);
  return (
    <div role="dialog" aria-modal="true" aria-label="Pick a topic" style={backdrop}>
      <div className="pop-in" style={{ ...panel, padding: "20px 14px 10px", gap: 6 }}>
        <div style={{ fontSize: 19, fontWeight: 800, padding: "0 4px 4px" }}>Pick a topic</div>
        {TOPICS.map((topic, i) => (
          <button
            key={topic.name}
            type="button"
            onClick={() => setTourStep(firstOf(i), true)}
            style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 8px", borderRadius: 12, background: "var(--panel-2)", border: "1px solid var(--border)", color: "var(--text)", textAlign: "left" }}
          >
            <span style={{ width: 26, height: 26, borderRadius: 8, background: "rgba(46,196,182,.14)", color: "var(--accent)", fontSize: 13, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{i + 1}</span>
            <span style={{ display: "flex", flexDirection: "column", flexGrow: 1, minWidth: 0 }}>
              <span style={{ fontSize: 14, fontWeight: 800 }}>{topic.name}</span>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--muted)" }}>{topic.hint}</span>
            </span>
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--muted-2)" }}>{topic.time}</span>
          </button>
        ))}
        <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 4px 0" }}>
          <button type="button" onClick={() => setTourStep(0, false)} style={{ ...quiet, color: "var(--accent)" }}>
            Run the whole tour
          </button>
          <button type="button" onClick={() => void finish()} style={quiet}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Frame extends Box {
  turned: boolean;
}

interface Place {
  x: number;
  y: number;
  clear?: boolean; // nothing lit up is under it
  arrow: { side: "top" | "bottom" | "left" | "right"; at: number } | null;
}

const overlaps = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

// Where the tip goes: next to what's lit up, never over any of it. Tries
// below, then above, everything lit up, then beside the first thing (left
// or right), then the four corners; the first spot that's on screen and
// clear of every lit-up thing wins. Only if nowhere is clear (a lit-up
// thing filling the screen) does it sit over the least of them.
export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}
const NONE: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

// the phone's status bar, navigation bar and cut-outs (index.css --sa-*), in px
function safeInsets(): Insets {
  const probe = document.createElement("div");
  probe.style.cssText = "position:fixed;left:0;top:0;visibility:hidden;pointer-events:none;padding:var(--sa-top) var(--sa-right) var(--sa-bottom) var(--sa-left)";
  document.body.appendChild(probe);
  const cs = getComputedStyle(probe);
  const out = { top: parseFloat(cs.paddingTop) || 0, right: parseFloat(cs.paddingRight) || 0, bottom: parseFloat(cs.paddingBottom) || 0, left: parseFloat(cs.paddingLeft) || 0 };
  probe.remove();
  return out;
}

export function placeCard(lit: Box[], view: { w: number; h: number }, width: number, height: number, gap: number, safe: Insets = NONE): Place {
  const m = 12; // from the screen's edges, inside the phone's bars
  const left = m + safe.left;
  const right = m + safe.right;
  const top = m + safe.top;
  const bottom = m + safe.bottom;
  const all = lit.reduce((u, r) => ({ x: Math.min(u.x, r.x), y: Math.min(u.y, r.y), r: Math.max(u.r, r.x + r.w), b: Math.max(u.b, r.y + r.h) }), { x: Infinity, y: Infinity, r: -Infinity, b: -Infinity });
  const first = lit[0];
  const cx = (b: { x: number; w: number }) => b.x + b.w / 2;
  const clampX = (x: number) => Math.max(left, Math.min(view.w - width - right, x));
  const clampY = (y: number) => Math.max(top, Math.min(view.h - height - bottom, y));
  const centredX = clampX(cx(first) - width / 2);
  const tries: Place[] = [
    { x: centredX, y: all.b + gap, arrow: { side: "top", at: 0 } },
    { x: centredX, y: all.y - gap - height, arrow: { side: "bottom", at: 0 } },
    { x: first.x + first.w + gap, y: clampY(first.y + first.h / 2 - height / 2), arrow: { side: "left", at: 0 } },
    { x: first.x - gap - width, y: clampY(first.y + first.h / 2 - height / 2), arrow: { side: "right", at: 0 } },
    { x: left, y: top, arrow: null },
    { x: view.w - width - right, y: top, arrow: null },
    { x: left, y: view.h - height - bottom, arrow: null },
    { x: view.w - width - right, y: view.h - height - bottom, arrow: null },
  ];
  const fits = (p: Place) => p.x >= left - 0.5 && p.y >= top - 0.5 && p.x + width <= view.w - right + 0.5 && p.y + height <= view.h - bottom + 0.5;
  const card = (p: Place) => ({ x: p.x, y: p.y, w: width, h: height });
  let pick = tries.find((p) => fits(p) && !lit.some((r) => overlaps(card(p), { x: r.x - 6, y: r.y - 6, w: r.w + 12, h: r.h + 12 })));
  if (pick) pick = { ...pick, clear: true };
  else {
    // nowhere clear: the on-screen spot covering the least
    const covered = (p: Place) => lit.reduce((n, r) => n + Math.max(0, Math.min(p.x + width, r.x + r.w) - Math.max(p.x, r.x)) * Math.max(0, Math.min(p.y + height, r.y + r.h) - Math.max(p.y, r.y)), 0);
    pick = tries.map((p) => ({ ...p, x: clampX(p.x), y: clampY(p.y), arrow: null })).sort((a, b) => covered(a) - covered(b))[0];
  }
  // the arrow points at the first lit-up thing, if it's beside it
  if (pick.arrow) {
    const along = pick.arrow.side === "top" || pick.arrow.side === "bottom" ? cx(first) - pick.x - 8 : first.y + first.h / 2 - pick.y - 8;
    const span = pick.arrow.side === "top" || pick.arrow.side === "bottom" ? width : height;
    pick = along < 14 || along > span - 30 ? { ...pick, arrow: null } : { ...pick, arrow: { ...pick.arrow, at: along } };
  }
  return pick;
}

function Walkthrough({ ids, step, single }: { ids: TourIds; step: number; single: boolean }) {
  const navigate = useNavigate();
  const location = useLocation();
  const current = STEPS[Math.min(step, STEPS.length - 1)];
  const inChapter = STEPS.filter((s) => s.chapter === current.chapter);
  const k = inChapter.indexOf(current) + 1;
  // a picked topic ends at its own last step, back on the list
  const last = single ? k === inChapter.length : step >= STEPS.length - 1;
  const route = current.route(ids);
  const here = location.pathname + location.search === route;
  const selectors = current.targets(ids);
  const [boxes, setBoxes] = useState<Box[]>([]);
  // the area the tour draws in: the screen, or on the turned full-screen
  // readings, the readings themselves (so the tip turns with them)
  const [frame, setFrame] = useState<Frame>({ turned: false, x: 0, y: 0, w: window.innerWidth, h: window.innerHeight });
  const cardRef = useRef<HTMLDivElement>(null);
  const [safe, setSafe] = useState<Insets>(NONE);
  useEffect(() => {
    const read = () => setSafe(safeInsets());
    read();
    window.addEventListener("resize", read);
    return () => window.removeEventListener("resize", read);
  }, []);
  const [cardH, setCardH] = useState(220);

  useBackHandler(() => {
    void finish();
    return true;
  }, true);

  // take the app to this step's screen, then have it act out the scene
  useEffect(() => {
    if (!here) navigate(route);
  }, [route, here, navigate]);
  useEffect(() => {
    setTourScene(here ? (current.scene ?? null) : null);
  }, [here, current.scene]);
  useEffect(() => () => setTourScene(null), []);

  // follow the lit-up elements (they can move while a screen slides in, or
  // after scrolling into view); state only changes when they really move
  const scrolled = useRef(-1);
  const lifted = useRef(-1); // moved to the top of the screen to make room for the tip
  const key = selectors.join("|");
  useLayoutEffect(() => {
    setBoxes([]);
    let raf = 0;
    const tick = () => {
      const els = here ? selectors.map((sel) => document.querySelector(sel) as HTMLElement | null).filter((el): el is HTMLElement => !!el) : [];
      const turnEl = current.sideways ? (document.querySelector(".wide-turn") as HTMLElement | null) : null;
      if (els.length) {
        if (scrolled.current !== step) {
          scrolled.current = step;
          // into view: in the middle of the page, or within the full-screen
          // readings' own scrolling table
          if (!current.sideways) els[0].scrollIntoView({ block: "center", behavior: "instant" as ScrollBehavior });
          else for (const el of els) if (el.closest(".wide-scroll")) el.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" as ScrollBehavior });
        }
        const d = turnEl?.getBoundingClientRect();
        // turned a quarter-turn clockwise: the readings' left edge is along
        // the top of the screen, measured from where they actually are
        const nextFrame: Frame = d ? { turned: true, x: d.left, y: d.top, w: Math.round(d.height), h: Math.round(d.width) } : { turned: false, x: 0, y: 0, w: window.innerWidth, h: window.innerHeight };
        const next = els.map((el) => {
          const r = el.getBoundingClientRect();
          return d ? { x: Math.round(r.top - d.top), y: Math.round(d.right - r.right), w: Math.round(r.height), h: Math.round(r.width) } : { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) };
        });
        setFrame((prev) => (prev.turned === nextFrame.turned && prev.x === nextFrame.x && prev.y === nextFrame.y && prev.w === nextFrame.w && prev.h === nextFrame.h ? prev : nextFrame));
        setBoxes((prev) => (prev.length === next.length && prev.every((p, i) => p.x === next[i].x && p.y === next[i].y && p.w === next[i].w && p.h === next[i].h) ? prev : next));
      }
      const h = cardRef.current?.offsetHeight;
      if (h) setCardH((prev) => (prev === h ? prev : h));
      // centred on a small screen, with no room for the tip either side:
      // scroll it up to the top, so the tip fits underneath
      if (els.length && h && !current.sideways && lifted.current !== step) {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const r = els.map((el) => el.getBoundingClientRect()).map((b) => ({ x: b.left, y: b.top, w: b.width, h: b.height }));
        if (!placeCard(r, { w: vw, h: vh }, Math.min(342, vw - 32), h, 19, safeInsets()).clear) {
          lifted.current = step;
          els[0].scrollIntoView({ block: "start", behavior: "instant" as ScrollBehavior });
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, key, here]);

  async function finish() {
    navigate("/");
    await endTour();
  }
  // back a step: not before the tour's first, or a picked topic's first
  const first = single ? k === 1 : step === 0;
  function back() {
    if (!first) setTourStep(step - 1);
  }
  function next() {
    if (!last) setTourStep(step + 1);
    else if (single) showTopics(true);
    else void finish();
  }

  const view = { w: frame.w, h: frame.h };
  const pad = 5;
  const gap = 14;
  const width = Math.min(frame.turned ? 330 : 342, view.w - 32);
  // only what's actually in sight is lit up and pointed at
  const lit = boxes.filter((r) => r.x + r.w > 0 && r.y + r.h > 0 && r.x < view.w && r.y < view.h);
  const box = lit[0];
  // the phone's bars, turned with the readings when they're turned: their
  // left edge runs along the top of the screen
  const bars = frame.turned ? { top: safe.right, right: safe.bottom, bottom: safe.left, left: safe.top } : safe;
  const place = box ? placeCard(lit, view, width, cardH, pad + gap, bars) : null;

  const layer: CSSProperties = frame.turned
    ? { position: "fixed", left: frame.x + frame.h / 2, top: frame.y + frame.w / 2, width: view.w, height: view.h, transform: "translate(-50%, -50%) rotate(90deg)" }
    : { position: "fixed", inset: 0 };
  const arrowStyle: CSSProperties | null = !place?.arrow
    ? null
    : place.arrow.side === "top"
      ? { top: -8, left: place.arrow.at, borderLeft: "1px solid var(--accent)", borderTop: "1px solid var(--accent)" }
      : place.arrow.side === "bottom"
        ? { bottom: -8, left: place.arrow.at, borderRight: "1px solid var(--accent)", borderBottom: "1px solid var(--accent)" }
        : place.arrow.side === "left"
          ? { left: -8, top: place.arrow.at, borderLeft: "1px solid var(--accent)", borderBottom: "1px solid var(--accent)" }
          : { right: -8, top: place.arrow.at, borderRight: "1px solid var(--accent)", borderTop: "1px solid var(--accent)" };

  return (
    // covers the whole screen, so taps only reach the tour's own buttons
    <div aria-live="polite" style={{ position: "fixed", inset: 0, zIndex: 70 }}>
      <div style={layer}>
        <svg aria-hidden="true" width={view.w} height={view.h} style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none" }}>
          <defs>
            <mask id="tour-holes">
              <rect width={view.w} height={view.h} fill="white" />
              {lit.map((r, i) => (
                <rect key={i} x={r.x - pad} y={r.y - pad} width={r.w + pad * 2} height={r.h + pad * 2} rx={Math.min(14, (r.h + pad * 2) / 2)} fill="black" />
              ))}
            </mask>
          </defs>
          <rect width={view.w} height={view.h} fill="rgba(3,13,22,0.74)" mask="url(#tour-holes)" />
          {lit.map((r, i) => (
            <rect key={i} x={r.x - pad - 2} y={r.y - pad - 2} width={r.w + pad * 2 + 4} height={r.h + pad * 2 + 4} rx={Math.min(16, (r.h + pad * 2) / 2 + 2)} fill="none" stroke="var(--accent)" strokeWidth={3} />
          ))}
        </svg>

        {box && place && (
          <div
            role="dialog"
            aria-label={current.title}
            className="pop-in"
            key={step}
            ref={cardRef}
            style={{
              position: "absolute",
              left: place?.x ?? 16,
              top: place?.y ?? 16,
              width,
              boxSizing: "border-box",
              padding: "14px 16px 13px",
              borderRadius: 16,
              background: "var(--panel)",
              border: "1px solid var(--accent)",
              boxShadow: "0 14px 34px rgba(0,0,0,0.5)",
              display: "flex",
              flexDirection: "column",
              gap: 7,
            }}
          >
            {arrowStyle && <span aria-hidden="true" style={{ position: "absolute", width: 16, height: 16, background: "var(--panel)", transform: "rotate(45deg)", ...arrowStyle }} />}
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <span aria-hidden="true" style={{ display: "flex", gap: 3 }}>
                {TOPICS.map((_, i) => (
                  <span key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i === current.chapter ? "var(--accent)" : i < current.chapter ? "rgba(46,196,182,.45)" : "#24435f" }} />
                ))}
              </span>
              <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--accent)" }}>
                {TOPICS[current.chapter].name} · {k} of {inChapter.length}
              </span>
            </div>
            <div style={{ fontSize: 16, fontWeight: 800 }}>{current.title}</div>
            <div style={{ fontSize: 13, lineHeight: 1.5, color: "var(--muted)" }}>{current.body}</div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
              <button type="button" onClick={() => showTopics(true)} style={{ background: "none", border: "none", padding: 0, fontSize: 12.5, fontWeight: 800, color: "var(--muted)" }}>
                ☰ Topics
              </button>
              <span style={{ display: "flex", gap: 12, alignItems: "center" }}>
                {!(last && !single) && (
                  <button type="button" onClick={() => void finish()} style={{ background: "none", border: "none", padding: 0, fontSize: 13, fontWeight: 700, color: "var(--muted)" }}>
                    Skip
                  </button>
                )}
                {!first && (
                  <button type="button" onClick={back} style={{ padding: "7px 12px", borderRadius: 10, background: "none", border: "1px solid var(--border-strong)", color: "var(--text)", fontSize: 13, fontWeight: 800 }}>
                    ‹ Back
                  </button>
                )}
                <button type="button" onClick={next} style={{ padding: "8px 16px", borderRadius: 10, background: "var(--accent)", color: "var(--accent-text)", border: "none", fontSize: 13, fontWeight: 800 }}>
                  {last ? (single ? "Topics" : "Done") : "Next"}
                </button>
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
