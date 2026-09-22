import { useEffect } from "react";
import { HashRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { App as CapacitorApp } from "@capacitor/app";
import Dashboard from "./pages/Dashboard";
import Note from "./pages/Note";
import Findings from "./pages/Findings";
import ExportPreview from "./pages/Export";

function App() {
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
      <HashRouter>
        <AnimatedRoutes />
      </HashRouter>
    </div>
  );
}

function AnimatedRoutes() {
  const location = useLocation();
  return (
    // keyed on pathname so each screen remounts (and replays its enter
    // animation) on navigation, without disturbing state within a screen
    <div key={location.pathname} className="route-fade">
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
