import { ShieldCheck, Gauge, FileSearch, AlertTriangle, Clock, Share2, FlaskConical, TrendingUp } from "lucide-react";

/**
 * ConversationMeta — the honest footer under every explained Brain answer.
 * Surfaces the Explainability envelope (confidence, trust, evidence count,
 * contradictions) and one-click shortcuts that keep the user inside FLOW:
 * open the entity's cross-capability workspace (graph + timeline), or ask the
 * Brain to simulate / predict (which reuse the Simulation & Prediction engines).
 *
 * No new data — reads `message.explanation` produced by `explain:true`.
 */
function levelColor(level) {
  switch (String(level)) {
    case "very_high": case "high":     return "var(--p-normal-text)";
    case "moderate":                    return "var(--p-info-text)";
    case "low": case "very_low":        return "var(--p-high-text)";
    default:                            return "var(--t4)";
  }
}

function Pill({ icon: Icon, label, value, color, title, onClick }) {
  const clickable = Boolean(onClick);
  return (
    <span
      onClick={onClick}
      title={title}
      style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        padding: "3px 8px", borderRadius: 4, fontSize: 11, fontWeight: 500,
        background: "rgba(31,27,22,0.045)", border: "1px solid var(--border)",
        color: color || "var(--t3)", cursor: clickable ? "pointer" : "default",
        userSelect: "none",
      }}
    >
      <Icon style={{ width: 11, height: 11 }} />
      <span style={{ color: "var(--t5)", textTransform: "uppercase", letterSpacing: "0.05em", fontSize: 9 }}>{label}</span>
      <span style={{ color: color || "var(--t2)", fontVariantNumeric: "tabular-nums" }}>{value}</span>
    </span>
  );
}

function ShortcutBtn({ icon: Icon, label, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        padding: "4px 10px", borderRadius: 4, fontSize: 11,
        background: "transparent", border: "1px solid var(--border-strong)",
        color: "var(--t3)", cursor: "pointer", transition: "all 100ms",
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--accent-line)"; e.currentTarget.style.color = "var(--t1)"; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border-strong)"; e.currentTarget.style.color = "var(--t3)"; }}
    >
      <Icon style={{ width: 11, height: 11 }} />
      {label}
    </button>
  );
}

export default function ConversationMeta({ explanation, evidenceOpen, onToggleEvidence, onFollowUp, onOpenEntity }) {
  if (!explanation) return null;

  const conf = explanation.confidence || {};
  const trust = explanation.trust || {};
  const evidence = explanation.evidence || [];
  const contradictions = explanation.contradictions || [];
  const entityId = explanation.meta?.entityId || null;
  const subject = explanation.executiveSummary
    ? explanation.executiveSummary.split(/[.\n]/)[0].slice(0, 60)
    : "this";
  const relatedNeighbors = explanation.graph?.neighbors || explanation.graph?.related || [];

  return (
    <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 10 }}>
      {/* Signal pills */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
        {conf.overall != null && (
          <Pill icon={Gauge} label="Confidence" value={`${conf.overall}%`}
            color={levelColor(conf.level)} title={conf.explanation || "Model confidence in this answer"} />
        )}
        {trust.score != null && (
          <Pill icon={ShieldCheck} label="Trust" value={`${trust.score}%`}
            color={levelColor(trust.level)}
            title={(trust.factors || []).map(f => `${f.factor} (${f.effect > 0 ? "+" : ""}${f.effect})`).join(" · ") || "Corroboration-adjusted trust"} />
        )}
        {evidence.length > 0 && (
          <Pill icon={FileSearch} label="Evidence" value={`${evidence.length}${evidenceOpen ? " ▲" : " ▾"}`}
            title="Show the sources behind this answer" onClick={onToggleEvidence} />
        )}
        {contradictions.length > 0 && (
          <Pill icon={AlertTriangle} label="Conflicts" value={contradictions.length}
            color="var(--p-critical-text)" title="Unresolved contradictions were found and surfaced, not hidden" />
        )}
      </div>

      {/* Related entities */}
      {relatedNeighbors.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
          <span style={{ fontSize: 10, color: "var(--t5)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Related</span>
          {relatedNeighbors.slice(0, 5).map((n, i) => {
            const id = n.id || n.entityId || n.nodeId;
            const name = n.name || n.title || n.label || id;
            return (
              <button key={id || i} onClick={() => id && onOpenEntity?.(id)}
                style={{
                  padding: "2px 8px", borderRadius: 3, fontSize: 11, cursor: id ? "pointer" : "default",
                  background: "var(--accent-dim)", border: "1px solid var(--brand-line)", color: "var(--t3)",
                }}>
                {String(name).slice(0, 28)}
              </button>
            );
          })}
        </div>
      )}

      {/* Cohesive-OS shortcuts — never leave FLOW */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {entityId && <ShortcutBtn icon={Share2} label="Graph & Timeline" onClick={() => onOpenEntity?.(entityId)} />}
        <ShortcutBtn icon={Clock}       label="Timeline"   onClick={() => onFollowUp?.(`Show me the recent timeline for ${subject}`)} />
        <ShortcutBtn icon={FlaskConical} label="Simulate"  onClick={() => onFollowUp?.(`Simulate: what happens if ${subject} changes?`)} />
        <ShortcutBtn icon={TrendingUp}  label="Predict"    onClick={() => onFollowUp?.(`What is likely to happen next with ${subject}?`)} />
      </div>
    </div>
  );
}
