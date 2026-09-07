import { useState, useEffect, useRef } from "react";
import {
  Users, Search, Activity, RefreshCw, Briefcase, Clock,
  ShieldAlert, ChevronRight, TrendingUp, Calendar, Award, GitPullRequest, X, PlugZap
} from "lucide-react";
import DataSourceBadge from "../ui/DataSourceBadge";
import { useWebSocket } from "../../hooks/useWebSocket";
import { useWorkspaceState } from "../../hooks/useWorkspaceState";

const DEMO_EMPLOYEES = [
  {
    id: "emp-1", name: "James K.", email: "james@flow.os", role: "Chief Technology Officer (CTO)", department: "Engineering & Product", status: "Active", managerId: null,
    skills: ["Architecture Strategy", "Team Scaling", "Budgeting", "Executive Leadership"], timezone: "US/Pacific",
    availability: { status: "Available", timeoff: [] },
    workload: { activeProjects: ["FLOW Rewrite", "Postgres Migration"], jiraTasksCount: 0, meetingLoadHrs: 18, contextSwitchScore: 35 },
    aiIntelligence: { burnoutRisk: "LOW", contextSwitchScore: 35, collaborationScore: 78, reviewBottlenecks: "None", knowledgeConcentrationRisk: "HIGH (only node that understands system cost scaling models)", suggestedDelegates: ["Kishore Varma (Lead Eng)"], suggestedReviewers: [], recommendedMeetings: ["Weekly Board Sync", "Q3 Architecture Alignment"] }
  },
  {
    id: "emp-2", name: "Kishore Varma", email: "kishore@flow.os", role: "Lead Engineering Architect", department: "Engineering", status: "Active", managerId: "emp-1",
    skills: ["React", "NodeJS", "PostgreSQL", "pgvector", "RAG pipelines", "BullMQ"], timezone: "Asia/Kolkata",
    availability: { status: "Available", timeoff: [] },
    workload: { activeProjects: ["FLOW Rewrite", "Postgres Migration"], jiraTasksCount: 2, meetingLoadHrs: 8, contextSwitchScore: 85 },
    aiIntelligence: { burnoutRisk: "LOW", contextSwitchScore: 85, collaborationScore: 94, reviewBottlenecks: "Medium (waiting on 3 pricing tier PR approvals)", knowledgeConcentrationRisk: "MEDIUM (primary owner of pgvector search orchestrator)", suggestedDelegates: ["Alex R. (Infra Eng)"], suggestedReviewers: ["Alex R. (Redis details)", "David O. (IAM security roles)"], recommendedMeetings: ["Postgres Migration Standup"] }
  },
  {
    id: "emp-3", name: "Sarah Chen", email: "sarah@flow.os", role: "Principal Product Manager", department: "Product", status: "Active", managerId: "emp-1",
    skills: ["Product Strategy", "Agile Roadmapping", "Stripe Checkout", "Customer Discovery"], timezone: "US/Pacific",
    availability: { status: "Available", timeoff: [] },
    workload: { activeProjects: ["FLOW Rewrite", "Enterprise Pricing"], jiraTasksCount: 4, meetingLoadHrs: 24, contextSwitchScore: 95 },
    aiIntelligence: { burnoutRisk: "HIGH", contextSwitchScore: 95, collaborationScore: 82, reviewBottlenecks: "HIGH (stuck in meetings, causing decision block on 4 linear/jira roadmap items)", knowledgeConcentrationRisk: "HIGH (sole owner of Stripe onboarding flows)", suggestedDelegates: ["Kishore Varma (Technical product specs)"], suggestedReviewers: [], recommendedMeetings: ["Stripe billing review (reduce meetings by 4 hrs)"] }
  },
  {
    id: "emp-4", name: "David O.", email: "david@flow.os", role: "Senior Platform Security Engineer", department: "Security", status: "Active", managerId: "emp-1",
    skills: ["AWS KMS", "IAM Policies", "SOC2 Compliance", "PenTesting", "Postgres Security"], timezone: "Europe/London",
    availability: { status: "Available", timeoff: [] },
    workload: { activeProjects: ["Postgres Migration"], jiraTasksCount: 1, meetingLoadHrs: 6, contextSwitchScore: 40 },
    aiIntelligence: { burnoutRisk: "LOW", contextSwitchScore: 40, collaborationScore: 88, reviewBottlenecks: "None", knowledgeConcentrationRisk: "CRITICAL (only security engineer certified to rotation KMS secrets)", suggestedDelegates: ["Alex R."], suggestedReviewers: ["Kishore Varma"], recommendedMeetings: ["KMS Security Architecture Review"] }
  },
  {
    id: "emp-5", name: "Alex R.", email: "alex@flow.os", role: "Senior Platform Engineer", department: "Engineering", status: "On Leave (PTO)", managerId: "emp-1",
    skills: ["Redis Cluster", "BullMQ", "Docker", "AWS ECS", "Kubernetes"], timezone: "Europe/Paris",
    availability: { status: "On Leave (PTO)", timeoff: [{ type: "PTO", start: "2026-06-29", end: "2026-07-03" }] },
    workload: { activeProjects: ["Redis Migration"], jiraTasksCount: 1, meetingLoadHrs: 12, contextSwitchScore: 60 },
    aiIntelligence: { burnoutRisk: "LOW", contextSwitchScore: 60, collaborationScore: 90, reviewBottlenecks: "None", knowledgeConcentrationRisk: "HIGH (owns BullMQ worker scheduler scaling configurations)", suggestedDelegates: ["Kishore Varma"], suggestedReviewers: ["Kishore Varma"], recommendedMeetings: ["Weekly platform standup"] }
  }
];

function burnoutStyle(risk) {
  switch (risk) {
    case "HIGH":   return { color: "var(--p-critical-text)", bg: "rgba(255,87,87,0.08)",  border: "rgba(255,87,87,0.22)"  };
    case "MEDIUM": return { color: "var(--p-high-text)",    bg: "rgba(255,151,65,0.08)", border: "rgba(255,151,65,0.22)" };
    default:       return { color: "var(--p-normal-text)",  bg: "rgba(76,175,130,0.08)", border: "rgba(76,175,130,0.22)" };
  }
}

function switchColor(score) {
  if (score >= 80) return "var(--p-critical-text)";
  if (score >= 50) return "var(--p-high-text)";
  return "var(--p-normal-text)";
}

const MetricCard = ({ icon: Icon, iconBg, iconColor, value, label }) => (
  <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-strong)", borderRadius: 4, padding: "14px 16px", display: "flex", alignItems: "center", gap: 14 }}>
    <div style={{ padding: 10, borderRadius: 8, background: iconBg, flexShrink: 0 }}>
      <Icon style={{ width: 20, height: 20, color: iconColor }} />
    </div>
    <div>
      <p style={{ fontSize: 18, fontWeight: 500, color: "var(--t1)", letterSpacing: "-0.5px" }}>{value}</p>
      <p style={{ fontSize: 9, fontWeight: 500, color: "var(--t5)", textTransform: "uppercase", letterSpacing: "0.10em" }}>{label}</p>
    </div>
  </div>
);

const SectionLabel = ({ children, icon: Icon }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
    {Icon && <Icon style={{ width: 13, height: 13, color: "var(--t5)" }} />}
    <span style={{ fontSize: 9, fontWeight: 500, color: "var(--t5)", textTransform: "uppercase", letterSpacing: "0.10em" }}>{children}</span>
  </div>
);

export const WorkforceIntelligence = () => {
  const { token, workspaceId, isAuthLoading } = useWebSocket();
  const wsState = useWorkspaceState();
  const isDemoWorkspace = wsState.workspaceMode === 'demo';

  const [searchQuery, setSearchQuery] = useState("");
  const [employees, setEmployees]     = useState([]);
  const [selectedEmp, setSelectedEmp] = useState(null);
  const [loading, setLoading]         = useState(true);
  const [isDemo, setIsDemo]           = useState(false);
  const [hRow, setHRow]               = useState(null);
  const [hAlert, setHAlert]           = useState(null);
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
          const res = await fetch("/api/hr/employees", { headers });
          if (res.ok) {
            const data = await res.json();
            const employeeList = data.result || [];
            const enriched = await Promise.all(employeeList.map(async e => {
              const detailRes = await fetch(`/api/hr/employees/${e.id}`, { headers });
              return detailRes.ok ? (await detailRes.json()).result || e : e;
            }));
            if (!cancelled) {
              if (enriched.length > 0) { setEmployees(enriched); setIsDemo(false); }
              else if (isDemoWorkspace) { setEmployees(DEMO_EMPLOYEES); setIsDemo(true); }
              else { setEmployees([]); setIsDemo(false); }
              setLoading(false);
            }
            return;
          }
        } catch {}
      }
      if (!cancelled) {
        if (isDemoWorkspace) { setEmployees(DEMO_EMPLOYEES); setIsDemo(true); }
        else { setEmployees([]); setIsDemo(false); }
        setLoading(false);
      }
    }
    fetchRef.current = load;
    load();
    return () => { cancelled = true; };
  }, [isAuthLoading, token, workspaceId]);

  const filteredEmployees = employees.filter(e => !searchQuery || e.name.toLowerCase().includes(searchQuery.toLowerCase()) || e.role.toLowerCase().includes(searchQuery.toLowerCase()) || e.department.toLowerCase().includes(searchQuery.toLowerCase()));
  const avgSwitchScore    = Math.round(employees.reduce((sum, e) => sum + (e.workload?.contextSwitchScore || 0), 0) / (employees.length || 1));
  const burnoutAlerts     = employees.filter(e => e.aiIntelligence?.burnoutRisk === "HIGH");
  const onLeaveCount      = employees.filter(e => e.status.includes("Leave") || e.status.includes("PTO")).length;

  if (loading) {
    return (
      <div style={{ padding: "32px 24px" }}>
        {[80, 160, 240].map((h, i) => (
          <div key={i} style={{ height: h, borderRadius: 4, background: "var(--bg-card)", border: "1px solid var(--border)", marginBottom: 16, overflow: "hidden", position: "relative" }}>
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, transparent 0%, rgba(31,27,22,0.05) 50%, transparent 100%)", animation: "shimmer-sweep 1.6s ease-in-out infinite" }} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: 24 }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 500, color: "var(--t1)", letterSpacing: "-0.4px", display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <Users style={{ width: 22, height: 22, color: "var(--brand)" }} />
            Workforce Intelligence
            <DataSourceBadge mode={isDemo ? "demo" : "live"} />
          </h1>
          <p style={{ fontSize: 12, color: "var(--t4)" }}>
            {isDemo ? "Showing sample data — connect Workday or BambooHR in Settings to go live." : "Live workload indexation, context-switching analysis, and capacity auditing."}
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
        <MetricCard icon={Users}      iconBg="rgba(232,103,43,0.10)" iconColor="var(--brand)"            value={employees.length}    label="Total Staff"            />
        <MetricCard icon={ShieldAlert} iconBg="rgba(255,87,87,0.10)"  iconColor="var(--p-critical-text)"  value={burnoutAlerts.length} label="Burnout Warnings"      />
        <MetricCard icon={TrendingUp} iconBg="rgba(255,151,65,0.10)" iconColor="var(--p-high-text)"       value={`${avgSwitchScore}%`} label="Avg Context Switching" />
        <MetricCard icon={Calendar}   iconBg="rgba(96,165,250,0.10)" iconColor="var(--p-info-text)"       value={onLeaveCount}         label="Out of Office Today"   />
      </div>

      {/* Burnout banner */}
      {burnoutAlerts.length > 0 && (
        <div style={{ background: "rgba(255,87,87,0.05)", border: "1px solid rgba(255,87,87,0.22)", borderRadius: 4, padding: "14px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--p-critical-text)", fontSize: 10, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
            <ShieldAlert style={{ width: 13, height: 13, animation: "pulse-dot 1.2s ease-in-out infinite" }} />
            Critical Burnout Risks Detected
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {burnoutAlerts.map(emp => (
              <div
                key={emp.id}
                onClick={() => setSelectedEmp(emp)}
                onMouseEnter={() => setHAlert(emp.id)}
                onMouseLeave={() => setHAlert(null)}
                style={{ background: hAlert === emp.id ? "var(--bg-hover)" : "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 4, padding: "10px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", transition: "all 100ms" }}
              >
                <div>
                  <h4 style={{ fontSize: 12, fontWeight: 500, color: "var(--t1)", marginBottom: 2 }}>{emp.name}</h4>
                  <p style={{ fontSize: 10, color: "var(--t4)" }}>{emp.role} · Context fragmentation score is {emp.workload?.contextSwitchScore}%.</p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, marginLeft: 12 }}>
                  <span style={{ fontSize: 9, fontWeight: 500, color: "var(--p-critical-text)", background: "rgba(255,87,87,0.08)", border: "1px solid rgba(255,87,87,0.22)", padding: "2px 7px", borderRadius: 3 }}>OVERLOADED</span>
                  <ChevronRight style={{ width: 13, height: 13, color: "var(--t5)" }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Staff directory table */}
      <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-strong)", borderRadius: 4, overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h3 style={{ fontSize: 13, fontWeight: 500, color: "var(--t1)" }}>Staff Directory</h3>
          <div style={{ position: "relative" }}>
            <Search style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", width: 12, height: 12, color: "var(--t5)" }} />
            <input
              type="text"
              placeholder="Search by name, role, department..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              style={{ width: 260, background: "rgba(31,27,22,0.045)", border: `1px solid ${searchFocused ? "rgba(232,103,43,0.40)" : "var(--border-strong)"}`, borderRadius: 4, paddingLeft: 30, paddingRight: 10, paddingTop: 5, paddingBottom: 5, fontSize: 11, color: "var(--t1)", outline: "none", transition: "border-color 120ms" }}
            />
          </div>
        </div>
        {employees.length === 0 && !loading ? (
          <div style={{ textAlign: "center", padding: "64px 24px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--bg-card)" }}>
            <PlugZap style={{ width: 28, height: 28, color: "var(--t5)", margin: "0 auto 12px" }} />
            <p style={{ fontSize: 14, fontWeight: 500, color: "var(--t2)", marginBottom: 6 }}>Connect Workday or BambooHR to see your team</p>
            <p style={{ fontSize: 12, color: "var(--t4)", marginBottom: 16 }}>FLOW will analyze workload, context switching, and burnout risk across your organization.</p>
            <a href="/integrations" style={{ display: "inline-block", fontSize: 12, fontWeight: 500, color: "var(--brand)", background: "rgba(232,103,43,0.08)", padding: "7px 16px", borderRadius: 4, textDecoration: "none" }}>
              Connect HR system →
            </a>
          </div>
        ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "rgba(31,27,22,0.04)", borderBottom: "1px solid var(--border)" }}>
                {["Staff Name", "Role Title", "Department", "Active Projects", "Context Switches", "Meeting Load", "Burnout Risk"].map((h, i) => (
                  <th key={h} style={{ padding: "8px 14px", fontSize: 9, fontWeight: 500, color: "var(--t5)", textTransform: "uppercase", letterSpacing: "0.08em", textAlign: i >= 4 ? "center" : "left" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredEmployees.map(emp => {
                const bs = burnoutStyle(emp.aiIntelligence?.burnoutRisk);
                const sc = switchColor(emp.workload?.contextSwitchScore);
                return (
                  <tr
                    key={emp.id}
                    onClick={() => setSelectedEmp(emp)}
                    onMouseEnter={() => setHRow(emp.id)}
                    onMouseLeave={() => setHRow(null)}
                    style={{ borderBottom: "1px solid var(--border)", background: hRow === emp.id ? "rgba(31,27,22,0.04)" : "transparent", cursor: "pointer", transition: "background 80ms" }}
                  >
                    <td style={{ padding: "10px 14px", fontWeight: 500, color: "var(--t1)" }}>{emp.name}</td>
                    <td style={{ padding: "10px 14px", color: "var(--t3)" }}>{emp.role}</td>
                    <td style={{ padding: "10px 14px", color: "var(--t3)" }}>{emp.department}</td>
                    <td style={{ padding: "10px 14px", color: "var(--t4)", fontSize: 11, maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {emp.workload?.activeProjects?.join(", ") || "None"}
                    </td>
                    <td style={{ padding: "10px 14px", textAlign: "center", fontWeight: 500, color: sc }}>{emp.workload?.contextSwitchScore}%</td>
                    <td style={{ padding: "10px 14px", textAlign: "center", color: "var(--t4)" }}>{emp.workload?.meetingLoadHrs}h/wk</td>
                    <td style={{ padding: "10px 14px", textAlign: "center" }}>
                      <span style={{ fontSize: 9, fontWeight: 500, padding: "2px 8px", borderRadius: 3, border: `1px solid ${bs.border}`, background: bs.bg, color: bs.color, textTransform: "uppercase" }}>{emp.aiIntelligence?.burnoutRisk || "LOW"}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        )}
      </div>

      {/* Employee detail drawer */}
      {selectedEmp && (() => {
        const bs = burnoutStyle(selectedEmp.aiIntelligence?.burnoutRisk);
        const sc = switchColor(selectedEmp.workload?.contextSwitchScore);
        return (
          <div style={{ position: "fixed", inset: 0, background: "rgba(31,27,22,0.35)", backdropFilter: "blur(6px)", display: "flex", justifyContent: "flex-end", zIndex: 50 }} onClick={() => setSelectedEmp(null)}>
            <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 640, background: "var(--bg-sidebar)", borderLeft: "1px solid var(--border-strong)", height: "100%", padding: "20px 24px", display: "flex", flexDirection: "column", boxShadow: "-12px 0 40px rgba(31,27,22,0.12)", overflowY: "auto", gap: 20 }}>

              {/* Header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", paddingBottom: 16, borderBottom: "1px solid var(--border)" }}>
                <div>
                  <span style={{ display: "block", fontSize: 10, color: "var(--t5)", marginBottom: 4 }}>{selectedEmp.email}</span>
                  <h3 style={{ fontSize: 18, fontWeight: 500, color: "var(--t1)", letterSpacing: "-0.3px", marginBottom: 8 }}>{selectedEmp.name}</h3>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 9, fontWeight: 500, padding: "2px 8px", borderRadius: 3, border: `1px solid ${bs.border}`, background: bs.bg, color: bs.color }}>Burnout: {selectedEmp.aiIntelligence?.burnoutRisk || "LOW"}</span>
                    <span style={{ fontSize: 9, fontWeight: 500, padding: "2px 8px", borderRadius: 3, border: "1px solid var(--border)", background: "rgba(31,27,22,0.045)", color: "var(--t4)" }}>{selectedEmp.department}</span>
                  </div>
                </div>
                <button onClick={() => setSelectedEmp(null)} style={{ padding: 6, background: "none", border: "none", color: "var(--t5)", cursor: "pointer" }}><X style={{ width: 16, height: 16 }} /></button>
              </div>

              {/* AI Workforce Insights */}
              <div style={{ border: "1px solid rgba(232,103,43,0.22)", background: "rgba(232,103,43,0.04)", borderRadius: 4, padding: "14px 16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, borderBottom: "1px solid rgba(232,103,43,0.12)", paddingBottom: 10, marginBottom: 14 }}>
                  <Activity style={{ width: 13, height: 13, color: "var(--brand)", animation: "pulse-dot 1.2s ease-in-out infinite" }} />
                  <span style={{ fontSize: 9, fontWeight: 500, color: "var(--brand-text)", textTransform: "uppercase", letterSpacing: "0.10em" }}>AI Workforce Optimization Analysis</span>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
                  <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 4, padding: "8px 10px" }}>
                    <span style={{ display: "block", fontSize: 8, fontWeight: 500, color: "var(--t5)", textTransform: "uppercase", letterSpacing: "0.10em", marginBottom: 4 }}>Context Switching Score</span>
                    <span style={{ fontSize: 12, fontWeight: 500, color: sc }}>{selectedEmp.workload?.contextSwitchScore}%</span>
                  </div>
                  <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 4, padding: "8px 10px" }}>
                    <span style={{ display: "block", fontSize: 8, fontWeight: 500, color: "var(--t5)", textTransform: "uppercase", letterSpacing: "0.10em", marginBottom: 4 }}>Review Bottleneck Index</span>
                    <span style={{ fontSize: 12, fontWeight: 500, color: "var(--t1)" }}>{selectedEmp.aiIntelligence?.reviewBottlenecks || "None"}</span>
                  </div>
                </div>

                <div style={{ marginBottom: 12 }}>
                  <span style={{ display: "block", fontSize: 8, fontWeight: 500, color: "var(--t5)", textTransform: "uppercase", letterSpacing: "0.10em", marginBottom: 4 }}>Knowledge Concentration Risk</span>
                  <p style={{ fontSize: 12, color: "var(--t1)", lineHeight: 1.5 }}>{selectedEmp.aiIntelligence?.knowledgeConcentrationRisk}</p>
                </div>

                {selectedEmp.aiIntelligence?.suggestedDelegates?.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <span style={{ display: "block", fontSize: 8, fontWeight: 500, color: "var(--t5)", textTransform: "uppercase", letterSpacing: "0.10em", marginBottom: 4 }}>Suggested Delegates</span>
                    <p style={{ fontSize: 12, color: "var(--t3)" }}>{selectedEmp.aiIntelligence.suggestedDelegates.join(", ")}</p>
                  </div>
                )}

                {selectedEmp.aiIntelligence?.suggestedReviewers?.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 5 }}>
                      <GitPullRequest style={{ width: 11, height: 11, color: "var(--p-high-text)" }} />
                      <span style={{ fontSize: 8, fontWeight: 500, color: "var(--p-high-text)", textTransform: "uppercase", letterSpacing: "0.10em" }}>Suggested Reviewers (RAG context matched)</span>
                    </div>
                    <ul style={{ listStyleType: "disc", paddingLeft: 16, margin: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                      {selectedEmp.aiIntelligence.suggestedReviewers.map((r, i) => <li key={i} style={{ fontSize: 12, color: "var(--t3)" }}>{r}</li>)}
                    </ul>
                  </div>
                )}

                <div style={{ background: "rgba(232,103,43,0.08)", border: "1px solid rgba(232,103,43,0.22)", borderRadius: 4, padding: "8px 12px" }}>
                  <span style={{ display: "block", fontSize: 8, fontWeight: 500, color: "var(--brand-text)", textTransform: "uppercase", letterSpacing: "0.10em", marginBottom: 4 }}>Suggested Operational Focus</span>
                  <span style={{ fontSize: 12, fontWeight: 500, color: "var(--t1)" }}>
                    {selectedEmp.aiIntelligence?.burnoutRisk === "HIGH"
                      ? "De-schedule non-critical meetings, reduce active project assignments."
                      : "Assign pending PR reviews matching core skillsets."}
                  </span>
                </div>
              </div>

              {/* Workload indicators */}
              <div>
                <SectionLabel icon={Briefcase}>Workload Indicators</SectionLabel>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                  {[
                    { label: "Jira Assignments", value: selectedEmp.workload?.jiraTasksCount },
                    { label: "Meetings / Week",  value: `${selectedEmp.workload?.meetingLoadHrs}h` },
                    { label: "Local Timezone",   value: selectedEmp.timezone },
                  ].map(({ label, value }) => (
                    <div key={label} style={{ background: "rgba(31,27,22,0.04)", border: "1px solid var(--border)", borderRadius: 4, padding: "10px 12px", textAlign: "center" }}>
                      <p style={{ fontSize: 16, fontWeight: 500, color: "var(--t1)", marginBottom: 4 }}>{value}</p>
                      <p style={{ fontSize: 8, fontWeight: 500, color: "var(--t5)", textTransform: "uppercase", letterSpacing: "0.10em" }}>{label}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Skills */}
              <div>
                <SectionLabel icon={Award}>Technical Expertise & Domain Ownership</SectionLabel>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {selectedEmp.skills?.map((skill, i) => (
                    <span key={i} style={{ fontSize: 11, fontWeight: 500, padding: "4px 10px", border: "1px solid var(--border)", borderRadius: 10, background: "rgba(31,27,22,0.045)", color: "var(--t1)" }}>
                      {skill}
                    </span>
                  ))}
                </div>
              </div>

              {/* PTO */}
              {selectedEmp.availability?.timeoff?.length > 0 && (
                <div>
                  <SectionLabel icon={Clock}>Upcoming PTO / Leave Schedule</SectionLabel>
                  <div style={{ background: "rgba(255,151,65,0.05)", border: "1px solid rgba(255,151,65,0.22)", borderRadius: 4, padding: "10px 12px" }}>
                    <p style={{ fontSize: 12, color: "var(--t3)" }}>
                      Out of Office: <strong style={{ color: "var(--t1)" }}>{selectedEmp.availability.timeoff[0].type}</strong> from {selectedEmp.availability.timeoff[0].start} to {selectedEmp.availability.timeoff[0].end}.
                    </p>
                  </div>
                </div>
              )}

              {/* Footer */}
              <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14, display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--t5)" }}>
                <span>Department: {selectedEmp.department}</span>
                <span>Status: <strong style={{ color: "var(--p-normal-text)" }}>{selectedEmp.status}</strong></span>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export default WorkforceIntelligence;
