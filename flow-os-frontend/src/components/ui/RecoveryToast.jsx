import { useState } from "react";
import { AlertTriangle, X, ExternalLink, Flag, CheckCircle2 } from "lucide-react";

function authHeaders() {
  return {
    Authorization: `Bearer ${localStorage.getItem("flow_os_token") || ""}`,
    "workspace-id": localStorage.getItem("flow_os_workspace_id") || "",
    "Content-Type": "application/json",
  };
}

export default function RecoveryToast({ error = {}, onDismiss }) {
  const [reported, setReported] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const { code, userMessage, recoverySteps, selfServeAction } = error;

  const dismiss = () => { setDismissed(true); onDismiss?.(); };

  const handleReport = async () => {
    try {
      await Promise.all([
        fetch("/api/feedback", {
          method: "POST", headers: authHeaders(),
          body: JSON.stringify({ thumbs: "down", text: null, context: "error.reported" }),
        }),
        fetch("/api/analytics/event", {
          method: "POST", headers: authHeaders(),
          body: JSON.stringify({ event: "error.reported", properties: { errorCode: code || "UNKNOWN" } }),
        }),
      ]);
    } catch { /* fire-and-forget */ }
    setReported(true);
    setTimeout(dismiss, 2500);
  };

  const handleSelfServe = () => {
    if (selfServeAction?.href) window.location.assign(selfServeAction.href);
    setTimeout(dismiss, 12000);
  };

  if (dismissed) return null;

  return (
    <div style={{
      position: "fixed", bottom: 24, right: 24, zIndex: 9999,
      maxWidth: 380, width: "calc(100vw - 48px)",
      background: "var(--bg-secondary)",
      border: "1px solid var(--border-strong)",
      borderRadius: 12, padding: "16px 18px",
      boxShadow: "0 8px 32px rgba(0,0,0,0.32)",
    }}>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        <AlertTriangle style={{ width: 18, height: 18, color: "var(--p-critical-text)", flexShrink: 0, marginTop: 1 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: "var(--t1)", lineHeight: 1.4 }}>
            {userMessage || "Something went wrong."}
          </p>
          {recoverySteps?.length > 0 && (
            <ol style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 12, color: "var(--t3)", lineHeight: 1.7 }}>
              {recoverySteps.map((s, i) => <li key={i}>{s}</li>)}
            </ol>
          )}
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            {selfServeAction && (
              <button onClick={handleSelfServe} style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                padding: "5px 10px", background: "var(--brand)",
                color: "var(--t1)", border: "none", borderRadius: 6,
                fontSize: 12, fontWeight: 500, cursor: "pointer",
              }}>
                <ExternalLink style={{ width: 12, height: 12 }} />
                {selfServeAction.label}
              </button>
            )}
            <button onClick={reported ? undefined : handleReport} style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              padding: "5px 10px", background: "transparent",
              color: reported ? "var(--p-normal-text)" : "var(--t3)",
              border: "1px solid var(--border)", borderRadius: 6,
              fontSize: 12, fontWeight: 500,
              cursor: reported ? "default" : "pointer",
            }}>
              {reported
                ? <><CheckCircle2 style={{ width: 12, height: 12 }} /> Reported — thanks</>
                : <><Flag style={{ width: 12, height: 12 }} /> Report this</>}
            </button>
          </div>
        </div>
        <button onClick={dismiss} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--t5)", padding: 2, flexShrink: 0 }}>
          <X style={{ width: 16, height: 16 }} />
        </button>
      </div>
    </div>
  );
}
