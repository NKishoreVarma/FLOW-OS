import { Component } from "react";
import { AlertTriangle, Flag, CheckCircle2 } from "lucide-react";

const CONTEXT_COPY = {
  "morning-brief": { title: "Morning Brief couldn't load", hint: "Try refreshing — it usually fixes itself in a few seconds." },
  inbox:           { title: "Inbox couldn't load",         hint: "Your connection may have timed out. Refresh to try again." },
  meetings:        { title: "Meetings couldn't load",      hint: "Refresh to reconnect to your calendar." },
  council:         { title: "Council response failed",     hint: "The reasoning engine hit an error. Try your question again." },
  "session-expired": { title: "Your session has expired", hint: "Please sign in again to continue. Your work is saved." },
  default:         { title: "Something went wrong on this view", hint: "The rest of FLOW is still running. Try reloading this view." },
};

function authHeaders() {
  return {
    Authorization: `Bearer ${localStorage.getItem("flow_os_token") || ""}`,
    "workspace-id": localStorage.getItem("flow_os_workspace_id") || "",
    "Content-Type": "application/json",
  };
}

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, reported: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // Log the error boundary catch without leaking PII payloads.
    console.error("[ErrorBoundary] Render error:", error?.message, info?.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, reported: false });
  };

  handleReport = async () => {
    try {
      await fetch("/api/feedback", {
        method: "POST", headers: authHeaders(),
        body: JSON.stringify({ thumbs: "down", text: null, context: `error-boundary:${this.props.context || "default"}` }),
      });
    } catch { /* fire-and-forget */ }
    this.setState({ reported: true });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const ctx = CONTEXT_COPY[this.props.context] || CONTEXT_COPY.default;
    const { reported } = this.state;

    return (
      <div style={{ display: "flex", height: "calc(100vh - 4rem)", alignItems: "center", justifyContent: "center", background: "var(--bg-primary)", padding: 24 }}>
        <div style={{ maxWidth: 400, textAlign: "center", display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ margin: "0 auto", width: 48, height: 48, borderRadius: "50%", background: "rgba(255,87,87,0.08)", border: "1px solid rgba(255,87,87,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <AlertTriangle style={{ width: 24, height: 24, color: "var(--p-critical-text)" }} />
          </div>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 500, color: "var(--t1)" }}>{ctx.title}</h2>
          <p style={{ margin: 0, fontSize: 13, color: "var(--t3)", lineHeight: 1.6 }}>{ctx.hint}</p>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, flexWrap: "wrap" }}>
            <button onClick={this.handleReset} style={{ padding: "7px 16px", borderRadius: 8, background: "var(--brand)", color: "var(--t1)", border: "none", fontSize: 13, fontWeight: 500, cursor: "pointer" }}>
              Try Again
            </button>
            <button onClick={() => window.location.assign("/")} style={{ padding: "7px 16px", borderRadius: 8, border: "1px solid var(--border)", background: "transparent", color: "var(--t3)", fontSize: 13, fontWeight: 500, cursor: "pointer" }}>
              Go Home
            </button>
            <button onClick={reported ? undefined : this.handleReport} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "7px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "transparent", color: reported ? "var(--p-normal-text)" : "var(--t5)", fontSize: 12, fontWeight: 500, cursor: reported ? "default" : "pointer" }}>
              {reported ? <><CheckCircle2 style={{ width: 12, height: 12 }} /> Reported</> : <><Flag style={{ width: 12, height: 12 }} /> Report this</>}
            </button>
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
