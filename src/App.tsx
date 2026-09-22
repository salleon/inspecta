import { useEffect } from "react";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { App as CapacitorApp } from "@capacitor/app";
import Dashboard from "./pages/Dashboard";
import Camera from "./pages/Camera";
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
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/site/:siteId/camera" element={<Camera />} />
          <Route path="/site/:siteId/finding/:findingId/note" element={<Note />} />
          <Route path="/site/:siteId/findings" element={<Findings />} />
          <Route path="/site/:siteId/export" element={<ExportPreview />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </HashRouter>
    </div>
  );
}

export default App;
