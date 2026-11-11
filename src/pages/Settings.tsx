import { useState, type FormEvent, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import RoundIconButton from "../components/RoundIconButton";
import { IconChevronLeft, IconChevronRight } from "../components/Icons";
import FormActions from "../components/FormActions";
import BackupSettings from "../components/BackupSettings";
import { UpdateSettingsRow } from "../components/UpdatePrompt";
import { Group, ORANGE, RowIcon, groupHintStyle, groupRowStyle } from "../components/SettingsList";
import { getInspectorName, setInspectorName } from "../lib/profile";
import { lastNativeError } from "../lib/nativeCamera";
import { startTour } from "../lib/tour";
import { useBackHandler } from "../lib/backButton";
import { IS_TEST_BUILD } from "../lib/buildInfo";
import { useFlowMode } from "../lib/settings";
import { companyName, companyScheme, setCompany, useCompany } from "../lib/company";
import { CompanyLogo } from "../components/CompanySetup";
import buildLabel from "../../BUILD_LABEL?raw";

// Settings (canvas SettingsTidy): its own page, the gear on the home page
// opens it. Grouped: You, Flow testing, Backup, Help & updates, Admin.

const version = `Build ${buildLabel.trim()}${IS_TEST_BUILD ? " · Test version" : ""}`;

function Item({ icon, title, hint, right, onClick, switchOn, tour }: { icon: ReactNode; title: string; hint: string; right?: ReactNode; onClick: () => void; switchOn?: boolean; tour?: string }) {
  return (
    <button type="button" data-tour={tour} onClick={onClick} style={groupRowStyle} {...(switchOn === undefined ? {} : { role: "switch", "aria-checked": switchOn })}>
      {icon}
      <div style={{ flexGrow: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ fontSize: 14.5, fontWeight: 700 }}>{title}</span>
        <span style={groupHintStyle}>{hint}</span>
      </div>
      {right ?? <IconChevronRight color="var(--muted)" />}
    </button>
  );
}

export default function Settings() {
  const navigate = useNavigate();
  const [name, setName] = useState(() => getInspectorName());
  const [draft, setDraft] = useState<string | null>(null);
  // which name the sheet edits: yours, or (Contractor mode) the company's
  const [editing, setEditing] = useState<"you" | "company">("you");
  const contractor = useFlowMode() === "contractor";
  const company = useCompany();
  const scheme = companyScheme(company);

  useBackHandler(() => {
    if (draft === null) return false;
    setDraft(null);
    return true;
  });

  function saveName(e: FormEvent) {
    e.preventDefault();
    const trimmed = (draft ?? "").trim();
    if (!trimmed) return;
    if (editing === "company") {
      setCompany({ name: trimmed });
    } else {
      setInspectorName(trimmed);
      setName(trimmed);
    }
    setDraft(null);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", position: "relative" }}>
      <div style={{ flexShrink: 0, padding: "18px 18px 8px", display: "flex", alignItems: "center", gap: 12 }}>
        <RoundIconButton size={32} ariaLabel="Back" onClick={() => navigate("/")}>
          <IconChevronLeft size={20} strokeWidth={2.2} />
        </RoundIconButton>
        <div style={{ fontSize: 20, fontWeight: 800 }}>Settings</div>
      </div>
      <div style={{ flexGrow: 1, overflowY: "auto", padding: "0 16px calc(24px + env(safe-area-inset-bottom))", display: "flex", flexDirection: "column", gap: 4 }}>
        <Group heading="You">
          <Item
            icon={<RowIcon name="user" />}
            title="Your name"
            hint={`${name || "Not set"} · on your reports`}
            onClick={() => {
              setEditing("you");
              setDraft(name);
            }}
          />
        </Group>
        {contractor && (
          <Group heading="Company">
            <Item
              icon={<RowIcon name="building" />}
              title="Company name"
              hint={companyName(company) || "Not set"}
              onClick={() => {
                setEditing("company");
                setDraft(company.name);
              }}
            />
            <Item icon={<RowIcon name="image" />} title="Report logo" hint={company.logo ? "On the app and report covers" : "None"} right={company.logo ? <CompanyLogo height={30} maxWidth={90} /> : undefined} onClick={() => navigate("/settings/logo")} />
            <Item
              icon={<RowIcon name="palette" />}
              title="Colours"
              hint={scheme.name}
              right={
                <span style={{ display: "flex" }} aria-hidden="true">
                  {[scheme.primary, scheme.secondary, scheme.light].map((hx, i) => (
                    <span key={i} style={{ width: 20, height: 20, borderRadius: "50%", marginLeft: i ? -6 : 0, background: hx, boxShadow: "0 0 0 1px rgba(255,255,255,.15)", display: "block" }} />
                  ))}
                </span>
              }
              onClick={() => navigate("/settings/colours")}
            />
          </Group>
        )}
        {lastNativeError() && (
          <Group heading="Photos">
            <div data-testid="native-camera-error" style={{ padding: "12px 14px", fontSize: 11.5, lineHeight: 1.45, color: "#f7b977", wordBreak: "break-word" }}>
              Camera's last error: {lastNativeError()}
            </div>
          </Group>
        )}
        <Group tour="backup" heading="Backup" foot="Save backups to OneDrive or similar. Everything else lives only on this phone.">
          <BackupSettings rowStyle={groupRowStyle} hintStyle={groupHintStyle} onRestored={() => {}} icons={[<RowIcon key="u" name="up" />, <RowIcon key="d" name="down" />]} />
        </Group>
        <Group heading="Help & updates">
          {/* the download bar is on the home page */}
          <UpdateSettingsRow rowStyle={groupRowStyle} hintStyle={groupHintStyle} onAction={() => navigate("/")} icon={<RowIcon name="refresh" />} version={version} />
          <Item
            icon={<RowIcon name="compass" />}
            tour="replay-tour"
            title="Replay tour"
            hint="A quick walk through the app"
            onClick={() => {
              navigate("/");
              void startTour();
            }}
          />
        </Group>
        <Group heading="Admin">
          <Item icon={<RowIcon name="lock" colour={ORANGE} />} title="Admin" hint="Features, keywords, PIN" onClick={() => navigate("/admin")} />
        </Group>
        <div style={{ flexShrink: 0, textAlign: "center", fontSize: 12, fontWeight: 600, color: "var(--muted-2)", marginTop: "auto", paddingTop: 16 }}>Inspecta · {version}</div>
      </div>

      {draft !== null && (
        <div className="sheet-backdrop" style={{ position: "absolute", inset: 0, background: "rgba(10,11,13,0.6)", display: "flex", alignItems: "flex-end", zIndex: 5 }} onClick={() => setDraft(null)}>
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={saveName}
            className="sheet-panel"
            style={{ width: "100%", background: "var(--panel)", borderRadius: "20px 20px 0 0", padding: "22px 20px calc(28px + env(safe-area-inset-bottom))", display: "flex", flexDirection: "column", gap: 14 }}
          >
            <div style={{ fontSize: 16, fontWeight: 800 }}>{editing === "company" ? "Company name" : "Your name"}</div>
            <div style={{ fontSize: 13, fontWeight: 500, color: "var(--muted)", lineHeight: 1.5, marginTop: -8 }}>{editing === "company" ? "On every report cover." : "Used to label your reports."}</div>
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              style={{ background: "var(--panel-2)", border: "1px solid var(--border)", borderRadius: 12, padding: "13px 14px", color: "var(--text)", fontSize: 15, fontWeight: 500, outline: "none" }}
            />
            <FormActions onCancel={() => setDraft(null)} />
          </form>
        </div>
      )}
    </div>
  );
}
