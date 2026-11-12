import { useRef, useState, type ChangeEvent, type CSSProperties, type ReactNode } from "react";
import SetupFileLoader from "./SetupFileLoader";
import { IconChevronLeft, IconCheck } from "./Icons";
import RoundIconButton from "./RoundIconButton";
import Switch from "./Switch";
import {
  BRIGHT_SWATCHES,
  DARK_SWATCHES,
  PRESETS,
  companyInitials,
  companyName,
  companyScheme,
  logoSchemes,
  prepareLogo,
  logoLooksSmall,
  setCompany,
  useCompany,
  type Preset,
  type Scheme,
} from "../lib/company";
import { useBackHandler } from "../lib/backButton";
import { say } from "./Message";
import appMark from "../assets/app-mark.png";
import InspectaWordmark from "./InspectaWordmark";
import "./CompanySetup.css";

// Contractor mode's company setup (canvas "Inspecta for contractors"):
// shown on a new phone before the name prompt. Welcome, then the company
// name, its logo for the app and report covers, and its colours (for the
// splash screen and report covers only; the app keeps its own). Every
// change is saved as it's made. The logo and
// colours editors are reused by Settings → Company.

export function CompanyLogo({ height, maxWidth, style }: { height: number; maxWidth: number; style?: CSSProperties }) {
  const c = useCompany();
  if (!c.logo) {
    // no logo: the company's name, set in a box
    return (
      <div style={{ height, maxWidth, boxSizing: "border-box", padding: `0 ${Math.round(height * 0.3)}px`, borderRadius: Math.round(height / 5), border: "1.5px solid var(--accent)", color: "var(--text)", display: "flex", alignItems: "center", flexShrink: 0, ...style }}>
        <span style={{ fontSize: Math.max(9, Math.round(height * 0.3)), fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", lineHeight: 1.15, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{companyName(c) || companyInitials(c)}</span>
      </div>
    );
  }
  const pad = c.plate ? Math.max(4, Math.round(height * 0.16)) : 0;
  return (
    <div style={{ display: "flex", flexShrink: 0, padding: c.plate ? `${pad}px ${pad * 1.5}px` : 0, background: c.plate ? "#ffffff" : "transparent", borderRadius: 8, ...style }}>
      <img src={c.logo} alt={companyName(c) || "Company logo"} style={{ maxHeight: height - pad * 2, maxWidth, display: "block" }} />
    </div>
  );
}

// the intro's mark, "Inspecta" and the line underneath; animated when the
// screen first shows (the contractor splash), at rest otherwise
function CompanyMark({ animate }: { animate: boolean }) {
  const c = useCompany();
  const name = companyName(c);
  return (
    <div className={animate ? "co-animate" : undefined} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 26 }}>
      <div className="co-mark">
        <div className="co-ring" />
        {c.logo ? (
          <div className="co-logo" style={{ padding: c.plate ? "10px 14px" : 0, background: c.plate ? "#ffffff" : "transparent" }}>
            <img src={c.logo} alt="" style={{ maxWidth: 220, maxHeight: 96, display: "block" }} />
            <div className="co-shine" />
          </div>
        ) : (
          // no logo yet: the app's own mark (the buildings and tick from the
          // app icon, without its words) until the company adds theirs. The
          // building's tip is 45% across, so it's nudged 6px right to sit on
          // the centre line like the app icon, not the mark's full width.
          <img className="co-applogo" src={appMark} alt="" style={{ width: 120, height: "auto", display: "block", position: "relative", left: 6 }} />
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
        <InspectaWordmark size={56} reveal={animate} />
        <div className="co-tag">{name && c.setUp ? `for ${name}` : "Site inspection tool"}</div>
      </div>
    </div>
  );
}

const bigButton: CSSProperties = {
  width: "100%",
  height: 54,
  border: "none",
  borderRadius: 14,
  background: "var(--accent)",
  color: "var(--accent-text)",
  fontSize: 16,
  fontWeight: 800,
};

const label: CSSProperties = { fontSize: 13, fontWeight: 700, color: "var(--muted)" };

export function StepScreen({ title, onBack, step, children, button }: { title: string; onBack: () => void; step?: number; children: ReactNode; button: ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ flexShrink: 0, padding: "18px 18px 8px", display: "flex", alignItems: "center", gap: 12 }}>
        <RoundIconButton size={32} ariaLabel="Back" onClick={onBack}>
          <IconChevronLeft size={20} strokeWidth={2.2} />
        </RoundIconButton>
        <div style={{ flexGrow: 1, fontSize: 20, fontWeight: 800 }}>{title}</div>
        {step !== undefined && (
          <div style={{ display: "flex", gap: 6 }} aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <div key={i} style={{ width: i === step ? 22 : 8, height: 8, borderRadius: 4, background: i <= step ? "var(--accent)" : "var(--border-strong)" }} />
            ))}
          </div>
        )}
      </div>
      <div style={{ flexGrow: 1, overflowY: "auto", padding: "12px 20px 20px", display: "flex", flexDirection: "column", gap: 16 }}>{children}</div>
      <div style={{ flexShrink: 0, padding: "10px 20px calc(24px + var(--sa-bottom))" }}>{button}</div>
    </div>
  );
}

function NameEditor() {
  const c = useCompany();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <label htmlFor="company-name" style={label}>
        Company name
      </label>
      <input
        id="company-name"
        autoFocus
        value={c.name}
        onChange={(e) => setCompany({ name: e.target.value })}
        style={{ background: "var(--panel-2)", border: "1px solid var(--border)", borderRadius: 12, padding: "15px 16px", color: "var(--text)", fontSize: 16, fontWeight: 600, outline: "none" }}
      />
      <div style={{ fontSize: 13, color: "var(--muted)" }}>On every report cover.</div>
    </div>
  );
}

// a cover-coloured strip to show the logo as it'll sit on a report
function coverGradient(s: Scheme): string {
  return `linear-gradient(172deg, ${s.primary} 0%, ${s.primary} 48%, #000000 160%)`;
}

export function LogoEditor() {
  const c = useCompany();
  const [busy, setBusy] = useState(false);

  async function pick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      const prepared = await prepareLogo(file);
      if (!setCompany({ logo: prepared.logo, logoColours: prepared.colours })) {
        say("Couldn't save the logo", "There isn't enough room on this phone. Free up some space, then try again.");
      } else if (logoLooksSmall(prepared)) {
        say("This logo is small", `It's ${prepared.width} × ${prepared.height} pixels, so it may look blurry on report covers. A bigger one, at least 440 pixels wide, prints sharp.`);
      }
    } catch (err) {
      say("Couldn't use that picture", err instanceof Error ? err.message : "Try a PNG or JPG.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <label style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, minHeight: 170, padding: 16, boxSizing: "border-box", borderRadius: 16, border: "2px dashed var(--border-strong)", background: "var(--panel)", cursor: "pointer", textAlign: "center" }}>
        <input type="file" accept="image/*" onChange={pick} aria-label="Upload logo" style={{ position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none" }} />
        {c.logo ? (
          <>
            <img src={c.logo} alt="Your logo" style={{ maxWidth: 260, maxHeight: 110 }} />
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)" }}>{busy ? "Reading…" : "Tap to change"}</div>
          </>
        ) : (
          <>
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 16V4M7 9l5-5 5 5" />
              <path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
            </svg>
            <div style={{ fontSize: 16, fontWeight: 800 }}>{busy ? "Reading…" : "Upload logo"}</div>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>PNG with a clear background works best</div>
          </>
        )}
      </label>
      {c.logo && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={label}>On a report cover</div>
          <div style={{ height: 96, borderRadius: 12, background: coverGradient(companyScheme(c)), display: "flex", alignItems: "center", padding: "0 18px" }}>
            <CompanyLogo height={c.plate ? 66 : 46} maxWidth={200} />
          </div>
          <button type="button" role="switch" aria-checked={c.plate} onClick={() => setCompany({ plate: !c.plate })} style={{ display: "flex", alignItems: "center", gap: 12, minHeight: 56, padding: "0 14px", border: "none", borderRadius: 12, background: "var(--panel)", color: "var(--text)", fontSize: 15, fontWeight: 700, textAlign: "left" }}>
            <span style={{ flexGrow: 1 }}>White background behind logo</span>
            <Switch on={c.plate} />
          </button>
          <button type="button" onClick={() => setCompany({ logo: null, logoColours: [], plate: false, schemeId: c.schemeId.startsWith("logo") ? "default" : c.schemeId })} style={{ alignSelf: "flex-start", height: 44, border: "none", background: "none", color: "var(--muted)", fontSize: 14, fontWeight: 700, padding: 0 }}>
            Remove logo
          </button>
        </div>
      )}
    </div>
  );
}

type Tab = "presets" | "logo" | "custom";
type Role = keyof Scheme;

function SchemeCard({ p, selected, onPick }: { p: Preset; selected: boolean; onPick: () => void }) {
  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={selected}
      style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 14, padding: "12px 14px", borderRadius: 14, background: "var(--panel)", color: "var(--text)", border: `2px solid ${selected ? "var(--accent)" : "transparent"}`, textAlign: "left" }}
    >
      <span style={{ display: "flex" }}>
        {[p.primary, p.secondary, p.light].map((hx, i) => (
          <span key={i} style={{ width: 32, height: 32, borderRadius: "50%", marginLeft: i ? -10 : 0, background: hx, boxShadow: "inset 0 0 0 1px rgba(0,0,0,.15), 0 0 0 1px rgba(255,255,255,.08)", display: "block" }} />
        ))}
      </span>
      <span style={{ flexGrow: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ fontSize: 15.5, fontWeight: 800 }}>{p.name}</span>
        <span style={{ fontSize: 12, color: "var(--muted)" }}>{p.desc}</span>
      </span>
      {selected && <IconCheck size={20} color="var(--accent)" />}
    </button>
  );
}

function Swatch({ hex, on, onPick }: { hex: string; on: boolean; onPick: () => void }) {
  return (
    <button
      type="button"
      aria-label={hex}
      aria-pressed={on}
      onClick={onPick}
      style={{ width: 40, height: 40, borderRadius: "50%", border: "none", background: hex, boxShadow: on ? "0 0 0 3px var(--bg), 0 0 0 5px var(--text)" : "inset 0 0 0 1px rgba(0,0,0,.18), 0 0 0 1px rgba(255,255,255,.08)" }}
    />
  );
}

export function ColoursEditor() {
  const c = useCompany();
  const fromLogo = c.logo ? logoSchemes(c.logoColours) : [];
  const [tab, setTab] = useState<Tab>(() => (c.schemeId === "custom" ? "custom" : c.schemeId.startsWith("logo") || (c.logo && !c.setUp) ? "logo" : "presets"));
  const [role, setRole] = useState<Role>("primary");
  const current = companyScheme(c);

  function openTab(t: Tab) {
    // Custom starts from whatever's picked, so only what's wanted changes
    if (t === "custom" && c.schemeId !== "custom") setCompany({ schemeId: "custom", custom: { primary: current.primary, secondary: current.secondary, light: current.light } });
    setTab(t);
  }
  const setRoleColour = (hex: string) => setCompany({ schemeId: "custom", custom: { ...getCustom(), [role]: hex } });
  const getCustom = () => (c.schemeId === "custom" ? c.custom : { primary: current.primary, secondary: current.secondary, light: current.light });
  const roleHex = getCustom()[role];
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

  const groups = role === "primary" ? [["Dark", DARK_SWATCHES], ["Bright", BRIGHT_SWATCHES]] : [["Bright", BRIGHT_SWATCHES], ["Dark", DARK_SWATCHES]];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* the colours only show on the splash and the report covers, so show them there */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={label}>On the splash screen and report covers</div>
        <div data-testid="colours-preview" style={{ height: 96, borderRadius: 12, background: coverGradient(current), display: "flex", alignItems: "center", gap: 14, padding: "0 18px", borderBottom: `4px solid ${current.secondary}` }}>
          <CompanyLogo height={c.plate ? 66 : 46} maxWidth={170} />
        </div>
      </div>
      <div role="tablist" style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 4, padding: 4, borderRadius: 12, background: "var(--panel)" }}>
        {(
          [
            ["presets", "Presets"],
            ["logo", "From logo"],
            ["custom", "Custom"],
          ] as [Tab, string][]
        ).map(([t, name]) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => openTab(t)} style={{ height: 40, border: "none", borderRadius: 9, fontSize: 13, fontWeight: 800, background: tab === t ? "var(--accent)" : "transparent", color: tab === t ? "var(--accent-text)" : "var(--text)" }}>
            {name}
          </button>
        ))}
      </div>

      {tab === "presets" && PRESETS.map((p) => <SchemeCard key={p.id} p={p} selected={c.schemeId === p.id} onPick={() => setCompany({ schemeId: p.id })} />)}

      {tab === "logo" &&
        (c.logo ? (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: 12, borderRadius: 14, background: "var(--panel)" }}>
              <div style={{ width: 92, height: 52, borderRadius: 8, background: "#ffffff", display: "flex", alignItems: "center", justifyContent: "center", padding: 6, boxSizing: "border-box" }}>
                <img src={c.logo} alt="" style={{ maxWidth: "100%", maxHeight: "100%", display: "block" }} />
              </div>
              <div style={{ flexGrow: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)" }}>Found in your logo</div>
                <div style={{ display: "flex", gap: 6 }}>
                  {c.logoColours.map((hx) => (
                    <span key={hx} style={{ width: 24, height: 24, borderRadius: "50%", background: hx, boxShadow: "inset 0 0 0 1px rgba(0,0,0,.15)", display: "block" }} />
                  ))}
                </div>
              </div>
            </div>
            {fromLogo.map((p) => (
              <SchemeCard key={p.id} p={p} selected={c.schemeId === p.id} onPick={() => setCompany({ schemeId: p.id })} />
            ))}
          </>
        ) : (
          <div style={{ padding: "28px 16px", borderRadius: 14, background: "var(--panel)", textAlign: "center", fontSize: 15, fontWeight: 800 }}>No logo yet</div>
        ))}

      {tab === "custom" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
            {(
              [
                ["primary", "Primary"],
                ["secondary", "Secondary"],
                ["light", "Light"],
              ] as [Role, string][]
            ).map(([r, name]) => (
              <button key={r} type="button" aria-pressed={role === r} onClick={() => setRole(r)} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "10px 4px", borderRadius: 12, background: "var(--panel)", color: "var(--text)", border: `2px solid ${role === r ? "var(--accent)" : "transparent"}` }}>
                <span style={{ width: 32, height: 32, borderRadius: "50%", background: getCustom()[r], boxShadow: "inset 0 0 0 1px rgba(0,0,0,.15), 0 0 0 1px rgba(255,255,255,.08)", display: "block" }} />
                <span style={{ fontSize: 12, fontWeight: 800 }}>{name}</span>
              </button>
            ))}
          </div>
          {c.logo && c.logoColours.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={label}>From your logo</div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {c.logoColours.map((hx) => (
                  <Swatch key={hx} hex={hx} on={same(hx, roleHex)} onPick={() => setRoleColour(hx)} />
                ))}
              </div>
            </div>
          )}
          {groups.map(([name, list]) => (
            <div key={name as string} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={label}>{name as string}</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(0, 1fr))", gap: 10, justifyItems: "center" }}>
                {(list as string[]).map((hx) => (
                  <Swatch key={hx} hex={hx} on={same(hx, roleHex)} onPick={() => setRoleColour(hx)} />
                ))}
              </div>
            </div>
          ))}
          <label style={{ display: "flex", alignItems: "center", gap: 12, minHeight: 56, padding: "0 14px", borderRadius: 12, background: "var(--panel)", cursor: "pointer" }}>
            <input type="color" value={roleHex} onChange={(e) => setRoleColour(e.target.value)} style={{ width: 36, height: 36, border: "none", padding: 0, background: "transparent" }} />
            <span style={{ flexGrow: 1, fontSize: 15, fontWeight: 700 }}>Any colour</span>
          </label>
        </div>
      )}
    </div>
  );
}

type Step = "welcome" | "name" | "logo" | "colours";

export default function CompanySetup({ onDone, animate }: { onDone: () => void; animate: boolean }) {
  const c = useCompany();
  const [step, setStep] = useState<Step>("welcome");
  // Join a company: a setup file from whoever looks after the phones
  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const back: Record<Step, Step | null> = { welcome: null, name: "welcome", logo: "name", colours: "logo" };

  useBackHandler(() => {
    const prev = back[step];
    if (!prev) return false;
    setStep(prev);
    return true;
  });

  if (step === "welcome") {
    return (
      <div className="co-grid" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
        <div style={{ flexGrow: 1, display: "flex", alignItems: "center", justifyContent: "center", paddingTop: 40 }}>
          <CompanyMark animate={animate} />
        </div>
        <div style={{ flexShrink: 0, padding: "0 24px calc(32px + var(--sa-bottom))", display: "flex", flexDirection: "column", gap: 6 }}>
          <button type="button" style={bigButton} onClick={() => setStep("name")}>
            Set up your company
          </button>
          <button type="button" onClick={() => fileInput.current?.click()} style={{ height: 48, border: "none", background: "none", color: "var(--text)", fontSize: 15, fontWeight: 700 }}>
            Join a company
          </button>
          <input
            ref={fileInput}
            type="file"
            aria-label="Setup file"
            style={{ display: "none" }}
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              e.target.value = "";
            }}
          />
        </div>
        {file && <SetupFileLoader file={file} onCancel={() => setFile(null)} onDone={onDone} />}
      </div>
    );
  }
  if (step === "name") {
    return (
      <StepScreen title="Your company" step={0} onBack={() => setStep("welcome")} button={<button type="button" style={{ ...bigButton, opacity: companyName(c) ? 1 : 0.45 }} disabled={!companyName(c)} onClick={() => setStep("logo")}>Next</button>}>
        <NameEditor />
      </StepScreen>
    );
  }
  if (step === "logo") {
    return (
      <StepScreen
        title="Report logo"
        step={1}
        onBack={() => setStep("name")}
        button={
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <button type="button" style={bigButton} onClick={() => setStep("colours")}>
              Next
            </button>
            {/* skip the styling: the app's own colours, the name in a box for a logo */}
            <button
              type="button"
              onClick={() => {
                setCompany({ logo: null, logoColours: [], plate: false, schemeId: "default", setUp: true });
                onDone();
              }}
              style={{ height: 46, border: "none", background: "none", color: "var(--text)", fontSize: 15, fontWeight: 700 }}
            >
              Use default
            </button>
          </div>
        }
      >
        <LogoEditor />
      </StepScreen>
    );
  }
  return (
    <StepScreen
      title="Colours"
      step={2}
      onBack={() => setStep("logo")}
      button={
        <button
          type="button"
          style={bigButton}
          onClick={() => {
            setCompany({ setUp: true });
            onDone();
          }}
        >
          Finish
        </button>
      }
    >
      <ColoursEditor />
    </StepScreen>
  );
}
