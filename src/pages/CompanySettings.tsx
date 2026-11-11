import { useNavigate } from "react-router-dom";
import { ColoursEditor, LogoEditor, StepScreen } from "../components/CompanySetup";

// Settings → Company → Report logo / Colours: the setup's editors on their
// own page. Changes save as they're made; Done goes back to Settings.

function Page({ title, children }: { title: string; children: React.ReactNode }) {
  const navigate = useNavigate();
  const done = () => navigate("/settings");
  return (
    <StepScreen
      title={title}
      onBack={done}
      button={
        <button type="button" onClick={done} style={{ width: "100%", height: 54, border: "none", borderRadius: 14, background: "var(--accent)", color: "var(--accent-text)", fontSize: 16, fontWeight: 800 }}>
          Done
        </button>
      }
    >
      {children}
    </StepScreen>
  );
}

export function LogoPage() {
  return (
    <Page title="Report logo">
      <LogoEditor />
    </Page>
  );
}

export function ColoursPage() {
  return (
    <Page title="Colours">
      <ColoursEditor />
    </Page>
  );
}
