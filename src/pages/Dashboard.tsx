import { useEffect, useState, type FormEvent, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import type { Site, SiteKind } from "../db/types";
import { createSite, findingCount, listSites } from "../db/db";
import { IconSearch, IconBuilding, IconPlus } from "../components/Icons";
import CountUp from "../components/CountUp";
import logo from "../assets/logo.png";
import { getInitials, getInspectorName } from "../lib/profile";

interface SiteRow extends Site {
  findings: number;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [sites, setSites] = useState<SiteRow[]>([]);
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [kind, setKind] = useState<SiteKind>("afss");

  async function refresh() {
    const list = await listSites();
    const withCounts = await Promise.all(
      list.map(async (s) => ({ ...s, findings: await findingCount(s.id) })),
    );
    setSites(withCounts);
  }

  useEffect(() => {
    refresh();
  }, []);

  const filtered = sites.filter(
    (s) =>
      s.name.toLowerCase().includes(query.toLowerCase()) ||
      s.address.toLowerCase().includes(query.toLowerCase()),
  );
  const afssSites = filtered.filter((s) => s.kind === "afss");
  const projectSites = filtered.filter((s) => s.kind === "project");

  async function handleAddSite(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const site = await createSite(name.trim(), address.trim(), kind);
    setAdding(false);
    setName("");
    setAddress("");
    setKind("afss");
    navigate(`/site/${site.id}/findings`);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", position: "relative" }}>
      {/* top bar */}
      <div style={{ flexShrink: 0, padding: "20px 20px 12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <img src={logo} alt="Inspecta by EnFact" style={{ width: 34, height: 34, borderRadius: 9, display: "block" }} />
          <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.1 }}>
            <span style={{ fontSize: 17, fontWeight: 800, letterSpacing: -0.2 }}>Inspecta</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: "var(--accent)", letterSpacing: 0.4 }}>BY ENFACT</span>
          </div>
        </div>
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
            fontSize: 13,
            fontWeight: 800,
          }}
        >
          {initials()}
        </div>
      </div>

      {/* search */}
      <div style={{ flexShrink: 0, padding: "4px 20px 16px" }}>
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

      {/* site list */}
      <div style={{ flexGrow: 1, overflowY: "auto", padding: "0 20px 12px", display: "flex", flexDirection: "column", gap: 22 }}>
        {filtered.length === 0 && (
          <div style={{ padding: "40px 8px", textAlign: "center", color: "var(--muted-2)", fontSize: 14, fontWeight: 500 }}>
            {sites.length === 0 ? "No sites yet — tap + to start your first inspection." : "No sites match your search."}
          </div>
        )}
        {afssSites.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={sectionHeaderStyle}>AFSS</div>
            {afssSites.map((site, i) => (
              <SiteButton key={site.id} site={site} index={i} onClick={() => navigate(`/site/${site.id}/findings`)} />
            ))}
          </div>
        )}
        {projectSites.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={sectionHeaderStyle}>Project work</div>
            {projectSites.map((site, i) => (
              <SiteButton key={site.id} site={site} index={i} onClick={() => navigate(`/site/${site.id}/findings`)} />
            ))}
          </div>
        )}
      </div>

      {/* new site fab */}
      <button
        aria-label="Start new site inspection"
        onClick={() => setAdding(true)}
        className={`glow-sweep${sites.length === 0 ? " fab-pulse" : ""}`}
        style={{
          position: "absolute",
          right: 20,
          bottom: "calc(28px + env(safe-area-inset-bottom))",
          width: 58,
          height: 58,
          borderRadius: "50%",
          background: "var(--accent)",
          border: "none",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 8px 20px rgba(0,0,0,0.35)",
          overflow: "hidden",
        }}
      >
        <IconPlus size={24} color="var(--accent-text)" strokeWidth={2.4} />
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
              padding: "22px 20px calc(28px + env(safe-area-inset-bottom))",
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
          >
            <div style={{ fontSize: 16, fontWeight: 800 }}>New site</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={() => setKind("afss")}
                style={kindToggleStyle(kind === "afss")}
              >
                AFSS
              </button>
              <button
                type="button"
                onClick={() => setKind("project")}
                style={kindToggleStyle(kind === "project")}
              >
                Project work
              </button>
            </div>
            <input
              autoFocus
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
              Start inspection
            </button>
          </form>
        </div>
      )}
    </div>
  );

  function initials() {
    return getInitials(getInspectorName()) || "?";
  }
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

const sectionHeaderStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: 0.6,
  textTransform: "uppercase",
  color: "var(--muted-2)",
  padding: "0 2px",
};

function kindToggleStyle(active: boolean): CSSProperties {
  return {
    flexGrow: 1,
    textAlign: "center",
    padding: "10px 0",
    borderRadius: 10,
    border: active ? "1px solid var(--accent)" : "1px solid var(--border)",
    background: active ? "var(--accent)" : "var(--panel-2)",
    color: active ? "var(--accent-text)" : "var(--text)",
    fontSize: 13,
    fontWeight: 700,
  };
}

function SiteButton({ site, index, onClick }: { site: SiteRow; index: number; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="pop-in"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        background: "var(--panel)",
        border: "1px solid var(--border)",
        borderRadius: 14,
        padding: 14,
        textAlign: "left",
        color: "inherit",
        animationDelay: `${Math.min(index, 8) * 35}ms`,
      }}
    >
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
        }}
      >
        <IconBuilding strokeWidth={1.8} />
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
      </div>
      <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--accent)" }}>
          {formatInspectedDate(site.createdAt)}
        </span>
        <span style={{ fontSize: 11, fontWeight: 600, color: "var(--muted-2)" }}>
          <CountUp value={site.findings} /> finding{site.findings === 1 ? "" : "s"}
        </span>
      </div>
    </button>
  );
}

function formatInspectedDate(ms: number) {
  const d = new Date(ms);
  return d.toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" });
}
