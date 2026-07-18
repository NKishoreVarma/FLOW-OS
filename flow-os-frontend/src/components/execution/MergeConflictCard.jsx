import { GitMerge, FileDiff, GitPullRequest, MessageSquare, CalendarPlus, Users, AlertTriangle } from "lucide-react";
import { useNavigate } from "react-router-dom";

/**
 * MergeConflictCard (Phase 14 M4) — the flagship merge-conflict notification. Shows
 * the affected files and the ONLY people involved, with the actions that keep the fix
 * inside FLOW: Open Diff · Open PR · Message <owner> · Create Meeting.
 *
 * Consumes the /api/collaboration/conflicts shape:
 *   { repo, number, ownership:{ owners, overlappingFiles, suggestedNextStep }, message }
 */
const ACTION_ICON = { open_diff: FileDiff, open_pr: GitPullRequest, message: MessageSquare, create_meeting: CalendarPlus };

export default function MergeConflictCard({ conflict = {} }) {
  const navigate = useNavigate();
  const o = conflict.ownership || conflict;
  const files = o.overlappingFiles || o.files || [];
  const owners = o.owners || conflict.notify || [];
  const actions = o.suggestedActions || [];

  const run = (a) => {
    switch (a.kind) {
      case "open_diff":
      case "open_pr":
        if (a.payload?.url) window.open(a.payload.url, "_blank");
        else navigate("/projects");
        break;
      case "message":
        window.dispatchEvent(new CustomEvent("flow:open-compose"));
        break;
      case "create_meeting":
        navigate("/meetings");
        break;
      default: break;
    }
  };

  return (
    <div style={{ border: "1px solid rgba(255,151,65,0.30)", borderLeft: "2px solid var(--p-high)", borderRadius: 6, background: "rgba(255,151,65,0.05)", overflow: "hidden", maxWidth: 520 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderBottom: "1px solid rgba(255,151,65,0.20)" }}>
        <GitMerge style={{ width: 13, height: 13, color: "var(--p-high)" }} />
        <span style={{ fontSize: 12, fontWeight: 500, color: "var(--t1)" }}>
          Merge conflict{o.repo ? ` in ${o.repo}` : ""}{o.number ? ` · PR #${o.number}` : ""}
        </span>
      </div>

      <div style={{ padding: "12px", display: "flex", flexDirection: "column", gap: 12 }}>
        {files.length > 0 && (
          <div>
            <Label icon={FileDiff}>Files affected</Label>
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {files.map((f, i) => (
                <span key={i} style={{ fontFamily: "var(--font-data)", fontSize: 11, color: "var(--t2)" }}>• {f}</span>
              ))}
            </div>
          </div>
        )}

        {owners.length > 0 && (
          <div>
            <Label icon={Users}>Primary owners</Label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {owners.map((p, i) => (
                <span key={i} style={{ fontSize: 11, color: "var(--t2)", background: "rgba(31,27,22,0.05)", border: "1px solid var(--border)", borderRadius: 10, padding: "2px 9px" }}>{p}</span>
              ))}
            </div>
          </div>
        )}

        {o.suggestedNextStep && (
          <div style={{ display: "flex", alignItems: "flex-start", gap: 7, fontSize: 12, color: "var(--t3)", lineHeight: 1.5 }}>
            <AlertTriangle style={{ width: 12, height: 12, color: "var(--p-high)", flexShrink: 0, marginTop: 2 }} />
            {o.suggestedNextStep}
          </div>
        )}

        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, paddingTop: 2 }}>
          {actions.map((a, i) => {
            const Icon = ACTION_ICON[a.kind] || FileDiff;
            return (
              <button key={i} onClick={() => run(a)}
                style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 11px", borderRadius: 4, fontSize: 11, cursor: "pointer", background: "rgba(31,27,22,0.045)", border: "1px solid var(--border-strong)", color: "var(--t3)" }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent-line)"; e.currentTarget.style.color = "var(--t1)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border-strong)"; e.currentTarget.style.color = "var(--t3)"; }}
              >
                <Icon style={{ width: 11, height: 11 }} /> {a.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Label({ icon: Icon, children }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
      <Icon style={{ width: 10, height: 10, color: "var(--t5)" }} />
      <span style={{ fontSize: 9, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--t5)" }}>{children}</span>
    </div>
  );
}
