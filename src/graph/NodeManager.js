/**
 * NodeManager — durable node upserts into graph_nodes (tenant-namespaced ids).
 *
 * Wraps the raw pg.Pool for bulk multi-row upserts with last_observed_at touch.
 * Node id = `${workspaceId}:${rawId}` (matches the Phase 7 operationalGraphService
 * scheme, so its traversal and existing brain consumers stay compatible).
 */

import db from '../config/db.js';
import { nodeKey } from './nodeTypes.js';
import { logger } from '../utils/logger.js';

/** Bulk-upsert nodes. Returns count upserted. Requires a valid orgId (FK). */
export async function bulkUpsertNodes(workspaceId, orgId, nodes) {
  if (!nodes?.length || !orgId) return 0;
  const cols = 6; // id, workspace_id, org_id, type, name, metadata
  const values = [];
  const rows = nodes.map((n, i) => {
    const b = i * cols;
    values.push(nodeKey(workspaceId, n.rawId), String(workspaceId), orgId, n.type, n.name || n.rawId, JSON.stringify(n.metadata || {}));
    return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},NOW(),NOW(),NOW())`;
  });
  try {
    await db.query(
      `INSERT INTO graph_nodes (id, workspace_id, org_id, type, name, metadata, created_at, updated_at, last_observed_at)
       VALUES ${rows.join(',')}
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         metadata = graph_nodes.metadata || EXCLUDED.metadata,
         updated_at = NOW(),
         last_observed_at = NOW()`,
      values,
    );
    return nodes.length;
  } catch (err) {
    logger.rag(`[NodeManager] bulkUpsert failed: ${err.message}`);
    return 0;
  }
}

export async function upsertNode(workspaceId, orgId, node) {
  return bulkUpsertNodes(workspaceId, orgId, [node]);
}

export async function getNode(workspaceId, rawOrFullId) {
  const id = rawOrFullId.startsWith(`${workspaceId}:`) ? rawOrFullId : nodeKey(workspaceId, rawOrFullId);
  const { rows } = await db.query(
    `SELECT id, type, name, metadata, created_at, last_observed_at
       FROM graph_nodes WHERE workspace_id = $1 AND id = $2`,
    [String(workspaceId), id],
  );
  return rows[0] || null;
}
