/**
 * AgentPlanner — decides the NEXT move each iteration. Deterministic and
 * offline-safe by design (the PoC must run without an LLM and produce the same
 * evidence-gathering path every time).
 *
 * The planner only *proposes* a tool + input. It never authorizes — the
 * ToolGateway is the sole authority on whether a proposed tool may run. The
 * planner can only propose tools that are in the FLOW-supplied allow-list.
 *
 * Policy (read-first, evidence-driven):
 *   1. No search yet            → search_workspace(question)
 *   2. Search thin / gap        → one refined search using intent.searchTerms
 *   3. Unexplored entity ids    → get_entity(nextId)   (the "notice missing info, retrieve again" hop)
 *   4. Enough evidence / no move → finish
 */

import { extractEntityCandidates } from './evidence.js';

const MIN_SUFFICIENT_EVIDENCE = 3;

export function planNextStep({
  question,
  intent,
  evidence = [],
  allowedTools = [],
  state = {},
}) {
  const can = (name) => allowedTools.includes(name);
  const { searchesDone = 0, exploredEntities = new Set(), refinedSearchDone = false } = state;

  // 1. First move: broad workspace search.
  if (searchesDone === 0 && can('search_workspace')) {
    return {
      action: 'call_tool',
      toolName: 'search_workspace',
      input: { query: question, limit: 6 },
      rationale: 'Initial broad retrieval to locate relevant workspace intelligence.',
    };
  }

  // 2. Refined search when the first pass was thin — recognise the gap and retrieve again.
  if (
    !refinedSearchDone &&
    evidence.length > 0 &&
    evidence.length < MIN_SUFFICIENT_EVIDENCE &&
    can('search_workspace') &&
    intent?.searchTerms?.length
  ) {
    return {
      action: 'call_tool',
      toolName: 'search_workspace',
      input: { query: intent.searchTerms.slice(0, 5).join(' '), limit: 6 },
      rationale: 'First pass was thin — refining the query with intent search terms.',
    };
  }

  // 3. Explore an entity surfaced by the evidence (multi-hop). Never invent an id.
  if (can('get_entity')) {
    const candidates = extractEntityCandidates(evidence, question)
      .filter(id => !exploredEntities.has(id));
    if (candidates.length) {
      return {
        action: 'call_tool',
        toolName: 'get_entity',
        input: { entityId: candidates[0] },
        rationale: `Inspecting related entity ${candidates[0]} to connect the evidence.`,
      };
    }
  }

  // 4. Stop — either we have enough, or there is no further authorized, productive move.
  return {
    action: 'finish',
    reason: evidence.length >= 1 ? 'SUFFICIENT' : 'NO_PRODUCTIVE_TOOL',
    rationale: evidence.length >= 1
      ? `Gathered ${evidence.length} evidence item(s); no further productive retrieval.`
      : 'No authorized tool produced usable evidence.',
  };
}
