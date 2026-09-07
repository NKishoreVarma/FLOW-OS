import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  TrendingUp, TrendingDown, AlertTriangle, CheckCircle2,
  Clock, Shield, Zap, Users, DollarSign, Activity,
  RefreshCw, ChevronRight, ArrowUpRight, Target, Brain
} from "lucide-react";
import DataSourceBadge from "../ui/DataSourceBadge";
import { EmptyState } from "../ui/EmptyState";
import { useWorkspaceState } from "../../hooks/useWorkspaceState";

/**
 * Executive Dashboard — company health at a glance.
 * Reads the instant Workspace Intelligence Cache (< 5ms) for health/KPIs,
 * approvals API for pending actions, brain for risks and goals.
 * No expensive reasoning on this screen — all data is pre-computed.
 */

function authHeaders() {
  const token = localStorage.getItem("flow_os_token") || "";
  const workspaceId = localStorage.getItem("flow_os_workspace_id") || "";
  return { Authorization: `Bearer ${token}`, "workspace-id": workspaceId, "Content-Type": "application/json" };
}
async function getJSON(p) {
  const r = await fetch(p, { headers: authHeaders() });
  if (!r.ok) throw new Error(r.status);
  return r.json();
}

// ── Demo data ─────────────────────────────────────────────────────────────────
const DEMO = {
  health: { overall: 72, trend: "down", delta: -4 },
  kpis: [
    { label: "ARR", value: "$4.2M", trend: "up", delta: "+18% YoY", color: "var(--ok)" },
    { label: "Churn Rate", value: "3.2%", trend: "up", delta: "-0.8% MoM", color: "var(--ok)" },
    { label: "NPS", value: "47", trend: "up", delta: "+6 pts", color: "var(--ok)" },
    { label: "P1 Open", value: "2", trend: "down", delta: "blocking Release 3.2", color: "var(--crit)" },
    { label: "Sprint Velocity", value: "62%", trend: "down", delta: "-23% vs avg", color: "var(--warn)" },
    { label: "Customers at Risk", value: "3", trend: "down", delta: "$450K ARR exposed", color: "var(--warn)" },
  ],
  domains: [
    { id: "engineering", label: "Engineering", status: "watch", score: 62, summary: "Sprint velocity at 62%. PR review bottleneck. Release 3.2 delayed to Dec 29.", source: "GitHub" },
    { id: "sales",       label: "Sales",       status: "healthy", score: 78, summary: "$1.4M closed Q4. $700K remaining. 2 deals risk slipping due to 3.2 delay.", source: "Gmail" },
    { id: "customers",   label: "Customers",   status: "at_risk", score: 48, summary: "Acme Corp renewal at risk ($285K, Dec 28). Health score 42. 2 open P1 tickets.", source: "FLOW" },
    { id: "security",    label: "Security",    status: "watch",   score: 71, summary: "HGRD-234 security disclosure sent to 5 customers. SOC 2 audit Jan 15.", source: "FLOW" },
    { id: "people",      label: "People",      status: "healthy", score: 80, summary: "2 SRE hires approved. Perf review cycle starts Jan 6.", source: "FLOW" },
    { id: "finance",     label: "Finance",     status: "healthy", score: 83, summary: "3% under budget YTD. Q4 close Dec 31.", source: "FLOW" },
  ],
  risks: [
    { id: "r1", severity: "critical", title: "Acme Corp renewal at risk", detail: "Dec 28 renewal ($285K ARR). Health score 42. Two P1 issues unresolved. Executive call Dec 16.", action: "View customer", route: "/customers" },
    { id: "r2", severity: "high",     title: "Release 3.2 delayed", detail: "Pushed to Dec 29. 3 blocking tickets. 2 enterprise deals waiting on Slack connector.", action: "View projects", route: "/projects" },
    { id: "r3", severity: "high",     title: "Engineering velocity -23%", detail: "Sprint 8: 62% completion. PR review bottleneck. 3 P1 incidents consumed 28 person-days.", action: "View weekly review", route: "/review" },
    { id: "r4", severity: "medium",   title: "HGRD-234 security disclosure", detail: "Policy engine bug disclosed to 5 customers. No data loss confirmed. SOC 2 impact to assess.", action: "View security", route: "/settings/security" },
  ],
  approvals: [
    { id: "a1", title: "Merge PR #847 — auth service fix", requestedBy: "David Park", riskLevel: "HIGH", age: "4d", category: "engineering" },
    { id: "a2", title: "Deploy v3.1.9-p2 to production", requestedBy: "Elena Torres", riskLevel: "HIGH", age: "2h", category: "devops" },
    { id: "a3", title: "Approve 15% credit for Acme Corp ($3,562)", requestedBy: "James Wilks", riskLevel: "MEDIUM", age: "1d", category: "finance" },
  ],
  goals: [
    { id: "g1", title: "Release 3.2 GA", target: "Dec 29", status: "at_risk", completion: 68, owner: "Jordan Kim" },
    { id: "g2", title: "Atlas GA (Q1 2026)", target: "Mar 31", status: "on_track", completion: 42, owner: "Sarah Chen" },
    { id: "g3", title: "ARR $5M", target: "Dec 31", status: "on_track", completion: 84, owner: "Daniel Wright" },
    { id: "g4", title: "Churn < 3%", target: "Dec 31", status: "at_risk", completion: 60, owner: "Michael Santos" },
  ],
  timeline: [
    { id: "t1", title: "INC-076 resolved — memory leak hotfix deployed", source: "incidents", at: new Date(Date.now() - 36e5).toISOString(), severity: "high" },
    { id: "t2", title: "Release 3.2 delayed to Dec 29 — announced to customers", source: "email", at: new Date(Date.now() - 72e5).toISOString(), severity: "medium" },
    { id: "t3", title: "GlobalTech expansion signed — $120K ACV", source: "salesforce", at: new Date(Date.now() - 108e5).toISOString(), severity: "low" },
    { id: "t4", title: "Sprint 8 closed — 62% velocity (target 85%)", source: "jira", at: new Date(Date.now() - 144e5).toISOString(), severity: "medium" },
    { id: "t5", title: "HGRD-234 security fix deployed + customers notified", source: "security", at: new Date(Date.now() - 216e5).toISOString(), severity: "high" },
  ],
};

// ── Sub-components ────────────────────────────────────────────────────────────
const STATUS_CONFIG = {
  healthy:  { label: "Healthy",    color: "var(--ok)",   bg: "var(--ok-bg)"   },
  watch:    { label: "Attention",  color: "var(--warn)",  bg: "var(--warn-bg)" },
  at_risk:  { label: "At Risk",   color: "var(--crit)",  bg: "var(--crit-bg)" },
  unknown:  { label: "Unknown",   color: "var(--t4)",    bg: "rgba(0,0,0,0.05)" },
};
const RISK_COLOR = { critical: "var(--crit)", high: "var(--warn)", medium: "var(--p-info)" };
const RISK_BG    = { critical: "var(--crit-bg)", high: "var(--warn-bg)", medium: "rgba(59,130,246,0.07)" };
const GOAL_STATUS = {
  on_track: { color: "var(--ok)",   label: "On track" },
  at_risk:  { color: "var(--warn)", label: "At risk" },
  delayed:  { color: "var(--crit)", label: "Delayed" },
  complete: { color: "var(--ok)",   label: "Done" },
};

function relTime(ts) {
  const m = Math.round((Date.now() - new Date(ts).getTime()) / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

function HealthRing({ score, size = 80 }) {
  const r = size / 2 - 6;
  const circ = 2 * Math.PI * r;
  const pct = Math.min(Math.max(score, 0), 100);
  const color = pct >= 75 ? "var(--ok)" : pct >= 55 ? "var(--warn)" : "var(--crit)";
  return (
    <svg width={size} height={size}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--bg-card)" strokeWidth={6} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={6}
        strokeDasharray={`${circ * pct / 100} ${circ}`}
        strokeDashoffset={circ * 0.25}
        strokeLinecap="round" />
      <text x="50%" y="54%" textAnchor="middle" dominantBaseline="middle"
        style={{ fontSize: size * 0.24, fontWeight: 700, fill: color, fontFamily: "inherit" }}>
        {pct}
      </text>
    </svg>
  );
}

function KpiCard({ label, value, trend, delta, color }) {
  const Icon = trend === "up" ? TrendingUp : TrendingDown;
  return (
    <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 16px" }}>
      <div style={{ fontSize: 11, color: "var(--t4)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color, marginBottom: 4 }}>{value}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--t4)" }}>
        <Icon size={11} color={color} />
        <span>{delta}</span>
      </div>
    </div>
  );
}

function DomainCard({ domain, onClick }) {
  const st = STATUS_CONFIG[domain.status] || STATUS_CONFIG.unknown;
  return (
    <button onClick={onClick} style={{
      background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 10,
      padding: "14px 16px", textAlign: "left", cursor: "pointer", width: "100%",
      transition: "border-color 0.15s",
    }}
      onMouseEnter={e => e.currentTarget.style.borderColor = "var(--border-strong)"}
      onMouseLeave={e => e.currentTarget.style.borderColor = "var(--border)"}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>{domain.label}</span>
        <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, background: st.bg, color: st.color, fontWeight: 600 }}>{st.label}</span>
      </div>
      <div style={{ marginBottom: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
          <span style={{ fontSize: 11, color: "var(--t4)" }}>Health</span>
          <span style={{ fontSize: 11, fontWeight: 600, color: st.color }}>{domain.score}</span>
        </div>
        <div style={{ height: 4, borderRadius: 2, background: "var(--bg-hover)", overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${domain.score}%`, background: st.color, borderRadius: 2, transition: "width 0.6s" }} />
        </div>
      </div>
      <p style={{ fontSize: 12, color: "var(--t4)", margin: 0, lineHeight: 1.5 }}>{domain.summary}</p>
    </button>
  );
}

function RiskRow({ risk, onAction }) {
  const color = RISK_COLOR[risk.severity] || "var(--t4)";
  const bg    = RISK_BG[risk.severity]    || "rgba(0,0,0,0.05)";
  return (
    <div style={{ display: "flex", gap: 12, padding: "12px 0", borderBottom: "1px solid var(--border)" }}>
      <div style={{ width: 8, height: 8, borderRadius: "50%", background: color, marginTop: 5, flexShrink: 0 }} />
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 3 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{risk.title}</span>
          <span style={{ fontSize: 10, padding: "1px 7px", borderRadius: 20, background: bg, color, fontWeight: 600, flexShrink: 0, marginLeft: 8, textTransform: "uppercase" }}>
            {risk.severity}
          </span>
        </div>
        <p style={{ fontSize: 12, color: "var(--t4)", margin: "0 0 6px" }}>{risk.detail}</p>
        <button onClick={() => onAction(risk.route)} style={{
          fontSize: 11, color: "var(--brand)", background: "none", border: "none",
          cursor: "pointer", padding: 0, display: "flex", alignItems: "center", gap: 3,
        }}>
          {risk.action} <ArrowUpRight size={11} />
        </button>
      </div>
    </div>
  );
}

function ApprovalRow({ approval, onApprove }) {
  const riskColors = { HIGH: "var(--warn)", CRITICAL: "var(--crit)", MEDIUM: "var(--p-info)", LOW: "var(--ok)" };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{approval.title}</div>
        <div style={{ fontSize: 11, color: "var(--t4)" }}>
          by {approval.requestedBy} · {approval.age} ago ·{" "}
          <span style={{ color: riskColors[approval.riskLevel] || "var(--t4)" }}>{approval.riskLevel} risk</span>
        </div>
      </div>
      <button onClick={() => onApprove(approval)} style={{
        fontSize: 12, padding: "5px 12px", borderRadius: 6, border: "1px solid var(--ok)",
        background: "var(--ok-bg)", color: "var(--ok)", cursor: "pointer", fontWeight: 600,
      }}>
        Review
      </button>
    </div>
  );
}

function GoalRow({ goal }) {
  const st = GOAL_STATUS[goal.status] || GOAL_STATUS.on_track;
  return (
    <div style={{ padding: "12px 0", borderBottom: "1px solid var(--border)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>{goal.title}</span>
        <span style={{ fontSize: 11, color: st.color, fontWeight: 600 }}>{st.label}</span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 11, color: "var(--t4)" }}>
        <span>Owner: {goal.owner}</span>
        <span>Target: {goal.target}</span>
      </div>
      <div style={{ height: 4, borderRadius: 2, background: "var(--bg-hover)", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${goal.completion}%`, background: st.color, borderRadius: 2, transition: "width 0.6s" }} />
      </div>
    </div>
  );
}

function TimelineItem({ item }) {
  const severityColor = { high: "var(--crit)", medium: "var(--warn)", low: "var(--ok)" };
  return (
    <div style={{ display: "flex", gap: 12, padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
      <div style={{ width: 6, height: 6, borderRadius: "50%", background: severityColor[item.severity] || "var(--t4)", marginTop: 6, flexShrink: 0 }} />
      <div>
        <div style={{ fontSize: 13 }}>{item.title}</div>
        <div style={{ fontSize: 11, color: "var(--t4)", marginTop: 2 }}>
          {relTime(item.at)} · {item.source}
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ExecutiveDashboard() {
  const navigate = useNavigate();
  const wsState = useWorkspaceState();
  const isDemoWorkspace = wsState.workspaceMode === 'demo';
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [demo, setDemo] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [snapRes, approvalsRes, goalsRes, timelineRes] = await Promise.allSettled([
        getJSON("/api/workspace/snapshot"),
        getJSON("/api/approvals?limit=5"),
        getJSON("/api/brain/goals?limit=6"),
        getJSON("/api/brain/timeline?hours=48&limit=8"),
      ]);

      const snap    = snapRes.status      === "fulfilled" ? snapRes.value      : null;
      const approvals = approvalsRes.status === "fulfilled" ? approvalsRes.value : null;
      const goals   = goalsRes.status     === "fulfilled" ? goalsRes.value     : null;
      const timeline = timelineRes.status  === "fulfilled" ? timelineRes.value  : null;

      if (!snap && !approvals && !goals && !timeline) throw new Error("all failed");

      const domains = snap?.domains
        ? Object.entries(snap.domains).map(([id, d]) => ({
            id, label: id.charAt(0).toUpperCase() + id.slice(1),
            status: d.status || "unknown", score: d.score || 0,
            summary: (d.topRisks?.[0]) || (d.recentActivity?.[0]?.title) || "No recent activity",
            source: id === "engineering" ? "GitHub" : "FLOW",
          }))
        : DEMO.domains;

      setData({
        health: { overall: snap?.overall?.health || DEMO.health.overall, trend: "down", delta: -4 },
        kpis: [],
        domains,
        risks: [],
        approvals: approvals?.approvals || approvals?.data || DEMO.approvals,
        goals: goals?.goals || goals?.data || DEMO.goals,
        timeline: timeline?.timeline || timeline?.data || DEMO.timeline,
      });
      setDemo(!snap && !approvals);
    } catch {
      if (isDemoWorkspace) {
        setData(DEMO);
        setDemo(true);
      } else {
        setData(null);
        setDemo(false);
      }
    } finally {
      setLoading(false);
      setLastRefresh(new Date());
    }
  }, [isDemoWorkspace]);

  useEffect(() => { load(); }, [load]);

  if (loading) return (
    <div style={{ padding: "32px 40px" }}>
      <div style={{ height: 32, background: "var(--bg-card)", borderRadius: 8, width: 280, marginBottom: 24 }} className="skeleton" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
        {[...Array(6)].map((_, i) => (
          <div key={i} style={{ height: 80, background: "var(--bg-card)", borderRadius: 10 }} className="skeleton" />
        ))}
      </div>
    </div>
  );

  if (!loading && !demo && !data) {
    return (
      <div style={{ padding: "28px 40px", maxWidth: 1280, margin: "0 auto" }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 4px" }}>Executive Dashboard</h1>
        <p style={{ fontSize: 13, color: "var(--t4)", margin: "0 0 40px" }}>Company health · KPIs · Risks · Goals</p>
        <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--t4)" }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>🏢</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: "var(--t2)", marginBottom: 8 }}>Connect your data sources to see executive intelligence.</div>
          <div style={{ fontSize: 13, color: "var(--t4)", maxWidth: 360, margin: "0 auto" }}>
            Once connected, you'll see company health, KPIs, risks, and goals here.
          </div>
        </div>
      </div>
    );
  }

  const d = data || DEMO;
  const healthColor = d.health.overall >= 75 ? "var(--ok)" : d.health.overall >= 55 ? "var(--warn)" : "var(--crit)";

  return (
    <div style={{ padding: "28px 40px", maxWidth: 1280, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 4px" }}>Executive Dashboard</h1>
          <p style={{ fontSize: 13, color: "var(--t4)", margin: 0 }}>
            Company health · KPIs · Risks · Goals
            {demo && <span style={{ marginLeft: 8, padding: "1px 8px", background: "var(--warn-bg)", color: "var(--warn)", borderRadius: 20, fontSize: 11, fontWeight: 600 }}>Sample data</span>}
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {lastRefresh && <span style={{ fontSize: 11, color: "var(--t4)" }}>Updated {relTime(lastRefresh.toISOString())}</span>}
          <button onClick={load} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-card)", cursor: "pointer", fontSize: 13 }}>
            <RefreshCw size={13} /> Refresh
          </button>
        </div>
      </div>

      {/* Company health + KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 20, marginBottom: 24 }}>
        {/* Health ring */}
        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: "20px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}>
          <div style={{ fontSize: 12, color: "var(--t4)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Company Health</div>
          <HealthRing score={d.health.overall} size={96} />
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: healthColor }}>
            <TrendingDown size={13} />
            <span>{Math.abs(d.health.delta)} pts this week</span>
          </div>
        </div>

        {/* KPIs grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          {d.kpis.map(kpi => <KpiCard key={kpi.label} {...kpi} />)}
        </div>
      </div>

      {/* Domain health */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
          <Activity size={14} /> Domain Health
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          {d.domains.map(domain => (
            <DomainCard key={domain.id} domain={domain} onClick={() => {
              const routes = { engineering: "/projects", sales: "/customers", customers: "/customers", security: "/settings/security", people: "/people", finance: "/success" };
              navigate(routes[domain.id] || "/");
            }} />
          ))}
        </div>
      </div>

      {/* Bottom row: Risks + Approvals + Goals + Timeline */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        {/* Risks */}
        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>
            <AlertTriangle size={14} color="var(--warn)" /> Top Risks
          </div>
          <div style={{ fontSize: 11, color: "var(--t4)", marginBottom: 14 }}>{d.risks.length} active risks require attention</div>
          {d.risks.map(r => <RiskRow key={r.id} risk={r} onAction={navigate} />)}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Approvals */}
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}><CheckCircle2 size={14} color="var(--brand)" /> Pending Approvals</span>
              <button onClick={() => navigate("/admin/ops")} style={{ fontSize: 11, color: "var(--brand)", background: "none", border: "none", cursor: "pointer" }}>View all →</button>
            </div>
            {d.approvals.slice(0, 3).map(a => (
              <ApprovalRow key={a.id} approval={a} onApprove={() => navigate("/admin/ops")} />
            ))}
            {d.approvals.length === 0 && <div style={{ fontSize: 13, color: "var(--t4)", padding: "16px 0", textAlign: "center" }}>No pending approvals</div>}
          </div>

          {/* Goals */}
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
              <Target size={14} color="var(--brand)" /> Business Goals
            </div>
            {d.goals.slice(0, 4).map(g => <GoalRow key={g.id} goal={g} />)}
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: 20, marginTop: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 8 }}><Clock size={14} /> Recent Events</span>
          <button onClick={() => navigate("/activity")} style={{ fontSize: 11, color: "var(--brand)", background: "none", border: "none", cursor: "pointer" }}>Full timeline →</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "0 32px" }}>
          {d.timeline.map(t => <TimelineItem key={t.id} item={t} />)}
        </div>
      </div>
    </div>
  );
}
