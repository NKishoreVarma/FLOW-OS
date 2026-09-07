/**
 * AgentRouter — selects the right agents for a given intent.
 *
 * Selection algorithm:
 *   1. Domain match     — agents whose primary/secondary domain matches intent.domain
 *   2. Keyword match    — agents with ≥1 keyword overlap with the intent question
 *   3. Always-on agents — Security, Risk, and Analytics always participate (relevance-gated)
 *   4. Deduplication    — each agent appears at most once
 *   5. Limit            — cap at MAX_AGENTS to keep latency bounded
 *
 * The Chief of Staff is never returned by the router — it is always added by the
 * ReasoningPipeline. Chief of Staff orchestrates; it is not selected.
 */

import { listAgents } from '../registry/AgentRegistry.js';

const MAX_AGENTS       = parseInt(process.env.BRAIN_MAX_AGENTS, 10) || 10;
const ALWAYS_ON_AGENTS = new Set(['security', 'risk', 'analytics']);

/**
 * @param {import('../../ai/reasoning/IntentAnalyzer.js').IntentResult} intent
 * @param {object} [options]
 * @param {string[]} [options.forceAgentIds]  — always include these agent ids
 * @param {number}   [options.maxAgents]      — override MAX_AGENTS
 * @returns {string[]} ordered agent IDs (highest relevance first)
 */
export function routeToAgents(intent, options = {}) {
  const { forceAgentIds = [], maxAgents = MAX_AGENTS } = options;
  const all     = listAgents().filter(a => a.id !== 'chief-of-staff');
  const scores  = _scoreAgents(all, intent);

  // Sort by score descending
  scores.sort((a, b) => b.score - a.score);

  const selected = new Set(forceAgentIds);

  // Add always-on agents first (they gate themselves internally)
  for (const id of ALWAYS_ON_AGENTS) selected.add(id);

  // Add top-scoring agents up to limit
  for (const { agent } of scores) {
    if (selected.size >= maxAgents) break;
    selected.add(agent.id);
  }

  // Preserve relevance order in final array
  return scores
    .map(s => s.agent.id)
    .filter(id => selected.has(id))
    .concat([...selected].filter(id => !scores.some(s => s.agent.id === id)));
}

/**
 * Return routing explanation for debugging/observability.
 * @param {import('../../ai/reasoning/IntentAnalyzer.js').IntentResult} intent
 * @returns {{ agentId: string, score: number, reasons: string[] }[]}
 */
export function explainRouting(intent) {
  const all    = listAgents().filter(a => a.id !== 'chief-of-staff');
  const scores = _scoreAgents(all, intent);
  return scores
    .sort((a, b) => b.score - a.score)
    .map(s => ({ agentId: s.agent.id, score: s.score, reasons: s.reasons }));
}

// ── Internal scoring ──────────────────────────────────────────────────────────

function _scoreAgents(agents, intent) {
  return agents.map(agent => {
    const { score, reasons } = _scoreAgent(agent, intent);
    return { agent, score, reasons };
  });
}

function _scoreAgent(agent, intent) {
  let score   = 0;
  const reasons = [];

  // Always-on agents start with a base score
  if (ALWAYS_ON_AGENTS.has(agent.id)) {
    score += 30;
    reasons.push('always-on');
  }

  // Primary domain match
  if (agent.domain === intent.domain) {
    score += 50;
    reasons.push(`domain match: ${agent.domain}`);
  }

  // Secondary domain match
  if ((agent.domains || []).includes(intent.domain)) {
    score += 30;
    reasons.push(`secondary domain match: ${intent.domain}`);
  }

  // Keyword overlap with intent question
  const q          = (intent.question || '').toLowerCase();
  const kwMatches  = (agent.keywords || []).filter(kw => q.includes(kw.toLowerCase()));
  if (kwMatches.length) {
    score += Math.min(40, kwMatches.length * 12);
    reasons.push(`keyword matches: ${kwMatches.slice(0, 3).join(', ')}`);
  }

  // Entity overlap — if intent mentions entities that align with agent connectors
  const entities   = (intent.entities || []).map(e => e.name.toLowerCase());
  const connMatch  = (agent.connectors || []).some(c => entities.some(e => e.includes(c)));
  if (connMatch) {
    score += 20;
    reasons.push('connector entity match');
  }

  // Urgency boost for critical domains
  if (intent.urgency === 'high' && (agent.id === 'security' || agent.id === 'infrastructure')) {
    score += 20;
    reasons.push('urgency boost (critical domains)');
  }

  return { score, reasons };
}
