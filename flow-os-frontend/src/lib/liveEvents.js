// The live surfaces show ONE category: real messages from real integrations and
// meaningful business events. Backend telemetry (pipeline stages, health scores,
// cognitive routing, memory decisions) is system noise and never renders.

const DENY = [
  "health", "cognitive", "routing", "trace", "query", "memory", "ingestion",
  "synthesis", "summary", "lifecycle", "connection_ack", "stage", "executed", "automation",
  "snapshot", "vector", "graph_", "replay",
  // System/plumbing events that must never reach the live panel.
  "connector", "prediction", "bus_factor", "workspace_health",
];

const ALLOW = [
  "slack", "gmail", "email", "message", "comm",
  "github", "pr_", "pull", "commit", "deploy", "merge",
  "jira", "issue", "ticket",
  "calendar", "meeting",
  "incident", "risk", "approval", "notification", "escalation", "customer",
  "intel_stored",
];

const KNOWN_SOURCES = ["slack", "gmail", "github", "jira", "calendar", "notion", "hubspot", "datadog"];

// Titles produced by internal machinery — never a real human message.
const DENY_TITLE = [
  /read via/i, /connector[_ ]?action/i, /action executed/i, /health score/i,
  /workspace health/i, /cognitive routing/i, /prediction/i, /bus_factor/i,
  /org memory/i, /\bembedding\b/i, /\bvector\b/i, /\bchunk\b/i, /\bingestion\b/i,
  /connection ack/i, /snapshot/i,
];

// Canonical plumbing event types that must NEVER reach the live panel, matched
// exactly (a "notion" source in read_via_notion would otherwise pass the fallback).
const EXACT_DENY = new Set([
  "connector_action", "health_score_updated", "action_executed",
  "cognitive_routing_complete", "connection_ack", "read_via_notion",
]);

export function isIntegrationEvent(event) {
  const type = String(event?.type || "").toLowerCase();
  const source = String(event?.data?.source || event?.payload?.source || "").toLowerCase();
  const title = String(event?.data?.text || event?.data?.title || event?.payload?.text || event?.payload?.title || "");

  // 0. Exact plumbing types are hard-blocked before any allow rule can rescue them.
  if (EXACT_DENY.has(type)) return false;
  // 1. System-noise titles are always rejected — even from a known source.
  if (title && DENY_TITLE.some((p) => p.test(title))) return false;
  // 2. Type-level deny (plumbing) wins over everything else.
  if (DENY.some((d) => type.includes(d))) return false;
  // 3. Explicit business/integration event types are allowed.
  if (ALLOW.some((a) => type.includes(a))) return true;
  // 4. Fallback: only a known integration source with real title text qualifies.
  return KNOWN_SOURCES.some((s) => source.includes(s)) && title.trim().length >= 3;
}

const SOURCE_LABELS = {
  slack: "Slack", gmail: "Gmail", github: "GitHub", jira: "Jira",
  calendar: "Calendar", notion: "Notion", hubspot: "HubSpot", datadog: "Datadog",
};

export function eventSource(event) {
  const raw = String(event?.data?.source || event?.payload?.source || "").toLowerCase();
  for (const key of Object.keys(SOURCE_LABELS)) {
    if (raw.includes(key)) return SOURCE_LABELS[key];
  }
  const type = String(event?.type || "").toLowerCase();
  if (type.includes("github") || type.includes("pr") || type.includes("commit") || type.includes("deploy")) return "GitHub";
  if (type.includes("gmail") || type.includes("email")) return "Gmail";
  if (type.includes("slack")) return "Slack";
  if (type.includes("jira") || type.includes("issue")) return "Jira";
  if (type.includes("calendar") || type.includes("meeting")) return "Calendar";
  return raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : "FLOW";
}

// Source-coded dot colors (spec: GitHub white, Slack green, Gmail blue, Jira accent)
export function sourceDotColor(sourceLabel, { critical = false } = {}) {
  if (critical) return "var(--crit)";
  switch (sourceLabel) {
    case "GitHub":   return "rgba(31,27,22,0.5)";
    case "Slack":    return "#1E7F4F";
    case "Gmail":    return "#2A5FA8";
    case "Jira":     return "var(--accent)";
    case "Calendar": return "#1E7F4F";
    default:         return "rgba(31,27,22,0.2)";
  }
}

export function eventTitle(event) {
  const d = event?.data || event?.payload || {};
  const text = d.text || d.message || d.title || d.preview;
  if (typeof text === "string" && text.trim()) return text.trim();
  return String(event?.type || "Workspace event").replace(/_/g, " ").toLowerCase();
}

export function isCriticalEvent(event) {
  const type = String(event?.type || "").toLowerCase();
  return type.includes("incident") || type.includes("critical") || type.includes("risk");
}
