import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Site } from "../db/types";
import { getSite, saveSiteFfcp } from "../db/db";
import { newFfcpTest, testSummary } from "../lib/ffcp";
import { shortDate } from "../lib/dates";
import ConfirmDialog from "./ConfirmDialog";
import SwipeRow from "./SwipeRow";
import SiteKindIcon from "./SiteKindIcon";

// An FFCP job's page: its panel tests, newest first; swipe left to delete.
// + New panel test opens a test, which asks for its fans first.

const TONE = { pass: "#2bd47a", fail: "#ff7a6a", todo: "var(--muted)" };

// a new panel test in this job, saved; returns its id
export async function addFfcpTest(jobId: string) {
  const job = await getSite(jobId);
  const test = newFfcpTest();
  await saveSiteFfcp(jobId, [...(job?.ffcp ?? []), test]);
  return test.id;
}

export default function FfcpList({ site }: { site: Site }) {
  const navigate = useNavigate();
  const [tests, setTests] = useState(site.ffcp ?? []);
  const [openSwipeId, setOpenSwipeId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
      <div style={{ flexShrink: 0, padding: "12px 16px calc(28px + var(--sa-bottom))", borderTop: "1px solid var(--border)" }}>
        <button
          onClick={() => void add()}
          disabled={busy}
          className="glow-sweep"
          style={{ position: "relative", overflow: "hidden", width: "100%", padding: "17px 0", borderRadius: 14, background: "var(--accent)", color: "var(--accent-text)", border: "none", fontSize: 16, fontWeight: 800 }}
        >
          + New panel test
        </button>
      </div>
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
