import { useState } from "react";
import type { Finding } from "../db/types";
import { suggestCategories } from "../lib/esrSuggest";
import { esrItem } from "../lib/esrCategories";
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
//
// "‹ Previous" steps back through the findings already seen (a mis-tap
// moves straight on, so this is the way to fix it): the finding shows
// with its pick highlighted — tap another to change it, or "Keep & next".

interface Step {
  queue: string[]; // finding ids this round
  pos: number;
  skipped: string[]; // skipped this round, for the next
  round: number;
  done: number;
}

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
  // the findings to go through (Uncategorised when the flow started), in
  // report order, with their current categories
  entries: Entry[];
  onPick: (finding: Finding, code: string) => void;
  onExport: () => void;
  onClose: () => void;
}) {
  const total = entries.length;
  const [step, setStep] = useState<Step>(() => ({ queue: entries.map((e) => e.finding.id), pos: 0, skipped: [], round: 1, done: 0 }));
  // each move forward, with where it was made from, for "‹ Previous"
  const [history, setHistory] = useState<{ from: Step; action: "picked" | "skipped" }[]>([]);
  // showing a finding again after "‹ Previous"
  const [revisit, setRevisit] = useState<"picked" | "skipped" | null>(null);
  const [photo, setPhoto] = useState(0);
  const [browsing, setBrowsing] = useState(false);
  const { queue, pos, skipped, round, done } = step;

  useBackHandler(() => {
    onClose();
    return true;
  });

  const entry = entries.find((e) => e.finding.id === queue[pos]);
  if (!entry) return null;
  const { finding, dataUrls } = entry;

  function advance(action: "picked" | "skipped") {
    setPhoto(0);
    setBrowsing(false);
    setRevisit(null);
    const nextSkipped = action === "skipped" ? [...skipped, finding.id] : skipped;
    const nextDone = action === "picked" ? done + 1 : done;
    setHistory([...history, { from: step, action }]);
    if (pos + 1 < queue.length) {
      setStep({ ...step, pos: pos + 1, skipped: nextSkipped, done: nextDone });
    } else if (nextSkipped.length) {
      // round 2+: the skipped ones again
      setStep({ queue: nextSkipped, skipped: [], pos: 0, round: round + 1, done: nextDone });
    } else {
      onExport();
    }
  }

  function pick(code: string | undefined) {
    if (!code) {
      setBrowsing(false);
      return;
    }
    // re-picking after "‹ Previous": the export screen takes back what was
    // learnt from the earlier pick
    if (code !== finding.esrCategory) onPick(finding, code);
    advance("picked");
  }

  function previous() {
    const last = history[history.length - 1];
    if (!last) return;
    setHistory(history.slice(0, -1));
    setStep(last.from);
    setRevisit(last.action);
    setPhoto(0);
    setBrowsing(false);
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
        <div style={{ flexShrink: 0, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 700, color: "var(--muted)" }}>
          {history.length ? (
            <button
              type="button"
              onClick={previous}
              style={{ display: "inline-flex", alignItems: "center", gap: 2, padding: "6px 12px 6px 8px", borderRadius: 999, background: "none", border: "1px solid var(--accent)", color: "var(--accent)", fontSize: 12, fontWeight: 800 }}
            >
              <IconChevronLeft size={14} strokeWidth={2.6} />
              Previous
            </button>
          ) : (
            <span />
          )}
          <span>
            {retry ? `Skipped ${pos + 1} of ${queue.length}` : `Finding ${pos + 1} of ${total}`} · {done} done
          </span>
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

        {revisit && (
          <div style={{ flexShrink: 0, background: "rgba(46,196,182,0.12)", border: "1px solid rgba(46,196,182,0.45)", borderRadius: 12, padding: "9px 12px", fontSize: 12, fontWeight: 600, lineHeight: 1.45, color: "#bdebe6" }}>
            {revisit === "picked" && esrItem(finding.esrCategory) ? (
              <>
                You picked{" "}
                <b style={{ color: "var(--text)" }}>
                  {finding.esrCategory} {esrItem(finding.esrCategory)!.name}
                </b>
                . Tap another to change it.
              </>
            ) : (
              <>You skipped this one. Pick a category, or skip it again.</>
            )}
          </div>
        )}

        <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ fontSize: 15, fontWeight: 800, lineHeight: 1.35 }}>{finding.note || "Untitled finding"}</div>
          {place && <div style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)" }}>{place}</div>}
        </div>

        <EsrSuggestionList suggestions={suggestions} current={finding.esrCategory} onPick={pick} />
        <div style={{ display: "flex", justifyContent: "center" }}>
          <EsrLink onClick={() => setBrowsing(true)}>Browse all categories ›</EsrLink>
        </div>
      </div>

      <div style={{ flexShrink: 0, padding: "12px 18px calc(26px + env(safe-area-inset-bottom))", display: "flex", gap: 10 }}>
        <button type="button" onClick={onExport} style={{ ...barButton, border: "1px solid var(--border)", color: "var(--text)" }}>
          Skip to export
        </button>
        {revisit === "picked" && finding.esrCategory ? (
          <button type="button" onClick={() => advance("picked")} style={{ ...barButton, border: "1px solid var(--accent)", color: "var(--accent)" }}>
            Keep &amp; next ›
          </button>
        ) : (
          <button type="button" onClick={() => advance("skipped")} style={{ ...barButton, border: "1px solid var(--accent)", color: "var(--accent)" }}>
            Skip finding ›
          </button>
        )}
      </div>

      {browsing && <EsrBrowseSheet current={finding.esrCategory} onPick={pick} onClose={() => setBrowsing(false)} />}
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
