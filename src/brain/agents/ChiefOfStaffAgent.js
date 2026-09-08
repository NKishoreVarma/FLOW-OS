/**
 * ChiefOfStaffAgent — the orchestrating intelligence of the Cognitive Brain.
 *
 * Responsibilities:
 *   1. Intent decomposition — breaks a complex question into domain sub-tasks
 *   2. Agent delegation — assigns sub-tasks to the right specialized agents
 *   3. Conflict resolution — resolves contradictions between agent outputs
 *   4. Final synthesis — produces the authoritative execution recommendation
 *   5. Confidence scoring — assesses overall confidence across all agent outputs
 *
 * The Chief of Staff NEVER reasons in isolation on its first pass — it orchestrates.
 * Its synthesize() method runs AFTER all specialized agents have reported.
 *
 * This is NOT an extension of BaseAgent because its flow is fundamentally different:
 * specialized agents reason about data → CoS synthesizes agent outputs.
 * CoS still uses BrainRouter for LLM calls with the same fallback pattern.
 */

import { reason as llmReason } from '../../ai/BrainRouter.js';
import {
  readMessages,
  MessageType,
  postMessage,
} from '../bus/AgentCommunicationBus.js';
import { listAgents }          from '../registry/AgentRegistry.js';

const COS_TIMEOUT_MS = parseInt(process.env.COS_TIMEOUT_MS, 10) || 45_000;

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Decompose an intent into domain-specific sub-tasks for each participating agent.
 *
 * Returns an array of delegation assignments:
 * [{ agentId, domainQuestion, priority }]
 *
 * @param {import('../../ai/reasoning/IntentAnalyzer.js').IntentResult} intent
 * @param {string[]} selectedAgentIds
 * @param {object} context  — AgentContext (for heuristic fallback)
 * @param {string} sessionId
 * @returns {Promise<DelegationAssignment[]>}
 */
export async function decomposeIntent(intent, selectedAgentIds, context, sessionId) {
  const question = intent.question;

  try {
    const agentDefs   = listAgents().filter(a => selectedAgentIds.includes(a.id));
    const agentSummary = agentDefs.map(a => `- ${a.id}: ${a.mission}`).join('\n');

    const prompt = `You are the Chief of Staff coordinating a multi-agent analysis.

USER QUESTION: "${question}"
DETECTED DOMAIN: ${intent.domain}
URGENCY: ${intent.urgency}

AVAILABLE AGENTS:
${agentSummary}

Decompose the question into domain-specific sub-questions, one per relevant agent.
Only include agents that are genuinely relevant to this question.
Respond ONLY with a JSON array (no markdown):
[
  { "agentId": "<agent id>", "domainQuestion": "<focused domain question>", "priority": <1-5 where 1=highest> }
]`;

    const result  = await _withTimeout(
      llmReason(prompt, { maxTokens: 600, temperature: 0.1 }),
      COS_TIMEOUT_MS
    );
    const text    = result?.text || '';
    const cleaned = text.replace(/```json?|```/g, '').trim();
    const parsed  = JSON.parse(cleaned);

    if (!Array.isArray(parsed)) throw new Error('Expected array');

    return parsed
      .filter(d => d.agentId && selectedAgentIds.includes(d.agentId))
      .sort((a, b) => (a.priority || 5) - (b.priority || 5));

  } catch {
    // Heuristic fallback — all selected agents get the original question
    return selectedAgentIds.map((agentId, i) => ({
      agentId,
      domainQuestion: question,
      priority: i + 1,
    }));
  }
}

/**
 * Synthesize all agent outputs into a final execution recommendation.
 *
 * Called AFTER all specialized agents have completed their reasoning.
 * Reads escalations from the communication bus and weighs them.
 *
 * @param {import('../../ai/reasoning/IntentAnalyzer.js').IntentResult} intent
 * @param {import('./BaseAgent.js').AgentOutput[]} agentOutputs
 * @param {import('../consensus/ConsensusEngine.js').ConsensusResult} consensus
 * @param {object} fullContext
 * @param {string} sessionId
 * @returns {Promise<ExecutionRecommendation>}
 */
export async function synthesize(intent, agentOutputs, consensus, fullContext, sessionId) {
  const escalations = readMessages(sessionId, { type: MessageType.ESCALATION });
  const question    = intent.question;

  // Build synthesis input
  const findingsSummary = _summarizeFindings(agentOutputs);
  const conflictsSummary = _summarizeConflicts(consensus);
  const escalationSummary = _summarizeEscalations(escalations);

  try {
    const prompt = _buildSynthesisPrompt(question, findingsSummary, conflictsSummary, escalationSummary, consensus);
    const result = await _withTimeout(
      llmReason(prompt, { maxTokens: 1500, temperature: 0.2 }),
      COS_TIMEOUT_MS
    );
    const text    = result?.text || '';
    const cleaned = text.replace(/```json?|```/g, '').trim();
    const parsed  = JSON.parse(cleaned);
    return _normalizeRecommendation(parsed, agentOutputs, consensus);
  } catch {
    return _heuristicSynthesis(intent, agentOutputs, consensus);
  }
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function _buildSynthesisPrompt(question, findingsSummary, conflictsSummary, escalationSummary, consensus) {
  return `You are the Chief of Staff synthesizing input from ${consensus.participantCount} specialized agents.

USER QUESTION: "${question}"

AGENT FINDINGS SUMMARY:
${findingsSummary}

CONFLICTS TO RESOLVE:
${conflictsSummary || 'No significant conflicts detected.'}

ESCALATIONS REQUIRING ATTENTION:
${escalationSummary || 'No escalations.'}

CONSENSUS: ${consensus.reached ? `Reached with ${consensus.confidence}% confidence` : 'Not reached — conflicts remain'}

Synthesize a final executive recommendation as Chief of Staff.
Respond ONLY with a JSON object (no markdown):
{
  "title": "<brief action-oriented title>",
  "summary": "<2-3 sentence executive summary of the situation>",
  "confidence": <number 0-100>,
  "priority": "<immediate|today|this_week|monitor>",
  "rationale": "<why this recommendation>",
  "risks": ["<risk 1>", "<risk 2>"],
  "conflictResolutions": [
    { "conflict": "<topic>", "resolution": "<how CoS resolves it>", "rationale": "<why>" }
  ],
  "executionPlan": {
    "workflows": [
      { "workflowId": "<id>", "params": {}, "priority": <1-5>, "reason": "<string>" }
    ],
    "suggestedActions": [
      { "connectorId": "<string>", "actionType": "<string>", "payload": {}, "reason": "<string>", "requiresApproval": <bool> }
    ],
    "sequencing": "<parallel|sequential|conditional>"
  },
  "alternatives": [
    { "option": "<string>", "confidence": <number>, "tradeoffs": "<string>" }
  ],
  "nextSteps": ["<step 1>", "<step 2>"]
}`;
}

function _normalizeRecommendation(json, agentOutputs, consensus) {
  return {
    title:               String(json.title || 'Action required'),
    summary:             String(json.summary || ''),
    confidence:          Math.min(100, Math.max(0, Number(json.confidence) || 50)),
    priority:            json.priority || 'today',
    rationale:           String(json.rationale || ''),
    risks:               Array.isArray(json.risks) ? json.risks : [],
    conflictResolutions: Array.isArray(json.conflictResolutions) ? json.conflictResolutions : [],
    executionPlan: {
      workflows:       (json.executionPlan?.workflows || []).map(_normalizeWorkflow),
      suggestedActions:(json.executionPlan?.suggestedActions || []).map(_normalizeAction),
      sequencing:      json.executionPlan?.sequencing || 'sequential',
    },
    alternatives:  Array.isArray(json.alternatives) ? json.alternatives : [],
    nextSteps:     Array.isArray(json.nextSteps) ? json.nextSteps : [],
    participantAgents: agentOutputs.map(o => o.agentId),
    synthesizedBy: 'chief-of-staff',
  };
}

function _normalizeWorkflow(w) {
  return {
    workflowId: String(w.workflowId || ''),
    params:     w.params || {},
    priority:   Math.min(5, Math.max(1, Number(w.priority) || 3)),
    reason:     String(w.reason || ''),
    dependencies: w.dependencies || [],
  };
}

function _normalizeAction(a) {
  return {
    connectorId:      String(a.connectorId || ''),
    actionType:       String(a.actionType || ''),
    payload:          a.payload || {},
    reason:           String(a.reason || ''),
    requiresApproval: Boolean(a.requiresApproval),
  };
}

function _summarizeFindings(agentOutputs) {
  return agentOutputs
    .filter(o => o.findings?.length || o.recommendation?.action)
    .map(o => {
      const findings = (o.findings || [])
        .slice(0, 3)
        .map(f => `    [${f.severity}] ${f.title}: ${f.description}`)
        .join('\n');
      return `${o.agentName} (confidence: ${o.confidence}%):\n${findings || `    Recommendation: ${o.recommendation?.action}`}`;
    })
    .join('\n\n');
}

function _summarizeConflicts(consensus) {
  if (!consensus.conflicts?.length) return '';
  return consensus.conflicts
    .map(c => `- ${c.topic}: ${c.positions.map(p => `${p.agentId}→${p.stance}`).join(' vs ')}`)
    .join('\n');
}

function _summarizeEscalations(escalations) {
  if (!escalations.length) return '';
  return escalations
    .map(e => `- [${e.payload?.severity || 'medium'}] From ${e.fromAgentId}${e.toAgentId ? ` to ${e.toAgentId}` : ''}: ${e.payload?.message}`)
    .join('\n');
}

function _heuristicSynthesis(intent, agentOutputs, consensus) {
  const highConfidence  = agentOutputs.filter(o => o.confidence >= 60);
  const topFinding      = highConfidence[0]?.findings?.[0];
  const topRecommend    = highConfidence[0]?.recommendation;

  return {
    title:              topRecommend?.action || 'Review required',
    summary:            topFinding ? `${topFinding.title}: ${topFinding.description}` : 'Analysis incomplete — LLM synthesis unavailable.',
    confidence:         consensus.confidence || 30,
    priority:           topRecommend?.priority || 'today',
    rationale:          topRecommend?.rationale || 'Heuristic synthesis — LLM unavailable.',
    risks:              agentOutputs.flatMap(o => (o.findings || []).filter(f => f.type === 'risk').map(f => f.title)).slice(0, 5),
    conflictResolutions:[],
    executionPlan: {
      workflows:        agentOutputs.flatMap(o => o.executionHints || []).map(h => ({
        workflowId: h.workflowId || '',
        params:     h.params || {},
        priority:   3,
        reason:     h.reason || '',
        dependencies: [],
      })),
      suggestedActions: [],
      sequencing:       'sequential',
    },
    alternatives:  [],
    nextSteps:     agentOutputs.flatMap(o => o.findings || []).filter(f => f.type === 'action_required').slice(0, 3).map(f => f.title),
    participantAgents: agentOutputs.map(o => o.agentId),
    synthesizedBy: 'chief-of-staff-heuristic',
  };
}

function _withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`CoS reasoning timed out after ${ms}ms`)), ms);
    promise.then(v => { clearTimeout(timer); resolve(v); }, e => { clearTimeout(timer); reject(e); });
  });
}
