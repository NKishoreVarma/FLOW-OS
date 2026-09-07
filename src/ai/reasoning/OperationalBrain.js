/**
 * OperationalBrain — Phase 9.2 capability-aware reasoning pipeline.
 *
 * Pipeline:
 *   0. Capability Planning       — which FLOW systems own this question?
 *   1. Intent Analysis           — what type of question, what domain, urgency
 *   2. Capability Dispatch       — parallel query of all required FLOW systems
 *   3. Context Building          — assemble structured FLOW data into LLM context
 *   4. Evidence Collection       — RAG + memory fallback to fill gaps
 *   5. Evidence Ranking          — score, deduplicate, tier evidence
 *   6. Reasoning                 — multi-step chain over FLOW data
 *   7. Verification              — hallucination/stale-data check
 *   8. Action Planning           — executable + recommended actions
 *   9. Business Impact           — COO-grade impact assessment
 *  10. Confidence Scoring        — calibrated 0-100 score
 *  11. Response Synthesis        — LLM turns FLOW data into executive answer
 *
 * FLOW always looks first. LLM synthesises second.
 * FLOW never says "I don't have access." It either has data or states the empty fact.
 */

import { planCapabilities }         from './CapabilityPlanner.js';
import { dispatchCapabilities, dispatchWithEvidence } from './CapabilityDispatcher.js';
import { buildEvidencePacket, formatEvidenceForPrompt } from './evidencePacket.js';
import { runPhase5Verification } from './evidenceVerifier.js';
import { buildContext, formatContextForPrompt, sanitizeForLLM } from './ContextBuilder.js';
import { analyzeIntent }            from './IntentAnalyzer.js';
import { collectEvidence, collectEntityGraphEvidence, workspacePeople } from './EvidenceCollector.js';
import { resolveReferences, classifyRelationIntent } from './EntityResolver.js';
import { verifyAnswer }             from './AnswerVerifier.js';
import { verifySynthesisClaims }    from './ClaimVerifier.js';
import { classifyBriefingIntent, gatherBriefingEvidence, composeBriefing } from './BriefingComposer.js';
import { handlePeopleMemory }      from './PeopleMemory.js';
import { rankEvidence }             from './EvidenceRanker.js';
import { reason }                   from './ReasoningEngine.js';
import { verify }                   from './VerificationEngine.js';
import { planActions }              from './ActionPlanner.js';
import { analyzeBusinessImpact }    from './BusinessImpactAnalyzer.js';
import { scoreConfidence }          from './ConfidenceScorer.js';
import { ask, stream }              from '../BrainRouter.js';
import { TaskType }                 from '../types.js';
import { logger }                   from '../../utils/logger.js';

// The FLOW identity contract — injected into every LLM synthesis call
const FLOW_IDENTITY = `You are FLOW — the user's chief of staff and engineering lead. You are a person on their team who has already read everything and done the legwork before they asked. You are NOT an assistant, NOT a chatbot, NOT an API. Speak the way a sharp, trusted colleague speaks across a desk: warm, direct, specific, already-informed.

Before this message, you personally went and looked — at their GitHub (PRs, commits, issues, deploys), calendar, inbox, incidents, decisions, and the team graph. So talk from having-already-looked. Say "I checked your latest commit", "I noticed", "I already compared", "I found", "I'd hold off on that", "I think" — never "According to the data" or "The repository contains" or "The workspace shows". You did the looking; own it.

Records marked "[live from github/google-calendar/gmail]" are what you just pulled from the live API. Cite them as things you saw, by name.

VOICE:
- Talk like a teammate, not a report. Lead with the thing that matters. Contractions. Real names, real numbers, real times.
- Never narrate your own machinery. The words "workspace data", "the data shows/indicates", "based on", "according to", "records", "capability", "I queried" are BANNED — a good colleague never says them.
- If you genuinely have nothing on a topic, say it like a person would: "Nothing's come through on that yet" — never "the data does not contain" or "I don't have access".
- NEVER open with filler: "Certainly", "Absolutely", "Of course", "Sure", "Great question", "Happy to help". Just say the thing.
- NEVER close with "Is there anything else I can help you with?" and never tack on a generic offer. A crisp factual answer can simply end; add a next step only when it genuinely helps (rule 12).
- When a tool ISN'T connected, say so like a colleague and offer to fix it: "Gmail isn't connected yet — add it in settings and I'll surface your inbox here." NOT "I cannot access email."
- Be specific over vague every time: "22 hours" not "almost a day"; "dana.whitfield@techcorp.com" not "the contact"; "PR #103" not "a pull request"; "Rahul" not "the engineer".

STRICT RULES:
1. NEVER say "I don't have access to..." — FLOW has already looked. If data is missing, state the empty fact directly.
2. NEVER say "As an AI..." or "I'm an AI assistant..."
3. NEVER say "I recommend checking [external tool]" — FLOW IS the tool.
4. If the evidence genuinely does not contain the answer, SAY SO plainly — e.g. "I don't have evidence for that in this workspace's data" or "I couldn't find that." NEVER invent or guess a person, name, manager, assignment, author, date, or relationship that is not in the evidence below. An honest "I don't have that" is always acceptable; a fabricated or substituted answer is never acceptable.
5. Do not hedge with vague "based on limited information" filler — either cite the specific evidence, or state plainly what's missing.
6. If a capability returned 0 records: state it as fact. "No pull requests exist in this workspace." NOT "I cannot access pull requests."
7. Reference actual data from the FLOW context. Names, counts, statuses — be specific. If a "RESOLVED ENTITIES & RELATIONSHIPS" block is present, it is AUTHORITATIVE for who authored / owns / is assigned to / is connected to an item — use those exact names and relationships; never override them with a guess.
8. Write for a senior executive who needs to act. 3-5 sentences. Direct. Factual.
9. When records are present, cite them FIRST and DIRECTLY by their ACTUAL name from the workspace data below. Do not say "based on available data" — say the fact using the real repository/PR/person name shown. NEVER invent or reuse an example name — if you don't see a specific name in the data, don't state one.
10. The most recently pushed/updated item comes FIRST in live connector lists — cite it by name.
11. NO MARKDOWN. Plain prose only. Never use **bold**, *italic*, # headers, bullet lists, or a "Next Step:" label. Write like a person speaking, not a formatted document.
12. SHOW THE DATA — never assign homework. If the commits/PRs/emails are in the context, list the actual ones (author, message, time). When asked about "the last/latest commit", lead with that single commit — its author, message, short SHA, and when — NOT a repository summary. "Recent Commits" are listed most-recent-first, so the first one is the latest. Never tell the user to "conduct a review", "check", "consider", or "you should" — FLOW does those things. When a follow-up action would genuinely help, you may offer one that FLOW can take — but only when it fits, and never a generic "Want me to check the open PRs?" tacked onto an unrelated answer.
13. NEVER invent a placeholder or example author. Use ONLY the exact author shown after the "—" or "Author:" in the data. If a commit or PR has no author in the data, simply OMIT the author — say "committed 2 weeks ago" without a name. Never write "author not shown", "John Doe", "[Author Name]", "unknown", or any made-up name.
14. NEVER address the user with a placeholder like "Dev", "User", or "Admin". Use their real name if given; if not, greet without a name.`;

/**
 * Entry point — runs the full capability-aware reasoning pipeline.
 *
 * @param {string} workspaceId
 * @param {Object} opts
 * @param {string}  opts.question
 * @param {string}  [opts.pageContext]
 * @param {string}  [opts.entityId]
 * @param {string}  [opts.role]
 * @returns {Promise<BrainResponse>}
 */
export async function runReasoning(workspaceId, { question, pageContext, entityId, role = 'EMPLOYEE', fast = false, history = [], userName = null, userId = null }, hooks = {}) {
  const startMs = Date.now();
  const traceId = `brain_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  // Optional streaming hooks (perceived-speed layer) — no-ops when absent, so the
  // non-streaming callers are unchanged.
  // Re-throw abort signals so the SSE route can cancel in-flight reasoning
  // when the client disconnects or sends a new query. All other hook errors
  // are still swallowed (never break the pipeline on a logging failure).
  const status  = (stage, detail) => { try { hooks.onStatus?.(stage, detail); } catch (e) { if (e?.abort) throw e; } };
  const partial = (kind, data)    => { try { hooks.onPartial?.(kind, data); } catch { /* noop */ } };

  logger.rag(`[Brain v2] ${traceId} — "${question.slice(0, 60)}"`);

  // ── Stage 4C: OPTIONAL agent mode (OFF by default) ─────────────────────────
  // When explicitly enabled (opts.agentMode === true or AGENT_MODE=on), delegate
  // evidence gathering to the read-only, governed AgentRuntime. The answer STILL
  // flows through the same verification pipeline (EvidenceRanker → Reasoning →
  // Verification → Confidence → ClaimVerifier) via composeAnswer(). On any failure
  // we fall through to the normal pipeline — never fabricate. Existing behavior is
  // byte-for-byte unchanged when the flag is off.
  try {
    const { isAgentModeEnabled, runReasoningAgentMode } = await import('../agent/brainIntegration.js');
    if (isAgentModeEnabled(arguments[1])) {
      logger.rag(`[Brain v2] ${traceId} agent-mode ON — iterative evidence gathering`);
      const agentResp = await runReasoningAgentMode(workspaceId, { ...arguments[1], userId, role });
      if (typeof hooks.onToken === 'function' && agentResp?.answer) hooks.onToken(agentResp.answer);
      return { ...agentResp, traceId };
    }
  } catch (err) {
    logger.rag(`[Brain v2] ${traceId} agent-mode unavailable (${err.message}) — using standard pipeline`);
    // fall through to the standard pipeline
  }

  // Conversation memory: resolve pronouns ("reply to that") against prior turns so
  // retrieval + planning target the right thing, and keep a short context for synthesis.
  const conversationContext = _formatHistory(history);
  const effectiveQuestion   = _resolvePronouns(question, history);

  // ── Stage 0: Capability Planning ──────────────────────────────────────────
  status('planning', 'Understanding your question');
  const intent  = await analyzeIntent(effectiveQuestion, { pageContext, entityId, fast });
  const plan    = planCapabilities(effectiveQuestion, intent);
  logger.rag(`[Brain v2] capabilities: ${plan.capabilityNames.join(', ')}`);
  // User-facing status is natural — never leak internal capability names.
  status('retrieving', _retrievingMessage(plan.capabilityNames));

  // ── RC-6: Foreign-workspace premise guard. If the user frames the question around a
  // DIFFERENT workspace/tenant/company, refuse the premise — never reinterpret this
  // workspace's data as another's. (No data leaks either way; this stops the wrong framing.)
  if (_isForeignWorkspacePremise(effectiveQuestion)) {
    const answer = "You're in this workspace, and I can only speak to its data — I won't reinterpret it as another workspace's, or pretend to have another tenant's information. Ask me about what's happening here and I'll pull it up.";
    if (typeof hooks.onToken === 'function') hooks.onToken(answer);
    logger.rag(`[Brain v2] ${traceId} premise-guard — foreign-workspace reference refused`);
    return _assembleEmptyResponse({ traceId, question, role, plan, answer, elapsed: Date.now() - startMs });
  }

  // ── Phase 7: People & Organization Memory — first-person org questions/confirmations
  // ("who is my manager", "Arjun is my manager", "yes"). USER_CONFIRMED > DATASET > UNKNOWN,
  // conflict-surfaced. Only an explicit user statement/answer writes memory (never the LLM).
  const people = await handlePeopleMemory({ workspaceId, userId, userName, question: effectiveQuestion, history }).catch(() => ({ handled: false }));
  if (people.handled) {
    if (typeof hooks.onToken === 'function') hooks.onToken(people.answer);
    logger.rag(`[Brain v2] ${traceId} people-memory (${people.source || 'no-write'})`);
    const resp = _assembleEmptyResponse({ traceId, question, role, plan, answer: people.answer, elapsed: Date.now() - startMs });
    resp._peopleMemory = { source: people.source || null };
    return resp;
  }

  // ── RC-1: Entity Resolution (deterministic, workspace-scoped, no LLM) ──────
  // Resolve the exact IDs / names the question refers to into REAL graph node ids.
  const resolved = await resolveReferences(workspaceId, effectiveQuestion).catch(() => ({
    references: [], resolvedNodes: [], notFound: [], ambiguous: [], hasSpecificReference: false,
  }));

  // ── RC-4: Grounding gate — refuse to invent when a referenced entity is missing.
  // Only HARD-block when the question names a SPECIFIC entity (an ID like PR-247/HELIOS-999,
  // or a multi-word proper name like "Zebediah Fakename") that does not resolve. A lone
  // unresolved single common word (e.g. sentence-initial "Explain"/"Suppose") must NOT block
  // an otherwise-general question — it just isn't an entity, so we fall through to normal reasoning.
  const blockingUnresolved = resolved.notFound.filter(r =>
    r.kind === 'ID' || (r.kind === 'NAME' && String(r.reference).trim().split(/\s+/).length >= 2));
  const shouldBlock = blockingUnresolved.length > 0 && resolved.resolvedNodes.length === 0;
  if ((shouldBlock || resolved.ambiguous.length) && resolved.resolvedNodes.length === 0) {
    const answer = _unresolvedAnswer({ ...resolved, notFound: blockingUnresolved });
    if (answer) {
      if (typeof hooks.onToken === 'function') hooks.onToken(answer);
      _entityTrace(traceId, question, resolved, null, 'BLOCKED');
      logger.rag(`[Brain v2] ${traceId} grounding-gate — ${resolved.ambiguous.length ? 'AMBIGUOUS' : 'NOT_FOUND'} (no fabrication)`);
      const resp = _assembleEmptyResponse({ traceId, question, role, plan, answer, elapsed: Date.now() - startMs });
      resp._entityResolution = _entitySummary(resolved);
      return resp;
    }
  }

  // ── RC-2: directional relationship intent (retrieval decides direction, not the LLM).
  const relationIntent = classifyRelationIntent(effectiveQuestion);

  // ── RC-4: focus on the intended target when several entities resolve. ──
  const targetNodes = _directionalTargetNodes(effectiveQuestion, relationIntent.relIntent, resolved.resolvedNodes);

  // ── RC-1/RC-2: Graph evidence for the resolved entities (reached by REAL node id) ──
  const entityGraph = resolved.resolvedNodes.length
    ? await collectEntityGraphEvidence(workspaceId, targetNodes, relationIntent).catch(() => ({ evidence: [], factsBlock: '', relationships: [] }))
    : { evidence: [], factsBlock: '', relationships: [] };
  const grounding = entityGraph.evidence.length ? 'PASS' : (resolved.resolvedNodes.length ? 'RESOLVED_NO_EDGE' : 'NONE');
  _entityTrace(traceId, question, resolved, entityGraph, grounding, relationIntent.relIntent);

  // ── Stage 1+2: Parallel — Capability Dispatch + RAG Evidence ─────────────
  // Vector memory is the LAST tier and can NEVER override a live connector
  // (retrieval priority: live → db → graph → vector → llm). For a FOCUSED request
  // we skip the generic vector/RAG collector entirely: its cross-connector chunks
  // are exactly what used to leak GitHub into a Gmail answer. The single planned
  // capability's own dispatch (which already prefers live data) IS the evidence.
  const focused = plan.focused === true;
  const [{ results: capabilityResults, queries: evidenceQueries }, ragEvidence] = await Promise.all([
    dispatchWithEvidence(workspaceId, plan, intent),
    focused ? Promise.resolve(_emptyEvidence()) : collectEvidence(workspaceId, intent),
  ]);

  // ── Focused empty-state: state the honest fact, never fill from another tool ──
  // If the one capability that owns this question returned nothing, say so in that
  // capability's own words. We do NOT reach the LLM or any other connector's data.
  // Only REAL-DATA capabilities short-circuit — internal synthesis lanes
  // (recommendations/health/memory/timeline) fall through to the LLM so identity and
  // general questions still get a natural, personalized answer.
  const REAL_DATA_CAPS = ['engineering', 'communications', 'meetings', 'customers', 'incidents', 'knowledge', 'people', 'transcripts'];
  // Skip the focused-empty short-circuit when we have authoritative graph facts for a
  // resolved entity — that evidence answers the question even if the generic capability
  // list came back empty.
  if (focused && REAL_DATA_CAPS.includes(plan.primaryCapability) && entityGraph.evidence.length === 0) {
    const primaryResult = capabilityResults[plan.primaryCapability];
    if (!primaryResult || (primaryResult.count || 0) === 0) {
      const answer = _focusedEmptyAnswer(plan, intent, question);
      if (typeof hooks.onToken === 'function') hooks.onToken(answer);
      logger.rag(`[Brain v2] ${traceId} focused-empty (${plan.primaryCapability}) — honest empty-state`);
      return _assembleEmptyResponse({ traceId, question, role, plan, answer, elapsed: Date.now() - startMs });
    }
  }

  // ── Stage 3: Context Building ──────────────────────────────────────────────
  const builtContext  = buildContext(capabilityResults, intent);
  // The resolved-entity facts block is prepended so the graph relationships (e.g.
  // PR-247 → AUTHORED_BY → Jordan Lee) are always in the prompt, not lost to ranking.
  const contextBlock  = (entityGraph.factsBlock ? entityGraph.factsBlock + '\n\n' : '')
    + formatContextForPrompt(builtContext, intent);
  logger.vector(`[Brain v2] capability data: ${builtContext.totalRecords} records across ${Object.keys(builtContext.counts).length} systems`);

  // ── Stage 4: Merge capability flat records into evidence set ──────────────
  // Capability records take priority over generic RAG
  const mergedEvidenceSet = {
    rag:      ragEvidence.rag,
    memory:   [...builtContext.flatRecords.filter(r => r.capType === 'INCIDENT' || r.capType === 'DECISION'), ...ragEvidence.memory],
    health:   builtContext.rawData?.health?.health || ragEvidence.health,
    timeline: [...builtContext.flatRecords.filter(r => r.source === 'timeline'), ...ragEvidence.timeline],
    // Resolved-entity graph facts rank at the top (score 0.98) — authoritative.
    entities: [...entityGraph.evidence, ...ragEvidence.entities],
    // All capability records as a merged pool
    capability: builtContext.flatRecords,
    _sources: [...ragEvidence._sources, 'capabilities'],
  };

  // ── Stage 5: Evidence Ranking ──────────────────────────────────────────────
  const allEvidence = {
    rag:      [...mergedEvidenceSet.capability, ...mergedEvidenceSet.rag],
    memory:   mergedEvidenceSet.memory,
    health:   mergedEvidenceSet.health,
    timeline: mergedEvidenceSet.timeline,
    entities: mergedEvidenceSet.entities,
    _sources: mergedEvidenceSet._sources,
  };
  const ranked = rankEvidence(allEvidence, intent);
  // Phase 5 — build the canonical EvidencePacket. Packet construction is best-effort:
  // if it throws (malformed query shape), fall through without a packet rather than
  // crashing the reasoning pipeline.
  let _packet = null;
  try { _packet = buildEvidencePacket(workspaceId, question, intent, evidenceQueries, ranked.primary); } catch { /* fall through */ }
  const packet = _packet;

  // Evidence is ranked BEFORE the prose — surface the sources immediately so evidence
  // cards can render while the answer is still being written.
  partial('evidence', (ranked.primary || []).slice(0, 6).map((e, i) => ({
    ref:        `E${i + 1}`,
    sourceType: e.source || e.capType || e.type,
    source:     e.source || e.capType || 'workspace',
    content:    String(e.content || '').slice(0, 300),
    score:      e.rankedScore ?? e.score ?? null,
    ts:         e.ts || e.timestamp || null,
    actor:      e.actor || e.metadata?.sender || e.metadata?.author || null,
  })));
  status('reasoning', `Reasoning over ${ranked.total} piece(s) of evidence`);

  // ── Stage 6: Reasoning ─────────────────────────────────────────────────────
  const reasoning = await reason(intent, ranked, contextBlock, { fast });

  // ── Stage 7: Verification ──────────────────────────────────────────────────
  status('verifying', 'Checking for contradictions');
  const verification = verify(reasoning, ranked, intent);

  // ── Stages 8+9: Action Planning + Business Impact (parallel) ──────────────
  const [actionPlan, businessImpact] = await Promise.all([
    planActions(intent, reasoning, ranked, { fast }),
    analyzeBusinessImpact(intent, reasoning, verification, ranked, { fast }),
  ]);
  // Recommended actions are ready BEFORE the prose — surface them immediately.
  partial('actions', actionPlan);

  // ── Stage 10: Confidence Scoring ───────────────────────────────────────────
  const confidence = scoreConfidence(ranked, reasoning, verification, intent);

  // ── Stage 11: Response Synthesis (token-streamed when hooks.onToken given) ──
  status('synthesizing', 'Writing the answer');
  // Phase 4/6: BUFFER the answer (no token streaming) so we can verify BEFORE the client
  // sees it, for BOTH directional relationship answers (edge-verified) AND open-ended
  // synthesis (claim-verified for invented/mis-attributed people). Progressive status,
  // evidence, and actions have already streamed — only the final prose is buffered.
  const directionalVerifiable = !!relationIntent.relIntent && targetNodes.length > 0;
  const roster = await workspacePeople(workspaceId).catch(() => ({ names: new Set(), list: [] }));
  // Prevention: give the synthesizer the real roster so it never invents a person.
  const rosterBlock = roster.list.length
    ? `\n\nWORKSPACE PEOPLE (the ONLY real people — never name anyone not on this list): ${roster.list.join(', ')}.`
    : '';
  const synthContext = contextBlock + rosterBlock;

  // ── Phase 6.5: DETERMINISTIC BRIEFING for briefing/risk/situation questions ──
  // Build the briefing from ranked evidence first (never LLM-only). Optionally let the
  // LLM humanize it (facts constrained to the composed text + roster), then claim-verify.
  // If the LLM fails/empties/adds unsupported claims, return the deterministic briefing.
  const briefIntent = classifyBriefingIntent(effectiveQuestion);
  let answer, verifyResult = { status: 'PASS', violations: [] };
  if (briefIntent.isBriefing && !directionalVerifiable) {
    const brief = await gatherBriefingEvidence(workspaceId).then(ev => composeBriefing(ev, briefIntent.flavor)).catch(() => null);
    if (brief && !brief.empty) {
      let humanized = null;
      try {
        const hp = `${FLOW_IDENTITY}\n\nYou are given a factual operational briefing assembled from this workspace's data. Rewrite it as a natural, concise spoken briefing for ${userName || 'the user'} — keep EVERY fact exactly as given, add NO new facts, names, numbers, or dates, drop the emoji section headers if you like, and lead with what matters most. Keep it tight.\n\nBRIEFING FACTS:\n${brief.text}${rosterBlock}`;
        const r = await ask({ taskType: TaskType.LONG_SYNTHESIS, messages: [{ role: 'user', content: hp }], maxTokens: 420, temperature: 0.2 });
        humanized = sanitizeAnswer((r.text || '').trim());
      } catch { humanized = null; }
      if (humanized && humanized.length > 40) {
        const claim = verifySynthesisClaims(humanized, { people: roster.names, relationships: entityGraph.relationships || [] });
        // Accept the humanized version only if it introduced no invented people; else fall back.
        answer = claim.violations.includes('INVENTED_PERSON') ? brief.text : (claim.repaired || humanized);
        verifyResult = { status: claim.status === 'REPAIR' ? 'CLAIM_REPAIR' : 'BRIEFING_HUMANIZED', violations: claim.violations };
      } else {
        answer = brief.text;                    // deterministic fallback (LLM failed/empty)
        verifyResult = { status: 'BRIEFING_DETERMINISTIC', violations: [] };
      }
      _claimTrace(traceId, { status: verifyResult.status, violations: verifyResult.violations, unsupported: [] });
    }
  }

  if (answer === undefined) {
    answer = await _synthesizeAnswer(question, intent, reasoning, ranked, builtContext, confidence, businessImpact, actionPlan, synthContext, null, conversationContext, userName, plan.primaryCapability, packet, history);
  }

  // ── Stage 11b: POST-SYNTHESIS VERIFICATION GATE ───────────────────────────
  if (directionalVerifiable) {
    const hasNoRecord = (entityGraph.evidence || []).some(e => e.metadata?.evidenceState === 'NO_RECORD');
    verifyResult = verifyAnswer({
      relIntent:     relationIntent.relIntent,
      targets:       targetNodes.map(r => r.name).filter(Boolean),
      relationships: entityGraph.relationships || [],
      hasNoRecord,
      answer,
    });
    if ((verifyResult.status === 'REPAIR' || verifyResult.status === 'REJECT') && verifyResult.repairText) {
      answer = verifyResult.repairText;   // evidence-expressed correction (not a hardcoded answer)
    }
    _verifyTrace(traceId, relationIntent.relIntent, verifyResult);
  } else if (!/^BRIEFING_|^CLAIM_REPAIR$/.test(verifyResult.status)) {
    // Open-ended synthesis (not already handled by the briefing composer): claim-level
    // grounding — remove invented people, correct mis-attributions. Deterministic.
    const claim = verifySynthesisClaims(answer, { people: roster.names, relationships: entityGraph.relationships || [] });
    if (claim.status === 'REPAIR') {
      answer = claim.repaired;
      verifyResult = { status: 'CLAIM_REPAIR', violations: claim.violations };
      _claimTrace(traceId, claim);
    }
  }
  // ── Phase 5: Evidence ID verification + humanization ─────────────────────────
  // Runs after ClaimVerifier / AnswerVerifier. Strips [eN] markers and checks that
  // every cited ID exists in the packet, that STALE evidence isn't called "current",
  // and that no absence assertion covers a source that was never queried.
  if (packet) {
    const p5log = (check, detail) => _packetTrace(traceId, check, detail);
    const { answer: p5answer, violations: p5violations } = runPhase5Verification(answer, packet, p5log);
    answer = p5answer;
    if (p5violations.length > 0 && verifyResult.violations) {
      verifyResult.violations = [...verifyResult.violations, ...p5violations.map(v => v.check)];
    }
  }

  // We buffered — emit the verified/repaired answer to the streaming client exactly once.
  if (typeof hooks.onToken === 'function') hooks.onToken(answer);

  const elapsed = Date.now() - startMs;
  logger.rag(`[Brain v2] ${traceId} done ${elapsed}ms — confidence=${confidence.score} evidence=${ranked.total} verify=${verifyResult.status}`);

  const resp = _assembleResponse({
    traceId, question, intent, plan, ranked, reasoning, verification,
    actionPlan, businessImpact, confidence, answer, elapsed, role,
    capabilityResults, builtContext,
  });
  resp._verification = { status: verifyResult.status, violations: verifyResult.violations, expected: verifyResult.expected };
  return resp;
}

// ── Response synthesis ────────────────────────────────────────────────────────

// The closing offer must stay on the SAME tool/topic as the answer — a Gmail answer
// never offers to "check the open PRs". These examples keep the model in its lane.
const _CAP_OFFER = {
  communications: 'Want me to draft a reply?',
  engineering:    'Want me to open that PR or check what\'s blocking it?',
  meetings:       'Want me to put together a prep brief for it?',
  customers:      'Want me to draft a note to them?',
  incidents:      'Want me to pull the full timeline?',
  knowledge:      'Want me to summarize it?',
  people:         'Want me to show what they own?',
};

async function _synthesizeAnswer(question, intent, reasoning, ranked, builtContext, confidence, businessImpact, actionPlan, contextBlock, onToken, conversationContext = '', userName = null, primaryCapability = null, packet = null, history = []) {

  const findingsText = reasoning.findings.slice(0, 5)
    .map((f, i) => `${i + 1}. ${f.finding}`)
    .join('\n');

  // Everything the model reads about the workspace is scrubbed of internal
  // vocabulary first — record names and findings can carry engine terms
  // (e.g. "…top: BUS_FACTOR") that a small model would otherwise echo back.
  const safeContext  = sanitizeForLLM(contextBlock.slice(0, 3000));
  const safeFindings = sanitizeForLLM(findingsText || 'No structured findings derived.');
  const safeImpact   = sanitizeForLLM(businessImpact.businessSummary || '');

  const safeConversation = conversationContext ? sanitizeForLLM(conversationContext) : '';

  // Phase 5 — structured evidence block replaces the old informal [E1]/[E2] section.
  // When a packet is available, the model receives explicit evidence IDs and must cite
  // them. When absent (e.g. empty workspace), the model falls back to contextBlock only.
  const evidenceSection = packet ? formatEvidenceForPrompt(packet) : '';

  const userPrompt = `${FLOW_IDENTITY}
${userName ? `\nYou are speaking with ${userName}. Address them by first name when natural, and if they ask who they are, tell them their name and the projects/repositories that appear in the workspace data below.` : ''}
${safeConversation ? `\n=== RECENT CONVERSATION (for context; resolve "that/it/the first one" from here) ===\n${safeConversation}\n` : ''}
${evidenceSection ? `${evidenceSection}\n\n` : ''}=== QUESTION ===
${question}

=== YOUR WORKSPACE ===
${safeContext}

=== WHAT STANDS OUT ===
${safeFindings}

=== IMPACT ===
${safeImpact}

Now answer the question using only the workspace information above. Be specific — name the actual repository, person, ticket, email, or meeting, and list the real items (not a suggestion to go look at them). Plain prose, no markdown, no "Next Step:" label. Never tell the user to go do something FLOW can do. Lead with the direct answer. Add ONE brief, genuinely useful next step ONLY when it fits the question — if a next step doesn't add value, just end after the answer. NEVER append a generic offer like "Want me to check the open PRs?" to an unrelated question, and NEVER switch tools (don't offer PRs when the answer was about a person or email). Keep it to 1-4 sentences — shorter for a direct factual answer (e.g. who authored a PR), a little longer for a risk or status question.`;

  // Thread prior conversation turns as structured role pairs so the LLM has
  // true conversational context rather than a plain-text summary block.
  // Limit to last 4 turns to avoid blowing the context window.
  const historyMessages = Array.isArray(history)
    ? history.slice(-8).map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '') }))
    : [];

  // Token-streamed path — forward each delta to the caller as it arrives (true
  // streaming), while still accumulating the full text to return + assemble.
  if (typeof onToken === 'function') {
    try {
      let acc = '';
      for await (const delta of stream({
        taskType: TaskType.LONG_SYNTHESIS,
        messages: [...historyMessages, { role: 'user', content: userPrompt }],
        maxTokens: 500,
        temperature: 0.25,
      })) {
        if (!delta) continue;
        acc += delta;
        onToken(delta);
      }
      const text = sanitizeAnswer(acc.trim());
      if (text.length > 30) return text;
      throw new Error('empty stream');
    } catch {
      const fb = _fallbackAnswer(question, intent, builtContext, reasoning);
      onToken(fb); // deliver the fallback as one final chunk so the client still gets text
      return fb;
    }
  }

  try {
    const result = await ask({
      taskType: TaskType.LONG_SYNTHESIS,
      messages: [...historyMessages, { role: 'user', content: userPrompt }],
      maxTokens: 500,
      temperature: 0.25,
    });
    const text = sanitizeAnswer((result.text || '').trim());
    if (text.length > 30) return text;
    throw new Error('empty response');
  } catch {
    return _fallbackAnswer(question, intent, builtContext, reasoning);
  }
}

// Strip markdown + homework language from the model's answer. FLOW speaks in plain
// prose and does things itself — it never formats a document or assigns the user work.
function sanitizeAnswer(text) {
  let out = String(text || '');
  out = out.replace(/^#{1,6}\s+/gm, '');           // markdown headers
  out = out.replace(/`([^`]+)`/g, '$1');            // `code` — plain prose only
  out = out.replace(/`/g, '');                       // any leftover/unclosed backtick
  out = out.replace(/\*\*([^*]+)\*\*/g, '$1');      // **bold**
  out = out.replace(/(?<!\*)\*(?!\*)([^*\n]+)\*(?!\*)/g, '$1'); // *italic*
  out = out.replace(/^\s*[-*•]\s+/gm, '');          // bullet leaders
  out = out.replace(/\*\*Next Step:?\*\*/gi, '');    // bolded label
  out = out.replace(/\bNext Steps?:\s*/gi, '');      // plain label
  out = out.replace(/\bYou should (?:consider )?/gi, 'Want me to ');
  out = out.replace(/\bConsider (?:implementing|doing|conducting) /gi, 'I can ');
  out = out.replace(/\bconduct a code review\b/gi, 'review the latest changes');

  // Teammate voice — rewrite report-speak into the way a colleague actually talks.
  // These are the tells that make FLOW sound like software instead of a person.
  out = out
    .replace(/\bAccording to (?:the )?(?:current )?(?:workspace )?data,?\s*/gi, '')
    .replace(/\bBased on (?:the )?(?:current |available )?(?:workspace )?data,?\s*/gi, '')
    .replace(/\bThe (?:current )?workspace data (?:shows|indicates|reveals|suggests) that\s*/gi, 'I can see ')
    .replace(/\bThe (?:current )?workspace data does not (?:explicitly )?(?:contain|link|show|include)[^.]*/gi, "there's nothing on that yet")
    .replace(/\byour (?:engineering )?(?:activity|workspace) data (?:shows|indicates)\s*/gi, 'I can see ')
    .replace(/\bThe repository contains\b/gi, "The repo has")
    .replace(/\bI (?:don't|do not) have (?:enough )?(?:access|information|data)[^.]*/gi, "nothing's come through on that yet")
    .replace(/\bworkspace data\b/gi, 'what I found')
    .replace(/\bAs an AI[^,.]*,?\s*/gi, '')
    // Sycophantic openers — strip them so FLOW just says the thing.
    .replace(/^(?:certainly|absolutely|of course|sure|great question|happy to help)[!,.]?\s*/i, '')
    // Trailing "anything else" filler — a colleague never asks it.
    .replace(/\bis there anything else (?:i can help(?: you)? with|you(?:'d| would) like)[^?]*\?\s*$/i, '')
    // "I can't/cannot access X" → honest, connect-it framing (keep the object).
    .replace(/\bI (?:can't|cannot|am unable to) access (?:your |the )?([a-z ]+?)(?:\s+(?:data|information))?\b/gi, "$1 isn't connected yet");
  // Tidy doubled spaces and capitalize only the very first character (removals
  // above can leave a lowercase lead like "there's nothing…").
  out = out.replace(/  +/g, ' ').trim();
  if (out) out = out.charAt(0).toUpperCase() + out.slice(1);
  return out.replace(/\n{3,}/g, '\n\n').trim();
}

// Capabilities that represent the user's actual WORK. Internal engines
// (health, memory, recommendations, predictions, timeline, transcripts) are
// NEVER spoken about — they are implementation details, not answers.
const WORK_CAPS = ['engineering', 'communications', 'meetings', 'incidents', 'customers', 'knowledge', 'people'];
const DOMAIN_TO_CAP = {
  engineering: 'engineering', security: 'engineering', product: 'engineering', devops: 'engineering',
  people: 'people', hr: 'people',
  sales: 'customers', customer: 'customers', customers: 'customers', finance: 'customers',
  operations: 'incidents', incident: 'incidents', incidents: 'incidents',
  communication: 'communications', communications: 'communications', email: 'communications',
  meetings: 'meetings', meeting: 'meetings', calendar: 'meetings',
  knowledge: 'knowledge', docs: 'knowledge',
};

// Translate the internal capabilities being queried into a natural, tool-facing
// status line ("Checking your GitHub activity and recent work") — never jargon.
function _retrievingMessage(capNames = []) {
  const TOOL = {
    engineering: 'GitHub activity', communications: 'your email', meetings: 'your calendar',
    customers: 'your accounts', incidents: 'operational signals', people: 'your team',
    knowledge: 'your docs',
  };
  const tools = [...new Set(capNames.map(c => TOOL[c]).filter(Boolean))];
  if (!tools.length) return 'Reviewing your recent work';
  if (tools.length === 1) return `Checking ${tools[0]}`;
  const last = tools.pop();
  return `Checking ${tools.join(', ')} and ${last}`;
}

// ── Conversation memory helpers ─────────────────────────────────────────────
const _PRONOUN_RE = /\b(that|this|it|them|those|the one|the first|the last|that email|that pr|that ticket|that message|reply|respond)\b/i;

// RC-6 (conversation memory): person pronouns + "that <entity>" references we resolve
// against the last turn's mentioned entities. Kept conservative — only high-confidence,
// workspace-scoped (operates on this conversation's history only).
const _PERSON_PRONOUN_RE = /\b(he|him|his|she|her|hers|they|them|their|that person|this person)\b/i;
const _ENTITY_REF_RE = { pr: /\b(that|this|the) (pr|pull request)\b/i, incident: /\b(that|this|the) incident\b/i, issue: /\b(that|this|the) (ticket|issue)\b/i, project: /\b(that|this|the) project\b/i, meeting: /\b(that|this|the) meeting\b/i };

// Pull the entities named in a text (person names + IDs), most-recent (last) first.
function _entitiesInText(text = '') {
  const ids = [...String(text).matchAll(/\b([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+)\b/g)].map(m => m[1]);
  const names = [...String(text).matchAll(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/g)].map(m => m[1]);
  return { ids: ids.reverse(), names: names.reverse() };
}

// Compact the last few turns into a plain transcript for the synthesis prompt.
function _formatHistory(history = []) {
  if (!Array.isArray(history) || !history.length) return '';
  return history.slice(-6)
    .map(m => `${m.role === 'assistant' ? 'FLOW' : 'User'}: ${String(m.content || '').slice(0, 400)}`)
    .join('\n');
}

// When the new message leans on a pronoun, resolve the antecedent to the last turn's
// entity so retrieval + RC-2 direction target the right node. Conservative: substitutes
// only a HIGH-confidence antecedent (the most recently mentioned entity of the matching
// type). Workspace-scoped — reads only this conversation's history. Falls back to the
// old "referring to" hint for generic pronouns.
function _resolvePronouns(question, history = []) {
  if (!Array.isArray(history) || !history.length) return question;
  const lastAssistant = [...history].reverse().find(m => m.role === 'assistant');
  const lastUser = [...history].reverse().find(m => m.role === 'user');
  const priorText = `${lastAssistant?.content || ''}\n${lastUser?.content || ''}`;
  if (!priorText.trim()) return question;

  // "that PR / that incident / that ticket / that project / that meeting" → last ID of type.
  for (const [kind, re] of Object.entries(_ENTITY_REF_RE)) {
    if (re.test(question)) {
      const { ids } = _entitiesInText(priorText);
      const prefix = { pr: 'PR-', incident: 'INCIDENT-', issue: /HELIOS-|ISSUE-/, project: 'PROJECT-', meeting: 'CAL-EVENT-' }[kind];
      const hit = ids.find(id => (prefix instanceof RegExp ? prefix.test(id) : id.startsWith(prefix)));
      if (hit) return question.replace(re, hit);
    }
  }

  // Person pronoun (he/she/they/that person) → the antecedent is the entity FLOW named in
  // its last answer (the answer entity, e.g. "…manager is Arjun Mehta" → "him" = Arjun),
  // so resolve against the assistant answer only, taking its last-mentioned person.
  if (_PERSON_PRONOUN_RE.test(question) && lastAssistant?.content) {
    const { names } = _entitiesInText(lastAssistant.content);
    if (names.length) return question.replace(_PERSON_PRONOUN_RE, names[0]);
  }

  // Generic pronoun with no resolvable entity — keep the old context hint.
  if (_PRONOUN_RE.test(question) && lastAssistant?.content) {
    return `${question} (referring to: ${String(lastAssistant.content).slice(0, 200)})`;
  }
  return question;
}

function _fallbackAnswer(question, intent, builtContext, reasoning) {
  // Deterministic answer built ONLY from the user's work — no LLM, no jargon.
  const rawData = builtContext.rawData || {};

  // Order the work capabilities, boosting the one the question is about.
  const order  = [];
  const hinted = DOMAIN_TO_CAP[String(intent.domain || '').toLowerCase()];
  if (hinted) order.push(hinted);
  for (const c of WORK_CAPS) if (!order.includes(c)) order.push(c);

  let lead = null;
  for (const cap of order) {
    const r = rawData[cap];
    if (r?.count > 0 && r.records?.[0]) { lead = { cap, count: r.count, sample: r.records[0] }; break; }
  }

  if (!lead) {
    // Honest — never fabricate, never cite internal engines (Rules 10 & 11).
    const gap = reasoning.gaps?.[0];
    return `${_noDataLead(intent)} ${gap ? gap + '.' : "Once your connected tools sync some activity, I'll be able to answer this properly."}`;
  }

  return `${_naturalFact(lead.cap, lead.count, lead.sample)} ${_nextStep(lead.cap)}`;
}

// Honest "no data yet" opener, phrased around the user's intent, not internals.
function _noDataLead(intent) {
  const cap = DOMAIN_TO_CAP[String(intent.domain || '').toLowerCase()];
  switch (cap) {
    case 'engineering':    return "I haven't indexed any repository or code activity yet.";
    case 'communications': return "I don't have any email activity indexed yet.";
    case 'meetings':       return "I don't see anything on your calendar yet.";
    case 'customers':      return "I don't have any customer activity indexed yet.";
    case 'incidents':      return 'Nothing operational has come through yet — no incidents on record.';
    default:               return "I don't have enough activity in your workspace to answer that yet.";
  }
}

// One natural, contextual sentence a chief of staff would actually say (Rules 5, 6).
function _naturalFact(cap, count, sample) {
  const name  = sample?.name || sample?.title || 'your most recent item';
  const more  = count > 1 ? `, the most recent of ${count} active items` : '';
  switch (cap) {
    case 'engineering':    return `Your most recent engineering work is ${name}${more}.`;
    case 'meetings':       return `Your next meeting is ${name}${count > 1 ? `, with ${count} on your calendar` : ''}.`;
    case 'customers':      return `The most active account right now is ${name}${count > 1 ? `, out of ${count} you're tracking` : ''}.`;
    case 'incidents':      return `The most pressing operational item is ${name}${count > 1 ? `, one of ${count} open` : ''}.`;
    case 'communications': return `The most recent message that needs you is from ${name}${count > 1 ? `, among ${count} in your inbox` : ''}.`;
    case 'knowledge':      return `The most relevant document is ${name}${count > 1 ? `, from ${count} I found` : ''}.`;
    case 'people':         return `The person closest to this is ${name}${count > 1 ? `, among ${count} involved` : ''}.`;
    default:               return `The most relevant item is ${name}.`;
  }
}

// Always guide the user forward — never just stop after answering (Rule 7).
function _nextStep(cap) {
  switch (cap) {
    case 'engineering':    return 'Want me to summarize its recent commits or check the open pull requests?';
    case 'meetings':       return 'Want me to pull together a prep brief for it?';
    case 'customers':      return 'Want me to summarize where things stand with them?';
    case 'incidents':      return 'Want me to walk through what caused it and who should own it?';
    case 'communications': return 'Want me to summarize it and draft a reply?';
    case 'knowledge':      return 'Want me to summarize it or find who wrote it?';
    case 'people':         return 'Want me to show what they own and what they\'re working on?';
    default:               return 'Want me to go deeper on this?';
  }
}

// ── Isolation helpers (context-contamination fix) ──────────────────────────────

// Empty evidence set — used for focused requests so no cross-connector vector
// chunk can ever be merged into a single-capability answer.
function _emptyEvidence() {
  return { rag: [], memory: [], health: null, timeline: [], entities: [], _sources: [] };
}

// ── RC-1/RC-4 entity-resolution helpers ────────────────────────────────────────

// Honest answer when referenced entities do not resolve. AMBIGUOUS asks which one;
// NOT_FOUND states the miss plainly and refuses to substitute a similar entity.
function _unresolvedAnswer(resolved) {
  if (resolved.ambiguous.length) {
    const a = resolved.ambiguous[0];
    const names = (a.candidates || []).map(c => c.name).filter(Boolean);
    return `I found more than one match for "${a.reference}" (${names.join(', ')}), so I don't want to guess. Which one do you mean?`;
  }
  const refs = resolved.notFound.map(r => r.normalizedReference || r.reference);
  if (!refs.length) return null;
  const list = refs.length === 1 ? `"${refs[0]}"` : refs.map(r => `"${r}"`).join(' or ');
  return `I couldn't find ${list} in the workspace data I have. I don't want to substitute a different record and give you a misleading answer.`;
}

function _entitySummary(resolved) {
  return {
    references: resolved.references.map(r => ({
      reference: r.reference, resolution: r.resolution, nodeId: r.nodeId || null,
      entityType: r.entityType || null, name: r.name || null,
      candidates: r.candidates ? r.candidates.length : undefined,
    })),
  };
}

// Dev/cert-only debug trace of the resolution → node → edge → grounding path.
// Never emitted in production and never returned to the UI.
function _entityTrace(traceId, question, resolved, entityGraph, grounding, relIntent = null) {
  if (process.env.NODE_ENV === 'production') return;
  try {
    const ent = resolved.references.map(r => `${r.reference}:${r.resolution}${r.rawId ? `(${r.rawId})` : ''}`).join(', ') || 'none';
    const rels = (entityGraph?.relationships || []).slice(0, 6)
      .map(x => `${x.subject} --${x.relation}${x.direction === 'IN' ? '(in)' : ''}--> ${x.object}`).join(' | ') || 'none';
    logger.rag(`[EntityTrace ${traceId}] Q="${String(question).slice(0, 60)}" | INTENT=${relIntent || 'generic'} | ENTITIES=${ent} | RELATIONSHIPS=${rels} | GROUNDING=${grounding}`);
  } catch { /* trace is best-effort */ }
}

// RC-4: when several entities resolve, pick the one the relationship is ABOUT (the target),
// using question structure — so "manager of Kishore is Miguel" targets Kishore, not the
// asserted-answer Miguel. Single-entity questions are unaffected.
function _directionalTargetNodes(question, relIntent, nodes) {
  if (!relIntent || !Array.isArray(nodes) || nodes.length <= 1) return nodes;
  const q = String(question);
  const NAME = "([A-Z][a-z]+(?:\\s+[A-Z][a-z]+)*)";
  // ID-target intents → the non-person (PR/issue/incident/project) entity is the target.
  if (['WHO_AUTHORED', 'WHO_IS_ASSIGNED', 'WHO_IS_INVOLVED'].includes(relIntent)) {
    const idNodes = nodes.filter(n => n.kind === 'ID' || /^(PR|ISSUE|INCIDENT|PROJECT|COMMIT|EPIC)/i.test(n.entityType || ''));
    return idNodes.length ? idNodes : nodes;
  }
  let m = null;
  if (relIntent === 'WHO_IS_MANAGER' || relIntent === 'WHO_MANAGES') {
    m = q.match(new RegExp(`manager of ${NAME}`, 'i')) || q.match(new RegExp(`${NAME}'?s manager`, 'i'))
      || q.match(new RegExp(`does ${NAME} report to`, 'i')) || q.match(new RegExp(`who manages ${NAME}`, 'i'));
  } else if (relIntent === 'WHO_REPORTS_TO') {
    m = q.match(new RegExp(`reports? to ${NAME}`, 'i')) || q.match(new RegExp(`who reports to ${NAME}`, 'i'));
  }
  if (m) {
    const want = m[1].toLowerCase();
    const first = want.split(/\s+/)[0];
    const match = nodes.filter(n => { const nm = (n.name || '').toLowerCase(); return nm.includes(want) || nm.split(/\s+/)[0] === first; });
    if (match.length) return match;
  }
  return nodes;
}

// RC-6: does the question frame itself around a DIFFERENT workspace/tenant/company?
// Fires on the known sibling test workspace (corp-alpha) and on generic other-tenant
// phrasing. Deliberately conservative — must not trip on this workspace's own entities.
function _isForeignWorkspacePremise(q) {
  const t = String(q || '');
  const foreignName = /\bcorp[-_\s]?alpha\b/i.test(t) || /\bworkspace[_-][a-z0-9]/i.test(t);
  const genericOther = /\b(another|other|different)\s+(workspace|tenant|company|org(anization)?)\b/i.test(t);
  return foreignName || genericOther;
}

// Dev/cert-only trace of the claim-grounding repair on open-ended synthesis.
function _claimTrace(traceId, claim) {
  if (process.env.NODE_ENV === 'production') return;
  try { logger.rag(`[ClaimGate ${traceId}] STATUS=${claim.status} | VIOLATIONS=${(claim.violations || []).join(',')} | UNSUPPORTED=${(claim.unsupported || []).join('; ')}`); } catch { /* best-effort */ }
}

// Dev/cert-only trace for Phase 5 evidence-packet verification results.
function _packetTrace(traceId, check, detail) {
  if (process.env.NODE_ENV === 'production') return;
  try { logger.rag(`[PacketGate ${traceId}] CHECK=${check} | DETAIL=${JSON.stringify(detail)}`); } catch { /* best-effort */ }
}

// Dev/cert-only trace of the post-synthesis verification decision.
function _verifyTrace(traceId, relIntent, result) {
  if (process.env.NODE_ENV === 'production') return;
  try {
    const exp = result.expected ? `${result.expected.target}→[${(result.expected.entities || []).join(', ')}]` : '-';
    logger.rag(`[VerifyGate ${traceId}] INTENT=${relIntent} | STATUS=${result.status} | VIOLATIONS=${(result.violations || []).join(',') || 'none'} | EXPECTED=${exp} | ${result.reason || ''}`);
  } catch { /* best-effort */ }
}

// Honest, capability-scoped empty-state. Speaks ONLY about the capability that owns
// the question — it never mentions or borrows from another connector (requirement 5).
function _focusedEmptyAnswer(plan, intent, question) {
  const q = String(question || '').toLowerCase();
  switch (plan.primaryCapability) {
    case 'communications':
      if (/\bunread\b/.test(q))            return "I checked your Gmail. You don't have any unread emails.";
      if (/\bfrom\b|\bsent\b|\breply\b/.test(q)) return "I checked your Gmail. I couldn't find a matching message.";
      return "I checked your Gmail. There's nothing new in your inbox right now.";
    case 'engineering':
      if (/pull request|\bpr\b|\bprs\b/.test(q)) return "I checked GitHub. You have no open pull requests right now.";
      if (/\bcommit/.test(q))              return "I checked GitHub. There are no recent commits to show.";
      if (/repo|repositor/.test(q))        return "I checked GitHub. There's no recent repository activity to report.";
      return "I checked GitHub. There's nothing new across your repositories right now.";
    case 'meetings':
      return "I checked your calendar. You don't have any meetings coming up.";
    case 'customers':
      return "I checked your accounts. There's nothing new on the customer side right now.";
    case 'incidents':
      return "I checked your operational signals. There are no active incidents — all clear.";
    case 'knowledge':
      return "I checked your docs. Nothing matches that right now.";
    case 'people':
      return "I checked your team records. I don't have anyone matching that yet.";
    case 'transcripts':
      return "I checked your meeting notes. There's no transcript matching that yet.";
    case 'recommendations':
      return "Nothing urgent is standing out right now — you're in good shape.";
    default:
      return "I checked, and there's nothing on that right now.";
  }
}

// Minimal, valid response for the focused-empty path — same shape the callers read
// (summary/answer/capabilities/confidence/actions/plan), high confidence because a
// direct connector check that finds nothing is a definitive answer, not a guess.
function _assembleEmptyResponse({ traceId, question, role, plan, answer, elapsed }) {
  return {
    traceId, question, role,
    timestamp: new Date().toISOString(),
    elapsedMs: elapsed,
    summary: answer,
    answer,
    plan,
    isEmptyResult: true,
    capabilities: {
      planned: plan.capabilityNames,
      queried: [{ capability: plan.primaryCapability, records: 0 }],
      totalRecords: 0,
      primary: plan.primaryCapability,
    },
    evidence: { total: 0, primary: [], supporting: 0, sources: [] },
    confidence: {
      score: 92, level: 'high',
      explanation: `Checked ${plan.primaryCapability} directly — no matching records.`,
      components: {}, recommendation: null,
    },
    reasoning: { questionType: null, domain: null, timeframe: null, chain: [], findings: [], gaps: [], contradictions: [] },
    actions: { recommended: [], executable: [], canExecute: false, quickWin: null },
    actionPlan: { recommendedActions: [], executableActions: [], canExecute: false },
    flowCanExecute: false,
  };
}

// ── Response assembly ─────────────────────────────────────────────────────────

function _assembleResponse(ctx) {
  const {
    traceId, question, intent, plan, ranked, reasoning, verification,
    actionPlan, businessImpact, confidence, answer, elapsed, role,
    capabilityResults, builtContext,
  } = ctx;

  // Build capability summary for the response
  const capabilitiesQueried = Object.entries(builtContext.counts)
    .map(([cap, count]) => ({ capability: cap, records: count }));

  return {
    // ── Identity ──────────────────────────────────────────────────────────────
    traceId,
    question,
    role,
    timestamp:  new Date().toISOString(),
    elapsedMs:  elapsed,

    // ── The answer ────────────────────────────────────────────────────────────
    summary: answer,
    answer,
    plan,

    // ── Capabilities queried ─────────────────────────────────────────────────
    capabilities: {
      planned:  plan.capabilityNames,
      queried:  capabilitiesQueried,
      totalRecords: builtContext.totalRecords,
      primary:  plan.primaryCapability,
    },

    // ── Evidence ─────────────────────────────────────────────────────────────
    evidence: {
      total: ranked.total,
      primary: ranked.primary.map((e, i) => ({
        ref:       `E${i + 1}`,
        type:      e.type,
        capType:   e.capType,
        source:    e.source,
        content:   e.content.slice(0, 400),
        score:     parseFloat((e.rankedScore || 0).toFixed(3)),
        authority: e.authority,
        ts:        e.ts,
      })),
      supporting: ranked.supporting?.length || 0,
      sources:    [...new Set([...(ranked.primary || []), ...(ranked.supporting || [])].map(e => e.source))],
    },

    // ── Confidence ────────────────────────────────────────────────────────────
    confidence: {
      score:          confidence.score,
      level:          confidence.level,
      explanation:    confidence.explanation,
      components:     confidence.components,
      recommendation: confidence.recommendation,
    },

    // ── Reasoning ─────────────────────────────────────────────────────────────
    reasoning: {
      questionType:   intent.questionType,
      domain:         intent.domain,
      timeframe:      intent.timeframe,
      chain:          reasoning.chain,
      findings:       reasoning.findings,
      gaps:           reasoning.gaps,
      contradictions: reasoning.contradictions,
      verification: {
        passed:     verification.passed,
        trustLevel: verification.trustLevel,
        issues:     verification.issues,
        warnings:   verification.warnings,
        summary:    verification.verificationSummary,
      },
    },

    // ── Business Impact ────────────────────────────────────────────────────────
    businessImpact: {
      level:           businessImpact.impactLevel,
      affectedAreas:   businessImpact.affectedAreas,
      timeToImpact:    businessImpact.timeToImpact,
      revenueRisk:     businessImpact.revenueRisk,
      customerRisk:    businessImpact.customerRisk,
      operationalRisk: businessImpact.operationalRisk,
      complianceRisk:  businessImpact.complianceRisk,
      summary:         businessImpact.businessSummary,
    },

    // ── Recommended Actions ────────────────────────────────────────────────────
    actions: {
      recommended:    actionPlan.recommendedActions,
      executable:     actionPlan.executableActions,
      canExecute:     actionPlan.canExecute,
      quickWin:       actionPlan.quickWin,
      riskIfNoAction: actionPlan.riskIfNoAction,
      executionPlan:  actionPlan.executionPlan,
    },

    // ── FLOW Execution ────────────────────────────────────────────────────────
    flowCanExecute:    actionPlan.canExecute,
    flowExecutionNote: actionPlan.canExecute
      ? `FLOW can execute ${actionPlan.executableActions.length} action(s) — requires your confirmation.`
      : 'These actions require manual execution by your team.',
  };
}
