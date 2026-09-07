import { useState } from "react";
import {
  Play, ChevronRight, ChevronLeft, Clock, Users, Building2,
  CheckCircle, Zap, BarChart2, Shield, ArrowRight, Circle,
} from "lucide-react";

const card = { background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 10, padding: "20px 22px" };

const DEMO_TRACKS = [
  {
    id: "quick",
    label: "15-Minute Demo",
    icon: Clock,
    description: "Executive overview — best for first call with a CEO or CTO.",
    audience: "CEO, CTO, VP Operations",
    steps: [
      {
        title: "The Problem (2 min)",
        talking_points: [
          "Executives lose 2–4 hours per day switching between tools to understand what's happening.",
          "Ask: 'What's the first thing you read every morning?' — most say Slack, then email, then Jira.",
          "Each context switch costs ~3 minutes. That's $200K+/year in lost executive time.",
        ],
        demo_action: null,
        screen: "/",
      },
      {
        title: "Morning Briefing (3 min)",
        talking_points: [
          "Open FLOW at /. This replaces the morning Slack/email ritual.",
          "Point to the brief: 'This is everything that happened while you were offline — from GitHub, Gmail, Jira, and Calendar.'",
          "Ask: 'Is any of this relevant to your actual situation?'",
        ],
        demo_action: "Navigate to / and show the live Morning Briefing",
        screen: "/",
      },
      {
        title: "Chief of Staff (4 min)",
        talking_points: [
          "Navigate to /chief. This is FLOW's 'what should you do next?' view.",
          "Show the NOW section — top 5 prioritized actions.",
          "Complete one action live. Show the risk badge: 'FLOW tells you what it will do before doing it.'",
          "Show the audit trail: 'Everything is logged — no surprises.'",
        ],
        demo_action: "Navigate to /chief. Complete one LOW-risk action together.",
        screen: "/chief",
      },
      {
        title: "Value (2 min)",
        talking_points: [
          "Navigate to /success. Show the time saved counter.",
          "Point to the basis badges: 'These numbers come from real records, not estimates.'",
          "Rough ROI: if FLOW saves 1 hour/day at $200K comp, that's $100+/day. FLOW costs less than $100/day for 50 seats.",
        ],
        demo_action: "Navigate to /success. Show the measured vs estimated labels.",
        screen: "/success",
      },
      {
        title: "Next Steps (4 min)",
        talking_points: [
          "What would you want to connect first — GitHub, Gmail, or Jira?",
          "Who else on your team should see this?",
          "Can we schedule a 30-day pilot? I can have your connectors live before you leave this call.",
        ],
        demo_action: null,
        screen: null,
      },
    ],
  },
  {
    id: "full",
    label: "30-Minute Demo",
    icon: Zap,
    description: "Full product walkthrough — for champions evaluating for their team.",
    audience: "VP Engineering, VP Operations, Head of Customer Success",
    steps: [
      {
        title: "Context (3 min)",
        talking_points: [
          "Understand their current tool stack before showing anything.",
          "Ask: 'What's your current process for morning briefings?'",
          "Ask: 'How long does it take to understand the state of all your customers/projects?'",
          "Calibrate: if GitHub-heavy, lead with /engineering. If customer-heavy, lead with /support.",
        ],
        demo_action: null,
        screen: null,
      },
      {
        title: "Morning Briefing (5 min)",
        talking_points: [
          "Navigate to /. Show the live briefing with real Helios data.",
          "Point to sources: 'Every insight links to the original email, PR, or ticket.'",
          "Click an insight → expand → show the evidence panel.",
          "Show: 'This is what your team will see every morning. No Slack scrolling required.'",
        ],
        demo_action: "Navigate to /. Click 2 insights to show evidence.",
        screen: "/",
      },
      {
        title: "Engineering Dashboard (5 min)",
        talking_points: [
          "Navigate to /engineering. This is the CTO/VP Eng view.",
          "Point to PR queue: 'Which PRs are blocking your release? Merge readiness score tells you at a glance.'",
          "Show deployment risk: 'Is tonight's deploy safe? Red = high risk.'",
          "Show release gates: 'Go/no-go checklist in one view.'",
        ],
        demo_action: "Navigate to /engineering. Point to PR #847 as the blocking item.",
        screen: "/engineering",
      },
      {
        title: "Customer Intelligence (5 min)",
        talking_points: [
          "Navigate to /support. This is the CS view.",
          "Show Acme Corp at 42% health: 'FLOW flagged this 10 days before their renewal.'",
          "Show escalation card: 'FLOW recommended the call. Here's who to involve.'",
          "Ask: 'Do you have customers that surprised you when they churned?'",
        ],
        demo_action: "Navigate to /support. Show Acme Corp escalation card.",
        screen: "/support",
      },
      {
        title: "Autonomous Action (5 min)",
        talking_points: [
          "Navigate to /chief. This is where FLOW takes action, not just observes.",
          "Show a pending action. Explain risk tiers: 'LOW auto-executes. HIGH requires an admin. CRITICAL requires two people.'",
          "Complete one action. Show the execution preview: 'FLOW shows you exactly what it will do before doing it.'",
          "Show audit trail: 'Everything is permanently logged for SOC 2 compliance.'",
        ],
        demo_action: "Navigate to /chief. Complete a LOW-risk action live.",
        screen: "/chief",
      },
      {
        title: "Value + Next Steps (7 min)",
        talking_points: [
          "Navigate to /success. Show the ROI dashboard with measured/estimated labels.",
          "Conservative estimate: 1h/day saved × 5 executives × $200K comp = $500+/day.",
          "Ask: 'What would you do with 2 extra hours per day?'",
          "Discuss: connector readiness, security review timeline, pilot success criteria.",
        ],
        demo_action: "Navigate to /success. Show monthly ROI from /api/roi/monthly.",
        screen: "/success",
      },
    ],
  },
  {
    id: "technical",
    label: "60-Minute Technical Demo",
    icon: Shield,
    description: "Deep-dive for IT/Security teams and CTOs evaluating the platform.",
    audience: "CTO, CISO, VP Engineering, IT Director",
    steps: [
      {
        title: "Architecture Overview (10 min)",
        talking_points: [
          "FLOW is deployed on your infrastructure — your data never leaves your environment.",
          "Stack: Node.js backend, PostgreSQL + pgvector, Redis, React frontend.",
          "Every connector uses OAuth 2.0 with credential isolation per workspace.",
          "The Privacy Gate drops PII before any data is vectorized or stored.",
          "Governance layer enforces role-based approval for all autonomous actions.",
        ],
        demo_action: "Show DEPLOYMENT_ARCHITECTURE.md. Navigate to /settings/health.",
        screen: "/settings/health",
      },
      {
        title: "Tenant Isolation (5 min)",
        talking_points: [
          "Every API call requires a workspace-id header — cross-tenant access returns 403.",
          "Data at rest: each workspace has isolated vector partitions in pgvector.",
          "WebSocket channels are workspace-scoped with JWT verification.",
        ],
        demo_action: "Show /api/connectors returns 400 without workspace-id header.",
        screen: "/settings/security",
      },
      {
        title: "Integration Permissions (5 min)",
        talking_points: [
          "Navigate to /integrations. Show the deny-by-default gate.",
          "FLOW never reads a resource until it's explicitly allowed.",
          "Show: 'You can hide entire repositories, email labels, or calendars from FLOW.'",
          "Grandfathering: existing workspaces keep current access until you explicitly govern.",
        ],
        demo_action: "Navigate to /integrations. Show a resource toggle.",
        screen: "/integrations",
      },
      {
        title: "Governance & Audit (10 min)",
        talking_points: [
          "Navigate to /settings/governance. Show the policy editor.",
          "Every action FLOW takes goes through the governance layer.",
          "Risk tiers: LOW auto / MEDIUM confirm / HIGH 1-admin / CRITICAL 2-admin.",
          "Navigate to /settings/audit. Show the append-only audit log.",
          "All audit records include: who, what, when, risk level, outcome.",
        ],
        demo_action: "Navigate to /settings/governance then /settings/audit.",
        screen: "/settings/governance",
      },
      {
        title: "AI Quality & Explainability (10 min)",
        talking_points: [
          "Every AI response includes citations — click any insight to see the source.",
          "The Explainability layer shows confidence, evidence freshness, and contradictions.",
          "Ask follow-up questions on any AI response: 'Why did you say that?'",
          "FLOW never presents an answer without showing WHERE it came from.",
        ],
        demo_action: "Ask a copilot question. Expand the evidence panel.",
        screen: "/",
      },
      {
        title: "Security Certifications (10 min)",
        talking_points: [
          "Run certify-production.js live — shows real-time security checks.",
          "Show SECURITY_AUDIT.md: 25 domains reviewed, results documented.",
          "Data retention: configurable per workspace — 30/90-day rolling or permanent.",
          "Privacy Gate: any message with privacy score > 0.85 is silently dropped.",
        ],
        demo_action: "Show SECURITY_AUDIT.md. Run certify-production.js output.",
        screen: null,
      },
      {
        title: "Deployment & Operations (10 min)",
        talking_points: [
          "Docker + docker-compose for single-command deployment.",
          "Health probes: /health/live (liveness) + /health/ready (readiness).",
          "Graceful shutdown: drains HTTP → workers → database on SIGTERM.",
          "Metrics at /api/metrics (ADMIN JWT required or METRICS_TOKEN).",
          "Backup: pg_dump daily + Redis AOF + Vault file backup.",
        ],
        demo_action: "Show /health/ready + /metrics/infra responses live.",
        screen: "/settings/health",
      },
    ],
  },
  {
    id: "industry",
    label: "Industry Demos",
    icon: Building2,
    description: "Tailored story for a specific vertical — run after choosing the right track.",
    audience: "Industry-specific champion",
    steps: [
      {
        title: "Healthcare",
        talking_points: [
          "Lead with: patient communication compliance, incident tracking, care team coordination.",
          "Show: Privacy Gate blocking HIPAA-sensitive messages before they're vectorized.",
          "Show: Integration Permissions — you decide which EMR data FLOW can see.",
          "Key metric: how many hours do care coordinators spend reading Slack?",
        ],
        demo_action: "Navigate to /integrations → show deny-by-default resource controls.",
        screen: "/integrations",
      },
      {
        title: "FinTech / Finance",
        talking_points: [
          "Lead with: audit trail, governance, approval workflows for financial actions.",
          "Show: CRITICAL risk tier requiring 2 approvers for any financial action.",
          "Show: /settings/audit — SOC 2 evidence appendable, append-only.",
          "Key concern: data sovereignty — everything runs on your infrastructure.",
        ],
        demo_action: "Navigate to /settings/audit + /settings/governance.",
        screen: "/settings/audit",
      },
      {
        title: "Manufacturing / Logistics",
        talking_points: [
          "Lead with: incident response, supply chain coordination, operations intelligence.",
          "Show: Incident Engine detecting outage signals in Slack/GitHub messages.",
          "Show: Weekly Review velocity metrics — is output tracking against plan?",
          "Key pain: too many systems, no unified status view.",
        ],
        demo_action: "Navigate to /review + /engineering for operational view.",
        screen: "/review",
      },
      {
        title: "SaaS / Software Agency",
        talking_points: [
          "Lead with: engineering velocity, PR review intelligence, customer health.",
          "Show: /engineering with merge readiness scores and release gates.",
          "Show: /support with customer health portfolio and churn risk.",
          "Key metric: how many PRs are reviewed same-day vs sitting for 3+ days?",
        ],
        demo_action: "Lead with /engineering PR queue then pivot to /support.",
        screen: "/engineering",
      },
    ],
  },
];

export default function SalesDemoPlatform() {
  const [selectedTrack, setSelectedTrack] = useState(null);
  const [step, setStep] = useState(0);

  const track = selectedTrack ? DEMO_TRACKS.find(t => t.id === selectedTrack) : null;
  const currentStep = track?.steps[step] ?? null;
  const totalSteps = track?.steps.length ?? 0;

  if (track && currentStep) {
    return (
      <div style={{ padding: "28px 28px 60px", maxWidth: 900, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
          <button onClick={() => { setSelectedTrack(null); setStep(0); }}
            style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "transparent", color: "var(--t3)", fontSize: 12, cursor: "pointer" }}>
            <ChevronLeft style={{ width: 13, height: 13 }} /> Back
          </button>
          <span style={{ fontSize: 13, color: "var(--t3)" }}>{track.label}</span>
          <ChevronRight style={{ width: 13, height: 13, color: "var(--t4)" }} />
          <span style={{ fontSize: 13, color: "var(--t1)", fontWeight: 500 }}>Step {step + 1} of {totalSteps}</span>
        </div>

        {/* Progress */}
        <div style={{ display: "flex", gap: 4, marginBottom: 24 }}>
          {track.steps.map((_, i) => (
            <div key={i} onClick={() => setStep(i)} style={{ flex: 1, height: 4, borderRadius: 2, background: i <= step ? "var(--brand)" : "var(--surface-2)", cursor: "pointer", transition: "background 200ms" }} />
          ))}
        </div>

        {/* Step content */}
        <div style={card}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500, color: "var(--t1)" }}>{currentStep.title}</h2>
            {currentStep.screen && (
              <a href={currentStep.screen} target="_blank" rel="noreferrer"
                style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--brand)", textDecoration: "none", padding: "5px 10px", border: "1px solid var(--border)", borderRadius: 6 }}>
                <ArrowRight style={{ width: 12, height: 12 }} /> Open screen
              </a>
            )}
          </div>

          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--t4)", marginBottom: 12 }}>Talking Points</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {currentStep.talking_points.map((pt, i) => (
                <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <ChevronRight style={{ width: 14, height: 14, color: "var(--brand)", flexShrink: 0, marginTop: 2 }} />
                  <span style={{ fontSize: 14, color: "var(--t2)", lineHeight: 1.5 }}>{pt}</span>
                </div>
              ))}
            </div>
          </div>

          {currentStep.demo_action && (
            <div style={{ background: "rgba(232,103,43,0.06)", border: "1px solid rgba(232,103,43,0.15)", borderRadius: 8, padding: "12px 16px" }}>
              <div style={{ fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--brand)", marginBottom: 6 }}>Demo Action</div>
              <div style={{ fontSize: 13, color: "var(--t1)" }}>{currentStep.demo_action}</div>
            </div>
          )}
        </div>

        {/* Navigation */}
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 20 }}>
          <button onClick={() => setStep(s => Math.max(0, s - 1))} disabled={step === 0}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 8, border: "1px solid var(--border)", background: "transparent", color: step === 0 ? "var(--t4)" : "var(--t2)", fontSize: 13, cursor: step === 0 ? "not-allowed" : "pointer" }}>
            <ChevronLeft style={{ width: 14, height: 14 }} /> Previous
          </button>
          {step < totalSteps - 1 ? (
            <button onClick={() => setStep(s => s + 1)}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 8, background: "var(--brand)", color: "#fff", border: "none", fontSize: 13, fontWeight: 500, cursor: "pointer" }}>
              Next <ChevronRight style={{ width: 14, height: 14 }} />
            </button>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 8, background: "var(--ok-bg)", color: "var(--ok)", fontSize: 13, fontWeight: 500 }}>
              <CheckCircle style={{ width: 14, height: 14 }} /> Demo complete
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "28px 28px 60px", maxWidth: 900, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <Play style={{ width: 20, height: 20, color: "var(--brand)" }} strokeWidth={1.5} />
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 500, color: "var(--t1)" }}>Sales Demo Platform</h1>
      </div>
      <p style={{ margin: "0 0 28px", fontSize: 13, color: "var(--t3)" }}>
        Step-by-step demo guides with talking points and demo actions for each screen.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {DEMO_TRACKS.map(track => {
          const Icon = track.icon;
          return (
            <button key={track.id} onClick={() => { setSelectedTrack(track.id); setStep(0); }}
              style={{ ...card, textAlign: "left", cursor: "pointer", border: "1px solid var(--border)", transition: "border-color 80ms", background: "var(--bg-card)" }}
              onMouseEnter={e => e.currentTarget.style.borderColor = "var(--brand)"}
              onMouseLeave={e => e.currentTarget.style.borderColor = "var(--border)"}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: "rgba(232,103,43,0.08)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Icon style={{ width: 16, height: 16, color: "var(--brand)" }} strokeWidth={1.5} />
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: "var(--t1)" }}>{track.label}</div>
                  <div style={{ fontSize: 11, color: "var(--t4)" }}>{track.steps.length} steps</div>
                </div>
              </div>
              <p style={{ margin: "0 0 10px", fontSize: 13, color: "var(--t2)", lineHeight: 1.5 }}>{track.description}</p>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Users style={{ width: 12, height: 12, color: "var(--t4)" }} />
                <span style={{ fontSize: 11, color: "var(--t4)" }}>{track.audience}</span>
              </div>
            </button>
          );
        })}
      </div>

      <div style={{ ...card, marginTop: 24 }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: "var(--t2)", marginBottom: 12 }}>Before every demo — check these</div>
        {[
          "Demo company loaded: /settings/import → 'Load Demo Company'",
          "All 6 connectors showing green in /integrations (or Demo mode is showing)",
          "Morning Briefing loads in < 3s at /",
          "Chief of Staff shows at least 3 items in /chief",
          "Value page shows data at /success",
        ].map((check, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: i < 4 ? "1px solid var(--border)" : "none" }}>
            <Circle style={{ width: 13, height: 13, color: "var(--t4)", flexShrink: 0 }} />
            <span style={{ fontSize: 12, color: "var(--t2)" }}>{check}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
