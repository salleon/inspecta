import { useState, type FormEvent, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import RoundIconButton from "../components/RoundIconButton";
import { IconChevronLeft, IconChevronRight } from "../components/Icons";
import Switch from "../components/Switch";
import FormActions from "../components/FormActions";
import BackupSettings from "../components/BackupSettings";
import { UpdateSettingsRow } from "../components/UpdatePrompt";
import { BLUE, Group, ORANGE, RowIcon, groupHintStyle, groupRowStyle } from "../components/SettingsList";
import { getInspectorName, setInspectorName } from "../lib/profile";
import { setConverterTool, setInAppCamera, useConverterTool, useInAppCamera } from "../lib/settings";
import { startTour } from "../lib/tour";
import { useBackHandler } from "../lib/backButton";
import { IS_TEST_BUILD } from "../lib/buildInfo";
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
  const converterTool = useConverterTool();
  const inAppCamera = useInAppCamera();
  const [name, setName] = useState(() => getInspectorName());
  const [draft, setDraft] = useState<string | null>(null);

  useBackHandler(() => {
    if (draft === null) return false;
    setDraft(null);
    return true;
  });

  function saveName(e: FormEvent) {
    e.preventDefault();
    const trimmed = (draft ?? "").trim();
    if (!trimmed) return;
    setInspectorName(trimmed);
    setName(trimmed);
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
          <Item icon={<RowIcon name="user" />} title="Your name" hint={`${name || "Not set"} · on your reports`} onClick={() => setDraft(name)} />
        </Group>
        <Group heading="Photos">
          <Item
            icon={<RowIcon name="camera" />}
            title="In-app camera"
            hint={inAppCamera ? "Inspecta's own camera, with a quick check and ✎ Mark up" : "Off: the Android camera app"}
            switchOn={inAppCamera}
            right={<Switch on={inAppCamera} />}
            onClick={() => setInAppCamera(!inAppCamera)}
          />
        </Group>
        <Group heading="Flow testing">
          <Item
            icon={<RowIcon name="swap" colour={BLUE} />}
            title="Converter tool"
            hint="L/s ⇄ L/min on the flow test screens"
            switchOn={converterTool}
            right={<Switch on={converterTool} />}
            onClick={() => setConverterTool(!converterTool)}
          />
        </Group>
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
            <div style={{ fontSize: 16, fontWeight: 800 }}>Your name</div>
            <div style={{ fontSize: 13, fontWeight: 500, color: "var(--muted)", lineHeight: 1.5, marginTop: -8 }}>Used to label your reports.</div>
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
