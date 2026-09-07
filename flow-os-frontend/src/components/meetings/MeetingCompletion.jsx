import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  CheckCircle2, FileText, Scale, ListChecks, User, Clock, CheckSquare, BellRing, Mail,
  GitPullRequest, Loader2, Check, ArrowLeft, Sparkles, Send, AlertTriangle,
} from "lucide-react";
import DataSourceBadge from "../ui/DataSourceBadge";
import { EmptyState } from "../ui/EmptyState";

/**
 * MeetingCompletion (/meetings/:id/summary) — the Meeting Completion Workspace
 * (Sprint 2.1). A meeting shouldn't end with work left for the user: FLOW prepares
 * the summary, decisions and action items, then lets Rahul finish every follow-up
 * inside FLOW — create/assign Jira, notify Slack, send the recap email, log decisions
 * to the timeline — each through the existing GOVERNED endpoints. No new AI/backend.
 *
 * Flow: Context → Decisions → Action Items → Execution → Audit → Timeline.
 */
function authHeaders() {
  const token = localStorage.getItem("flow_os_token") || "";
  const workspaceId = localStorage.getItem("flow_os_workspace_id") || "workspace_corp_alpha";
  return { Authorization: `Bearer ${token}`, "workspace-id": workspaceId, "Content-Type": "application/json" };
}

const DEMO = {
  title: "Architecture Sync",
  summary: "The team agreed to proceed with the PostgreSQL migration this weekend. David will prepare rollback scripts and notify ops. Auth PR #447 was approved and is queued for deploy after the migration.",
  decisions: [
    { decision: "Migrate the payments DB Saturday 02:00", confidence: "High" },
    { decision: "Approve and deploy Auth PR #447 after migration", confidence: "High" },
  ],
  actions: [
    { action: "Prepare Postgres rollback scripts", owner: "David O.", deadline: "Friday" },
    { action: "Notify the ops team about the migration window", owner: "David O.", deadline: "Thursday" },
    { action: "Coordinate deploy of PR #447 post-migration", owner: "Kishore", deadline: "Saturday" },
  ],
  related: [{ type: "pr", title: "PR #447 — Auth refactor", meta: "approved" }],
};

function normalize(event) {
  const md = event.metadata || {};
  const actions = (md.actions || []).map((a, i) => (typeof a === "string"
    ? { action: a, owner: "TBD", deadline: "TBD" }
    : { action: a.text || a.action || `Action ${i + 1}`, owner: a.owner || "TBD", deadline: a.deadline || "TBD" }));
  const decisions = (md.decisions || []).map((d, i) => (typeof d === "string"
    ? { decision: d, confidence: "Medium" }
    : { decision: d.text || d.decision || `Decision ${i + 1}`, confidence: d.confidence || "Medium" }));
  return {
    title: event.title || "Meeting",
    summary: md.meetingSummary || md.flow_summary || event.agenda || "",
    decisions, actions, related: [],
  };
}

export default function MeetingCompletion() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [demo, setDemo] = useState(false);
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState({}); // per-action: {jira, notify, email}
  const [loggedTimeline, setLoggedTimeline] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [toast, setToast] = useState(null);

  const flash = (m) => { setToast(m); setTimeout(() => setToast(null), 2600); };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/meetings/event/${encodeURIComponent(id)}`, { headers: authHeaders() });
      if (!res.ok) throw new Error();
      const body = await res.json();
      const event = body.result || body.event || body;
      const norm = normalize(event);
      if (!norm.summary && !norm.actions.length && !norm.decisions.length) { setData(DEMO); setDemo(true); }
      else {
        // Best-effort related engineering work (open PRs) from the collaboration signals.
        try {
          const c = await fetch("/api/collaboration/conflicts", { headers: authHeaders() });
          if (c.ok) { const cj = await c.json(); norm.related = (cj.conflicts || []).slice(0, 2).map((x) => ({ type: "pr", title: `Conflict in ${x.ownership?.repo || "repo"}`, meta: (x.ownership?.owners || []).join(", ") })); }
        } catch { /* related is optional */ }
        setData(norm); setDemo(false);
      }
    } catch { setData(DEMO); setDemo(true); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const setActionState = (i, patch) => setState((s) => ({ ...s, [i]: { ...(s[i] || {}), ...patch } }));

  // ── Governed executions (reuse existing endpoints) ──────────────────────────
  async function createJira(i, a) {
    setActionState(i, { jira: "running" });
    try {
      const res = await fetch("/api/work/issues", {
        method: "POST", headers: authHeaders(),
        body: JSON.stringify({ projectKey: "PROJ", title: a.action.slice(0, 100), description: `From meeting "${data.title}". Owner: ${a.owner}. Due: ${a.deadline}.`, priority: "P2", assignee: a.owner !== "TBD" ? a.owner : null }),
      });
      const j = res.ok ? await res.json() : null;
      const key = j?.result?.key || j?.key;
      setActionState(i, { jira: key ? `created:${key}` : "done" });
    } catch { setActionState(i, { jira: "failed" }); }
  }
  async function notifySlack(i, a) {
    setActionState(i, { notify: "running" });
    try {
      await fetch("/api/connectors/execute", {
        method: "POST", headers: authHeaders(),
        body: JSON.stringify({ connectorId: "slack", actionType: "send", payload: { text: `📌 Action from "${data.title}": ${a.action} — @${a.owner} (due ${a.deadline})` } }),
      });
      setActionState(i, { notify: "done" });
    } catch { setActionState(i, { notify: "failed" }); }
  }
  const emailAction = (a) => window.dispatchEvent(new CustomEvent("flow:open-compose"));

  async function logDecisionsToTimeline() {
    setLoggedTimeline(true);
    try {
      await fetch(`/api/meetings/event/${encodeURIComponent(id)}/summary`, {
        method: "POST", headers: authHeaders(),
        body: JSON.stringify({ summary: data.summary, decisions: data.decisions.map((d) => d.decision) }),
      });
      flash("Decisions logged to the timeline.");
    } catch { flash("Couldn't log — connect the calendar."); }
  }

  const draftEmail = () => window.dispatchEvent(new CustomEvent("flow:open-compose"));

  // One-click: create a Jira task for every action + log the decisions. All governed.
  async function completeMeeting() {
    setCompleting(true);
    await Promise.all(data.actions.map((a, i) => createJira(i, a)));
    await logDecisionsToTimeline();
    setCompleting(false);
    flash("Meeting completed — tasks created and decisions logged.");
  }

  if (loading) return <div style={{ padding: 40, maxWidth: 820, margin: "0 auto" }}><EmptyState variant="meetings" message="Loading meeting…" /></div>;
  if (!data) return <div style={{ padding: 40 }}><EmptyState variant="error" /></div>;

  return (
    <div style={{ padding: "24px", maxWidth: 820, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header */}
      <div>
        <button onClick={() => navigate("/meetings")} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--t4)", background: "none", border: "none", cursor: "pointer", marginBottom: 10 }}>
          <ArrowLeft style={{ width: 12, height: 12 }} /> Meetings
        </button>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 4 }}>
              <CheckCircle2 style={{ width: 18, height: 18, color: "var(--p-normal)" }} />
              <h1 style={{ fontSize: 19, fontWeight: 500, color: "var(--t1)", letterSpacing: "-0.3px" }}>Meeting completed</h1>
              <DataSourceBadge mode={demo ? "demo" : "live"} />
            </div>
            <p style={{ fontSize: 13, color: "var(--t4)" }}>{data.title} · FLOW prepared everything to continue.</p>
          </div>
          <button onClick={completeMeeting} disabled={completing || !data.actions.length}
            style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 16px", borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: completing ? "wait" : "pointer", background: "var(--brand)", border: "none", color: "#fff", flexShrink: 0 }}>
            {completing ? <Loader2 style={{ width: 13, height: 13, animation: "spin 1s linear infinite" }} /> : <Sparkles style={{ width: 13, height: 13 }} />}
            {completing ? "Completing…" : "Complete & create tasks"}
          </button>
        </div>
      </div>

      {toast && <div style={{ fontSize: 12, color: "var(--p-normal-text)", background: "rgba(76,175,130,0.06)", border: "1px solid rgba(76,175,130,0.2)", borderRadius: 6, padding: "8px 12px" }}>{toast}</div>}

      {/* Summary */}
      {data.summary && (
        <Section icon={FileText} title="AI Summary">
          <p style={{ fontSize: 13, color: "var(--t2)", lineHeight: 1.7, margin: 0 }}>{data.summary}</p>
        </Section>
      )}

      {/* Decisions */}
      {data.decisions.length > 0 && (
        <Section icon={Scale} title="Decisions" action={{ label: loggedTimeline ? "Logged ✓" : "Add to Timeline", onClick: logDecisionsToTimeline, done: loggedTimeline }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {data.decisions.map((d, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13, color: "var(--t2)" }}>
                <CheckCircle2 style={{ width: 13, height: 13, color: "var(--p-normal)", marginTop: 2, flexShrink: 0 }} />
                <span style={{ flex: 1 }}>{d.decision}</span>
                {d.confidence && <span style={{ fontSize: 10, color: "var(--t5)" }}>{d.confidence}</span>}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Action items — each executable in-place */}
      <Section icon={ListChecks} title={`Action Items (${data.actions.length})`}>
        {data.actions.length === 0 ? <span style={{ fontSize: 13, color: "var(--t5)" }}>No action items.</span> : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {data.actions.map((a, i) => {
              const s = state[i] || {};
              return (
                <div key={i} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "12px 14px", background: "var(--bg-card)" }}>
                  <p style={{ fontSize: 13.5, fontWeight: 500, color: "var(--t1)", margin: "0 0 6px" }}>{a.action}</p>
                  <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 11, color: "var(--t4)", marginBottom: 10 }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><User style={{ width: 10, height: 10 }} /> {a.owner}</span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Clock style={{ width: 10, height: 10 }} /> {a.deadline}</span>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    <ExecBtn icon={CheckSquare} label="Create Jira" state={s.jira} onClick={() => createJira(i, a)} createdPrefix="created:" />
                    <ExecBtn icon={BellRing} label="Notify Slack" state={s.notify} onClick={() => notifySlack(i, a)} />
                    <ExecBtn icon={Mail} label="Email owner" onClick={() => emailAction(a)} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      {/* Follow-up email */}
      <Section icon={Mail} title="Follow-up email" action={{ label: "Draft & send", onClick: draftEmail }}>
        <p style={{ fontSize: 12, color: "var(--t4)", lineHeight: 1.6, margin: 0 }}>
          A recap to the attendees with the decisions and action items is ready — open the composer to review and send inside FLOW.
        </p>
      </Section>

      {/* Related work */}
      {data.related?.length > 0 && (
        <Section icon={GitPullRequest} title="Related work">
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {data.related.map((r, i) => (
              <button key={i} onClick={() => navigate("/projects")} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--t2)", background: "none", border: "none", cursor: "pointer", textAlign: "left", padding: 0 }}>
                <GitPullRequest style={{ width: 12, height: 12, color: "var(--t4)" }} /> {r.title}
                {r.meta && <span style={{ fontSize: 10, color: "var(--t5)" }}>· {r.meta}</span>}
              </button>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

function Section({ icon: Icon, title, action, children }) {
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "16px 18px", background: "rgba(31,27,22,0.01)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <Icon style={{ width: 13, height: 13, color: "var(--brand)" }} />
        <span style={{ fontSize: 10, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--t5)" }}>{title}</span>
        <div style={{ flex: 1 }} />
        {action && (
          <button onClick={action.onClick} style={{ fontSize: 11, fontWeight: 500, color: action.done ? "var(--p-normal-text)" : "var(--brand-text)", background: "none", border: "none", cursor: "pointer" }}>
            {action.label}
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

function ExecBtn({ icon: Icon, label, state, onClick, createdPrefix }) {
  const created = createdPrefix && typeof state === "string" && state.startsWith(createdPrefix);
  const done = state === "done" || created;
  const running = state === "running";
  const failed = state === "failed";
  return (
    <button onClick={onClick} disabled={running || done}
      style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 11px", borderRadius: 5, fontSize: 11, fontWeight: 500, cursor: running || done ? "default" : "pointer",
        background: done ? "rgba(76,175,130,0.08)" : "rgba(31,27,22,0.045)",
        border: `1px solid ${done ? "rgba(76,175,130,0.25)" : failed ? "rgba(255,87,87,0.3)" : "var(--border-strong)"}`,
        color: done ? "var(--p-normal-text)" : failed ? "var(--p-critical-text)" : "var(--t3)" }}>
      {running ? <Loader2 style={{ width: 10, height: 10, animation: "spin 1s linear infinite" }} />
        : done ? <Check style={{ width: 10, height: 10 }} />
        : failed ? <AlertTriangle style={{ width: 10, height: 10 }} />
        : <Icon style={{ width: 10, height: 10 }} />}
      {created ? state.replace(createdPrefix, "") : done ? "Done" : failed ? "Retry" : label}
    </button>
  );
}
