/**
 * LLM planner (Stage 4E) — proposes the next tool call; NEVER executes.
 *
 *   User request → Planner (LLM) → structured tool decision → FLOW governance
 *   → tool execution → observation → Planner → next tool OR finish
 *
 * The model only PROPOSES. FLOW (the ToolGateway) authorizes and executes. The
 * planner output is strictly validated and safety-stripped before it is trusted:
 *   - action ∈ {CALL_TOOL, FINAL}
 *   - tool ∈ the FLOW-supplied allow-list (else fall back to the heuristic)
 *   - arguments is an object with all FLOW-controlled fields removed
 * The model can never set workspace, identity, role, permissions, risk tier,
 * approval state, or execution limits — those come from FLOW.
 *
 * Model access goes through BrainRouter (Stage 4F) — the existing provider
 * abstraction with fallback/cache/timeout. No second model-routing system.
 * If the LLM is unavailable or misbehaves, we fall back to the deterministic
 * heuristic planner (never crash, never free-form execution).
 */

import { reason as brainReason } from '../BrainRouter.js';
import { getTool } from '../tools/toolRegistry.js';
import { planNextStep } from './planner.js';

// Fields the model must never control (normalized: lowercase, non-alpha stripped).
const FORBIDDEN_ARG_KEYS = new Set([
  'workspaceid', 'workspace', 'userid', 'user', 'orgid', 'org', 'role', 'permission',
  'permissions', 'risktier', 'risk', 'approval', 'approvedby', 'approver',
  'limit_override', 'maxiterations', 'maxtoolcalls', 'actor', 'actiontype', 'connector',
]);

const norm = (k) => String(k).toLowerCase().replace(/[^a-z]/g, '');

export function createLLMPlanner({ reasonFn = brainReason } = {}) {
  return async function plan({ question, intent, evidence = [], allowedTools = [], state = {}, toolTrace = [], intentModel = null, evidencePlan = null }) {
    const heuristic = () => planNextStep({ question, intent, evidence, allowedTools, state });

    const menu = allowedTools
      .map(n => { const t = getTool(n); return t ? `- ${n}: ${t.description}` : null; })
      .filter(Boolean).join('\n');
    const gathered = evidence.slice(-8)
      .map((e, i) => `[${i + 1}] (${e.source}) ${String(e.content).slice(0, 160)}`)
      .join('\n') || '(none yet)';
    const called = toolTrace.map(t => `${t.toolName}${t.ok ? '' : '(failed)'}`).join(', ') || '(none)';

    // Stage 5E: reason about the INFORMATION NEEDED (goal + evidence plan), then
    // pick the single next tool that advances it — not "which tool" in a vacuum.
    const goalLine = intentModel ? `USER GOAL: ${intentModel.goal} (depth ${intentModel.requestedDepth})` : '';
    const needLine = intentModel?.expectedEvidence?.length ? `INFORMATION NEEDED: ${intentModel.expectedEvidence.join(', ')}` : '';
    const planLine = evidencePlan?.steps?.length
      ? 'EVIDENCE PLAN:\n' + evidencePlan.steps.map(s => `  ${s.n}. ${s.need}`).join('\n')
      : '';

    const prompt = `You are FLOW's evidence-gathering planner. Decide the SINGLE next step needed to answer the user's ACTUAL question, using ONLY the tools listed. You do NOT execute tools — you propose; FLOW authorizes and runs them.

QUESTION: ${question}
DOMAIN: ${intent?.domain || 'general'}
${goalLine}
${needLine}
${planLine}

TOOLS YOU MAY PROPOSE:
${menu || '(none)'}

EVIDENCE GATHERED SO FAR:
${gathered}
TOOLS ALREADY CALLED: ${called}

Rules:
- Propose ONE tool call that adds NEW evidence, or FINAL when you have enough to answer.
- Never propose a tool not in the list above. Never repeat an identical call.
- "arguments" holds ONLY tool inputs (e.g. a query). NEVER include workspace, user,
  role, permissions, risk, approval, or limits — FLOW controls those.

Respond with STRICT JSON only, no prose:
{"action":"CALL_TOOL"|"FINAL","tool":"<name or null>","arguments":{...},"reason":"<short>","expected_information":"<what it yields>"}`;

    let raw;
    try {
      const r = await reasonFn(prompt, { maxTokens: 260, temperature: 0.1 });
      raw = r?.text || '';
    } catch {
      return heuristic();                        // LLM down → deterministic fallback
    }

    const decision = _parse(raw);
    if (!decision) return heuristic();            // unparseable → fallback

    if (decision.action === 'FINAL') {
      return {
        action: 'finish',
        reason: evidence.length ? 'SUFFICIENT' : 'NO_PRODUCTIVE_TOOL',
        rationale: decision.reason || 'planner decided it has enough evidence',
        plannedBy: 'llm',
      };
    }

    // CALL_TOOL — the tool MUST be on the FLOW allow-list. A hallucinated or
    // disallowed tool never reaches the gateway; we fall back safely.
    if (!decision.tool || !allowedTools.includes(decision.tool)) {
      return heuristic();
    }
    return {
      action: 'call_tool',
      toolName: decision.tool,
      input: _stripForbidden(decision.arguments),
      rationale: decision.reason || 'llm-planned',
      plannedBy: 'llm',
    };
  };
}

function _parse(raw) {
  try {
    const m = String(raw).match(/\{[\s\S]*\}/);
    if (!m) return null;
    const j = JSON.parse(m[0]);
    if (j.action !== 'CALL_TOOL' && j.action !== 'FINAL') return null;
    return {
      action: j.action,
      tool: typeof j.tool === 'string' ? j.tool : null,
      arguments: (j.arguments && typeof j.arguments === 'object' && !Array.isArray(j.arguments)) ? j.arguments : {},
      reason: typeof j.reason === 'string' ? j.reason : '',
    };
  } catch {
    return null;
  }
}

function _stripForbidden(args) {
  const out = {};
  for (const [k, v] of Object.entries(args || {})) {
    if (FORBIDDEN_ARG_KEYS.has(norm(k))) continue;   // FLOW-controlled — ignore model attempts
    out[k] = v;
  }
  return out;
}
