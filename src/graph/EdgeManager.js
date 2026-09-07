/**
 * EdgeManager — durable edge upserts into graph_edges.
 *
 * Repeated observation of the same relationship increments observation_count and
 * bumps last_observed_at (feeding RelationshipScorer), while weight takes the max
 * seen. Edges reference tenant-namespaced node ids, so nodes must be upserted
 * first (FK).
 */

import db from '../config/db.js';
import { nodeKey } from './nodeTypes.js';
import { logger } from '../utils/logger.js';

/** Bulk-upsert edges. Returns count. Requires valid orgId (FK). */
export async function bulkUpsertEdges(workspaceId, orgId, edges) {
  if (!edges?.length || !orgId) return 0;
  const cols = 6; // source_id, target_id, workspace_id, org_id, relationship_type, weight
  const values = [];
  // id has no DB default (Prisma generates cuid() app-side), so raw inserts must supply it.
  const rows = edges.map((e, i) => {
    const b = i * cols;
    values.push(
      nodeKey(workspaceId, e.sourceRawId), nodeKey(workspaceId, e.targetRawId),
      String(workspaceId), orgId, e.type, e.weight ?? 1.0,
    );
    return `(gen_random_uuid()::text,$${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},NOW(),NOW())`;
  });
  try {
    await db.query(
      `INSERT INTO graph_edges (id, source_id, target_id, workspace_id, org_id, relationship_type, weight, created_at, last_observed_at)
       VALUES ${rows.join(',')}
       ON CONFLICT (source_id, target_id, relationship_type) DO UPDATE SET
         observation_count = graph_edges.observation_count + 1,
         weight = GREATEST(graph_edges.weight, EXCLUDED.weight),
         last_observed_at = NOW()`,
      values,
    );
    return edges.length;
  } catch (err) {
    // FK violations happen when an edge references a node that wasn't derived —
    // non-fatal, the graph stays consistent (the edge is simply skipped).
    logger.rag(`[EdgeManager] bulkUpsert failed: ${err.message}`);
    return 0;
  }
}

export async function upsertEdge(workspaceId, orgId, edge) {
  return bulkUpsertEdges(workspaceId, orgId, [edge]);
}
