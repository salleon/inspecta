import { useEffect, useState, type CSSProperties } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { Site, StairSection, StairTestKind } from "../db/types";
import { addStairTest, getSite } from "../db/db";
import { CUSTOM_SECTIONS, KIND_HINT, KIND_LABEL, KINDS, newStairTest, SECTION, systemLine } from "../lib/stairTest";
import { getInspectorName } from "../lib/profile";
import { PageHeader, Pill } from "../components/StairUi";

// A new stair test (design canvas StairTestSimple, "1 · Pick the test"):
// the system is already set for the site, so it only asks what's being
// tested today. Annual Testing to start with (an AFSS site's is always
// annual, but it can still be changed). Before the system is set up it shows
// the order as numbered steps (canvas SpfSetupFirst, option A): 1 · set up
// the system, 2 · what you're testing, greyed out until then.

const stepNum = (on: boolean): CSSProperties => ({
  width: 24,
  height: 24,
  borderRadius: "50%",
  flexShrink: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 13,
  fontWeight: 800,
  background: on ? "var(--accent)" : "#143452",
  color: on ? "var(--accent-text)" : "var(--muted)",
});
const stepCard = (on: boolean): CSSProperties => ({
  display: "flex",
  gap: 10,
  alignItems: "flex-start",
  borderRadius: 14,
  padding: "11px 12px",
  background: on ? "rgba(46,196,182,.07)" : "#0c2236",
  border: on ? "1px solid rgba(46,196,182,.55)" : "1px solid #163a5a",
});
const stepSub: CSSProperties = { display: "block", fontSize: 11.5, color: "var(--muted)", fontWeight: 600, lineHeight: 1.4, marginTop: 3 };

const radio = (on: boolean): CSSProperties => ({
  width: 16,
  height: 16,
  borderRadius: "50%",
  flexShrink: 0,
  boxSizing: "border-box",
  border: on ? "5px solid var(--accent)" : "2px solid #2a5a82",
});

export default function StairNew() {
  const { siteId } = useParams<{ siteId: string }>();
  const navigate = useNavigate();
  const [site, setSite] = useState<Site | null>(null);
  const [kind, setKind] = useState<StairTestKind>("annual");
  const [picked, setPicked] = useState<StairSection[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (siteId) void getSite(siteId).then((s) => setSite(s ?? null));
  }, [siteId]);

  const ready = !!site?.spf?.stairs.length;
  const steps = !!site && !ready;
  const editSystem = () => navigate(`/site/${siteId}/spf-system?back=${encodeURIComponent(`/site/${siteId}/spf/new`)}`);

  async function start() {
    if (!siteId || busy) return;
    if (!ready) return editSystem();
    if (kind === "custom" && !picked.length) return;
    setBusy(true);
    try {
      const test = await addStairTest(newStairTest(siteId, kind, picked, getInspectorName()));
      navigate(`/site/${siteId}/spf/${test.id}`, { replace: true });
    } finally {
      setBusy(false);
    }
  }

  // nothing until the site's read, so the steps don't flash in after the test kinds
  if (!site) return <div style={{ height: "100%" }} />;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PageHeader title="Stair pressurisation" sub={`${site?.name ?? ""} · new test`} onBack={() => navigate(`/site/${siteId}/findings?tab=flow`)} />
      <div style={{ flexGrow: 1, overflowY: "auto", padding: "4px 14px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
        {steps ? (
          <>
            <div style={stepCard(true)}>
              <span style={stepNum(true)}>1</span>
              <div>
                <div style={{ fontSize: 14.5, fontWeight: 800 }}>
                  Set up the system
                  <small style={stepSub}>Once for this site: the edition it was built to, the type and the stairs. Every test uses it.</small>
                </div>
                <button onClick={editSystem} style={{ marginTop: 9, padding: "8px 14px", borderRadius: 10, border: "none", background: "var(--accent)", color: "var(--accent-text)", fontWeight: 800, fontSize: 13 }}>
                  Set up the system ›
                </button>
              </div>
            </div>
            <div style={stepCard(false)}>
              <span style={stepNum(false)}>2</span>
              <div style={{ fontSize: 14.5, fontWeight: 800, color: "var(--muted)" }}>
                What are you testing today?
                <small style={stepSub}>After the system is set up.</small>
              </div>
            </div>
          </>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--panel-2)", border: "1px solid var(--border-strong)", borderRadius: 12, padding: "9px 11px", fontSize: 12, color: "#bfd0de", lineHeight: 1.4 }}>
              <span style={{ flexGrow: 1 }}>
                <b style={{ color: "var(--text)" }}>The system</b>
                <br />
                {site ? systemLine(site.spf) : ""}
              </span>
              <Pill onClick={editSystem}>{ready ? "Edit" : "Set up"}</Pill>
            </div>
            <div style={{ fontSize: 13, fontWeight: 800, color: "#bfd0de", marginTop: 6 }}>What are you testing today?</div>
          </>
        )}
        <div aria-disabled={steps || undefined} style={{ display: "flex", flexDirection: "column", gap: 8, opacity: steps ? 0.38 : 1, pointerEvents: steps ? "none" : undefined }}>
          {KINDS.map((k) => {
            const on = kind === k;
            return (
              <div
                key={k}
                role="radio"
                aria-checked={on}
                tabIndex={0}
                onClick={() => setKind(k)}
                style={{ background: on ? "rgba(46,196,182,.08)" : "var(--panel)", border: on ? "1px solid var(--accent)" : "1px solid var(--border)", boxShadow: on ? "0 0 0 3px rgba(46,196,182,.14)" : "none", borderRadius: 14, padding: "11px 12px", cursor: "pointer" }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15, fontWeight: 800 }}>
                  <span style={radio(on)} />
                  {KIND_LABEL[k]}
                </div>
                <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 3, lineHeight: 1.4 }}>{KIND_HINT[k]}</div>
                {k === "custom" && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 8 }}>
                    {CUSTOM_SECTIONS.map((s) => {
                      const sel = kind === "custom" && picked.includes(s);
                      return (
                        <button
                          key={s}
                          aria-pressed={sel}
                          onClick={(e) => {
                            e.stopPropagation();
                            setKind("custom");
                            setPicked((p) => (sel ? p.filter((x) => x !== s) : [...p.filter((x) => x !== s), s]));
                          }}
                          style={{ fontSize: 11, fontWeight: 800, padding: "5px 9px", borderRadius: 999, background: sel ? "rgba(46,196,182,.16)" : "var(--panel-2)", border: sel ? "1px solid var(--accent)" : "1px solid var(--border-strong)", color: sel ? "#5ff0e0" : "var(--muted)" }}
                        >
                          {SECTION[s].name}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div style={{ flexShrink: 0, padding: "10px 16px calc(24px + env(safe-area-inset-bottom))" }}>
        <button
          onClick={() => void start()}
          disabled={busy || steps || (ready && kind === "custom" && !picked.length)}
          className={steps ? undefined : "glow-sweep"}
          style={{
            position: "relative",
            overflow: "hidden",
            width: "100%",
            padding: "16px 0",
            borderRadius: 14,
            border: "none",
            background: steps ? "#143452" : "var(--accent)",
            color: steps ? "var(--muted)" : "var(--accent-text)",
            fontSize: 16,
            fontWeight: 800,
            opacity: ready && kind === "custom" && !picked.length ? 0.45 : 1,
          }}
        >
          {!ready ? "Set up the system first" : kind === "custom" && !picked.length ? "Pick what you're testing" : "Start ›"}
        </button>
      </div>
    </div>
  );
}
