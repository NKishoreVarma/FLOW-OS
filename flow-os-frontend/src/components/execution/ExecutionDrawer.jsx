import { useState, useEffect, useRef } from "react";
import { X, ShieldCheck, AlertTriangle, Check, Clock, Loader2, RotateCcw, RefreshCw } from "lucide-react";
import executionApi from "../../lib/executionApi";

// ─── Execution status display ─────────────────────────────────────────────────
const STATUS_CONFIG = {
  PENDING:        { label: "Pending",         color: "var(--t4)",               spin: false },
  PREPARING:      { label: "Preparing…",      color: "var(--p-info-text)",      spin: true },
  EXECUTING:      { label: "Executing…",      color: "var(--accent)",           spin: true },
  WAITING:        { label: "Waiting",         color: "var(--p-high-text)",      spin: false },
  COMPLETED:      { label: "Completed",       color: "var(--p-normal-text)",    spin: false },
  FAILED:         { label: "Failed",          color: "var(--p-critical-text)",  spin: false },
  ROLLED_BACK:    { label: "Rolled Back",     color: "var(--p-high-text)",      spin: false },
  CANCELLED:      { label: "Cancelled",       color: "var(--t4)",               spin: false },
  PARTIAL_SUCCESS:{ label: "Partial Success", color: "var(--p-high-text)",      spin: false },
};

const STATUS_ICONS = {
  PENDING: Clock, PREPARING: Loader2, EXECUTING: Loader2, WAITING: Clock,
  COMPLETED: Check, FAILED: AlertTriangle, ROLLED_BACK: RotateCcw,
  CANCELLED: X, PARTIAL_SUCCESS: AlertTriangle,
};

const RISK_COLOR = {
  LOW: "var(--p-normal-text)", MEDIUM: "var(--p-info-text)",
  HIGH: "var(--p-high-text)",  CRITICAL: "var(--p-critical-text)",
};

function trackTelemetry(event, props = {}) {
  const token = localStorage.getItem("flow_os_token") || "";
  const wsId   = localStorage.getItem("flow_os_workspace_id") || "";
  if (!token || !wsId) return;
  fetch("/api/analytics/event", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "workspace-id": wsId, "Content-Type": "application/json" },
    body: JSON.stringify({ event, properties: props }),
  }).catch(() => {});
}

// ─── Section wrapper ──────────────────────────────────────────────────────────
function Section({ label, children }) {
  return (
    <div>
      <div style={{ fontSize: 9, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--t5)", marginBottom: 8 }}>
        {label}
      </div>
      {children}
    </div>
  );
}

// ─── Spinner ─────────────────────────────────────────────────────────────────
function Spinning() {
  return <Loader2 style={{ width: 13, height: 13, color: "var(--t4)", animation: "spin 1s linear infinite" }} />;
}

// ─── Main component ───────────────────────────────────────────────────────────
export function ExecutionDrawer() {
  const [isOpen, setIsOpen]           = useState(false);
  const [card, setCard]               = useState(null);
  const [preview, setPreview]         = useState(null);
  const [previewLoading, setPrevLoad] = useState(false);
  const [history, setHistory]         = useState([]);
  const [histLoading, setHistLoad]    = useState(false);
  const [execStatus, setExecStatus]   = useState("PENDING");
  const [execMessage, setExecMessage] = useState(null);
  const [execPhase, setExecPhase]     = useState("idle"); // idle|running|confirm|done|error|approval
  const openedAt = useRef(null);

  // ── Listen for open event ─────────────────────────────────────────────────
  useEffect(() => {
    const open = (e) => {
      const c = e.detail?.card;
      if (!c) return;
      openedAt.current = Date.now();
      setCard(c);
      setPreview(null);
      setHistory([]);
      setExecStatus("PENDING");
      setExecMessage(null);
      setExecPhase("idle");
      setIsOpen(true);
      trackTelemetry("execution.drawer.opened", { type: c.type, title: c.title });

      // Load plan preview
      const rec = { title: c.title, steps: c.actions?.[0]?.steps || [] };
      setPrevLoad(true);
      executionApi.plan(rec)
        .then((d) => setPreview(d.preview || d))
        .catch(() => setPreview(null))
        .finally(() => setPrevLoad(false));

      // Load execution history
      setHistLoad(true);
      executionApi.history(10)
        .then((d) => setHistory((d.history || d.records || []).slice(0, 5)))
        .catch(() => setHistory([]))
        .finally(() => setHistLoad(false));
    };
    window.addEventListener("flow:open-execution-drawer", open);
    window.addEventListener("flow:close-execution-drawer", () => setIsOpen(false));
    return () => {
      window.removeEventListener("flow:open-execution-drawer", open);
      window.removeEventListener("flow:close-execution-drawer", () => setIsOpen(false));
    };
  }, []);

  // ── Esc to close ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    const h = (e) => { if (e.key === "Escape") setIsOpen(false); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [isOpen]);

  // ── Execute ───────────────────────────────────────────────────────────────
  async function execute(confirmed = false) {
    const primaryAction = card?.actions?.[0];
    if (!primaryAction) return;

    // If this action has a client-side onClick override, use it
    if (primaryAction.onClick) {
      primaryAction.onClick();
      setExecStatus("COMPLETED");
      setExecPhase("done");
      setExecMessage(`${primaryAction.label} initiated.`);
      trackTelemetry("action.executed", { type: card.type, label: primaryAction.label, method: "onclick" });
      return;
    }

    setExecPhase("running");
    setExecStatus("PREPARING");
    setExecMessage(null);
    const t0 = Date.now();

    try {
      setExecStatus("EXECUTING");
      const rec = { title: primaryAction.label || card.title, steps: primaryAction.steps || [] };
      const out = await executionApi.execute(rec, { confirmed });
      const step = out.results?.[0] || {};
      const elapsed = Date.now() - t0;

      if (step.status === "EXECUTED" || out.completed) {
        setExecStatus("COMPLETED");
        setExecPhase("done");
        setExecMessage(`${primaryAction.label} completed.`);
        trackTelemetry("action.executed", { type: card.type, label: primaryAction.label, elapsedMs: elapsed, success: true });
      } else if (step.status === "CONFIRM_REQUIRED") {
        setExecStatus("WAITING");
        setExecPhase("confirm");
        setExecMessage(step.reason || "Confirm to proceed.");
      } else if (step.status === "APPROVAL_REQUIRED") {
        setExecStatus("WAITING");
        setExecPhase("approval");
        setExecMessage(`Sent for approval — ${step.requiredApprovals || 1} approval(s) required.`);
        trackTelemetry("action.approval_required", { type: card.type, label: primaryAction.label });
      } else if (step.status === "DENIED") {
        setExecStatus("FAILED");
        setExecPhase("error");
        setExecMessage(step.error || "Denied by governance.");
        trackTelemetry("action.denied", { type: card.type, label: primaryAction.label });
      } else {
        setExecStatus("PARTIAL_SUCCESS");
        setExecPhase("error");
        setExecMessage(step.error || "Partially completed.");
      }
    } catch (err) {
      setExecStatus("FAILED");
      setExecPhase("error");
      setExecMessage(err.message || "Something went wrong. FLOW could not reach the execution service.");
      trackTelemetry("action.failed", { type: card.type, error: err.message });
    }
  }

  if (!isOpen || !card) return null;

  const primaryAction = card.actions?.[0];
  const riskLevel = preview?.planRisk || primaryAction?.risk || "MEDIUM";
  const rollbackAvailable = preview?.rollbackAvailable ?? preview?.steps?.[0]?.rollbackAvailable ?? false;
  const affectedSystems = [...new Set(
    (primaryAction?.steps || []).map((s) => s.connector).concat(card.source ? [card.source] : []).filter(Boolean)
  )];

  const statusCfg = STATUS_CONFIG[execStatus] || STATUS_CONFIG.PENDING;
  const StatusIcon = STATUS_ICONS[execStatus] || Clock;

  const approvalRequired = preview?.steps?.some((s) => s.gate === "APPROVAL") || execPhase === "approval";

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={() => setIsOpen(false)}
        style={{ position: "fixed", inset: 0, background: "rgba(31,27,22,0.25)", backdropFilter: "blur(2px)", zIndex: 500 }}
      />

      {/* Drawer */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Execution Details"
        style={{
          position: "fixed", top: 0, right: 0, bottom: 0, width: 400, maxWidth: "90vw",
          background: "var(--surface-0)", borderLeft: "1px solid var(--line-1)",
          zIndex: 501, display: "flex", flexDirection: "column",
          fontFamily: "var(--font-ui)",
          boxShadow: "-16px 0 48px rgba(31,27,22,0.12)",
        }}
      >
        {/* Header */}
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--line-0)", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 9, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--t5)", marginBottom: 5 }}>
                Execution Details
              </div>
              <div style={{ fontSize: 15, fontWeight: 500, color: "var(--t1)", lineHeight: 1.3, marginBottom: card.subtitle ? 3 : 0 }}>
                {card.title}
              </div>
              {card.subtitle && (
                <div style={{ fontSize: 12, color: "var(--t3)" }}>{card.subtitle}</div>
              )}
            </div>
            <button
              onClick={() => setIsOpen(false)}
              aria-label="Close"
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--t4)", padding: 4, display: "flex", borderRadius: 3, flexShrink: 0 }}
            >
              <X style={{ width: 14, height: 14 }} />
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px", display: "flex", flexDirection: "column", gap: 22 }}>

          {/* 1. Execution Status */}
          <Section label="Execution Status">
            <div style={{
              display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
              background: "rgba(31,27,22,0.03)", borderRadius: 5, border: "1px solid var(--line-1)",
            }}>
              <StatusIcon style={{
                width: 14, height: 14, color: statusCfg.color, flexShrink: 0,
                ...(statusCfg.spin ? { animation: "spin 1s linear infinite" } : {}),
              }} />
              <span style={{ fontSize: 13, fontWeight: 400, color: statusCfg.color }}>{statusCfg.label}</span>
              {execMessage && (
                <span style={{ fontSize: 11, color: "var(--t3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  — {execMessage}
                </span>
              )}
            </div>
          </Section>

          {/* 2. Risk Level */}
          <Section label="Risk Level">
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <ShieldCheck style={{ width: 13, height: 13, color: RISK_COLOR[riskLevel] || "var(--t3)" }} />
              <span style={{ fontSize: 13, fontWeight: 500, color: RISK_COLOR[riskLevel] || "var(--t3)" }}>
                {riskLevel} risk
              </span>
              {preview?.steps?.[0]?.riskReasons?.[0] && (
                <span style={{ fontSize: 11, color: "var(--t4)", overflow: "hidden", textOverflow: "ellipsis" }}>
                  — {preview.steps[0].riskReasons[0]}
                </span>
              )}
            </div>
          </Section>

          {/* 3. Evidence */}
          {card.evidenceLines?.length > 0 && (
            <Section label="Evidence">
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {card.evidenceLines.map((line, i) => (
                  <div key={i} style={{ fontSize: 12, color: "var(--t3)", lineHeight: 1.5 }}>
                    · {line}
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* 4. Affected Systems */}
          {affectedSystems.length > 0 && (
            <Section label="Affected Systems">
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {affectedSystems.map((sys) => (
                  <span key={sys} style={{
                    fontSize: 11, padding: "2px 8px", borderRadius: 3,
                    background: "rgba(31,27,22,0.05)", border: "1px solid var(--line-1)", color: "var(--t3)",
                  }}>
                    {sys}
                  </span>
                ))}
              </div>
            </Section>
          )}

          {/* 5. Execution Preview */}
          <Section label="Execution Preview">
            {previewLoading ? (
              <Spinning />
            ) : preview?.steps?.length ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {preview.steps.map((step, i) => (
                  <div key={i} style={{
                    display: "flex", alignItems: "flex-start", gap: 8, padding: "8px 10px",
                    background: "rgba(31,27,22,0.03)", borderRadius: 4, border: "1px solid var(--line-0)",
                  }}>
                    <span style={{ fontSize: 11, fontWeight: 500, color: "var(--t4)", flexShrink: 0, minWidth: 16, paddingTop: 1 }}>
                      {i + 1}.
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, color: "var(--t2)" }}>{step.title || step.actionType}</div>
                      {step.connector && (
                        <div style={{ fontSize: 10, color: "var(--t5)", marginTop: 2 }}>{step.connector}</div>
                      )}
                    </div>
                    {step.gate && (
                      <span style={{
                        fontSize: 10, padding: "1px 5px", borderRadius: 3, flexShrink: 0,
                        background: "rgba(255,151,65,0.08)", border: "1px solid rgba(255,151,65,0.20)",
                        color: "var(--p-high-text)",
                      }}>
                        {step.gate}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: "var(--t4)" }}>
                {primaryAction?.label || "Execute"} —{" "}
                {primaryAction?.steps?.length || 0} step{(primaryAction?.steps?.length || 0) !== 1 ? "s" : ""}
              </div>
            )}
          </Section>

          {/* 6. Approval Requirements */}
          {approvalRequired && (
            <Section label="Approval Requirements">
              <div style={{ padding: "10px 12px", background: "rgba(255,151,65,0.06)", border: "1px solid rgba(255,151,65,0.20)", borderRadius: 5 }}>
                <div style={{ fontSize: 12, color: "var(--p-high-text)", marginBottom: 3, fontWeight: 500 }}>
                  Approval required before execution
                </div>
                <div style={{ fontSize: 11, color: "var(--t3)" }}>
                  {preview?.steps?.[0]?.requiredApprovals || 1} approval(s) required. FLOW will notify approvers automatically.
                </div>
              </div>
            </Section>
          )}

          {/* 7. Rollback Capability */}
          <Section label="Rollback Capability">
            <div style={{ fontSize: 12, color: rollbackAvailable ? "var(--p-normal-text)" : "var(--t4)" }}>
              {rollbackAvailable
                ? "✓ This action supports rollback. You can undo it from Activity."
                : "Rollback is not available for this action type. Review the preview carefully before executing."}
            </div>
          </Section>

          {/* 8. Execution History */}
          <Section label="Recent Executions">
            {histLoading ? (
              <Spinning />
            ) : history.length ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {history.map((h, i) => (
                  <div key={h.id || i} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "7px 10px", background: "rgba(31,27,22,0.03)", borderRadius: 4,
                  }}>
                    <span style={{ fontSize: 11, color: "var(--t2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                      {h.recommendation?.title || h.title || "Action"}
                    </span>
                    <span style={{
                      fontSize: 10, marginLeft: 8, flexShrink: 0, fontFamily: "var(--font-data)",
                      color: h.status === "EXECUTED" ? "var(--p-normal-text)" : "var(--t4)",
                    }}>
                      {h.status || "UNKNOWN"}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: "var(--t4)" }}>
                No recent executions in this workspace.
              </div>
            )}
          </Section>
        </div>

        {/* Footer action bar */}
        <div style={{ padding: "14px 20px", borderTop: "1px solid var(--line-0)", display: "flex", gap: 8, flexShrink: 0 }}>
          {execPhase === "idle" && primaryAction && (
            <button
              onClick={() => execute(false)}
              style={{
                flex: 1, padding: "9px", borderRadius: 5, background: "var(--accent)",
                border: "none", cursor: "pointer", fontSize: 13, fontWeight: 500, color: "#fff",
              }}
            >
              {primaryAction.label || "Execute"}
            </button>
          )}

          {execPhase === "running" && (
            <button
              disabled
              style={{
                flex: 1, padding: "9px", borderRadius: 5, background: "var(--accent)", border: "none",
                fontSize: 13, fontWeight: 500, color: "#fff", opacity: 0.65,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8, cursor: "not-allowed",
              }}
            >
              <Loader2 style={{ width: 13, height: 13, animation: "spin 1s linear infinite" }} />
              Executing…
            </button>
          )}

          {execPhase === "confirm" && (
            <button
              onClick={() => execute(true)}
              style={{
                flex: 1, padding: "9px", borderRadius: 5, background: "var(--accent)",
                border: "none", cursor: "pointer", fontSize: 13, fontWeight: 500, color: "#fff",
              }}
            >
              Confirm & Execute
            </button>
          )}

          {execPhase === "approval" && (
            <button
              disabled
              style={{
                flex: 1, padding: "9px", borderRadius: 5, background: "rgba(255,151,65,0.10)",
                border: "1px solid rgba(255,151,65,0.25)", fontSize: 13, color: "var(--p-high-text)", cursor: "not-allowed",
              }}
            >
              Awaiting Approval
            </button>
          )}

          {(execPhase === "done" || execPhase === "error") && (
            <>
              {execPhase === "error" && (
                <button
                  onClick={() => { setExecPhase("idle"); setExecStatus("PENDING"); setExecMessage(null); }}
                  style={{
                    display: "flex", alignItems: "center", gap: 6, padding: "9px 14px", borderRadius: 5,
                    background: "rgba(31,27,22,0.06)", border: "1px solid var(--line-1)",
                    cursor: "pointer", fontSize: 12, color: "var(--t2)",
                  }}
                >
                  <RefreshCw style={{ width: 11, height: 11 }} /> Retry
                </button>
              )}
              <button
                onClick={() => setIsOpen(false)}
                style={{
                  flex: 1, padding: "9px", borderRadius: 5, background: "rgba(31,27,22,0.06)",
                  border: "1px solid var(--line-1)", cursor: "pointer", fontSize: 13, color: "var(--t2)",
                }}
              >
                Close
              </button>
            </>
          )}

          {execPhase === "idle" && (
            <button
              onClick={() => setIsOpen(false)}
              style={{
                padding: "9px 14px", borderRadius: 5, background: "transparent",
                border: "1px solid var(--line-1)", cursor: "pointer", fontSize: 12, color: "var(--t4)",
              }}
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </>
  );
}

export default ExecutionDrawer;
