import { Component, type ErrorInfo, type ReactNode } from "react";

// The safety net under every screen: when one hits an error it can't
// recover from, this shows in its place instead of a blank app. Try again
// draws the screen afresh; Back to home leaves it. (App.tsx keys it on the
// route, so going anywhere else clears it too.)
export default class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("screen failed", error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    const button = { width: "100%", padding: "15px 0", borderRadius: 13, fontSize: 15, fontWeight: 800 } as const;
    return (
      <div role="alert" style={{ height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", gap: 10, padding: "0 28px", textAlign: "center" }}>
        <div style={{ fontSize: 19, fontWeight: 800 }}>Something went wrong</div>
        <div style={{ fontSize: 13.5, color: "var(--muted)", lineHeight: 1.5, marginBottom: 14 }}>This screen hit a problem. Everything you've saved is still on the phone.</div>
        <button onClick={() => this.setState({ failed: false })} style={{ ...button, border: "none", background: "var(--accent)", color: "var(--accent-text)" }}>
          Try again
        </button>
        <button
          onClick={() => {
            window.location.hash = "#/";
            this.setState({ failed: false });
          }}
          style={{ ...button, background: "none", border: "1px solid var(--border-strong)", color: "#bfd0de" }}
        >
          Back to home
        </button>
      </div>
    );
  }
}
