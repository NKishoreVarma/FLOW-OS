import { query } from '../config/db.js';
import { eventBus } from '../core/events/eventBus.js';

export async function submitFeedback(workspaceId, userId, { thumbs, text, context }) {
  const { rows } = await query(
    `INSERT INTO pilot_feedback (workspace_id, user_id, thumbs, text, context, reported_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     RETURNING id, workspace_id, user_id, thumbs, context, reported_at`,
    [workspaceId, userId ?? null, thumbs, text ?? null, context ?? null]
  );
  eventBus.emit('PILOT_FEEDBACK_SUBMITTED', { workspaceId, ...rows[0] });
  return rows[0];
}

export async function getFeedback(workspaceId, { limit = 20 } = {}) {
  const { rows } = await query(
    `SELECT id, workspace_id, user_id, thumbs, text, context, reported_at
     FROM pilot_feedback
     WHERE workspace_id = $1
     ORDER BY reported_at DESC
     LIMIT $2`,
    [workspaceId, limit]
  );
  return rows;
}
