import { query } from '../config/db.js';

export async function trackEvent(workspaceId, userId, event, properties = {}) {
  await query(
    `INSERT INTO pilot_events (workspace_id, user_id, event, properties, ts)
     VALUES ($1, $2, $3, $4, NOW())`,
    [workspaceId, userId ?? null, event, JSON.stringify(properties)]
  );
}
