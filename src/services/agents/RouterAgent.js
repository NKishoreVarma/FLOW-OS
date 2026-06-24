/**
 * FLOW OS — Router Agent
 *
 * First stage of the Multi-Agent Reasoning pipeline.
 * Analyses the raw query text and produces a `domainWeights` map that
 * downstream agents use to prioritise context nodes by subject area.
 *
 * Domain taxonomy:
 *   engineering    — code, infra, deploys, schema changes
 *   security       — incidents, credentials, vulnerabilities
 *   product        — features, releases, roadmap, timelines
 *   finance        — budgets, costs, revenue, payroll
 *   people         — HR, hiring, org changes, performance
 *   operations     — logistics, SLAs, on-call, outages
 *   general        — catch-all for mixed or ambiguous queries
 *
 * Output shape:
 *   {
 *     primaryDomain:  string,       // highest-weighted domain
 *     domainWeights:  Object,       // { [domain]: 0.0–1.0 }
 *     intentFlags: {
 *       isUrgent:     boolean,      // query contains urgency signals
 *       isComparison: boolean,      // query asks to compare/contrast
 *       isTimeBound:  boolean,      // query references a time window
 *     },
 *     routingScore:   number,       // 0.0–1.0 confidence in primary domain
 *   }
 */

// ── Domain keyword dictionaries ──────────────────────────────────────────────

const DOMAIN_KEYWORDS = {
  engineering: [
    'api', 'backend', 'frontend', 'schema', 'database', 'deploy', 'deployment',
    'code', 'commit', 'git', 'grpc', 'rest', 'endpoint', 'service', 'microservice',
    'docker', 'kubernetes', 'ci', 'cd', 'pipeline', 'migrate', 'migration',
    'index', 'vector', 'cache', 'redis', 'queue', 'worker', 'infra', 'infrastructure',
    'bug', 'fix', 'refactor', 'test', 'unit test', 'integration', 'node', 'server',
    'port', 'socket', 'websocket', 'authentication', 'authorization', 'token',
  ],
  security: [
    'security', 'vulnerability', 'breach', 'compromised', 'credential', 'password',
    'secret', 'leak', 'exploit', 'cve', 'pen test', 'audit', 'compliance',
    'encryption', 'tls', 'ssl', 'firewall', 'access control', 'zero trust',
    'incident', 'on-call', 'sev', 'p0', 'p1', 'soc2', 'gdpr',
  ],
  product: [
    'release', 'feature', 'roadmap', 'sprint', 'milestone', 'launch', 'ship',
    'product', 'user story', 'ux', 'design', 'prototype', 'feedback', 'a/b test',
    'kpi', 'metric', 'conversion', 'retention', 'onboarding', 'demo', 'mvp',
    'changelog', 'version', 'v1', 'v2', 'deadline', 'delay', 'eta',
  ],
  finance: [
    'budget', 'cost', 'revenue', 'profit', 'loss', 'invoice', 'billing',
    'expense', 'vendor', 'contract', 'sow', 'procurement', 'spend',
    'forecast', 'quarter', 'q1', 'q2', 'q3', 'q4', 'annual', 'fiscal',
    'payroll', 'compensation', 'salary', 'equity', 'stock',
  ],
  people: [
    'hire', 'hiring', 'interview', 'onboard', 'offboard', 'resign', 'resign',
    'performance', 'review', 'promotion', 'org chart', 'team', 'headcount',
    'hr', 'human resources', 'culture', 'diversity', 'pip', 'feedback',
  ],
  operations: [
    'outage', 'downtime', 'sla', 'uptime', 'monitoring', 'alert', 'pagerduty',
    'runbook', 'postmortem', 'incident', 'escalation', 'rotation', 'schedule',
    'logistics', 'vendor', 'support', 'ticket', 'jira', 'servicenow',
  ],
};

const URGENCY_SIGNALS = [
  'urgent', 'asap', 'critical', 'outage', 'broken', 'down', 'blocked', 'emergency',
  'blocker', 'p0', 'p1', 'sev0', 'sev1', 'immediately', 'right now', 'ASAP',
];

const COMPARISON_SIGNALS = [
  'versus', 'vs', 'compare', 'difference', 'better', 'worse', 'pros', 'cons',
  'alternative', 'instead', 'over', 'prefer', 'which',
];

const TIME_SIGNALS = [
  'today', 'yesterday', 'this week', 'last week', 'this month', 'last month',
  'recently', 'latest', 'current', 'now', 'ago', 'since', 'until', 'deadline',
  'when', 'schedule', 'timeline', 'eta',
];

// ── Scoring ───────────────────────────────────────────────────────────────────

/**
 * Counts keyword hits for one domain in the query string.
 * @param {string} lowerQuery
 * @param {string[]} keywords
 * @returns {number}
 */
function hitCount(lowerQuery, keywords) {
  return keywords.filter(kw => lowerQuery.includes(kw)).length;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Analyses query intent and returns domain weights + intent flags.
 *
 * @param {string} queryText  — The raw user query string
 * @returns {{
 *   primaryDomain:  string,
 *   domainWeights:  Record<string, number>,
 *   intentFlags:    { isUrgent: boolean, isComparison: boolean, isTimeBound: boolean },
 *   routingScore:   number
 * }}
 */
export function routeQuery(queryText) {
  if (!queryText || typeof queryText !== 'string') {
    return {
      primaryDomain: 'general',
      domainWeights: { general: 1.0 },
      intentFlags:   { isUrgent: false, isComparison: false, isTimeBound: false },
      routingScore:  0.0,
    };
  }

  const q = queryText.toLowerCase();

  // ── Domain scoring ────────────────────────────────────────────────────────
  const rawScores = {};
  let totalHits = 0;

  for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
    const hits = hitCount(q, keywords);
    rawScores[domain] = hits;
    totalHits += hits;
  }

  // Normalise to 0.0–1.0; fall back to `general` if nothing matched
  const domainWeights = {};
  let primaryDomain = 'general';
  let primaryScore  = 0;

  if (totalHits === 0) {
    domainWeights.general = 1.0;
  } else {
    for (const [domain, hits] of Object.entries(rawScores)) {
      const weight = parseFloat((hits / totalHits).toFixed(4));
      domainWeights[domain] = weight;
      if (weight > primaryScore) {
        primaryScore  = weight;
        primaryDomain = domain;
      }
    }
  }

  // ── Intent flags ──────────────────────────────────────────────────────────
  const intentFlags = {
    isUrgent:     URGENCY_SIGNALS.some(s => q.includes(s)),
    isComparison: COMPARISON_SIGNALS.some(s => q.includes(s)),
    isTimeBound:  TIME_SIGNALS.some(s => q.includes(s)),
  };

  const routingScore = totalHits === 0 ? 0.0 : Math.min(primaryScore * 1.5, 1.0);

  console.log(
    `🗺️  [RouterAgent] Primary domain: ${primaryDomain} (${(primaryScore * 100).toFixed(0)}%) ` +
    `| Urgent: ${intentFlags.isUrgent} | Comparison: ${intentFlags.isComparison} ` +
    `| TimeBound: ${intentFlags.isTimeBound}`
  );

  return { primaryDomain, domainWeights, intentFlags, routingScore };
}
