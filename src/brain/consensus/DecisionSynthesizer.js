/**
 * DecisionSynthesizer — wraps the Chief of Staff synthesis output into the
 * canonical CognitiveBrainResult that the REST API returns.
 *
 * This is not the LLM synthesis call — that lives in ChiefOfStaffAgent.synthesize().
 * DecisionSynthesizer assembles the full result object:
 *   - CoS decision (execution recommendation)
 *   - All agent findings
 *   - Consensus summary
 *   - Pipeline metrics
 *   - Session reference
 *
 * The executionPlan in the result is a RECOMMENDATION for the Planner.
 * No actions are executed here — output is read-only intelligence.
 */

/**
 * Assemble the final CognitiveBrainResult from all pipeline stage outputs.
 *
 * @param {object} params
 * @param {string} params.sessionId
 * @param {string} params.workspaceId
 * @param {import('../../ai/reasoning/IntentAnalyzer.js').IntentResult} params.intent
 * @param {string[]} params.selectedAgents
 * @param {import('../agents/BaseAgent.js').AgentOutput[]} params.agentOutputs
 * @param {import('./ConsensusEngine.js').ConsensusResult} params.consensus
 * @param {object} params.decision               — from ChiefOfStaffAgent.synthesize()
 * @param {object[]} params.pipelineStages       — timing for each pipeline stage
 * @param {number} params.totalDurationMs
 * @returns {CognitiveBrainResult}
 */
export function assembleFinalResult({
  sessionId,
  workspaceId,
  intent,
  selectedAgents,
  agentOutputs,
  consensus,
  decision,
  pipelineStages,
  totalDurationMs,
}) {
  // Aggregate all findings sorted by severity
  const allFindings = agentOutputs
    .flatMap(o => (o.findings || []).map(f => ({ ...f, agentId: o.agentId, agentName: o.agentName })))
    .sort(_findingSeverityOrder);

  // Aggregate all execution hints from agent outputs (not CoS — those are already in decision)
  const agentHints = agentOutputs
    .flatMap(o => (o.executionHints || []).map(h => ({ ...h, fromAgent: o.agentId })));

  // Top risks across all agents
  const topRisks = allFindings
    .filter(f => f.type === 'risk' || f.severity === 'critical' || f.severity === 'high')
    .slice(0, 10);

  // Agent participation summary
  const agentSummary = agentOutputs.map(o => ({
    agentId:        o.agentId,
    agentName:      o.agentName,
    domain:         o.domain,
    confidence:     o.confidence,
    relevanceScore: o.relevanceScore,
    findingCount:   (o.findings || []).length,
    durationMs:     o.durationMs,
    error:          o.error,
  }));

  return {
    // Core identifiers
    sessionId,
    workspaceId,
    timestamp:         new Date().toISOString(),

    // What was asked
    intent,
    question:          intent.question,

    // Agent participation
    selectedAgents,
    agentParticipation: agentSummary,

    // The synthesis — Chief of Staff's decision
    decision,
    executionPlan:     decision?.executionPlan || _emptyPlan(),

    // Intelligence aggregation
    allFindings,
    topRisks,
    agentExecutionHints: agentHints,

    // Consensus
    consensus,

    // Performance
    pipelineStages,
    totalDurationMs,

    // Meta
    engineVersion:     '11.0',
    agentCount:        agentOutputs.length,
    overallConfidence: decision?.confidence ?? consensus?.confidence ?? 0,
  };
}

// ── Internals ─────────────────────────────────────────────────────────────────

const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };

function _findingSeverityOrder(a, b) {
  return (SEVERITY_ORDER[a.severity] ?? 5) - (SEVERITY_ORDER[b.severity] ?? 5);
}

function _emptyPlan() {
  return { workflows: [], suggestedActions: [], sequencing: 'sequential' };
}
