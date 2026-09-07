import { useState, useEffect } from "react";
import {
  Users, TrendingUp, MessageSquare, BarChart2, Star,
  RefreshCw, Plus, ExternalLink, CheckCircle, Clock,
  AlertTriangle, Activity, Target, Map, Zap,
} from "lucide-react";

function authHeaders() {
  return {
    Authorization: `Bearer ${localStorage.getItem("flow_os_token") || ""}`,
    "workspace-id": localStorage.getItem("flow_os_workspace_id") || "",
    "Content-Type": "application/json",
  };
}
async function getJSON(path) {
  const r = await fetch(path, { headers: authHeaders() });
  if (!r.ok) throw new Error(r.status);
  return r.json();
}
async function postJSON(path, body) {
  const r = await fetch(path, { method: "POST", headers: authHeaders(), body: JSON.stringify(body) });
  if (!r.ok) throw new Error(r.status);
  return r.json();
}

const T = (s) => ({ fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--t4)", marginBottom: 10, display: "block" });
const card = { background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 10, padding: "20px 22px" };

const STATUS_COLOR = {
  "pre-pilot":  { text: "var(--t3)",   bg: "rgba(0,0,0,0.04)" },
  onboarding:   { text: "#6366f1",     bg: "rgba(99,102,241,0.08)" },
  pilot:        { text: "var(--warn)", bg: "var(--warn-bg)" },
  converting:   { text: "#f59e0b",     bg: "rgba(245,158,11,0.08)" },
  converted:    { text: "var(--ok)",   bg: "var(--ok-bg)" },
  churned:      { text: "var(--crit)", bg: "var(--crit-bg)" },
};

const DEMO_PORTFOLIO = {
  total: 7, byStatus: { "pre-pilot": 1, onboarding: 1, pilot: 3, converting: 1, converted: 1 },
  avgHealth: 74, totalMrrUsd: 8400,
};

const DEMO_PARTNERS = [
  { id: "1", company_name: "Acme Corp", industry: "FinTech", status: "pilot", health_score: 42, mrr_usd: 0, contact_name: "James Liu", deployment_timeline: "Q3 2026" },
  { id: "2", company_name: "Pinnacle Logistics", industry: "Manufacturing", status: "pilot", health_score: 71, mrr_usd: 0, contact_name: "Sarah Kim", deployment_timeline: "Q3 2026" },
  { id: "3", company_name: "CloudNine Retail", industry: "Retail", status: "pilot", health_score: 88, mrr_usd: 0, contact_name: "Marco Rossi", deployment_timeline: "Q3 2026" },
  { id: "4", company_name: "MedCore Systems", industry: "Healthcare", status: "converting", health_score: 92, mrr_usd: 2800, contact_name: "Dr. Priya Nair", deployment_timeline: "Q3 2026" },
  { id: "5", company_name: "Apex Software", industry: "SaaS", status: "converted", health_score: 95, mrr_usd: 5600, contact_name: "Tom Brennan", deployment_timeline: "Deployed" },
  { id: "6", company_name: "Vertex Agency", industry: "IT Services", status: "onboarding", health_score: 65, mrr_usd: 0, contact_name: "Lisa Park", deployment_timeline: "Q4 2026" },
  { id: "7", company_name: "NordTech AS", industry: "Software Agency", status: "pre-pilot", health_score: 80, mrr_usd: 0, contact_name: "Erik Hansen", deployment_timeline: "Q4 2026" },
];

const DEMO_ROI = {
  headline: { timeSavedHours: 47.2, estimatedCostSavingUsd: 7080, tasksCompleted: 89, contextSwitchesPrevented: 312 },
  detail: { emailsDrafted: 23, mergeConflictsResolved: 8, meetingsPrepared: 14, jiraIssuesCreated: 31 },
};

const DEMO_FEEDBACK = {
  byType: { bug: 3, feature_request: 12, conversation_rating: 28, general: 7 },
  byPriority: { critical: 1, high: 4, medium: 10, low: 15 },
  byStatus: { open: 18, triaged: 6, in_progress: 3, resolved: 3 },
  avgRating: 4.2,
};

const DEMO_ANALYTICS = {
  dau: [{ day: "Mon", users: 3 }, { day: "Tue", users: 5 }, { day: "Wed", users: 7 },
        { day: "Thu", users: 6 }, { day: "Fri", users: 8 }, { day: "Sat", users: 2 }, { day: "Sun", users: 1 }],
  featureEngagement: [
    { route: "/", count: 142 }, { route: "/chief", count: 89 }, { route: "/engineering", count: 67 },
    { route: "/inbox", count: 61 }, { route: "/dashboard", count: 53 }, { route: "/support", count: 38 },
  ],
};

const TABS = ["Partners", "Analytics", "ROI Reports", "Feedback", "Roadmap"];

export default function LaunchPortal() {
  const [tab, setTab] = useState("Partners");
  const [portfolio, setPortfolio] = useState(DEMO_PORTFOLIO);
  const [partners, setPartners] = useState(DEMO_PARTNERS);
  const [roi, setRoi] = useState(DEMO_ROI);
  const [feedback, setFeedback] = useState(DEMO_FEEDBACK);
  const [analytics, setAnalytics] = useState(DEMO_ANALYTICS);
  const [demo, setDemo] = useState(true);
  const [loading, setLoading] = useState(false);
  const [showAddPartner, setShowAddPartner] = useState(false);
  const [newPartner, setNewPartner] = useState({ companyName: "", industry: "SaaS", contactName: "", contactEmail: "" });

  const load = async () => {
    setLoading(true);
    try {
      const [port, parts, roiData, fbData, analData] = await Promise.allSettled([
        getJSON("/api/partners/portfolio"),
        getJSON("/api/partners"),
        getJSON("/api/roi/monthly"),
        getJSON("/api/analytics/summary?days=30"),
        getJSON("/api/analytics/digest"),
      ]);
      if (port.status === "fulfilled") { setPortfolio(port.value); setDemo(false); }
      if (parts.status === "fulfilled" && parts.value.partners?.length) setPartners(parts.value.partners);
      if (roiData.status === "fulfilled") setRoi(roiData.value);
      if (fbData.status === "fulfilled") setFeedback(fbData.value);
      if (analData.status === "fulfilled") setAnalytics(analData.value);
    } catch { /* keep demo */ }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const addPartner = async () => {
    if (!newPartner.companyName) return;
    try {
      const p = await postJSON("/api/partners", newPartner);
      setPartners(prev => [p, ...prev]);
      setShowAddPartner(false);
      setNewPartner({ companyName: "", industry: "SaaS", contactName: "", contactEmail: "" });
    } catch { alert("Could not add partner — check server connection"); }
  };

  const maxDau = Math.max(1, ...(analytics.dau || []).map(d => d.users));

  return (
    <div style={{ padding: "28px 28px 60px", maxWidth: 1200, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <Zap style={{ width: 20, height: 20, color: "var(--brand)" }} strokeWidth={1.5} />
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 500, color: "var(--t1)" }}>FLOW OS v1.0 Launch Portal</h1>
            {demo && (
              <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: "var(--warn-bg)", color: "var(--warn)", border: "1px solid rgba(0,0,0,0.06)" }}>
                Demo data
              </span>
            )}
          </div>
          <p style={{ margin: 0, fontSize: 13, color: "var(--t3)" }}>Design partner tracking · Customer success · ROI · Feedback · Roadmap</p>
        </div>
        <button onClick={load} disabled={loading} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 8, border: "1px solid var(--border)", background: "transparent", color: "var(--t3)", fontSize: 12, cursor: loading ? "not-allowed" : "pointer" }}>
          <RefreshCw style={{ width: 13, height: 13, animation: loading ? "spin 1s linear infinite" : "none" }} />
          Refresh
        </button>
      </div>

      {/* Portfolio KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 24 }}>
        {[
          { label: "Design Partners", value: portfolio.total, icon: Users, color: "var(--brand)" },
          { label: "In Pilot", value: portfolio.byStatus?.pilot ?? 0, icon: Activity, color: "var(--warn)" },
          { label: "Converted", value: portfolio.byStatus?.converted ?? 0, icon: CheckCircle, color: "var(--ok)" },
          { label: "MRR", value: `$${((portfolio.totalMrrUsd ?? 0) / 1000).toFixed(1)}k`, icon: TrendingUp, color: "var(--ok)" },
        ].map(kpi => {
          const Icon = kpi.icon;
          return (
            <div key={kpi.label} style={card}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <Icon style={{ width: 14, height: 14, color: kpi.color }} strokeWidth={1.5} />
                <span style={{ fontSize: 11, color: "var(--t4)", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em" }}>{kpi.label}</span>
              </div>
              <div style={{ fontSize: 28, fontWeight: 500, color: "var(--t1)", fontFamily: "var(--font-data)" }}>{kpi.value}</div>
            </div>
          );
        })}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 2, marginBottom: 20, borderBottom: "1px solid var(--border)" }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: "8px 16px", background: "none", border: "none",
            borderBottom: tab === t ? "2px solid var(--brand)" : "2px solid transparent",
            color: tab === t ? "var(--t1)" : "var(--t3)",
            fontSize: 13, fontWeight: tab === t ? 500 : 400, cursor: "pointer",
            marginBottom: -1, transition: "color 80ms",
          }}>{t}</button>
        ))}
      </div>

      {/* ── Partners Tab ── */}
      {tab === "Partners" && (
        <div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
            <button onClick={() => setShowAddPartner(true)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 8, background: "var(--brand)", color: "#fff", border: "none", fontSize: 12, fontWeight: 500, cursor: "pointer" }}>
              <Plus style={{ width: 13, height: 13 }} /> Add Partner
            </button>
          </div>

          {showAddPartner && (
            <div style={{ ...card, marginBottom: 16, background: "var(--surface-2)" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
                {[
                  { key: "companyName", label: "Company name *" },
                  { key: "industry", label: "Industry" },
                  { key: "contactName", label: "Contact name" },
                  { key: "contactEmail", label: "Contact email" },
                ].map(f => (
                  <div key={f.key}>
                    <label style={{ fontSize: 11, color: "var(--t4)", display: "block", marginBottom: 4 }}>{f.label}</label>
                    <input
                      value={newPartner[f.key]}
                      onChange={e => setNewPartner(p => ({ ...p, [f.key]: e.target.value }))}
                      style={{ width: "100%", padding: "6px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg-card)", color: "var(--t1)", fontSize: 13, boxSizing: "border-box" }}
                    />
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={addPartner} style={{ padding: "6px 14px", borderRadius: 6, background: "var(--brand)", color: "#fff", border: "none", fontSize: 12, cursor: "pointer" }}>Add</button>
                <button onClick={() => setShowAddPartner(false)} style={{ padding: "6px 14px", borderRadius: 6, background: "transparent", color: "var(--t3)", border: "1px solid var(--border)", fontSize: 12, cursor: "pointer" }}>Cancel</button>
              </div>
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {partners.map(p => {
              const sc = STATUS_COLOR[p.status] ?? STATUS_COLOR["pre-pilot"];
              const health = p.health_score ?? 0;
              const healthColor = health >= 80 ? "var(--ok)" : health >= 60 ? "var(--warn)" : "var(--crit)";
              return (
                <div key={p.id} style={{ ...card, display: "flex", alignItems: "center", gap: 16 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 8, background: "var(--surface-2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <span style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 500, color: "var(--t2)" }}>
                      {p.company_name.charAt(0)}
                    </span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 14, fontWeight: 500, color: "var(--t1)" }}>{p.company_name}</span>
                      <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 10, background: sc.bg, color: sc.text, fontWeight: 500 }}>
                        {p.status.replace("-", " ")}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--t3)", marginTop: 2 }}>
                      {p.industry} · {p.contact_name ?? "—"} · {p.deployment_timeline ?? "TBD"}
                    </div>
                  </div>
                  <div style={{ textAlign: "center", width: 80 }}>
                    <div style={{ fontSize: 18, fontWeight: 500, color: healthColor, fontFamily: "var(--font-data)" }}>{health}</div>
                    <div style={{ fontSize: 10, color: "var(--t4)" }}>Health</div>
                  </div>
                  {p.mrr_usd > 0 && (
                    <div style={{ textAlign: "center", width: 80 }}>
                      <div style={{ fontSize: 16, fontWeight: 500, color: "var(--ok)", fontFamily: "var(--font-data)" }}>${p.mrr_usd.toLocaleString()}</div>
                      <div style={{ fontSize: 10, color: "var(--t4)" }}>MRR</div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Analytics Tab ── */}
      {tab === "Analytics" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div style={card}>
            <span style={T()}>Daily Active Users (last 7 days)</span>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 80 }}>
              {(analytics.dau || []).map((d, i) => (
                <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                  <div style={{ width: "100%", background: "var(--brand)", borderRadius: 3, height: Math.max(4, ((d.users ?? d.count ?? 0) / maxDau) * 64), opacity: 0.8 }} />
                  <span style={{ fontSize: 9, color: "var(--t4)" }}>{d.day?.toString().slice(0, 3) ?? d.day}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={card}>
            <span style={T()}>Top Pages</span>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {(analytics.featureEngagement || []).slice(0, 6).map((f, i) => {
                const maxCount = Math.max(1, ...(analytics.featureEngagement || []).map(x => x.count));
                return (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 11, color: "var(--t3)", width: 110, fontFamily: "var(--font-data)" }}>{f.route}</span>
                    <div style={{ flex: 1, height: 6, borderRadius: 3, background: "var(--surface-2)", overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${(f.count / maxCount) * 100}%`, background: "var(--brand)", borderRadius: 3 }} />
                    </div>
                    <span style={{ fontSize: 11, color: "var(--t2)", fontFamily: "var(--font-data)", width: 28, textAlign: "right" }}>{f.count}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── ROI Reports Tab ── */}
      {tab === "ROI Reports" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
            {[
              { label: "Time Saved", value: `${roi.headline?.timeSavedHours ?? 0}h`, sub: "this month" },
              { label: "Cost Saving", value: `$${((roi.headline?.estimatedCostSavingUsd ?? 0) / 1000).toFixed(1)}k`, sub: "estimated" },
              { label: "Tasks Done", value: roi.headline?.tasksCompleted ?? 0, sub: "in FLOW" },
              { label: "Context Switches", value: roi.headline?.contextSwitchesPrevented ?? 0, sub: "prevented" },
            ].map(m => (
              <div key={m.label} style={card}>
                <div style={{ fontSize: 11, color: "var(--t4)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>{m.label}</div>
                <div style={{ fontSize: 26, fontWeight: 500, color: "var(--t1)", fontFamily: "var(--font-data)" }}>{m.value}</div>
                <div style={{ fontSize: 11, color: "var(--t3)", marginTop: 2 }}>{m.sub}</div>
              </div>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div style={card}>
              <span style={T()}>What drove this ROI</span>
              {Object.entries(roi.detail ?? {}).map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: "1px solid var(--border)" }}>
                  <span style={{ fontSize: 13, color: "var(--t2)" }}>{k.replace(/([A-Z])/g, " $1").replace(/^./, s => s.toUpperCase())}</span>
                  <span style={{ fontSize: 13, fontWeight: 500, color: "var(--t1)", fontFamily: "var(--font-data)" }}>{v}</span>
                </div>
              ))}
            </div>

            <div style={card}>
              <span style={T()}>Generate Report</span>
              {[
                { label: "Monthly Report", path: "/api/roi/monthly", period: "This month" },
                { label: "Quarterly Report", path: "/api/roi/quarterly", period: "This quarter" },
                { label: "Executive Annual Report", path: "/api/roi/executive", period: "Last 12 months" },
              ].map(r => (
                <div key={r.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: "var(--t1)" }}>{r.label}</div>
                    <div style={{ fontSize: 11, color: "var(--t3)" }}>{r.period}</div>
                  </div>
                  <a href={r.path} target="_blank" rel="noreferrer"
                    style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--brand)", textDecoration: "none" }}>
                    <ExternalLink style={{ width: 12, height: 12 }} /> Generate
                  </a>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Feedback Tab ── */}
      {tab === "Feedback" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
          <div style={card}>
            <span style={T()}>By Type</span>
            {Object.entries(feedback.byType ?? {}).sort((a, b) => b[1] - a[1]).map(([type, n]) => (
              <div key={type} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
                <span style={{ fontSize: 13, color: "var(--t2)", textTransform: "capitalize" }}>{type.replace(/_/g, " ")}</span>
                <span style={{ fontSize: 13, fontWeight: 500, fontFamily: "var(--font-data)", color: "var(--t1)" }}>{n}</span>
              </div>
            ))}
          </div>

          <div style={card}>
            <span style={T()}>By Priority</span>
            {[["critical","var(--crit)"],["high","var(--warn)"],["medium","var(--t2)"],["low","var(--t3)"]].map(([pri, color]) => (
              <div key={pri} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: color }} />
                  <span style={{ fontSize: 13, color: "var(--t2)", textTransform: "capitalize" }}>{pri}</span>
                </div>
                <span style={{ fontSize: 13, fontWeight: 500, fontFamily: "var(--font-data)", color }}>{feedback.byPriority?.[pri] ?? 0}</span>
              </div>
            ))}
            {feedback.avgRating && (
              <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 6 }}>
                <Star style={{ width: 13, height: 13, color: "#f59e0b" }} />
                <span style={{ fontSize: 14, fontWeight: 500, color: "var(--t1)", fontFamily: "var(--font-data)" }}>
                  {feedback.avgRating.toFixed(1)} / 5
                </span>
                <span style={{ fontSize: 11, color: "var(--t4)" }}>avg rating</span>
              </div>
            )}
          </div>

          <div style={card}>
            <span style={T()}>By Status</span>
            {[["open","var(--warn)"],["triaged","var(--brand)"],["in_progress","#6366f1"],["resolved","var(--ok)"]].map(([st, color]) => (
              <div key={st} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
                <span style={{ fontSize: 13, color: "var(--t2)", textTransform: "capitalize" }}>{st.replace(/_/g, " ")}</span>
                <span style={{ fontSize: 13, fontWeight: 500, fontFamily: "var(--font-data)", color }}>{feedback.byStatus?.[st] ?? 0}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Roadmap Tab ── */}
      {tab === "Roadmap" && <RoadmapView />}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function RoadmapView() {
  const ROADMAP = {
    "v1.1 — Q3 2026": [
      { priority: "critical", title: "Slack DM connector", type: "connector", votes: 12, impact: "high" },
      { priority: "high", title: "Multi-workspace switching", type: "product", votes: 9, impact: "high" },
      { priority: "high", title: "Mobile web optimization", type: "product", votes: 8, impact: "medium" },
      { priority: "high", title: "Outlook / Exchange connector", type: "connector", votes: 7, impact: "high" },
      { priority: "medium", title: "Conversation history export", type: "product", votes: 5, impact: "medium" },
    ],
    "v1.2 — Q4 2026": [
      { priority: "medium", title: "Linear connector", type: "connector", votes: 6, impact: "medium" },
      { priority: "medium", title: "Salesforce CRM connector", type: "connector", votes: 5, impact: "high" },
      { priority: "medium", title: "Dark mode", type: "product", votes: 11, impact: "low" },
      { priority: "medium", title: "Webhook-based custom triggers", type: "platform", votes: 4, impact: "medium" },
    ],
    "Enterprise Roadmap": [
      { priority: "high", title: "SSO / SAML 2.0", type: "security", votes: 8, impact: "high" },
      { priority: "high", title: "SOC 2 Type II certification", type: "compliance", votes: 6, impact: "high" },
      { priority: "medium", title: "On-premise deployment", type: "platform", votes: 4, impact: "high" },
      { priority: "medium", title: "Custom AI model integration", type: "ai", votes: 3, impact: "medium" },
    ],
  };

  const TYPE_COLOR = { connector: "var(--brand)", product: "#6366f1", platform: "#f59e0b", security: "var(--crit)", compliance: "var(--warn)", ai: "#8b5cf6" };
  const PRI_COLOR = { critical: "var(--crit)", high: "var(--warn)", medium: "var(--t3)" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {Object.entries(ROADMAP).map(([version, items]) => (
        <div key={version}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <Map style={{ width: 14, height: 14, color: "var(--brand)" }} strokeWidth={1.5} />
            <span style={{ fontSize: 13, fontWeight: 500, color: "var(--t1)" }}>{version}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {items.map((item, i) => (
              <div key={i} style={{ ...card, display: "flex", alignItems: "center", gap: 12, padding: "12px 16px" }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: PRI_COLOR[item.priority], flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 13, color: "var(--t1)" }}>{item.title}</span>
                <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 10, background: `${TYPE_COLOR[item.type] ?? "var(--t4)"}18`, color: TYPE_COLOR[item.type] ?? "var(--t4)", fontWeight: 500 }}>
                  {item.type}
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: 4, color: "var(--t3)", fontSize: 11 }}>
                  <Target style={{ width: 11, height: 11 }} />
                  <span>{item.votes} votes</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
