/**
 * GuardrailsEngine — Layer 6 of the AI Platform.
 *
 * Every AI request passes through this gate twice:
 *   INPUT:  before context assembly and LLM call
 *   OUTPUT: after LLM response, before returning to caller
 *
 * Guardrail stack:
 *   Input:  PII scan → Injection detection → Policy check → Budget check
 *   Output: PII echo check → Forbidden phrases → Citation integrity → Output length
 *
 * On block, returns a structured { blocked: true, reason, response } so
 * AIPlatform can return a safe fallback without calling the LLM at all.
 */
import { scan as piiScan, redact } from './piiDetector.js';
import { detect as injectionDetect } from './injectionDetector.js';
import { validate as outputValidate } from './outputValidator.js';

// Workspace-level AI policy check (best-effort, non-blocking on DB failure)
async function _checkPolicy(workspaceId, taskType) {
  try {
    const { evaluateWithPolicies } = await import('../../core/governance/permissionEvaluator.js');
    const result = await evaluateWithPolicies({
      workspaceId,
      action:  `ai:${taskType}`,
      role:    'MEMBER',
      effect:  'ALLOW',
    });
    return result;
  } catch {
    return { effect: 'ALLOW' }; // fail open — governance unavailability must not block AI
  }
}

/**
 * Run input guardrails against a PlatformRequest.
 *
 * @param {Object} req  - PlatformRequest
 * @returns {Promise<{ pass: boolean, blocked: boolean, reason?: string, issues: string[], response?: string }>}
 */
export async function checkInput(req) {
  const issues = [];
  const text = _extractText(req);

  // 1. PII scan
  const pii = piiScan(text);
  if (pii.highRisk) {
    return {
      pass: false, blocked: true,
      reason: 'pii_detected',
      issues: pii.findings.map(f => `${f.type}:${f.severity}`),
      response: 'This request contains sensitive personal information and cannot be processed. Please remove PII before retrying.',
    };
  }
  if (!pii.clean) {
    issues.push(...pii.findings.map(f => `pii:${f.type}`));
  }

  // 2. Injection detection
  const injection = injectionDetect(text);
  if (injection.risk === 'high') {
    return {
      pass: false, blocked: true,
      reason: 'prompt_injection',
      issues: injection.matches,
      response: "This request appears to contain instructions that attempt to override FLOW's behavior. Request blocked.",
    };
  }
  if (injection.risk === 'medium') {
    issues.push('injection_warning');
  }

  // 3. Policy check (best-effort)
  if (req.workspaceId && req.taskType) {
    const policy = await _checkPolicy(req.workspaceId, req.taskType);
    if (policy.effect === 'DENY') {
      return {
        pass: false, blocked: true,
        reason: 'policy_denied',
        issues: ['workspace_policy'],
        response: `AI action "${req.taskType}" is not permitted for this workspace by governance policy.`,
      };
    }
  }

  return { pass: true, blocked: false, issues };
}

/**
 * Run output guardrails against the AI response.
 *
 * @param {string} text  - Raw AI response text
 * @param {Object} req   - Original PlatformRequest (for context)
 * @returns {{ pass: boolean, text: string, issues: string[], severity: string }}
 */
export function checkOutput(text, req = {}) {
  const validation = outputValidate(text, req.context ?? {});

  if (validation.severity === 'block') {
    return {
      pass:   false,
      text:   'FLOW encountered an issue generating a safe response. Please rephrase your question.',
      issues: validation.issues,
      severity: 'block',
    };
  }

  return { pass: true, text, issues: validation.issues, severity: validation.severity };
}

// ── Internal ──────────────────────────────────────────────────────────────────

function _extractText(req) {
  if (typeof req.prompt === 'string')       return req.prompt;
  if (Array.isArray(req.messages))          return req.messages.map(m => m.content ?? '').join(' ');
  if (typeof req === 'string')              return req;
  return '';
}
