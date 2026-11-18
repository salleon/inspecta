import { backupDue } from "../lib/backupDue";
import { useEffect, useRef, useState, type FormEvent, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import type { Site, SiteKind } from "../db/types";
import { createSite, deleteSite, findingCount, firstSitePhoto, flowTestCount, getThumbnail, listSites, stairTestCount } from "../db/db";
import { IconSearch, IconBuilding, IconLink, IconPlus, IconSettings, IconChevronLeft, IconChevronRight } from "../components/Icons";
import CountUp from "../components/CountUp";
import ConfirmDialog from "../components/ConfirmDialog";
import SwipeRow from "../components/SwipeRow";
import { SITES_CHANGED, useTourScene } from "../lib/tour";
import { useEdgeBump } from "../lib/edgeBump";
import logo from "../assets/logo.png";
import { useFlowMode } from "../lib/settings";
import { CompanyLogo } from "../components/CompanySetup";
import SiteKindIcon, { KIND_COLOUR, KindTag, ReportsIcon } from "../components/SiteKindIcon";

interface SiteRow extends Site {
  findings: number;
  flowTests: number;
  stairTests: number;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const contractor = useFlowMode() === "contractor";
  const [sites, setSites] = useState<SiteRow[]>([]);
  const [query, setQuery] = useState("");
  // the chips picked under the search; none picked shows every kind
  const [kinds, setKinds] = useState<ChipKind[]>([]);
  const [adding, setAdding] = useState(false);
  // New job: first Reports or a test, then the site's details (canvas
  // Reports tile, option C); back slides the other way
  const [step, setStep] = useState<"pick" | "details">("pick");
  const [stepBack, setStepBack] = useState(false);
  function openNewJob() {
    setStep("pick");
    setStepBack(false);
    setAdding(true);
  }
  // the tour opens the New job sheet to show the kinds of site
  useTourScene("new-site", openNewJob, () => setAdding(false));
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [kind, setKind] = useState<SiteKind>("afss");
  const [openSwipeId, setOpenSwipeId] = useState<string | null>(null);
  const [confirmDeleteSite, setConfirmDeleteSite] = useState<SiteRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Site cover thumbnails (first finding's first photo — see
  // firstSitePhoto), by site id. The cache remembers which photo each URL
  // shows, so a refresh only redoes sites whose first photo changed.
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const thumbCache = useRef(new Map<string, { photoId: string; url: string }>());
  // the site list bumps at its top and bottom
  const listRef = useRef<HTMLDivElement>(null);
  useEdgeBump(listRef);

  async function refresh() {
    // newest first by when the site was made: changing something in a
    // site doesn't move it up the list
    const list = (await listSites()).sort((a, b) => b.createdAt - a.createdAt);
    const withCounts = await Promise.all(
      list.map(async (s) => ({
        ...s,
        findings: await findingCount(s.id),
        flowTests: s.kind === "flow" ? await flowTestCount(s.id) : 0,
        stairTests: s.kind === "spf" ? await stairTestCount(s.id) : 0,
      })),
    );
    setSites(withCounts);
    await loadThumbs(withCounts.map((s) => s.id));
  }

  // one site at a time, using the small saved thumbnails, so the list
  // shows immediately and the covers fill in
  async function loadThumbs(siteIds: string[]) {
    const cache = thumbCache.current;
    for (const [id, entry] of cache) {
      if (!siteIds.includes(id)) {
        URL.revokeObjectURL(entry.url);
        cache.delete(id);
      }
    }
    for (const id of siteIds) {
      const photo = await firstSitePhoto(id).catch(() => undefined);
      const cached = cache.get(id);
      if (cached && cached.photoId === photo?.id) continue;
      if (cached) {
        URL.revokeObjectURL(cached.url);
        cache.delete(id);
      }
      const blob = photo ? await getThumbnail(photo).catch(() => null) : null;
      if (photo && blob) cache.set(id, { photoId: photo.id, url: URL.createObjectURL(blob) });
      setThumbs(Object.fromEntries([...cache].map(([k, v]) => [k, v.url])));
    }
  }

  useEffect(() => {
    refresh();
    // the first-time tour adds and removes its Example site
    const onSitesChanged = () => void refresh();
    window.addEventListener(SITES_CHANGED, onSitesChanged);
    const cache = thumbCache.current;
    return () => {
      window.removeEventListener(SITES_CHANGED, onSitesChanged);
      cache.forEach((entry) => URL.revokeObjectURL(entry.url));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = sites.filter(
    (s) =>
      s.name.toLowerCase().includes(query.toLowerCase()) ||
      s.address.toLowerCase().includes(query.toLowerCase()),
  );
  // one list, newest first (see refresh), narrowed by the chips
  const shown = kinds.length ? filtered.filter((s) => kinds.includes(chipOf(s.kind))) : filtered;
  const toggleKind = (k: ChipKind) => setKinds((ks) => (ks.includes(k) ? ks.filter((x) => x !== k) : [...ks, k]));

  async function handleDeleteSite() {
    if (!confirmDeleteSite || deleting) return;
    setDeleting(true);
    try {
      await deleteSite(confirmDeleteSite.id);
      setConfirmDeleteSite(null);
      setOpenSwipeId(null);
      await refresh();
    } finally {
      setDeleting(false);
    }
  }

  async function handleAddSite(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const site = await createSite(name.trim(), address.trim(), kind);
    setAdding(false);
    setName("");
    setAddress("");
    setKind("afss");
    setStep("pick");
    navigate(`/site/${site.id}/findings`);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", position: "relative" }}>
      {/* top bar */}
      <div style={{ flexShrink: 0, padding: "20px 20px 12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {contractor ? <CompanyLogo height={34} maxWidth={110} /> : <img src={logo} alt="Inspecta by EnFact" style={{ width: 34, height: 34, borderRadius: 9, display: "block" }} />}
          {/* "Inspecta" sized so its letters (top of the I to the bottom of
              the p: 0.96em in the bundled Manrope) are as tall as the 34 px
              icon. Positioned so the main body of the word (the capital-
              height part, ignoring the p's tail) is centred on the icon:
              Manrope's line metrics sit it 0.145em low, less 0.12em (half
              the descender) to centre the body rather than the whole word.
              "BY ENFACT" follows on the same baseline. */}
          <div style={{ display: "flex", alignItems: "baseline", gap: 6, fontSize: 34 / 0.96, lineHeight: 1, transform: "translateY(-0.025em)", whiteSpace: "nowrap" }}>
            <span style={{ fontWeight: 800, letterSpacing: -0.6 }}>Inspecta</span>
            {!contractor && <span style={{ fontSize: 10, fontWeight: 700, color: "var(--accent)", letterSpacing: 0.4 }}>BY ENFACT</span>}
          </div>
        </div>
        <button
          aria-label="Settings"
          data-tour="settings"
          onClick={() => navigate("/settings")}
          style={{ position: "relative", width: 38, height: 38, background: "none", border: "none", padding: 0 }}
        >
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: "50%",
              background: "var(--panel)",
              border: "1px solid var(--border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <IconSettings size={19} strokeWidth={2} color="var(--text)" />
          </div>
          {/* amber dot: a site has gone a month with changes not in any backup */}
          {backupDue(sites, Date.now()) && (
            <span
              data-testid="backup-due"
              style={{ position: "absolute", top: 0, right: 0, width: 11, height: 11, borderRadius: "50%", background: "#f7b977", border: "2px solid var(--bg)" }}
            />
          )}
        </button>
      </div>

      {/* search */}
      <div style={{ flexShrink: 0, padding: "4px 20px 10px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: "var(--panel)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            padding: "11px 14px",
          }}
        >
          <IconSearch color="var(--muted)" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search sites"
            style={{
              flexGrow: 1,
              minWidth: 0,
              background: "none",
              border: "none",
              outline: "none",
              color: "var(--text)",
              fontSize: 14,
              fontWeight: 500,
            }}
          />
        </div>
      </div>

      {/* chips: tap to show only those kinds, tap again to drop one */}
      <div role="group" aria-label="Show job types" style={{ flexShrink: 0, display: "flex", gap: 6, padding: "0 20px 14px" }}>
        {KIND_CHIPS.map(([k, label]) => {
          const on = kinds.includes(k);
          return (
            <button key={k} type="button" aria-pressed={on} onClick={() => toggleKind(k)} style={kindChipStyle(on, k)}>
              {k === "reports" ? <ReportsIcon size={13} color="currentColor" /> : <SiteKindIcon kind={k} size={13} color="currentColor" />}
              {label}
            </button>
          );
        })}
      </div>

      {/* site list */}
      {/* the bottom padding keeps the last site clear of the + button */}
      <div ref={listRef} style={{ flexGrow: 1, overflowY: "auto", padding: "0 20px calc(100px + var(--sa-bottom))", display: "flex", flexDirection: "column", gap: 10 }}>
        {filtered.length === 0 && (
          <div style={{ padding: "40px 8px", textAlign: "center", color: "var(--muted-2)", fontSize: 14, fontWeight: 500 }}>
            {sites.length === 0 ? "No sites yet — tap New job to start your first inspection." : "No sites match your search."}
          </div>
        )}
        {filtered.length > 0 && shown.length === 0 && (
          <div style={{ padding: "40px 8px", textAlign: "center", color: "var(--muted-2)", fontSize: 14, fontWeight: 500 }}>
            No jobs of {kinds.length === 1 ? "that type" : "those types"}{query ? " match your search" : " yet"}.
            <div style={{ marginTop: 12 }}>
              <button type="button" onClick={() => setKinds([])} style={{ background: "none", border: "none", color: "var(--accent)", fontSize: 14, fontWeight: 800 }}>
                Show all
              </button>
            </div>
          </div>
        )}
        {shown.map((site, i) => (
          <div key={site.id} data-site-id={site.id}>
            <SiteButton
              site={site}
              thumb={thumbs[site.id]}
              attachedName={site.attachedTo ? sites.find((x) => x.id === site.attachedTo)?.name : undefined}
              index={i}
              onClick={() => navigate(`/site/${site.id}/findings`)}
              isOpen={openSwipeId === site.id}
              onOpen={() => setOpenSwipeId(site.id)}
              onClose={() => setOpenSwipeId((id) => (id === site.id ? null : id))}
              onDelete={() => setConfirmDeleteSite(site)}
            />
          </div>
        ))}
      </div>

      {/* the list fades out under the New job pill, so it reads as scrolling on */}
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: "calc(130px + var(--sa-bottom))", background: "linear-gradient(rgba(7,27,44,0), var(--bg) 70%)", pointerEvents: "none" }} />

      {/* New job: a pill centred at the bottom, clear of the cards' dates and
          counts on the right; a light sweep when the screen opens, a soft glow */}
      <button
        aria-label="New job"
        data-tour="new-site"
        onClick={openNewJob}
        className="glow-sweep fab-pulse"
        style={{
          position: "absolute",
          left: "50%",
          transform: "translateX(-50%)",
          bottom: "calc(26px + var(--sa-bottom))",
          height: 52,
          padding: "0 26px",
          borderRadius: 26,
          background: "var(--accent)",
          color: "var(--accent-text)",
          border: "none",
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 16,
          fontWeight: 800,
          whiteSpace: "nowrap",
          boxShadow: "0 8px 20px rgba(0,0,0,0.35)",
          overflow: "hidden",
        }}
      >
        <IconPlus size={20} color="var(--accent-text)" strokeWidth={2.4} />
        New job
      </button>

      {adding && (
        <div
          className="sheet-backdrop"
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(10,11,13,0.6)",
            display: "flex",
            alignItems: "flex-end",
          }}
          onClick={() => setAdding(false)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleAddSite}
            className="sheet-panel"
            style={{
              width: "100%",
              background: "var(--panel)",
              borderRadius: "20px 20px 0 0",
              padding: "22px 20px calc(28px + var(--sa-bottom))",
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
          >
            {step === "pick" ? (
              <div key="pick" className={stepBack ? "sheet-step-back" : undefined} style={{ display: "flex", flexDirection: "column", gap: 14 }} data-tour="site-kinds">
                <div style={{ fontSize: 16, fontWeight: 800 }}>New job</div>
                {/* Reports first and largest: AFSS or Projects is picked on the next step */}
                <button
                  type="button"
                  onClick={() => {
                    if (kind !== "afss" && kind !== "project") setKind("afss");
                    setStep("details");
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    minHeight: 78,
                    padding: "14px 14px 14px 16px",
                    borderRadius: 16,
                    border: `1px solid ${KIND_COLOUR.afss}99`,
                    background: `${KIND_COLOUR.afss}24`,
                    color: "var(--text)",
                    textAlign: "left",
                  }}
                >
                  <span style={{ width: 46, height: 46, borderRadius: 12, background: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <ReportsIcon size={24} color="var(--accent-text)" />
                  </span>
                  <span style={{ flexGrow: 1, display: "flex", flexDirection: "column", gap: 2 }}>
                    <span style={{ fontSize: 17, fontWeight: 800 }}>Reports</span>
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--muted)" }}>AFSS · Projects</span>
                  </span>
                  <IconChevronRight size={20} color="var(--accent)" strokeWidth={2.4} />
                </button>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", marginTop: 4 }}>Tests</div>
                {/* three across: flow, stair, FFCP */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
                  {TEST_TILES.map(([k, label]) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => {
                        setKind(k);
                        setStep("details");
                      }}
                      style={testTileStyle(k)}
                    >
                      <SiteKindIcon kind={k} size={17} />
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div key="details" className="sheet-step" style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: -8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 4, marginLeft: -12 }}>
                  <button
                    type="button"
                    aria-label="Back"
                    onClick={() => {
                      setStepBack(true);
                      setStep("pick");
                    }}
                    style={{ width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", padding: 0, color: "var(--text)" }}
                  >
                    <IconChevronLeft size={20} strokeWidth={2.4} />
                  </button>
                  <div style={{ fontSize: 16, fontWeight: 800 }}>{kind === "flow" ? "Flow testing" : kind === "spf" ? "Stair pressurisation" : kind === "ffcp" ? "Fire fan control panel" : "New report"}</div>
                </div>
                {(kind === "afss" || kind === "project") && (
                  <div role="radiogroup" aria-label="Report type" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    {(["afss", "project"] as const).map((k) => (
                      <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)} style={reportTypeStyle(kind === k, k)}>
                        <SiteKindIcon kind={k} size={26} color="currentColor" />
                        {k === "afss" ? "AFSS" : "Projects"}
                      </button>
                    ))}
                  </div>
                )}
                {/* no autofocus: pick the kind first, then tap here (the keyboard waits) */}
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Site name"
                  style={inputStyle}
                />
                <input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Address (optional)"
                  style={inputStyle}
                />
                <button
                  type="submit"
                  className="glow-sweep"
                  style={{
                    position: "relative",
                    display: "block",
                    textAlign: "center",
                    padding: "16px 0",
                    borderRadius: 14,
                    background: "var(--accent)",
                    border: "none",
                    fontSize: 15,
                    fontWeight: 800,
                    color: "var(--accent-text)",
                    overflow: "hidden",
                  }}
                >
                  {kind === "flow" ? "Start flow testing" : kind === "spf" ? "Start stair testing" : kind === "ffcp" ? "Start FFCP testing" : "Start inspection"}
                </button>
              </div>
            )}
          </form>
        </div>
      )}

      {confirmDeleteSite && (
        <ConfirmDialog
          title="Are you sure?"
          message={`"${confirmDeleteSite.name}" and all of its findings and photos will be permanently deleted. This can't be undone.`}
          busy={deleting}
          onCancel={() => setConfirmDeleteSite(null)}
          onConfirm={handleDeleteSite}
        />
      )}
    </div>
  );

}

const inputStyle: CSSProperties = {
  background: "var(--panel-2)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  padding: "13px 14px",
  color: "var(--text)",
  fontSize: 15,
  fontWeight: 500,
  outline: "none",
};

// Home's chips: Reports covers AFSS and Projects; the tests each have their
// own. Equal widths.
type ChipKind = "reports" | "flow" | "spf" | "ffcp";
const chipOf = (k: SiteKind): ChipKind => (k === "afss" || k === "project" ? "reports" : k);
const KIND_CHIPS: [ChipKind, string][] = [
  ["reports", "Reports"],
  ["flow", "Flow"],
  ["spf", "Stair"],
  ["ffcp", "FFCP"],
];

// New job's tests, under Reports
const TEST_TILES: ["flow" | "spf" | "ffcp", string][] = [
  ["flow", "Flow testing"],
  ["spf", "Stair pressurisation"],
  ["ffcp", "Fire fan control panel"],
];

function testTileStyle(kind: SiteKind): CSSProperties {
  return {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    minHeight: 62,
    padding: "8px 4px",
    borderRadius: 12,
    border: `1px solid ${KIND_COLOUR[kind]}55`,
    background: "none",
    color: "var(--text)",
    fontSize: 12,
    fontWeight: 800,
    textAlign: "center",
    lineHeight: 1.2,
  };
}

function reportTypeStyle(active: boolean, kind: SiteKind): CSSProperties {
  return { ...kindToggleStyle(active, kind), flexDirection: "column", gap: 8, height: 96, borderRadius: 14, fontSize: 15 };
}

// a chip in the row under the search: its kind's colour when picked
function kindChipStyle(on: boolean, kind: ChipKind): CSSProperties {
  const c = kind === "reports" ? KIND_COLOUR.afss : KIND_COLOUR[kind];

  return {
    flex: "1 1 0",
    minWidth: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    padding: "7px 4px",
    borderRadius: 999,
    border: on ? `1px solid ${c}` : "1px solid var(--border-strong)",
    background: on ? `${c}29` : "var(--panel)",
    color: on ? c : "var(--muted)",
    fontSize: 12.5,
    fontWeight: 800,
    whiteSpace: "nowrap",
  };
}

function kindToggleStyle(active: boolean, kind: SiteKind): CSSProperties {
  const c = KIND_COLOUR[kind];
  return {
    flexGrow: 1,
    flexBasis: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    textAlign: "center",
    padding: "10px 4px",
    borderRadius: 10,
    // as on the canvas (NewSiteColours): picked takes its kind's colour,
    // a translucent fill with a stronger outline
    border: active ? `1px solid ${c}99` : "1px solid var(--border-strong)",
    background: active ? `${c}24` : "none",
    color: active ? c : "var(--muted)",
    fontSize: 13,
    fontWeight: 800,
  };
}

function SiteButton({
  site,
  thumb,
  attachedName,
  index,
  onClick,
  isOpen,
  onOpen,
  onClose,
  onDelete,
}: {
  site: SiteRow;
  thumb?: string;
  // the AFSS or project site a flow or stair job is attached to
  attachedName?: string;
  index: number;
  onClick: () => void;
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  onDelete: () => void;
}) {
  // swipe-to-delete: the shared row, the same everywhere (asked first)
  return (
    <SwipeRow index={index} label={`Delete ${site.name}`} swipeOpen={isOpen} onSwipeOpen={onOpen} onSwipeClose={onClose} onOpen={onClick} onDelete={onDelete} rowStyle={{ padding: 14, color: "inherit" }} chevron={false}>
        <div
          style={{
            flexShrink: 0,
            width: 46,
            height: 46,
            borderRadius: 10,
            background: "var(--panel-2)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
          }}
        >
          {/* the site's first finding photo, or the building icon until
              it has one */}
          {thumb ? (
            <img src={thumb} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          ) : (
            <IconBuilding strokeWidth={1.8} />
          )}
        </div>
        <div style={{ flexGrow: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{site.name}</div>
          <div
            style={{
              fontSize: 12,
              fontWeight: 500,
              color: "var(--muted)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {site.address || "No address set"}
          </div>
          {attachedName && (
            <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 700, color: "var(--accent)", minWidth: 0 }}>
              <IconLink size={12} style={{ flexShrink: 0 }} />
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{attachedName}</span>
            </div>
          )}
          {site.restoreIncomplete && (
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--accent)" }}>Restore didn't finish: restore the backup again</div>
          )}
        </div>
        <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5 }}>
          <KindTag kind={site.kind} />
          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--accent)" }}>
            {formatInspectedDate(site.createdAt)}
          </span>
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--muted-2)" }}>
            {site.kind === "flow" ? (
              <>
                <CountUp value={site.flowTests} /> flow test{site.flowTests === 1 ? "" : "s"}
              </>
            ) : site.kind === "spf" ? (
              <>
                <CountUp value={site.stairTests} /> stair test{site.stairTests === 1 ? "" : "s"}
              </>
            ) : site.kind === "ffcp" ? (
              <>
                <CountUp value={site.ffcp?.length ?? 0} /> panel test{site.ffcp?.length === 1 ? "" : "s"}
              </>
            ) : (
              <>
                <CountUp value={site.findings} /> finding{site.findings === 1 ? "" : "s"}
              </>
            )}
          </span>
        </div>
    </SwipeRow>
  );
}

function formatInspectedDate(ms: number) {
  const d = new Date(ms);
  return d.toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" });
}
