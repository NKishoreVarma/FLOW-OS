import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Heart, AlertTriangle, TrendingDown, TrendingUp,
  Clock, MessageSquare, Users, DollarSign, RefreshCw,
  ChevronRight, ArrowUpRight, Star, XCircle, CheckCircle2, Activity
} from "lucide-react";
import { useWorkspaceState } from "../../hooks/useWorkspaceState";

/**
 * Support Dashboard — Customer Success view.
 * Shows customer health portfolio, escalations, SLA tracking,
 * churn risk, and sentiment analysis.
 * Falls back to rich demo data (Helios Software narrative).
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
  portfolio: {
    totalArr: 4200000,
    totalCustomers: 210,
    healthyPct: 62,
    atRiskArr: 450000,
    atRiskCount: 3,
    churnRiskArr: 285000,
    avgNps: 47,
    avgHealthScore: 68,
  },
  metrics: [
    { label: "Avg Health Score", value: "68", trend: "down", delta: "-4 pts this month", color: "var(--warn)" },
    { label: "NPS", value: "47", trend: "up", delta: "+6 vs last quarter", color: "var(--ok)" },
    { label: "Open Escalations", value: "3", trend: "down", delta: "$450K ARR exposed", color: "var(--crit)" },
    { label: "P1 SLA Compliance", value: "94%", trend: "up", delta: "Target: 90%", color: "var(--ok)" },
    { label: "Renewals this month", value: "4", trend: "up", delta: "$815K ARR", color: "var(--ok)" },
    { label: "ARR at risk", value: "$450K", trend: "down", delta: "3 customers", color: "var(--crit)" },
  ],
  escalations: [
    {
      id: "esc-001",
      customerId: "cust-acme-corp",
      customerName: "Acme Corp",
      arr: 285000,
      tier: "enterprise",
      healthScore: 42,
      issue: "2 open P1 bugs (HPLT-847, HPLT-892) for 8+ days. INC-076 caused 847 failed executions overnight. Renewal Dec 28.",
      csmOwner: "James Wilks",
      nextAction: "Engineering call Dec 16 — fixes expected same day",
      riskLevel: "critical",
      renewalDate: "Dec 28, 2025",
      sentiment: "negative",
    },
    {
      id: "esc-002",
      customerId: "cust-pinnacle-logistics",
      customerName: "Pinnacle Logistics",
      arr: 112000,
      tier: "growth",
      healthScore: 51,
      issue: "Only 12% seat activation (24/200). IT hasn't enabled SSO — policy blocks rollout. Renewal Dec 31.",
      csmOwner: "Neha Sharma",
      nextAction: "SSO setup call scheduled Dec 17 — IT team joining",
      riskLevel: "high",
      renewalDate: "Dec 31, 2025",
      sentiment: "neutral",
    },
    {
      id: "esc-003",
      customerId: "cust-cloudnine-retail",
      customerName: "CloudNine Retail",
      arr: 53000,
      tier: "growth",
      healthScore: 58,
      issue: "GDPR data access request submitted Dec 14. 30-day response deadline Jan 13. Legal review pending.",
      csmOwner: "James Wilks",
      nextAction: "Legal team response due Jan 5",
      riskLevel: "medium",
      renewalDate: "Mar 15, 2026",
      sentiment: "neutral",
    },
  ],
  customers: [
    { id: "cust-meridian-health",        name: "Meridian Health",       arr: 200000, health: 74, tier: "enterprise", trend: "stable", lastActivity: "Security disclosure acknowledged", nps: 52 },
    { id: "cust-globaltech-solutions",   name: "GlobalTech Solutions",  arr: 204000, health: 81, tier: "enterprise", trend: "up",     lastActivity: "Expansion signed ($120K)",       nps: 68 },
    { id: "cust-quantumleap-ai",         name: "QuantumLeap AI",        arr: 95000,  health: 88, tier: "growth",     trend: "up",     lastActivity: "Series A announced — $40M",     nps: 74 },
    { id: "cust-nexigen-pharma",         name: "Nexigen Pharma",        arr: 180000, health: 71, tier: "enterprise", trend: "stable", lastActivity: "QBR completed — renewal on track", nps: 48 },
    { id: "cust-techvision-inc",         name: "TechVision Inc",        arr: 82000,  health: 63, tier: "growth",     trend: "down",   lastActivity: "Waiting for Release 3.2 features", nps: 41 },
    { id: "cust-finedge-capital",        name: "FinEdge Capital",       arr: 145000, health: 77, tier: "enterprise", trend: "stable", lastActivity: "Audit log export completed",     nps: 55 },
    { id: "cust-rocketship-io",          name: "Rocketship.io",         arr: 95000,  health: 91, tier: "growth",     trend: "up",     lastActivity: "45 workflows automated in 2 weeks", nps: 82 },
  ],
  sla: {
    p1Target: 90,
    p1Actual: 94,
    p1OpenCount: 2,
    avgResponseTimeHours: 2.4,
    responseTargetHours: 4,
    ticketsThisWeek: 34,
    closedThisWeek: 31,
    csat: 4.2,
    csatTarget: 4.0,
  },
  upcoming: [
    { customerId: "cust-acme-corp", name: "Acme Corp", arr: 285000, renewalDate: "Dec 28, 2025", health: 42, riskLevel: "critical", owner: "James Wilks" },
    { customerId: "cust-pinnacle-logistics", name: "Pinnacle Logistics", arr: 112000, renewalDate: "Dec 31, 2025", health: 51, riskLevel: "high", owner: "Neha Sharma" },
    { customerId: "cust-meridian-health", name: "Meridian Health", arr: 200000, renewalDate: "Jan 15, 2026", health: 74, riskLevel: "low", owner: "James Wilks" },
    { customerId: "cust-nexigen-pharma", name: "Nexigen Pharma", arr: 180000, renewalDate: "Feb 1, 2026", health: 71, riskLevel: "low", owner: "Neha Sharma" },
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

const RISK_COLOR = { critical: "var(--crit)", high: "var(--warn)", medium: "var(--p-info)", low: "var(--ok)" };
const RISK_BG    = { critical: "var(--crit-bg)", high: "var(--warn-bg)", medium: "rgba(59,130,246,0.07)", low: "var(--ok-bg)" };

const SENTIMENT = {
  positive: { color: "var(--ok)",   icon: "😊" },
  neutral:  { color: "var(--t4)",   icon: "😐" },
  negative: { color: "var(--crit)", icon: "😟" },
};

function fmt(n) { return n >= 1000000 ? `$${(n/1000000).toFixed(1)}M` : n >= 1000 ? `$${Math.round(n/1000)}K` : `$${n}`; }
function healthColor(s) { return s >= 75 ? "var(--ok)" : s >= 55 ? "var(--warn)" : "var(--crit)"; }

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

function HealthBar({ score }) {
  const color = healthColor(score);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ width: 56, height: 4, borderRadius: 2, background: "var(--bg-hover)", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${score}%`, background: color, borderRadius: 2 }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 600, color }}>{score}</span>
    </div>
  );
}

function EscalationCard({ esc, onClick }) {
  const riskColor = RISK_COLOR[esc.riskLevel] || "var(--t4)";
  const riskBg    = RISK_BG[esc.riskLevel]    || "rgba(0,0,0,0.05)";
  const sent = SENTIMENT[esc.sentiment] || SENTIMENT.neutral;
  return (
    <div style={{ background: "var(--bg-card)", border: `1px solid ${riskBg.replace("0.07","0.3").replace("0.08","0.3")}`, borderRadius: 12, padding: 20, borderLeft: `4px solid ${riskColor}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 2 }}>{esc.customerName}</div>
          <div style={{ fontSize: 12, color: "var(--t4)" }}>{fmt(esc.arr)} ARR · {esc.tier} · Renewal {esc.renewalDate}</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 12 }}>{sent.icon}</span>
          <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: riskBg, color: riskColor, fontWeight: 600, textTransform: "uppercase" }}>{esc.riskLevel}</span>
        </div>
      </div>
      <div style={{ display: "flex", gap: 12, marginBottom: 10 }}>
        <HealthBar score={esc.healthScore} />
        <span style={{ fontSize: 11, color: "var(--t4)" }}>CSM: {esc.csmOwner}</span>
      </div>
      <p style={{ fontSize: 13, margin: "0 0 10px", lineHeight: 1.5 }}>{esc.issue}</p>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0 0", borderTop: "1px solid var(--border)" }}>
        <div style={{ fontSize: 12, color: "var(--t4)" }}>
          <strong style={{ color: "inherit" }}>Next:</strong> {esc.nextAction}
        </div>
        <button onClick={onClick} style={{ fontSize: 11, color: "var(--brand)", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 3 }}>
          View customer <ArrowUpRight size={11} />
        </button>
      </div>
    </div>
  );
}

function CustomerRow({ customer }) {
  const trendIcon = customer.trend === "up" ? "↑" : customer.trend === "down" ? "↓" : "→";
  const trendColor = customer.trend === "up" ? "var(--ok)" : customer.trend === "down" ? "var(--crit)" : "var(--t4)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{customer.name}</span>
          <span style={{ fontSize: 12, color: trendColor, fontWeight: 600 }}>{trendIcon}</span>
        </div>
        <div style={{ fontSize: 11, color: "var(--t4)" }}>{customer.lastActivity}</div>
      </div>
      <div style={{ textAlign: "right" }}>
        <HealthBar score={customer.health} />
        <div style={{ fontSize: 11, color: "var(--t4)", marginTop: 2 }}>{fmt(customer.arr)}</div>
      </div>
    </div>
  );
}

function RenewalRow({ r }) {
  const riskColor = RISK_COLOR[r.riskLevel] || "var(--t4)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
      <div style={{ width: 8, height: 8, borderRadius: "50%", background: riskColor, flexShrink: 0 }} />
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{r.name}</span>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{fmt(r.arr)}</span>
        </div>
        <div style={{ fontSize: 11, color: "var(--t4)", display: "flex", justifyContent: "space-between", marginTop: 2 }}>
          <span>{r.renewalDate} · {r.owner}</span>
          <HealthBar score={r.health} />
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function SupportDashboard() {
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
      const [customersRes] = await Promise.allSettled([
        getJSON("/api/brain/context/customers?limit=20"),
      ]);
      const customers = customersRes.status === "fulfilled" ? customersRes.value : null;
      if (!customers) throw new Error("no data");
      setData({ ...DEMO, customers: customers.items || DEMO.customers });
      setDemo(false);
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
        {[...Array(6)].map((_, i) => <div key={i} style={{ height: 80, background: "var(--bg-card)", borderRadius: 10 }} className="skeleton" />)}
      </div>
    </div>
  );

  if (!loading && !demo && !data) {
    return (
      <div style={{ padding: "28px 40px", maxWidth: 1280, margin: "0 auto" }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 4px" }}>Customer Success</h1>
        <p style={{ fontSize: 13, color: "var(--t4)", margin: "0 0 40px" }}>Health · Escalations · SLA · Churn risk · Renewals</p>
        <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--t4)" }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>📊</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: "var(--t2)", marginBottom: 8 }}>No customer data yet</div>
          <div style={{ fontSize: 13, color: "var(--t4)", maxWidth: 360, margin: "0 auto" }}>
            Connect your CRM or import customer data to see health scores, escalations, and renewal tracking.
          </div>
        </div>
      </div>
    );
  }

  const d = data || DEMO;
  const sla = d.sla;

  return (
    <div style={{ padding: "28px 40px", maxWidth: 1280, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 4px" }}>Customer Success</h1>
          <p style={{ fontSize: 13, color: "var(--t4)", margin: 0 }}>
            Health · Escalations · SLA · Churn risk · Renewals
            {demo && <span style={{ marginLeft: 8, padding: "1px 8px", background: "var(--warn-bg)", color: "var(--warn)", borderRadius: 20, fontSize: 11, fontWeight: 600 }}>Sample data</span>}
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          {lastRefresh && <span style={{ fontSize: 11, color: "var(--t4)", alignSelf: "center" }}>Updated {relTime(lastRefresh.toISOString())}</span>}
          <button onClick={load} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-card)", cursor: "pointer", fontSize: 13 }}>
            <RefreshCw size={13} /> Refresh
          </button>
        </div>
      </div>

      {/* Portfolio summary */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 24 }}>
        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 10, padding: "16px", gridColumn: "1" }}>
          <div style={{ fontSize: 11, color: "var(--t4)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Total ARR</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: "var(--ok)" }}>{fmt(d.portfolio.totalArr)}</div>
          <div style={{ fontSize: 11, color: "var(--t4)", marginTop: 4 }}>{d.portfolio.totalCustomers} customers</div>
        </div>
        <div style={{ background: "var(--crit-bg)", border: "1px solid rgba(194,58,38,0.2)", borderRadius: 10, padding: "16px" }}>
          <div style={{ fontSize: 11, color: "var(--t4)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>ARR at Risk</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: "var(--crit)" }}>{fmt(d.portfolio.atRiskArr)}</div>
          <div style={{ fontSize: 11, color: "var(--t4)", marginTop: 4 }}>{d.portfolio.atRiskCount} customers flagged</div>
        </div>
        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 10, padding: "16px" }}>
          <div style={{ fontSize: 11, color: "var(--t4)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Avg Health</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: "var(--warn)" }}>{d.portfolio.avgHealthScore}</div>
          <div style={{ fontSize: 11, color: "var(--t4)", marginTop: 4 }}>{d.portfolio.healthyPct}% healthy</div>
        </div>
        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 10, padding: "16px" }}>
          <div style={{ fontSize: 11, color: "var(--t4)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>NPS</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: "var(--ok)" }}>{d.portfolio.avgNps}</div>
          <div style={{ fontSize: 11, color: "var(--t4)", marginTop: 4 }}>+6 pts this quarter</div>
        </div>
      </div>

      {/* Metrics row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 24 }}>
        {d.metrics.slice(0, 6).map(m => <MetricCard key={m.label} {...m} />)}
      </div>

      {/* Main layout */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 20 }}>
        {/* Left: escalations + customer list */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Active escalations */}
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
              <AlertTriangle size={14} color="var(--crit)" /> Active Escalations
              {d.escalations.length > 0 && <span style={{ fontSize: 11, padding: "1px 8px", borderRadius: 20, background: "var(--crit-bg)", color: "var(--crit)", fontWeight: 600 }}>{d.escalations.length}</span>}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {d.escalations.map(e => (
                <EscalationCard key={e.id} esc={e} onClick={() => navigate("/customers")} />
              ))}
            </div>
          </div>

          {/* Customer health table */}
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}><Heart size={14} color="var(--brand)" /> Customer Health</span>
              <button onClick={() => navigate("/customers")} style={{ fontSize: 11, color: "var(--brand)", background: "none", border: "none", cursor: "pointer" }}>Full view →</button>
            </div>
            {d.customers.map(c => <CustomerRow key={c.id} customer={c} />)}
          </div>
        </div>

        {/* Right: SLA + renewals */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* SLA metrics */}
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
              <Clock size={14} color="var(--brand)" /> SLA Performance
            </div>
            {[
              { label: "P1 Response (target 90 min)", value: sla.avgResponseTimeHours + "h avg", pct: sla.p1Actual, target: sla.p1Target, color: sla.p1Actual >= sla.p1Target ? "var(--ok)" : "var(--crit)" },
              { label: "CSAT (target 4.0)", value: `${sla.csat}/5`, pct: (sla.csat / 5) * 100, target: (sla.csatTarget / 5) * 100, color: sla.csat >= sla.csatTarget ? "var(--ok)" : "var(--warn)" },
              { label: "Ticket closure (this week)", value: `${sla.closedThisWeek}/${sla.ticketsThisWeek}`, pct: (sla.closedThisWeek / sla.ticketsThisWeek) * 100, target: 90, color: "var(--ok)" },
            ].map(s => (
              <div key={s.label} style={{ marginBottom: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: 12 }}>
                  <span style={{ color: "var(--t4)" }}>{s.label}</span>
                  <span style={{ fontWeight: 600, color: s.color }}>{s.value}</span>
                </div>
                <div style={{ height: 4, borderRadius: 2, background: "var(--bg-hover)", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${Math.min(s.pct, 100)}%`, background: s.color, borderRadius: 2 }} />
                </div>
              </div>
            ))}
            <div style={{ padding: "10px 0 0", borderTop: "1px solid var(--border)", display: "flex", gap: 16, fontSize: 12 }}>
              <div>
                <div style={{ color: "var(--t4)", marginBottom: 2 }}>Open P1</div>
                <div style={{ fontWeight: 700, color: sla.p1OpenCount > 0 ? "var(--crit)" : "var(--ok)" }}>{sla.p1OpenCount}</div>
              </div>
              <div>
                <div style={{ color: "var(--t4)", marginBottom: 2 }}>Tickets this week</div>
                <div style={{ fontWeight: 700 }}>{sla.ticketsThisWeek}</div>
              </div>
              <div>
                <div style={{ color: "var(--t4)", marginBottom: 2 }}>Avg response</div>
                <div style={{ fontWeight: 700 }}>{sla.avgResponseTimeHours}h</div>
              </div>
            </div>
          </div>

          {/* Upcoming renewals */}
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
              <DollarSign size={14} color="var(--brand)" /> Upcoming Renewals
            </div>
            <div style={{ marginBottom: 10, padding: 10, borderRadius: 8, background: "var(--crit-bg)", border: "1px solid rgba(194,58,38,0.15)" }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--crit)", marginBottom: 2 }}>⚠ {fmt(d.portfolio.churnRiskArr)} ARR renewing this month</div>
              <div style={{ fontSize: 11, color: "var(--t4)" }}>At least 1 renewal at critical risk</div>
            </div>
            {d.upcoming.map(r => <RenewalRow key={r.customerId} r={r} />)}
          </div>
        </div>
      </div>
    </div>
  );
}
