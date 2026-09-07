import { useState, useEffect } from "react";
import { Zap, ShieldCheck, Loader2, Check, AlertTriangle, Clock, GitPullRequest, CheckSquare } from "lucide-react";
import executionApi from "../../lib/executionApi";

/**
 * ExecutableActionCard (Phase 14 M4) — turns a recommendation into a governed,
 * one-click executable card. Shows the risk tier up front, then runs the action
 * through /api/execution (plan → execute). Honestly reflects the gate the backend
 * returns: LOW auto-runs, MEDIUM asks to confirm, HIGH/CRITICAL route to approval.
 */
const RISK_STYLE = {
  LOW:      { color: "var(--p-normal-text)",   bg: "rgba(76,175,130,0.10)",  border: "rgba(76,175,130,0.25)" },
  MEDIUM:   { color: "var(--p-info-text)",     bg: "rgba(91,158,255,0.10)",  border: "rgba(91,158,255,0.25)" },
  HIGH:     { color: "var(--p-high-text)",     bg: "rgba(255,151,65,0.10)",  border: "rgba(255,151,65,0.25)" },
  CRITICAL: { color: "var(--p-critical-text)", bg: "rgba(255,87,87,0.10)",   border: "rgba(255,87,87,0.25)" },
};

function RiskBadge({ risk }) {
  const s = RISK_STYLE[risk] || RISK_STYLE.MEDIUM;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 9, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em", padding: "2px 7px", borderRadius: 3, color: s.color, background: s.bg, border: `1px solid ${s.border}` }}>
      <ShieldCheck style={{ width: 9, height: 9 }} /> {risk} risk
    </span>
  );
}

export default function ExecutableActionCard({ card = {} }) {
  const recommendation = card.recommendation || card;
  const [preview, setPreview] = useState(null);
  const [state, setState] = useState({ phase: "idle", message: null }); // idle|running|confirm|approval|done|error

  useEffect(() => {
    let cancelled = false;
    executionApi.plan(recommendation)
      .then((d) => { if (!cancelled) setPreview(d.preview); })
      .catch(() => { if (!cancelled) setPreview(null); });
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const risk = preview?.planRisk || card.risk || "MEDIUM";
  const gate = preview?.steps?.[0]?.gate;

  async function run(confirmed) {
    setState({ phase: "running", message: null });
    try {
      const out = await executionApi.execute(recommendation, { confirmed });
      const step = out.results?.[0] || {};
      if (step.status === "EXECUTED" || out.completed) {
        // Receipt: surface the connector-confirmed id/link so success is verifiable,
        // never a bare checkmark. If the connector returned no id, say so honestly.
        const r = step.result?.result || step.result || {};
        const id = r.id || r.number || r.key || r.messageId || r.message_id || r.ts || r.eventId || r.sha || null;
        const url = r.html_url || r.htmlUrl || r.url || r.permalink || r.webLink || r.htmlLink || null;
        setState({ phase: "done", message: id ? `Confirmed by ${recommendation.connector} — ${id}` : "Executed (no receipt id returned).", receiptUrl: url });
      }
      else if (step.status === "CONFIRM_REQUIRED") setState({ phase: "confirm", message: step.reason });
      else if (step.status === "APPROVAL_REQUIRED") setState({ phase: "approval", message: `Sent for approval — ${step.requiredApprovals || 1} approval(s) required.` });
      else if (step.status === "DENIED") setState({ phase: "error", message: step.error || "Denied by governance." });
      else setState({ phase: "error", message: step.error || "Could not execute." });
    } catch (err) {
      setState({ phase: "error", message: err.message });
    }
  }

  const StatusBanner = () => {
    if (state.phase === "done") return (
      <Banner icon={Check} color="var(--p-normal-text)" text={state.message}>
        {state.receiptUrl && (
          <a href={state.receiptUrl} target="_blank" rel="noreferrer" style={{ marginLeft: 6, color: "var(--brand)", textDecoration: "underline", fontSize: 11 }}>
            Open in {recommendation.connector}
          </a>
        )}
      </Banner>
    );
    if (state.phase === "approval") return <Banner icon={Clock} color="var(--p-high-text)" text={state.message} />;
    if (state.phase === "error") return <Banner icon={AlertTriangle} color="var(--p-critical-text)" text={state.message} />;
    return null;
  };

  return (
    <div style={{ border: "1px solid var(--brand-line)", borderRadius: 6, background: "rgba(232,103,43,0.04)", overflow: "hidden", maxWidth: 520 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", borderBottom: "1px solid var(--brand-line)" }}>
        <Zap style={{ width: 12, height: 12, color: "var(--brand)" }} />
        <span style={{ fontSize: 12, fontWeight: 500, color: "var(--t1)", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {card.title || recommendation.title || "Recommended action"}
        </span>
        <RiskBadge risk={risk} />
      </div>

      <div style={{ padding: "12px" }}>
        {card.summary && <p style={{ fontSize: 12, color: "var(--t3)", lineHeight: 1.55, margin: "0 0 10px" }}>{card.summary}</p>}

        {(preview?.steps?.[0]?.riskReasons?.length > 0) && (
          <p style={{ fontSize: 11, color: "var(--t5)", margin: "0 0 10px", fontStyle: "italic" }}>
            {preview.steps[0].riskReasons[0]}
          </p>
        )}

        <StatusBanner />

        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: state.phase !== "idle" && state.phase !== "running" ? 10 : 0 }}>
          {state.phase !== "done" && state.phase !== "approval" && (
            <button
              onClick={() => run(state.phase === "confirm")}
              disabled={state.phase === "running"}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 4, fontSize: 12, fontWeight: 500, cursor: "pointer", background: "var(--brand)", border: "none", color: "#fff", opacity: state.phase === "running" ? 0.6 : 1 }}
            >
              {state.phase === "running" && <Loader2 style={{ width: 12, height: 12, animation: "spin 1s linear infinite" }} />}
              {state.phase === "confirm" ? "Confirm & run" : gate === "APPROVAL" ? "Request approval" : "Execute"}
            </button>
          )}
          <button
            onClick={() => window.dispatchEvent(new CustomEvent("flow:create-jira", { detail: { title: card.title || recommendation.title, description: card.summary || "" } }))}
            style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 4, fontSize: 12, cursor: "pointer", background: "rgba(31,27,22,0.045)", border: "1px solid var(--border-strong)", color: "var(--t3)" }}
          >
            <CheckSquare style={{ width: 11, height: 11 }} /> Create Jira
          </button>
          {recommendation.payload?.url && (
            <a href={recommendation.payload.url} target="_blank" rel="noreferrer"
              style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 4, fontSize: 12, textDecoration: "none", background: "rgba(31,27,22,0.045)", border: "1px solid var(--border-strong)", color: "var(--t3)" }}>
              <GitPullRequest style={{ width: 11, height: 11 }} /> Open
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function Banner({ icon: Icon, color, text, children }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color, background: "rgba(31,27,22,0.045)", border: "1px solid var(--border)", borderRadius: 4, padding: "8px 10px" }}>
      <Icon style={{ width: 12, height: 12, flexShrink: 0 }} /> {text}{children}
    </div>
  );
}
