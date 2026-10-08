import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import type { Site, SpfEdition, SpfStair, SpfSystem, SpfType } from "../db/types";
import { getSite, saveSiteSpf } from "../db/db";
import { defaultSystem, EDITIONS, newStair, stairLevels, stairName, stairRange, TYPES, typeFor } from "../lib/stairTest";
import { useBackHandler } from "../lib/backButton";
import { card, cardLabel, fieldInput, PageHeader, Pill, RulesBox, Seg } from "../components/StairUi";

// The stair pressurisation system, set once for the site (design canvas
// StairTestSimple, "0 · Set up the system"): the edition it was built to and
// its type (the amber rules: doors open and pass limits follow), the stairs
// with their levels and fans, and site notes for the bottom of the report.
// Kept as it's changed.

export default function StairSystem() {
  const { siteId } = useParams<{ siteId: string }>();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [site, setSite] = useState<Site | null>(null);
  const [sys, setSys] = useState<SpfSystem | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [extra, setExtra] = useState("");
  const saveTimer = useRef<number | null>(null);
  const latest = useRef<SpfSystem | null>(null);

  useEffect(() => {
    if (!siteId) return;
    void getSite(siteId).then((s) => {
      if (!s) return;
      setSite(s);
      const loaded = s.spf ?? defaultSystem();
      // a first stair to fill in, so there's somewhere to start
      setSys(loaded.stairs.length ? loaded : { ...loaded, stairs: [newStair()] });
      if (!loaded.stairs.length) setOpen("first");
    });
  }, [siteId]);

  const back = params.get("back") || `/site/${siteId}/findings?tab=flow`;
  const save = async () => {
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    saveTimer.current = null;
    if (latest.current && siteId) await saveSiteSpf(siteId, latest.current);
  };
  // written before leaving, so the next screen reads it
  const leave = () => void save().then(() => navigate(back, { replace: true }));
  useBackHandler(() => {
    leave();
    return true;
  });
  useEffect(
    () => () => {
      void save();
    },
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );

  function change(next: SpfSystem) {
    setSys(next);
    latest.current = next;
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => void save(), 300);
  }

  if (!sys) return <div style={{ height: "100%" }} />;
  const openId = open === "first" ? sys.stairs[0]?.id : open;
  const setStair = (id: string, patch: Partial<SpfStair>) => change({ ...sys, stairs: sys.stairs.map((s) => (s.id === id ? { ...s, ...patch } : s)) });

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PageHeader title="The system" sub={`${site?.name ?? ""} · set once for the site`} onBack={leave} right={<Pill onClick={leave}>Save</Pill>} />
      <div style={{ flexGrow: 1, overflowY: "auto", padding: "4px 14px 28px", display: "flex", flexDirection: "column", gap: 9 }}>
        <div style={card}>
          <div style={cardLabel}>Built to</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 78, flexShrink: 0, fontSize: 12, fontWeight: 700, color: "var(--muted)" }}>AS 1668.1</span>
            <Seg<SpfEdition> label="AS 1668.1 edition" options={EDITIONS} value={sys.edition} onChange={(edition) => change({ ...sys, edition, type: typeFor(edition, sys.type) })} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 78, flexShrink: 0, fontSize: 12, fontWeight: 700, color: "var(--muted)" }}>System type</span>
            <Seg<SpfType> label="System type" options={TYPES[sys.edition]} value={sys.type} onChange={(type) => change({ ...sys, type })} />
          </div>
          <RulesBox sys={sys} />
        </div>

        <div style={card}>
          <div style={cardLabel}>Stairs</div>
          {sys.stairs.map((st, i) => {
            const isOpen = openId === st.id;
            const count = stairLevels(st).length;
            return (
              <div key={st.id}>
                <button
                  onClick={() => setOpen(isOpen ? null : st.id)}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto auto 14px",
                    gap: 8,
                    alignItems: "center",
                    width: "100%",
                    textAlign: "left",
                    padding: "8px 10px",
                    borderRadius: isOpen ? "10px 10px 0 0" : 10,
                    background: "var(--panel-2)",
                    border: isOpen ? "1px solid var(--accent)" : "1px solid var(--border-strong)",
                    borderBottom: isOpen ? "none" : undefined,
                    color: "var(--text)",
                    fontSize: 13,
                    fontWeight: 800,
                  }}
                >
                  <span>{stairName(st, i)}</span>
                  <small style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700 }}>{stairRange(st)}</small>
                  <small style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700 }}>{st.fan}</small>
                  <span style={{ color: "var(--muted-2)" }}>{isOpen ? "▾" : "›"}</span>
                </button>
                {isOpen && (
                  <div style={{ background: "var(--panel-2)", border: "1px solid var(--accent)", borderTop: "none", borderRadius: "0 0 10px 10px", padding: "4px 10px 10px", display: "flex", flexDirection: "column", gap: 8 }}>
                    <Row label="Name">
                      <input aria-label="Stair name" placeholder="e.g. Front, North" value={st.name} onChange={(e) => setStair(st.id, { name: e.target.value })} style={{ ...fieldInput, flex: 1 }} />
                    </Row>
                    <Row label="Levels">
                      <input aria-label="Bottom level" placeholder="G" value={st.from} onChange={(e) => setStair(st.id, { from: e.target.value })} style={{ ...fieldInput, width: 64, textAlign: "center" }} />
                      <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 700 }}>to</span>
                      <input aria-label="Top level" placeholder="26" value={st.to} onChange={(e) => setStair(st.id, { to: e.target.value })} style={{ ...fieldInput, width: 64, textAlign: "center" }} />
                      <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--muted)", fontWeight: 700 }}>
                        {count} door{count === 1 ? "" : "s"}
                      </span>
                    </Row>
                    <Row label="Extra doors">
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 5, alignItems: "center", flex: 1 }}>
                        {st.extra.map((x) => (
                          <button
                            key={x}
                            aria-label={`Remove ${x}`}
                            onClick={() => setStair(st.id, { extra: st.extra.filter((e) => e !== x) })}
                            style={{ fontSize: 11.5, fontWeight: 800, padding: "4px 9px", borderRadius: 999, border: "none", background: "#143452", color: "#bfd0de" }}
                          >
                            {x} ✕
                          </button>
                        ))}
                        <input
                          aria-label="Add an extra door"
                          placeholder="+ Plant room, Roof…"
                          value={extra}
                          onChange={(e) => setExtra(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key !== "Enter" || !extra.trim()) return;
                            setStair(st.id, { extra: [...st.extra.filter((x) => x !== extra.trim()), extra.trim()] });
                            setExtra("");
                          }}
                          onBlur={() => {
                            if (!extra.trim()) return;
                            setStair(st.id, { extra: [...st.extra.filter((x) => x !== extra.trim()), extra.trim()] });
                            setExtra("");
                          }}
                          style={{ ...fieldInput, flex: 1, minWidth: 110, padding: "6px 9px", fontSize: 12.5 }}
                        />
                      </div>
                    </Row>
                    <Row label="Fan">
                      <input aria-label="Fan" placeholder="e.g. SPF-1" value={st.fan} onChange={(e) => setStair(st.id, { fan: e.target.value })} style={{ ...fieldInput, flex: 1 }} />
                    </Row>
                    {sys.stairs.length > 1 && (
                      <button
                        onClick={() => {
                          change({ ...sys, stairs: sys.stairs.filter((s) => s.id !== st.id) });
                          setOpen(null);
                        }}
                        style={{ alignSelf: "flex-start", border: "none", background: "none", color: "#ff7a6a", fontSize: 12, fontWeight: 800, padding: "2px 0" }}
                      >
                        Remove this stair
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          <button
            onClick={() => {
              const s = newStair();
              change({ ...sys, stairs: [...sys.stairs, s] });
              setOpen(s.id);
            }}
            style={{ alignSelf: "flex-start", border: "none", background: "none", color: "var(--accent)", fontSize: 13, fontWeight: 800, padding: "2px 0" }}
          >
            + Add a stair
          </button>
        </div>

        <div style={card}>
          <div style={cardLabel}>Site notes (on the report)</div>
          <textarea
            aria-label="Site notes"
            value={sys.notes}
            placeholder="Anything about the site for the report: access, keys, where the relief is…"
            onChange={(e) => change({ ...sys, notes: e.target.value })}
            rows={3}
            style={{ ...fieldInput, fontWeight: 600, fontSize: 13, lineHeight: 1.45, resize: "vertical", fontFamily: "inherit" }}
          />
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ width: 64, flexShrink: 0, fontSize: 11, fontWeight: 700, color: "var(--muted)", lineHeight: 1.2 }}>{label}</span>
      {children}
    </div>
  );
}
