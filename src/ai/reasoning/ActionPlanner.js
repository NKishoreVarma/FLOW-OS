/**
 * ActionPlanner — determines what concrete actions FLOW can recommend or execute.
 *
 * Produces:
 *   - recommendedActions: list of suggested next steps
 *   - executableActions: subset that FLOW can execute via connectors
 *   - canExecute: true if at least one action can be auto-executed
 *   - executionPlan: structured plan for FLOW execution engine
 */

import { ask }      from '../BrainRouter.js';
import { TaskType } from '../types.js';

const EXECUTABLE_ACTION_TYPES = new Set([
  'create_pr', 'merge_pr', 'create_issue', 'assign_issue', 'comment',
  'send_email', 'draft_email', 'create_meeting', 'update_meeting',
  'create_task', 'update_task', 'escalate', 'notify',
]);

/**
 * @param {import('./IntentAnalyzer.js').IntentResult} intent
 * @param {import('./ReasoningEngine.js').ReasoningResult} reasoning
 * @param {import('./EvidenceRanker.js').RankedEvidence} ranked
 * @returns {Promise<ActionPlan>}
 */
export async function planActions(intent, reasoning, ranked, { fast = false } = {}) {
  // Fast path (chat): heuristic actions only — no LLM round-trip.
  if (fast) return _heuristicActionPlan(intent, reasoning);

  const prompt = `Based on this enterprise intelligence analysis, determine what actions should be taken.

QUESTION: ${intent.question}
DOMAIN: ${intent.domain}
URGENCY: ${intent.urgency}

REASONING SUMMARY:
${reasoning.narrative}

KEY FINDINGS:
${reasoning.findings.slice(0, 5).map((f, i) => `${i + 1}. ${f.finding} (confidence: ${(f.confidence * 100).toFixed(0)}%)`).join('\n')}

GAPS:
${reasoning.gaps.join('; ') || 'None identified'}

Generate a JSON action plan with:
{
  "recommendedActions": [
    {
      "action": "brief description of what to do",
      "rationale": "why this is the right action",
      "priority": "immediate|high|medium|low",
      "owner": "engineering|product|operations|management|user",
      "estimatedImpact": "brief impact statement",
      "actionType": "one of [create_pr, merge_pr, create_issue, assign_issue, comment, send_email, draft_email, create_meeting, update_meeting, create_task, update_task, escalate, notify, investigate, monitor, manual_review]",
      "executable": true/false
    }
  ],
  "quickWin": "single most impactful immediate action in one sentence",
  "riskIfNoAction": "brief statement of risk from inaction"
}

Return JSON only. Be specific to the actual evidence, not generic advice.`;

  try {
    const result = await ask({
      taskType: TaskType.PLAN,
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 800,
      temperature: 0.3,
    });

    const raw    = (result.text || '').replace(/```json?|```/g, '').trim();
    const parsed = JSON.parse(raw);

    const allActions = parsed.recommendedActions || [];
    const executableActions = allActions.filter(a =>
      a.executable && EXECUTABLE_ACTION_TYPES.has(a.actionType)
    );

    return {
      recommendedActions: allActions,
      executableActions,
      canExecute:         executableActions.length > 0,
      quickWin:           parsed.quickWin || '',
      riskIfNoAction:     parsed.riskIfNoAction || '',
      executionPlan:      _buildExecutionPlan(executableActions, intent),
    };
  } catch {
    return _heuristicActionPlan(intent, reasoning);
  }
}

function _buildExecutionPlan(executableActions, intent) {
  if (!executableActions.length) return null;

  return {
    steps: executableActions.slice(0, 3).map((a, i) => ({
      stepNumber: i + 1,
      actionType: a.actionType,
      description: a.action,
      requiresApproval: intent.urgency !== 'high' || a.priority === 'low',
    })),
    estimatedDuration: `${executableActions.length * 2} minutes`,
    requiresUserConfirmation: true,
  };
}

function _heuristicActionPlan(intent, reasoning) {
  const actions = [];

  if (intent.questionType === 'diagnostic') {
    actions.push({ action: 'Investigate root cause by reviewing recent changes', rationale: 'Diagnostic question requires investigation', priority: 'high', owner: 'engineering', actionType: 'investigate', executable: false, estimatedImpact: 'Identifies root cause' });
  }
  if (intent.questionType === 'action' || intent.urgency === 'high') {
    actions.push({ action: 'Escalate to relevant team lead for immediate attention', rationale: 'High urgency issue requiring human decision', priority: 'immediate', owner: 'management', actionType: 'escalate', executable: false, estimatedImpact: 'Reduces response time' });
  }
  if (reasoning.gaps.length > 0) {
    actions.push({ action: 'Gather missing evidence: ' + reasoning.gaps[0], rationale: 'Evidence gaps reduce decision quality', priority: 'medium', owner: 'user', actionType: 'investigate', executable: false, estimatedImpact: 'Improves decision confidence' });
  }

  return {
    recommendedActions: actions,
    executableActions: [],
    canExecute: false,
    quickWin: actions[0]?.action || 'Review the evidence and take manual action',
    riskIfNoAction: 'Issue may persist or worsen without intervention',
    executionPlan: null,
  };
}
