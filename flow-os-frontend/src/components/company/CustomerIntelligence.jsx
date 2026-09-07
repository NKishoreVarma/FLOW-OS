import { useState, useEffect, useRef } from "react";
import {
  Users, Search, Activity, DollarSign, RefreshCw, Mail, Phone,
  FileText, ShieldAlert, CheckSquare, ChevronRight, TrendingUp, AlertTriangle, User, Calendar, X, PlugZap
} from "lucide-react";
import DataSourceBadge from "../ui/DataSourceBadge";
import { useWebSocket } from "../../hooks/useWebSocket";
import { useWorkspaceState } from "../../hooks/useWorkspaceState";
import ActionCard from "../inbox/ActionCard";
import { buildCustomerCard } from "../../lib/actionBuilders";

const DEMO_ACCOUNTS = [
  {
    id: "acc-1", name: "Acme Corp", domain: "acme.com", industry: "Software & Technology",
    annualRevenue: 1200000, stage: "Customer", owner: "Sarah Chen", healthScore: 45,
    aiIntelligence: { healthScore: 45, churnRisk: "HIGH", expansionOpportunity: "MEDIUM", communicationSummary: "Acme is highly dissatisfied due to a recent Sev-1 latency spike (500ms) on their core API endpoints. Slack communications indicate repeated escalations by their Director of Engineering John Jones.", outstandingCommitments: ["Eng Leads to provide PostgreSQL rollback dry-run timeline (PROJ-824).", "Sarah Chen to schedules a follow-up latency post-mortem review."], suggestedNextActions: "Coordinate with James K. to deliver the latency remediation plan and dry-run checklist." },
    contacts: [{ id: "con-1", firstName: "John", lastName: "Jones", email: "john@acme.com", phone: "+1-555-0192", title: "Director of Engineering", lastContactedAt: "2 days ago" }],
    opportunities: [{ id: "opp-fake-1", name: "Acme Core Seat Renewal", stage: "Discovery", amount: 80000, probability: 50, aiIntelligence: { risks: ["High risk of churn due to latency SLA breach."], recommendation: "Resolve Postgres dry run successfully first." } }],
    activities: [{ id: "act-1", type: "meeting", subject: "Emergency Latency Post-Mortem", description: "Reviewed 500ms latency spike reported by Acme Corp. Promised rollback script review by Friday.", activityDate: "2 days ago" }]
  },
  {
    id: "acc-2", name: "Globex Corp", domain: "globex.com", industry: "Cybersecurity",
    annualRevenue: 4500000, stage: "Customer", owner: "Kishore Varma", healthScore: 92,
    aiIntelligence: { healthScore: 92, churnRisk: "LOW", expansionOpportunity: "HIGH", communicationSummary: "Excellent account health. Term sheet signed for Globex workspace expansion. Main contacts are highly engaged in SSO integration planning.", outstandingCommitments: ["Finance team to complete Stripe checkout webhook validation.", "Deliver finalized SSO multi-tenant security architecture spec."], suggestedNextActions: "Send Stripe payment links for the expanded seat counts." },
    contacts: [{ id: "con-2", firstName: "Alice", lastName: "Smith", email: "alice@globex.com", phone: "+1-555-0341", title: "CISO", lastContactedAt: "Yesterday" }],
    opportunities: [{ id: "opp-1", name: "Globex Enterprise Seat Expansion", stage: "Negotiation", amount: 140000, probability: 90, aiIntelligence: { risks: ["Stripe payment webhook verification pending."], recommendation: "Coordinate Stripe webhook setup immediately to finalize onboarding." } }],
    activities: [{ id: "act-3", type: "note", subject: "Globex Contract Signed Notes", description: "Closed expansion deal at $140k ARR. Staged setup in stripe dev account.", activityDate: "Yesterday" }]
  }
];

function healthStyle(score) {
  if (score >= 80) return { color: "var(--p-normal-text)", bg: "rgba(76,175,130,0.08)", border: "rgba(76,175,130,0.22)" };
  if (score >= 60) return { color: "var(--p-high-text)",    bg: "rgba(255,151,65,0.08)", border: "rgba(255,151,65,0.22)" };
  return               { color: "var(--p-critical-text)",   bg: "rgba(255,87,87,0.08)",  border: "rgba(255,87,87,0.22)"  };
}

const ACTIVITY_ICON_STYLE = { call: { color: "var(--p-normal)" }, email: { color: "var(--p-critical)" }, meeting: { color: "var(--p-info)" }, default: { color: "var(--t5)" } };

const MetricCard = ({ icon: Icon, iconBg, value, label }) => (
  <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-strong)", borderRadius: 4, padding: "14px 16px", display: "flex", alignItems: "center", gap: 14 }}>
    <div style={{ padding: 10, borderRadius: 8, background: iconBg, flexShrink: 0 }}>
      <Icon style={{ width: 20, height: 20 }} />
    </div>
    <div>
      <p style={{ fontSize: 18, fontWeight: 500, color: "var(--t1)", letterSpacing: "-0.5px" }}>{value}</p>
      <p style={{ fontSize: 9, fontWeight: 500, color: "var(--t5)", textTransform: "uppercase", letterSpacing: "0.10em" }}>{label}</p>
    </div>
  </div>
);

export const CustomerIntelligence = () => {
  const { token, workspaceId, isAuthLoading } = useWebSocket();
  const wsState = useWorkspaceState();
  const isDemoWorkspace = wsState.workspaceMode === 'demo';

  const [searchQuery, setSearchQuery] = useState("");
  const [accounts, setAccounts]       = useState([]);
  const [selectedAcc, setSelectedAcc] = useState(null);
  const [loading, setLoading]         = useState(true);
  const [isDemo, setIsDemo]           = useState(false);
  const [hRow, setHRow]               = useState(null);
  const [hRisk, setHRisk]             = useState(null);
  const [searchFocused, setSearchFocused] = useState(false);
  const fetchRef = useRef(null);

  useEffect(() => {
    if (isAuthLoading) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      if (token && workspaceId) {
        const headers = { Authorization: `Bearer ${token}`, "workspace-id": workspaceId };
        try {
          const res = await fetch("/api/crm/accounts", { headers });
          if (res.ok) {
            const data = await res.json();
            const accountsList = data.result || [];
            const enriched = await Promise.all(accountsList.map(async a => {
              const detailRes = await fetch(`/api/crm/accounts/${a.id}`, { headers });
              return detailRes.ok ? (await detailRes.json()).result || a : a;
            }));
            if (!cancelled) {
              if (enriched.length > 0) { setAccounts(enriched); setIsDemo(false); }
              else if (isDemoWorkspace) { setAccounts(DEMO_ACCOUNTS); setIsDemo(true); }
              else { setAccounts([]); setIsDemo(false); }
              setLoading(false);
            }
            return;
          }
        } catch {}
      }
      if (!cancelled) {
        if (isDemoWorkspace) { setAccounts(DEMO_ACCOUNTS); setIsDemo(true); }
        else { setAccounts([]); setIsDemo(false); }
        setLoading(false);
      }
    }
    fetchRef.current = load;
    load();
    return () => { cancelled = true; };
  }, [isAuthLoading, token, workspaceId]);

  const filteredAccounts  = accounts.filter(a => !searchQuery || a.name.toLowerCase().includes(searchQuery.toLowerCase()) || a.domain.toLowerCase().includes(searchQuery.toLowerCase()) || a.industry.toLowerCase().includes(searchQuery.toLowerCase()));
  const totalOppsValue    = accounts.reduce((sum, acc) => sum + (acc.opportunities?.reduce((s, o) => s + (o.amount || 0), 0) || 0), 0);
  const avgHealth         = Math.round(accounts.reduce((sum, acc) => sum + (acc.healthScore || 0), 0) / (accounts.length || 1));
  const highRiskAccounts  = accounts.filter(a => a.healthScore < 70 || a.aiIntelligence?.churnRisk === "HIGH");

  if (loading) {
    return (
      <div style={{ padding: "32px 24px" }}>
        {[80, 160, 280].map((h, i) => (
          <div key={i} style={{ height: h, borderRadius: 4, background: "var(--bg-card)", border: "1px solid var(--border)", marginBottom: 16, overflow: "hidden", position: "relative" }}>
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, transparent 0%, rgba(31,27,22,0.05) 50%, transparent 100%)", animation: "shimmer-sweep 1.6s ease-in-out infinite" }} />
          </div>
        ))}
      </div>
    );
  }

  const SectionLabel = ({ children }) => (
    <span style={{ fontSize: 9, fontWeight: 500, color: "var(--t5)", textTransform: "uppercase", letterSpacing: "0.10em" }}>{children}</span>
  );

  return (
    <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: 24 }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 500, color: "var(--t1)", letterSpacing: "-0.4px", display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <Users style={{ width: 22, height: 22, color: "var(--brand)" }} />
            Customer Intelligence
            <DataSourceBadge mode={isDemo ? "demo" : "live"} />
          </h1>
          <p style={{ fontSize: 12, color: "var(--t4)" }}>
            {isDemo ? "Showing sample data — connect HubSpot or Salesforce in Settings to go live." : "Live pipeline mapping, health auditing, and churn forecasting."}
          </p>
        </div>
        <button
          onClick={() => fetchRef.current?.()}
          style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--t4)", background: "transparent", border: "1px solid var(--border)", borderRadius: 4, padding: "6px 12px", cursor: "pointer" }}
        >
          <RefreshCw style={{ width: 12, height: 12 }} /> Refresh
        </button>
      </div>

      {/* Metric cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        <MetricCard icon={Users}      iconBg="rgba(232,103,43,0.10)" value={accounts.length}                   label="Total Accounts"     />
        <MetricCard icon={DollarSign} iconBg="rgba(76,175,130,0.10)"  value={`$${totalOppsValue.toLocaleString()}`} label="Open Deals Pipeline" />
        <MetricCard icon={Activity}   iconBg="rgba(96,165,250,0.10)"  value={`${avgHealth}%`}                  label="Avg Health Score"   />
        <MetricCard icon={ShieldAlert} iconBg="rgba(255,87,87,0.10)" value={highRiskAccounts.length}           label="High Risk Clients"  />
      </div>

      {/* Risk banner */}
      {highRiskAccounts.length > 0 && (
        <div style={{ background: "rgba(255,87,87,0.05)", border: "1px solid rgba(255,87,87,0.22)", borderRadius: 4, padding: "14px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--p-critical-text)", fontSize: 10, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
            <ShieldAlert style={{ width: 13, height: 13, animation: "pulse-dot 1.2s ease-in-out infinite" }} />
            High Risk Customer Alerts
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {highRiskAccounts.map(acc => (
              <div
                key={acc.id}
                onClick={() => setSelectedAcc(acc)}
                onMouseEnter={() => setHRisk(acc.id)}
                onMouseLeave={() => setHRisk(null)}
                style={{ background: hRisk === acc.id ? "var(--bg-hover)" : "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 4, padding: "10px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", transition: "all 100ms" }}
              >
                <div>
                  <h4 style={{ fontSize: 12, fontWeight: 500, color: "var(--t1)", marginBottom: 2 }}>{acc.name}</h4>
                  <p style={{ fontSize: 10, color: "var(--t4)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 240 }}>{acc.aiIntelligence?.communicationSummary}</p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, marginLeft: 12 }}>
                  <span style={{ fontSize: 9, fontWeight: 500, color: "var(--p-critical-text)" }}>HEALTH: {acc.healthScore}%</span>
                  <ChevronRight style={{ width: 13, height: 13, color: "var(--t5)" }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Accounts table */}
      <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-strong)", borderRadius: 4, overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h3 style={{ fontSize: 13, fontWeight: 500, color: "var(--t1)" }}>Workspace Customers</h3>
          <div style={{ position: "relative" }}>
            <Search style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", width: 12, height: 12, color: "var(--t5)" }} />
            <input
              type="text"
              placeholder="Filter by name, domain, industry..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              style={{ width: 240, background: "rgba(31,27,22,0.045)", border: `1px solid ${searchFocused ? "rgba(232,103,43,0.40)" : "var(--border-strong)"}`, borderRadius: 4, paddingLeft: 30, paddingRight: 10, paddingTop: 5, paddingBottom: 5, fontSize: 11, color: "var(--t1)", outline: "none", transition: "border-color 120ms" }}
            />
          </div>
        </div>

        {accounts.length === 0 && !loading ? (
          <div style={{ textAlign: "center", padding: "64px 24px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--bg-card)" }}>
            <PlugZap style={{ width: 28, height: 28, color: "var(--t5)", margin: "0 auto 12px" }} />
            <p style={{ fontSize: 14, fontWeight: 500, color: "var(--t2)", marginBottom: 6 }}>Connect HubSpot or Salesforce to see your customers</p>
            <p style={{ fontSize: 12, color: "var(--t4)", marginBottom: 16 }}>FLOW will map your pipeline, track health, and surface churn signals automatically.</p>
            <a href="/integrations" style={{ display: "inline-block", fontSize: 12, fontWeight: 500, color: "var(--brand)", background: "rgba(232,103,43,0.08)", padding: "7px 16px", borderRadius: 4, textDecoration: "none" }}>
              Connect CRM →
            </a>
          </div>
        ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "rgba(31,27,22,0.04)", borderBottom: "1px solid var(--border)" }}>
                {["Customer Name", "Domain", "Industry", "Annual Revenue", "Lifecycle Stage", "Account Owner", "Health"].map((h, i) => (
                  <th key={h} style={{ padding: "8px 14px", fontSize: 9, fontWeight: 500, color: "var(--t5)", textTransform: "uppercase", letterSpacing: "0.08em", textAlign: i === 6 ? "center" : "left" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredAccounts.map(acc => {
                const hs = healthStyle(acc.healthScore);
                return (
                  <tr
                    key={acc.id}
                    onClick={() => setSelectedAcc(acc)}
                    onMouseEnter={() => setHRow(acc.id)}
                    onMouseLeave={() => setHRow(null)}
                    style={{ borderBottom: "1px solid var(--border)", background: hRow === acc.id ? "rgba(31,27,22,0.04)" : "transparent", cursor: "pointer", transition: "background 80ms" }}
                  >
                    <td style={{ padding: "10px 14px", fontWeight: 500, color: "var(--t1)" }}>{acc.name}</td>
                    <td style={{ padding: "10px 14px", color: "var(--t4)" }}>{acc.domain}</td>
                    <td style={{ padding: "10px 14px", color: "var(--t3)" }}>{acc.industry}</td>
                    <td style={{ padding: "10px 14px", color: "var(--t3)" }}>${acc.annualRevenue?.toLocaleString()}</td>
                    <td style={{ padding: "10px 14px" }}>
                      <span style={{ fontSize: 9, fontWeight: 500, padding: "2px 7px", border: "1px solid var(--border)", borderRadius: 10, background: "rgba(31,27,22,0.045)", color: "var(--t4)" }}>{acc.stage}</span>
                    </td>
                    <td style={{ padding: "10px 14px", color: "var(--t3)" }}>{acc.owner || "Unassigned"}</td>
                    <td style={{ padding: "10px 14px", textAlign: "center" }}>
                      <span style={{ fontSize: 9, fontWeight: 500, padding: "2px 8px", borderRadius: 3, border: `1px solid ${hs.border}`, background: hs.bg, color: hs.color }}>{acc.healthScore}%</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        )}
      </div>

      {/* Account detail drawer */}
      {selectedAcc && (() => {
        const hs = healthStyle(selectedAcc.healthScore);
        return (
          <div style={{ position: "fixed", inset: 0, background: "rgba(31,27,22,0.35)", backdropFilter: "blur(6px)", display: "flex", justifyContent: "flex-end", zIndex: 50 }} onClick={() => setSelectedAcc(null)}>
            <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 640, background: "var(--bg-sidebar)", borderLeft: "1px solid var(--border-strong)", height: "100%", padding: "20px 24px", display: "flex", flexDirection: "column", boxShadow: "-12px 0 40px rgba(31,27,22,0.12)", overflowY: "auto", gap: 20 }}>

              {/* Header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", paddingBottom: 16, borderBottom: "1px solid var(--border)" }}>
                <div>
                  <span style={{ display: "block", fontSize: 10, color: "var(--t5)", marginBottom: 4 }}>{selectedAcc.domain}</span>
                  <h3 style={{ fontSize: 18, fontWeight: 500, color: "var(--t1)", letterSpacing: "-0.3px", marginBottom: 8 }}>{selectedAcc.name}</h3>
                  <div style={{ display: "flex", gap: 8 }}>
                    <span style={{ fontSize: 9, fontWeight: 500, padding: "2px 8px", borderRadius: 3, border: `1px solid ${hs.border}`, background: hs.bg, color: hs.color }}>Health Score: {selectedAcc.healthScore}%</span>
                    <span style={{ fontSize: 9, fontWeight: 500, padding: "2px 8px", borderRadius: 3, border: "1px solid var(--border)", background: "rgba(31,27,22,0.045)", color: "var(--t4)" }}>{selectedAcc.industry}</span>
                  </div>
                </div>
                <button onClick={() => setSelectedAcc(null)} style={{ padding: 6, background: "none", border: "none", color: "var(--t5)", cursor: "pointer" }}><X style={{ width: 16, height: 16 }} /></button>
              </div>

              {/* AI Intelligence */}
              <div style={{ border: "1px solid rgba(232,103,43,0.22)", background: "rgba(232,103,43,0.04)", borderRadius: 4, padding: "14px 16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, borderBottom: "1px solid rgba(232,103,43,0.12)", paddingBottom: 10, marginBottom: 14 }}>
                  <Activity style={{ width: 13, height: 13, color: "var(--brand)", animation: "pulse-dot 1.2s ease-in-out infinite" }} />
                  <span style={{ fontSize: 9, fontWeight: 500, color: "var(--brand-text)", textTransform: "uppercase", letterSpacing: "0.10em" }}>AI Customer Intelligence Analysis</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
                  {[
                    { label: "Churn Risk", value: selectedAcc.aiIntelligence?.churnRisk || "LOW", color: selectedAcc.aiIntelligence?.churnRisk === "HIGH" ? "var(--p-critical-text)" : "var(--p-normal-text)" },
                    { label: "Expansion Opportunity", value: selectedAcc.aiIntelligence?.expansionOpportunity || "LOW", color: "var(--brand-text)" },
                  ].map(({ label, value, color }) => (
                    <div key={label} style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 4, padding: "8px 10px" }}>
                      <span style={{ display: "block", fontSize: 8, fontWeight: 500, color: "var(--t5)", textTransform: "uppercase", letterSpacing: "0.10em", marginBottom: 4 }}>{label}</span>
                      <span style={{ fontSize: 12, fontWeight: 500, color }}>{value}</span>
                    </div>
                  ))}
                </div>
                <div style={{ marginBottom: 12 }}>
                  <SectionLabel>Communication Summary</SectionLabel>
                  <p style={{ fontSize: 12, color: "var(--t2)", lineHeight: 1.5, marginTop: 4, fontStyle: "italic" }}>"{selectedAcc.aiIntelligence?.communicationSummary}"</p>
                </div>
                {selectedAcc.aiIntelligence?.outstandingCommitments?.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 6 }}>
                      <CheckSquare style={{ width: 11, height: 11, color: "var(--p-high)" }} />
                      <SectionLabel>Outstanding Commitments</SectionLabel>
                    </div>
                    <ul style={{ listStyleType: "disc", paddingLeft: 16, margin: 0, display: "flex", flexDirection: "column", gap: 3 }}>
                      {selectedAcc.aiIntelligence.outstandingCommitments.map((c, i) => <li key={i} style={{ fontSize: 12, color: "var(--t3)" }}>{c}</li>)}
                    </ul>
                  </div>
                )}
                <div style={{ background: "rgba(232,103,43,0.08)", border: "1px solid rgba(232,103,43,0.22)", borderRadius: 4, padding: "8px 12px", marginBottom: 12 }}>
                  <span style={{ display: "block", fontSize: 8, fontWeight: 500, color: "var(--brand-text)", textTransform: "uppercase", letterSpacing: "0.10em", marginBottom: 4 }}>Suggested Next Action</span>
                  <span style={{ fontSize: 12, fontWeight: 500, color: "var(--t1)" }}>{selectedAcc.aiIntelligence?.suggestedNextActions}</span>
                </div>
                {selectedAcc.aiIntelligence?.suggestedNextActions && (
                  <ActionCard
                    card={buildCustomerCard({
                      account: selectedAcc,
                      suggestedAction: selectedAcc.aiIntelligence.suggestedNextActions,
                    })}
                  />
                )}
              </div>

              {/* Opportunities */}
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                  <TrendingUp style={{ width: 13, height: 13, color: "var(--t5)" }} />
                  <SectionLabel>Pipeline Deals / Opportunities</SectionLabel>
                </div>
                {!selectedAcc.opportunities?.length ? (
                  <p style={{ fontSize: 12, color: "var(--t5)" }}>No open opportunities for this account.</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {selectedAcc.opportunities?.map(opp => (
                      <div key={opp.id} style={{ background: "rgba(31,27,22,0.04)", border: "1px solid var(--border)", borderRadius: 4, padding: "10px 12px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                          <span style={{ fontSize: 12, fontWeight: 500, color: "var(--t1)" }}>{opp.name}</span>
                          <span style={{ fontSize: 13, fontWeight: 500, color: "var(--p-normal-text)" }}>${opp.amount?.toLocaleString()}</span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--t4)" }}>
                          <span>Stage: <strong style={{ color: "var(--t2)" }}>{opp.stage}</strong> ({opp.probability}% close prob)</span>
                          {opp.aiIntelligence?.risks?.length > 0 && (
                            <span style={{ color: "var(--p-critical-text)", fontWeight: 500, display: "flex", alignItems: "center", gap: 4 }}>
                              <AlertTriangle style={{ width: 11, height: 11 }} /> Deal Risk
                            </span>
                          )}
                        </div>
                        {opp.aiIntelligence?.risks?.[0] && (
                          <p style={{ fontSize: 10, background: "rgba(255,87,87,0.05)", padding: "5px 8px", borderRadius: 3, border: "1px solid rgba(255,87,87,0.12)", color: "var(--t3)", marginTop: 6 }}>
                            <strong>Deal Risk:</strong> {opp.aiIntelligence.risks[0]}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Activities */}
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                  <FileText style={{ width: 13, height: 13, color: "var(--t5)" }} />
                  <SectionLabel>Client Activity History</SectionLabel>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {selectedAcc.activities?.map(act => {
                    const iconColor = (ACTIVITY_ICON_STYLE[act.type] || ACTIVITY_ICON_STYLE.default).color;
                    return (
                      <div key={act.id} style={{ background: "rgba(31,27,22,0.04)", border: "1px solid var(--border)", borderRadius: 4, padding: "10px 12px", display: "flex", gap: 10, alignItems: "flex-start" }}>
                        <div style={{ padding: 7, background: "rgba(31,27,22,0.05)", border: "1px solid var(--border)", borderRadius: 4, flexShrink: 0 }}>
                          <FileText style={{ width: 12, height: 12, color: iconColor }} />
                        </div>
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 2 }}>
                            <span style={{ fontSize: 12, fontWeight: 500, color: "var(--t1)", textTransform: "capitalize" }}>{act.type}: {act.subject}</span>
                            <span style={{ fontSize: 9, color: "var(--t5)" }}>{act.activityDate}</span>
                          </div>
                          <p style={{ fontSize: 11, color: "var(--t4)", lineHeight: 1.4 }}>{act.description}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Contacts */}
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                  <User style={{ width: 13, height: 13, color: "var(--t5)" }} />
                  <SectionLabel>Contacts</SectionLabel>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {selectedAcc.contacts?.map(con => (
                    <div key={con.id} style={{ background: "rgba(31,27,22,0.04)", border: "1px solid var(--border)", borderRadius: 4, padding: "10px 12px", display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(232,103,43,0.10)", border: "1px solid rgba(232,103,43,0.22)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--brand-text)", fontSize: 11, fontWeight: 500, flexShrink: 0 }}>
                        {con.firstName[0]}{con.lastName[0]}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <span style={{ display: "block", fontSize: 12, fontWeight: 500, color: "var(--t1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{con.firstName} {con.lastName}</span>
                        <span style={{ display: "block", fontSize: 10, color: "var(--t4)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{con.title}</span>
                        <span style={{ display: "block", fontSize: 9, color: "var(--t5)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{con.email}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Footer */}
              <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14, display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--t5)" }}>
                <span>Account Owner: {selectedAcc.owner}</span>
                <span>Last updated: {selectedAcc.updatedAt ? new Date(selectedAcc.updatedAt).toLocaleDateString() : "—"}</span>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export default CustomerIntelligence;
