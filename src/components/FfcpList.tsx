import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Site } from "../db/types";
import { addFfcpTest, saveSiteFfcp } from "../db/db";
import { modesTested, testSummary } from "../lib/ffcp";
import { exportTests, type TestsFormat } from "../lib/testsExport";
import { useBackHandler } from "../lib/backButton";
import { say } from "./Message";
import ProgressOverlay from "./ProgressOverlay";
import { Sheet } from "./TestsList";
import { shortDate } from "../lib/dates";
import ConfirmDialog from "./ConfirmDialog";
import SwipeRow from "./SwipeRow";
import SiteKindIcon from "./SiteKindIcon";

// An FFCP job's page: its panel tests, newest first; swipe left to delete.
// + New panel test opens a test, which asks for its fans first. Export: the
// tests with anything ticked, as PDF and / or Excel (lib/testsExport).

const TONE = { pass: "#2bd47a", fail: "#ff7a6a", todo: "var(--muted)" };

export default function FfcpList({ site }: { site: Site }) {
  const navigate = useNavigate();
  const [tests, setTests] = useState(site.ffcp ?? []);
  const [openSwipeId, setOpenSwipeId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [formats, setFormats] = useState<Set<TestsFormat> | null>(null);
  const [exporting, setExporting] = useState<{ percent: number; step: string } | null>(null);
  useBackHandler(() => {
    if (!formats) return false;
    setFormats(null);
    return true;
  });
  const done = tests.filter((t) => modesTested(t).length);

  async function runExport() {
    if (!formats?.size || exporting) return;
    const picked = (["pdf", "xlsx"] as TestsFormat[]).filter((f) => formats.has(f));
    setFormats(null);
    setExporting({ percent: 5, step: "Getting ready…" });
    try {
      await exportTests({ flow: [], stair: [], ffcp: done, site, formats: picked }, (percent, step) => setExporting({ percent, step }));
    } catch (err) {
      if (!(err instanceof Error) || !/cancell?ed/i.test(err.message)) {
        console.error("FFCP export failed", err);
        say("Couldn't export the tests");
      }
    } finally {
      setExporting(null);
    }
  }

  async function add() {
    if (busy) return;
    setBusy(true);
    try {
      navigate(`/site/${site.id}/ffcp/${await addFfcpTest(site.id)}`);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirming || busy) return;
    setBusy(true);
    try {
      const left = tests.filter((t) => t.id !== confirming);
      await saveSiteFfcp(site.id, left);
      setTests(left);
      setConfirming(null);
      setOpenSwipeId(null);
    } finally {
      setBusy(false);
    }
  }

  const shown = [...tests].sort((a, b) => b.testedAt - a.testedAt);
  return (
    <>
      <div style={{ flexGrow: 1, overflowY: "auto", padding: "4px 16px 12px", display: "flex", flexDirection: "column", gap: 10 }}>
        {!tests.length && <div style={{ padding: "40px 8px", textAlign: "center", color: "var(--muted-2)", fontSize: 14, fontWeight: 500 }}>No panel tests yet.</div>}
        {shown.map((t, i) => {
          const v = testSummary(t);
          return (
            <SwipeRow
              key={t.id}
              index={i}
              label="Delete panel test"
              swipeOpen={openSwipeId === t.id}
              onSwipeOpen={() => setOpenSwipeId(t.id)}
              onSwipeClose={() => setOpenSwipeId((id) => (id === t.id ? null : id))}
              onOpen={() => navigate(`/site/${site.id}/ffcp/${t.id}`)}
              onDelete={() => setConfirming(t.id)}
            >
              <div style={{ width: 72, height: 52, flexShrink: 0, borderRadius: 8, background: "rgba(255,122,92,.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <SiteKindIcon kind="ffcp" size={30} />
              </div>
              <div style={{ flexGrow: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
                <div style={{ fontSize: 14, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.location || "Fire fan control panel"}</div>
                <div style={{ fontSize: 12, color: "var(--muted)" }}>FFCP · {shortDate(t.testedAt)}</div>
                <div style={{ fontSize: 11, fontWeight: 800, color: TONE[v.tone] }}>{v.text}</div>
              </div>
            </SwipeRow>
          );
        })}
        {!!tests.length && <div style={{ fontSize: 11.5, color: "var(--muted-2)", textAlign: "center" }}>Swipe a test left to delete it.</div>}
      </div>
      <div style={{ flexShrink: 0, padding: "12px 16px calc(28px + var(--sa-bottom))", borderTop: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 10 }}>
        {!!done.length && (
          <button
            onClick={() => setFormats(new Set())}
            style={{ width: "100%", padding: "13px 0", borderRadius: 12, border: "1px solid rgba(255,122,92,.55)", background: "rgba(255,122,92,.1)", color: "#ff7a5c", fontSize: 14.5, fontWeight: 800 }}
          >
            Export
          </button>
        )}
        <button
          onClick={() => void add()}
          disabled={busy}
          className="glow-sweep"
          style={{ position: "relative", overflow: "hidden", width: "100%", padding: "17px 0", borderRadius: 14, background: "var(--accent)", color: "var(--accent-text)", border: "none", fontSize: 16, fontWeight: 800 }}
        >
          + New panel test
        </button>
      </div>
      {formats && (
        <Sheet onClose={() => setFormats(null)}>
          <div style={{ fontSize: 16, fontWeight: 800 }}>Export {done.length === 1 ? "the panel test" : `${done.length} panel tests`}</div>
          <div style={{ display: "flex", gap: 8 }}>
            {(["pdf", "xlsx"] as TestsFormat[]).map((f) => {
              const on = formats.has(f);
              return (
                <button
                  key={f}
                  aria-pressed={on}
                  onClick={() =>
                    setFormats((s) => {
                      const next = new Set(s);
                      if (next.has(f)) next.delete(f);
                      else next.add(f);
                      return next;
                    })
                  }
                  style={{ flex: 1, padding: "12px 0", borderRadius: 10, border: on ? "1px solid rgba(255,122,92,.6)" : "1px solid var(--border-strong)", background: on ? "rgba(255,122,92,.12)" : "none", color: on ? "#ff7a5c" : "var(--muted)", fontSize: 14, fontWeight: 800 }}
                >
                  {f === "pdf" ? "PDF" : "Excel"}
                </button>
              );
            })}
          </div>
          <button
            onClick={() => void runExport()}
            disabled={!formats.size}
            style={{ width: "100%", padding: "16px 0", borderRadius: 14, border: "none", background: "var(--accent)", color: "var(--accent-text)", fontSize: 16, fontWeight: 800, opacity: formats.size ? 1 : 0.4 }}
          >
            {formats.size ? "Export" : "Pick PDF or Excel"}
          </button>
        </Sheet>
      )}

      {exporting && <ProgressOverlay percent={exporting.percent} title="Preparing export" step={exporting.step} art="conveyor" />}

      {confirming && (
        <ConfirmDialog
          title="Delete this panel test?"
          message="Its fans and checks will be permanently deleted. This can't be undone."
          busy={busy}
          onCancel={() => setConfirming(null)}
          onConfirm={remove}
        />
      )}
    </>
  );
}
