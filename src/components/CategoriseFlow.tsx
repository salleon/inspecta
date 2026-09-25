import { useState } from "react";
import type { Finding } from "../db/types";
import { suggestCategories } from "../lib/esrSuggest";
import { useBackHandler } from "../lib/backButton";
import { IconChevronLeft } from "./Icons";
import RoundIconButton from "./RoundIconButton";
import { EsrBrowseSheet, EsrLink, EsrSuggestionList } from "./EsrCategory";

// "Categorise now", offered before a PDF / Excel export when some findings
// are Uncategorised: one finding at a time with its 5 suggestions. Picking
// one moves on to the next; "Skip finding" leaves it for later. After the
// last one, the skipped ones come round again (marked in yellow), and keep
// coming round until they're all done or "Skip to export". Once none are
// left it goes straight on to the export.

interface Entry {
  finding: Finding;
  dataUrls: string[];
}

export default function CategoriseFlow({
  entries,
  onPick,
  onExport,
  onClose,
}: {
  // the Uncategorised findings, in report order
  entries: Entry[];
  onPick: (finding: Finding, code: string) => void;
  onExport: () => void;
  onClose: () => void;
}) {
  const total = entries.length;
  const [queue, setQueue] = useState(() => entries.map((e) => e.finding.id));
  const [pos, setPos] = useState(0);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [round, setRound] = useState(1);
  const [done, setDone] = useState(0);
  const [photo, setPhoto] = useState(0);
  const [browsing, setBrowsing] = useState(false);

  useBackHandler(() => {
    onClose();
    return true;
  });

  const entry = entries.find((e) => e.finding.id === queue[pos]);
  if (!entry) return null;
  const { finding, dataUrls } = entry;

  function advance(nextSkipped: string[]) {
    setPhoto(0);
    setBrowsing(false);
    if (pos + 1 < queue.length) {
      setPos(pos + 1);
      setSkipped(nextSkipped);
    } else if (nextSkipped.length) {
      // round 2+: the skipped ones again
      setQueue(nextSkipped);
      setSkipped([]);
      setPos(0);
      setRound(round + 1);
    } else {
      onExport();
    }
  }

  function pick(code: string | undefined) {
    if (!code) {
      setBrowsing(false);
      return;
    }
    onPick(finding, code);
    setDone(done + 1);
    advance(skipped);
  }

  const suggestions = suggestCategories(finding.note, finding.location, { padIfEmpty: true });
  const place = [finding.level, finding.location].filter(Boolean).join(" · ");
  const retry = round > 1;

  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 10, background: "var(--bg)", display: "flex", flexDirection: "column" }}>
      <div style={{ flexShrink: 0, padding: "18px 18px 12px", display: "flex", alignItems: "center", gap: 12 }}>
        <RoundIconButton size={32} ariaLabel="Back to export" onClick={onClose}>
          <IconChevronLeft size={20} strokeWidth={2.2} />
        </RoundIconButton>
        <div style={{ fontSize: 15, fontWeight: 800 }}>Categorise</div>
      </div>

      {/* keyed so each finding starts scrolled to the top */}
      <div key={`${round}-${finding.id}`} style={{ flexGrow: 1, overflowY: "auto", padding: "4px 18px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
        {retry && (
          <div style={{ flexShrink: 0, background: "rgba(245,197,66,0.12)", border: "1px solid rgba(245,197,66,0.45)", borderRadius: 12, padding: "10px 12px", fontSize: 12, fontWeight: 600, lineHeight: 1.45, color: "#f5d27a" }}>
            <b style={{ color: "#f5c542" }}>Skipped findings</b>: {queue.length} left. Have another go, or skip them and export.
          </div>
        )}
        <div style={{ flexShrink: 0, display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 700, color: "var(--muted)" }}>
          <span>{retry ? `Skipped ${pos + 1} of ${queue.length}` : `Finding ${pos + 1} of ${total}`}</span>
          <span>{done} done</span>
        </div>
        <div style={{ flexShrink: 0, height: 4, borderRadius: 2, background: "var(--panel-2)", overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${(100 * done) / total}%`, background: retry ? "#f5c542" : "var(--accent)", transition: "width 200ms" }} />
        </div>

        <button
          type="button"
          aria-label={dataUrls.length > 1 ? "Next photo" : "Photo"}
          onClick={() => setPhoto((photo + 1) % Math.max(1, dataUrls.length))}
          style={{ flexShrink: 0, position: "relative", width: "100%", height: 190, padding: 0, borderRadius: 16, overflow: "hidden", border: "1px solid var(--border)", background: "linear-gradient(160deg, var(--panel-2), #050f1a)" }}
        >
          {dataUrls[photo] && <img key={finding.id + photo} src={dataUrls[photo]} alt="" className="photo-fade" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />}
          {dataUrls.length > 1 && (
            <span style={{ position: "absolute", left: 10, top: 8, fontSize: 11, fontWeight: 800, color: "#fff", background: "rgba(7,27,44,0.7)", borderRadius: 8, padding: "3px 8px" }}>
              {photo + 1} / {dataUrls.length}
            </span>
          )}
        </button>

        <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ fontSize: 15, fontWeight: 800, lineHeight: 1.35 }}>{finding.note || "Untitled finding"}</div>
          {place && <div style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)" }}>{place}</div>}
        </div>

        <EsrSuggestionList suggestions={suggestions} onPick={pick} />
        <div style={{ display: "flex", justifyContent: "center" }}>
          <EsrLink onClick={() => setBrowsing(true)}>Browse all categories ›</EsrLink>
        </div>
      </div>

      <div style={{ flexShrink: 0, padding: "12px 18px calc(26px + env(safe-area-inset-bottom))", display: "flex", gap: 10 }}>
        <button type="button" onClick={onExport} style={{ ...barButton, border: "1px solid var(--border)", color: "var(--text)" }}>
          Skip to export
        </button>
        <button type="button" onClick={() => advance([...skipped, finding.id])} style={{ ...barButton, border: "1px solid var(--accent)", color: "var(--accent)" }}>
          Skip finding ›
        </button>
      </div>

      {browsing && <EsrBrowseSheet onPick={pick} onClose={() => setBrowsing(false)} />}
    </div>
  );
}

const barButton = {
  flex: 1,
  textAlign: "center",
  padding: "14px 0",
  borderRadius: 14,
  background: "var(--panel)",
  fontSize: 13,
  fontWeight: 800,
} as const;
