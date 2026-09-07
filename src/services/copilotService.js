/**
 * copilotService — routes every conversation turn through the ConversationManager.
 *
 * The ConversationManager decides:
 *   - What kind of message this is (intent classification)
 *   - Whether the Operational Brain is needed at all
 *   - How to structure and tone the response
 *
 * This service wraps the existing capability-aware brain pipeline as a lazy
 * `brainQuery` function. ConversationManager calls it only when the plan requires it.
 */

import { ask }                                            from '../ai/BrainRouter.js';
import { assembleContext, buildEvidence }                 from '../ai/ContextAssembler.js';
import { buildCopilotPrompt }                             from '../ai/PromptBuilder.js';
import { formatCopilotResponse }                          from '../ai/ResponseFormatter.js';
import { TaskType }                                       from '../ai/types.js';
import { planCapabilities }                               from '../ai/reasoning/CapabilityPlanner.js';
import { dispatchCapabilities }                           from '../ai/reasoning/CapabilityDispatcher.js';
import { buildContext, formatContextForPrompt }           from '../ai/reasoning/ContextBuilder.js';
import { analyzeIntent }                                  from '../ai/reasoning/IntentAnalyzer.js';
import { verifySynthesisClaims }                          from '../ai/reasoning/ClaimVerifier.js';
import { processConversationTurn }                        from '../ai/conversation/ConversationManager.js';

// M1 Truthful Copilot — deterministic honest response when there is no evidence.
const INSUFFICIENT_EVIDENCE_MSG = "I don't have enough information in this workspace to answer that yet.";

// Text of all retrieved evidence, for grounding checks (never contains secrets — it
// is the same intel already destined for the prompt).
function _evidenceText(rawChunks = [], capabilityResults = {}) {
  const chunkText = (rawChunks || []).map(c => c.markdown || c.content || c.title || '').join('\n');
  const capText   = Object.values(capabilityResults || {})
    .flatMap(r => Array.isArray(r?.records) ? r.records : [])
    .map(rec => { try { return JSON.stringify(rec); } catch { return ''; } }).join('\n');
  return `${chunkText}\n${capText}`;
}

// People actually present in the evidence — the supported set the ClaimVerifier
// checks the answer against (mirrors OperationalBrain's roster.names input).
export function _supportedPeople(evidenceText) {
  const names = [...String(evidenceText).matchAll(/\b([A-Z][a-z]+\s+[A-Z][a-z]+)\b/g)].map(m => m[1]);
  return new Set(names);
}

// NARROW, evidence-driven numeric guard. Only targets the fabricated status-report
// SCAFFOLDING signatures ("Health Score N/100", "N active projects/customers/incidents",
// "Project X at N%") — the exact templated fabrication P5 surfaced — and only strips a
// figure whose digits are absent from the evidence. It does NOT touch free-form prose
// numbers, so legitimate grounded answers are unaffected.
export function _stripUnsupportedReportFigures(answer, evidenceText) {
  const SCAFFOLD = /(overall health|health score)\s*:?\s*(\d{1,3})\s*\/\s*100|(\d{1,3})\s+active\s+(projects?|customers?|incidents?)|project\s+[A-Z]\s+(?:at|is at)\s+(\d{1,3})\s*%/gi;
  if (!SCAFFOLD.test(answer)) return { answer, stripped: [] };
  const ev = String(evidenceText);
  const stripped = [];
  const out = answer.replace(SCAFFOLD, (match, ...groups) => {
    const num = groups.find(g => /^\d{1,3}$/.test(g || ''));
    if (num && !ev.includes(num)) { stripped.push(match.trim()); return '[unavailable]'; }
    return match; // figure IS supported by evidence — leave it
  });
  return { answer: out, stripped };
}

export async function answerCopilotQuery(workspaceId, {
  pageContext        = '',
  question,
  entityId           = null,
  role               = 'EMPLOYEE',
  healthScore,
  hasIncidents       = false,
  isInboxZero        = false,
  taskJustDone       = false,
  deploymentSuccess  = false,
  sprintCompleted    = false,
  userName           = null,
}) {
  const wsId = String(workspaceId);

  /**
   * brainQuery — the Operational Brain pipeline.
   * ConversationManager calls this only when the conversation plan requires it.
   * For greetings, small talk, thanks, jokes, etc. it is never called.
   */
  const brainQuery = async (queryText) => {
    console.log(`[Copilot] ▶ Operational Brain — "${queryText.slice(0, 60)}"`);

    const intent = await analyzeIntent(queryText, { pageContext, entityId });
    const plan   = planCapabilities(queryText, intent);

    const [capabilityResults, ctx] = await Promise.all([
      dispatchCapabilities(wsId, plan, intent),
      assembleContext({ workspaceId: wsId, query: queryText, entityId, maxChunks: 6 }),
    ]);

    // ── M1 Truthful Copilot: INSUFFICIENT-EVIDENCE GUARD (before the LLM) ──────
    // totalEvidence = sum(capability record counts) + rawChunks.length. Zero evidence
    // means there is nothing legitimate to synthesize, so we DO NOT call the LLM — a
    // deterministic honest response is the only truthful behavior (and avoids the
    // hallucination opportunity + ~29s latency).
    const capabilityCount = Object.values(capabilityResults || {})
      .reduce((n, r) => n + (Number.isFinite(r?.count) ? r.count : (Array.isArray(r?.records) ? r.records.length : 0)), 0);
    const chunkCount    = (ctx.rawChunks || []).length;
    const totalEvidence = capabilityCount + chunkCount;
    if (totalEvidence === 0) {
      console.log('[Copilot] ⓘ insufficient evidence (totalEvidence=0) — deterministic honest response; LLM SKIPPED');
      return { answer: INSUFFICIENT_EVIDENCE_MSG, sources: [], cards: [], actions: [], insufficientEvidence: true, llmCalled: false };
    }

    const builtContext  = buildContext(capabilityResults, intent);
    const contextBlock  = formatContextForPrompt(builtContext, intent);
    const augmentedCtx  = {
      ...ctx,
      knowledge: contextBlock + (ctx.knowledge ? '\n\n' + ctx.knowledge : ''),
    };

    const { messages } = buildCopilotPrompt({ question: queryText, context: augmentedCtx, pageContext, role });

    const aiResponse = await ask({
      taskType:    TaskType.CHAT,
      messages,
      maxTokens:   512,
      temperature: 0.3,
    });

    const evidence  = buildEvidence(ctx.rawChunks ?? [], 5);
    const formatted = formatCopilotResponse({ aiResponse, evidence, chunks: ctx.rawChunks ?? [] });

    // ── M1: post-synthesis verification (reuse existing ClaimVerifier) ─────────
    // Every factual claim reaching the user is grounded against the evidence set.
    // The supported-people set must reflect the FULL context the LLM saw — capability
    // context, 2-hop graph relationships, and memory — not just the raw vector chunks.
    // (Otherwise a legitimately graph-sourced name, e.g. a manager/report, is wrongly
    // flagged as invented and over-redacted.)
    const evidenceText = [
      augmentedCtx.knowledge || '',
      ctx.graphContext || '',
      typeof ctx.memory === 'string' ? ctx.memory : '',
      _evidenceText(ctx.rawChunks ?? [], capabilityResults),
    ].join('\n');
    let finalAnswer = formatted.answer;
    const claim = verifySynthesisClaims(finalAnswer, { people: _supportedPeople(evidenceText), relationships: [] });
    if (claim.status === 'REPAIR') finalAnswer = claim.repaired;               // strip invented people
    const numeric = _stripUnsupportedReportFigures(finalAnswer, evidenceText); // strip fabricated report figures
    finalAnswer = numeric.answer;
    if (claim.status === 'REPAIR' || numeric.stripped.length) {
      console.log(`[Copilot] ✓ verified — claim=${claim.status} unsupported=${JSON.stringify(claim.unsupported)} strippedFigures=${JSON.stringify(numeric.stripped)}`);
    }
    console.log(`[Copilot] ✓ Brain done — ${finalAnswer?.length || 0} chars`);

    return {
      answer:  finalAnswer,
      sources: formatted.sources,
      cards:   formatted.cards   || [],
      actions: formatted.actions || [],
      llmCalled: true,
    };
  };

  // Route through ConversationManager — intent detection, planning, composition
  return processConversationTurn({
    workspaceId:    wsId,
    query:          question,
    brainQuery,
    pageContext,
    userName,
    healthScore,
    hasIncidents,
    isInboxZero,
    taskJustDone,
    deploymentSuccess,
    sprintCompleted,
  });
}
