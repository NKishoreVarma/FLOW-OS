/**
 * Release Notes (Program 7)
 *
 * Version history, what's new, upcoming features, and maintenance schedule.
 * All content is static / in-code — no backend needed.
 */

import { useState } from "react";
import { Tag, Star, ArrowRight, ChevronDown, ChevronRight, Calendar, AlertCircle, CheckCircle, Clock, Zap, Package } from "lucide-react";

const RELEASES = [
  {
    version: "1.0.0",
    date: "2026-07-21",
    label: "stable",
    headline: "FLOW OS v1.0 — Architecture Frozen",
    summary: "The complete enterprise intelligence operating system is declared architecturally frozen. 17 validation scripts passing, 307 integration tests passing, Docker deployment ready.",
    highlights: [
      { type: "new",    text: "Autonomous Operations (Phase 19) — Chief of Staff, Weekly Review, Action Cards, NL workflow bridge" },
      { type: "new",    text: "Architecture documentation — 12-file handbook in docs/ARCHITECTURE/" },
      { type: "fix",    text: "WebSocket authentication required in production (WS_AUTH_REQUIRED=true)" },
      { type: "fix",    text: "Frontend now uses design tokens throughout — no raw hex values in components" },
      { type: "change", text: "BaseAdapter fixed to handle read-only getter subclasses (SlackAdapter boot crash resolved)" },
    ],
    breaking: [],
  },
  {
    version: "0.19.0",
    date: "2026-07-17",
    label: "release",
    headline: "Autonomous Operations",
    summary: "FLOW can now help you finish work, not just tell you what's happening. Chief of Staff surfaces top-5 NOW actions with one-click execution. Weekly Review provides engineering velocity metrics. NL intent bridge detects actionable questions and presents executable action cards.",
    highlights: [
      { type: "new",    text: "Chief of Staff view (/chief) — top-5 prioritized actions with execution" },
      { type: "new",    text: "Weekly Review (/review) — engineering velocity, execution success rate, open risks" },
      { type: "new",    text: "ActionCard.jsx — multi-option, risk-badged, inline-executable actions" },
      { type: "new",    text: "NL bridge in copilot — detects actionable intent and adds executable plan" },
      { type: "new",    text: "FLOW Efficiency Metrics — tracks action.accepted / dismissed / workflow.started / completed" },
    ],
    breaking: [],
  },
  {
    version: "0.17.0",
    date: "2026-07-16",
    label: "release",
    headline: "Pilot Experience Platform",
    summary: "FLOW transitions from platform to product. Complete first-run onboarding flow, hybrid success ROI dashboard, team invite, and trust surface. Built for the first paying customer pilot.",
    highlights: [
      { type: "new",    text: "First-run wizard (/welcome) — 5-step: Welcome → Discover → Permissions → Build → Ready" },
      { type: "new",    text: "Success Dashboard (/success) — hybrid measured/estimated ROI with basis badges" },
      { type: "new",    text: "Team invite (/settings/team) — per-role invite with honest temp-password approach" },
      { type: "new",    text: "TrustBar — reusable connector health strip visible on all key pages" },
      { type: "new",    text: "Adoption metrics API — time-to-value, work-in-FLOW, connector discovery" },
    ],
    breaking: [],
  },
  {
    version: "0.16.1",
    date: "2026-07-15",
    label: "release",
    headline: "Workspace Intelligence Cache",
    summary: "Morning Briefing now loads in ~5ms from a pre-built workspace snapshot instead of triggering ~90s AI calls on page load. Cache rebuilds debounced on event bus signals and every 5 minutes.",
    highlights: [
      { type: "new",    text: "src/workspaceCache/ — snapshot builder, Redis store, refresh coordinator" },
      { type: "new",    text: "/api/workspace/* — instant snapshot, health, summary, actions endpoints" },
      { type: "change", text: "Morning Briefing now reads from cache, not Executive Council" },
      { type: "perf",   text: "WIC read latency: ~5ms warm, ~27ms cold (was ~90s)" },
    ],
    breaking: [],
  },
  {
    version: "0.15.0",
    date: "2026-07-14",
    label: "release",
    headline: "Multi-Agent Executive Council",
    summary: "Six specialized AI executives (Engineering, Operations, Sales, HR, Security, Finance) analyze questions from their domain, debate, preserve minority opinions, and synthesize one answer.",
    highlights: [
      { type: "new",    text: "src/council/ — 6 domain COO agents, router, debate engine, council synthesizer" },
      { type: "new",    text: "/api/council/* — ask, dashboard, agents, agent/:id" },
      { type: "new",    text: "/council page — health cards, Ask box, debate panel" },
      { type: "perf",   text: "Agents run in parallel with fault isolation and 60s timeout per agent" },
    ],
    breaking: [],
  },
  {
    version: "0.14.0",
    date: "2026-07-14",
    label: "release",
    headline: "Operational Execution Engine",
    summary: "FLOW can now safely coordinate and execute real work — governed, risk-tiered, auditable. Four risk levels (LOW/MEDIUM/HIGH/CRITICAL) with 1–2 approver requirements.",
    highlights: [
      { type: "new",    text: "src/execution/ — risk classifier, approval engine, action planner, execution coordinator" },
      { type: "new",    text: "src/notifications/ — notification targeting, dedup, WebSocket push" },
      { type: "new",    text: "src/collaboration/ — merge conflict detection, ownership analysis, stale PR detection" },
      { type: "new",    text: "ExecutableActionCard.jsx — risk badge, CONFIRM/APPROVAL states, honest plan" },
      { type: "new",    text: "MergeConflictCard.jsx — files, owners, Open Diff/PR/Message/Create Meeting" },
    ],
    breaking: [],
  },
  {
    version: "0.12.0",
    date: "2026-07-11",
    label: "release",
    headline: "Production Hardening",
    summary: "No new AI features. Docker deployment, graceful shutdown, security audit (HIGH-1 WebSocket auth fixed), observability platform, structured logging with secret redaction, performance benchmarks.",
    highlights: [
      { type: "fix",    text: "SECURITY HIGH-1: WebSocket connections now require JWT authentication" },
      { type: "new",    text: "Docker multi-stage build with non-root user and healthcheck" },
      { type: "new",    text: "Graceful shutdown — SIGTERM drains HTTP → workers → pg → redis in 15s" },
      { type: "new",    text: "/api/metrics — aggregated platform metrics with RBAC auth" },
      { type: "new",    text: "Structured logging with recursive secret redaction" },
      { type: "fix",    text: "BaseAdapter boot crash under strict ESM (SlackAdapter read-only getter)" },
    ],
    breaking: [
      "WS_AUTH_REQUIRED=true required in production — unauthenticated WebSocket connections are now rejected",
    ],
  },
];

const UPCOMING = [
  { label: "Slack adapter (full read/write)",                   when: "v1.1",    priority: "high"   },
  { label: "Outlook / Exchange email adapter",                  when: "v1.1",    priority: "high"   },
  { label: "Multi-tenant daily summary cron (TD-09)",           when: "v1.1",    priority: "medium" },
  { label: "Per-workspace privacy threshold configuration",     when: "v1.2",    priority: "medium" },
  { label: "Policy versioning and audit (Sprint 5.3-C)",        when: "v1.2",    priority: "medium" },
  { label: "SAML / SSO authentication",                         when: "v1.3",    priority: "medium" },
  { label: "Multi-stage approval chains",                       when: "v1.2",    priority: "low"    },
  { label: "Persistent in-memory stores (TD-01 resolution)",    when: "v2.0",    priority: "high"   },
  { label: "Redis-backed cross-instance rate limiting",         when: "v1.2",    priority: "medium" },
];

const LABEL_STYLE = {
  stable:  { c: "var(--p-normal-text)", b: "var(--p-normal)" },
  release: { c: "var(--p-info-text)", b: "rgba(96,165,250,0.10)" },
  beta:    { c: "var(--p-high-text)", b: "var(--p-high)" },
  rc:      { c: "var(--t3)", b: "rgba(31,27,22,0.08)" },
};

const TYPE_ICON = {
  new:    { icon: Star,         color: "var(--brand-text)" },
  fix:    { icon: CheckCircle,  color: "var(--p-normal-text)" },
  change: { icon: ArrowRight,   color: "var(--p-info-text)" },
  perf:   { icon: Zap,          color: "var(--p-high-text)" },
  break:  { icon: AlertCircle,  color: "var(--p-critical-text)" },
};

const PRIORITY_COLOR = {
  high:   "var(--p-critical-text)",
  medium: "var(--p-high-text)",
  low:    "var(--p-normal-text)",
};

export default function ReleaseNotes() {
  const [expanded, setExpanded] = useState({ "1.0.0": true });
  const [tab, setTab] = useState("history");

  const TABS = [
    { id: "history",  label: "Version History" },
    { id: "upcoming", label: "Upcoming" },
    { id: "maintenance", label: "Maintenance" },
  ];

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "18px 24px 0", borderBottom: "1px solid var(--border)", background: "var(--bg-sidebar)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <Tag style={{ width: 15, height: 15, color: "var(--brand)" }} />
          <h1 style={{ fontSize: 16, fontWeight: 600, color: "var(--t1)", letterSpacing: "-0.3px", margin: 0 }}>Release Notes</h1>
          <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 7px", borderRadius: 3, background: "var(--p-normal)", color: "var(--p-normal-text)" }}>v1.0.0 stable</span>
        </div>
        <p style={{ fontSize: 12, color: "var(--t4)", margin: "0 0 14px" }}>Version history, upcoming features, and maintenance schedule.</p>
        <div style={{ display: "flex", gap: 2 }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              padding: "5px 12px", fontSize: 11, fontWeight: tab === t.id ? 600 : 400,
              borderRadius: "4px 4px 0 0", border: "none", cursor: "pointer",
              background: tab === t.id ? "var(--bg-base)" : "transparent",
              color: tab === t.id ? "var(--t1)" : "var(--t4)",
              borderBottom: tab === t.id ? "2px solid var(--brand)" : "2px solid transparent",
            }}>{t.label}</button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "24px" }}>

        {tab === "history" && (
          <div style={{ maxWidth: 740, display: "flex", flexDirection: "column", gap: 10 }}>
            {RELEASES.map(rel => {
              const open = expanded[rel.version];
              const labelStyle = LABEL_STYLE[rel.label] || LABEL_STYLE.release;
              return (
                <div key={rel.version} style={{ background: "var(--bg-card)", border: `1px solid ${rel.label === "stable" ? "var(--border-strong)" : "var(--border)"}`, borderRadius: 6, overflow: "hidden" }}>
                  <button
                    onClick={() => setExpanded(p => ({ ...p, [rel.version]: !p[rel.version] }))}
                    style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
                  >
                    <Package style={{ width: 14, height: 14, color: "var(--brand)", flexShrink: 0 }} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: "var(--t1)", flex: 1 }}>
                      v{rel.version} — {rel.headline}
                    </span>
                    <span style={{ fontSize: 9, fontWeight: 600, padding: "2px 7px", borderRadius: 3, color: labelStyle.c, background: labelStyle.b, flexShrink: 0, textTransform: "uppercase" }}>{rel.label}</span>
                    <span style={{ fontSize: 10, color: "var(--t5)", flexShrink: 0 }}>{rel.date}</span>
                    {open ? <ChevronDown style={{ width: 12, height: 12, color: "var(--t4)", flexShrink: 0 }} /> : <ChevronRight style={{ width: 12, height: 12, color: "var(--t4)", flexShrink: 0 }} />}
                  </button>
                  {open && (
                    <div style={{ padding: "0 16px 16px", borderTop: "1px solid var(--border)" }}>
                      <p style={{ fontSize: 12, color: "var(--t3)", lineHeight: 1.65, margin: "12px 0 14px" }}>{rel.summary}</p>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: rel.breaking.length > 0 ? 14 : 0 }}>
                        {rel.highlights.map((h, i) => {
                          const { icon: Icon, color } = TYPE_ICON[h.type] || TYPE_ICON.new;
                          return (
                            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                              <Icon style={{ width: 12, height: 12, color, marginTop: 2, flexShrink: 0 }} />
                              <span style={{ fontSize: 12, color: "var(--t2)", lineHeight: 1.55 }}>{h.text}</span>
                            </div>
                          );
                        })}
                      </div>
                      {rel.breaking.length > 0 && (
                        <div style={{ background: "var(--p-critical)", border: "1px solid var(--p-critical-text)30", borderRadius: 4, padding: "10px 12px" }}>
                          <p style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--p-critical-text)", margin: "0 0 6px", display: "flex", alignItems: "center", gap: 5 }}>
                            <AlertCircle style={{ width: 10, height: 10 }} /> Breaking changes
                          </p>
                          {rel.breaking.map((b, i) => (
                            <p key={i} style={{ fontSize: 12, color: "var(--p-critical-text)", margin: 0, lineHeight: 1.55 }}>{b}</p>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {tab === "upcoming" && (
          <div style={{ maxWidth: 640 }}>
            <p style={{ fontSize: 12, color: "var(--t4)", marginBottom: 18, lineHeight: 1.55 }}>
              Planned features and improvements. Dates are targets, not commitments. High-priority items with technical debt resolution are most likely to ship on schedule.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {UPCOMING.map((item, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 5 }}>
                  <Clock style={{ width: 12, height: 12, color: "var(--t5)", flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: "var(--t2)", flex: 1 }}>{item.label}</span>
                  <span style={{ fontSize: 10, fontWeight: 500, color: PRIORITY_COLOR[item.priority], background: "rgba(31,27,22,0.04)", padding: "2px 7px", borderRadius: 3, flexShrink: 0 }}>{item.priority}</span>
                  <span style={{ fontSize: 10, color: "var(--t5)", fontFamily: "'IBM Plex Mono', monospace", flexShrink: 0 }}>{item.when}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "maintenance" && (
          <div style={{ maxWidth: 580 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {[
                {
                  icon: CheckCircle, color: "var(--p-normal-text)",
                  title: "No scheduled maintenance",
                  body: "There are no planned maintenance windows at this time. FLOW uses zero-downtime deployments via Docker + graceful shutdown — pod replacements drain existing connections before terminating.",
                },
                {
                  icon: Calendar, color: "var(--p-info-text)",
                  title: "Daily rolling summary",
                  body: "The daily summary worker runs at midnight UTC. During this window, the rolling summary endpoint may be temporarily unavailable (~30 seconds). All other services remain unaffected.",
                },
                {
                  icon: AlertCircle, color: "var(--p-high-text)",
                  title: "Planned: PostgreSQL pgvector upgrade",
                  body: "pgvector 0.8.0 will require a column rebuild for workspaces with >100k vectors. When scheduled, a maintenance window of 2–4 hours will be announced 7 days in advance.",
                },
                {
                  icon: Zap, color: "var(--brand-text)",
                  title: "Incident history",
                  body: "No incidents recorded in FLOW v1.0. All validation scripts pass, integration tests pass. The Living Workspace Simulator can be used to test incident response flows before a real event.",
                },
              ].map((item, i) => (
                <div key={i} style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 6, padding: "14px 16px", display: "flex", gap: 12 }}>
                  <item.icon style={{ width: 15, height: 15, color: item.color, flexShrink: 0, marginTop: 2 }} />
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 500, color: "var(--t1)", margin: "0 0 5px" }}>{item.title}</p>
                    <p style={{ fontSize: 12, color: "var(--t3)", lineHeight: 1.6, margin: 0 }}>{item.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
