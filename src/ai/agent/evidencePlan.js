/**
 * Evidence Plan (Stage 5E) — turns a FLOW Intent Model into an ORDERED list of the
 * information FLOW needs to answer the user's ACTUAL question, before any tool is
 * chosen. It answers "what information do I need?" — not "what tool should I call?".
 *
 * The plan is a deterministic scaffold. The loop still runs:
 *   MODEL PROPOSES → FLOW AUTHORIZES → TOOL EXECUTES → EVIDENCE RETURNS →
 *   VERIFIER VALIDATES → FLOW ANSWERS.
 * The plan gives the planner (LLM or heuristic) a grounded target; it never
 * executes anything and never becomes the authority.
 */

import { RetrievalStrategy, RequestedDepth } from '../reasoning/intentModel.js';

/**
 * @param {import('../reasoning/intentModel.js').FlowIntentModel} model
 * @returns {{ steps: {n:number, need:string, toolHint:string, synthesis?:boolean}[], synthesisRequired:boolean }}
 */
export function buildEvidencePlan(model) {
  const target = model.entities?.[0]?.reference || 'the referenced entity';
  const S = RetrievalStrategy;

  let steps;
  switch (model.retrievalStrategy) {
    case S.CONVERSATIONAL:
      steps = [{ n: 1, need: 'Respond conversationally using prior turns', toolHint: 'none' }];
      break;

    case S.AMBIGUOUS:
      steps = [{ n: 1, need: 'Ask the user to disambiguate the referenced entity', toolHint: 'clarify' }];
      break;

    case S.UNKNOWN:
      steps = [{ n: 1, need: 'State honestly that the entity/premise is not in this workspace', toolHint: 'clarify' }];
      break;

    case S.FAST_LOOKUP:
      steps = [
        { n: 1, need: `Fetch the attributes of ${target}`, toolHint: 'get_entity|search_workspace' },
      ];
      break;

    case S.RELATIONSHIP_LOOKUP:
      steps = [
        { n: 1, need: `Resolve ${target} to a real node`, toolHint: 'get_entity' },
        { n: 2, need: `Fetch the ${model.expectedEvidence.join('/')} relationship of ${target}`, toolHint: 'get_entity' },
        { n: 3, need: 'Verify the relationship direction against the graph', toolHint: 'verify' },
      ];
      break;

    case S.DIAGNOSTIC:
      steps = [
        { n: 1, need: 'Identify the release / project / subject in scope', toolHint: 'search_workspace' },
        { n: 2, need: 'Retrieve blocked issues / blockers', toolHint: 'list_jira_issues|search_workspace' },
        { n: 3, need: 'Retrieve related incidents', toolHint: 'search_workspace' },
        { n: 4, need: 'Retrieve related pull requests / changes', toolHint: 'search_engineering|search_workspace' },
        { n: 5, need: 'Resolve responsible people', toolHint: 'get_entity' },
        { n: 6, need: 'Rank evidence and determine causal / relevant relationships', toolHint: 'rank' },
        { n: 7, need: 'Verify claims, then synthesize', toolHint: 'verify', synthesis: true },
      ];
      break;

    case S.COMPARISON: {
      const a = model.entities?.[0]?.reference || 'A';
      const b = model.entities?.[1]?.reference || 'B';
      steps = [
        { n: 1, need: `Gather evidence for ${a}`, toolHint: 'search_workspace|get_entity' },
        { n: 2, need: `Gather evidence for ${b}`, toolHint: 'search_workspace|get_entity' },
        { n: 3, need: 'Align comparable dimensions', toolHint: 'rank' },
        { n: 4, need: 'Verify and synthesize the comparison', toolHint: 'verify', synthesis: true },
      ];
      break;
    }

    case S.TEMPORAL:
      steps = [
        { n: 1, need: 'Establish the time window (e.g. since yesterday)', toolHint: 'none' },
        { n: 2, need: 'Retrieve items changed within the window', toolHint: 'search_workspace' },
        { n: 3, need: 'Diff against the prior state and synthesize', toolHint: 'verify', synthesis: true },
      ];
      break;

    case S.BRIEFING:
      steps = [
        { n: 1, need: 'Gather incidents, engineering activity, risks, and health', toolHint: 'search_workspace' },
        { n: 2, need: 'Rank by importance', toolHint: 'rank' },
        { n: 3, need: 'Compose the briefing (deterministic composer)', toolHint: 'briefing', synthesis: true },
      ];
      break;

    case S.MULTI_HOP_AGENT:
    default:
      steps = [
        { n: 1, need: 'Broad workspace retrieval for the question', toolHint: 'search_workspace' },
        { n: 2, need: 'Expand the most relevant entities', toolHint: 'get_entity' },
        { n: 3, need: 'Connect the evidence across sources', toolHint: 'rank' },
        { n: 4, need: 'Verify claims, then synthesize', toolHint: 'verify', synthesis: true },
      ];
      break;
  }

  const synthesisRequired = model.requestedDepth === RequestedDepth.LEVEL_3
    || steps.some(s => s.synthesis === true);

  return { steps, synthesisRequired };
}

export default { buildEvidencePlan };
