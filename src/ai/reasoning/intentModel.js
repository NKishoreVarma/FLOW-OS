/**
 * FLOW Intent Model (Stage 5B) — one canonical, structured representation of WHAT
 * the user is trying to accomplish, composed from FLOW's existing deterministic
 * analyzers (no new LLM inference, no duplication):
 *
 *   analyzeIntent()          → questionType, domain, temporalScope, urgency, terms
 *   classifyRelationIntent() → relationship + direction (RC-2)
 *   classifyBriefingIntent() → briefing flavor
 *   resolveConversation()    → pronoun / follow-up carry-over (5F)
 *   extractReferences()      → entity references in the wording
 *   resolveReferences()      → (optional, DB) EXACT / EXACT_NAME / AMBIGUOUS / NOT_FOUND
 *
 * On top of these it adds the three decisions the pipeline needs but did not yet
 * express in one place: requestedDepth (5H), retrievalStrategy/route (5D), and
 * responseMode. USER WORDING != USER INTENT — the same words can carry different
 * goals, so the model is derived from structure, not surface phrasing.
 *
 * Deterministic and cheap by design: simple questions classify in microseconds and
 * never touch an LLM. Nothing here changes existing pipeline behavior — it is a
 * reusable analysis layer consumed by routing, the agent path, and tests.
 */

import { analyzeIntent } from './IntentAnalyzer.js';
import { classifyRelationIntent, extractReferences, RelationIntent } from './EntityResolver.js';
import { classifyBriefingIntent } from './BriefingComposer.js';
import { resolveConversation } from './conversationResolver.js';

// ── Enums ──────────────────────────────────────────────────────────────────────

/** How deep FLOW must retrieve to answer. */
export const RequestedDepth = Object.freeze({
  LEVEL_0: 'LEVEL_0',   // direct node attributes
  LEVEL_1: 'LEVEL_1',   // one direct relationship (edge)
  LEVEL_2: 'LEVEL_2',   // connected entities / neighbours
  LEVEL_3: 'LEVEL_3',   // cross-entity synthesis
});

/** Retrieval strategy / route class (Stage 5D). */
export const RetrievalStrategy = Object.freeze({
  FAST_LOOKUP:         'FAST_LOOKUP',
  RELATIONSHIP_LOOKUP: 'RELATIONSHIP_LOOKUP',
  MULTI_HOP_AGENT:     'MULTI_HOP_AGENT',
  COMPARISON:          'COMPARISON',
  TEMPORAL:            'TEMPORAL',
  BRIEFING:            'BRIEFING',
  DIAGNOSTIC:          'DIAGNOSTIC',
  AMBIGUOUS:           'AMBIGUOUS',
  UNKNOWN:             'UNKNOWN',
  CONVERSATIONAL:      'CONVERSATIONAL',
});

/** How the answer should be shaped. */
export const ResponseMode = Object.freeze({
  DIRECT_FACT:   'DIRECT_FACT',
  RELATIONSHIP:  'RELATIONSHIP',
  EXPLANATION:   'EXPLANATION',
  BRIEFING:      'BRIEFING',
  COMPARISON:    'COMPARISON',
  LIST:          'LIST',
  CONFIRMATION:  'CONFIRMATION',
  TEMPORAL_DIFF: 'TEMPORAL_DIFF',
  CLARIFICATION: 'CLARIFICATION',
});

/** Ambiguity state (reuses EntityResolver resolutions + conversation/context). */
export const AmbiguityState = Object.freeze({
  NONE:            'NONE',
  EXACT:           'EXACT',
  EXACT_NAME:      'EXACT_NAME',
  AMBIGUOUS:       'AMBIGUOUS',
  NOT_FOUND:       'NOT_FOUND',
  CONTEXT_RESOLVED:'CONTEXT_RESOLVED',
  UNRESOLVED:      'UNRESOLVED',
});

export const WorkspaceScope = Object.freeze({ CURRENT: 'CURRENT', FOREIGN: 'FOREIGN' });

// ── Detectors (deterministic) ───────────────────────────────────────────────────

// A DIFFERENT workspace/tenant/company framing (mirrors OperationalBrain's guard).
function _isForeignWorkspacePremise(q) {
  const t = String(q || '');
  return /\bcorp[-_\s]?alpha\b/i.test(t) || /\bworkspace[_-][a-z0-9]/i.test(t)
    || /\b(another|other|different)\s+(workspace|tenant|company|org(anization)?)\b/i.test(t);
}

// "what changed / since yesterday / what's new / diff" — a temporal comparison, not a briefing.
function _isTemporalDiff(q) {
  return /\bwhat('?s| has| have)?\s+changed\b|\bsince (yesterday|last (week|time)|the last)\b|\bwhat('?s| is)\s+new\b|\bchanges? since\b|\bwhat happened (since|between)\b/i.test(String(q));
}

// Confirmation: "is X involved / did Sarah handle it / is he on the incident".
function _isConfirmation(q) {
  return /^\s*(is|are|was|were|did|does|do|has|have|can|could|should)\b/i.test(String(q))
    && /\b(involved|responsible|assigned|handle|handled|working on|on call|part of|owner|own)\b/i.test(String(q));
}

// List/enumerate.
function _isList(q) { return /^\s*(list|show( me)?|give me|what are|which)\b/i.test(String(q)); }

// A "who should I talk to / who can help with X" — actionable relationship inference (L2).
function _isWhoToTalkTo(q) { return /who (should|can|could|do) i (talk|speak|reach out|ask|contact)\b|who (can|could) help\b/i.test(String(q)); }

// Broad single-entity briefing: "tell me everything about X".
function _isEntityBriefing(q) { return /\b(everything|all|full (picture|context|details)|tell me about|overview of|deep dive)\b/i.test(String(q)); }

// "what's blocking / what is blocked" — operational diagnosis.
function _isBlockingDiagnosis(q) { return /\bblock(ing|ed|er)\b|\bwhat('?s| is) stopping\b|\bwhat('?s| is) holding\b|\bholding up\b/i.test(String(q)); }

// A why/causal question — broader than IntentAnalyzer's questionType (which misses
// "why are…" and "what caused…"). Used to classify diagnosis intent robustly.
function _isWhyOrCausal(q) {
  const t = String(q);
  return /^\s*why\b/i.test(t)
    || /\bwhy (is|are|was|were|did|do|does|has|have|the)\b/i.test(t)
    || /\bwhat caused\b|\bcause of\b|\broot cause\b|\breason (for|behind|why)\b|\bwhat is causing\b/i.test(t);
}

// Any diagnostic intent (question-type OR why/causal OR blocking).
function _isDiagnostic(questionType, q) {
  return questionType === 'diagnostic' || _isWhyOrCausal(q) || _isBlockingDiagnosis(q);
}

// A specific PAST window that implies time-bounded retrieval.
function _isPastWindow(timeframe) { return ['past_24h', 'past_week', 'past_month'].includes(timeframe); }

// ── Depth policy (Stage 5H) ─────────────────────────────────────────────────────

function selectDepth({ questionType, relIntent, briefing, entityCount, question }) {
  const q = String(question);
  const diag = _isDiagnostic(questionType, q);
  if (briefing.isBriefing) return RequestedDepth.LEVEL_3;
  if (_isEntityBriefing(q)) return RequestedDepth.LEVEL_3;
  if (questionType === 'comparative') return RequestedDepth.LEVEL_3;
  if (_isBlockingDiagnosis(q) || (diag && entityCount !== 1)) return RequestedDepth.LEVEL_3;
  if (_isWhoToTalkTo(q)) return RequestedDepth.LEVEL_2;
  if (relIntent === RelationIntent.WHO_WORKS_WITH || relIntent === RelationIntent.WHO_CONNECTED) return RequestedDepth.LEVEL_2;
  if (relIntent) return RequestedDepth.LEVEL_1;                       // one direct edge
  // "why is X a problem" (single entity explanation) → connected context
  if (diag) return RequestedDepth.LEVEL_2;
  // Direct single-fact node lookup (status/attribute of one entity, no relationship).
  if (entityCount === 1 && (questionType === 'status' || questionType === 'discovery' || questionType === 'attribution')) return RequestedDepth.LEVEL_0;
  if (entityCount >= 1) return RequestedDepth.LEVEL_1;
  return RequestedDepth.LEVEL_2;
}

// ── Response mode ────────────────────────────────────────────────────────────────

function selectResponseMode({ ambiguity, workspaceScope, relIntent, briefing, questionType, question }) {
  if (workspaceScope === WorkspaceScope.FOREIGN) return ResponseMode.CLARIFICATION;
  if (ambiguity === AmbiguityState.AMBIGUOUS || ambiguity === AmbiguityState.UNRESOLVED || ambiguity === AmbiguityState.NOT_FOUND)
    return ResponseMode.CLARIFICATION;
  if (_isConfirmation(question)) return ResponseMode.CONFIRMATION;
  if (_isTemporalDiff(question)) return ResponseMode.TEMPORAL_DIFF;
  if (briefing.isBriefing || _isEntityBriefing(question)) return ResponseMode.BRIEFING;
  if (questionType === 'comparative') return ResponseMode.COMPARISON;
  if (relIntent) return ResponseMode.RELATIONSHIP;
  // List phrasing ("which/list/show…") before diagnostic/action — otherwise a word
  // like "resolved" (matched by the action classifier) would mask an enumeration.
  if (_isList(question)) return ResponseMode.LIST;
  if (_isDiagnostic(questionType, question) || questionType === 'action') return ResponseMode.EXPLANATION;
  return ResponseMode.DIRECT_FACT;
}

// ── Route / retrieval strategy (Stage 5D) ────────────────────────────────────────

function selectRoute({ ambiguity, workspaceScope, relIntent, briefing, questionType, depth, entityCount, conversation, timeframe, question }) {
  if (conversation.isConversational) return RetrievalStrategy.CONVERSATIONAL;
  if (workspaceScope === WorkspaceScope.FOREIGN) return RetrievalStrategy.UNKNOWN;
  if (ambiguity === AmbiguityState.AMBIGUOUS || (conversation.needsClarification && !conversation.resolved))
    return RetrievalStrategy.AMBIGUOUS;
  if (ambiguity === AmbiguityState.NOT_FOUND) return RetrievalStrategy.UNKNOWN;
  if (_isTemporalDiff(question)) return RetrievalStrategy.TEMPORAL;
  if (briefing.isBriefing) return RetrievalStrategy.BRIEFING;
  if (questionType === 'comparative') return RetrievalStrategy.COMPARISON;
  // A specific past window with NO why/causal/blocking framing → time-bounded retrieval
  // (e.g. "what happened last night"). "why did X happen last week" stays diagnostic.
  const hardDiag = _isWhyOrCausal(question) || _isBlockingDiagnosis(question);
  if (_isPastWindow(timeframe) && !hardDiag) return RetrievalStrategy.TEMPORAL;
  if (_isDiagnostic(questionType, question)) return RetrievalStrategy.DIAGNOSTIC;
  if (relIntent) return RetrievalStrategy.RELATIONSHIP_LOOKUP;
  if (_isPastWindow(timeframe)) return RetrievalStrategy.TEMPORAL;
  if (depth === RequestedDepth.LEVEL_3 || (depth === RequestedDepth.LEVEL_2 && entityCount >= 2))
    return RetrievalStrategy.MULTI_HOP_AGENT;
  return RetrievalStrategy.FAST_LOOKUP;
}

// Routes that genuinely benefit from the iterative AgentRuntime.
const AGENT_ROUTES = new Set([
  RetrievalStrategy.MULTI_HOP_AGENT, RetrievalStrategy.DIAGNOSTIC, RetrievalStrategy.COMPARISON,
]);

// ── Ambiguity derivation ─────────────────────────────────────────────────────────

function deriveAmbiguity({ resolution, refs, conversation, workspaceScope }) {
  if (workspaceScope === WorkspaceScope.FOREIGN) return AmbiguityState.NONE;
  if (conversation.needsClarification && !conversation.resolved) return AmbiguityState.UNRESOLVED;
  if (conversation.resolved) return AmbiguityState.CONTEXT_RESOLVED;
  if (resolution) {
    if (resolution.ambiguous?.length) return AmbiguityState.AMBIGUOUS;
    // Only treat a specific ID / multi-word name miss as NOT_FOUND (mirrors the grounding gate).
    const blocking = (resolution.notFound || []).filter(r =>
      r.kind === 'ID' || (r.kind === 'NAME' && String(r.reference).trim().split(/\s+/).length >= 2));
    if (blocking.length && (resolution.resolvedNodes?.length ?? 0) === 0) return AmbiguityState.NOT_FOUND;
    if (resolution.resolvedNodes?.length) {
      return resolution.resolvedNodes[0].resolution === 'EXACT_NAME' ? AmbiguityState.EXACT_NAME : AmbiguityState.EXACT;
    }
  }
  // No DB resolution available — infer only from wording.
  if (!refs.ids.length && !refs.names.length) return AmbiguityState.NONE;
  return AmbiguityState.NONE;
}

// ── Expected evidence (from relation patterns + domain) ──────────────────────────

function expectedEvidence({ relIntent, briefing, questionType, depth }) {
  if (relIntent === RelationIntent.WHO_AUTHORED)    return ['AUTHORED_BY'];
  if (relIntent === RelationIntent.WHO_IS_ASSIGNED) return ['ASSIGNED_TO'];
  if (relIntent === RelationIntent.WHO_IS_INVOLVED) return ['ASSIGNED_TO', 'COMMANDER'];
  if (relIntent === RelationIntent.WHO_IS_MANAGER)  return ['REPORTS_TO', 'MANAGES'];
  if (relIntent === RelationIntent.WHO_REPORTS_TO)  return ['MANAGES', 'REPORTS_TO'];
  if (relIntent === RelationIntent.WHO_WORKS_WITH)  return ['SHARED_TEAM', 'SHARED_PROJECT'];
  if (relIntent === RelationIntent.WHO_CONNECTED)   return ['PERSON_NEIGHBORS'];
  if (briefing.isBriefing) return ['incidents', 'engineering', 'risks', 'health'];
  if (depth === RequestedDepth.LEVEL_3) return ['multi_source_synthesis'];
  if (questionType === 'diagnostic') return ['node_metadata', 'related_evidence'];
  return ['node_metadata'];
}

// ── Public: build the canonical model ────────────────────────────────────────────

/**
 * Build the FLOW Intent Model. Deterministic. Optional DB entity resolution via resolveFn.
 *
 * @param {string} question
 * @param {object} [opts]
 * @param {{role,content}[]} [opts.history]
 * @param {(ws:string, q:string)=>Promise<object>} [opts.resolveFn]  e.g. resolveReferences
 * @param {string} [opts.workspaceId]
 * @param {string} [opts.pageContext]
 * @returns {Promise<FlowIntentModel>}
 */
export async function buildIntentModel(question, { history = [], resolveFn = null, workspaceId = null, pageContext = null } = {}) {
  const conversation = resolveConversation(question, history);
  const effective    = conversation.effectiveQuestion || question;

  const [intent] = await Promise.all([ analyzeIntent(effective, { pageContext, fast: true }) ]);
  const relation = classifyRelationIntent(effective);
  const briefing = classifyBriefingIntent(effective);
  const refs     = extractReferences(effective);

  let resolution = null;
  if (resolveFn && workspaceId) {
    resolution = await resolveFn(workspaceId, effective).catch(() => null);
  }

  return classifyIntentSync(effective, { intent, relation, briefing, refs, resolution, conversation, question });
}

/**
 * Pure, synchronous classification given precomputed signals. Exposed for offline
 * testing (the intent matrix) and for callers that already have the analyzers' output.
 */
export function classifyIntentSync(effectiveQuestion, { intent, relation, briefing, refs, resolution = null, conversation, question }) {
  const workspaceScope = _isForeignWorkspacePremise(question ?? effectiveQuestion) ? WorkspaceScope.FOREIGN : WorkspaceScope.CURRENT;
  const relIntent = relation?.relIntent ?? null;
  const questionType = intent?.questionType ?? 'discovery';
  const entities = _entities(refs, resolution);
  const entityCount = entities.length;

  const ambiguity = deriveAmbiguity({ resolution, refs, conversation, workspaceScope });
  const depth = selectDepth({ questionType, relIntent, briefing, entityCount, question: effectiveQuestion });
  const responseMode = selectResponseMode({ ambiguity, workspaceScope, relIntent, briefing, questionType, question: effectiveQuestion });
  const retrievalStrategy = selectRoute({ ambiguity, workspaceScope, relIntent, briefing, questionType, depth, entityCount, conversation, timeframe: intent?.timeframe, question: effectiveQuestion });

  return {
    goal: _goal({ retrievalStrategy, relIntent, briefing, responseMode }),
    questionType,
    domain: intent?.domain ?? 'general',
    entities,
    relationIntent: relIntent,
    relationDirection: (relation?.patterns?.[0]?.dir) ?? null,
    constraints: { urgency: intent?.urgency ?? 'low' },
    temporalScope: _isTemporalDiff(effectiveQuestion) ? 'diff' : (intent?.timeframe ?? 'recent'),
    workspaceScope,
    requestedDepth: depth,
    ambiguity,
    expectedEvidence: expectedEvidence({ relIntent, briefing, questionType, depth }),
    retrievalStrategy,
    responseMode,
    conversation: {
      isConversational: conversation.isConversational,
      resolved: conversation.resolved,
      needsClarification: conversation.needsClarification,
      carried: conversation.carried,
      effectiveQuestion,
    },
    useAgent: AGENT_ROUTES.has(retrievalStrategy),
    searchTerms: intent?.searchTerms ?? [],
  };
}

function _entities(refs, resolution) {
  if (resolution?.references?.length) {
    return resolution.references.map(r => ({
      reference: r.reference, kind: r.kind, resolution: r.resolution,
      nodeId: r.nodeId ?? null, name: r.name ?? null, entityType: r.entityType ?? null,
    }));
  }
  return [
    ...refs.ids.map(id => ({ reference: id, kind: 'ID', resolution: 'UNVERIFIED' })),
    ...refs.names.map(nm => ({ reference: nm, kind: 'NAME', resolution: 'UNVERIFIED' })),
  ];
}

function _goal({ retrievalStrategy, relIntent, briefing, responseMode }) {
  if (responseMode === ResponseMode.CLARIFICATION) return 'clarify';
  if (retrievalStrategy === RetrievalStrategy.CONVERSATIONAL) return 'converse';
  if (briefing.isBriefing) return 'briefing';
  if (relIntent) return 'relationship_lookup';
  if (retrievalStrategy === RetrievalStrategy.DIAGNOSTIC) return 'diagnose';
  if (retrievalStrategy === RetrievalStrategy.COMPARISON) return 'compare';
  if (retrievalStrategy === RetrievalStrategy.TEMPORAL) return 'temporal_diff';
  if (retrievalStrategy === RetrievalStrategy.FAST_LOOKUP) return 'lookup';
  return 'investigate';
}

export default { buildIntentModel, classifyIntentSync, RequestedDepth, RetrievalStrategy, ResponseMode, AmbiguityState, WorkspaceScope };
