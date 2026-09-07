/**
 * OperationalBrain ↔ AgentRuntime integration (Stage 4C).
 *
 * Optional, OFF by default. When agent mode is ON, the AgentRuntime gathers
 * evidence iteratively (read-only, governed) and composeAnswer() runs it through
 * the SAME verification pipeline the brain always uses (EvidenceRanker →
 * ReasoningEngine → VerificationEngine → ConfidenceScorer → ClaimVerifier). The
 * agent is an evidence-gathering capability — never the final authority, never a
 * bypass of verification.
 *
 * If the agent path fails, the caller (OperationalBrain) falls back to the normal
 * pipeline — we never fabricate an answer.
 */

import { createAgentRuntime, READ_ONLY_TOOLS, OFFLINE_EXTERNAL_READ_TOOLS } from './index.js';

// OperationalBrain speaks role names like EMPLOYEE/EXECUTIVE; governance speaks
// OWNER/ADMIN/MEMBER/VIEWER. Map conservatively (never escalate).
function _govRole(role) {
  switch (String(role || '').toUpperCase()) {
    case 'OWNER':  return 'OWNER';
    case 'ADMIN':  return 'ADMIN';
    case 'VIEWER': return 'VIEWER';
    default:       return 'MEMBER';
  }
}

/** True when agent mode is requested (explicit opt-in or AGENT_MODE=on). Default OFF. */
export function isAgentModeEnabled(opts = {}) {
  if (opts.agentMode === true)  return true;
  if (opts.agentMode === false) return false;
  return String(process.env.AGENT_MODE || 'off').toLowerCase() === 'on';
}

/**
 * Run the reasoning question in agent mode and return a BrainResponse-shaped object.
 * @returns {Promise<object>} same key fields OperationalBrain callers read.
 */
export async function runReasoningAgentMode(workspaceId, opts = {}) {
  const {
    question, role = 'EMPLOYEE', userId, orgId, orgPlan = 'free',
    sessionId, requestId, allowedToolNames,
  } = opts;

  const runtime = createAgentRuntime();
  const allow = allowedToolNames ?? [...READ_ONLY_TOOLS, ...OFFLINE_EXTERNAL_READ_TOOLS];

  const handle = runtime.start(
    { question, allowedToolNames: allow },
    { workspaceId, userId, orgId, role: _govRole(role), orgPlan, sessionId, requestId },
    {},
  );
  const res = await handle.done;
  return _toBrainResponse(res, { question, role });
}

function _toBrainResponse(res, { question, role }) {
  const primary = (res.evidence || []).slice(0, 6).map((e, i) => ({
    ref:      `E${i + 1}`,
    type:     e.type,
    source:   e.source,
    content:  String(e.content || '').slice(0, 400),
    score:    e.score ?? null,
    ts:       e.ts ?? null,
  }));

  return {
    traceId:   res.runId,
    question,
    role,
    timestamp: new Date().toISOString(),
    elapsedMs: res.durationMs,

    summary: res.answer,
    answer:  res.answer,
    agentMode: true,

    plan: { capabilityNames: [], primaryCapability: null, focused: false },
    capabilities: { planned: [], queried: [], totalRecords: res.evidenceCount, primary: null },

    evidence: {
      total: res.evidenceCount,
      primary,
      supporting: 0,
      sources: [...new Set((res.evidence || []).map(e => e.source))],
    },

    confidence: res.confidence ?? { score: 10, level: 'low', explanation: 'No evidence.', components: {} },

    reasoning: {
      questionType:   null,
      domain:         null,
      timeframe:      null,
      chain:          res.reasoning?.chain    ?? [],
      findings:       res.reasoning?.findings ?? [],
      gaps:           res.reasoning?.gaps     ?? [],
      contradictions: res.reasoning?.contradictions ?? [],
      verification: {
        passed:     res.verification?.passed ?? true,
        trustLevel: res.verification?.trustLevel ?? 'medium',
        issues:     res.verification?.issues ?? [],
        warnings:   res.verification?.warnings ?? [],
        summary:    res.verification?.verificationSummary ?? '',
      },
    },

    actions: { recommended: [], executable: [], canExecute: false, quickWin: null },
    flowCanExecute: false,

    isEmptyResult: res.insufficientEvidence ?? false,
    _agentTrace:   res.trace,
    _agentToolTrace: res.toolTrace,
  };
}
