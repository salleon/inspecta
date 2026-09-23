import { useEffect, useState } from "react";
import { HashRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { App as CapacitorApp } from "@capacitor/app";
import Dashboard from "./pages/Dashboard";
import Note from "./pages/Note";
import Findings from "./pages/Findings";
import ExportPreview from "./pages/Export";
import Onboarding from "./pages/Onboarding";
import Splash from "./components/Splash";
import { hasInspectorName } from "./lib/profile";

// How long the splash sits fully visible before it starts fading, and how
// long the fade itself takes (kept in sync with .splash-leaving's CSS
// animation-duration in index.css) — after HOLD_MS + FADE_MS it's unmounted
// for good, revealing onboarding or the app underneath.
const SPLASH_HOLD_MS = 1100;
const SPLASH_FADE_MS = 360;

function App() {
  // Gate the whole app behind a one-time name prompt — there's no login,
  // so this is the only way we know who's using this install. Checked once
  // at startup; flips to false the moment Onboarding saves a name.
  const [needsOnboarding, setNeedsOnboarding] = useState(() => !hasInspectorName());

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

  useEffect(() => {
    // Android hardware/gesture back button: step back through in-app screens
    // instead of dropping straight out to the home screen. The webview's own
    // navigation history (built up by HashRouter) tells us whether there's
    // somewhere to go back to.
    const listenerPromise = CapacitorApp.addListener("backButton", ({ canGoBack }) => {
      if (canGoBack) {
        window.history.back();
      } else {
        CapacitorApp.exitApp();
      }
    });
    return () => {
      listenerPromise.then((listener) => listener.remove());
    };
  }, []);

  return (
    <div className="app-shell">
      {needsOnboarding ? (
        <Onboarding onDone={() => setNeedsOnboarding(false)} />
      ) : (
        <HashRouter>
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
  if (/\/findings$/.test(pathname)) return 1;
  // Note and Export are both one level below Findings
  return 2;
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
      <Routes location={location}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/site/:siteId/finding/:findingId/note" element={<Note />} />
        <Route path="/site/:siteId/findings" element={<Findings />} />
        <Route path="/site/:siteId/export" element={<ExportPreview />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}

export default App;
