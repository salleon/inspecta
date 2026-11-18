import { useEffect, useState } from "react";
import type { Site } from "../db/types";
import { attachJob, listSites } from "../db/db";
import { useBackHandler } from "../lib/backButton";
import { Sheet } from "./TestsList";
import SiteKindIcon from "./SiteKindIcon";
import { IconLink, IconSearch } from "./Icons";

// Under a flow or stair job's name: attach it to an AFSS or project site
// (searchable list), or, once attached, the site's name: tap to change it or
// detach (db testJobs).
export default function AttachChip({ job, onChange }: { job: Site; onChange: (attachedTo?: string) => void }) {
  const [open, setOpen] = useState(false);
  const [sites, setSites] = useState<Site[]>([]);
  const [query, setQuery] = useState("");
  const attached = sites.find((s) => s.id === job.attachedTo);

  useEffect(() => {
    void listSites().then((all) => setSites(all.filter((s) => s.kind === "afss" || s.kind === "project")));
  }, []);

  useBackHandler(() => {
    if (!open) return false;
    setOpen(false);
    return true;
  });

  async function pick(siteId?: string) {
    await attachJob(job.id, siteId);
    onChange(siteId);
    setOpen(false);
  }

  const q = query.trim().toLowerCase();
  const shown = sites.filter((s) => !q || s.name.toLowerCase().includes(q) || s.address.toLowerCase().includes(q));
  const on = !!attached;

  return (
    <>
      <button
        data-testid="attach-chip"
        onClick={() => {
          setQuery("");
          setOpen(true);
        }}
        style={{ flexShrink: 0, alignSelf: "center", margin: "0 16px 8px", display: "flex", alignItems: "center", gap: 6, maxWidth: "calc(100% - 32px)", padding: "6px 12px", borderRadius: 999, fontSize: 12.5, fontWeight: 700, background: on ? "rgba(var(--accent-rgb), .12)" : "none", color: on ? "var(--accent)" : "var(--muted)", border: on ? "1px solid rgba(var(--accent-rgb), .5)" : "1px dashed var(--border-strong)" }}
      >
        <IconLink size={14} />
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{attached ? attached.name : "Attach to site"}</span>
      </button>

      {open && (
        <Sheet onClose={() => setOpen(false)}>
          <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>Attach to site</div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 12px", borderRadius: 12, background: "var(--bg)", border: "1px solid var(--border)" }}>
            <IconSearch color="var(--muted)" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search sites"
              type="search"
              style={{ flex: 1, minWidth: 0, padding: "11px 0", background: "none", border: "none", outline: "none", color: "var(--text)", fontSize: 14, fontWeight: 600 }}
            />
          </label>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: "45vh", overflowY: "auto" }}>
            {shown.map((s) => (
              <button
                key={s.id}
                onClick={() => void pick(s.id)}
                style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left", padding: "12px 14px", borderRadius: 14, background: "var(--panel-2)", border: s.id === job.attachedTo ? "1px solid var(--accent)" : "1px solid var(--border)", color: "var(--text)" }}
              >
                <SiteKindIcon kind={s.kind} size={20} />
                <span style={{ flexGrow: 1, minWidth: 0 }}>
                  <b style={{ display: "block", fontSize: 14.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</b>
                  {s.address && <span style={{ display: "block", fontSize: 12, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.address}</span>}
                </span>
                {s.id === job.attachedTo && <span style={{ color: "var(--accent)", fontWeight: 800 }}>✓</span>}
              </button>
            ))}
            {!shown.length && <div style={{ padding: "16px 0", textAlign: "center", color: "var(--muted-2)", fontSize: 13 }}>No matching sites</div>}
          </div>
          {on && (
            <button onClick={() => void pick()} style={{ width: "100%", padding: "13px 0", borderRadius: 12, border: "1px solid rgba(255,122,106,.45)", background: "none", color: "#ff7a6a", fontSize: 14.5, fontWeight: 800 }}>
              Detach
            </button>
          )}
          <button onClick={() => setOpen(false)} style={{ width: "100%", padding: "13px 0", borderRadius: 12, border: "1px solid var(--border-strong)", background: "none", color: "var(--text)", fontSize: 14.5, fontWeight: 800 }}>
            Cancel
          </button>
        </Sheet>
      )}
    </>
  );
}
