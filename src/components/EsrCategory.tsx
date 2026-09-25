import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { ESR_SECTIONS, esrGroup, esrItem, esrSection, isSectionOnly, sectionItems, type EsrItem } from "../lib/esrCategories";
import type { CategorySuggestion } from "../lib/esrSuggest";
import { useBackHandler } from "../lib/backButton";
import { categoryKeywords } from "../lib/esrKeywords";
import { IconChevronRight } from "./Icons";

// ESR category pieces shared by the finding screen and the Categorise
// screen: the tappable category button, the suggestions grouped under their
// section, the "Browse all" sheet and the picked-category card.

// Taps here shouldn't blur a focused Note first: the blur re-expands the
// photo and shoves the button away before the tap lands (same fix as the
// defect type button).
const keepLayout = (e: { preventDefault: () => void }) => e.preventDefault();
const blurActive = () => (document.activeElement as HTMLElement | null)?.blur();

function CodeBadge({ code }: { code: string }) {
  return (
    <span style={{ flexShrink: 0, minWidth: 30, textAlign: "center", fontSize: 11, fontWeight: 800, color: "#04213a", background: "#99ccff", borderRadius: 6, padding: "2px 5px", lineHeight: 1.3 }}>
      {code}
    </span>
  );
}

function CategoryButton({ item, best, active, onPick, children }: { item: EsrItem; best?: boolean; active?: boolean; onPick: (code: string) => void; children?: ReactNode }) {
  return (
    <button
      type="button"
      onPointerDown={keepLayout}
      onClick={() => {
        blurActive();
        onPick(item.code);
      }}
      style={{ ...chipStyle, borderColor: best || active ? "var(--accent)" : "var(--border-strong)", background: active ? "rgba(46,196,182,0.14)" : "var(--panel-2)" }}
    >
      <CodeBadge code={item.code} />
      <span style={wrapStyle}>{children ?? item.name}</span>
      {best && <span style={{ flexShrink: 0, fontSize: 9, fontWeight: 800, letterSpacing: "0.06em", color: "var(--accent)" }}>BEST</span>}
    </button>
  );
}

function SectionHeading({ children }: { children: ReactNode }) {
  return <div style={sectionHeadingStyle}>{children}</div>;
}

// 6.3 over 6.3.1–6.3.4: a yellow label (like its yellow row in the
// reports), text only — 6.3 itself can't be picked.
function GroupLabel({ item }: { item: EsrItem }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 8, background: "rgba(255,255,204,0.10)", border: "1px solid rgba(255,255,204,0.28)", borderRadius: 9, padding: "7px 10px", fontSize: 12, fontWeight: 700, color: "#efe6a6", lineHeight: 1.35 }}>
      <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 800, color: "#3a3200", background: "#ffffcc", borderRadius: 6, padding: "2px 6px" }}>{item.code}</span>
      <span>{item.name}</span>
    </div>
  );
}

// Lists items with any that sit under a heading (6.3.x) gathered where
// the first of them appears, under that heading's yellow label and
// indented; everything else stays in the order given.
function WithGroupLabels<T>({ items, code, render }: { items: T[]; code: (t: T) => string; render: (t: T) => ReactNode }) {
  const out: ReactNode[] = [];
  const done = new Set<T>();
  for (const it of items) {
    if (done.has(it)) continue;
    const group = esrGroup(code(it));
    if (!group) {
      done.add(it);
      out.push(render(it));
      continue;
    }
    const members = items.filter((m) => !done.has(m) && esrGroup(code(m))?.code === group.code);
    members.forEach((m) => done.add(m));
    out.push(
      <div key={`group-${group.code}`} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <GroupLabel item={group} />
        <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingLeft: 12 }}>{members.map(render)}</div>
      </div>,
    );
  }
  return <>{out}</>;
}

// Suggestions laid out like the Browse sheet: each section's name in grey
// with its suggested items under it. The section holding the best match
// comes first; items keep their ranking within a section. Items that are
// a whole section on their own ("13 Miscellaneous") go under "Other".
export function EsrSuggestionList({ suggestions, current, onPick }: { suggestions: CategorySuggestion[]; current?: string; onPick: (code: string) => void }) {
  const groups: { key: string; heading: string; items: CategorySuggestion[] }[] = [];
  for (const s of suggestions) {
    const section = esrSection(s.code);
    if (!section) continue;
    const key = isSectionOnly(s.code) ? "other" : section.code;
    let group = groups.find((g) => g.key === key);
    if (!group) {
      group = { key, heading: key === "other" ? "Other" : `${section.code} · ${section.name}`, items: [] };
      groups.push(group);
    }
    group.items.push(s);
  }
  const best = suggestions[0]?.matched ? suggestions[0].code : undefined;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {groups.map((g) => (
        <div key={g.key} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <SectionHeading>{g.heading}</SectionHeading>
          <WithGroupLabels
            items={g.items}
            code={(s) => s.code}
            render={(s) => <CategoryButton key={s.code} item={esrItem(s.code)!} best={s.code === best} active={s.code === current} onPick={onPick} />}
          />
        </div>
      ))}
    </div>
  );
}

// The picked category: code, name, its section and (for 6.3.x, in
// yellow) 6.3; ✕ to clear.
export function EsrSelectedCard({ code, onClear }: { code: string; onClear: () => void }) {
  const item = esrItem(code);
  const section = esrSection(code);
  const group = esrGroup(code);
  if (!item || !section) return null;
  return (
    <div style={{ ...chipStyle, background: "rgba(46,196,182,0.14)", borderColor: "var(--accent)", padding: "10px 10px 10px 12px", cursor: "default" }}>
      <CodeBadge code={code} />
      <span style={{ flexGrow: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2, textAlign: "left" }}>
        <span style={{ fontSize: 13, fontWeight: 800, lineHeight: 1.3 }}>{item.name}</span>
        {!isSectionOnly(code) && (
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", lineHeight: 1.35 }}>
            {section.code} · {section.name}
          </span>
        )}
        {group && (
          <span style={{ fontSize: 11, fontWeight: 600, color: "#e8dc8f", lineHeight: 1.35 }}>
            {group.code} · {group.name}
          </span>
        )}
      </span>
      <button
        type="button"
        aria-label="Clear ESR category"
        onPointerDown={keepLayout}
        onClick={() => {
          blurActive();
          onClear();
        }}
        style={{ flexShrink: 0, width: 26, height: 26, borderRadius: "50%", border: "none", background: "var(--border-strong)", color: "var(--muted)", fontSize: 12, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}
      >
        ✕
      </button>
    </div>
  );
}

export function EsrLink({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onPointerDown={keepLayout}
      onClick={() => {
        blurActive();
        onClick();
      }}
      style={{ background: "none", border: "none", padding: "4px 6px", fontSize: 13, fontWeight: 800, color: "var(--accent)" }}
    >
      {children}
    </button>
  );
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9.]+/g, " ").trim();

function Highlight({ text, query }: { text: string; query: string }) {
  const at = query ? text.toLowerCase().indexOf(query) : -1;
  if (at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <span style={{ color: "var(--accent)" }}>{text.slice(at, at + query.length)}</span>
      {text.slice(at + query.length)}
    </>
  );
}

// "Browse all": the full list, with a search box. Searching matches item
// names, numbers and their keywords ("EWIS" finds 8.1). Without a search,
// tap a section to open it.
export function EsrBrowseSheet({ current, onPick, onClose }: { current?: string; onPick: (code: string | undefined) => void; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | undefined>(() => esrSection(current)?.code);
  // Back closes the list AND does what back normally does on the screen
  // underneath (e.g. save the finding and go to the list), so it never
  // costs an extra press when you're moving fast.
  useBackHandler(() => {
    onClose();
    return false;
  });

  const q = query.trim().toLowerCase();
  const results = useMemo(() => {
    if (!q) return [];
    const nq = norm(q);
    return ESR_SECTIONS.map((s) => ({
      section: s,
      items: sectionItems(s).filter(
        (i) => i.code === q || i.code.startsWith(`${q}.`) || i.name.toLowerCase().includes(q) || categoryKeywords(i.code).some((k) => norm(k.text).includes(nq)),
      ),
    })).filter((r) => r.items.length);
  }, [q]);

  return (
    <div className="sheet-backdrop" style={{ position: "absolute", inset: 0, background: "rgba(10,11,13,0.6)", display: "flex", alignItems: "flex-end", zIndex: 20 }} onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="sheet-panel"
        style={{ width: "100%", maxHeight: "86%", background: "var(--panel)", borderRadius: "20px 20px 0 0", padding: "20px 18px 0", display: "flex", flexDirection: "column", gap: 10 }}
      >
        <div style={{ fontSize: 16, fontWeight: 800 }}>ESR category</div>
        <input
          type="search"
          placeholder="Search categories"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ background: "var(--panel-2)", border: "1px solid rgba(46,196,182,0.28)", borderRadius: 12, padding: "12px 14px", fontSize: 14, fontWeight: 500, color: "var(--text)", outline: "none" }}
        />
        <div style={{ overflowY: "auto", display: "flex", flexDirection: "column", gap: 6, paddingBottom: "calc(20px + env(safe-area-inset-bottom))" }}>
          {q ? (
            results.length ? (
              results.map(({ section, items }) => (
                <div key={section.code} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <SectionHeading>
                    {section.code} · {section.name}
                  </SectionHeading>
                  <WithGroupLabels
                    items={items}
                    code={(i) => i.code}
                    render={(i) => (
                      <CategoryButton key={i.code} item={i} active={i.code === current} onPick={onPick}>
                        <Highlight text={i.name} query={q} />
                      </CategoryButton>
                    )}
                  />
                </div>
              ))
            ) : (
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--muted)", padding: "8px 2px" }}>No categories match “{query.trim()}”.</div>
            )
          ) : (
            ESR_SECTIONS.map((s) =>
              s.items.length ? (
                <div key={s.code} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <button
                    type="button"
                    onClick={() => setOpen(open === s.code ? undefined : s.code)}
                    style={{ ...chipStyle, background: "none", borderColor: open === s.code ? "var(--accent)" : "var(--border)" }}
                  >
                    <CodeBadge code={s.code} />
                    <span style={wrapStyle}>{s.name}</span>
                    <IconChevronRight size={16} color="var(--muted-2)" style={{ flexShrink: 0, transform: open === s.code ? "rotate(90deg)" : undefined, transition: "transform 150ms" }} />
                  </button>
                  {open === s.code && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingLeft: 14 }}>
                      <WithGroupLabels
                        items={sectionItems(s)}
                        code={(i) => i.code}
                        render={(i) => <CategoryButton key={i.code} item={i} active={i.code === current} onPick={onPick} />}
                      />
                    </div>
                  )}
                </div>
              ) : (
                <CategoryButton key={s.code} item={s} active={s.code === current} onPick={onPick} />
              ),
            )
          )}
          <button type="button" onClick={() => onPick(undefined)} style={{ background: "none", border: "none", padding: "10px 0 0", fontSize: 13, fontWeight: 700, color: "var(--muted)" }}>
            {current ? "Clear (Uncategorised)" : "Uncategorised"}
          </button>
        </div>
      </div>
    </div>
  );
}

const chipStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  width: "100%",
  background: "var(--panel-2)",
  border: "1px solid var(--border-strong)",
  borderRadius: 11,
  padding: "9px 11px",
  fontSize: 13,
  fontWeight: 700,
  // Manrope's space is narrow at this size
  wordSpacing: "0.1em",
  color: "var(--text)",
};

const sectionHeadingStyle: CSSProperties = {
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: "0.05em",
  textTransform: "uppercase",
  color: "var(--muted-2)",
  padding: "4px 2px 0",
  lineHeight: 1.4,
};

// long names ("6.3.3 Fire mode operation of dampers for outside air…")
// wrap onto more lines rather than running off the screen
const wrapStyle: CSSProperties = { flexGrow: 1, minWidth: 0, textAlign: "left", lineHeight: 1.35, overflowWrap: "anywhere" };
