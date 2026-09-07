/**
 * LearningEngine — Module 7
 *
 * Tracks recommendation → decision → outcome chains. Recalibrates confidence
 * scores over time using positive/negative reinforcement so the ContinuousPlanner
 * improves its ranking accuracy on each cycle.
 */

import { query }        from '../config/db.js';
import { logger }       from '../utils/logger.js';

export const Decision = Object.freeze({
  ACCEPTED:  'ACCEPTED',
  DISMISSED: 'DISMISSED',
  DEFERRED:  'DEFERRED',
  PENDING:   'PENDING',
});

export const Outcome = Object.freeze({
  SUCCESS:        'SUCCESS',
  PARTIAL:        'PARTIAL',
  FAILURE:        'FAILURE',
  NO_IMPACT:      'NO_IMPACT',
  UNKNOWN:        'UNKNOWN',
});

// ── Record Lifecycle ──────────────────────────────────────────────────────────

/**
 * Record a new recommendation that was surfaced to a user/system.
 * Returns the learning record id for later resolution.
 */
export async function recordRecommendation(workspaceId, rec) {
  const {
    recommendationId   = null,
    recommendationType,
    recommendationSummary = '',
    confidenceBefore    = 0.5,
    tags                = [],
  } = rec;

  if (!recommendationType) throw new Error('recommendationType required');

  const { rows } = await query(
    `INSERT INTO autonomy_learning_records
       (workspace_id, recommendation_id, recommendation_type, recommendation_summary,
        confidence_before, tags)
     VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING id`,
    [workspaceId, recommendationId, recommendationType, recommendationSummary,
     confidenceBefore, JSON.stringify(tags)]
  );
  return rows[0].id;
}

/**
 * Record the human/system decision on a recommendation.
 */
export async function recordDecision(workspaceId, learningId, decision, { executedWorkflowId = null } = {}) {
  if (!Object.values(Decision).includes(decision)) {
    throw new Error(`Invalid decision: ${decision}`);
  }
  await query(
    `UPDATE autonomy_learning_records
     SET decision = $1, executed_workflow_id = $2
     WHERE id = $3 AND workspace_id = $4`,
    [decision, executedWorkflowId, learningId, workspaceId]
  );
}

/**
 * Record the observed outcome and recalibrate confidence.
 */
export async function recordOutcome(workspaceId, learningId, outcome, {
  successScore       = null,
  businessImpactUsd  = null,
  timeSavedMinutes   = null,
  feedback           = null,
} = {}) {
  if (!Object.values(Outcome).includes(outcome)) {
    throw new Error(`Invalid outcome: ${outcome}`);
  }

  const { rows } = await query(
    'SELECT * FROM autonomy_learning_records WHERE id = $1 AND workspace_id = $2',
    [learningId, workspaceId]
  );
  const record = rows[0];
  if (!record) return;

  const confidenceAfter = _recalibrate(
    Number(record.confidence_before ?? 0.5),
    record.decision,
    outcome,
    Number(successScore ?? 0.5)
  );

  await query(
    `UPDATE autonomy_learning_records
     SET outcome = $1, success_score = $2, business_impact_usd = $3,
         time_saved_minutes = $4, feedback = $5,
         confidence_after = $6, resolved_at = NOW()
     WHERE id = $7 AND workspace_id = $8`,
    [outcome, successScore, businessImpactUsd, timeSavedMinutes,
     feedback, confidenceAfter, learningId, workspaceId]
  );

  return { learningId, outcome, confidenceAfter };
}

// ── Query ─────────────────────────────────────────────────────────────────────

export async function listLearningRecords(workspaceId, { type, decision, outcome, limit = 50 } = {}) {
  const conds = ['workspace_id = $1'];
  const vals  = [workspaceId];
  if (type)     conds.push(`recommendation_type = $${vals.push(type)}`);
  if (decision) conds.push(`decision = $${vals.push(decision)}`);
  if (outcome)  conds.push(`outcome = $${vals.push(outcome)}`);
  const { rows } = await query(
    `SELECT * FROM autonomy_learning_records
     WHERE ${conds.join(' AND ')}
     ORDER BY created_at DESC LIMIT $${vals.push(limit)}`,
    vals
  );
  return rows;
}

/**
 * Get calibrated confidence for a recommendation type based on historical outcomes.
 * Used by ContinuousPlanner to weight recommendation scores.
 */
export async function getTypeConfidence(workspaceId, recommendationType) {
  const { rows } = await query(
    `SELECT
       COUNT(*) AS total,
       COUNT(*) FILTER (WHERE outcome = 'SUCCESS')  AS successes,
       COUNT(*) FILTER (WHERE outcome = 'FAILURE')  AS failures,
       COUNT(*) FILTER (WHERE decision = 'ACCEPTED') AS accepted,
       AVG(success_score) FILTER (WHERE success_score IS NOT NULL) AS avg_score,
       AVG(confidence_after) FILTER (WHERE confidence_after IS NOT NULL) AS avg_confidence_after
     FROM autonomy_learning_records
     WHERE workspace_id = $1 AND recommendation_type = $2
       AND resolved_at IS NOT NULL`,
    [workspaceId, recommendationType]
  );
  const r = rows[0];
  if (!r || Number(r.total) === 0) return 0.5;

  const total     = Number(r.total);
  const successes = Number(r.successes);
  const accepted  = Number(r.accepted);
  const avgConf   = Number(r.avg_confidence_after ?? 0.5);

  const acceptanceRate = accepted / total;
  const successRate    = total > 0 ? successes / total : 0;

  return Math.round(
    (avgConf * 0.4 + successRate * 0.4 + acceptanceRate * 0.2) * 1000
  ) / 1000;
}

/**
 * Summary statistics for the AutonomyMetrics module.
 */
export async function getLearningStats(workspaceId) {
  const { rows } = await query(
    `SELECT
       COUNT(*)                                              AS total,
       COUNT(*) FILTER (WHERE decision = 'ACCEPTED')         AS accepted,
       COUNT(*) FILTER (WHERE decision = 'DISMISSED')        AS dismissed,
       COUNT(*) FILTER (WHERE outcome = 'SUCCESS')           AS successful,
       COUNT(*) FILTER (WHERE outcome = 'FAILURE')           AS failed,
       AVG(success_score) FILTER (WHERE success_score IS NOT NULL) AS avg_success_score,
       SUM(time_saved_minutes) FILTER (WHERE time_saved_minutes IS NOT NULL) AS total_time_saved_min,
       SUM(business_impact_usd) FILTER (WHERE business_impact_usd IS NOT NULL) AS total_impact_usd
     FROM autonomy_learning_records
     WHERE workspace_id = $1`,
    [workspaceId]
  );
  return rows[0] ?? {};
}

// ── Confidence Recalibration ─────────────────────────────────────────────────

function _recalibrate(prior, decision, outcome, successScore) {
  let delta = 0;

  if (decision === Decision.ACCEPTED) {
    if (outcome === Outcome.SUCCESS)        delta = +0.05 + (successScore - 0.5) * 0.1;
    else if (outcome === Outcome.PARTIAL)   delta = +0.02;
    else if (outcome === Outcome.FAILURE)   delta = -0.08;
    else if (outcome === Outcome.NO_IMPACT) delta = -0.02;
  } else if (decision === Decision.DISMISSED) {
    delta = -0.03;
  } else if (decision === Decision.DEFERRED) {
    delta = 0;
  }

  return Math.min(0.98, Math.max(0.02, Math.round((prior + delta) * 1000) / 1000));
}
