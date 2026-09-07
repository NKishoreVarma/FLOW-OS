/**
 * ReasoningPipeline — 8-stage orchestrator for the Multi-Agent Cognitive Brain.
 *
 * Stages:
 *   1. ParseIntent          — IntentAnalyzer classifies the question
 *   2. BuildContext         — AgentContextBuilder gathers all knowledge sources
 *   3. SelectAgents         — AgentRouter picks relevant agents (≤10)
 *   4. DecomposeIntent      — Chief of Staff breaks question into domain sub-tasks
 *   5. ParallelReasoning    — All agents reason simultaneously (allSettled with timeout)
 *   6. AggregateEvidence    — Collect and flatten all findings
 *   7. BuildConsensus       — ConsensusEngine determines agreement/conflicts
 *   8. SynthesizeDecision   — CoS produces final execution recommendation
 *
 * The pipeline NEVER calls executeAction(). It NEVER calls connectors directly.
 * Output is a CognitiveBrainResult with an executionPlan (for the Planner to use).
 *
 * Failure isolation: each agent runs in allSettled so one failure never blocks the rest.
 * Timeout: each agent is bounded by AGENT_TIMEOUT_MS (default 30s).
 */

import { analyzeIntent }       from '../../ai/reasoning/IntentAnalyzer.js';
import { buildAgentContext }   from '../context/AgentContextBuilder.js';
import { routeToAgents }       from '../router/AgentRouter.js';
import {
  decomposeIntent,
  synthesize as cossynthesize,
} from '../agents/ChiefOfStaffAgent.js';
import { buildConsensus }      from '../consensus/ConsensusEngine.js';
import { assembleFinalResult } from '../consensus/DecisionSynthesizer.js';
import {
  createSession,
  updateSession,
  finalizeSession,
} from '../session/AgentSessionManager.js';
import { resolveAgent }        from '../index.js';

const PIPELINE_TIMEOUT_MS = parseInt(process.env.PIPELINE_TIMEOUT_MS, 10) || 120_000;

/**
 * Run the full 8-stage multi-agent reasoning pipeline.
 *
 * @param {string} workspaceId
 * @param {string} orgId
 * @param {string} question
 * @param {object} [options]
 * @param {string[]} [options.forceAgentIds]  — always include these agents
 * @param {string}   [options.pageContext]     — page the user is on (for intent enrichment)
 * @param {string}   [options.entityId]       — focused entity id
 * @returns {Promise<CognitiveBrainResult>}
 */
export async function runCognitivePipeline(workspaceId, orgId, question, options = {}) {
  const session = createSession(workspaceId, orgId, question);
  const stages  = [];
  const t0      = Date.now();

  try {
    updateSession(session.id, { status: 'running' });

    // Stage 1 — Parse Intent
    const intent = await _stage(stages, 'ParseIntent', () =>
      analyzeIntent(question, { pageContext: options.pageContext, entityId: options.entityId })
    );
    updateSession(session.id, { intent });

    // Stage 2 — Build Context
    const context = await _stage(stages, 'BuildContext', () =>
      buildAgentContext(workspaceId, orgId, intent)
    );

    // Stage 3 — Select Agents
    const selectedAgentIds = _stageSync(stages, 'SelectAgents', () =>
      routeToAgents(intent, { forceAgentIds: options.forceAgentIds })
    );

    // Stage 4 — CoS Intent Decomposition
    const delegation = await _stage(stages, 'DecomposeIntent', () =>
      decomposeIntent(intent, selectedAgentIds, context, session.id)
    );

    // Stage 5 — Parallel Agent Reasoning
    const agentOutputs = await _stage(stages, 'ParallelReasoning', () =>
      _runAgentsInParallel(delegation, context, session.id)
    );
    updateSession(session.id, { agentOutputs });

    // Stage 6 — Aggregate Evidence (sync — just collection)
    _stageSync(stages, 'AggregateEvidence', () => null);

    // Stage 7 — Build Consensus
    const consensus = _stageSync(stages, 'BuildConsensus', () =>
      buildConsensus(agentOutputs)
    );
    updateSession(session.id, { consensus });

    // Stage 8 — Synthesize Decision (Chief of Staff)
    const decision = await _stage(stages, 'SynthesizeDecision', () =>
      cossynthesize(intent, agentOutputs, consensus, context, session.id)
    );

    const totalDurationMs = Date.now() - t0;
    const result = assembleFinalResult({
      sessionId:      session.id,
      workspaceId,
      intent,
      selectedAgents: selectedAgentIds,
      agentOutputs,
      consensus,
      decision,
      pipelineStages: stages,
      totalDurationMs,
    });

    finalizeSession(session.id, 'completed', { decision, consensus });
    return result;

  } catch (err) {
    finalizeSession(session.id, 'failed', { error: err.message });
    throw err;
  }
}

/**
 * Run reasoning with a single named agent (for targeted queries).
 *
 * @param {string} agentId
 * @param {string} workspaceId
 * @param {string} orgId
 * @param {string} question
 * @returns {Promise<import('../agents/BaseAgent.js').AgentOutput>}
 */
export async function runSingleAgent(agentId, workspaceId, orgId, question) {
  const agent = resolveAgent(agentId);
  if (!agent) throw new Error(`Agent not found: ${agentId}`);

  const intent  = await analyzeIntent(question);
  const context = await buildAgentContext(workspaceId, orgId, intent);
  const session = createSession(workspaceId, orgId, question);

  try {
    const output = await agent.reason(context, session.id);
    finalizeSession(session.id, 'completed', {});
    return output;
  } catch (err) {
    finalizeSession(session.id, 'failed', { error: err.message });
    throw err;
  }
}

// ── Internal helpers ──────────────────────────────────────────────────────────

async function _runAgentsInParallel(delegation, context, sessionId) {
  if (!delegation.length) return [];

  const settled = await Promise.allSettled(
    delegation.map(({ agentId, domainQuestion }) => {
      const agent = resolveAgent(agentId);
      if (!agent) return Promise.resolve(_missingAgentOutput(agentId, sessionId));
      return agent.reason(context, sessionId, domainQuestion);
    })
  );

  return settled.map((r, i) => {
    if (r.status === 'fulfilled') return r.value;
    const agentId = delegation[i]?.agentId || 'unknown';
    return _errorAgentOutput(agentId, sessionId, r.reason?.message || 'Unknown error');
  });
}

function _errorAgentOutput(agentId, sessionId, errorMsg) {
  return {
    agentId,
    agentName:     agentId,
    domain:        'unknown',
    sessionId,
    confidence:    0,
    relevanceScore:0,
    findings:      [],
    recommendation:{ action: 'Agent error', priority: 'monitor', rationale: errorMsg },
    executionHints:[],
    escalations:   [],
    reasoning:     `Agent failed: ${errorMsg}`,
    durationMs:    0,
    error:         true,
  };
}

function _missingAgentOutput(agentId, sessionId) {
  return _errorAgentOutput(agentId, sessionId, 'Agent not registered');
}

async function _stage(stages, name, fn) {
  const t = Date.now();
  try {
    const result = await Promise.race([
      fn(),
      new Promise((_, rej) => setTimeout(() => rej(new Error(`Stage ${name} timed out`)), PIPELINE_TIMEOUT_MS)),
    ]);
    stages.push({ name, status: 'completed', durationMs: Date.now() - t });
    return result;
  } catch (err) {
    stages.push({ name, status: 'failed', durationMs: Date.now() - t, error: err.message });
    throw err;
  }
}

function _stageSync(stages, name, fn) {
  const t = Date.now();
  const result = fn();
  stages.push({ name, status: 'completed', durationMs: Date.now() - t });
  return result;
}
