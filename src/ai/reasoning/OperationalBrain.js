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
import { dispatchCapabilities }     from './CapabilityDispatcher.js';
import { buildContext, formatContextForPrompt } from './ContextBuilder.js';
import { analyzeIntent }            from './IntentAnalyzer.js';
import { collectEvidence }          from './EvidenceCollector.js';
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
const FLOW_IDENTITY = `You are FLOW, the Operational Brain of this company's workspace.

You have already queried all relevant FLOW systems before this prompt was generated:
- Engineering Intelligence (PRs, commits, issues, deployments)
- Meeting & Calendar Intelligence
- Customer Intelligence & CRM
- Incident Engine
- Knowledge Base
- Communication Intelligence
- Org Memory (decisions, incidents, project events)
- Health Score Engine
- Knowledge Graph

STRICT RULES:
1. NEVER say "I don't have access to..." — FLOW has already looked. If data is missing, state the empty fact directly.
2. NEVER say "As an AI..." or "I'm an AI assistant..."
3. NEVER say "I recommend checking [external tool]" — FLOW IS the tool.
4. NEVER say "I don't know" — say what the data shows OR state clearly that no data exists.
5. NEVER hedge with "Based on limited information..." — either cite specific evidence or state what's missing.
6. If a capability returned 0 records: state it as fact. "No pull requests exist in this workspace." NOT "I cannot access pull requests."
7. Reference actual data from the FLOW context. Names, counts, statuses — be specific.
8. Write for a senior executive who needs to act. 3-5 sentences. Direct. Factual.`;

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
export async function runReasoning(workspaceId, { question, pageContext, entityId, role = 'EMPLOYEE' }, hooks = {}) {
  const startMs = Date.now();
  const traceId = `brain_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  // Optional streaming hooks (perceived-speed layer) — no-ops when absent, so the
  // non-streaming callers are unchanged.
  const status  = (stage, detail) => { try { hooks.onStatus?.(stage, detail); } catch { /* never break reasoning */ } };
  const partial = (kind, data)    => { try { hooks.onPartial?.(kind, data); } catch { /* noop */ } };

  logger.rag(`[Brain v2] ${traceId} — "${question.slice(0, 60)}"`);

  // ── Stage 0: Capability Planning ──────────────────────────────────────────
  status('planning', 'Understanding your question');
  const intent  = await analyzeIntent(question, { pageContext, entityId });
  const plan    = planCapabilities(question, intent);
  logger.rag(`[Brain v2] capabilities: ${plan.capabilityNames.join(', ')}`);
  status('retrieving', `Querying ${plan.capabilityNames.length} system(s): ${plan.capabilityNames.join(', ')}`);

  // ── Stage 1+2: Parallel — Capability Dispatch + RAG Evidence ─────────────
  const [capabilityResults, ragEvidence] = await Promise.all([
    dispatchCapabilities(workspaceId, plan, intent),
    collectEvidence(workspaceId, intent),
  ]);

  // ── Stage 3: Context Building ──────────────────────────────────────────────
  const builtContext  = buildContext(capabilityResults, intent);
  const contextBlock  = formatContextForPrompt(builtContext, intent);
  logger.vector(`[Brain v2] capability data: ${builtContext.totalRecords} records across ${Object.keys(builtContext.counts).length} systems`);

  // ── Stage 4: Merge capability flat records into evidence set ──────────────
  // Capability records take priority over generic RAG
  const mergedEvidenceSet = {
    rag:      ragEvidence.rag,
    memory:   [...builtContext.flatRecords.filter(r => r.capType === 'INCIDENT' || r.capType === 'DECISION'), ...ragEvidence.memory],
    health:   builtContext.rawData?.health?.health || ragEvidence.health,
    timeline: [...builtContext.flatRecords.filter(r => r.source === 'timeline'), ...ragEvidence.timeline],
    entities: ragEvidence.entities,
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
  const reasoning = await reason(intent, ranked, contextBlock);

  // ── Stage 7: Verification ──────────────────────────────────────────────────
  status('verifying', 'Checking for contradictions');
  const verification = verify(reasoning, ranked, intent);

  // ── Stages 8+9: Action Planning + Business Impact (parallel) ──────────────
  const [actionPlan, businessImpact] = await Promise.all([
    planActions(intent, reasoning, ranked),
    analyzeBusinessImpact(intent, reasoning, verification, ranked),
  ]);
  // Recommended actions are ready BEFORE the prose — surface them immediately.
  partial('actions', actionPlan);

  // ── Stage 10: Confidence Scoring ───────────────────────────────────────────
  const confidence = scoreConfidence(ranked, reasoning, verification, intent);

  // ── Stage 11: Response Synthesis (token-streamed when hooks.onToken given) ──
  status('synthesizing', 'Writing the answer');
  const answer = await _synthesizeAnswer(question, intent, reasoning, ranked, builtContext, confidence, businessImpact, actionPlan, contextBlock, hooks.onToken);

  const elapsed = Date.now() - startMs;
  logger.rag(`[Brain v2] ${traceId} done ${elapsed}ms — confidence=${confidence.score} evidence=${ranked.total}`);

  return _assembleResponse({
    traceId, question, intent, plan, ranked, reasoning, verification,
    actionPlan, businessImpact, confidence, answer, elapsed, role,
    capabilityResults, builtContext,
  });
}

// ── Response synthesis ────────────────────────────────────────────────────────

async function _synthesizeAnswer(question, intent, reasoning, ranked, builtContext, confidence, businessImpact, actionPlan, contextBlock, onToken) {

  const findingsText = reasoning.findings.slice(0, 5)
    .map((f, i) => `${i + 1}. ${f.finding}`)
    .join('\n');

  const topEvidence = ranked.primary.slice(0, 4)
    .map((e, i) => `[E${i + 1}] ${e.content.slice(0, 300)}`)
    .join('\n');

  const userPrompt = `${FLOW_IDENTITY}

=== QUESTION ===
${question}

=== FLOW DATA ===
${contextBlock.slice(0, 3000)}

=== REASONING FINDINGS ===
${findingsText || 'No structured findings derived.'}

${topEvidence ? `=== TOP EVIDENCE ===\n${topEvidence}` : ''}

=== BUSINESS IMPACT ===
Impact level: ${businessImpact.impactLevel}
${businessImpact.businessSummary}

Now answer the question using the FLOW data above. Be specific. Reference actual names and numbers. Do not use any of the forbidden phrases. If the data shows nothing exists, state that fact directly (e.g., "No incidents are currently recorded in this workspace."). Write 3-5 sentences for an executive audience.`;

  // Token-streamed path — forward each delta to the caller as it arrives (true
  // streaming), while still accumulating the full text to return + assemble.
  if (typeof onToken === 'function') {
    try {
      let acc = '';
      for await (const delta of stream({
        taskType: TaskType.LONG_SYNTHESIS,
        messages: [{ role: 'user', content: userPrompt }],
        maxTokens: 500,
        temperature: 0.25,
      })) {
        if (!delta) continue;
        acc += delta;
        onToken(delta);
      }
      const text = acc.trim();
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
      messages: [{ role: 'user', content: userPrompt }],
      maxTokens: 500,
      temperature: 0.25,
    });
    const text = (result.text || '').trim();
    if (text.length > 30) return text;
    throw new Error('empty response');
  } catch {
    return _fallbackAnswer(question, intent, builtContext, reasoning);
  }
}

function _fallbackAnswer(question, intent, builtContext, reasoning) {
  // Deterministic answer from FLOW data — never hedge
  const parts = [];

  for (const [cap, result] of Object.entries(builtContext.rawData)) {
    if (!result?.count) continue;
    const sample = result.records?.[0];
    if (result.count > 0 && sample) {
      parts.push(`${_capLabel(cap)}: found ${result.count} record(s). Most recent: "${sample.name}".`);
    }
  }

  if (!parts.length) {
    return `No ${intent.domain} data exists in this workspace.${reasoning.gaps?.[0] ? ' Note: ' + reasoning.gaps[0] + '.' : ''}`;
  }

  return parts.slice(0, 3).join(' ');
}

const _capLabel = cap => ({
  engineering:    'Engineering',
  meetings:       'Meetings',
  customers:      'Customers',
  incidents:      'Incidents',
  knowledge:      'Knowledge Base',
  communications: 'Communications',
  timeline:       'Timeline',
  memory:         'Org Memory',
  recommendations:'Recommendations',
  health:         'Workspace Health',
  people:         'Team',
  transcripts:    'Transcripts',
}[cap] || cap);

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
