/**
 * DecisionEngine — Module 10
 *
 * Scores and ranks all candidate actions from the ContinuousPlanner into a
 * PrioritizedDecisionQueue. Factors: value, risk, confidence, cost, time,
 * dependencies, goals, policies, and resource availability.
 */

import { resolvePolicy }      from './AutonomyPolicyEngine.js';
import { getTypeConfidence }  from './LearningEngine.js';
import { logger }             from '../utils/logger.js';

const RISK_PENALTY = { LOW: 0, MEDIUM: 0.1, HIGH: 0.25, CRITICAL: 0.45 };
const PRIORITY_WEIGHT = { CRITICAL: 1.0, HIGH: 0.8, MEDIUM: 0.5, LOW: 0.25 };

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Score and rank a list of candidate recommendations into a PrioritizedDecisionQueue.
 *
 * @param {string} workspaceId
 * @param {Array}  candidates — raw recommendations from ContinuousPlanner
 * @param {Object} context    — { orgState, goals, predictions, policy }
 * @returns {PrioritizedDecisionQueue}
 */
export async function buildDecisionQueue(workspaceId, candidates, context = {}) {
  const { orgState = {}, goals = [], predictions = [] } = context;

  const scored = await Promise.all(
    candidates.map(c => _scoreCandidate(workspaceId, c, { orgState, goals, predictions }))
  );

  scored.sort((a, b) => b.score - a.score);

  return {
    workspaceId,
    queuedAt:    new Date().toISOString(),
    total:        scored.length,
    autoExecute:  scored.filter(c => c.decision === 'AUTO_EXECUTE'),
    requireApproval: scored.filter(c => c.decision === 'REQUIRE_APPROVAL'),
    deferred:     scored.filter(c => c.decision === 'DEFER'),
    blocked:      scored.filter(c => c.decision === 'BLOCK'),
    items:        scored,
  };
}

/**
 * Score a single candidate.
 */
export async function scoreCandidate(workspaceId, candidate, context = {}) {
  return _scoreCandidate(workspaceId, candidate, context);
}

// ── Scoring ───────────────────────────────────────────────────────────────────

async function _scoreCandidate(workspaceId, candidate, context) {
  const {
    type,
    title           = '',
    riskLevel       = 'MEDIUM',
    priority        = 'MEDIUM',
    estimatedValue  = 0,
    estimatedCostUsd = 0,
    connectorId,
    actionId,
    goalIds         = [],
    dependsOn       = [],
    timeHorizon     = '7d',
  } = candidate;

  const [typeConfidence, policy] = await Promise.all([
    getTypeConfidence(workspaceId, type).catch(() => 0.5),
    resolvePolicy(workspaceId, { connectorId, actionId }).catch(() => null),
  ]);

  // 1. Base value score (normalized 0–1)
  const valueScore = _normalizeValue(Number(estimatedValue));

  // 2. Priority weight
  const priorityScore = PRIORITY_WEIGHT[priority] ?? 0.5;

  // 3. Risk penalty
  const riskPenalty = RISK_PENALTY[riskLevel] ?? 0.1;

  // 4. Historical confidence for this type
  const confidenceScore = typeConfidence;

  // 5. Time urgency (sooner = higher score)
  const urgencyScore = _timeUrgency(timeHorizon);

  // 6. Goal alignment bonus
  const { goals = [] } = context;
  const goalAlignment = goalIds.length > 0
    ? goalIds.filter(gid => goals.some(g => g.id === gid)).length / goalIds.length
    : 0.5;

  // 7. Dependency penalty (blocked by unresolved deps)
  const depPenalty = dependsOn.length > 0 ? 0.05 * dependsOn.length : 0;

  // 8. Prediction risk alignment
  const { predictions = [] } = context;
  const predAligns = predictions.filter(p => p.type === type || p.drivers?.some(d => title.toLowerCase().includes(d.toLowerCase())));
  const predBoost  = predAligns.length > 0 ? 0.1 * Math.min(predAligns.length, 3) : 0;

  // 9. Cost penalty
  const costPenalty = estimatedCostUsd > 100 ? 0.05 : 0;

  const score = Math.max(0, Math.min(1,
    valueScore * 0.25 +
    priorityScore * 0.20 +
    confidenceScore * 0.15 +
    urgencyScore * 0.15 +
    goalAlignment * 0.10 +
    predBoost * 0.10 -
    riskPenalty * 0.15 -
    depPenalty -
    costPenalty
  ));

  const decision = _determineDecision(score, riskLevel, policy);

  return {
    ...candidate,
    score:            Math.round(score * 1000) / 1000,
    scoreBreakdown: {
      valueScore, priorityScore, confidenceScore, urgencyScore,
      goalAlignment, riskPenalty, predBoost, depPenalty, costPenalty,
    },
    typeConfidence,
    decision,
    policyLevel:    policy?.autonomy_level ?? 1,
  };
}

function _determineDecision(score, riskLevel, policy) {
  if (!policy || !policy.enabled) return 'BLOCK';
  const level     = Number(policy.autonomy_level ?? 1);
  const autoRisks = policy.auto_execute_risks ?? [];

  if (level === 0) return 'BLOCK';
  if (level === 1) return 'REQUIRE_APPROVAL';

  if (!autoRisks.includes(riskLevel)) return 'REQUIRE_APPROVAL';
  if (score < 0.3) return 'DEFER';

  if (policy.require_human_review && level < 5) return 'REQUIRE_APPROVAL';

  return 'AUTO_EXECUTE';
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _normalizeValue(value) {
  if (value <= 0)     return 0.1;
  if (value >= 10000) return 1.0;
  return Math.log10(value + 1) / Math.log10(10001);
}

function _timeUrgency(horizon) {
  const map = { '1h': 1.0, '4h': 0.9, '24h': 0.75, '7d': 0.5, '14d': 0.35, '30d': 0.2, '90d': 0.1 };
  return map[horizon] ?? 0.4;
}
