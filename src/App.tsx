import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import Camera from "./pages/Camera";
import Note from "./pages/Note";
import Findings from "./pages/Findings";
import ExportPreview from "./pages/Export";

function App() {
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
