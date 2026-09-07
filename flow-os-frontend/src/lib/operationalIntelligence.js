/**
 * Operational Intelligence Engine
 * Pulls from every available backend source in parallel, then derives
 * risks, trends, predictions, and opportunities client-side.
 * Never invents data — every output must cite its evidence.
 */

// ─── Helpers ─────────────────────────────────────────────────────────────────
function ah(token, workspaceId) {
  return { Authorization: `Bearer ${token}`, "workspace-id": workspaceId, "Content-Type": "application/json" };
}
async function sf(url, opts = {}) {
  try { const r = await fetch(url, opts); return r.ok ? r.json() : null; }
  catch { return null; }
}

// ─── Confidence label from numeric probability ────────────────────────────────
function confLabel(v) {
  if (v == null) return "LOW";
  if (typeof v === "string") return v.toUpperCase().includes("HIGH") ? "HIGH" : v.toUpperCase().includes("MEDIUM") ? "MEDIUM" : "LOW";
  if (v >= 0.7 || v >= 70) return "HIGH";
  if (v >= 0.4 || v >= 40) return "MEDIUM";
  return "LOW";
}

// ─── Risk Detection ───────────────────────────────────────────────────────────
function detectRisks(snap, cos, health, audit, approvals) {
  const risks = [];

  // 1. Approval backlog
  const pendingList = approvals?.approvals || approvals?.data || [];
  if (pendingList.length >= 3) {
    risks.push({
      id: "risk-approvals",
      type: "RISK",
      category: "Operations",
      severity: pendingList.length >= 5 ? "HIGH" : "MEDIUM",
      title: `${pendingList.length} approvals waiting`,
      summary: "Approval backlog is forming. Blocked actions slow the team and increase delivery risk.",
      evidence: [
        `${pendingList.length} actions awaiting approval`,
        "Each pending approval blocks at least one workflow",
        "Source: approval queue",
      ],
      suggestedAction: "Review and resolve pending approvals",
      sources: ["approvals"],
      actionRoute: "/chief",
    });
  }

  // 2. Unhealthy connectors
  const connList = health?.connectors || health?.data || [];
  const unhealthy = connList.filter(c =>
    ["ERROR", "EXPIRED", "DEGRADED"].includes((c.health || c.status || "").toUpperCase())
  );
  if (unhealthy.length > 0) {
    const expired = unhealthy.some(c => (c.health || c.status || "").toUpperCase() === "EXPIRED");
    risks.push({
      id: "risk-connectors",
      type: "RISK",
      category: "Security",
      severity: expired ? "HIGH" : "MEDIUM",
      title: `${unhealthy.length} connector${unhealthy.length > 1 ? "s" : ""} ${expired ? "expired" : "degraded"}`,
      summary: "Unhealthy connectors create intelligence blind spots — FLOW may be missing signals.",
      evidence: [
        `${unhealthy.map(c => c.id || c.connector || "unknown").join(", ")} reporting ${expired ? "expired credentials" : "degraded health"}`,
        "Missing connector data reduces prediction accuracy",
        "Source: connector health check",
      ],
      suggestedAction: "Reconnect or refresh credentials in Trust Center",
      sources: ["connectors"],
      actionRoute: "/integrations",
    });
  }

  // 3. (removed) "Permission denial rate" — this was a self-referential insight
  // about FLOW's own access that alarmed users without helping them. It is not a
  // real business risk, so it is no longer surfaced.

  // 4. Engineering domain at risk
  const engDomain = snap?.domains?.engineering;
  if (engDomain?.status === "at_risk") {
    risks.push({
      id: "risk-engineering",
      type: "RISK",
      category: "Engineering",
      severity: "HIGH",
      title: "Engineering health at risk",
      summary: engDomain.topRisks?.[0] || "Engineering signals indicate a problem requiring immediate attention.",
      evidence: [
        ...(engDomain.topRisks || []).slice(0, 2).map(String),
        "Source: GitHub + FLOW workspace snapshot",
      ].filter(Boolean),
      suggestedAction: "Review blocked PRs and open incidents",
      sources: ["github", "workspace"],
      actionRoute: "/projects",
    });
  }

  // 5. Customer signals
  const salesDomain = snap?.domains?.sales;
  if (salesDomain?.status === "at_risk" || salesDomain?.status === "watch") {
    risks.push({
      id: "risk-customers",
      type: "RISK",
      category: "Customers",
      severity: salesDomain.status === "at_risk" ? "HIGH" : "MEDIUM",
      title: "Customer account needs attention",
      summary: salesDomain.topRisks?.[0] || "Customer signals detected — follow-up required today.",
      evidence: [
        ...(salesDomain.topRisks || []).slice(0, 2).map(String),
        "Source: Gmail + FLOW customer intelligence",
      ].filter(Boolean),
      suggestedAction: "Follow up with at-risk customer accounts",
      sources: ["gmail", "workspace"],
      actionRoute: "/customers",
    });
  }

  // 6. Execution failures from CoS
  const cosItems = cos?.topItems || cos?.now || [];
  const failedItems = cosItems.filter(i => (i.type || "").toLowerCase().includes("fail"));
  if (failedItems.length > 0) {
    risks.push({
      id: "risk-execution-failures",
      type: "RISK",
      category: "Operations",
      severity: "MEDIUM",
      title: `${failedItems.length} execution${failedItems.length > 1 ? "s" : ""} failed`,
      summary: "Failed actions may leave work incomplete or workflows stuck.",
      evidence: [
        failedItems[0]?.title || "Failed execution detected",
        "Failed actions need manual review or retry",
        "Source: Chief of Staff queue",
      ],
      suggestedAction: "Review and retry failed actions",
      sources: ["chief-of-staff"],
      actionRoute: "/chief",
    });
  }

  // 7. Silent security domain
  const secDomain = snap?.domains?.security;
  if (secDomain?.status === "at_risk") {
    risks.push({
      id: "risk-security",
      type: "RISK",
      category: "Security",
      severity: "HIGH",
      title: "Security signals detected",
      summary: secDomain.topRisks?.[0] || "Security domain requires attention.",
      evidence: [
        ...(secDomain.topRisks || []).slice(0, 2).map(String),
        "Source: FLOW security monitoring",
      ].filter(Boolean),
      suggestedAction: "Review security dashboard",
      sources: ["workspace"],
      actionRoute: "/settings/security",
    });
  }

  return risks;
}

// ─── Trend Detection ──────────────────────────────────────────────────────────
function detectTrends(weekly, cos, preds) {
  const trends = [];

  // 1. Execution success rate
  const execRate = weekly?.executionSuccessRate?.rate;
  if (execRate != null) {
    trends.push({
      id: "trend-execution",
      type: "TREND",
      category: "Operations",
      direction: execRate >= 85 ? "UP" : execRate >= 70 ? "STABLE" : "DOWN",
      title: `Execution success: ${execRate}%`,
      summary: execRate >= 85
        ? "Team execution is above baseline — FLOW is helping more than it is blocking."
        : execRate >= 70
        ? "Execution rate is on track. Governance is working."
        : "Execution rate is below baseline. Review failed actions for common patterns.",
      evidence: [
        `${weekly.executionSuccessRate?.executed || 0} succeeded, ${weekly.executionSuccessRate?.failed || 0} failed`,
        `Total actions this week: ${weekly.executionSuccessRate?.total || 0}`,
        "Source: execution audit log",
      ],
      suggestedAction: execRate < 70 ? "Review failed executions and resolve permission gaps" : null,
      sources: ["audit"],
      actionRoute: "/review",
    });
  }

  // 2. Engineering velocity
  const prsMerged = weekly?.engineeringVelocity?.prsMerged;
  const deploys = weekly?.engineeringVelocity?.deploymentsCompleted;
  if (prsMerged != null) {
    const dir = prsMerged >= 6 ? "UP" : prsMerged >= 2 ? "STABLE" : "DOWN";
    trends.push({
      id: "trend-velocity",
      type: "TREND",
      category: "Engineering",
      direction: dir,
      title: `Engineering velocity: ${prsMerged} PRs merged`,
      summary: dir === "UP"
        ? "Strong PR throughput this week. Team is shipping."
        : dir === "DOWN"
        ? "PR throughput is low. Check for review bottlenecks or blocked work."
        : "Steady engineering cadence maintained.",
      evidence: [
        `${prsMerged} pull requests merged this week`,
        `${deploys || 0} deployments completed`,
        "Source: GitHub integration",
      ],
      suggestedAction: dir === "DOWN" ? "Review aged PRs and unblock the review queue" : null,
      sources: ["github"],
      actionRoute: "/projects",
    });
  }

  // 3. Prediction-driven trends (from backend engine output)
  const predList = preds?.predictions || preds?.data || [];
  predList
    .filter(p => p.trend && p.domain)
    .slice(0, 2)
    .forEach((p, i) => {
      const dir = (p.trend || "").toLowerCase().includes("falling") || (p.trend || "").toLowerCase().includes("decreas") ? "DOWN"
        : (p.trend || "").toLowerCase().includes("rising") || (p.trend || "").toLowerCase().includes("increas") ? "UP"
        : "STABLE";
      trends.push({
        id: `trend-pred-${i}`,
        type: "TREND",
        category: p.domain || "Operations",
        direction: dir,
        title: p.prediction || p.name || "Workspace trend",
        summary: p.summary || p.description || `Trend is ${p.trend || "stable"}.`,
        evidence: (p.evidence || p.drivers || []).slice(0, 3).map(String),
        suggestedAction: p.preventiveActions?.[0] || null,
        sources: p.sources || ["predictions"],
        actionRoute: null,
      });
    });

  return trends;
}

// ─── Prediction Formatting ────────────────────────────────────────────────────
function formatPredictions(preds) {
  const predList = preds?.predictions || preds?.data || [];
  return predList.slice(0, 6).map((pred, i) => ({
    id: `pred-${i}`,
    type: "PREDICTION",
    category: pred.domain || pred.category || "Operations",
    confidence: confLabel(pred.confidence ?? pred.probability),
    title: pred.prediction || pred.name || "Workspace prediction",
    summary: pred.evidence?.[0] || pred.summary || pred.reasoning || "Based on current workspace patterns.",
    evidence: (pred.evidence || pred.drivers || []).slice(0, 3).map(String),
    suggestedAction: (pred.preventiveActions || [])[0] || pred.recommendation || null,
    sources: pred.sources || ["predictions"],
    actionRoute: null,
  })).filter(p => p.title !== "Workspace prediction" || p.evidence.length > 0);
}

// ─── Opportunity Detection ────────────────────────────────────────────────────
function detectOpportunities(snap, cos, weekly) {
  const opps = [];
  const execRate = weekly?.executionSuccessRate?.rate;
  const prsMerged = weekly?.engineeringVelocity?.prsMerged;

  if (execRate != null && execRate >= 85) {
    opps.push({
      id: "opp-execution",
      type: "OPPORTUNITY",
      category: "Operations",
      title: "Strong execution week",
      summary: `${execRate}% execution success rate — above the 75% baseline. Team is in high-performance mode.`,
      evidence: [
        `${execRate}% vs 75% baseline`,
        `${weekly.executionSuccessRate?.executed || 0} actions completed this week`,
        "Source: execution audit log",
      ],
      suggestedAction: "Share the weekly execution report with stakeholders",
      sources: ["audit"],
      actionRoute: "/review",
    });
  }

  if (prsMerged != null && prsMerged >= 6) {
    opps.push({
      id: "opp-velocity",
      type: "OPPORTUNITY",
      category: "Engineering",
      title: "Engineering team is shipping fast",
      summary: `${prsMerged} PRs merged this week. Momentum is high — consider moving up a deadline.`,
      evidence: [
        `${prsMerged} pull requests merged`,
        `${weekly?.engineeringVelocity?.deploymentsCompleted || 0} deployments completed`,
        "Source: GitHub",
      ],
      suggestedAction: "Consider accelerating the next milestone",
      sources: ["github"],
      actionRoute: "/projects",
    });
  }

  const engDomain = snap?.domains?.engineering;
  if (engDomain?.status === "healthy" && !opps.some(o => o.id === "opp-velocity")) {
    opps.push({
      id: "opp-eng-healthy",
      type: "OPPORTUNITY",
      category: "Engineering",
      title: "Engineering is healthy",
      summary: "No blockers detected. Good time to ship or review backlog.",
      evidence: [
        "Engineering domain status: healthy",
        ...(engDomain.recentActivity || []).slice(0, 1).map(a => a.title || String(a)),
        "Source: workspace snapshot",
      ].filter(Boolean),
      suggestedAction: "Review the sprint backlog for items to accelerate",
      sources: ["workspace"],
      actionRoute: "/projects",
    });
  }

  return opps;
}

// ─── Telemetry ────────────────────────────────────────────────────────────────
export function trackIntelligence(event, props = {}, token, workspaceId) {
  if (!token || !workspaceId) return;
  fetch("/api/analytics/event", {
    method: "POST",
    headers: ah(token, workspaceId),
    body: JSON.stringify({ event, properties: { ...props, source: "operational_intelligence" } }),
  }).catch(() => {});
}

// ─── Main entry point ─────────────────────────────────────────────────────────
export async function fetchOperationalIntelligence(token, workspaceId) {
  const h = ah(token, workspaceId);

  // Parallel cross-connector data pull
  const [snap, cos, weekly, preds, health, approvals, audit] = await Promise.all([
    sf("/api/workspace/snapshot", { headers: h }),
    sf("/api/autonomous/chief-of-staff", { headers: h }),
    sf("/api/autonomous/weekly-review?days=7", { headers: h }),
    sf("/api/predictions/run", { method: "POST", headers: h, body: JSON.stringify({}) }),
    sf("/api/connectors/health", { headers: h }),
    sf("/api/approvals", { headers: h }),
    sf("/api/connectors/audit?limit=50", { headers: h }),
  ]);

  const risks         = detectRisks(snap, cos, health, audit, approvals);
  const trends        = detectTrends(weekly, cos, preds);
  const predictions   = formatPredictions(preds);
  const opportunities = detectOpportunities(snap, cos, weekly);

  const summary = {
    riskCount:        risks.length,
    criticalCount:    risks.filter(r => r.severity === "HIGH").length,
    opportunityCount: opportunities.length,
    trendCount:       trends.length,
    predictionCount:  predictions.length,
    totalInsights:    risks.length + trends.length + predictions.length + opportunities.length,
  };

  const sources = [
    snap        && "workspace",
    cos         && "chief-of-staff",
    weekly      && "weekly-review",
    preds       && "predictions",
    health      && "connectors",
    approvals   && "approvals",
    audit       && "audit",
  ].filter(Boolean);

  return {
    risks,
    trends,
    predictions,
    opportunities,
    summary,
    sources: [...new Set(sources)],
  };
}
