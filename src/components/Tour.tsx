import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { dismissWelcome, endTour, initTour, setTourStep, startTour, useTour } from "../lib/tour";
import { getInspectorName } from "../lib/profile";
import { useAdvancedControls } from "../lib/settings";
import { useBackHandler } from "../lib/backButton";

// The first-time tour (see lib/tour): the screen dims, one real button at a
// time is lit up with a tip, and Next moves on — to the next screen too.
// While it runs, taps only reach the tour (the lit-up buttons don't open
// the camera or start exports).

interface Step {
  route: (siteId: string, findingId: string) => string;
  target: string; // CSS selector of the thing to light up
  title: string;
  body: ReactNode;
  advancedOnly?: boolean;
}

const b = (t: string) => <b style={{ color: "var(--text)" }}>{t}</b>;

const STEPS: Step[] = [
  {
    route: () => "/",
    target: '[data-tour="new-site"]',
    title: "Start an inspection",
    body: <>Tap + to add a site: give it a name and address. Each site holds its findings.</>,
  },
  {
    route: (s) => `/site/${s}/findings`,
    target: '[data-tour="new-finding"]',
    title: "Log a finding",
    body: (
      <>
        {b("Camera")}: take a photo, then add the note.
        <br />
        {b("Pen")}: the same, but without a photo, just a note.
      </>
    ),
  },
  {
    route: (s, f) => `/site/${s}/finding/${f}/note`,
    target: '[data-tour="save-next"]',
    title: "Save & next",
    body: (
      <>
        {b("Camera")}: saves this finding and opens the camera for the next one.
        <br />
        {b("Pen")}: does the same, but the next finding starts without a photo, just a note.
      </>
    ),
  },
  {
    route: (s, f) => `/site/${s}/finding/${f}/note`,
    target: '[data-tour="esr"]',
    title: "ESR category",
    body: (
      <>
        As you type the note, {b("Quick add")} suggests the category it fits: tap one to file the finding under it. {b("Browse all")} has the full list.
      </>
    ),
    advancedOnly: true,
  },
  {
    route: (s, f) => `/site/${s}/finding/${f}/note`,
    target: '[data-tour="esr"]',
    title: "No rush",
    body: <>Busy on site? Leave the category blank. When you export, Inspecta takes you through any findings still without one.</>,
    advancedOnly: true,
  },
  {
    route: (s) => `/site/${s}/findings`,
    target: '[aria-label="Export PDF"]',
    title: "Send the report",
    body: (
      <>
        When you're done, tap here to export:
        <br />• the report as a {b("PDF")}
        <br />• the {b("Excel")} register
        <br />• a {b("zip")} of all the photos
      </>
    ),
  },
  {
    route: () => "/",
    target: '[data-tour="settings"]',
    title: "Settings",
    body: <>Your name, backups, updates and Advanced controls. You can replay this tour here too.</>,
  },
];

export default function Tour({ ready }: { ready: boolean }) {
  const tour = useTour();

  useEffect(() => {
    if (ready) void initTour();
  }, [ready]);

  if (!ready) return null;
  if (tour.welcome) return <Welcome />;
  if (tour.active && tour.siteId && tour.findingId) return <Walkthrough siteId={tour.siteId} findingId={tour.findingId} step={tour.step} />;
  return null;
}

function Welcome() {
  useBackHandler(() => {
    dismissWelcome();
    return true;
  }, true);
  const name = getInspectorName().trim().split(/\s+/)[0];
  return (
    <div role="dialog" aria-modal="true" aria-label="Welcome" className="sheet-backdrop" style={{ position: "fixed", inset: 0, zIndex: 70, background: "rgba(3,13,22,0.8)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div className="pop-in" style={{ width: "100%", maxWidth: 360, padding: "26px 22px 18px", borderRadius: 22, background: "var(--panel)", border: "1px solid var(--border-strong)", boxShadow: "0 20px 50px rgba(0,0,0,0.5)", display: "flex", flexDirection: "column", gap: 12, alignItems: "center", textAlign: "center" }}>
        <div style={{ width: 64, height: 64, borderRadius: 18, background: "#022a4c", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30 }} aria-hidden="true">
          👋
        </div>
        <div style={{ fontSize: 21, fontWeight: 800 }}>Welcome to Inspecta{name ? `, ${name}` : ""}</div>
        <div style={{ fontSize: 14, color: "var(--muted)", lineHeight: 1.55 }}>Want a quick tour? We'll walk you through the app using an example site, in about a minute.</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, alignSelf: "stretch", marginTop: 8 }}>
          <button type="button" onClick={() => void startTour()} style={{ padding: "15px 0", borderRadius: 14, background: "var(--accent)", color: "var(--accent-text)", border: "none", fontSize: 15, fontWeight: 800 }}>
            Show me around
          </button>
          <button type="button" onClick={dismissWelcome} style={{ padding: "12px 0", background: "none", border: "none", fontSize: 14, fontWeight: 700, color: "var(--muted)" }}>
            Skip, I'll explore
          </button>
        </div>
        <div style={{ fontSize: 11.5, color: "var(--muted-2)" }}>You can replay it any time in Settings.</div>
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

function Walkthrough({ siteId, findingId, step }: { siteId: string; findingId: string; step: number }) {
  const navigate = useNavigate();
  const location = useLocation();
  const advanced = useAdvancedControls();
  const steps = STEPS.filter((s) => advanced || !s.advancedOnly);
  const current = steps[Math.min(step, steps.length - 1)];
  const last = step >= steps.length - 1;
  const route = current.route(siteId, findingId);
  const [box, setBox] = useState<Box | null>(null);
  const [viewport, setViewport] = useState({ w: window.innerWidth, h: window.innerHeight });

  useBackHandler(() => {
    void finish();
    return true;
  }, true);

  // take the app to this step's screen
  useEffect(() => {
    if (location.pathname !== route) navigate(route);
  }, [route, location.pathname, navigate]);

  // follow the lit-up element (it can move while a screen slides in, or
  // after scrolling it into view); state only changes when it really moves
  const scrolled = useRef(-1);
  useLayoutEffect(() => {
    setBox(null);
    let raf = 0;
    const tick = () => {
      const el = location.pathname === route ? (document.querySelector(current.target) as HTMLElement | null) : null;
      if (el) {
        if (scrolled.current !== step) {
          scrolled.current = step;
          el.scrollIntoView({ block: "center", behavior: "instant" as ScrollBehavior });
        }
        const r = el.getBoundingClientRect();
        const next = { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) };
        setBox((prev) => (prev && prev.x === next.x && prev.y === next.y && prev.w === next.w && prev.h === next.h ? prev : next));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const onResize = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, [step, route, current.target, location.pathname]);

  async function finish() {
    navigate("/");
    await endTour();
  }

  const pad = 5;
  const round = box && Math.abs(box.w - box.h) < 6 ? (box.w + pad * 2) / 2 : 14;
  const width = Math.min(342, viewport.w - 48);
  const left = (viewport.w - width) / 2;
  const below = box ? box.y + box.h / 2 < viewport.h / 2 : false;
  const arrowX = box ? Math.max(16, Math.min(width - 32, box.x + box.w / 2 - left - 8)) : width / 2 - 8;

  return (
    // covers the whole screen, so taps only reach the tour's own buttons
    <div aria-live="polite" style={{ position: "fixed", inset: 0, zIndex: 70 }}>
      {box ? (
        <div
          aria-hidden="true"
          style={{
            position: "fixed",
            left: box.x - pad,
            top: box.y - pad,
            width: box.w + pad * 2,
            height: box.h + pad * 2,
            borderRadius: round,
            boxShadow: "0 0 0 9999px rgba(3,13,22,0.74)",
            outline: "3px solid var(--accent)",
            outlineOffset: 2,
            transition: "left 250ms ease, top 250ms ease, width 250ms ease, height 250ms ease, border-radius 250ms ease",
            pointerEvents: "none",
          }}
        />
      ) : (
        <div aria-hidden="true" style={{ position: "fixed", inset: 0, background: "rgba(3,13,22,0.74)" }} />
      )}

      {box && (
        <div
          role="dialog"
          aria-label={current.title}
          className="pop-in"
          key={step}
          style={{
            position: "fixed",
            left,
            width,
            ...(below ? { top: box.y + box.h + pad + 16 } : { bottom: viewport.h - box.y + pad + 16 }),
            boxSizing: "border-box",
            padding: "16px 16px 14px",
            borderRadius: 16,
            background: "var(--panel)",
            border: "1px solid var(--accent)",
            boxShadow: "0 14px 34px rgba(0,0,0,0.5)",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              left: arrowX,
              ...(below ? { top: -8, borderLeft: "1px solid var(--accent)", borderTop: "1px solid var(--accent)" } : { bottom: -8, borderRight: "1px solid var(--accent)", borderBottom: "1px solid var(--accent)" }),
              width: 16,
              height: 16,
              background: "var(--panel)",
              transform: "rotate(45deg)",
            }}
          />
          <div style={{ fontSize: 16, fontWeight: 800 }}>{current.title}</div>
          <div style={{ fontSize: 13.5, lineHeight: 1.5, color: "var(--muted)" }}>{current.body}</div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 6 }}>
            <span style={{ display: "flex", gap: 5 }} aria-label={`Step ${step + 1} of ${steps.length}`}>
              {steps.map((_, i) => (
                <span key={i} style={{ width: i === step ? 14 : 6, height: 6, borderRadius: 3, background: i === step ? "var(--accent)" : "#3b5670", transition: "width 200ms" }} />
              ))}
            </span>
            <span style={{ display: "flex", gap: 14, alignItems: "center" }}>
              {!last && (
                <button type="button" onClick={() => void finish()} style={{ background: "none", border: "none", padding: 0, fontSize: 13, fontWeight: 700, color: "var(--muted)" }}>
                  Skip tour
                </button>
              )}
              <button
                type="button"
                onClick={() => (last ? void finish() : setTourStep(step + 1))}
                style={{ padding: "8px 16px", borderRadius: 10, background: "var(--accent)", color: "var(--accent-text)", border: "none", fontSize: 13, fontWeight: 800 }}
              >
                {last ? "Done" : "Next"}
              </button>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
