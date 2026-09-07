/**
 * FLOW OS — Executive Council Router (Phase 15)
 *
 * Deterministically maps a question to the relevant executive agents. Uses each
 * agent's domain keywords plus the existing CapabilityPlanner's capability selection
 * as a booster — no extra LLM call. Falls back to the full council when a question is
 * ambiguous (no signal), so nothing relevant is ever missed.
 */

import { AGENT_CONFIGS, AGENT_IDS } from './agents/registry.js';

export async function route(question) {
  const q = String(question || '').toLowerCase();
  const scores = {};
  for (const cfg of AGENT_CONFIGS) scores[cfg.id] = 0;

  // 1. Keyword signal.
  for (const cfg of AGENT_CONFIGS) {
    for (const kw of cfg.keywords) {
      if (q.includes(kw)) scores[cfg.id] += 1;
    }
  }

  // 2. Capability-plan booster (reuse the Brain's capability selection).
  try {
    const { planCapabilities } = await import('../ai/reasoning/CapabilityPlanner.js');
    const plan = await planCapabilities(question);
    const names = plan?.capabilityNames || [];
    for (const cfg of AGENT_CONFIGS) {
      if (cfg.capabilities.some((c) => names.includes(c))) scores[cfg.id] += 2;
    }
  } catch { /* booster is best-effort */ }

  const ranked = Object.entries(scores)
    .filter(([, s]) => s > 0)
    .sort((a, b) => b[1] - a[1]);

  const selected = ranked.length ? ranked.map(([id]) => id) : [...AGENT_IDS];
  const ambiguous = ranked.length === 0;

  return {
    selected,
    scores,
    ambiguous,
    reason: ambiguous
      ? 'No strong domain signal — consulting the full council.'
      : `Routed to ${selected.length} agent(s) by domain signal.`,
  };
}

export default { route };
