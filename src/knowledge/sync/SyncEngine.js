/**
 * SyncEngine — orchestrates incremental synchronization of connector data into
 * the Enterprise Knowledge Graph.
 *
 * Each connector provides a "sync adapter" — a function that maps connector
 * objects to KGNodeInputs and KGEdgeInputs. The SyncEngine:
 *   1. Loads the sync state (cursor, last_synced_at) from kg_sync_state
 *   2. Calls the adapter to extract nodes + edges
 *   3. Bulk-upserts them into the KG
 *   4. Updates the sync state cursor
 *   5. Broadcasts KNOWLEDGE_GRAPH_SYNCED over WebSocket
 *
 * The engine never calls connector APIs directly — it accepts pre-fetched data
 * from the caller (same pattern as WorkflowLoader).
 *
 * Planner integration:
 *   - Planners call KGQueryGateway (read-only); they never call SyncEngine.
 *   - Workflow steps that mutate the graph must go through registered actions
 *     in the Action Registry (registered at bottom of this file).
 */

import { pool }                    from '../../config/db.js';
import { logger }                  from '../../utils/logger.js';
import { bulkUpsertNodes, bulkUpsertEdges } from '../storage/GraphStore.js';
import { resolveEntity, linkAlias } from '../storage/EntityResolver.js';
import { broadcastToWorkspace }    from '../../services/socketService.js';
import { buildNodeId }             from '../schema/SchemaValidator.js';

// ── Sync state ────────────────────────────────────────────────────────────────

export async function getSyncState(workspaceId, entityType, source) {
  const { rows } = await pool.query(
    `SELECT * FROM kg_sync_state
     WHERE workspace_id = $1 AND entity_type = $2 AND source = $3`,
    [workspaceId, entityType, source]
  );
  return rows[0] ?? null;
}

async function _setSyncRunning(workspaceId, entityType, source) {
  await pool.query(
    `INSERT INTO kg_sync_state (workspace_id, entity_type, source, status, started_at)
     VALUES ($1,$2,$3,'RUNNING',NOW())
     ON CONFLICT (workspace_id, entity_type, source)
     DO UPDATE SET status = 'RUNNING', started_at = NOW(), error = NULL`,
    [workspaceId, entityType, source]
  );
}

async function _setSyncComplete(workspaceId, entityType, source, cursor, nodeCount, edgeCount) {
  await pool.query(
    `UPDATE kg_sync_state
     SET status = 'COMPLETED', last_synced_at = NOW(),
         sync_cursor = $4, node_count = $5, edge_count = $6, completed_at = NOW()
     WHERE workspace_id = $1 AND entity_type = $2 AND source = $3`,
    [workspaceId, entityType, source, cursor ?? null, nodeCount, edgeCount]
  );
}

async function _setSyncFailed(workspaceId, entityType, source, error) {
  await pool.query(
    `UPDATE kg_sync_state
     SET status = 'FAILED', error = $4, completed_at = NOW()
     WHERE workspace_id = $1 AND entity_type = $2 AND source = $3`,
    [workspaceId, entityType, source, String(error)]
  );
}

// ── Core sync ─────────────────────────────────────────────────────────────────

/**
 * Sync a batch of pre-fetched entities into the KG.
 *
 * @param {string} workspaceId
 * @param {string} source        — source system (e.g., 'github', 'jira')
 * @param {string} entityType    — EntityType value
 * @param {object} data
 * @param {import('../types.js').KGNodeInput[]} data.nodes
 * @param {import('../types.js').KGEdgeInput[]} [data.edges]
 * @param {string|null} [data.cursor]  — pagination cursor for incremental sync
 * @returns {Promise<{ nodesUpserted: number, edgesUpserted: number }>}
 */
export async function syncEntities(workspaceId, source, entityType, data) {
  const { nodes = [], edges = [], cursor = null } = data;

  await _setSyncRunning(workspaceId, entityType, source);

  try {
    // Resolve entities before bulk upsert
    const resolvedNodes = [];
    const aliasLinks    = [];

    for (const node of nodes) {
      const resolution = await resolveEntity(workspaceId, node);
      if (resolution.method === 'NAME_MATCH' && !resolution.canonical) {
        // This is an alias — upsert the alias node then link it
        const aliasNode = await _upsertSingle(workspaceId, node);
        aliasLinks.push({ aliasId: aliasNode.id, canonicalId: resolution.nodeId });
      } else {
        resolvedNodes.push(node);
      }
    }

    const [upsertedNodes, upsertedEdges] = await Promise.all([
      bulkUpsertNodes(workspaceId, resolvedNodes),
      edges.length ? bulkUpsertEdges(workspaceId, edges) : Promise.resolve([]),
    ]);

    // Link aliases after nodes exist
    for (const { aliasId, canonicalId } of aliasLinks) {
      await linkAlias(workspaceId, aliasId, canonicalId).catch(() => {});
    }

    await _setSyncComplete(workspaceId, entityType, source, cursor, upsertedNodes.length, upsertedEdges.length);

    broadcastToWorkspace(workspaceId, 'KNOWLEDGE_GRAPH_SYNCED', {
      source, entityType,
      nodesUpserted: upsertedNodes.length,
      edgesUpserted: upsertedEdges.length,
    });

    logger.info(`[SyncEngine] ${workspaceId}/${source}/${entityType}: ${upsertedNodes.length} nodes, ${upsertedEdges.length} edges`);
    return { nodesUpserted: upsertedNodes.length, edgesUpserted: upsertedEdges.length };

  } catch (err) {
    await _setSyncFailed(workspaceId, entityType, source, err);
    logger.error(`[SyncEngine] sync failed for ${workspaceId}/${source}/${entityType}: ${err.message}`);
    throw err;
  }
}

/**
 * Incremental sync — only processes entities changed since last sync.
 * The caller is responsible for fetching only the delta (using the cursor).
 *
 * @param {string} workspaceId
 * @param {string} source
 * @param {string} entityType
 * @param {Function} fetchFn — async (cursor) => { nodes, edges, nextCursor }
 */
export async function incrementalSync(workspaceId, source, entityType, fetchFn) {
  const state = await getSyncState(workspaceId, entityType, source);
  const cursor = state?.sync_cursor ?? null;

  const data = await fetchFn(cursor);
  if (!data.nodes?.length && !data.edges?.length) {
    logger.info(`[SyncEngine] ${workspaceId}/${source}/${entityType}: no changes since ${cursor ?? 'beginning'}`);
    return { nodesUpserted: 0, edgesUpserted: 0 };
  }

  return syncEntities(workspaceId, source, entityType, { ...data, cursor: data.nextCursor ?? cursor });
}

/**
 * Update a single node's properties in the KG.
 * Used by workflow registered actions.
 *
 * @param {string} workspaceId
 * @param {string} nodeId
 * @param {Record<string,unknown>} propertyPatch
 */
export async function updateNodeProperties(workspaceId, nodeId, propertyPatch) {
  const { rows } = await pool.query(
    `UPDATE kg_nodes
     SET properties = properties || $3::jsonb, updated_at = NOW()
     WHERE id = $1 AND workspace_id = $2
     RETURNING *`,
    [nodeId, workspaceId, JSON.stringify(propertyPatch)]
  );
  return rows[0] ?? null;
}

/**
 * Add a relationship between two nodes.
 * Used by workflow registered actions.
 */
export async function addRelationship(workspaceId, edgeInput) {
  const { bulkUpsertEdges: upsert } = await import('../storage/GraphStore.js');
  const results = await upsert(workspaceId, [edgeInput]);
  return results[0];
}

/**
 * Remove a relationship between two nodes.
 * Used by workflow registered actions.
 */
export async function removeRelationship(workspaceId, sourceId, targetId, relationshipType) {
  const { rows } = await pool.query(
    `DELETE FROM kg_edges
     WHERE workspace_id = $1 AND source_id = $2 AND target_id = $3 AND relationship_type = $4
     RETURNING id`,
    [workspaceId, sourceId, targetId, relationshipType]
  );
  return rows[0] ?? null;
}

// ── Full re-sync ──────────────────────────────────────────────────────────────

/**
 * Wipe all nodes/edges from a specific source and re-sync from scratch.
 * Use with care — this removes all graph knowledge from that source.
 *
 * @param {string} workspaceId
 * @param {string} source
 */
export async function fullResync(workspaceId, source, entityType, data) {
  logger.warn(`[SyncEngine] Full resync initiated for ${workspaceId}/${source}/${entityType}`);
  await pool.query(
    `DELETE FROM kg_nodes WHERE workspace_id = $1 AND source = $2 AND entity_type = $3`,
    [workspaceId, source, entityType]
  );
  // Edges cascade via ON DELETE CASCADE
  return syncEntities(workspaceId, source, entityType, data);
}

// ── All sync states ───────────────────────────────────────────────────────────

export async function listSyncStates(workspaceId) {
  const { rows } = await pool.query(
    `SELECT * FROM kg_sync_state WHERE workspace_id = $1 ORDER BY last_synced_at DESC NULLS LAST`,
    [workspaceId]
  );
  return rows;
}

// ── Internal ──────────────────────────────────────────────────────────────────

async function _upsertSingle(workspaceId, nodeInput) {
  const results = await bulkUpsertNodes(workspaceId, [nodeInput]);
  return results[0];
}
