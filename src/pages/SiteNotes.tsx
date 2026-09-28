import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getSite, updateSiteNotes } from "../db/db";
import { IconChevronLeft } from "../components/Icons";
import RoundIconButton from "../components/RoundIconButton";
import { useBackHandler } from "../lib/backButton";

// A site's Notepad: a blank page for the inspector's own jottings (things
// to check later, FER notes...). Never in any report; kept in backups with
// the site. Saves as you type, and again on the way out.
export default function SiteNotes() {
  const { siteId } = useParams<{ siteId: string }>();
  const navigate = useNavigate();
  const [siteName, setSiteName] = useState("");
  const [text, setText] = useState<string | null>(null); // null until loaded
  const [saved, setSaved] = useState(true);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // what's in the box and what's in the database, for saving on the way out
  const latest = useRef({ text: "", stored: "" });

  useEffect(() => {
    if (!siteId) return;
    let cancelled = false;
    getSite(siteId).then((site) => {
      if (cancelled) return;
      setSiteName(site?.name ?? "");
      const notes = site?.notes ?? "";
      latest.current = { text: notes, stored: notes };
      setText(notes);
    });
    return () => {
      cancelled = true;
    };
  }, [siteId]);

  // keyboard up, cursor at the end, once the notes are in
  const loaded = text !== null;
  useEffect(() => {
    const el = inputRef.current;
    if (!loaded || !el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, [loaded]);

  async function save() {
    const { text: now, stored } = latest.current;
    if (!siteId || now === stored) return;
    latest.current.stored = now;
    await updateSiteNotes(siteId, now);
  }

  // save half a second after typing stops
  useEffect(() => {
    if (text === null) return;
    const t = setTimeout(() => {
      void save().then(() => setSaved(latest.current.text === latest.current.stored));
    }, 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  // and whatever's left when the screen closes by any other route
  useEffect(
    () => () => void save(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  async function handleBack() {
    await save();
    navigate(`/site/${siteId}/findings`);
  }

  useBackHandler(() => {
    void handleBack();
    return true;
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ flexShrink: 0, padding: "18px 18px 12px", display: "flex", alignItems: "center", gap: 12 }}>
        <RoundIconButton size={32} ariaLabel="Save and back to findings" onClick={handleBack}>
          <IconChevronLeft size={20} strokeWidth={2.2} />
        </RoundIconButton>
        <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 800 }}>Notepad</div>
          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {siteName ? `${siteName} · just for you` : "Just for you"}
          </div>
        </div>
        <div style={{ marginLeft: "auto", flexShrink: 0, fontSize: 11, fontWeight: 700, color: saved ? "var(--accent)" : "var(--muted-2)" }} aria-live="polite">
          {saved ? "Saved ✓" : "Saving…"}
        </div>
      </div>

      <div style={{ flexGrow: 1, minHeight: 0, display: "flex", padding: "4px 18px calc(18px + env(safe-area-inset-bottom))" }}>
        <textarea
          ref={inputRef}
          aria-label="Notepad"
          placeholder="Things to check later, FER notes, anything. Not included in reports."
          value={text ?? ""}
          disabled={text === null}
          onChange={(e) => {
            latest.current.text = e.target.value;
            setText(e.target.value);
            setSaved(false);
          }}
          style={{
            flexGrow: 1,
            width: "100%",
            boxSizing: "border-box",
            background: "var(--panel)",
            border: "1px solid var(--accent)",
            borderRadius: 14,
            padding: 16,
            fontSize: 15,
            lineHeight: 1.55,
            fontWeight: 500,
            color: "var(--text)",
            outline: "none",
            resize: "none",
          }}
        />
      </div>
    </div>
  );
}
