import { Lightbulb, CheckSquare, Sparkles, ArrowRight, Mail, CalendarPlus, GitPullRequest, BellRing } from "lucide-react";

/**
 * RecommendedActions — turns the Brain's recommendations into real, one-click actions
 * that land on the RIGHT affordance (Phase 16 "execution shortcut"). Each action's
 * semantic type (create_issue / send_email / create_meeting / merge_pr / notify…) maps
 * to its concrete in-FLOW surface, plus an "Ask FLOW" to carry it out. Everything stays
 * inside FLOW — reuses existing flow:* events + routes, no new backend.
 */
function actionText(a) {
  if (typeof a === "string") return a;
  return a?.title || a?.action || a?.description || a?.label || "Recommended action";
}

function toJiraDraft(text, explanation) {
  const subject = explanation?.executiveSummary?.split(/[.\n]/)[0]?.slice(0, 80) || "";
  return {
    title: text.slice(0, 100),
    description: [text, subject && `Context: ${subject}`].filter(Boolean).join("\n\n"),
    priority: "P2",
    flowSource: explanation?.meta?.entityId || "Operational Brain recommendation",
  };
}

// Map an action to its concrete affordance from its semantic type (or the text).
function classify(a, text) {
  const t = String(a?.actionType || "").toLowerCase();
  const s = text.toLowerCase();
  if (/issue|task|ticket/.test(t) || /\bjira\b|create (a )?(ticket|issue|task)/.test(s)) return "jira";
  if (/email|draft/.test(t) || /\bemail\b|reply to|draft/.test(s)) return "email";
  if (/notify|escalate/.test(t) || /notify|escalate|alert the/.test(s)) return "notify";
  if (/meeting|calendar/.test(t) || /meeting|schedule a|sync with/.test(s)) return "meeting";
  if (/pr|pull|merge|deploy|review/.test(t) || /\bpr\b|pull request|merge|deploy|review the code/.test(s)) return "pr";
  return "jira";
}

export default function RecommendedActions({ actions = [], explanation, onFollowUp, onNavigate }) {
  const list = (actions || []).filter(Boolean).slice(0, 4);
  if (!list.length) return null;

  const fire = (name, detail) => window.dispatchEvent(new CustomEvent(name, detail ? { detail } : undefined));
  const nav = (r) => (onNavigate ? onNavigate(r) : onFollowUp?.(`Open ${r}`));

  const primaryFor = (kind, text) => {
    switch (kind) {
      case "email":   return { label: "Compose", icon: Mail, run: () => fire("flow:open-compose") };
      case "notify":  return { label: "Notify team", icon: BellRing, run: () => fire("flow:open-compose") };
      case "meeting": return { label: "Schedule", icon: CalendarPlus, run: () => nav("/meetings") };
      case "pr":      return { label: "Open PR", icon: GitPullRequest, run: () => nav("/projects") };
      default:        return { label: "Create Jira", icon: CheckSquare, run: () => fire("flow:create-jira", toJiraDraft(text, explanation)) };
    }
  };

  const btn = (icon, label, run, primary) => {
    const Icon = icon;
    return (
      <button onClick={run}
        style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 4, fontSize: 11, fontWeight: 500, cursor: "pointer",
          background: primary ? "var(--accent-dim)" : "rgba(31,27,22,0.045)",
          border: `1px solid ${primary ? "var(--brand-line)" : "var(--border-strong)"}`, color: primary ? "var(--brand-text)" : "var(--t3)" }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent-line)"; if (!primary) e.currentTarget.style.color = "var(--t1)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = primary ? "var(--brand-line)" : "var(--border-strong)"; if (!primary) e.currentTarget.style.color = "var(--t3)"; }}>
        <Icon style={{ width: 10, height: 10 }} /> {label}
      </button>
    );
  };

  return (
    <div style={{ marginTop: 12, border: "1px solid var(--brand-line)", borderRadius: 6, background: "rgba(232,103,43,0.04)", overflow: "hidden", maxWidth: 520 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", borderBottom: "1px solid var(--brand-line)" }}>
        <Lightbulb style={{ width: 12, height: 12, color: "var(--brand)" }} />
        <span style={{ fontSize: 10, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--brand-text)" }}>Recommended Actions</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {list.map((a, i) => {
          const text = actionText(a);
          const p = primaryFor(classify(a, text), text);
          return (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px", borderTop: i > 0 ? "1px solid var(--border)" : "none" }}>
              <ArrowRight style={{ width: 12, height: 12, color: "var(--t5)", marginTop: 3, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, color: "var(--t2)", lineHeight: 1.5, margin: "0 0 8px" }}>{text}</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {btn(p.icon, p.label, p.run, true)}
                  {onFollowUp && btn(Sparkles, "Ask FLOW", () => onFollowUp(`How do I do this: ${text}`), false)}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
