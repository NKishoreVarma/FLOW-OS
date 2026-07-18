import { useState } from "react";
import { Zap, ChevronDown, Check, AlertTriangle, Clock, Loader2, ShieldCheck } from "lucide-react";
import executionApi from "../../lib/executionApi";

function trackPilot(event, props = {}) {
  const token = localStorage.getItem("flow_os_token") || "";
  const wsId = localStorage.getItem("flow_os_workspace_id") || "";
  if (!token || !wsId) return;
  fetch("/api/analytics/event", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "workspace-id": wsId, "Content-Type": "application/json" },
    body: JSON.stringify({ event, properties: props }),
  }).catch(() => {});
}

const IMPACT_COLOR = {
  critical: "var(--p-critical-text)",
  high:     "var(--p-high-text)",
  medium:   "var(--brand)",
  low:      "var(--t4)",
};

const RISK_BG = {
  LOW:      "var(--risk-low-bg)",
  MEDIUM:   "var(--risk-medium-bg)",
  HIGH:     "var(--risk-high-bg)",
  CRITICAL: "var(--risk-critical-bg)",
};
const RISK_BORDER = {
  LOW:      "var(--risk-low-border)",
  MEDIUM:   "var(--risk-medium-border)",
  HIGH:     "var(--risk-high-border)",
  CRITICAL: "var(--risk-critical-border)",
};
const RISK_COLOR = {
  LOW:      "var(--risk-low-text)",
  MEDIUM:   "var(--risk-medium-text)",
  HIGH:     "var(--risk-high-text)",
  CRITICAL: "var(--risk-critical-text)",
};

function RiskChip({ risk }) {
  return (
    <span style={{
      fontSize: 9, fontWeight: 500, letterSpacing: "0.07em", textTransform: "uppercase",
      padding: "2px 6px", borderRadius: 3,
      color: RISK_COLOR[risk] || RISK_COLOR.LOW,
      background: RISK_BG[risk] || RISK_BG.LOW,
      border: `1px solid ${RISK_BORDER[risk] || RISK_BORDER.LOW}`,
      display: "inline-flex", alignItems: "center", gap: 3,
    }}>
      <ShieldCheck style={{ width: 9, height: 9 }} /> {risk}
    </span>
  );
}

export default function ActionCard({ card = {}, onExecute, onDismiss }) {
  const [state, setState] = useState("idle"); // idle|running|confirm|done|error|approval
  const [activeMsg, setActiveMsg] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);

  const actions = card.actions || [];
  const primary = actions[0];
  const secondary = actions.slice(1);

  async function handleAction(action) {
    if (state === "running") return;
    trackPilot("action.accepted", { workflowId: action.workflowId, type: card.type });
    setState("running");
    try {
      const plan = { title: action.label, steps: action.steps };
      const out = await executionApi.execute(plan, { confirmed: false });
      const step = out.results?.[0] || {};
      if (step.status === "EXECUTED" || out.completed) {
        setState("done");
        setActiveMsg("Done.");
        onExecute?.({ card, action, result: out });
      } else if (step.status === "CONFIRM_REQUIRED") {
        setPendingAction(action);
        setState("confirm");
        setActiveMsg(step.reason || "Please confirm this action.");
      } else if (step.status === "APPROVAL_REQUIRED") {
        setState("approval");
        setActiveMsg(`Sent for approval — ${step.requiredApprovals || 1} approval(s) required.`);
      } else if (step.status === "DENIED") {
        setState("error");
        setActiveMsg(step.error || "Denied by governance.");
      } else {
        setState("error");
        setActiveMsg(step.error || "Could not execute.");
      }
    } catch (err) {
      setState("error");
      setActiveMsg(err.message || "Something went wrong.");
    }
  }

  async function handleConfirm() {
    setState("running");
    try {
      const action = pendingAction;
      const out = await executionApi.execute({ title: action.label, steps: action.steps }, { confirmed: true });
      setState(out.completed ? "done" : "error");
      setActiveMsg(out.completed ? "Done." : "Could not complete.");
      if (out.completed) onExecute?.({ card, action, result: out });
    } catch {
      setState("error");
      setActiveMsg("Something went wrong.");
    }
  }

  function handleDismiss() {
    trackPilot("action.dismissed", { type: card.type });
    onDismiss?.({ card });
  }

  return (
    <div style={{
      background: "var(--bg-secondary)", border: "1px solid var(--border)",
      borderRadius: 10, overflow: "hidden", marginBottom: 10,
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 14px 10px" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 500, color: IMPACT_COLOR[card.impact] || "var(--t4)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
              {card.impactLabel || "Impact"}
            </span>
          </div>
          <div style={{ fontSize: 13, fontWeight: 500, color: "var(--t1)", lineHeight: 1.4, marginBottom: 4 }}>{card.title}</div>
          {card.subtitle && <div style={{ fontSize: 12, color: "var(--t3)", lineHeight: 1.4 }}>{card.subtitle}</div>}
        </div>
        <button onClick={handleDismiss} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--t5)", padding: 2, lineHeight: 1 }} aria-label="Dismiss">✕</button>
      </div>

      {/* Evidence lines */}
      {card.evidenceLines?.length > 0 && (
        <div style={{ padding: "0 14px 10px" }}>
          {card.evidenceLines.map((line, i) => (
            <div key={i} style={{ fontSize: 11, color: "var(--t4)", lineHeight: 1.5 }}>· {line}</div>
          ))}
        </div>
      )}

      {/* Status banner */}
      {activeMsg && (
        <div style={{ margin: "0 14px 10px", padding: "8px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg-primary)", display: "flex", alignItems: "center", gap: 8 }}>
          {state === "done" && <Check style={{ width: 13, height: 13, color: "var(--p-normal-text)", flexShrink: 0 }} />}
          {state === "approval" && <Clock style={{ width: 13, height: 13, color: "var(--p-high-text)", flexShrink: 0 }} />}
          {state === "error" && <AlertTriangle style={{ width: 13, height: 13, color: "var(--p-critical-text)", flexShrink: 0 }} />}
          <span style={{ fontSize: 12, color: state === "done" ? "var(--p-normal-text)" : state === "error" ? "var(--p-critical-text)" : "var(--t2)" }}>{activeMsg}</span>
          {state === "confirm" && (
            <button onClick={handleConfirm} style={{ marginLeft: "auto", padding: "3px 10px", borderRadius: 5, background: "var(--brand)", color: "var(--t1)", border: "none", fontSize: 11, fontWeight: 500, cursor: "pointer" }}>
              Confirm
            </button>
          )}
        </div>
      )}

      {/* Action buttons */}
      {state !== "done" && (
        <div style={{ padding: "0 14px 12px", display: "flex", flexWrap: "wrap", gap: 8 }}>
          {primary && (
            <button
              onClick={() => handleAction(primary)}
              disabled={state === "running"}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "6px 14px", borderRadius: 6,
                background: "var(--brand)", color: "var(--t1)",
                border: "none", fontSize: 12, fontWeight: 500, cursor: state === "running" ? "default" : "pointer",
                opacity: state === "running" ? 0.7 : 1,
              }}
            >
              {state === "running" ? <Loader2 style={{ width: 12, height: 12, animation: "spin 1s linear infinite" }} /> : <Zap style={{ width: 12, height: 12 }} />}
              {primary.label}
              <RiskChip risk={primary.risk} />
            </button>
          )}
          {secondary.length > 0 && (
            <button
              onClick={() => setExpanded(!expanded)}
              style={{
                padding: "6px 10px", borderRadius: 6, border: "1px solid var(--border)",
                background: "transparent", color: "var(--t3)", fontSize: 12, cursor: "pointer",
                display: "flex", alignItems: "center", gap: 4,
              }}
            >
              More <ChevronDown style={{ width: 12, height: 12, transform: expanded ? "rotate(180deg)" : "none", transition: "transform 150ms" }} />
            </button>
          )}
        </div>
      )}

      {/* Secondary actions */}
      {expanded && secondary.length > 0 && (
        <div style={{ padding: "0 14px 12px", display: "flex", flexWrap: "wrap", gap: 8 }}>
          {secondary.map((action, i) => (
            <button
              key={i}
              onClick={() => handleAction(action)}
              disabled={state === "running"}
              style={{
                padding: "5px 12px", borderRadius: 6, border: "1px solid var(--border)",
                background: "transparent", color: "var(--t2)", fontSize: 12, cursor: "pointer",
                display: "flex", alignItems: "center", gap: 6,
              }}
            >
              {action.label} <RiskChip risk={action.risk} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
