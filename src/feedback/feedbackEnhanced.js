/**
 * Enhanced Feedback Engine — v1.0 Launch (Program 9)
 *
 * Extends the basic thumbs-only pilot_feedback with typed, prioritized, auto-classified
 * feedback items stored in feedback_items. Provides priority scoring and dashboard data.
 */

import db from '../config/db.js';
import { eventBus } from '../core/events/eventBus.js';

const TYPE_PRIORITY = {
  bug:                    { base: 'high', canEscalate: true },
  complaint:              { base: 'high', canEscalate: true },
  feature_request:        { base: 'medium', canEscalate: false },
  conversation_rating:    { base: 'low', canEscalate: false },
  workflow_rating:        { base: 'low', canEscalate: false },
  recommendation_rating:  { base: 'low', canEscalate: false },
  brief_rating:           { base: 'low', canEscalate: false },
  general:                { base: 'medium', canEscalate: false },
};

function autoPriority(type, rating, description) {
  const rule = TYPE_PRIORITY[type] ?? TYPE_PRIORITY.general;
  let priority = rule.base;

  if (rule.canEscalate) {
    const text = (description ?? '').toLowerCase();
    if (text.includes('crash') || text.includes('data loss') || text.includes('security')) {
      priority = 'critical';
    } else if (rating !== null && rating !== undefined && rating <= 2) {
      priority = 'high';
    }
  }

  if (type === 'conversation_rating' || type === 'workflow_rating') {
    if (rating !== null && rating !== undefined && rating <= 2) priority = 'high';
  }

  return priority;
}

export async function submitFeedbackItem(workspaceId, userId, data) {
  const {
    type = 'general', subject = '', description, rating, metadata = {},
  } = data;

  const priority = autoPriority(type, rating, description);

  const { rows } = await db.query(
    `INSERT INTO feedback_items
       (workspace_id, user_id, type, subject, description, rating, priority, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [workspaceId, userId ?? null, type, subject, description ?? null, rating ?? null, priority, JSON.stringify(metadata)],
  );

  eventBus.emit('FEEDBACK_SUBMITTED', { workspaceId, ...rows[0] });
  return rows[0];
}

export async function listFeedback(workspaceId, { type, priority, status, limit = 50 } = {}) {
  let where = 'workspace_id = $1';
  const vals = [workspaceId];
  let i = 2;
  if (type)     { where += ` AND type = $${i++}`;     vals.push(type); }
  if (priority) { where += ` AND priority = $${i++}`; vals.push(priority); }
  if (status)   { where += ` AND status = $${i++}`;   vals.push(status); }
  vals.push(Math.min(100, limit));

  const { rows } = await db.query(
    `SELECT * FROM feedback_items WHERE ${where} ORDER BY
       CASE priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
       created_at DESC
     LIMIT $${i}`,
    vals,
  );
  return rows;
}

export async function updateFeedbackStatus(id, status) {
  const { rows } = await db.query(
    `UPDATE feedback_items SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
    [status, id],
  );
  return rows[0] ?? null;
}

export async function getFeedbackSummary(workspaceId, days = 30) {
  const [byType, byPriority, byStatus, avgRating] = await Promise.all([
    db.query(
      `SELECT type, COUNT(*)::int n FROM feedback_items
       WHERE workspace_id = $1 AND created_at > NOW() - ($2::int * INTERVAL '1 day')
       GROUP BY type ORDER BY n DESC`,
      [workspaceId, days],
    ),
    db.query(
      `SELECT priority, COUNT(*)::int n FROM feedback_items
       WHERE workspace_id = $1 AND created_at > NOW() - ($2::int * INTERVAL '1 day')
       GROUP BY priority`,
      [workspaceId, days],
    ),
    db.query(
      `SELECT status, COUNT(*)::int n FROM feedback_items
       WHERE workspace_id = $1
       GROUP BY status`,
      [workspaceId],
    ),
    db.query(
      `SELECT ROUND(AVG(rating)::numeric, 1) avg FROM feedback_items
       WHERE workspace_id = $1 AND rating IS NOT NULL
         AND created_at > NOW() - ($2::int * INTERVAL '1 day')`,
      [workspaceId, days],
    ),
  ]);

  return {
    byType:     Object.fromEntries(byType.rows.map(r => [r.type, r.n])),
    byPriority: Object.fromEntries(byPriority.rows.map(r => [r.priority, r.n])),
    byStatus:   Object.fromEntries(byStatus.rows.map(r => [r.status, r.n])),
    avgRating:  avgRating.rows[0]?.avg ?? null,
  };
}

export async function buildRoadmapSignals(workspaceId) {
  const { rows } = await db.query(
    `SELECT type, subject, description, priority, COUNT(*) OVER (PARTITION BY LOWER(subject)) AS votes,
            AVG(rating) OVER (PARTITION BY LOWER(subject)) AS avg_rating
     FROM feedback_items
     WHERE workspace_id = $1 AND type = 'feature_request' AND status IN ('open','triaged')
     ORDER BY votes DESC, avg_rating DESC NULLS LAST
     LIMIT 20`,
    [workspaceId],
  );
  return rows;
}
