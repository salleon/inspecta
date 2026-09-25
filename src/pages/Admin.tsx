import { useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Share } from "@capacitor/share";
import { Capacitor } from "@capacitor/core";
import RoundIconButton from "../components/RoundIconButton";
import ConfirmDialog from "../components/ConfirmDialog";
import { IconChevronLeft, IconChevronRight } from "../components/Icons";
import { ESR_SECTIONS, esrItem, sectionItems } from "../lib/esrCategories";
import {
  addKeyword,
  applyKeywordFile,
  categoryKeywords,
  editedCount,
  isEdited,
  keywordFile,
  keywordFileName,
  readKeywordFile,
  removeKeyword,
  resetAllKeywords,
  resetCategory,
  useKeywordVersion,
  type KeywordKind,
} from "../lib/esrKeywords";
import { explainCategories, forgetAllLearned, forgetLearned, learnedKeywords } from "../lib/esrSuggest";
import { checkPin, checkRecoveryCode, isAdminUnlocked, recoveryCode, setPin, unlockAdmin } from "../lib/adminPin";
import { writeBlobToCache } from "../lib/cacheFile";
import { useBackHandler } from "../lib/backButton";

// Settings → Admin: PIN-protected tools for the person who looks after the
// app. For now, tuning the ESR keywords that drive the category
// suggestions (see lib/esrKeywords). Routes:
//   /admin                 PIN, then the admin menu
//   /admin/keywords        every category, searchable
//   /admin/keywords/:code  one category's keywords, add / remove, try it
//   /admin/test            type a note, see the top 5 and why
//   /admin/learned         words this phone has learnt from picks

export default function Admin() {
  const [unlocked, setUnlocked] = useState(isAdminUnlocked);
  const { pathname } = useLocation();
  // re-render on any keyword change, so counts and lists stay current
  useKeywordVersion();

  if (!unlocked) {
    return (
      <PinScreen
        onUnlock={() => {
          unlockAdmin();
          setUnlocked(true);
        }}
      />
    );
  }
  const code = /^\/admin\/keywords\/(.+)$/.exec(pathname)?.[1];
  if (code && esrItem(decodeURIComponent(code))) return <KeywordDetail code={decodeURIComponent(code)} />;
  if (pathname === "/admin/keywords") return <KeywordList />;
  if (pathname === "/admin/test") return <Tester />;
  if (pathname === "/admin/learned") return <Learned />;
  return <AdminHome />;
}

// ---- shared bits ----

function Screen({ title, back, children, scroll = true }: { title: string; back: string; children: ReactNode; scroll?: boolean }) {
  const navigate = useNavigate();
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", position: "relative" }}>
      <div style={{ flexShrink: 0, padding: "18px 18px 12px", display: "flex", alignItems: "center", gap: 12 }}>
        <RoundIconButton size={32} ariaLabel="Back" onClick={() => navigate(back)}>
          <IconChevronLeft size={20} strokeWidth={2.2} />
        </RoundIconButton>
        <div style={{ fontSize: 15, fontWeight: 800 }}>{title}</div>
      </div>
      <div style={{ flexGrow: 1, overflowY: scroll ? "auto" : "hidden", padding: "4px 18px calc(24px + env(safe-area-inset-bottom))", display: "flex", flexDirection: "column", gap: 12 }}>
        {children}
      </div>
    </div>
  );
}

function Row({ title, hint, onClick, danger, chevron = true }: { title: string; hint?: string; onClick: () => void; danger?: boolean; chevron?: boolean }) {
  return (
    <button type="button" onClick={onClick} style={{ ...rowStyle, borderColor: danger ? "rgba(224,122,122,0.4)" : "var(--border)" }}>
      <span style={{ flexGrow: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: danger ? "#e07a7a" : "var(--text)" }}>{title}</span>
        {hint && <span style={hintStyle}>{hint}</span>}
      </span>
      {chevron && <IconChevronRight color="var(--muted)" />}
    </button>
  );
}

function Code({ code, big }: { code: string; big?: boolean }) {
  return (
    <span style={{ flexShrink: 0, minWidth: 30, textAlign: "center", fontSize: big ? 13 : 11, fontWeight: 800, color: "#04213a", background: "#99ccff", borderRadius: 6, padding: big ? "3px 7px" : "2px 5px", lineHeight: 1.3 }}>
      {code}
    </span>
  );
}

async function shareBlob(blob: Blob, filename: string, title: string) {
  if (Capacitor.isNativePlatform()) {
    const uri = await writeBlobToCache(blob, filename);
    await Share.share({ title, url: uri });
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// the user cancelling a share sheet isn't an error
const cancelled = (err: unknown) => err instanceof Error && /cancell?ed/i.test(err.message);

// ---- PIN ----

type PinStep = { kind: "enter" } | { kind: "recovery" } | { kind: "new"; first?: string };

// Also used to change the PIN (starting at "new").
function PinScreen({ onUnlock, start = { kind: "enter" }, onDone, back = "/" }: { onUnlock?: () => void; start?: PinStep; onDone?: () => void; back?: string }) {
  const [step, setStep] = useState<PinStep>(start);
  const [pin, setPinDigits] = useState("");
  const [message, setMessage] = useState("");
  const [recovery, setRecovery] = useState("");

  function press(d: string) {
    setMessage("");
    const next = d === "del" ? pin.slice(0, -1) : pin + d;
    if (next.length < 4) {
      setPinDigits(next);
      return;
    }
    setPinDigits("");
    if (step.kind === "enter") {
      if (checkPin(next)) onUnlock?.();
      else setMessage("Wrong PIN");
    } else if (step.kind === "new") {
      if (!step.first) {
        setStep({ kind: "new", first: next });
      } else if (step.first === next) {
        setPin(next);
        if (onDone) onDone();
        else onUnlock?.();
      } else {
        setStep({ kind: "new" });
        setMessage("PINs didn't match. Try again.");
      }
    }
  }

  const heading = step.kind === "enter" ? "Enter admin PIN" : step.kind === "new" ? (step.first ? "Enter it again" : "Choose a new PIN") : "Enter your recovery code";

  return (
    <Screen title="Admin" back={back} scroll={false}>
      <div style={{ flexGrow: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
        <div style={{ fontSize: 18, fontWeight: 800 }}>{heading}</div>
        {step.kind === "recovery" ? (
          <>
            <div style={{ ...hintStyle, textAlign: "center", maxWidth: 280 }}>Enter your master recovery code, or the code you emailed yourself from this phone.</div>
            <input
              value={recovery}
              onChange={(e) => {
                setRecovery(e.target.value);
                setMessage("");
              }}
              placeholder="XXXX-XXXX"
              autoCapitalize="characters"
              aria-label="Recovery code"
              style={{ ...fieldStyle, width: 220, textAlign: "center", fontSize: 18, fontWeight: 800, letterSpacing: "0.08em" }}
            />
            <button
              type="button"
              onClick={async () => {
                if (await checkRecoveryCode(recovery)) {
                  setStep({ kind: "new" });
                  setRecovery("");
                } else setMessage("That code isn't right.");
              }}
              style={{ ...primaryButton, width: 220 }}
            >
              Continue
            </button>
          </>
        ) : (
          <div style={{ display: "flex", gap: 14 }}>
            {[0, 1, 2, 3].map((i) => (
              <span key={i} style={{ width: 14, height: 14, borderRadius: "50%", border: "2px solid var(--accent)", background: i < pin.length ? "var(--accent)" : "transparent" }} />
            ))}
          </div>
        )}
        <div style={{ fontSize: 12, fontWeight: 700, color: "#e07a7a", minHeight: 16 }}>{message}</div>
        {step.kind === "enter" && (
          <button type="button" onClick={() => setStep({ kind: "recovery" })} style={linkButton}>
            Forgot PIN?
          </button>
        )}
      </div>
      {step.kind !== "recovery" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"].map((k, i) =>
            k ? (
              <button key={i} type="button" aria-label={k === "del" ? "Delete" : k} onClick={() => press(k)} style={keyStyle}>
                {k === "del" ? "⌫" : k}
              </button>
            ) : (
              <span key={i} />
            ),
          )}
        </div>
      )}
    </Screen>
  );
}

// ---- admin menu ----

function AdminHome() {
  const navigate = useNavigate();
  const fileInput = useRef<HTMLInputElement>(null);
  const [changingPin, setChangingPin] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [loaded, setLoaded] = useState<{ edits: ReturnType<typeof readKeywordFile>; name: string } | null>(null);
  const [notice, setNotice] = useState("");
  // Android back while choosing a new PIN cancels that, not the menu
  useBackHandler(() => {
    if (!changingPin) return false;
    setChangingPin(false);
    return true;
  });

  if (changingPin) {
    return (
      <PinScreen
        start={{ kind: "new" }}
        back="/admin"
        onDone={() => {
          setChangingPin(false);
          setNotice("PIN changed.");
        }}
      />
    );
  }

  const edited = editedCount();

  async function emailRecovery() {
    const code = recoveryCode();
    const text = `Inspecta admin recovery code: ${code}\n\nIf you forget the admin PIN, open Settings → Admin, tap "Forgot PIN?" and enter this code to choose a new PIN. It only works on the phone it came from.`;
    try {
      if (Capacitor.isNativePlatform()) await Share.share({ title: "Inspecta admin recovery code", text });
      else window.location.href = `mailto:?subject=${encodeURIComponent("Inspecta admin recovery code")}&body=${encodeURIComponent(text)}`;
    } catch (err) {
      if (!cancelled(err)) alert("Couldn't open the share menu. Please try again.");
    }
  }

  async function shareKeywords() {
    try {
      await shareBlob(keywordFile(), keywordFileName(), "Inspecta keyword changes");
    } catch (err) {
      if (!cancelled(err)) alert("Couldn't share the keyword file. Please try again.");
    }
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    try {
      setLoaded({ edits: readKeywordFile(await file.text()), name: file.name });
    } catch {
      alert("That isn't an Inspecta keyword file.");
    }
  }

  return (
    <Screen title="Admin" back="/">
      {notice && <div style={{ fontSize: 13, fontWeight: 700, color: "var(--accent)" }}>{notice}</div>}
      <Row title="ESR keywords" hint={`Words that suggest each category. ${edited ? `${edited} edited on this phone.` : "Built-in list, no changes."}`} onClick={() => navigate("/admin/keywords")} />
      <Row title="Learned keywords" hint="Words this phone has picked up from your category choices. Remove a wrong one, or make a good one a keyword." onClick={() => navigate("/admin/learned")} />
      <Row title="Test a note" hint="Type a note, see the top 5 and why." onClick={() => navigate("/admin/test")} />
      <Row title="Share keyword changes" hint="Send your changes as a file, to load on other phones or to have them built into the app." onClick={shareKeywords} />
      <Row title="Load keyword file" hint="Load changes shared from another phone." onClick={() => fileInput.current?.click()} />
      <input
        ref={fileInput}
        type="file"
        accept=".json,application/json"
        style={{ display: "none" }}
        onChange={(e) => {
          void onFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <Row title="Change PIN" hint="Pick a new 4-digit admin PIN." onClick={() => setChangingPin(true)} />
      <Row title="Email recovery code" hint="Send yourself the code that resets the PIN if you forget it." onClick={emailRecovery} />
      <Row title="Reset keywords" hint="Undo all keyword changes on this phone, back to the built-in list." onClick={() => setConfirmReset(true)} danger chevron={false} />
      <div style={{ ...hintStyle, padding: "4px 2px" }}>Changes here apply to this phone only.</div>

      {confirmReset && (
        <ConfirmDialog
          title="Reset keywords?"
          message="All keyword changes on this phone will be undone, back to the built-in list."
          confirmLabel="Reset"
          onCancel={() => setConfirmReset(false)}
          onConfirm={() => {
            resetAllKeywords();
            setConfirmReset(false);
            setNotice("Keywords reset.");
          }}
        />
      )}
      {loaded && (
        <ConfirmDialog
          title="Load keyword file?"
          message={`"${loaded.name}" changes ${Object.keys(loaded.edits).length} categor${Object.keys(loaded.edits).length === 1 ? "y" : "ies"}. It replaces the keyword changes on this phone.`}
          confirmLabel="Load"
          onCancel={() => setLoaded(null)}
          onConfirm={() => {
            applyKeywordFile(loaded.edits);
            setLoaded(null);
            setNotice("Keyword file loaded.");
          }}
        />
      )}
    </Screen>
  );
}

// ---- keywords ----

function KeywordList() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  return (
    <Screen title="ESR keywords" back="/admin">
      <input type="search" placeholder="Search categories or keywords" aria-label="Search categories or keywords" value={query} onChange={(e) => setQuery(e.target.value)} style={fieldStyle} />
      {ESR_SECTIONS.map((s) => {
        const items = sectionItems(s).filter(
          (i) => !q || i.code === q || i.code.startsWith(`${q}.`) || i.name.toLowerCase().includes(q) || categoryKeywords(i.code).some((k) => k.text.includes(q)),
        );
        if (!items.length) return null;
        return (
          <div key={s.code} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={sectionStyle}>
              {s.code} · {s.name}
            </div>
            {items.map((i) => {
              const n = categoryKeywords(i.code).length;
              return (
                <button key={i.code} type="button" onClick={() => navigate(`/admin/keywords/${encodeURIComponent(i.code)}`)} style={{ ...rowStyle, padding: "10px 12px", gap: 10 }}>
                  <Code code={i.code} />
                  <span style={{ flexGrow: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.35 }}>{i.name}</span>
                    <span style={hintStyle}>
                      {n} keyword{n === 1 ? "" : "s"}
                    </span>
                  </span>
                  {isEdited(i.code) && <span style={editedTag}>EDITED</span>}
                </button>
              );
            })}
          </div>
        );
      })}
    </Screen>
  );
}

const KINDS: { id: KeywordKind; label: string; title: string; hint: string }[] = [
  { id: "!", label: "Near-certain", title: "Near-certain", hint: "Wins almost whatever else the note says." },
  { id: "", label: "Normal", title: "Keywords", hint: "Normal matches. Phrases count for more than single words." },
  { id: "~", label: "Weak hint", title: "Weak hints", hint: "Words shared by several categories." },
];

function KeywordDetail({ code }: { code: string }) {
  const item = esrItem(code)!;
  const keywords = categoryKeywords(code);
  const [text, setText] = useState("");
  const [kind, setKind] = useState<KeywordKind>("");
  const [note, setNote] = useState("");

  return (
    <Screen title="Edit keywords" back="/admin/keywords">
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <Code code={code} big />
        <div style={{ fontSize: 15, fontWeight: 800, lineHeight: 1.35 }}>{item.name}</div>
      </div>
      {KINDS.map((k) => {
        const chips = keywords.filter((w) => w.kind === k.id);
        return (
          <div key={k.title} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={sectionStyle}>{k.title}</span>
              <span style={hintStyle}>{k.hint}</span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {chips.map((w) => (
                <span
                  key={w.text}
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, borderRadius: 999, padding: "5px 6px 5px 11px", fontSize: 12, fontWeight: 700, wordSpacing: "0.1em", background: w.builtIn ? "var(--panel-2)" : "rgba(46,196,182,0.16)", border: w.builtIn ? "1px solid var(--border-strong)" : "1px solid var(--accent)" }}
                >
                  {w.text}
                  <button type="button" aria-label={`Remove ${w.text}`} onClick={() => removeKeyword(code, w)} style={{ width: 20, height: 20, borderRadius: "50%", border: "none", background: "rgba(0,0,0,0.25)", color: "var(--text)", fontSize: 10, fontWeight: 800, padding: 0 }}>
                    ✕
                  </button>
                </span>
              ))}
              {!chips.length && <span style={hintStyle}>None</span>}
            </div>
          </div>
        );
      })}

      <div style={{ display: "flex", flexDirection: "column", gap: 8, borderTop: "1px solid var(--border)", paddingTop: 14 }}>
        <span style={sectionStyle}>Add a keyword</span>
        <input type="text" placeholder="e.g. FHR, hose reel cabinet" aria-label="New keyword" value={text} onChange={(e) => setText(e.target.value)} style={fieldStyle} />
        <div style={{ display: "flex", gap: 6 }}>
          {KINDS.map((k) => (
            <button
              key={k.label}
              type="button"
              aria-pressed={kind === k.id}
              onClick={() => setKind(k.id)}
              style={{ flex: 1, padding: "9px 0", borderRadius: 10, fontSize: 12, fontWeight: 800, background: kind === k.id ? "var(--accent)" : "var(--panel-2)", color: kind === k.id ? "var(--accent-text)" : "var(--text)", border: `1px solid ${kind === k.id ? "var(--accent)" : "var(--border-strong)"}` }}
            >
              {k.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          disabled={!text.trim()}
          onClick={() => {
            addKeyword(code, text, kind);
            setText("");
          }}
          style={{ ...primaryButton, opacity: text.trim() ? 1 : 0.5 }}
        >
          Add keyword
        </button>
        {isEdited(code) && (
          <button type="button" onClick={() => resetCategory(code)} style={linkButton}>
            Reset this category to built-in
          </button>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, borderTop: "1px solid var(--border)", paddingTop: 14 }}>
        <span style={sectionStyle}>Try it</span>
        <input type="text" placeholder="Type a sample note" aria-label="Sample note" value={note} onChange={(e) => setNote(e.target.value)} style={fieldStyle} />
        <Results note={note} highlight={code} />
      </div>
    </Screen>
  );
}

function Learned() {
  const [query, setQuery] = useState("");
  const [, refresh] = useState(0);
  const [confirmClear, setConfirmClear] = useState(false);
  const q = query.trim().toLowerCase();
  const all = learnedKeywords();
  const rows = all.filter((r) => !q || r.word.includes(q) || r.code === q || esrItem(r.code)?.name.toLowerCase().includes(q));
  return (
    <Screen title="Learned keywords" back="/admin">
      <div style={hintStyle}>
        Each time you pick a category, the words in that note count towards it. The more picks, the stronger. Changing or clearing a pick takes it back. Remove a word that points the wrong way, or tap <b style={{ color: "var(--text)" }}>Make keyword</b> to turn it into a proper keyword for that category.
      </div>
      <input type="search" placeholder="Search words or categories" aria-label="Search learned keywords" value={query} onChange={(e) => setQuery(e.target.value)} style={fieldStyle} />
      {!all.length && <div style={hintStyle}>Nothing learned yet. Pick categories on findings and words will appear here.</div>}
      {rows.map((r) => (
        <div key={`${r.stem}-${r.code}`} style={{ ...rowStyle, padding: "10px 12px", gap: 10 }}>
          <span style={{ flexGrow: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 14, fontWeight: 800 }}>{r.word}</span>
            <span style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
              <Code code={r.code} />
              <span style={{ ...hintStyle, color: "var(--text)" }}>{esrItem(r.code)?.name}</span>
            </span>
            <span style={hintStyle}>
              {r.count} pick{r.count === 1 ? "" : "s"}
            </span>
          </span>
          <span style={{ flexShrink: 0, display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
            <button
              type="button"
              onClick={() => {
                addKeyword(r.code, r.word, "");
                forgetLearned(r.stem, r.code);
                refresh((n) => n + 1);
              }}
              style={{ padding: "7px 10px", borderRadius: 9, background: "none", border: "1px solid var(--accent)", color: "var(--accent)", fontSize: 12, fontWeight: 800 }}
            >
              Make keyword
            </button>
            <button
              type="button"
              aria-label={`Remove ${r.word}`}
              onClick={() => {
                forgetLearned(r.stem, r.code);
                refresh((n) => n + 1);
              }}
              style={{ padding: "7px 10px", borderRadius: 9, background: "none", border: "1px solid var(--border-strong)", color: "var(--muted)", fontSize: 12, fontWeight: 700 }}
            >
              Remove
            </button>
          </span>
        </div>
      ))}
      {!!all.length && (
        <button type="button" onClick={() => setConfirmClear(true)} style={{ ...linkButton, color: "#e07a7a" }}>
          Forget everything learned
        </button>
      )}
      {confirmClear && (
        <ConfirmDialog
          title="Forget everything learned?"
          message="Suggestions go back to the keywords alone. Your keyword changes stay."
          confirmLabel="Forget"
          onCancel={() => setConfirmClear(false)}
          onConfirm={() => {
            forgetAllLearned();
            setConfirmClear(false);
          }}
        />
      )}
    </Screen>
  );
}

function Tester() {
  const [note, setNote] = useState("");
  return (
    <Screen title="Test a note" back="/admin">
      <input type="text" placeholder="Type a sample note" aria-label="Sample note" value={note} onChange={(e) => setNote(e.target.value)} style={fieldStyle} />
      <div style={hintStyle}>Top 5 from the keywords (what each phone learns from its own picks comes on top of this). Tap one to edit its keywords.</div>
      <Results note={note} />
    </Screen>
  );
}

function Results({ note, highlight }: { note: string; highlight?: string }) {
  const navigate = useNavigate();
  if (!note.trim()) return null;
  const results = explainCategories(note);
  if (!results.length) return <div style={hintStyle}>No keywords match this note.</div>;
  return (
    <>
      {results.map((r, i) => (
        <button
          key={r.code}
          type="button"
          onClick={() => navigate(`/admin/keywords/${encodeURIComponent(r.code)}`)}
          style={{ ...rowStyle, padding: "10px 12px", gap: 10, borderColor: r.code === highlight || (!highlight && i === 0) ? "var(--accent)" : "var(--border)" }}
        >
          <Code code={r.code} />
          <span style={{ flexGrow: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.35 }}>{esrItem(r.code)?.name}</span>
            <span style={hintStyle}>Matched: {r.matched.join(", ")}</span>
          </span>
          <span style={{ flexShrink: 0, fontSize: 12, fontWeight: 800, color: "var(--muted)" }}>{r.score.toFixed(1)}</span>
        </button>
      ))}
    </>
  );
}

// ---- styles ----

const rowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  width: "100%",
  background: "var(--panel-2)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  padding: "13px 14px",
  textAlign: "left",
  color: "var(--text)",
};

const hintStyle: CSSProperties = { fontSize: 12, fontWeight: 500, color: "var(--muted)", lineHeight: 1.4 };

const sectionStyle: CSSProperties = { fontSize: 11, fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--muted-2)", lineHeight: 1.4, paddingTop: 4 };

const fieldStyle: CSSProperties = {
  background: "var(--panel-2)",
  border: "1px solid rgba(46,196,182,0.28)",
  borderRadius: 12,
  padding: "12px 14px",
  fontSize: 14,
  fontWeight: 500,
  color: "var(--text)",
  outline: "none",
  boxSizing: "border-box",
  width: "100%",
};

const primaryButton: CSSProperties = { padding: "13px 0", borderRadius: 12, background: "var(--accent)", border: "none", fontSize: 14, fontWeight: 800, color: "var(--accent-text)" };

const linkButton: CSSProperties = { background: "none", border: "none", padding: 6, fontSize: 13, fontWeight: 700, color: "var(--accent)" };

const keyStyle: CSSProperties = { height: 54, borderRadius: 12, background: "var(--panel-2)", border: "1px solid var(--border)", color: "var(--text)", fontSize: 22, fontWeight: 700 };

const editedTag: CSSProperties = { flexShrink: 0, fontSize: 10, fontWeight: 800, color: "var(--accent)", border: "1px solid rgba(46,196,182,0.5)", borderRadius: 6, padding: "2px 6px" };
