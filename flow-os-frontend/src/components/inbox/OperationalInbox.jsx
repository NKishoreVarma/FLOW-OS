import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Inbox as InboxIcon, RefreshCw, GitMerge, ShieldAlert, Lightbulb, Calendar, Bell,
  CheckCircle2, Check, X, FileDiff, MessageSquare, CalendarPlus, CheckSquare, Sparkles,
  ExternalLink, AlertTriangle, Loader2,
} from "lucide-react";
import DataSourceBadge from "../ui/DataSourceBadge";
import SourceBadge from "../ui/SourceBadge";
import { EmptyState } from "../ui/EmptyState";
import InlineDiffModal from "./InlineDiffModal";
import InlineMeetingPrep from "./InlineMeetingPrep";
import SlackThreadPanel from "../slack/SlackThreadPanel";
import executionApi from "../../lib/executionApi";
import { useWebSocket } from "../../hooks/useWebSocket";
import ActionCard from "./ActionCard";
import { buildActionCard } from "../../lib/actionCardAdapter";

/**
 * OperationalInbox (/inbox) — the ONE inbox (Phase 16). Every signal from every system
 * enters here as *work with actions*, never a scattered notification: approvals, merge
 * conflicts, executive recommendations, meeting reminders, and workspace alerts.
 * Reuses existing backends (/api/approvals, /api/collaboration/conflicts,
 * /api/brain/recommendations, /api/notifications, /api/meetings) — no new backend.
 */
function authHeaders() {
  const token = localStorage.getItem("flow_os_token") || "";
  const workspaceId = localStorage.getItem("flow_os_workspace_id") || "workspace_corp_alpha";
  return { Authorization: `Bearer ${token}`, "workspace-id": workspaceId, "Content-Type": "application/json" };
}
async function getJSON(p) { const r = await fetch(p, { headers: authHeaders() }); if (!r.ok) throw new Error(String(r.status)); return r.json(); }

const TYPE_META = {
  approval:       { icon: CheckCircle2, color: "var(--brand)",        label: "Approval" },
  conflict:       { icon: GitMerge,     color: "var(--p-high)",       label: "Merge conflict" },
  recommendation: { icon: Lightbulb,    color: "var(--brand)",        label: "Recommendation" },
  meeting:        { icon: Calendar,     color: "var(--p-normal)",     label: "Meeting" },
  incident:       { icon: ShieldAlert,  color: "var(--p-critical)",   label: "Alert" },
  notification:   { icon: Bell,         color: "var(--t4)",           label: "Update" },
};
const FILTERS = [
  { id: "all", label: "All" },
  { id: "approval", label: "Approvals" },
  { id: "conflict", label: "Conflicts" },
  { id: "recommendation", label: "Recommendations" },
  { id: "meeting", label: "Meetings" },
  { id: "incident", label: "Alerts" },
];

const DEMO = [
  { id: "d-approval", type: "approval", source: "github", priority: 90, title: "Approve merge of PR #421 → main", body: "Critical action — 2 approvals required (two-person rule).", time: new Date(Date.now() - 6e5), raw: {} },
  { id: "d-conflict", type: "conflict", source: "github", priority: 82, title: "Merge conflict in flow-backend", body: "auth.js changed by Rahul & Kishore — coordinate before merging.", time: new Date(Date.now() - 26e5), raw: { ownership: { owners: ["rahul", "kishore"], repo: "flow-backend", number: 128, overlappingFiles: ["auth.js"] } } },
  { id: "d-rec", type: "recommendation", source: "system", priority: 60, title: "Assign a backup owner for the payments DB", body: "David O. is the only owner (bus-factor risk).", time: new Date(Date.now() - 72e5), raw: {} },
  { id: "d-meeting", type: "meeting", source: "calendar", priority: 55, title: "Customer sync — Acme at 2:00 PM", body: "Renewal at risk — prep recommended.", time: new Date(Date.now() - 3e5), raw: {} },
  { id: "d-incident", type: "incident", source: "system", priority: 88, title: "Payment incident resolved", body: "Error rate back to baseline after rollback.", time: new Date(Date.now() - 108e5), raw: {} },
];

function priorityBand(p) { return p >= 80 ? "critical" : p >= 60 ? "high" : "normal"; }

export default function OperationalInbox() {
  const { isAuthLoading, events } = useWebSocket();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [demo, setDemo] = useState(false);
  const [filter, setFilter] = useState("all");
  const [busyId, setBusyId] = useState(null);
  const [done, setDone] = useState({}); // id → status text
  const [diffTarget, setDiffTarget] = useState(null);   // { repo, number }
  const [slackTarget, setSlackTarget] = useState(null); // { title }
  const [prepTarget, setPrepTarget] = useState(null);   // { eventId, title, videoUrl }

  const load = useCallback(async () => {
    setLoading(true);
    const [queue, appr, conf, recs, notifs, meets] = await Promise.allSettled([
      getJSON("/api/workday/queue"),
      getJSON("/api/approvals?status=PENDING"),
      executionApi.conflicts(),
      getJSON("/api/brain/recommendations"),
      executionApi.notifications({ limit: 30 }),
      getJSON("/api/meetings/upcoming?days=1&limit=6"),
    ]);
    const out = [];

    // ── Workday queue items (NOW + NEXT) ──────────────────────────────────────
    if (queue.status === "fulfilled") {
      const q = queue.value;
      for (const item of [...(q.now || []), ...(q.next || [])]) {
        out.push({
          id: item.id || `wq-${Math.random()}`,
          type: item.type || "notification",
          source: item.source || "system",
          priority: item.score || 50,
          title: item.title,
          body: item.subtitle || item.reasons?.[0] || "",
          time: new Date(),
          raw: item,
          suggestedActions: item.suggestedActions || [],
          estimatedImpact: item.estimatedImpact || "",
          evidenceLines: item.reasons || [],
        });
      }
    }

    if (appr.status === "fulfilled") {
      const list = appr.value.approvals || appr.value.items || (Array.isArray(appr.value) ? appr.value : []);
      list.forEach((a) => out.push({
        id: `ap-${a.id}`, type: "approval", source: a.connectorId || "system", priority: a.riskLevel === "CRITICAL" ? 92 : 78,
        title: `Approve: ${a.connectorId || ""} ${a.actionType || "action"}`.trim(),
        body: `${a.riskLevel || "HIGH"} risk · ${a.requiredApprovals || 1} approval(s) required.`,
        time: new Date(a.createdAt || Date.now()), raw: a,
      }));
    }
    if (conf.status === "fulfilled") {
      (conf.value.conflicts || []).forEach((c, i) => out.push({
        id: `cf-${c.ownership?.repo || i}-${c.ownership?.number || i}`, type: "conflict", source: "github", priority: 82,
        title: `Merge conflict in ${c.ownership?.repo || "repository"}`,
        body: c.message || `${(c.ownership?.overlappingFiles || []).join(", ")} — owners: ${(c.ownership?.owners || c.notify || []).join(", ")}`,
        time: new Date(), raw: c,
      }));
    }
    if (recs.status === "fulfilled") {
      const list = recs.value.recommendations || (Array.isArray(recs.value) ? recs.value : []);
      list.slice(0, 8).forEach((r, i) => out.push({
        id: `rc-${r.id || i}`, type: "recommendation", source: "system", priority: 58,
        title: r.title || r.action || "Recommendation", body: r.description || r.reasoning || r.body || "",
        time: new Date(r.createdAt || Date.now()), raw: r,
      }));
    }
    if (notifs.status === "fulfilled") {
      // Dedup: approvals + conflicts are handled by their richer sources above.
      (notifs.value.notifications || [])
        .filter((n) => !/APPROVAL_REQUIRED|MERGE_CONFLICT|CI_FAILED/i.test(n.type || ""))
        .forEach((n) => out.push({
          id: `nf-${n.id}`, type: /INCIDENT|SECURITY|RISK/i.test(n.type || "") ? "incident" : "notification",
          source: "system", priority: n.priority || 45, title: n.title, body: n.body || "",
          time: new Date(n.createdAt || Date.now()), raw: n,
        }));
    }
    if (meets.status === "fulfilled") {
      const evs = meets.value.events || meets.value.result || meets.value || [];
      (Array.isArray(evs) ? evs : []).slice(0, 4).forEach((e, i) => {
        const t = e.startTime || e.start?.dateTime;
        out.push({
          id: `mt-${e.id || i}`, type: "meeting", source: "calendar", priority: 52,
          title: e.title || e.summary || "Meeting", body: t ? `Starts ${new Date(t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "",
          time: t ? new Date(t) : new Date(), raw: e,
        });
      });
    }

    out.sort((a, b) => b.priority - a.priority || b.time - a.time);
    if (out.length) { setItems(out); setDemo(false); } else { setItems(DEMO); setDemo(true); }
    setLoading(false);
  }, []);

  useEffect(() => { if (!isAuthLoading) load(); }, [isAuthLoading, load]);

  // Live: prepend new workspace events as inbox work.
  useEffect(() => {
    if (!events?.length) return;
    const ev = events[0];
    if (!ev) return;
    const map = {
      NOTIFICATION_CREATED: () => ({ type: /MERGE|CONFLICT/i.test(ev.payload?.type || "") ? "conflict" : "notification", title: ev.payload?.title || "New notification", body: ev.payload?.body || "", priority: ev.payload?.priority || 60, source: "system" }),
      INCIDENT_CREATED: () => ({ type: "incident", title: "Incident detected", body: ev.data?.text || "", priority: 90, source: "system" }),
      RISK_DETECTED: () => ({ type: "incident", title: "Risk signal", body: ev.data?.text || "", priority: 80, source: "system" }),
    };
    const mk = map[ev.type];
    if (!mk) return;
    const base = mk();
    setItems((prev) => prev.some((x) => x.id === `live-${ev.id}`) ? prev : [{ id: `live-${ev.id}`, time: new Date(), raw: {}, ...base }, ...prev]);
  }, [events]);

  const dismiss = (id, label = "Done") => setDone((d) => ({ ...d, [id]: label }));

  const approve = async (item) => {
    setBusyId(item.id);
    try {
      const res = await executionApi.vote(item.raw.id);
      dismiss(item.id, res.status === "APPROVED_AND_EXECUTED" ? "Approved & executed" : `Vote recorded — ${res.remaining ?? 0} more needed`);
    } catch (e) { dismiss(item.id, `Failed: ${e.message}`); }
    finally { setBusyId(null); }
  };
  const reject = async (item) => {
    setBusyId(item.id);
    try { await executionApi.rejectApproval(item.raw.id); dismiss(item.id, "Rejected"); }
    catch (e) { dismiss(item.id, `Failed: ${e.message}`); }
    finally { setBusyId(null); }
  };
  const createJira = (item) => window.dispatchEvent(new CustomEvent("flow:create-jira", { detail: { title: item.title, description: item.body } }));
  const askBrain = (item) => { sessionStorage.setItem("flow_pending_ask", `${item.title}. ${item.body}`); navigate("/brain"); };
  const openDiff = (item) => { const o = item.raw?.ownership || {}; setDiffTarget({ repo: o.repo || item.raw?.repo, number: o.number || item.raw?.number }); };
  const openSlack = (item) => setSlackTarget({ title: item.title, owners: item.raw?.ownership?.owners || [] });
  const openPrep = (item) => setPrepTarget({ eventId: item.raw?.id, title: item.title, videoUrl: item.raw?.videoUrl });
  const askText = (q) => { sessionStorage.setItem("flow_pending_ask", q); navigate("/brain"); };

  const visible = items.filter((i) => filter === "all" || i.type === filter);
  const openCount = visible.filter((i) => !done[i.id]).length;

  return (
    <div style={{ padding: "24px", maxWidth: 820, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 18 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <InboxIcon style={{ width: 16, height: 16, color: "var(--brand)" }} />
            <h1 style={{ fontSize: 16, fontWeight: 500, color: "var(--t1)", letterSpacing: "-0.3px" }}>Inbox</h1>
            {openCount > 0 && <span style={{ fontSize: 10, fontWeight: 700, color: "var(--brand-text)", background: "rgba(124,110,255,0.12)", border: "1px solid var(--brand-line)", borderRadius: 10, padding: "1px 8px" }}>{openCount}</span>}
            <DataSourceBadge mode={demo ? "demo" : "live"} />
          </div>
          <p style={{ fontSize: 12, color: "var(--t4)" }}>Every signal, in one place — as work you can act on.</p>
        </div>
        <button onClick={load} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", fontSize: 12, color: "var(--t3)", background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)", borderRadius: 4, cursor: "pointer" }}>
          <RefreshCw style={{ width: 11, height: 11 }} /> Refresh
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 6, marginBottom: 18, flexWrap: "wrap" }}>
        {FILTERS.map((f) => {
          const active = filter === f.id;
          const n = f.id === "all" ? items.length : items.filter((i) => i.type === f.id).length;
          if (f.id !== "all" && n === 0) return null;
          return (
            <button key={f.id} onClick={() => setFilter(f.id)}
              style={{ padding: "4px 12px", fontSize: 12, borderRadius: 4, cursor: "pointer",
                background: active ? "rgba(124,110,255,0.08)" : "transparent",
                border: `1px solid ${active ? "var(--brand-line)" : "var(--border)"}`,
                color: active ? "var(--brand-text)" : "var(--t4)" }}>
              {f.label}{n > 0 && <span style={{ marginLeft: 5, opacity: 0.6 }}>{n}</span>}
            </button>
          );
        })}
      </div>

      {/* List */}
      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} style={{ height: 78, borderRadius: 8, background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.04) 50%, transparent)", animation: "shimmer-sweep 1.6s ease-in-out infinite" }} />
            </div>
          ))}
        </div>
      ) : visible.length === 0 ? (
        <EmptyState variant="inbox" message="Inbox zero" description="Nothing needs you right now. FLOW is watching everything else." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {visible.filter((item) => !done[item.id]).map((item) => (
            <ActionCard
              key={item.id}
              card={buildActionCard(item)}
              onExecute={({ card }) => setDone((d) => ({ ...d, [card.id]: "Done" }))}
              onDismiss={({ card }) => setItems((prev) => prev.filter((i) => i.id !== card.id))}
            />
          ))}
        </div>
      )}

      {diffTarget && <InlineDiffModal repo={diffTarget.repo} number={diffTarget.number} onClose={() => setDiffTarget(null)} />}
      {slackTarget && <SlackThreadPanel title={slackTarget.title} onClose={() => setSlackTarget(null)} />}
      {prepTarget && <InlineMeetingPrep eventId={prepTarget.eventId} title={prepTarget.title} videoUrl={prepTarget.videoUrl} onAsk={askText} onClose={() => setPrepTarget(null)} />}
    </div>
  );
}

function InboxRow({ item, busy, doneText, onApprove, onReject, onCreateJira, onAsk, onDismiss, navigate, onOpenDiff, onOpenSlack, onOpenPrep }) {
  const meta = TYPE_META[item.type] || TYPE_META.notification;
  const Icon = meta.icon;
  const band = priorityBand(item.priority);
  const accent = band === "critical" ? "var(--p-critical)" : band === "high" ? "var(--p-high)" : "var(--border-strong)";

  const rel = (() => {
    const m = Math.round((Date.now() - new Date(item.time).getTime()) / 60000);
    if (m < 1) return "now"; if (m < 60) return `${m}m`; const h = Math.round(m / 60); if (h < 24) return `${h}h`; return `${Math.round(h / 24)}d`;
  })();

  return (
    <div style={{ display: "flex", gap: 12, padding: "13px 14px", background: "var(--bg-card)", border: "1px solid var(--border)", borderLeft: `2px solid ${accent}`, borderRadius: 8, opacity: doneText ? 0.6 : 1, transition: "opacity 150ms" }}>
      <Icon style={{ width: 15, height: 15, color: meta.color, marginTop: 2, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: "var(--t1)" }}>{item.title}</span>
          <SourceBadge source={item.source} />
          <span style={{ fontSize: 10, color: "var(--t5)", marginLeft: "auto", fontVariantNumeric: "tabular-nums" }}>{rel}</span>
        </div>
        {item.body && <p style={{ fontSize: 12, color: "var(--t3)", lineHeight: 1.5, margin: "0 0 9px" }}>{item.body}</p>}

        {doneText ? (
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--p-normal-text)" }}>
            <Check style={{ width: 12, height: 12 }} /> {doneText}
          </div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {actionsFor(item, { onApprove, onReject, onCreateJira, onAsk, onDismiss, navigate, onOpenDiff, onOpenSlack, onOpenPrep, busy })}
          </div>
        )}
      </div>
    </div>
  );
}

function Btn({ icon: Icon, label, onClick, primary, danger, busy }) {
  return (
    <button onClick={onClick} disabled={busy}
      style={{
        display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 11px", borderRadius: 4, fontSize: 11, fontWeight: 500, cursor: busy ? "wait" : "pointer",
        background: primary ? "var(--brand)" : "rgba(255,255,255,0.03)",
        border: `1px solid ${primary ? "var(--brand)" : danger ? "rgba(255,87,87,0.3)" : "var(--border-strong)"}`,
        color: primary ? "#fff" : danger ? "var(--p-critical-text)" : "var(--t3)",
      }}>
      {busy ? <Loader2 style={{ width: 10, height: 10, animation: "spin 1s linear infinite" }} /> : Icon && <Icon style={{ width: 10, height: 10 }} />}
      {label}
    </button>
  );
}

function actionsFor(item, h) {
  switch (item.type) {
    case "approval":
      return [
        <Btn key="a" icon={Check} label="Approve" primary busy={h.busy} onClick={() => h.onApprove(item)} />,
        <Btn key="r" icon={X} label="Reject" danger busy={h.busy} onClick={() => h.onReject(item)} />,
        (item.raw?.connectorId === "github" && item.raw?.payloadRef?.number)
          ? <Btn key="v" icon={FileDiff} label="Review diff" onClick={() => h.onOpenDiff({ raw: { ownership: { repo: item.raw.payloadRef.repo || item.raw.payloadRef.owner, number: item.raw.payloadRef.number } } })} />
          : <Btn key="v" icon={FileDiff} label="Review" onClick={() => h.navigate("/projects")} />,
      ];
    case "conflict":
      return [
        <Btn key="d" icon={FileDiff} label="Open Diff" onClick={() => h.onOpenDiff(item)} />,
        <Btn key="m" icon={MessageSquare} label="Message" onClick={() => h.onOpenSlack(item)} />,
        <Btn key="s" icon={CalendarPlus} label="Create Meeting" onClick={() => h.navigate("/meetings")} />,
        <Btn key="j" icon={CheckSquare} label="Create Jira" onClick={() => h.onCreateJira(item)} />,
      ];
    case "recommendation":
      return [
        <Btn key="j" icon={CheckSquare} label="Create Jira" onClick={() => h.onCreateJira(item)} />,
        <Btn key="ask" icon={Sparkles} label="Ask FLOW" onClick={() => h.onAsk(item)} />,
        <Btn key="x" label="Dismiss" onClick={() => h.onDismiss(item.id, "Dismissed")} />,
      ];
    case "meeting":
      return [
        <Btn key="prep" icon={Sparkles} label="Prep with FLOW" primary onClick={() => h.onOpenPrep(item)} />,
        item.raw?.videoUrl
          ? <Btn key="join" icon={ExternalLink} label="Join" onClick={() => window.open(item.raw.videoUrl, "_blank")} />
          : <Btn key="open" icon={Calendar} label="Open" onClick={() => h.navigate("/meetings")} />,
      ];
    case "incident":
      return [
        <Btn key="ask" icon={Sparkles} label="Ask FLOW" onClick={() => h.onAsk(item)} />,
        <Btn key="t" icon={ExternalLink} label="Timeline" onClick={() => h.navigate("/activity")} />,
        <Btn key="x" label="Dismiss" onClick={() => h.onDismiss(item.id, "Acknowledged")} />,
      ];
    default:
      return [
        <Btn key="ask" icon={Sparkles} label="Ask FLOW" onClick={() => h.onAsk(item)} />,
        <Btn key="x" label="Dismiss" onClick={() => h.onDismiss(item.id, "Read")} />,
      ];
  }
}
