/**
 * GraphSearch — tenant-scoped node lookup by name/type for the Explorer and
 * for resolving a natural-language entity to a graph node.
 */

import db from '../config/db.js';

export async function searchNodes(workspaceId, { text, type = null, limit = 30 } = {}) {
  const params = [String(workspaceId)];
  const where = ['workspace_id = $1'];
  let i = 2;
  if (text) { where.push(`name ILIKE $${i++}`); params.push(`%${text}%`); }
  if (type) { where.push(`type = $${i++}`); params.push(type); }
  params.push(Math.min(limit, 100));
  const { rows } = await db.query(
    `SELECT id, type, name, metadata, last_observed_at
       FROM graph_nodes WHERE ${where.join(' AND ')}
      ORDER BY last_observed_at DESC LIMIT $${i}`,
    params,
  );
  return rows;
}
