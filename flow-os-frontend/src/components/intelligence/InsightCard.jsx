/**
 * InsightCard — reusable card for Risk / Opportunity / Trend / Prediction / Recommendation.
 * Every card shows: type + category, title, summary, evidence (expandable), confidence /
 * severity badge, and a suggested action with an "Act" affordance.
 * Never hides the evidence — all claims are verifiable.
 */
import { useState } from "react";
import { ChevronDown, ArrowRight } from "lucide-react";

const TYPE_CFG = {
  RISK:           { label: "Risk",           color: "var(--p-critical-text)", bg: "rgba(255,87,87,0.06)",   border: "rgba(255,87,87,0.20)"   },
  OPPORTUNITY:    { label: "Opportunity",    color: "var(--p-normal-text)",   bg: "rgba(76,175,130,0.06)", border: "rgba(76,175,130,0.20)"  },
  TREND:          { label: "Trend",          color: "var(--p-info-text)",     bg: "rgba(91,158,255,0.06)", border: "rgba(91,158,255,0.20)"  },
  PREDICTION:     { label: "Prediction",     color: "var(--p-high-text)",     bg: "rgba(255,151,65,0.06)", border: "rgba(255,151,65,0.20)"  },
  RECOMMENDATION: { label: "Recommendation", color: "var(--accent)",          bg: "rgba(232,103,43,0.06)", border: "rgba(232,103,43,0.20)"  },
};

const SEV_CFG = {
  HIGH:   { color: "var(--p-critical-text)", bg: "rgba(255,87,87,0.08)",   border: "rgba(255,87,87,0.22)"   },
  MEDIUM: { color: "var(--p-high-text)",     bg: "rgba(255,151,65,0.08)",  border: "rgba(255,151,65,0.22)"  },
  LOW:    { color: "var(--t4)",              bg: "rgba(31,27,22,0.04)",    border: "var(--line-1)"           },
};

const CONF_CFG = {
  HIGH:   { label: "High confidence",   color: "var(--p-normal-text)",  bg: "rgba(76,175,130,0.08)", border: "rgba(76,175,130,0.22)"  },
  MEDIUM: { label: "Medium confidence", color: "var(--p-high-text)",    bg: "rgba(255,151,65,0.08)", border: "rgba(255,151,65,0.22)"  },
  LOW:    { label: "Low confidence",    color: "var(--t4)",             bg: "rgba(31,27,22,0.04)",   border: "var(--line-1)"           },
};

const DIR_LABEL = { UP: "↑ Increasing", DOWN: "↓ Decreasing", STABLE: "→ Stable" };
const DIR_COLOR = { UP: "var(--p-normal-text)", DOWN: "var(--p-critical-text)", STABLE: "var(--t4)" };

function Badge({ children, color, bg, border }) {
  return (
    <span style={{ fontSize: 9, fontWeight: 500, letterSpacing: "0.06em", textTransform: "uppercase", padding: "2px 6px", borderRadius: 3, color, background: bg, border: `1px solid ${border}` }}>
      {children}
    </span>
  );
}

export default function InsightCard({ insight, onAction, onDismiss, compact = false }) {
  const [expanded, setExpanded] = useState(false);

  if (!insight) return null;

  const t    = TYPE_CFG[insight.type]  || TYPE_CFG.RECOMMENDATION;
  const sev  = insight.severity   ? SEV_CFG[insight.severity]    || SEV_CFG.LOW   : null;
  const conf = insight.confidence ? CONF_CFG[insight.confidence] || CONF_CFG.LOW  : null;
  const dir  = insight.direction  ? insight.direction : null;
  const hasEvidence = (insight.evidence || []).filter(Boolean).length > 0;

  return (
    <div style={{ background: t.bg, border: `1px solid ${t.border}`, borderRadius: 7, padding: compact ? "10px 12px" : "13px 16px", display: "flex", flexDirection: "column", gap: 8, fontFamily: "var(--font-ui)" }}>

      {/* Header row */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Type + category + badges */}
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 5, marginBottom: 5 }}>
            <span style={{ fontSize: 9, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: t.color }}>{t.label}</span>
            <span style={{ fontSize: 9, color: "var(--t5)", padding: "1px 5px", border: "1px solid var(--line-1)", borderRadius: 3, background: "rgba(31,27,22,0.04)" }}>{insight.category}</span>
            {sev  && <Badge color={sev.color}  bg={sev.bg}   border={sev.border}>{insight.severity}</Badge>}
            {conf && <Badge color={conf.color} bg={conf.bg}  border={conf.border}>{conf.label}</Badge>}
            {dir  && <span style={{ fontSize: 10, color: DIR_COLOR[dir], fontWeight: 500 }}>{DIR_LABEL[dir]}</span>}
          </div>
          {/* Title */}
          <div style={{ fontSize: compact ? 12 : 13, fontWeight: 500, color: "var(--t1)", lineHeight: 1.35 }}>{insight.title}</div>
        </div>
        {onDismiss && (
          <button onClick={() => onDismiss(insight)} aria-label="Dismiss insight"
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--t5)", padding: 2, flexShrink: 0, fontSize: 12, lineHeight: 1 }}>
            ✕
          </button>
        )}
      </div>

      {/* Summary */}
      {!compact && (
        <div style={{ fontSize: 12, color: "var(--t3)", lineHeight: 1.55 }}>{insight.summary}</div>
      )}

      {/* Evidence (expandable — always present so every claim is verifiable) */}
      {hasEvidence && (
        <div>
          <button
            onClick={() => setExpanded(e => !e)}
            style={{ fontSize: 10, color: "var(--t5)", background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", gap: 3 }}
          >
            {expanded ? "Hide" : "Why this?"}&nbsp;
            <ChevronDown style={{ width: 10, height: 10, transform: expanded ? "rotate(180deg)" : "none", transition: "transform 150ms" }} />
          </button>
          {expanded && (
            <ul style={{ margin: "6px 0 0", padding: "0 0 0 12px", display: "flex", flexDirection: "column", gap: 3, listStyle: "disc" }}>
              {insight.evidence.filter(Boolean).map((e, i) => (
                <li key={i} style={{ fontSize: 11, color: "var(--t4)", lineHeight: 1.5 }}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Suggested action footer */}
      {insight.suggestedAction && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 6, borderTop: `1px solid ${t.border}`, gap: 8 }}>
          <span style={{ fontSize: 11, color: t.color, fontWeight: 500, lineHeight: 1.4, flex: 1 }}>
            {insight.suggestedAction}
          </span>
          {onAction && (
            <button
              onClick={() => onAction(insight)}
              style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 500, padding: "3px 10px", borderRadius: 4, background: t.color, color: "#fff", border: "none", cursor: "pointer", flexShrink: 0, whiteSpace: "nowrap" }}
            >
              Act <ArrowRight style={{ width: 9, height: 9 }} />
            </button>
          )}
        </div>
      )}

      {/* Data sources */}
      {!compact && insight.sources?.length > 0 && (
        <div style={{ fontSize: 9, color: "var(--t5)", textTransform: "uppercase", letterSpacing: "0.07em" }}>
          Sources: {insight.sources.join(", ")}
        </div>
      )}
    </div>
  );
}
