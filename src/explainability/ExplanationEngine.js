/**
 * ExplanationEngine — the canonical explainability layer for FLOW.
 *
 * explain(output, context) wraps ANY AI output (a Phase 9.1 Operational Brain
 * result, a copilot answer, a recommendation) into the standard explanation
 * envelope: executive summary · evidence · reasoning chain · 6-dim confidence ·
 * source attribution · missing information · contradictions · alternatives ·
 * business impact · recommended actions · trust · graph explanation.
 *
 * It never invents grounding: confidence dimensions are computed from real
 * signals, contradictions are surfaced (not hidden), and missing evidence is
 * declared honestly. Graph explanations come from the Operational Graph (11.1).
 */

import { formatEvidence } from './EvidenceFormatter.js';
import { attributeSources } from './SourceAttribution.js';
import { buildConfidenceBreakdown } from './ConfidenceBreakdown.js';
import { buildReasoningTrace } from './ReasoningTrace.js';
import { buildDecisionTree } from './DecisionTree.js';
import { generateAlternatives } from './AlternativeGenerator.js';
import { detectMissingEvidence } from './MissingEvidenceDetector.js';
import { buildBusinessJustification } from './BusinessJustification.js';
import { scoreTrust } from './TrustScorer.js';
import db from '../config/db.js';
import { logger } from '../utils/logger.js';

// ── Public API ──────────────────────────────────────────────────────────────

export async function explain(output, context = {}) {
  const n = normalizeOutput(output);
  const domain = context.domain || n.domain;

  const formatted = formatEvidence(n.evidence);
  const sources   = attributeSources(formatted);
  const contradictions = detectContradictions(n, formatted);
  const missing   = detectMissingEvidence({ formatted, capabilities: n.capabilities, reasoning: n.reasoning, domain, sourceAttribution: sources });

  const graph = (context.entityId && context.workspaceId) ? await graphExplanation(context) : null;
  const connectorHealth = context.workspaceId ? await connectorHealthScore(context.workspaceId) : null;

  const confidence = buildConfidenceBreakdown({
    formatted, sourceAttribution: sources,
    reasoningConfidence: n.reasoningConfidence,
    verification: n.verification,
    relationshipConfidence: graph?.relationshipConfidence ?? null,
    connectorHealth,
  });

  const reasoningTrace = buildReasoningTrace(n.reasoning, n.capabilities, formatted);
  const businessImpact = buildBusinessJustification({ businessImpact: n.businessImpact, graphImpact: graph?.impact, domain, actions: n.actions });
  const alternatives   = generateAlternatives({ summary: n.summary, recommendedActions: n.recommendedActions, contradictions, missing, confidence });
  const decisionTree   = buildDecisionTree({ question: context.question || n.question, confidence, missing, contradictions, recommendedActions: n.recommendedActions });
  const trust          = scoreTrust({ confidence, sourceAttribution: sources, contradictions, missing, verification: n.verification });

  return {
    executiveSummary:   n.summary,
    evidence:           formatted,
    reasoning:          { trace: reasoningTrace, decisionTree },
    confidence,
    sources,
    missingInformation: missing,
    contradictions,
    alternatives,
    businessImpact,
    recommendedActions: n.recommendedActions,
    trust,
    graph,
    meta: { domain, entityId: context.entityId || null, generatedAt: new Date().toISOString(), traceId: n.traceId || null },
  };
}

/** Run the Operational Brain for a question, then explain its answer. */
export async function explainQuestion(workspaceId, question, opts = {}) {
  const { runReasoning } = await import('../ai/reasoning/OperationalBrain.js');
  const brain = await runReasoning(workspaceId, { question, ...opts });
  const exp = await explain(brain, { workspaceId, entityId: opts.entityId, domain: brain.reasoning?.domain, question });
  return exp;
}

const FOLLOWUPS = ['why', 'how', 'what_evidence', 'who_said', 'what_changed', 'why_now', 'what_missing', 'why_recommendation'];

/** Answer a follow-up ("why? how? what evidence? who said this?...") from an explanation. */
export function answerFollowUp(explanation, type) {
  switch (type) {
    case 'why':
      return { type, answer: explanation.confidence.explanation, summary: explanation.executiveSummary, topEvidence: explanation.evidence.slice(0, 3), trust: explanation.trust.level };
    case 'how':
      return { type, answer: 'Reasoning chain:', steps: explanation.reasoning.trace.steps };
    case 'what_evidence':
      return { type, answer: `${explanation.evidence.length} pieces of evidence across ${explanation.sources.distinctSourceTypes} source type(s).`, evidence: explanation.evidence, byType: explanation.sources.byType };
    case 'who_said':
      return { type, answer: explanation.sources.whoSaid.length ? 'Attributed to:' : 'No named actors in the evidence.', whoSaid: explanation.sources.whoSaid };
    case 'what_changed':
      return { type, answer: 'Most recent / timeline evidence:', changes: explanation.evidence.filter(e => e.sourceType === 'TIMELINE' || (e.freshnessDays != null && e.freshnessDays <= 7)).slice(0, 8) };
    case 'why_now':
      return { type, answer: explanation.businessImpact.time || 'No explicit urgency detected.', businessImpact: explanation.businessImpact, trust: explanation.trust };
    case 'what_missing':
      return { type, answer: explanation.missingInformation.confidenceStatement || 'Evidence coverage is sufficient.', missing: explanation.missingInformation.missing };
    case 'why_recommendation':
      return { type, answer: 'Decision path:', decisionTree: explanation.reasoning.decisionTree, action: explanation.recommendedActions[0] || null, businessImpact: explanation.businessImpact };
    default:
      return { type: 'unknown', answer: `Unsupported follow-up. Try one of: ${FOLLOWUPS.join(', ')}.`, supported: FOLLOWUPS };
  }
}

export { FOLLOWUPS };

// ── Normalization ─────────────────────────────────────────────────────────────

function normalizeOutput(o = {}) {
  // Phase 9.1 Operational Brain shape — evidence is an object with .primary,
  // not an array (that distinguishes it from the lighter/manual shape).
  if (o.evidence && !Array.isArray(o.evidence) && (o.evidence.primary || o.evidence.items)) {
    return {
      summary: o.summary,
      question: o.question,
      domain: o.reasoning?.domain,
      evidence: o.evidence.primary || o.evidence.items || [],
      capabilities: o.capabilities || {},
      reasoning: o.reasoning,
      verification: o.reasoning?.verification,
      reasoningConfidence: o.confidence?.score ?? o.confidence?.components?.coherence,
      businessImpact: o.businessImpact || {},
      actions: o.actions || {},
      recommendedActions: o.actions?.recommended || [],
      traceId: o.traceId,
    };
  }
  // Lighter shape (copilot answer, recommendation, or manual).
  return {
    summary: o.summary || o.answer || o.text || '',
    question: o.question,
    domain: o.domain,
    evidence: Array.isArray(o.evidence) ? o.evidence : (o.sources || []),
    capabilities: o.capabilities || {},
    reasoning: o.reasoning || {},
    verification: o.verification || null,
    reasoningConfidence: typeof o.confidence === 'number' ? o.confidence : (o.confidence?.score ?? null),
    businessImpact: o.businessImpact || {},
    actions: o.actions || {},
    recommendedActions: o.recommendedActions || o.actions?.recommended || [],
    traceId: o.traceId,
  };
}

// ── Contradiction detection (surface, never hide) ─────────────────────────────

const CONTRADICTION_TOPICS = [
  { topic: 'deployment timing', subject: /deploy|release|ship|launch|rollout/i, affirm: /friday|today|tonight|monday|scheduled|on track|approved|ready|go\b/i, negate: /delay|postpone|block|hold|slip|push(ed)? back|revert|rollback|cancel/i },
  { topic: 'incident status',   subject: /incident|outage|issue|bug/i,          affirm: /resolved|fixed|closed|mitigated|recovered/i,                          negate: /ongoing|open|active|unresolved|escalat|still (down|failing)/i },
  { topic: 'decision',          subject: /proposal|decision|plan|rfc/i,          affirm: /approved|agreed|accepted|greenlit|signed off/i,                        negate: /rejected|declined|blocked|vetoed|on hold/i },
  { topic: 'delivery status',   subject: /project|milestone|delivery|sprint|feature/i, affirm: /on track|complete|done|shipped|delivered/i,                     negate: /at risk|behind|delayed|blocked|slipping/i },
];

function detectContradictions(normalized, formatted) {
  const out = [];

  // 1. Contradictions already flagged by the reasoning pipeline.
  for (const c of (normalized.reasoning?.contradictions || []).slice(0, 5)) {
    out.push(typeof c === 'string' ? { topic: 'reasoning', detail: c } : { topic: c.topic || 'reasoning', ...c });
  }

  // 2. Opposing claims across evidence content.
  for (const t of CONTRADICTION_TOPICS) {
    const subj = formatted.filter(e => t.subject.test(e.content));
    const aff  = subj.filter(e => t.affirm.test(e.content));
    const neg  = subj.filter(e => t.negate.test(e.content));
    if (aff.length && neg.length) {
      out.push({
        topic: t.topic,
        claimA: aff[0].content.slice(0, 140), refA: aff[0].ref, sourceA: aff[0].sourceType,
        claimB: neg[0].content.slice(0, 140), refB: neg[0].ref, sourceB: neg[0].sourceType,
        note: `Conflicting signals on ${t.topic}: ${aff[0].sourceType}(${aff[0].ref}) vs ${neg[0].sourceType}(${neg[0].ref}). Resolve which source is authoritative/current.`,
      });
    }
  }

  // 3. High-severity verification issues that read as conflicts.
  for (const iss of (normalized.verification?.issues || [])) {
    if (iss.severity === 'high' && /conflict|contradict|inconsist/i.test(iss.message || iss.type || '')) {
      out.push({ topic: 'verification', detail: iss.message || iss.type });
    }
  }

  return out;
}

// ── Graph explanation (Phase 11.1) ────────────────────────────────────────────

async function graphExplanation(context) {
  try {
    const g = await import('../graph/index.js');
    const { workspaceId, entityId } = context;
    const [neighbors, impact, deps] = await Promise.all([
      g.neighbors(workspaceId, entityId).catch(() => []),
      g.analyzeImpact(workspaceId, entityId, 3).catch(() => null),
      g.analyzeDependencies(workspaceId, entityId, 3).catch(() => null),
    ]);
    if (!neighbors.length && !impact && !deps) return null;

    const avgWeight = neighbors.length ? neighbors.reduce((s, n) => s + (n.weight || 1), 0) / neighbors.length : 0;
    const relationshipConfidence = Math.max(0, Math.min(100, Math.round(40 + neighbors.length * 2 + avgWeight * 8)));

    return {
      relationshipConfidence,
      relationships: neighbors.slice(0, 12).map(n => ({ relation: n.relation, direction: n.direction, node: n.node, weight: n.weight })),
      impact: impact ? { impactedCount: impact.impactedCount, impactScore: impact.impactScore, affectedCustomers: impact.affectedCustomers, byType: impact.byType } : null,
      dependencies: deps ? { dependencyCount: deps.dependencyCount, byType: deps.byType } : null,
      explanation: `Entity connects to ${neighbors.length} node(s); ${impact?.impactedCount || 0} downstream node(s) would be affected if it failed.`,
    };
  } catch (err) {
    logger.rag(`[explain] graph explanation failed: ${err.message}`);
    return null;
  }
}

// ── Connector health (best-effort) ────────────────────────────────────────────

async function connectorHealthScore(workspaceId) {
  try {
    const { rows } = await db.query(
      `SELECT health_status FROM connector_credentials WHERE workspace_id = $1`, [workspaceId]);
    if (!rows.length) return null; // no connectors → let breakdown use its default
    const healthy = rows.filter(r => /healthy|active|ok|connected/i.test(r.health_status || '')).length;
    return Math.round((healthy / rows.length) * 100);
  } catch {
    return null; // table absent in this environment
  }
}
