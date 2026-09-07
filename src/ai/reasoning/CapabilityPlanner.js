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

import { classifyIntent } from './IntentClassifier.js';

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
 * The immutable retrieval priority. Live connector data always wins; vector memory
 * is the LAST evidence tier and can NEVER override a live connector (requirement 4).
 * The dispatcher enforces this per-capability (live records supersede graph/memory);
 * this constant travels with the plan so every downstream stage sees the same order.
 */
export const RETRIEVAL_PRIORITY = Object.freeze([
  'live_connector',
  'operational_db',
  'knowledge_graph',
  'vector_memory',
  'llm',
]);

// Default per-capability record limits.
const CAP_LIMIT = {
  [Capability.ENGINEERING]:     20,
  [Capability.MEETINGS]:        15,
  [Capability.CUSTOMERS]:       15,
  [Capability.INCIDENTS]:       20,
  [Capability.KNOWLEDGE]:       10,
  [Capability.COMMUNICATIONS]:  12,
  [Capability.TIMELINE]:        20,
  [Capability.MEMORY]:          10,
  [Capability.RECOMMENDATIONS]: 10,
  [Capability.HEALTH]:          1,
  [Capability.PEOPLE]:          10,
  [Capability.TRANSCRIPTS]:     5,
};

/**
 * Determines which capabilities are needed to answer a question.
 *
 * This is now a thin planner on top of the deterministic IntentClassifier. It does
 * NOT decide relevance itself (that was the source of contamination — it used to
 * OR-match loose keywords and always bolt on MEMORY + HEALTH). It takes the
 * classifier's minimal capability set and turns it into an execution plan:
 * allowed/forbidden connectors, retrieval priority, and an evidence budget.
 *
 * @param {string} question
 * @param {import('./IntentAnalyzer.js').IntentResult} intent
 * @returns {CapabilityPlan}
 */
export function planCapabilities(question, intent) {
  const cls = classifyIntent(question, intent);

  const capabilities = cls.capabilities.map((capability, i) => ({
    capability,
    priority: i + 1,
    limit: CAP_LIMIT[capability] ?? 10,
  }));

  // Evidence budget: focused questions read a tight window; broad/multi read wider.
  const evidenceBudget = cls.focused ? 12 : cls.broad ? 40 : 24;

  return {
    capabilities,
    capabilityNames: capabilities.map(c => c.capability),
    primaryCapability: cls.primary,
    focused: cls.focused,
    broad: cls.broad,
    allowedConnectors: cls.allowedConnectors,
    forbiddenConnectors: cls.forbiddenConnectors,
    retrievalPriority: RETRIEVAL_PRIORITY,
    evidenceBudget,
    // A focused, self-contained capability (recommendations/health/memory) needs no
    // vector fallback — its data IS the answer. Live-backed capabilities may still
    // use the graph/vector tiers as a fallback when the connector is unauthenticated.
    allowVectorFallback: !cls.focused || cls.allowedConnectors.length > 0,
    requiresLiveConnector: cls.allowedConnectors.length > 0,
    classification: cls,
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
    focused:               false,
    broad:                 true,
    allowedConnectors:     [],           // briefings read every source; nothing is forbidden
    forbiddenConnectors:   [],
    retrievalPriority:     RETRIEVAL_PRIORITY,
    evidenceBudget:        60,
    allowVectorFallback:   true,
    requiresLiveConnector: true,
  };
}
