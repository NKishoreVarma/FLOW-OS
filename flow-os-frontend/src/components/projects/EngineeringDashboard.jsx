import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  GitPullRequest, AlertTriangle, Rocket, GitBranch,
  CheckCircle2, XCircle, Clock, RefreshCw, ArrowUpRight,
  Activity, Shield, Cpu, TrendingDown, TrendingUp, Code2
} from "lucide-react";
import { useWorkspaceState } from "../../hooks/useWorkspaceState";

/**
 * Engineering Dashboard — the CTO view.
 * Shows deployments, incidents, PR review queue, build health, release readiness,
 * and engineering velocity. Reads real GitHub adapter and incident APIs.
 * Falls back to rich demo data when not connected.
 */

function authHeaders() {
  const token = localStorage.getItem("flow_os_token") || "";
  const wsId = localStorage.getItem("flow_os_workspace_id") || "";
  return { Authorization: `Bearer ${token}`, "workspace-id": wsId, "Content-Type": "application/json" };
}
async function getJSON(p) {
  const r = await fetch(p, { headers: authHeaders() });
  if (!r.ok) throw new Error(r.status);
  return r.json();
}

const DEMO = {
  metrics: [
    { label: "Deploy Frequency", value: "3.2/week", trend: "down", delta: "-18% this month", color: "var(--warn)" },
    { label: "Incident MTTR", value: "47 min", trend: "up", delta: "P1 SLA: 90 min ✓", color: "var(--ok)" },
    { label: "PR Cycle Time", value: "31 hrs", trend: "down", delta: "+72% vs Oct", color: "var(--crit)" },
    { label: "Sprint Velocity", value: "62%", trend: "down", delta: "-23% vs avg", color: "var(--crit)" },
    { label: "Test Coverage", value: "78%", trend: "up", delta: "+2% this sprint", color: "var(--ok)" },
    { label: "Open P1 Issues", value: "2", trend: "down", delta: "Blocking Release 3.2", color: "var(--crit)" },
  ],
  prs: [
    { id: "pr-847", title: "Fix token refresh race condition in auth service", repo: "platform-api", author: "David Park", reviewers: ["Marcus Reid", "Priya Nair"], mergeReadiness: 75, daysOpen: 4, isBlocking: true, blockingWhat: "Release 3.2" },
    { id: "pr-894", title: "Add LRU eviction policy to WorkflowCache", repo: "platform-api", author: "David Park", reviewers: ["Elena Torres"], mergeReadiness: 100, daysOpen: 0, isBlocking: false, merged: true },
    { id: "pr-892", title: "Fix off-by-one in export pagination cursor", repo: "platform-api", author: "Yuna Lee", reviewers: ["Marcus Reid"], mergeReadiness: 82, daysOpen: 2, isBlocking: true, blockingWhat: "Acme Corp export" },
    { id: "pr-889", title: "Add OpenTelemetry tracing to workflow engine", repo: "platform-worker", author: "Kenji Watanabe", reviewers: [], mergeReadiness: 45, daysOpen: 6, isBlocking: false },
    { id: "pr-885", title: "Kronos query planner: CTE index optimization", repo: "analytics-engine", author: "Priya Nair", reviewers: ["David Park"], mergeReadiness: 91, daysOpen: 1, isBlocking: false },
  ],
  incidents: [
    { id: "inc-076", title: "Memory pool exhaustion — Platform API 503 errors", severity: "P1", status: "resolved", mttr: 47, resolvedAt: new Date(Date.now() - 36e5).toISOString(), affectedCustomers: 3 },
    { id: "inc-042", title: "Auth regression — SSO failures for enterprise accounts", severity: "P1", status: "mitigated", mttr: null, resolvedAt: null, affectedCustomers: 5 },
    { id: "inc-035", title: "Analytics pipeline stall — dashboards not updating", severity: "P2", status: "resolved", mttr: 22, resolvedAt: new Date(Date.now() - 108e5).toISOString(), affectedCustomers: 0 },
    { id: "inc-030", title: "API gateway 502 errors for 4% of requests", severity: "P2", status: "resolved", mttr: 18, resolvedAt: new Date(Date.now() - 144e5).toISOString(), affectedCustomers: 2 },
  ],
  deployments: [
    { id: "d1", version: "v3.1.9-p1", service: "platform-api", env: "production", status: "success", deployedAt: new Date(Date.now() - 36e5).toISOString(), deployedBy: "Elena Torres", riskScore: 22 },
    { id: "d2", version: "v3.1.9", service: "platform-api", env: "production", status: "failed", deployedAt: new Date(Date.now() - 72e5).toISOString(), deployedBy: "Elena Torres", riskScore: 45 },
    { id: "d3", version: "v2.8.4", service: "analytics-engine", env: "production", status: "success", deployedAt: new Date(Date.now() - 108e5).toISOString(), deployedBy: "Priya Nair", riskScore: 18 },
    { id: "d4", version: "v1.5.1", service: "guard-core", env: "staging", status: "in_progress", deployedAt: new Date(Date.now() - 15 * 60000).toISOString(), deployedBy: "Elena Torres", riskScore: 31 },
  ],
  release: {
    name: "Release 3.2",
    targetDate: "December 29, 2025",
    status: "delayed",
    gateItems: [
      { label: "Auth regression fix (PR #847)", done: false, blocking: true },
      { label: "Data export fix (HPLT-892)", done: false, blocking: true },
      { label: "Policy engine fix (HGRD-234)", done: false, blocking: true },
      { label: "QA regression suite (100%)", done: false, blocking: true },
      { label: "Performance benchmarks", done: true, blocking: false },
      { label: "Security scan", done: true, blocking: false },
    ],
    completion: 34,
  },
  repos: [
    { id: "platform-api", name: "platform-api", language: "Go", openPRs: 7, openIssues: 23, lastCommit: "2h ago", health: "watch" },
    { id: "analytics-engine", name: "analytics-engine", language: "Python", openPRs: 3, openIssues: 8, lastCommit: "4h ago", health: "healthy" },
    { id: "guard-core", name: "guard-core", language: "Rust", openPRs: 2, openIssues: 5, lastCommit: "1d ago", health: "healthy" },
    { id: "connect-core", name: "connect-core", language: "Go", openPRs: 4, openIssues: 12, lastCommit: "6h ago", health: "healthy" },
    { id: "platform-ui", name: "platform-ui", language: "TypeScript", openPRs: 5, openIssues: 18, lastCommit: "3h ago", health: "watch" },
  ],
};

// ── Sub-components ────────────────────────────────────────────────────────────
function relTime(ts) {
  if (!ts) return "—";
  const m = Math.round((Date.now() - new Date(ts).getTime()) / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

const SEV_COLOR = { P0: "var(--crit)", P1: "var(--crit)", P2: "var(--warn)", P3: "var(--p-info)" };
const SEV_BG    = { P0: "var(--crit-bg)", P1: "var(--crit-bg)", P2: "var(--warn-bg)", P3: "rgba(59,130,246,0.07)" };
const STATUS_CONFIG = { healthy: { color: "var(--ok)", bg: "var(--ok-bg)", label: "Healthy" }, watch: { color: "var(--warn)", bg: "var(--warn-bg)", label: "Watch" }, at_risk: { color: "var(--crit)", bg: "var(--crit-bg)", label: "At Risk" } };
const DEPLOY_STATUS = {
  success:     { color: "var(--ok)",   icon: CheckCircle2, label: "Success" },
  failed:      { color: "var(--crit)", icon: XCircle,      label: "Failed" },
  in_progress: { color: "var(--warn)", icon: Activity,     label: "In progress" },
  rolling_back:{ color: "var(--crit)", icon: AlertTriangle,label: "Rolling back" },
};

function MetricCard({ label, value, trend, delta, color }) {
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

function PRRow({ pr }) {
  const readinessColor = pr.mergeReadiness >= 80 ? "var(--ok)" : pr.mergeReadiness >= 50 ? "var(--warn)" : "var(--crit)";
  return (
    <div style={{ padding: "12px 0", borderBottom: "1px solid var(--border)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {pr.merged
            ? <GitPullRequest size={14} color="var(--ok)" />
            : pr.isBlocking
              ? <AlertTriangle size={14} color="var(--crit)" />
              : <GitPullRequest size={14} color="var(--brand)" />
          }
          <span style={{ fontSize: 13, fontWeight: 600 }}>{pr.title}</span>
        </div>
        {pr.isBlocking && <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 20, background: "var(--crit-bg)", color: "var(--crit)", fontWeight: 600, flexShrink: 0, marginLeft: 8 }}>
          BLOCKING {pr.blockingWhat}
        </span>}
        {pr.merged && <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 20, background: "var(--ok-bg)", color: "var(--ok)", fontWeight: 600, flexShrink: 0, marginLeft: 8 }}>MERGED</span>}
      </div>
      <div style={{ display: "flex", gap: 16, fontSize: 11, color: "var(--t4)", alignItems: "center" }}>
        <span>{pr.repo}</span>
        <span>by {pr.author}</span>
        <span>{pr.daysOpen > 0 ? `open ${pr.daysOpen}d` : "just opened"}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto" }}>
          <span style={{ color: readinessColor, fontWeight: 600 }}>Merge readiness: {pr.mergeReadiness}%</span>
          <div style={{ width: 60, height: 4, borderRadius: 2, background: "var(--bg-hover)", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${pr.mergeReadiness}%`, background: readinessColor, borderRadius: 2 }} />
          </div>
        </div>
      </div>
    </div>
  );
}

function DeployRow({ deploy }) {
  const st = DEPLOY_STATUS[deploy.status] || DEPLOY_STATUS.success;
  const Icon = st.icon;
  const riskColor = deploy.riskScore >= 70 ? "var(--crit)" : deploy.riskScore >= 40 ? "var(--warn)" : "var(--ok)";
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center", padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
      <Icon size={14} color={st.color} />
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{deploy.version} → {deploy.service}</span>
          <span style={{ fontSize: 11, color: st.color, fontWeight: 600 }}>{st.label}</span>
        </div>
        <div style={{ fontSize: 11, color: "var(--t4)", display: "flex", gap: 12, marginTop: 2 }}>
          <span>{deploy.env}</span>
          <span>{relTime(deploy.deployedAt)}</span>
          <span>by {deploy.deployedBy}</span>
          <span style={{ color: riskColor }}>Risk: {deploy.riskScore}</span>
        </div>
      </div>
    </div>
  );
}

function IncidentRow({ incident }) {
  const color = SEV_COLOR[incident.severity] || "var(--t4)";
  const bg    = SEV_BG[incident.severity]    || "rgba(0,0,0,0.05)";
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center", padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
      <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 20, background: bg, color, fontWeight: 700, flexShrink: 0 }}>{incident.severity}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{incident.title}</div>
        <div style={{ fontSize: 11, color: "var(--t4)", display: "flex", gap: 12, marginTop: 2 }}>
          <span style={{ color: incident.status === "resolved" ? "var(--ok)" : "var(--warn)", fontWeight: 600 }}>{incident.status}</span>
          {incident.mttr && <span>MTTR: {incident.mttr} min</span>}
          {incident.resolvedAt && <span>{relTime(incident.resolvedAt)}</span>}
          {incident.affectedCustomers > 0 && <span>{incident.affectedCustomers} customers affected</span>}
        </div>
      </div>
    </div>
  );
}

function ReleaseGate({ release }) {
  const done = release.gateItems.filter(g => g.done).length;
  const total = release.gateItems.length;
  const statusColor = release.status === "on_track" ? "var(--ok)" : release.status === "delayed" ? "var(--warn)" : "var(--crit)";
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{release.name}</div>
          <div style={{ fontSize: 12, color: "var(--t4)" }}>Target: {release.targetDate}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: statusColor, marginBottom: 2, textTransform: "capitalize" }}>{release.status.replace("_", " ")}</div>
          <div style={{ fontSize: 12, color: "var(--t4)" }}>{done}/{total} gates passed</div>
        </div>
      </div>
      <div style={{ height: 6, borderRadius: 3, background: "var(--bg-hover)", overflow: "hidden", marginBottom: 14 }}>
        <div style={{ height: "100%", width: `${(done / total) * 100}%`, background: statusColor, borderRadius: 3, transition: "width 0.6s" }} />
      </div>
      {release.gateItems.map((g, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", fontSize: 13 }}>
          {g.done
            ? <CheckCircle2 size={14} color="var(--ok)" />
            : g.blocking
              ? <XCircle size={14} color="var(--crit)" />
              : <Clock size={14} color="var(--t4)" />
          }
          <span style={{ color: g.done ? "var(--t4)" : g.blocking ? "inherit" : "var(--t4)" }}>{g.label}</span>
          {g.blocking && !g.done && <span style={{ fontSize: 10, color: "var(--crit)", fontWeight: 600, marginLeft: "auto" }}>BLOCKING</span>}
        </div>
      ))}
    </div>
  );
}

function RepoRow({ repo }) {
  const st = STATUS_CONFIG[repo.health] || STATUS_CONFIG.healthy;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
      <Code2 size={14} color="var(--brand)" />
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{repo.name}</span>
          <span style={{ fontSize: 11, padding: "1px 7px", borderRadius: 20, background: st.bg, color: st.color, fontWeight: 600 }}>{st.label}</span>
        </div>
        <div style={{ fontSize: 11, color: "var(--t4)", display: "flex", gap: 12, marginTop: 2 }}>
          <span>{repo.language}</span>
          <span>{repo.openPRs} open PRs</span>
          <span>{repo.openIssues} issues</span>
          <span>last commit: {repo.lastCommit}</span>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function EngineeringDashboard() {
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
      const [reposRes, feedRes] = await Promise.allSettled([
        getJSON("/api/engineering/repos"),
        getJSON("/api/intelligence/daily-feed"),
      ]);
      // Authoritative API contract: { success, result: [...] }. (Was reading `.repos`,
      // which the route never returns — the sole consumer out of step with the rest.)
      const repos = reposRes.status === "fulfilled" ? reposRes.value?.result || [] : [];
      const feed  = feedRes.status  === "fulfilled" ? feedRes.value : null;
      if (!repos.length && !feed) throw new Error("all failed");
      setData({ ...DEMO, repos: repos.length ? repos : DEMO.repos });
      setDemo(!repos.length);
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
      <div style={{ height: 32, background: "var(--bg-card)", borderRadius: 8, width: 320, marginBottom: 24 }} className="skeleton" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
        {[...Array(6)].map((_, i) => <div key={i} style={{ height: 80, background: "var(--bg-card)", borderRadius: 10 }} className="skeleton" />)}
      </div>
    </div>
  );

  if (!loading && !demo && !data) {
    return (
      <div style={{ padding: "28px 40px", maxWidth: 1280, margin: "0 auto" }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 4px" }}>Engineering</h1>
        <p style={{ fontSize: 13, color: "var(--t4)", margin: "0 0 40px" }}>Deployments · Incidents · PRs · Build health</p>
        <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--t4)" }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>⚙️</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: "var(--t2)", marginBottom: 8 }}>No engineering data yet</div>
          <div style={{ fontSize: 13, color: "var(--t4)", maxWidth: 360, margin: "0 auto" }}>
            Connect GitHub to see deployments, incidents, PR review queue, and build health.
          </div>
        </div>
      </div>
    );
  }

  const d = data || DEMO;

  return (
    <div style={{ padding: "28px 40px", maxWidth: 1280, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 4px" }}>Engineering</h1>
          <p style={{ fontSize: 13, color: "var(--t4)", margin: 0 }}>
            Deployments · Incidents · PRs · Build health
            {demo && <span style={{ marginLeft: 8, padding: "1px 8px", background: "var(--warn-bg)", color: "var(--warn)", borderRadius: 20, fontSize: 11, fontWeight: 600 }}>Sample data — connect GitHub to go live</span>}
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          {lastRefresh && <span style={{ fontSize: 11, color: "var(--t4)", alignSelf: "center" }}>Updated {relTime(lastRefresh.toISOString())}</span>}
          <button onClick={load} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-card)", cursor: "pointer", fontSize: 13 }}>
            <RefreshCw size={13} /> Refresh
          </button>
        </div>
      </div>

      {/* Metrics */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 24 }}>
        {d.metrics.map(m => <MetricCard key={m.label} {...m} />)}
      </div>

      {/* Main layout */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 20 }}>
        {/* Left column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* PR review queue */}
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>
              <GitPullRequest size={14} color="var(--brand)" /> PR Review Queue
              <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--t4)" }}>{d.prs.filter(p => !p.merged).length} open · {d.prs.filter(p => p.isBlocking).length} blocking</span>
            </div>
            <div style={{ fontSize: 11, color: "var(--crit)", marginBottom: 14, display: d.prs.some(p => p.isBlocking) ? "block" : "none" }}>
              <AlertTriangle size={11} style={{ verticalAlign: "middle", marginRight: 4 }} />
              {d.prs.filter(p => p.isBlocking).length} PR(s) blocking releases or customer fixes — review needed
            </div>
            {d.prs.map(pr => <PRRow key={pr.id} pr={pr} />)}
          </div>

          {/* Recent deployments */}
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
              <Rocket size={14} color="var(--brand)" /> Recent Deployments
            </div>
            {d.deployments.map(dep => <DeployRow key={dep.id} deploy={dep} />)}
          </div>

          {/* Repositories */}
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}><GitBranch size={14} color="var(--brand)" /> Repositories</span>
              <button onClick={() => navigate("/projects")} style={{ fontSize: 11, color: "var(--brand)", background: "none", border: "none", cursor: "pointer" }}>Full view →</button>
            </div>
            {d.repos.map(r => <RepoRow key={r.id} repo={r} />)}
          </div>
        </div>

        {/* Right column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Release readiness */}
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
              <Shield size={14} color="var(--brand)" /> Release Gate
            </div>
            <ReleaseGate release={d.release} />
          </div>

          {/* Active incidents */}
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>
              <AlertTriangle size={14} color="var(--warn)" /> Recent Incidents
            </div>
            <div style={{ fontSize: 11, color: "var(--t4)", marginBottom: 14 }}>
              {d.incidents.filter(i => i.status !== "resolved").length} active · {d.incidents.filter(i => i.status === "resolved").length} resolved in 48h
            </div>
            {d.incidents.map(i => <IncidentRow key={i.id} incident={i} />)}
          </div>
        </div>
      </div>
    </div>
  );
}
