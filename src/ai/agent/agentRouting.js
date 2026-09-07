/**
 * Agent-mode routing (Stage 4I) — decides WHEN iterative evidence gathering is
 * justified. Not wired as a default; a utility the future Router can call so most
 * queries stay on the fast single-shot pipeline and only genuinely multi-hop /
 * ambiguous questions pay for the loop.
 *
 * Deterministic and cheap (no LLM). Returns a recommendation, never an action.
 *
 *   simple     → existing pipeline (one retrieval answers it)
 *   multi-hop  → AgentRuntime (multiple sources/entities/relationships)
 *   ambiguous  → AgentRuntime (needs evidence comparison / disambiguation)
 */

import { buildIntentModel } from '../reasoning/intentModel.js';

/**
 * Stage 5D — richer, intent-model-driven routing. Returns the full route class
 * (FAST_LOOKUP / RELATIONSHIP_LOOKUP / MULTI_HOP_AGENT / COMPARISON / TEMPORAL /
 * BRIEFING / DIAGNOSTIC / AMBIGUOUS / UNKNOWN / CONVERSATIONAL) plus depth,
 * response mode, and whether the AgentRuntime is justified. Deterministic; simple
 * questions never touch an LLM. `resolveFn` (e.g. resolveReferences) is optional —
 * without it, routing is inferred from wording alone.
 */
export async function routeIntent(question, { history = [], resolveFn = null, workspaceId = null, pageContext = null } = {}) {
  const model = await buildIntentModel(question, { history, resolveFn, workspaceId, pageContext });
  return {
    route:        model.retrievalStrategy,
    useAgent:     model.useAgent,
    depth:        model.requestedDepth,
    responseMode: model.responseMode,
    ambiguity:    model.ambiguity,
    goal:         model.goal,
    model,
  };
}

const MULTIHOP_SIGNALS = [
  /\bwhy\b/i, /\broot cause\b/i, /\bhow did\b/i, /\bimpact\b/i, /\bblocked\b/i,
  /\brelated\b/i, /\bconnected\b/i, /\bdepend/i, /\bwho (owns|is responsible|worked)/i,
  /\bacross\b/i, /\btrace\b/i, /\bchain\b/i, /\bcascad/i,
];
const COMPARISON_SIGNALS = [/\bcompare\b/i, /\bvs\.?\b/i, /\bversus\b/i, /\bdifference between\b/i, /\bwhich (one|is better)\b/i, /\btrade-?off/i];
const AMBIGUITY_SIGNALS  = [/\bwhat's going on\b/i, /\bstatus of everything\b/i, /\banything i should know\b/i, /\bsummar(y|ize) the situation\b/i];
const SIMPLE_SIGNALS     = [/^who is\b/i, /^what is\b/i, /^when (is|was|did)\b/i, /^where\b/i, /^list\b/i, /^show\b/i, /^how many\b/i];

/**
 * @param {{question:string, intent?:object}} p
 * @returns {{ useAgent:boolean, complexity:'simple'|'multi_hop'|'ambiguous', reason:string, score:number }}
 */
export function classifyAgentRouting({ question = '', intent = {} } = {}) {
  const q = String(question);
  const entityCount = Array.isArray(intent.entities) ? intent.entities.length : 0;

  const multihop   = MULTIHOP_SIGNALS.some(r => r.test(q));
  const comparison = COMPARISON_SIGNALS.some(r => r.test(q));
  const ambiguous  = AMBIGUITY_SIGNALS.some(r => r.test(q));
  const simpleLead = SIMPLE_SIGNALS.some(r => r.test(q.trim()));

  // Score: higher → more justification for iterative reasoning.
  let score = 0;
  if (multihop)   score += 2;
  if (comparison) score += 2;
  if (ambiguous)  score += 2;
  if (entityCount >= 2) score += 1;
  if (simpleLead) score -= 2;

  if (ambiguous || comparison) {
    return { useAgent: true, complexity: 'ambiguous', reason: 'requires evidence comparison / disambiguation', score };
  }
  if (score >= 2) {
    return { useAgent: true, complexity: 'multi_hop', reason: 'requires multiple sources / entities / relationships', score };
  }
  return { useAgent: false, complexity: 'simple', reason: 'answerable with a single retrieval — use the fast pipeline', score };
}
