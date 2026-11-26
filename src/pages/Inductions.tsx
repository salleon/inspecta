import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import RoundIconButton from "../components/RoundIconButton";
import { IconChevronLeft } from "../components/Icons";
import FormActions from "../components/FormActions";
import ConfirmDialog from "../components/ConfirmDialog";
import { useBackHandler } from "../lib/backButton";
import { deleteInduction, deleteInductionGroup, listInductions, saveInduction, saveInductionGroup } from "../db/db";
import { DUE_COLOURS, bySoonest, dayString, dueStage, dueText, groupSoonest, usesGroup, type Induction, type InductionGroup } from "../lib/inductions";

// Settings → Site inductions (see lib/inductions). Groups first, soonest
// due at the top: each shows its own code (if it has one) and its sites;
// sites in no group come last. Each code has a Copy button, and its due
// date changes colour as it gets closer.

type SiteDraft = { kind: "site"; id?: string; createdAt?: number; name: string; code: string; expires: string; noExpiry: boolean; groupId?: string; newGroup: string | null; useGroup: boolean };
type GroupDraft = { kind: "group"; id?: string; createdAt?: number; colour?: string; name: string; code: string; expires: string; noExpiry: boolean };
type Draft = SiteDraft | GroupDraft;

const yearOn = () => {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return dayString(d);
};
const newDraft = (kind: "site" | "group"): Draft =>
  kind === "site" ? { kind, name: "", code: "", expires: yearOn(), noExpiry: false, newGroup: null, useGroup: true } : { kind, name: "", code: "", expires: yearOn(), noExpiry: false };

// copies with the web clipboard, or the older way where that's refused
async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    // fall through
  }
  const t = document.createElement("textarea");
  t.value = text;
  t.setAttribute("readonly", "");
  t.style.position = "fixed";
  t.style.opacity = "0";
  document.body.appendChild(t);
  t.select();
  try {
    document.execCommand("copy");
  } finally {
    t.remove();
  }
}

const MONO = "ui-monospace, 'SF Mono', Menlo, Consolas, monospace";
const inputStyle: CSSProperties = { background: "var(--panel-2)", border: "1px solid var(--border)", borderRadius: 12, padding: "12px 14px", color: "var(--text)", fontSize: 15, fontWeight: 600, outline: "none", width: "100%", minWidth: 0 };
const labelStyle: CSSProperties = { fontSize: 12, fontWeight: 700, color: "var(--muted)" };

function DueBadge({ expires }: { expires?: string }) {
  const c = DUE_COLOURS[dueStage(expires)];
  return (
    <span data-testid="due" data-stage={dueStage(expires)} style={{ flexShrink: 0, fontSize: 11.5, fontWeight: 800, padding: "3px 8px", borderRadius: 8, whiteSpace: "nowrap", color: c, background: `${c}29` }}>
      {dueText(expires)}
    </span>
  );
}

function CodeLine({ code, copied, onCopy }: { code: string; copied: boolean; onCopy: () => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span data-testid="code" style={{ flexGrow: 1, minWidth: 0, fontFamily: MONO, fontSize: 15, fontWeight: 700, letterSpacing: ".02em", background: "var(--panel-2)", borderRadius: 9, padding: "7px 10px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", userSelect: "text" }}>{code}</span>
      <button
        type="button"
        aria-label={`Copy ${code}`}
        onClick={(e) => {
          e.stopPropagation();
          onCopy();
        }}
        style={{ flexShrink: 0, height: 34, borderRadius: 9, border: "none", padding: "0 12px", display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 800, background: copied ? "var(--panel-2)" : "var(--accent)", color: copied ? "var(--accent)" : "var(--accent-text)" }}
      >
        {copied ? (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5 9-10" /></svg>
        ) : (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>
        )}
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

function Switch({ on }: { on: boolean }) {
  return (
    <span style={{ width: 36, height: 22, borderRadius: 11, flexShrink: 0, position: "relative", background: on ? "var(--accent)" : "var(--panel)", border: `1px solid ${on ? "var(--accent)" : "var(--border)"}` }}>
      <span style={{ position: "absolute", top: 2, left: on ? 16 : 2, width: 16, height: 16, borderRadius: 8, background: on ? "var(--accent-text)" : "var(--muted)", transition: "left .15s" }} />
    </span>
  );
}

export default function Inductions() {
  const navigate = useNavigate();
  const [groups, setGroups] = useState<InductionGroup[] | null>(null);
  const [sites, setSites] = useState<Induction[]>([]);
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const timers = useRef<number[]>([]);

  async function load() {
    const all = await listInductions();
    setGroups(all.groups);
    setSites(all.sites);
  }
  useEffect(() => {
    void load();
    const t = timers.current;
    return () => t.forEach(clearTimeout);
  }, []);

  useBackHandler(() => {
    if (confirmDelete) {
      setConfirmDelete(false);
      return true;
    }
    if (draft) {
      setDraft(null);
      return true;
    }
    return false;
  });

  function say(text: string) {
    setToast(text);
    timers.current.push(window.setTimeout(() => setToast((t) => (t === text ? null : t)), 1600));
  }

  async function copy(key: string, code: string) {
    await copyText(code);
    setCopied(key);
    say(`Copied ${code}`);
    timers.current.push(window.setTimeout(() => setCopied((k) => (k === key ? null : k)), 1600));
  }

  if (!groups) return null;
  const q = query.trim().toLowerCase();
  const siteMatches = (s: Induction) => !q || s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q);

  function openSite(s: Induction) {
    setDraft({ kind: "site", id: s.id, createdAt: s.createdAt, name: s.name, code: s.code, expires: s.expires ?? yearOn(), noExpiry: !s.expires && !s.useGroup, groupId: s.groupId, newGroup: null, useGroup: s.useGroup });
  }
  function openGroup(g: InductionGroup) {
    setDraft({ kind: "group", id: g.id, createdAt: g.createdAt, colour: g.colour, name: g.name, code: g.code, expires: g.expires ?? yearOn(), noExpiry: !!g.code && !g.expires });
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!draft) return;
    const name = draft.name.trim();
    const code = draft.code.trim();
    const expires = draft.noExpiry ? undefined : draft.expires || undefined;
    if (draft.kind === "group") {
      if (!name) return;
      await saveInductionGroup({ id: draft.id ?? crypto.randomUUID(), createdAt: draft.createdAt, colour: draft.colour, name, code, expires: code ? expires : undefined });
      say(draft.id ? "Saved" : "Group added");
    } else {
      let groupId = draft.groupId;
      const ng = (draft.newGroup ?? "").trim();
      if (ng) {
        const found = groups!.find((g) => g.name.toLowerCase() === ng.toLowerCase());
        groupId = found ? found.id : (await saveInductionGroup({ id: crypto.randomUUID(), name: ng, code: "" })).id;
      }
      const group = groups!.find((g) => g.id === groupId);
      const using = !!group?.code && draft.useGroup;
      if (!name || (!using && !code)) return;
      await saveInduction({ id: draft.id ?? crypto.randomUUID(), createdAt: draft.createdAt, name, groupId, useGroup: using, code: using ? "" : code, expires: using ? undefined : expires });
      if (groupId) setCollapsed((c) => new Set([...c].filter((k) => k !== groupId)));
      say(draft.id ? "Saved" : "Site added");
    }
    setDraft(null);
    await load();
  }

  async function remove() {
    if (!draft?.id) return;
    if (draft.kind === "group") await deleteInductionGroup(draft.id);
    else await deleteInduction(draft.id);
    say(draft.kind === "group" ? "Group deleted, its sites kept" : "Site deleted");
    setConfirmDelete(false);
    setDraft(null);
    await load();
  }

  // groups, soonest due first; then the sites in no group
  const sections: ReactNode[] = [];
  for (const g of [...groups].sort((a, b) => groupSoonest(a, sites, groups) - groupSoonest(b, sites, groups) || a.name.localeCompare(b.name))) {
    const all = sites.filter((s) => s.groupId === g.id);
    const groupHit = !!q && (g.name.toLowerCase().includes(q) || g.code.toLowerCase().includes(q));
    const shown = groupHit ? all : all.filter(siteMatches);
    if (q && !groupHit && !shown.length) continue;
    const solo = !all.length;
    const open = !collapsed.has(g.id) || !!q;
    const viaGroup = shown.filter((s) => usesGroup(s, groups)).sort((a, b) => a.name.localeCompare(b.name));
    const own = bySoonest(shown.filter((s) => !usesGroup(s, groups)), (s) => s.expires);
    const gone = (!!g.code && dueStage(g.expires) === "gone") || own.some((s) => dueStage(s.expires) === "gone");
    const name = (
      <>
        <span style={{ width: 8, height: 8, borderRadius: 4, flexShrink: 0, background: g.colour }} />
        <b style={{ fontSize: 12, fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.name}</b>
      </>
    );
    sections.push(
      <div key={g.id} data-testid="ind-group" style={{ flexShrink: 0, background: "var(--panel)", border: `1px solid ${gone ? "rgba(255,107,107,.45)" : "var(--border)"}`, borderRadius: 14, overflow: "hidden" }}>
        <div style={{ padding: "10px 12px 12px 14px", display: "flex", flexDirection: "column", gap: 8, background: `${g.colour}17` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {solo ? (
              <span style={{ display: "flex", alignItems: "center", gap: 8, flexGrow: 1, minWidth: 0, padding: "4px 0" }}>{name}</span>
            ) : (
              <button
                type="button"
                aria-expanded={open}
                onClick={() => setCollapsed((c) => (c.has(g.id) ? new Set([...c].filter((k) => k !== g.id)) : new Set([...c, g.id])))}
                style={{ display: "flex", alignItems: "center", gap: 8, flexGrow: 1, minWidth: 0, background: "none", border: "none", padding: "4px 0", color: "var(--text)", textAlign: "left" }}
              >
                {name}
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--muted-2)" }}>{all.length}</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--muted-2)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, transform: open ? undefined : "rotate(-90deg)", transition: "transform .15s" }}>
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>
            )}
            {g.code && <DueBadge expires={g.expires} />}
            <button type="button" onClick={() => openGroup(g)} style={{ background: "none", border: "none", color: "var(--accent)", fontSize: 12.5, fontWeight: 800, padding: "4px 2px" }}>
              Edit
            </button>
          </div>
          {g.code ? (
            <CodeLine code={g.code} copied={copied === g.id} onCopy={() => void copy(g.id, g.code)} />
          ) : (
            <button type="button" onClick={() => openGroup(g)} style={{ alignSelf: "flex-start", background: "none", border: "1px dashed var(--border)", color: "var(--muted)", borderRadius: 9, padding: "7px 10px", fontSize: 13, fontWeight: 700 }}>
              + Group code
            </button>
          )}
        </div>
        {open &&
          viaGroup.map((s) => (
            <button key={s.id} type="button" data-testid="ind-site" onClick={() => openSite(s)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "11px 12px 11px 14px", borderTop: "1px solid var(--border)", borderLeft: "none", borderRight: "none", borderBottom: "none", background: "none", color: "var(--text)", textAlign: "left" }}>
              <span style={{ flexGrow: 1, minWidth: 0, fontSize: 14.5, fontWeight: 700 }}>{s.name}</span>
              <span style={{ flexShrink: 0, fontSize: 12, fontWeight: 600, color: "var(--muted)" }}>Group code</span>
            </button>
          ))}
        {open &&
          own.map((s) => (
            <div key={s.id} data-testid="ind-site" role="button" tabIndex={0} onClick={() => openSite(s)} style={{ padding: "11px 12px 11px 14px", borderTop: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                <span style={{ flexGrow: 1, minWidth: 0, fontSize: 14.5, fontWeight: 700, lineHeight: 1.3 }}>
                  {s.name}
                  {g.code && <span style={{ marginLeft: 6, fontSize: 10.5, fontWeight: 800, letterSpacing: ".04em", textTransform: "uppercase", color: "#f7b977" }}>Own code</span>}
                </span>
                <DueBadge expires={s.expires} />
              </div>
              <CodeLine code={s.code} copied={copied === s.id} onCopy={() => void copy(s.id, s.code)} />
            </div>
          ))}
      </div>,
    );
  }
  const loose = bySoonest(sites.filter((s) => !s.groupId && siteMatches(s)), (s) => s.expires);
  if (loose.length) {
    sections.push(
      <div key="none" style={{ flexShrink: 0, fontSize: 11, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted-2)", margin: groups.length ? "6px 6px 0" : "0 6px" }}>
        No group
      </div>,
    );
    for (const s of loose) {
      const gone = dueStage(s.expires) === "gone";
      sections.push(
        <div key={s.id} data-testid="ind-site" role="button" tabIndex={0} onClick={() => openSite(s)} style={{ flexShrink: 0, background: "var(--panel)", border: `1px solid ${gone ? "rgba(255,107,107,.45)" : "var(--border)"}`, borderRadius: 14, padding: "12px 12px 12px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
            <span style={{ flexGrow: 1, minWidth: 0, fontSize: 15, fontWeight: 800, lineHeight: 1.3 }}>{s.name}</span>
            <DueBadge expires={s.expires} />
          </div>
          <CodeLine code={s.code} copied={copied === s.id} onCopy={() => void copy(s.id, s.code)} />
        </div>,
      );
    }
  }
  const empty = !groups.length && !sites.length;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", position: "relative" }}>
      <div style={{ flexShrink: 0, padding: "18px 18px 8px", display: "flex", alignItems: "center", gap: 12 }}>
        <RoundIconButton size={32} ariaLabel="Back" onClick={() => navigate("/settings")}>
          <IconChevronLeft size={20} strokeWidth={2.2} />
        </RoundIconButton>
        <div style={{ fontSize: 20, fontWeight: 800 }}>Site inductions</div>
      </div>
      <div style={{ flexGrow: 1, overflowY: "auto", padding: "0 16px calc(100px + var(--sa-bottom))", display: "flex", flexDirection: "column", gap: 10 }}>
        {empty ? (
          <div style={{ flexShrink: 0, textAlign: "center", color: "var(--muted)", fontSize: 13.5, fontWeight: 600, padding: "48px 12px" }}>No inductions yet. Tap + to add a site or a group.</div>
        ) : (
          <>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search sites, codes or groups" aria-label="Search" style={{ ...inputStyle, flexShrink: 0, fontWeight: 500, fontSize: 14, padding: "11px 14px" }} />
            {sections.length ? sections : <div style={{ flexShrink: 0, textAlign: "center", color: "var(--muted)", fontSize: 13, padding: "32px 0" }}>No inductions match “{query}”</div>}
          </>
        )}
      </div>
      <button
        type="button"
        aria-label="Add"
        onClick={() => setDraft(newDraft("site"))}
        style={{ position: "absolute", right: 20, bottom: "calc(26px + var(--sa-bottom))", width: 56, height: 56, borderRadius: 28, border: "none", background: "var(--accent)", color: "var(--accent-text)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 6px 18px rgba(0,0,0,.4)" }}
      >
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
      </button>
      {toast && (
        <div role="status" style={{ position: "absolute", left: "50%", bottom: "calc(96px + var(--sa-bottom))", transform: "translateX(-50%)", background: "#e8eef3", color: "#071b2c", borderRadius: 20, padding: "9px 16px", fontSize: 13, fontWeight: 800, whiteSpace: "nowrap", zIndex: 4 }}>
          {toast}
        </div>
      )}

      {draft && <Sheet draft={draft} setDraft={setDraft} groups={groups} sites={sites} onSave={save} onDelete={() => setConfirmDelete(true)} />}
      {confirmDelete && draft && (
        <div style={{ position: "absolute", inset: 0, zIndex: 6 }}>
          <ConfirmDialog
            title={draft.kind === "group" ? "Delete this group?" : "Delete this site?"}
            message={draft.kind === "group" ? "Its sites are kept, out of the group. Sites that used the group's code keep a copy of it." : `${draft.name || "This site"} and its induction number go from this phone.`}
            onCancel={() => setConfirmDelete(false)}
            onConfirm={() => void remove()}
          />
        </div>
      )}
    </div>
  );
}

function Sheet({ draft, setDraft, groups, sites, onSave, onDelete }: { draft: Draft; setDraft: (d: Draft | null) => void; groups: InductionGroup[]; sites: Induction[]; onSave: (e: FormEvent) => void; onDelete: () => void }) {
  const set = (patch: Partial<SiteDraft> & Partial<GroupDraft>) => setDraft({ ...draft, ...patch } as Draft);
  const adding = !draft.id;
  const group = draft.kind === "site" ? groups.find((g) => g.id === draft.groupId) : undefined;
  const canUse = draft.kind === "site" && draft.newGroup === null && !!group?.code;
  const using = canUse && draft.kind === "site" && draft.useGroup;
  const groupSites = draft.kind === "group" && draft.id ? sites.filter((s) => s.groupId === draft.id).length : 0;
  const chip = (pressed: boolean): CSSProperties => ({
    border: `1px ${pressed ? "solid" : "solid"} ${pressed ? "var(--accent)" : "var(--border)"}`,
    background: pressed ? "rgba(var(--accent-rgb), .16)" : "var(--panel-2)",
    color: pressed ? "var(--accent)" : "var(--text)",
    borderRadius: 18,
    padding: "7px 12px",
    fontSize: 13,
    fontWeight: 700,
    display: "flex",
    alignItems: "center",
    gap: 6,
  });

  const codeFields = (label: string) => (
    <>
      <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={labelStyle}>{label}</span>
        <input value={draft.code} onChange={(e) => set({ code: e.target.value })} autoCapitalize="characters" autoCorrect="off" spellCheck={false} placeholder="e.g. MIR-883120" style={{ ...inputStyle, fontFamily: MONO }} />
      </label>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={labelStyle}>Expires</span>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <input type="date" aria-label="Expires" value={draft.expires} disabled={draft.noExpiry} onChange={(e) => set({ expires: e.target.value })} style={{ ...inputStyle, flexGrow: 1, colorScheme: "dark", opacity: draft.noExpiry ? 0.4 : 1 }} />
          <button type="button" role="switch" aria-checked={draft.noExpiry} onClick={() => set({ noExpiry: !draft.noExpiry })} style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", color: "var(--muted)", fontSize: 13, fontWeight: 700, whiteSpace: "nowrap" }}>
            <Switch on={draft.noExpiry} />
            None
          </button>
        </div>
        {!draft.noExpiry && draft.expires && <span style={{ fontSize: 12, fontWeight: 700, color: DUE_COLOURS[dueStage(draft.expires)] }}>{dueText(draft.expires)}</span>}
      </div>
    </>
  );

  return (
    <div className="sheet-backdrop" style={{ position: "absolute", inset: 0, background: "rgba(10,11,13,0.6)", display: "flex", alignItems: "flex-end", zIndex: 5 }} onClick={() => setDraft(null)}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={onSave}
        className="sheet-panel"
        autoComplete="off"
        style={{ width: "100%", maxHeight: "92%", overflowY: "auto", background: "var(--panel)", borderRadius: "20px 20px 0 0", padding: "22px 20px calc(26px + var(--sa-bottom))", display: "flex", flexDirection: "column", gap: 14 }}
      >
        {adding ? (
          <div role="group" aria-label="Add a site or a group" style={{ display: "flex", background: "var(--panel-2)", borderRadius: 12, padding: 3, gap: 3 }}>
            {(["site", "group"] as const).map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={draft.kind === k}
                onClick={() => draft.kind !== k && setDraft({ ...newDraft(k), name: draft.name, code: draft.code, expires: draft.expires, noExpiry: draft.noExpiry } as Draft)}
                style={{ flex: 1, border: "none", borderRadius: 9, padding: "9px 0", fontSize: 14, fontWeight: 800, background: draft.kind === k ? "var(--accent)" : "none", color: draft.kind === k ? "var(--accent-text)" : "var(--muted)" }}
              >
                {k === "site" ? "Site" : "Group"}
              </button>
            ))}
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center" }}>
            <div style={{ fontSize: 16, fontWeight: 800, flexGrow: 1 }}>{draft.kind === "site" ? "Edit site" : "Edit group"}</div>
            <button type="button" onClick={onDelete} style={{ background: "none", border: "none", color: "#ff6b6b", fontSize: 13, fontWeight: 700 }}>
              Delete
            </button>
          </div>
        )}
        {draft.kind === "group" && groupSites > 0 && <div style={{ fontSize: 12, color: "var(--muted)", marginTop: -8 }}>{groupSites} {groupSites === 1 ? "site" : "sites"}</div>}

        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={labelStyle}>{draft.kind === "site" ? "Site" : "Group"}</span>
          <input value={draft.name} onChange={(e) => set({ name: e.target.value })} placeholder={draft.kind === "site" ? "e.g. Barangaroo Tower 2" : "e.g. Mirvac"} style={inputStyle} />
        </label>

        {draft.kind === "site" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={labelStyle}>Group</span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <button type="button" aria-pressed={!draft.groupId && draft.newGroup === null} onClick={() => set({ groupId: undefined, newGroup: null })} style={chip(!draft.groupId && draft.newGroup === null)}>
                None
              </button>
              {groups.map((g) => (
                <button key={g.id} type="button" aria-pressed={draft.groupId === g.id && draft.newGroup === null} onClick={() => set({ groupId: g.id, newGroup: null, useGroup: true })} style={chip(draft.groupId === g.id && draft.newGroup === null)}>
                  <span style={{ width: 8, height: 8, borderRadius: 4, background: g.colour }} />
                  {g.name}
                </button>
              ))}
              {draft.newGroup === null && (
                <button type="button" onClick={() => set({ groupId: undefined, newGroup: "" })} style={{ ...chip(false), borderStyle: "dashed", color: "var(--muted)" }}>
                  + New group
                </button>
              )}
            </div>
            {draft.newGroup !== null && <input autoFocus aria-label="New group" value={draft.newGroup} onChange={(e) => set({ newGroup: e.target.value })} placeholder="Group name, e.g. Lendlease" style={inputStyle} />}
          </div>
        )}

        {canUse && group && draft.kind === "site" && (
          <button type="button" role="switch" aria-checked={draft.useGroup} onClick={() => set({ useGroup: !draft.useGroup })} style={{ display: "flex", alignItems: "center", gap: 12, background: "var(--panel-2)", border: "1px solid var(--border)", borderRadius: 12, padding: "11px 12px", textAlign: "left", color: "var(--text)" }}>
            <span style={{ flexGrow: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
              <b style={{ fontSize: 14 }}>Use {group.name}'s code</b>
              <span style={{ fontSize: 12, color: "var(--muted)", fontFamily: MONO }}>{group.code}</span>
            </span>
            <Switch on={draft.useGroup} />
          </button>
        )}

        {draft.kind === "group" ? codeFields("Group induction number") : !using && codeFields(canUse ? "This site's own induction number" : "Induction number")}

        <FormActions onCancel={() => setDraft(null)} />
      </form>
    </div>
  );
}
