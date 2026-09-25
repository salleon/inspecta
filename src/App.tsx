import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { HashRouter, Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import { App as CapacitorApp } from "@capacitor/app";
import Dashboard from "./pages/Dashboard";
import Note from "./pages/Note";
import Findings from "./pages/Findings";
import Onboarding from "./pages/Onboarding";
import Splash from "./components/Splash";
import { hasInspectorName } from "./lib/profile";
import { useKeepFocusedFieldVisible } from "./lib/keepFocusedVisible";
import { BACK_EVENT, parentRoute } from "./lib/backButton";

// The Export screen carries the PDF library (and loads the Excel one), so
// it's only fetched when first opened rather than parsed at every app
// launch. It's bundled locally, so this works offline.
const ExportPreview = lazy(() => import("./pages/Export"));

// How long the splash sits fully visible before it starts fading, and how
// long the fade itself takes (kept in sync with .splash-leaving's CSS
// animation-duration in index.css) — after HOLD_MS + FADE_MS it's unmounted
// for good, revealing onboarding or the app underneath. HOLD_MS is timed to
// let the logo's light-sweep (550ms delay + 1100ms duration, see
// .splash-logo-wrap::after in index.css) finish before the fade starts.
const SPLASH_HOLD_MS = 1650;
const SPLASH_FADE_MS = 360;

function App() {
  // Gate the whole app behind a one-time name prompt — there's no login,
  // so this is the only way we know who's using this install. Checked once
  // at startup; flips to false the moment Onboarding saves a name.
  const [needsOnboarding, setNeedsOnboarding] = useState(() => !hasInspectorName());

  // whatever field you're typing in stays visible above the keyboard
  useKeepFocusedFieldVisible();

  const [splashLeaving, setSplashLeaving] = useState(false);
  const [splashVisible, setSplashVisible] = useState(true);

  useEffect(() => {
    const leaveTimer = setTimeout(() => setSplashLeaving(true), SPLASH_HOLD_MS);
    const removeTimer = setTimeout(() => setSplashVisible(false), SPLASH_HOLD_MS + SPLASH_FADE_MS);
    return () => {
      clearTimeout(leaveTimer);
      clearTimeout(removeTimer);
    };
  }, []);

  return (
    <div className="app-shell">
      {needsOnboarding ? (
        <Onboarding onDone={() => setNeedsOnboarding(false)} />
      ) : (
        <HashRouter>
          <BackButton />
          <AnimatedRoutes />
        </HashRouter>
      )}
      {splashVisible && <Splash leaving={splashLeaving} />}
    </div>
  );
}

// How many taps deep a route sits from the dashboard — used to tell a
// forward navigation from a back one, so the transition can slide the
// right way instead of just fading.
function routeDepth(pathname: string): number {
  if (pathname === "/") return 0;
  if (pathname.endsWith("/findings")) return 1;
  // Note and Export are both one level below Findings
  return 2;
}

// Android hardware/gesture back button: up the app's structure, not back
// through history (see lib/backButton). The open screen gets first say
// (the finding screen saves before leaving); otherwise go to the parent
// screen, or close the app from the dashboard.
function BackButton() {
  const location = useLocation();
  const navigate = useNavigate();
  const pathname = useRef(location.pathname);
  pathname.current = location.pathname;
  useEffect(() => {
    const listenerPromise = CapacitorApp.addListener("backButton", () => {
      const event = new Event(BACK_EVENT, { cancelable: true });
      window.dispatchEvent(event);
      if (event.defaultPrevented) return; // the screen handled it
      const parent = parentRoute(pathname.current);
      if (parent === null) CapacitorApp.exitApp();
      else navigate(parent, { replace: true });
    });
    return () => {
      listenerPromise.then((listener) => listener.remove());
    };
  }, [navigate]);
  return null;
}

function AnimatedRoutes() {
  const location = useLocation();
  const depth = routeDepth(location.pathname);

  // Track the previous route's depth as state (not a ref) so the direction
  // can be derived safely during render — this is React's sanctioned
  // "adjust state during render" pattern for reacting to a prop/route
  // change without an extra effect + render round-trip.
  const [tracked, setTracked] = useState({ pathname: location.pathname, depth, prevDepth: depth });
  if (tracked.pathname !== location.pathname) {
    setTracked({ pathname: location.pathname, depth, prevDepth: tracked.depth });
  }
  const direction = depth >= tracked.prevDepth ? "forward" : "back";

  return (
    // keyed on pathname so each screen remounts (and replays its enter
    // animation) on navigation, without disturbing state within a screen
    <div key={location.pathname} className={direction === "forward" ? "route-slide-in" : "route-slide-back"}>
      <Suspense fallback={null}>
        <Routes location={location}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/site/:siteId/finding/:findingId/note" element={<Note />} />
          <Route path="/site/:siteId/findings" element={<Findings />} />
          <Route path="/site/:siteId/export" element={<ExportPreview />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </div>
  );
}

export default App;
