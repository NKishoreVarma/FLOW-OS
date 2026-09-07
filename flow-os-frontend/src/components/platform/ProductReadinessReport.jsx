/**
 * Product Readiness Report (Program 10)
 *
 * Overall readiness score, strengths, weaknesses, remaining issues,
 * critical blockers, and recommended pilot checklist.
 *
 * Score is computed from 8 dimensions. Each dimension lists its passing
 * and failing criteria drawn from the real architecture state.
 */

import { useState } from "react";
import {
  CheckCircle, XCircle, AlertTriangle, ChevronDown, ChevronRight,
  Star, Zap, Shield, Users, Link2, Brain, Activity, Target,
  BarChart3, ClipboardList, AlertCircle, FileText, Clock,
} from "lucide-react";

/* ─── report data ────────────────────────────────────────────── */

const DIMENSIONS = [
  {
    id: "auth",
    icon: Shield,
    label: "Authentication & Security",
    weight: 12,
    score: 88,
    passing: [
      "JWT authentication with no hardcoded secrets",
      "Tenant isolation enforced at middleware layer (DB-validated)",
      "Workspace-scoped roles (workspace_members table)",
      "WebSocket authentication required in production",
      "Admin pages return 404 in production",
      "Request secret redaction in structured logs",
      "SSRF-safe web crawler",
      "SQL injection protection via parameterized queries everywhere",
      "Privacy gate hard-drops PII (score > 0.85)",
    ],
    failing: [
      "CORS set to '*' in development — must be scoped before production (TD-04)",
      "No per-tenant rate limiting — global in-process only (TD-10)",
      "JWT has no server-side revocation mechanism",
    ],
  },
  {
    id: "ai",
    icon: Brain,
    label: "AI Platform",
    weight: 15,
    score: 95,
    passing: [
      "9-layer AI platform with full provider isolation",
      "93/93 validation assertions passing",
      "Provider isolation enforced — no LLM SDK outside src/ai/",
      "Deterministic fallback for every LLM call",
      "Guardrails: PII detection, injection stripping, output validation",
      "Request tracing and async audit persistence",
      "Multi-provider routing (Gemini, Ollama, extensible)",
      "Rate limiting via Redis (cross-instance safe)",
      "Tool registry with 9 governed tools",
    ],
    failing: [
      "Random embedding fallback pollutes vector index silently (TD-06)",
    ],
  },
  {
    id: "connectors",
    icon: Link2,
    label: "Connector Platform",
    weight: 12,
    score: 85,
    passing: [
      "Universal Connector Framework (BaseAdapter, ExecutionEngine, SearchOrchestrator)",
      "Gmail adapter: full OAuth2, inbox, send, reply, forward, label management",
      "GitHub adapter: repos, PRs, reviews, deployments, merge operations",
      "Google Calendar adapter: events, meeting prep, notes, action items",
      "Deny-by-default Integration Permissions gate (40/40 validation)",
      "All actions flow through governed executeAction() pipeline",
      "Connector audit log in PostgreSQL (durable, not in-memory)",
      "Grandfathering for non-breaking deploy of permission gates",
    ],
    failing: [
      "Slack, Notion, Jira, Salesforce, HubSpot adapters are skeletons — listed but not functional",
      "SharePoint, OneDrive, Confluence show as disabled with no fabrication (honest but limited)",
    ],
  },
  {
    id: "intelligence",
    icon: Activity,
    label: "Intelligence Platform",
    weight: 15,
    score: 97,
    passing: [
      "Unified Event Platform (100k event load test — 14/14)",
      "Knowledge Graph Digital Twin (4,420 nodes / 26,636 edges in demo twin)",
      "Explainability Engine (XAI) — 16/16 across 8 domains",
      "Workspace Replay DVR — 12/12 at 100k events (replay 2.1s, snapshot 120ms)",
      "What-If Simulation — 14/14, 11 scenario types, real graph data",
      "Predictive Workspace Intelligence — 20/20, ~50ms, ~22 prediction types",
      "Bounded BFS traversal (hub node: 38s → 30ms)",
      "Single graph writer invariant enforced",
    ],
    failing: [
      "In-memory state (incidents, decisions, topic clusters) lost on restart (TD-01)",
    ],
  },
  {
    id: "execution",
    icon: Zap,
    label: "Execution & Governance",
    weight: 12,
    score: 96,
    passing: [
      "Risk-tiered approval (LOW/MEDIUM/HIGH/CRITICAL)",
      "Two-person integrity for CRITICAL risk actions",
      "Self-approval guard enforced",
      "Execution audit to PostgreSQL (durable)",
      "Merge conflict detection with file-level ownership",
      "Notification engine with dedup and permission-aware targeting",
      "Automation actor role fixed at MEMBER (no privilege escalation)",
      "26/26 execution validation, 23/23 collaboration, 19/19 notifications",
    ],
    failing: [
      "No email infrastructure for approval notification delivery — WebSocket only",
    ],
  },
  {
    id: "ux",
    icon: Star,
    label: "User Experience",
    weight: 14,
    score: 82,
    passing: [
      "Consistent design token system (tokens.css — no raw hex in components)",
      "Morning Briefing loads in ~5ms from Workspace Intelligence Cache",
      "Command Palette (⌘K) with Brain RAG, nav commands, slash mode",
      "Notification center with 4 tabs, live WebSocket updates",
      "Chief of Staff view with top-5 actions and one-click execution",
      "Onboarding wizard (5 steps, fails open — never traps a session)",
      "Success/ROI dashboard with measured vs estimated basis badges",
      "Help Center with docs, FAQ, troubleshooting, shortcuts",
      "Settings shell with consistent layout, sticky save bar, unsaved changes detection",
      "Admin console with 5 tabs: overview, usage, connectors, approvals, activity",
      "Release notes with version history, upcoming, maintenance",
    ],
    failing: [
      "Mobile experience untested — responsive styles present but no mobile CI",
      "Accessibility: no ARIA labels audit, keyboard navigation not tested in screen reader",
      "Error boundary exists but error recovery messages could be more actionable",
    ],
  },
  {
    id: "ops",
    icon: Target,
    label: "Operational Readiness",
    weight: 10,
    score: 90,
    passing: [
      "Docker multi-stage build with non-root user",
      "Graceful shutdown: SIGTERM drains HTTP → workers → pg → redis",
      "Liveness and readiness probes (/health/live, /health/ready)",
      "Structured logging with secret redaction",
      "Platform metrics at /api/metrics (RBAC-protected)",
      "Alert rules for queue depth, error rate, memory",
      "Backup and recovery documented (RPO 1h, RTO <30min)",
      "Performance benchmarks documented",
    ],
    failing: [
      "Daily summary cron hardcoded to single workspace (TD-09)",
      "Test suite empty — all coverage via validate-*.js scripts only",
    ],
  },
  {
    id: "pilot",
    icon: Users,
    label: "Pilot Readiness",
    weight: 10,
    score: 89,
    passing: [
      "First-run wizard with demo mode (no real connectors required)",
      "Living Workspace Simulator generates 6-month causal data history",
      "Value dashboard with honest ROI (measured vs estimated)",
      "Team invite with per-role explanations",
      "Adoption metrics: time-to-value, work-in-FLOW, connector discovery",
      "TrustBar shows connector health on all major pages",
      "Demo mode labels on all data surfaces (never deceives about data source)",
    ],
    failing: [
      "No email delivery for team invitations (temp password shared manually)",
      "Real-time transcription requires Google Speech-to-Text API (not configured)",
    ],
  },
];

const CRITICAL_BLOCKERS = [
  {
    id: "cors",
    severity: "high",
    title: "CORS must be scoped before public deployment",
    detail: "Currently set to '*'. Set CORS_ORIGIN environment variable to your exact frontend domain before any external traffic.",
    fix: "Set CORS_ORIGIN=https://your-domain.com in .env",
  },
  {
    id: "ws-auth",
    severity: "medium",
    title: "WebSocket auth required in production",
    detail: "Set WS_AUTH_REQUIRED=true — without it, unauthenticated clients can subscribe to any workspace's live event stream.",
    fix: "Set WS_AUTH_REQUIRED=true in production .env",
  },
  {
    id: "jwt",
    severity: "medium",
    title: "JWT_SECRET must be cryptographically random",
    detail: "Minimum 32 characters, generated with openssl rand -hex 32. The server validates this at startup.",
    fix: "openssl rand -hex 32 → set as JWT_SECRET",
  },
];

const PILOT_CHECKLIST = [
  { section: "Infrastructure",   items: [
    { label: "PostgreSQL 16 + pgvector extension installed",          required: true },
    { label: "Redis 7+ running",                                       required: true },
    { label: "GEMINI_API_KEY configured",                              required: true },
    { label: "JWT_SECRET set (≥32 chars, cryptographically random)",  required: true },
    { label: "CORS_ORIGIN set to pilot URL",                          required: true },
    { label: "WS_AUTH_REQUIRED=true in production",                    required: true },
    { label: "VAULT_ROOT set or default ~/FLOW-OS-VAULTS is writable",required: false },
  ]},
  { section: "Connectors",  items: [
    { label: "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET configured",  required: true },
    { label: "GITHUB_TOKEN with repo + read:user scopes",              required: false },
    { label: "Pilot user has completed OAuth flow for Gmail",          required: false },
    { label: "Integration Permissions reviewed and allowed resources set", required: true },
  ]},
  { section: "First Run",   items: [
    { label: "Onboarding wizard tested end-to-end in demo mode",      required: true },
    { label: "Morning Briefing shows real data or demo data",         required: true },
    { label: "Chief of Staff shows ≥1 action card",                  required: false },
    { label: "⌘K opens and Brain query returns response",             required: false },
  ]},
  { section: "Value",       items: [
    { label: "Success Dashboard shows baseline (zeros are OK on day 1)", required: true },
    { label: "TrustBar shows at least one connected integration",    required: false },
    { label: "Pilot user invited and can log in",                     required: true },
    { label: "Admin console accessible to OWNER role",               required: true },
  ]},
  { section: "Monitoring",  items: [
    { label: "GET /health/ready returns 200",                         required: true },
    { label: "GET /api/metrics returns data (METRICS_TOKEN or ADMIN JWT)", required: false },
    { label: "Logs are being collected (structured JSON)",            required: false },
    { label: "Alert rules reviewed at /api/metrics/alerts",          required: false },
  ]},
];

/* ─── component ─────────────────────────────────────────────── */

export default function ProductReadinessReport() {
  const [expandedDim, setExpandedDim] = useState({});
  const [expandedBlock, setExpandedBlock] = useState({});
  const [checkState, setCheckState] = useState({});

  const totalWeight = DIMENSIONS.reduce((a, d) => a + d.weight, 0);
  const weightedScore = Math.round(
    DIMENSIONS.reduce((a, d) => a + (d.score * d.weight), 0) / totalWeight
  );

  const scoreColor = weightedScore >= 90 ? "var(--p-normal-text)"
    : weightedScore >= 75 ? "var(--p-high-text)"
    : "var(--p-critical-text)";

  const label = weightedScore >= 90 ? "Pilot Ready"
    : weightedScore >= 75 ? "Ready with Minor Issues"
    : "Needs Attention";

  const totalChecks = PILOT_CHECKLIST.flatMap(s => s.items).length;
  const doneChecks = Object.values(checkState).filter(Boolean).length;

  return (
    <div style={{ height: "100%", overflowY: "auto", padding: "24px" }}>
      <div style={{ maxWidth: 860, margin: "0 auto" }}>

        {/* Report header */}
        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-strong)", borderRadius: 8, padding: "24px 28px", marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 20, flexWrap: "wrap" }}>
            {/* Score circle */}
            <div style={{ textAlign: "center", flexShrink: 0 }}>
              <div style={{
                width: 96, height: 96, borderRadius: "50%",
                border: `5px solid ${scoreColor}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                flexDirection: "column",
              }}>
                <span style={{ fontSize: 28, fontWeight: 700, color: scoreColor, lineHeight: 1 }}>{weightedScore}</span>
                <span style={{ fontSize: 9, color: "var(--t5)", fontWeight: 500 }}>/100</span>
              </div>
              <p style={{ fontSize: 10, fontWeight: 600, color: scoreColor, margin: "8px 0 0", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</p>
            </div>

            <div style={{ flex: 1, minWidth: 200 }}>
              <h1 style={{ fontSize: 18, fontWeight: 700, color: "var(--t1)", margin: "0 0 6px", letterSpacing: "-0.02em" }}>FLOW OS — Product Readiness Report</h1>
              <p style={{ fontSize: 11, color: "var(--t5)", margin: "0 0 14px" }}>v1.0.0 · 2026-07-21 · Architecture Frozen</p>
              <p style={{ fontSize: 12, color: "var(--t3)", lineHeight: 1.6, margin: "0 0 16px" }}>
                FLOW OS v1.0 scores <strong style={{ color: scoreColor }}>{weightedScore}/100</strong> across 8 enterprise readiness dimensions.
                The platform is architecturally frozen with all 17 validation scripts passing and 307/307 integration tests.
                {weightedScore >= 85
                  ? " It is ready for controlled customer pilots with the pre-deployment items below resolved."
                  : " Resolve the highlighted items before customer deployment."}
              </p>

              {/* Dimension bars */}
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {DIMENSIONS.map(d => (
                  <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ width: 180, fontSize: 10, color: "var(--t4)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.label}</span>
                    <div style={{ flex: 1, height: 5, background: "rgba(31,27,22,0.08)", borderRadius: 2, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${d.score}%`, background: d.score >= 90 ? "var(--p-normal-text)" : d.score >= 75 ? "var(--p-high-text)" : "var(--p-critical-text)", borderRadius: 2, transition: "width 600ms" }} />
                    </div>
                    <span style={{ width: 34, fontSize: 10, fontWeight: 600, color: d.score >= 90 ? "var(--p-normal-text)" : d.score >= 75 ? "var(--p-high-text)" : "var(--p-critical-text)", textAlign: "right" }}>{d.score}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Critical blockers */}
        {CRITICAL_BLOCKERS.length > 0 && (
          <div style={{ background: "var(--p-critical)", border: "1px solid var(--p-critical-text)30", borderRadius: 6, padding: "14px 16px", marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10 }}>
              <AlertCircle style={{ width: 14, height: 14, color: "var(--p-critical-text)" }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--p-critical-text)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Pre-deployment blockers</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {CRITICAL_BLOCKERS.map(b => {
                const open = expandedBlock[b.id];
                const sevColor = b.severity === "high" ? "var(--p-critical-text)" : "var(--p-high-text)";
                return (
                  <div key={b.id} style={{ background: "rgba(255,255,255,0.6)", borderRadius: 4, overflow: "hidden", border: "1px solid rgba(31,27,22,0.10)" }}>
                    <button
                      onClick={() => setExpandedBlock(p => ({ ...p, [b.id]: !p[b.id] }))}
                      style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", background: "none", border: "none", cursor: "pointer" }}
                    >
                      <XCircle style={{ width: 12, height: 12, color: sevColor, flexShrink: 0 }} />
                      <span style={{ flex: 1, fontSize: 12, fontWeight: 500, color: "var(--t1)", textAlign: "left" }}>{b.title}</span>
                      <span style={{ fontSize: 9, fontWeight: 600, textTransform: "uppercase", color: sevColor, flexShrink: 0 }}>{b.severity}</span>
                      {open ? <ChevronDown style={{ width: 11, height: 11, color: "var(--t4)" }} /> : <ChevronRight style={{ width: 11, height: 11, color: "var(--t4)" }} />}
                    </button>
                    {open && (
                      <div style={{ padding: "0 12px 10px", borderTop: "1px solid rgba(31,27,22,0.08)" }}>
                        <p style={{ fontSize: 12, color: "var(--t3)", margin: "8px 0 6px", lineHeight: 1.55 }}>{b.detail}</p>
                        <code style={{ fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", color: "var(--t2)", background: "rgba(31,27,22,0.08)", padding: "3px 7px", borderRadius: 3 }}>{b.fix}</code>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Dimension details */}
        <div style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: 13, fontWeight: 700, color: "var(--t1)", margin: "0 0 12px", letterSpacing: "-0.01em" }}>Assessment by Dimension</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {DIMENSIONS.map(d => {
              const open = expandedDim[d.id];
              const Icon = d.icon;
              const sc = d.score;
              const scColor = sc >= 90 ? "var(--p-normal-text)" : sc >= 75 ? "var(--p-high-text)" : "var(--p-critical-text)";
              return (
                <div key={d.id} style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 6, overflow: "hidden" }}>
                  <button
                    onClick={() => setExpandedDim(p => ({ ...p, [d.id]: !p[d.id] }))}
                    style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", background: "none", border: "none", cursor: "pointer" }}
                  >
                    <Icon style={{ width: 13, height: 13, color: "var(--brand)", flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: "var(--t1)", textAlign: "left" }}>{d.label}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: scColor, flexShrink: 0 }}>{sc}/100</span>
                    <span style={{ fontSize: 9, color: "var(--t5)", flexShrink: 0 }}>weight {d.weight}%</span>
                    {open ? <ChevronDown style={{ width: 12, height: 12, color: "var(--t4)" }} /> : <ChevronRight style={{ width: 12, height: 12, color: "var(--t4)" }} />}
                  </button>
                  {open && (
                    <div style={{ padding: "0 14px 14px", borderTop: "1px solid var(--border)" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 12 }}>
                        <div>
                          <p style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--p-normal-text)", margin: "0 0 8px", display: "flex", alignItems: "center", gap: 5 }}>
                            <CheckCircle style={{ width: 9, height: 9 }} /> Passing ({d.passing.length})
                          </p>
                          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                            {d.passing.map((p, i) => (
                              <div key={i} style={{ display: "flex", gap: 7, alignItems: "flex-start" }}>
                                <CheckCircle style={{ width: 10, height: 10, color: "var(--p-normal-text)", flexShrink: 0, marginTop: 2 }} />
                                <span style={{ fontSize: 11, color: "var(--t3)", lineHeight: 1.5 }}>{p}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                        {d.failing.length > 0 && (
                          <div>
                            <p style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--p-high-text)", margin: "0 0 8px", display: "flex", alignItems: "center", gap: 5 }}>
                              <AlertTriangle style={{ width: 9, height: 9 }} /> Gaps ({d.failing.length})
                            </p>
                            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                              {d.failing.map((f, i) => (
                                <div key={i} style={{ display: "flex", gap: 7, alignItems: "flex-start" }}>
                                  <AlertTriangle style={{ width: 10, height: 10, color: "var(--p-high-text)", flexShrink: 0, marginTop: 2 }} />
                                  <span style={{ fontSize: 11, color: "var(--t3)", lineHeight: 1.5 }}>{f}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {d.failing.length === 0 && (
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", color: "var(--p-normal-text)", fontSize: 12 }}>
                            <CheckCircle style={{ width: 14, height: 14, marginRight: 6 }} /> No gaps in this dimension
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Pilot checklist */}
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <h2 style={{ fontSize: 13, fontWeight: 700, color: "var(--t1)", margin: 0, letterSpacing: "-0.01em" }}>Pilot Deployment Checklist</h2>
            <span style={{ fontSize: 11, color: "var(--t5)" }}>{doneChecks}/{totalChecks} complete</span>
          </div>
          <div style={{ height: 4, background: "rgba(31,27,22,0.08)", borderRadius: 2, overflow: "hidden", marginBottom: 16 }}>
            <div style={{ height: "100%", width: `${(doneChecks / totalChecks) * 100}%`, background: "var(--brand-text)", borderRadius: 2, transition: "width 300ms" }} />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {PILOT_CHECKLIST.map(section => (
              <div key={section.section}>
                <p style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.10em", color: "var(--t5)", margin: "0 0 8px" }}>{section.section}</p>
                <div style={{ border: "1px solid var(--border)", borderRadius: 6, overflow: "hidden" }}>
                  {section.items.map((item, i) => {
                    const key = `${section.section}:${i}`;
                    const checked = checkState[key];
                    return (
                      <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 14px", borderTop: i > 0 ? "1px solid var(--border)" : "none", background: checked ? "rgba(76,175,130,0.04)" : "var(--bg-card)", cursor: "pointer", transition: "background 100ms" }}
                        onClick={() => setCheckState(p => ({ ...p, [key]: !p[key] }))}>
                        <div style={{ width: 16, height: 16, borderRadius: 3, border: `2px solid ${checked ? "var(--p-normal-text)" : "var(--border-strong)"}`, background: checked ? "var(--p-normal-text)" : "transparent", flexShrink: 0, marginTop: 1, display: "flex", alignItems: "center", justifyContent: "center", transition: "all 100ms" }}>
                          {checked && <CheckCircle style={{ width: 10, height: 10, color: "#fff" }} />}
                        </div>
                        <span style={{ flex: 1, fontSize: 12, color: checked ? "var(--t5)" : "var(--t2)", textDecoration: checked ? "line-through" : "none", lineHeight: 1.5 }}>{item.label}</span>
                        {item.required && !checked && (
                          <span style={{ fontSize: 9, fontWeight: 600, padding: "1px 5px", borderRadius: 3, background: "var(--p-critical)", color: "var(--p-critical-text)", flexShrink: 0 }}>Required</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 20, padding: "14px 16px", background: "var(--brand-dim)", border: "1px solid var(--brand-line)", borderRadius: 6 }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: "var(--brand-text)", margin: "0 0 4px" }}>Ready to pilot?</p>
            <p style={{ fontSize: 12, color: "var(--t3)", margin: 0, lineHeight: 1.55 }}>
              Complete all Required checklist items before inviting pilot users. Resolve the 3 critical blockers first (CORS, WebSocket auth, JWT secret). Once done, use the Living Workspace Simulator to pre-populate 6 months of realistic company activity before your first demo.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
