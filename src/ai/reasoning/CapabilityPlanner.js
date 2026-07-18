/**
 * CapabilityPlanner — maps a user question to the FLOW capabilities that can answer it.
 *
 * FLOW never goes directly to an LLM. First it determines:
 *   1. Which FLOW capabilities own this data?
 *   2. Which connectors are required?
 *   3. Which memory types are relevant?
 *   4. Which graph node types to query?
 *
 * Returns a CapabilityPlan: ordered list of required capabilities with params.
 */

export const Capability = Object.freeze({
  ENGINEERING:      'engineering',    // PRs, commits, deployments, repos, issues
  MEETINGS:         'meetings',       // Calendar events, meeting intel
  CUSTOMERS:        'customers',      // Customer accounts, CRM, deals
  INCIDENTS:        'incidents',      // Active incidents, risk signals
  KNOWLEDGE:        'knowledge',      // Documents, wikis, policies
  COMMUNICATIONS:   'communications', // Emails, threads, messages
  TIMELINE:         'timeline',       // Recent activity, audit log
  MEMORY:           'memory',         // Decisions, org memory
  RECOMMENDATIONS:  'recommendations',// Proactive recommendations
  HEALTH:           'health',         // Workspace health score
  PEOPLE:           'people',         // Employees, teams, org chart
  TRANSCRIPTS:      'transcripts',    // Meeting transcripts
  GRAPH:            'graph',          // Knowledge graph traversal
});

/** Map each capability to the graph node types that represent it */
export const CAPABILITY_NODE_TYPES = {
  [Capability.ENGINEERING]:    ['PR', 'COMMIT', 'ISSUE', 'SYSTEM'],
  [Capability.MEETINGS]:       ['MEETING', 'EVENT'],
  [Capability.CUSTOMERS]:      ['CUSTOMER'],
  [Capability.INCIDENTS]:      ['INCIDENT'],
  [Capability.KNOWLEDGE]:      ['DOCUMENT'],
  [Capability.COMMUNICATIONS]: ['EMAIL', 'COMMUNICATION'],
  [Capability.PEOPLE]:         ['USER'],
  [Capability.TRANSCRIPTS]:    ['TRANSCRIPT'],
};

/** Map each capability to the OrgMemoryRecord types it produces */
export const CAPABILITY_MEMORY_TYPES = {
  [Capability.INCIDENTS]:   ['INCIDENT'],
  [Capability.CUSTOMERS]:   ['PROJECT_EVENT', 'CUSTOMER_EVENT'],
  [Capability.KNOWLEDGE]:   ['KNOWLEDGE_UPDATE'],
  [Capability.ENGINEERING]: ['PROJECT_EVENT'],
  [Capability.MEMORY]:      ['DECISION', 'INCIDENT', 'PROJECT_EVENT', 'CUSTOMER_EVENT', 'KNOWLEDGE_UPDATE'],
};

/**
 * Determines which capabilities are needed to answer a question.
 *
 * @param {string} question
 * @param {import('./IntentAnalyzer.js').IntentResult} intent
 * @returns {CapabilityPlan}
 */
export function planCapabilities(question, intent) {
  const q            = question.toLowerCase();
  const capabilities = [];

  // Engineering signals
  if (_matches(q, ['pr', 'pull request', 'merge', 'commit', 'deploy', 'deployment', 'branch', 'repo', 'code', 'build', 'pipeline', 'ci', 'review', 'diff', 'issue', 'jira', 'ticket', 'bug', 'feature', 'sprint', 'release', 'engineer'])) {
    capabilities.push({ capability: Capability.ENGINEERING, priority: 1, limit: 20 });
  }

  // Meeting signals
  if (_matches(q, ['meeting', 'standup', 'sync', 'call', 'calendar', 'agenda', 'schedule', 'upcoming', 'yesterday', 'today', 'tomorrow', 'this week', 'invite', 'attendee', 'conference', 'zoom', 'meet'])) {
    capabilities.push({ capability: Capability.MEETINGS, priority: 1, limit: 15 });
  }

  // Customer / CRM signals
  if (_matches(q, ['customer', 'client', 'account', 'deal', 'churn', 'arr', 'mrr', 'revenue', 'sales', 'pipeline', 'prospect', 'renewal', 'contract', 'nps', 'satisfaction', 'at risk', 'upsell'])) {
    capabilities.push({ capability: Capability.CUSTOMERS, priority: 1, limit: 15 });
  }

  // Incident signals
  if (_matches(q, ['incident', 'outage', 'down', 'sev', 'p0', 'p1', 'critical', 'alert', 'page', 'production', 'issue', 'broke', 'failed', 'error', 'breach', 'attack', 'vulnerability'])) {
    capabilities.push({ capability: Capability.INCIDENTS, priority: 1, limit: 20 });
  }

  // Knowledge / document signals
  if (_matches(q, ['document', 'doc', 'wiki', 'policy', 'procedure', 'guide', 'knowledge', 'confluence', 'notion', 'page', 'write', 'written', 'updated', 'changed', 'modified'])) {
    capabilities.push({ capability: Capability.KNOWLEDGE, priority: 2, limit: 10 });
  }

  // Communication signals
  if (_matches(q, ['email', 'message', 'thread', 'inbox', 'slack', 'sent', 'received', 'replied', 'forwarded', 'communication', 'mail'])) {
    capabilities.push({ capability: Capability.COMMUNICATIONS, priority: 2, limit: 10 });
  }

  // Timeline / activity signals
  if (_matches(q, ['what changed', 'what happened', 'recent', 'activity', 'timeline', 'today', 'yesterday', 'this week', 'lately', 'update', 'log', 'history'])) {
    capabilities.push({ capability: Capability.TIMELINE, priority: 2, limit: 20 });
  }

  // Recommendation signals
  if (_matches(q, ['recommend', 'suggest', 'what should', 'priorit', 'focus', 'work on', 'action', 'next step', 'improve', 'opportunity'])) {
    capabilities.push({ capability: Capability.RECOMMENDATIONS, priority: 1, limit: 10 });
  }

  // People / team signals
  if (_matches(q, ['who', 'team', 'employee', 'hire', 'headcount', 'people', 'org chart', 'manager', 'report', 'onboard', 'offboard', 'pto', 'capacity', 'workload'])) {
    capabilities.push({ capability: Capability.PEOPLE, priority: 2, limit: 10 });
  }

  // Transcript signals
  if (_matches(q, ['transcript', 'said', 'discussed', 'talked about', 'agreed', 'action item', 'follow up', 'notes from'])) {
    capabilities.push({ capability: Capability.TRANSCRIPTS, priority: 2, limit: 5 });
  }

  // Health is always useful for status/diagnostic questions
  if (_matches(q, ['health', 'status', 'score', 'overall', 'how are we', 'how is', 'performing', 'performance'])) {
    capabilities.push({ capability: Capability.HEALTH, priority: 3, limit: 1 });
  }

  // Memory/decisions always enriches reasoning
  capabilities.push({ capability: Capability.MEMORY, priority: 3, limit: 10 });

  // If domain is known, add domain-specific capability if not already included
  const domainCap = _domainToCapability(intent.domain);
  if (domainCap && !capabilities.find(c => c.capability === domainCap)) {
    capabilities.push({ capability: domainCap, priority: 2, limit: 15 });
  }

  // Always include health for broad questions
  if (!capabilities.find(c => c.capability === Capability.HEALTH)) {
    capabilities.push({ capability: Capability.HEALTH, priority: 4, limit: 1 });
  }

  // Deduplicate and sort by priority
  const seen   = new Set();
  const unique = capabilities.filter(c => {
    if (seen.has(c.capability)) return false;
    seen.add(c.capability);
    return true;
  });
  unique.sort((a, b) => a.priority - b.priority);

  return {
    capabilities: unique,
    capabilityNames: unique.map(c => c.capability),
    primaryCapability: unique[0]?.capability || Capability.MEMORY,
    requiresLiveConnector: unique.some(c => [Capability.ENGINEERING, Capability.MEETINGS, Capability.COMMUNICATIONS].includes(c.capability)),
  };
}

/**
 * Build a plan that includes all capabilities — used for morning briefs
 * and workspace analysis cycles where every data source should be queried.
 *
 * @returns {CapabilityPlan}
 */
export function buildPlanForAll() {
  const all = Object.values(Capability).map((cap, i) => ({
    capability: cap,
    priority:   i + 1,
    limit:      cap === Capability.HEALTH ? 1 : 20,
  }));
  return {
    capabilities:          all,
    capabilityNames:       all.map(c => c.capability),
    primaryCapability:     Capability.MEMORY,
    requiresLiveConnector: true,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _matches(q, terms) {
  return terms.some(t => q.includes(t));
}

function _domainToCapability(domain) {
  const map = {
    engineering: Capability.ENGINEERING,
    customers:   Capability.CUSTOMERS,
    incidents:   Capability.INCIDENTS,
    meetings:    Capability.MEETINGS,
    knowledge:   Capability.KNOWLEDGE,
    people:      Capability.PEOPLE,
  };
  return map[domain] || null;
}
