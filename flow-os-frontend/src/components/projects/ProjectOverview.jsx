import { useState } from "react";
import { Activity, GitCommit, CheckSquare, Calendar, ShieldCheck, AlertTriangle, ArrowRight, User, AlertCircle, Layers, X, Zap, ChevronRight, ChevronDown } from "lucide-react";
import { useWebSocket } from "../../hooks/useWebSocket";
import { useEscapeKey } from "../../hooks/useEscapeKey";
import DiffViewer from "./DiffViewer";
import { buildEngineeringCard } from "../../lib/actionBuilders";

// ── Expandable commit row: click to see the real diff inline (no trip to GitHub) ──
function CommitRow({ commit, repoFullName }) {
  const [open, setOpen] = useState(false);
  const [owner, repo] = (repoFullName || "").split("/");
  const canDiff = Boolean(commit.sha && owner && repo);

  return (
    <div>
      <div
        onClick={canDiff ? () => setOpen(o => !o) : undefined}
        style={{
          display: "flex", gap: 8, fontSize: 11, alignItems: "center",
          cursor: canDiff ? "pointer" : "default",
          padding: "2px 0", borderRadius: 3,
        }}
        title={canDiff ? "Show file diff" : undefined}
      >
        {canDiff && (open
          ? <ChevronDown style={{ width: 10, height: 10, color: "var(--t5)", flexShrink: 0 }} />
          : <ChevronRight style={{ width: 10, height: 10, color: "var(--t5)", flexShrink: 0 }} />)}
        <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: "var(--p-info-text)", flexShrink: 0 }}>{commit.hash}</span>
        <span style={{ color: "var(--t3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{commit.msg}</span>
      </div>
      {open && canDiff && (
        <div style={{ marginTop: 8, marginBottom: 4 }}>
          <DiffViewer owner={owner} repo={repo} sha={commit.sha} label={`Diff · ${commit.hash}`} />
        </div>
      )}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const P_STYLE = {
  P0: { color: "var(--p-critical-text)", bg: "rgba(255,87,87,0.08)",  border: "rgba(255,87,87,0.22)" },
  P1: { color: "var(--p-high-text)",     bg: "rgba(255,151,65,0.08)", border: "rgba(255,151,65,0.22)" },
  P2: { color: "var(--p-info-text)",     bg: "rgba(91,158,255,0.08)", border: "rgba(91,158,255,0.22)" },
  P3: { color: "var(--t4)",              bg: "rgba(31,27,22,0.05)",border: "var(--border)" },
};

const STATUS_STYLE = {
  Done:        { color: "var(--p-normal-text)", bg: "rgba(76,175,130,0.08)",  border: "rgba(76,175,130,0.22)" },
  Blocked:     { color: "var(--p-critical-text)",bg: "rgba(255,87,87,0.08)", border: "rgba(255,87,87,0.22)" },
  "In Progress":{ color: "var(--brand-text)",   bg: "rgba(232,103,43,0.08)",border: "rgba(232,103,43,0.22)" },
  Review:      { color: "var(--p-info-text)",   bg: "rgba(91,158,255,0.08)", border: "rgba(91,158,255,0.22)" },
  QA:          { color: "var(--p-high-text)",   bg: "rgba(255,151,65,0.08)", border: "rgba(255,151,65,0.22)" },
  default:     { color: "var(--t4)",            bg: "rgba(31,27,22,0.05)",border: "var(--border)" },
};

const STATUS_ORDER = { color: "var(--p-normal)", bg: "rgba(76,175,130,0.08)", border: "rgba(76,175,130,0.20)" };
const STATUS_RISK  = { color: "var(--p-high)",   bg: "rgba(255,151,65,0.08)", border: "rgba(255,151,65,0.20)" };

function getPStyle(p) { return P_STYLE[p] || P_STYLE.P3; }
function getSStyle(s) { return STATUS_STYLE[s] || STATUS_STYLE.default; }

function SectionLabel({ icon: Icon, children }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
      <Icon style={{ width: 11, height: 11, color: "var(--t5)" }} />
      <span style={{ fontSize: 9, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--t5)" }}>
        {children}
      </span>
    </div>
  );
}

// ── Kanban Card ───────────────────────────────────────────────────────────────

function IssueCard({ iss, onClick }) {
  const [h, setH] = useState(false);
  const ps = getPStyle(iss.priority);
  return (
    <div
      onClick={() => onClick(iss)}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        background: h ? "var(--bg-hover)" : "var(--bg-card)",
        border: `1px solid ${h ? "var(--border-strong)" : "var(--border)"}`,
        borderRadius: 4, padding: "8px 10px",
        cursor: "pointer", transition: "all 100ms",
        display: "flex", flexDirection: "column", gap: 6,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: "var(--t5)" }}>{iss.key}</span>
        <span style={{
          fontSize: 8, fontWeight: 500,
          padding: "1px 4px", borderRadius: 2,
          color: ps.color, background: ps.bg, border: `1px solid ${ps.border}`,
          textTransform: "uppercase",
        }}>
          {iss.priority}
        </span>
      </div>
      <p style={{ fontSize: 11, fontWeight: 500, color: "var(--t1)", lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
        {iss.title}
      </p>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 4, borderTop: "1px solid var(--border)" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 9, color: "var(--t4)", maxWidth: "70%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          <User style={{ width: 9, height: 9, flexShrink: 0 }} />
          {iss.assignee || "Unassigned"}
        </span>
        {iss.aiIntelligence?.riskScore > 50 && (
          <span style={{ fontSize: 9, fontWeight: 500, color: "var(--p-critical-text)" }}>
            Risk {iss.aiIntelligence.riskScore}%
          </span>
        )}
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export const ProjectOverview = ({ project: initialProject }) => {
  const { token, workspaceId } = useWebSocket();
  const [project, setProject] = useState(initialProject);
  const [selectedIssue, setSelectedIssue] = useState(null);
  const [transitioningKey, setTransitioningKey] = useState(null);
  useEscapeKey(() => setSelectedIssue(null), Boolean(selectedIssue));

  const isJira = project.isJira;
  const COLUMNS = ["To Do", "In Progress", "Review", "QA", "Done", "Blocked"];

  const handleTransition = async (issueKey, newStatus) => {
    setTransitioningKey(issueKey);
    setProject(prev => ({
      ...prev,
      issues: prev.issues.map(i => i.key === issueKey ? { ...i, status: newStatus } : i),
    }));
    if (token && workspaceId) {
      try {
        await fetch(`/api/work/issues/${issueKey}/transition`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, "workspace-id": workspaceId },
          body: JSON.stringify({ status: newStatus }),
        });
        if (selectedIssue?.key === issueKey) setSelectedIssue(p => ({ ...p, status: newStatus }));
      } catch { /* optimistic UI stands */ }
    }
    setTransitioningKey(null);
  };

  const statusStyle = project.status === "On Track" ? STATUS_ORDER : STATUS_RISK;

  // ─── Jira kanban ─────────────────────────────────────────────────────────────
  if (isJira) {
    const issues = project.issues || [];
    const pct = Math.round(((project.burndown?.completedPoints || 0) / (project.burndown?.plannedPoints || 1)) * 100);

    return (
      <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 4, padding: "20px" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", paddingBottom: 16, borderBottom: "1px solid var(--border)", marginBottom: 16 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
              <Layers style={{ width: 14, height: 14, color: "var(--brand)" }} />
              <h2 style={{ fontSize: 14, fontWeight: 500, color: "var(--t1)", letterSpacing: "-0.3px" }}>
                {project.name}
              </h2>
              <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: "var(--t5)" }}>
                [{project.key}]
              </span>
              <span style={{
                fontSize: 9, fontWeight: 500, textTransform: "uppercase",
                padding: "2px 6px", borderRadius: 3,
                color: statusStyle.color, background: statusStyle.bg, border: `1px solid ${statusStyle.border}`,
              }}>
                {project.status}
              </span>
            </div>
            <p style={{ fontSize: 12, color: "var(--t4)" }}>
              Active Sprint: <span style={{ color: "var(--t2)", fontWeight: 500 }}>{project.sprintName}</span> · {project.burndown?.completedPoints}/{project.burndown?.plannedPoints} pts
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 100, height: 4, background: "rgba(31,27,22,0.06)", borderRadius: 2, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${pct}%`, background: "var(--brand)", borderRadius: 2, transition: "width 500ms" }} />
            </div>
            <span style={{ fontSize: 10, fontWeight: 500, fontVariantNumeric: "tabular-nums", color: "var(--brand-text)" }}>{pct}%</span>
          </div>
        </div>

        {/* Board columns */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10 }}>
          {COLUMNS.map(col => {
            const colIssues = issues.filter(i => i.status === col);
            return (
              <div key={col} style={{
                background: "rgba(31,27,22,0.04)",
                border: "1px solid var(--border)",
                borderRadius: 4, padding: "10px 8px",
                minHeight: 160,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <span style={{ fontSize: 9, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--t5)" }}>
                    {col}
                  </span>
                  <span style={{ fontSize: 9, fontVariantNumeric: "tabular-nums", color: "var(--t5)", background: "rgba(31,27,22,0.05)", padding: "1px 5px", borderRadius: 2 }}>
                    {colIssues.length}
                  </span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {colIssues.map(iss => (
                    <IssueCard key={iss.key} iss={iss} onClick={setSelectedIssue} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Issue detail slide-over */}
        {selectedIssue && (
          <div
            onClick={e => { if (e.target === e.currentTarget) setSelectedIssue(null); }}
            style={{
              position: "fixed", inset: 0,
              background: "rgba(31,27,22,0.12)",
              display: "flex", justifyContent: "flex-end",
              zIndex: 50,
              animation: "event-slide-in 0.2s ease",
            }}
          >
            <div style={{
              width: "100%", maxWidth: 480,
              background: "var(--bg-sidebar)",
              borderLeft: "1px solid var(--border)",
              height: "100%", display: "flex", flexDirection: "column",
              overflowY: "auto",
            }}>
              {/* Drawer header */}
              <div style={{ padding: "18px 20px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: "var(--t5)" }}>{selectedIssue.key}</span>
                    <h3 style={{ fontSize: 14, fontWeight: 500, color: "var(--t1)", lineHeight: 1.35, marginTop: 4, marginBottom: 10 }}>
                      {selectedIssue.title}
                    </h3>
                    <div style={{ display: "flex", gap: 6 }}>
                      {[
                        { label: `Priority: ${selectedIssue.priority}`, s: getPStyle(selectedIssue.priority) },
                        { label: `Status: ${selectedIssue.status}`, s: getSStyle(selectedIssue.status) },
                      ].map(({ label, s }) => (
                        <span key={label} style={{
                          fontSize: 9, fontWeight: 500,
                          padding: "2px 6px", borderRadius: 3, textTransform: "uppercase",
                          color: s.color, background: s.bg, border: `1px solid ${s.border}`,
                        }}>
                          {label}
                        </span>
                      ))}
                    </div>
                  </div>
                  <button onClick={() => setSelectedIssue(null)} aria-label="Close issue" style={{ padding: 6, background: "transparent", border: "none", color: "var(--t4)", cursor: "pointer" }}>
                    <X style={{ width: 14, height: 14 }} />
                  </button>
                </div>
              </div>

              <div style={{ padding: "16px 20px", flex: 1, display: "flex", flexDirection: "column", gap: 16, overflowY: "auto" }}>
                {/* Description */}
                {selectedIssue.description && (
                  <div>
                    <SectionLabel icon={AlertCircle}>Description</SectionLabel>
                    <p style={{ fontSize: 12, color: "var(--t2)", lineHeight: 1.65, background: "rgba(31,27,22,0.04)", border: "1px solid var(--border)", borderRadius: 4, padding: "10px 12px" }}>
                      {selectedIssue.description}
                    </p>
                  </div>
                )}

                {/* AI intelligence */}
                {selectedIssue.aiIntelligence && (
                  <div style={{ background: "rgba(232,103,43,0.06)", border: "1px solid var(--brand-line)", borderLeft: "2px solid var(--brand)", borderRadius: 4, padding: "12px 14px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10, paddingBottom: 10, borderBottom: "1px solid rgba(232,103,43,0.15)" }}>
                      <Zap style={{ width: 11, height: 11, color: "var(--brand)" }} />
                      <span style={{ fontSize: 9, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--brand-text)" }}>
                        AI Work Intelligence
                      </span>
                    </div>
                    <p style={{ fontSize: 12, color: "var(--t2)", lineHeight: 1.65, fontStyle: "italic", marginBottom: 12 }}>
                      "{selectedIssue.aiIntelligence.aiSummary}"
                    </p>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
                      {[
                        { label: "Business Impact", val: selectedIssue.aiIntelligence.businessImpact },
                        { label: "Risk Score",       val: `${selectedIssue.aiIntelligence.riskScore}/100`, color: selectedIssue.aiIntelligence.riskScore > 60 ? "var(--p-critical-text)" : "var(--t2)" },
                      ].map(({ label, val, color }) => (
                        <div key={label} style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 4, padding: "8px 10px" }}>
                          <span style={{ fontSize: 9, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--t5)", display: "block", marginBottom: 4 }}>
                            {label}
                          </span>
                          <span style={{ fontSize: 12, color: color || "var(--t2)", fontWeight: 500 }}>{val}</span>
                        </div>
                      ))}
                    </div>
                    {selectedIssue.aiIntelligence.suggestedNextAction && (
                      <div style={{ background: "rgba(232,103,43,0.08)", border: "1px solid var(--brand-line)", borderRadius: 4, padding: "8px 10px" }}>
                        <span style={{ fontSize: 9, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--brand-text)", display: "block", marginBottom: 4 }}>
                          Suggested Action
                        </span>
                        <span style={{ fontSize: 12, color: "var(--t1)", fontWeight: 500 }}>
                          {selectedIssue.aiIntelligence.suggestedNextAction}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Workflow transitions */}
                <div>
                  <SectionLabel icon={Activity}>Transition Status</SectionLabel>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {COLUMNS.map(status => {
                      const isActive = selectedIssue.status === status;
                      return (
                        <button
                          key={status}
                          disabled={isActive || transitioningKey === selectedIssue.key}
                          onClick={() => handleTransition(selectedIssue.key, status)}
                          style={{
                            padding: "5px 12px", borderRadius: 4, fontSize: 12, fontWeight: 500,
                            background: isActive ? "var(--brand)" : "rgba(31,27,22,0.045)",
                            border: `1px solid ${isActive ? "var(--brand)" : "var(--border-strong)"}`,
                            color: isActive ? "#fff" : "var(--t3)",
                            cursor: isActive || transitioningKey ? "not-allowed" : "pointer",
                            opacity: transitioningKey && !isActive ? 0.5 : 1,
                            transition: "all 100ms",
                          }}
                        >
                          {status}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div style={{ padding: "12px 20px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--t5)", flexShrink: 0 }}>
                <span>Assignee: {selectedIssue.assignee || "Unassigned"}</span>
                <span>Reporter: {selectedIssue.reporter || "—"}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ─── GitHub repo card ─────────────────────────────────────────────────────────
  return (
    <div style={{
      background: "var(--bg-card)", border: "1px solid var(--border)",
      borderLeft: `2px solid ${project.status === "On Track" ? "var(--p-normal)" : "var(--p-high)"}`,
      borderRadius: 4, padding: "18px 20px",
    }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", paddingBottom: 14, borderBottom: "1px solid var(--border)", marginBottom: 16 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <h2 style={{ fontSize: 14, fontWeight: 500, color: "var(--t1)", letterSpacing: "-0.2px" }}>{project.name}</h2>
            <span style={{
              fontSize: 9, fontWeight: 500, textTransform: "uppercase",
              padding: "2px 6px", borderRadius: 3,
              color: statusStyle.color, background: statusStyle.bg, border: `1px solid ${statusStyle.border}`,
            }}>
              {project.status}
            </span>
          </div>
          <p style={{ fontSize: 12, color: "var(--t3)" }}>{project.description}</p>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 20 }}>
        {/* Left: Milestone + Risks + AI rec */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <SectionLabel icon={Activity}>Milestone</SectionLabel>
            <p style={{ fontSize: 12, fontWeight: 500, color: "var(--t2)" }}>{project.nextMilestone}</p>
          </div>
          <div>
            <SectionLabel icon={AlertTriangle}>Current Risks</SectionLabel>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 4 }}>
              {project.risks.map((risk, i) => (
                <li key={i} style={{ fontSize: 12, color: "var(--t3)", display: "flex", alignItems: "baseline", gap: 5 }}>
                  <span style={{ color: "var(--p-high)", flexShrink: 0 }}>·</span>{risk}
                </li>
              ))}
            </ul>
          </div>
          {project.aiRecommendation && (
            <div>
              <div style={{ background: "rgba(232,103,43,0.06)", border: "1px solid var(--brand-line)", borderLeft: "2px solid var(--brand)", borderRadius: 4, padding: "10px 12px", marginBottom: 8 }}>
                <span style={{ fontSize: 9, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--brand-text)", display: "block", marginBottom: 5 }}>
                  AI Recommendation
                </span>
                <p style={{ fontSize: 11, color: "var(--t2)", lineHeight: 1.6, fontStyle: "italic" }}>
                  "{project.aiRecommendation}"
                </p>
              </div>
              <button
                onClick={() => window.dispatchEvent(new CustomEvent("flow:open-execution-drawer", {
                  detail: { card: buildEngineeringCard({ recommendation: project.aiRecommendation, risks: project.risks }) },
                }))}
                style={{
                  width: "100%", padding: "7px 12px", borderRadius: 4,
                  background: "rgba(232,103,43,0.08)", border: "1px solid var(--brand-line)",
                  color: "var(--brand-text)", fontSize: 12, fontWeight: 500,
                  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                }}
              >
                <Zap style={{ width: 11, height: 11 }} /> Take Action
              </button>
            </div>
          )}
        </div>

        {/* Middle: Decisions + Commits */}
        <div style={{ borderLeft: "1px solid var(--border)", paddingLeft: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <SectionLabel icon={ShieldCheck}>Recent Decisions</SectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {project.decisions.map((d, i) => (
                <div key={i} style={{ fontSize: 12, color: "var(--t2)", background: "rgba(31,27,22,0.04)", border: "1px solid var(--border)", borderRadius: 4, padding: "6px 9px" }}>
                  {d}
                </div>
              ))}
            </div>
          </div>
          <div>
            <SectionLabel icon={GitCommit}>Latest Commits</SectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {project.commits.map((c, i) => (
                <CommitRow key={c.sha || i} commit={c} repoFullName={project.repoFullName} />
              ))}
            </div>
          </div>
        </div>

        {/* Right: Tasks + Meetings */}
        <div style={{ borderLeft: "1px solid var(--border)", paddingLeft: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <SectionLabel icon={CheckSquare}>Pending Tasks</SectionLabel>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 4 }}>
              {project.tasks.map((t, i) => (
                <li key={i} style={{ fontSize: 12, color: "var(--t3)", display: "flex", alignItems: "baseline", gap: 5 }}>
                  <span style={{ color: "var(--brand)", flexShrink: 0 }}>·</span>{t}
                </li>
              ))}
            </ul>
          </div>
          {project.meetings?.length > 0 && (
            <div>
              <SectionLabel icon={Calendar}>Related Meetings</SectionLabel>
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {project.meetings.map((m, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, background: "rgba(31,27,22,0.04)", border: "1px solid var(--border)", borderRadius: 4, padding: "6px 9px" }}>
                    <span style={{ color: "var(--t2)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.title}</span>
                    <span style={{ fontSize: 10, fontVariantNumeric: "tabular-nums", color: "var(--t5)", flexShrink: 0, marginLeft: 8 }}>{m.time}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProjectOverview;
