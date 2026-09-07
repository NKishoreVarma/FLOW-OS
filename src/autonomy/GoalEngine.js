/**
 * GoalEngine — Module 3
 *
 * Organization goal management: CRUD, progress evaluation, and status transitions.
 * Goals are the primary signal that the ContinuousPlanner uses to prioritize
 * autonomous recommendations.
 */

import { query } from '../config/db.js';
import { AppError, ValidationError } from '../core/errors/index.js';

export const GoalStatus   = Object.freeze({ ACTIVE: 'ACTIVE', ACHIEVED: 'ACHIEVED', MISSED: 'MISSED', PAUSED: 'PAUSED', CANCELLED: 'CANCELLED' });
export const GoalCategory = Object.freeze({ ENGINEERING: 'engineering', SUPPORT: 'support', INFRASTRUCTURE: 'infrastructure', FINANCE: 'finance', SECURITY: 'security', SALES: 'sales', HR: 'hr', GENERAL: 'general' });
export const GoalPriority = Object.freeze({ CRITICAL: 'CRITICAL', HIGH: 'HIGH', MEDIUM: 'MEDIUM', LOW: 'LOW' });

// ── CRUD ──────────────────────────────────────────────────────────────────────

export async function createGoal(workspaceId, orgId, data) {
  const { title, description, category = 'general', priority = 'MEDIUM', owner, targetValue, currentValue, unit, deadline, successMetrics = [], dependencies = [], metadata = {} } = data;
  if (!title) throw new ValidationError('title is required');

  const { rows } = await query(
    `INSERT INTO autonomy_goals
       (workspace_id, org_id, title, description, category, priority, owner,
        target_value, current_value, unit, deadline, success_metrics, dependencies, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     RETURNING *`,
    [workspaceId, orgId ?? '', title, description ?? null, category, priority, owner ?? null,
     targetValue ?? null, currentValue ?? null, unit ?? null,
     deadline ? new Date(deadline) : null,
     JSON.stringify(successMetrics), JSON.stringify(dependencies), JSON.stringify(metadata)]
  );
  return rows[0];
}

export async function listGoals(workspaceId, { status, category, priority } = {}) {
  const conds = ['workspace_id = $1'];
  const vals  = [workspaceId];
  if (status)   { conds.push(`status = $${vals.push(status)}`); }
  if (category) { conds.push(`category = $${vals.push(category)}`); }
  if (priority) { conds.push(`priority = $${vals.push(priority)}`); }
  const { rows } = await query(
    `SELECT * FROM autonomy_goals WHERE ${conds.join(' AND ')} ORDER BY
       CASE priority WHEN 'CRITICAL' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END,
       created_at DESC`,
    vals
  );
  return rows;
}

export async function getGoal(workspaceId, goalId) {
  const { rows } = await query(
    'SELECT * FROM autonomy_goals WHERE id = $1 AND workspace_id = $2',
    [goalId, workspaceId]
  );
  if (!rows[0]) throw new AppError('Goal not found', 404, 'GOAL_NOT_FOUND');
  return rows[0];
}

export async function updateGoal(workspaceId, goalId, updates) {
  const allowed = ['title','description','category','priority','owner','target_value','current_value','unit','deadline','success_metrics','dependencies','status','metadata','current_progress','confidence'];
  const setClauses = [];
  const vals       = [];

  for (const key of Object.keys(updates)) {
    const col = _camel2snake(key);
    if (!allowed.includes(col)) continue;
    const v = ['success_metrics','dependencies','metadata'].includes(col)
      ? JSON.stringify(updates[key])
      : (col === 'deadline' && updates[key] ? new Date(updates[key]) : updates[key]);
    setClauses.push(`${col} = $${vals.push(v)}`);
  }
  if (!setClauses.length) throw new ValidationError('No valid fields to update');
  setClauses.push(`updated_at = NOW()`);

  const wsIdx = vals.push(workspaceId);
  const idIdx = vals.push(goalId);
  const { rows } = await query(
    `UPDATE autonomy_goals SET ${setClauses.join(', ')}
     WHERE workspace_id = $${wsIdx} AND id = $${idIdx} RETURNING *`,
    vals
  );
  if (!rows[0]) throw new AppError('Goal not found', 404, 'GOAL_NOT_FOUND');
  return rows[0];
}

export async function deleteGoal(workspaceId, goalId) {
  const { rowCount } = await query(
    'DELETE FROM autonomy_goals WHERE id = $1 AND workspace_id = $2',
    [goalId, workspaceId]
  );
  if (!rowCount) throw new AppError('Goal not found', 404, 'GOAL_NOT_FOUND');
  return { deleted: true };
}

// ── Progress Evaluation ───────────────────────────────────────────────────────

/**
 * Evaluate goal progress against organization state and auto-update.
 * Returns enriched goal with evaluation metadata.
 */
export async function evaluateGoals(workspaceId, orgState) {
  const goals = await listGoals(workspaceId, { status: 'ACTIVE' });
  const results = [];

  for (const goal of goals) {
    const evaluation = _evaluateGoal(goal, orgState);
    if (evaluation.progressChanged || evaluation.statusChanged) {
      await updateGoal(workspaceId, goal.id, {
        currentProgress: evaluation.progress,
        confidence:      evaluation.confidence,
        status:          evaluation.status,
      }).catch(() => null);
    }
    results.push({ ...goal, evaluation });
  }
  return results;
}

function _evaluateGoal(goal, orgState) {
  let progress   = Number(goal.current_progress ?? 0);
  let confidence = Number(goal.confidence       ?? 0.5);
  let status     = goal.status;
  let progressChanged = false;
  let statusChanged   = false;

  // Category-specific evaluation using org state signals
  switch (goal.category) {
    case 'engineering': {
      const wh = orgState?.workflowHistory;
      if (wh) {
        const successRate = 1 - (wh.failureRate ?? 0);
        const newProgress = Math.round(successRate * 100);
        if (newProgress !== progress) { progress = newProgress; progressChanged = true; }
        confidence = 0.7 + (wh.total > 50 ? 0.2 : 0);
      }
      break;
    }
    case 'infrastructure': {
      const cs = orgState?.connectorState;
      if (cs && cs.total > 0) {
        const uptime = cs.connected / cs.total;
        const newProgress = Math.round(uptime * 100);
        if (newProgress !== progress) { progress = newProgress; progressChanged = true; }
        confidence = 0.8;
      }
      break;
    }
    case 'security': {
      const incidents = orgState?.incidents ?? [];
      const criticals = incidents.filter(i => i.severity === 'CRITICAL').length;
      const newProgress = criticals === 0 ? 100 : Math.max(0, 100 - criticals * 20);
      if (newProgress !== progress) { progress = newProgress; progressChanged = true; }
      confidence = 0.85;
      break;
    }
    case 'hr': {
      const wl = orgState?.teamWorkload?.assignments ?? [];
      if (wl.length > 0) {
        const maxLoad = Math.max(...wl.map(w => Number(w.open_tasks)));
        const newProgress = maxLoad < 10 ? 100 : Math.max(0, 100 - (maxLoad - 10) * 5);
        if (newProgress !== progress) { progress = newProgress; progressChanged = true; }
        confidence = 0.65;
      }
      break;
    }
    case 'sales': {
      const cs = orgState?.customerSignals;
      if (cs?.avg_health) {
        const newProgress = Math.min(100, Math.round(Number(cs.avg_health)));
        if (newProgress !== progress) { progress = newProgress; progressChanged = true; }
        confidence = 0.7;
      }
      break;
    }
    default: {
      if (goal.target_value && goal.current_value !== null) {
        const t = Number(goal.target_value);
        const c = Number(goal.current_value ?? 0);
        const newProgress = t > 0 ? Math.min(100, Math.round((c / t) * 100)) : 0;
        if (newProgress !== progress) { progress = newProgress; progressChanged = true; }
      }
    }
  }

  // Auto-achieve / auto-miss
  if (progress >= 100 && status === 'ACTIVE')                           { status = 'ACHIEVED'; statusChanged = true; }
  if (goal.deadline && new Date(goal.deadline) < new Date() && progress < 100 && status === 'ACTIVE') {
    status = 'MISSED'; statusChanged = true;
  }

  return { progress, confidence, status, progressChanged, statusChanged };
}

// ── Summaries for the ContinuousPlanner ──────────────────────────────────────

export async function getGoalGaps(workspaceId) {
  const goals = await listGoals(workspaceId, { status: 'ACTIVE' });
  return goals
    .map(g => ({ ...g, gap: 100 - Number(g.current_progress ?? 0) }))
    .filter(g => g.gap > 20)
    .sort((a, b) => {
      const pOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
      return (pOrder[a.priority] ?? 3) - (pOrder[b.priority] ?? 3);
    });
}

function _camel2snake(s) {
  return s.replace(/([A-Z])/g, m => `_${m.toLowerCase()}`);
}
