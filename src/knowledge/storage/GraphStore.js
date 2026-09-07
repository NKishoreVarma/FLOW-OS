/**
 * GraphStore — PostgreSQL CRUD for the Enterprise Knowledge Graph.
 *
 * All functions are workspace-scoped. No query touches data from another workspace.
 * Node IDs are deterministic: `${workspaceId}:${entityType}:${source}:${externalId}`
 *
 * Upsert semantics:
 *   - Nodes: ON CONFLICT (id) → update name/properties/confidence/last_seen_at
 *   - Edges: ON CONFLICT (workspace_id, source_id, target_id, relationship_type)
 *            → increment observation_count, update confidence
 */

import { pool }          from '../../config/db.js';
import { buildNodeId, validateNodeInput, validateEdgeInput } from '../schema/SchemaValidator.js';
import { scoreNode, scoreEdge, edgeReobservationConfidence } from './ConfidenceScorer.js';

// ── Node operations ───────────────────────────────────────────────────────────

/**
 * Create or update a node.
 * @param {string} workspaceId
 * @param {import('../types.js').KGNodeInput} input
 * @returns {Promise<import('../types.js').KGNode>}
 */
export async function upsertNode(workspaceId, input) {
  validateNodeInput(input);

  const id         = buildNodeId(workspaceId, input.entityType, input.source ?? 'internal', input.externalId);
  const confidence = input.confidence ?? scoreNode(input);
  const props      = input.properties ?? {};

  const { rows } = await pool.query(
    `INSERT INTO kg_nodes
       (id, workspace_id, entity_type, external_id, canonical_id,
        name, display_name, description, properties, source, confidence)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11)
     ON CONFLICT (id) DO UPDATE SET
       name         = EXCLUDED.name,
       display_name = COALESCE(EXCLUDED.display_name, kg_nodes.display_name),
       description  = COALESCE(EXCLUDED.description, kg_nodes.description),
       properties   = kg_nodes.properties || EXCLUDED.properties,
       confidence   = EXCLUDED.confidence,
       last_seen_at = NOW()
     RETURNING *`,
    [
      id, workspaceId, input.entityType, input.externalId,
      input.canonicalId ?? null,
      input.name.trim(), input.displayName ?? null, input.description ?? null,
      JSON.stringify(props), input.source ?? null, confidence,
    ]
  );
  return rows[0];
}

/**
 * Get a node by its primary key.
 * @param {string} workspaceId
 * @param {string} id
 * @returns {Promise<import('../types.js').KGNode|null>}
 */
export async function getNode(workspaceId, id) {
  const { rows } = await pool.query(
    `SELECT * FROM kg_nodes WHERE id = $1 AND workspace_id = $2`,
    [id, workspaceId]
  );
  return rows[0] ?? null;
}

/**
 * Find a node by its external ID + entity type + source.
 */
export async function getNodeByExternalId(workspaceId, entityType, externalId, source = 'internal') {
  const id = buildNodeId(workspaceId, entityType, source, externalId);
  return getNode(workspaceId, id);
}

/**
 * List nodes with optional filters.
 * @param {string} workspaceId
 * @param {{ entityType?, source?, minConfidence?, limit?, offset? }} opts
 */
export async function listNodes(workspaceId, {
  entityType    = null,
  source        = null,
  minConfidence = 0,
  limit         = 50,
  offset        = 0,
} = {}) {
  const conditions = ['workspace_id = $1', 'confidence >= $2'];
  const params     = [workspaceId, minConfidence];
  let   idx        = 3;

  if (entityType) { conditions.push(`entity_type = $${idx++}`); params.push(entityType); }
  if (source)     { conditions.push(`source = $${idx++}`);       params.push(source); }

  params.push(Math.min(limit, 500), offset);

  const { rows } = await pool.query(
    `SELECT * FROM kg_nodes
     WHERE ${conditions.join(' AND ')}
     ORDER BY confidence DESC, last_seen_at DESC
     LIMIT $${idx} OFFSET $${idx + 1}`,
    params
  );
  return rows;
}

/**
 * Full-text search on node name.
 * @param {string} workspaceId
 * @param {string} query
 * @param {{ entityType?, limit? }} opts
 */
export async function searchNodes(workspaceId, query, { entityType = null, limit = 20 } = {}) {
  const params  = [workspaceId, query];
  let   idx     = 3;
  const extra   = entityType ? `AND entity_type = $${idx++}` : '';
  if (entityType) params.push(entityType);
  params.push(Math.min(limit, 100));

  const { rows } = await pool.query(
    `SELECT *, ts_rank(to_tsvector('english', name), plainto_tsquery('english', $2)) AS rank
     FROM kg_nodes
     WHERE workspace_id = $1
       AND to_tsvector('english', name) @@ plainto_tsquery('english', $2)
       ${extra}
     ORDER BY rank DESC, confidence DESC
     LIMIT $${idx}`,
    params
  );
  return rows;
}

/**
 * Count nodes per entity type for the workspace.
 * @returns {Promise<Record<string,number>>}
 */
export async function countNodesByType(workspaceId) {
  const { rows } = await pool.query(
    `SELECT entity_type, COUNT(*) AS n FROM kg_nodes
     WHERE workspace_id = $1 GROUP BY entity_type`,
    [workspaceId]
  );
  return Object.fromEntries(rows.map(r => [r.entity_type, parseInt(r.n, 10)]));
}

/**
 * Delete a node (cascades to edges).
 */
export async function deleteNode(workspaceId, id) {
  await pool.query(
    `DELETE FROM kg_nodes WHERE id = $1 AND workspace_id = $2`,
    [id, workspaceId]
  );
}

/**
 * Bulk upsert nodes (single round-trip).
 * @param {string} workspaceId
 * @param {Array<import('../types.js').KGNodeInput>} inputs
 * @returns {Promise<import('../types.js').KGNode[]>}
 */
export async function bulkUpsertNodes(workspaceId, inputs) {
  if (!inputs.length) return [];

  const values  = [];
  const params  = [];
  let   pidx    = 1;

  for (const input of inputs) {
    validateNodeInput(input);
    const id         = buildNodeId(workspaceId, input.entityType, input.source ?? 'internal', input.externalId);
    const confidence = input.confidence ?? scoreNode(input);
    const props      = input.properties ?? {};

    values.push(`($${pidx},$${pidx+1},$${pidx+2},$${pidx+3},$${pidx+4},$${pidx+5},$${pidx+6},$${pidx+7},$${pidx+8}::jsonb,$${pidx+9},$${pidx+10})`);
    params.push(
      id, workspaceId, input.entityType, input.externalId,
      input.canonicalId ?? null,
      input.name.trim(), input.displayName ?? null, input.description ?? null,
      JSON.stringify(props), input.source ?? null, confidence
    );
    pidx += 11;
  }

  const { rows } = await pool.query(
    `INSERT INTO kg_nodes
       (id, workspace_id, entity_type, external_id, canonical_id,
        name, display_name, description, properties, source, confidence)
     VALUES ${values.join(',')}
     ON CONFLICT (id) DO UPDATE SET
       name         = EXCLUDED.name,
       display_name = COALESCE(EXCLUDED.display_name, kg_nodes.display_name),
       description  = COALESCE(EXCLUDED.description, kg_nodes.description),
       properties   = kg_nodes.properties || EXCLUDED.properties,
       confidence   = EXCLUDED.confidence,
       last_seen_at = NOW()
     RETURNING *`,
    params
  );
  return rows;
}

// ── Edge operations ───────────────────────────────────────────────────────────

/**
 * Create or update an edge. Each re-observation increments observation_count.
 * @param {string} workspaceId
 * @param {import('../types.js').KGEdgeInput} input
 * @returns {Promise<import('../types.js').KGEdge>}
 */
export async function upsertEdge(workspaceId, input) {
  validateEdgeInput(input);

  const confidence = input.confidence ?? scoreEdge({ ...input, observation_count: 1 });
  const weight     = input.weight ?? 1.0;
  const props      = input.properties ?? {};

  const { rows } = await pool.query(
    `INSERT INTO kg_edges
       (workspace_id, source_id, target_id, relationship_type,
        properties, confidence, weight, observation_count, source_system)
     VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,1,$8)
     ON CONFLICT (workspace_id, source_id, target_id, relationship_type) DO UPDATE SET
       observation_count = kg_edges.observation_count + 1,
       last_observed_at  = NOW(),
       confidence        = $6,
       weight            = GREATEST(kg_edges.weight, $7),
       properties        = kg_edges.properties || EXCLUDED.properties
     RETURNING *`,
    [
      workspaceId, input.sourceId, input.targetId, input.relationshipType,
      JSON.stringify(props), confidence, weight, input.sourceSystem ?? null,
    ]
  );
  return rows[0];
}

/**
 * Get an edge by ID.
 */
export async function getEdge(workspaceId, id) {
  const { rows } = await pool.query(
    `SELECT * FROM kg_edges WHERE id = $1 AND workspace_id = $2`,
    [id, workspaceId]
  );
  return rows[0] ?? null;
}

/**
 * Get all edges for a node (outbound and/or inbound).
 * @param {string} workspaceId
 * @param {string} nodeId
 * @param {{ direction?: 'outbound'|'inbound'|'both', relationshipTypes?: string[] }} opts
 */
export async function getEdgesForNode(workspaceId, nodeId, {
  direction         = 'both',
  relationshipTypes = null,
} = {}) {
  const dirCond = direction === 'outbound' ? 'source_id = $2'
                : direction === 'inbound'  ? 'target_id = $2'
                : '(source_id = $2 OR target_id = $2)';

  const params = [workspaceId, nodeId];
  let   typeCond = '';
  if (relationshipTypes?.length) {
    params.push(relationshipTypes);
    typeCond = `AND relationship_type = ANY($3)`;
  }

  const { rows } = await pool.query(
    `SELECT * FROM kg_edges
     WHERE workspace_id = $1 AND ${dirCond} ${typeCond}
     ORDER BY confidence DESC, observation_count DESC`,
    params
  );
  return rows;
}

/**
 * Get 1-hop neighbor NODES with their connecting edge metadata.
 * @param {string} workspaceId
 * @param {string} nodeId
 * @param {{ direction?, relationshipTypes?, entityTypes?, minConfidence?, limit? }} opts
 * @returns {Promise<Array<import('../types.js').KGNode & { edge_type: string, edge_confidence: number, edge_id: string, direction: string }>>}
 */
export async function getNeighbors(workspaceId, nodeId, {
  direction         = 'both',
  relationshipTypes = null,
  entityTypes       = null,
  minConfidence     = 0,
  limit             = 100,
} = {}) {
  const params = [workspaceId, nodeId, minConfidence, Math.min(limit, 500)];
  let idx = 5;

  const typeCond  = relationshipTypes?.length ? `AND e.relationship_type = ANY($${idx++})` : '';
  if (relationshipTypes?.length) params.push(relationshipTypes);
  const etCond    = entityTypes?.length ? `AND n.entity_type = ANY($${idx++})` : '';
  if (entityTypes?.length) params.push(entityTypes);

  const dirCond = direction === 'outbound' ? 'e.source_id = $2'
                : direction === 'inbound'  ? 'e.target_id = $2'
                : '(e.source_id = $2 OR e.target_id = $2)';

  const { rows } = await pool.query(
    `SELECT n.*,
            e.id          AS edge_id,
            e.relationship_type AS edge_type,
            e.confidence  AS edge_confidence,
            e.observation_count,
            CASE WHEN e.source_id = $2 THEN 'outbound' ELSE 'inbound' END AS direction
     FROM kg_edges e
     JOIN kg_nodes n ON n.id = CASE WHEN e.source_id = $2 THEN e.target_id ELSE e.source_id END
     WHERE e.workspace_id = $1 AND ${dirCond}
       AND e.confidence >= $3
       ${typeCond} ${etCond}
       AND n.workspace_id = $1
     ORDER BY e.confidence DESC, e.observation_count DESC
     LIMIT $4`,
    params
  );
  return rows;
}

/**
 * Get neighbors for multiple nodes in one query (for BFS frontier expansion).
 * @param {string} workspaceId
 * @param {string[]} nodeIds
 * @param {{ direction?, relationshipTypes?, entityTypes?, minConfidence? }} opts
 */
export async function getNeighborsBatch(workspaceId, nodeIds, {
  direction         = 'both',
  relationshipTypes = null,
  entityTypes       = null,
  minConfidence     = 0,
} = {}) {
  if (!nodeIds.length) return [];

  const params = [workspaceId, nodeIds, minConfidence];
  let idx = 4;

  const typeCond = relationshipTypes?.length ? `AND e.relationship_type = ANY($${idx++})` : '';
  if (relationshipTypes?.length) params.push(relationshipTypes);
  const etCond = entityTypes?.length ? `AND n.entity_type = ANY($${idx++})` : '';
  if (entityTypes?.length) params.push(entityTypes);

  const dirCond = direction === 'outbound' ? 'e.source_id = ANY($2)'
                : direction === 'inbound'  ? 'e.target_id = ANY($2)'
                : '(e.source_id = ANY($2) OR e.target_id = ANY($2))';

  const { rows } = await pool.query(
    `SELECT n.*,
            e.id   AS edge_id,
            e.relationship_type AS edge_type,
            e.confidence  AS edge_confidence,
            e.observation_count,
            CASE WHEN e.source_id = ANY($2) THEN e.source_id ELSE e.target_id END AS frontier_node_id,
            CASE WHEN e.source_id = ANY($2) THEN 'outbound' ELSE 'inbound' END    AS direction
     FROM kg_edges e
     JOIN kg_nodes n ON n.id = CASE WHEN e.source_id = ANY($2) THEN e.target_id ELSE e.source_id END
     WHERE e.workspace_id = $1 AND ${dirCond}
       AND e.confidence >= $3
       ${typeCond} ${etCond}
       AND n.workspace_id = $1`,
    params
  );
  return rows;
}

/**
 * Delete an edge.
 */
export async function deleteEdge(workspaceId, id) {
  await pool.query(
    `DELETE FROM kg_edges WHERE id = $1 AND workspace_id = $2`,
    [id, workspaceId]
  );
}

/**
 * Bulk upsert edges.
 * @param {string} workspaceId
 * @param {Array<import('../types.js').KGEdgeInput>} inputs
 */
export async function bulkUpsertEdges(workspaceId, inputs) {
  if (!inputs.length) return [];

  const results = [];
  // Batch in groups of 100 to avoid paramater limits
  const BATCH  = 100;
  for (let i = 0; i < inputs.length; i += BATCH) {
    const batch = inputs.slice(i, i + BATCH);
    const vals  = [];
    const params = [workspaceId];
    let pidx    = 2;

    for (const input of batch) {
      validateEdgeInput(input);
      const c = input.confidence ?? scoreEdge({ ...input, observation_count: 1 });
      const w = input.weight ?? 1.0;
      vals.push(`($1,$${pidx},$${pidx+1},$${pidx+2},$${pidx+3}::jsonb,$${pidx+4},$${pidx+5},$${pidx+6})`);
      params.push(
        input.sourceId, input.targetId, input.relationshipType,
        JSON.stringify(input.properties ?? {}), c, w,
        input.sourceSystem ?? null
      );
      pidx += 7;
    }

    const { rows } = await pool.query(
      `INSERT INTO kg_edges
         (workspace_id, source_id, target_id, relationship_type,
          properties, confidence, weight, source_system)
       VALUES ${vals.join(',')}
       ON CONFLICT (workspace_id, source_id, target_id, relationship_type) DO UPDATE SET
         observation_count = kg_edges.observation_count + 1,
         last_observed_at  = NOW(),
         confidence        = EXCLUDED.confidence,
         properties        = kg_edges.properties || EXCLUDED.properties
       RETURNING *`,
      params
    );
    results.push(...rows);
  }
  return results;
}

// ── Stats ─────────────────────────────────────────────────────────────────────

/**
 * Return basic graph statistics for a workspace.
 */
export async function graphStats(workspaceId) {
  const [nodeRes, edgeRes] = await Promise.all([
    pool.query(
      `SELECT entity_type, COUNT(*) AS n, AVG(confidence) AS avg_conf
       FROM kg_nodes WHERE workspace_id = $1
       GROUP BY entity_type ORDER BY n DESC`,
      [workspaceId]
    ),
    pool.query(
      `SELECT relationship_type, COUNT(*) AS n
       FROM kg_edges WHERE workspace_id = $1
       GROUP BY relationship_type ORDER BY n DESC`,
      [workspaceId]
    ),
  ]);

  const totalNodes = nodeRes.rows.reduce((s, r) => s + parseInt(r.n, 10), 0);
  const totalEdges = edgeRes.rows.reduce((s, r) => s + parseInt(r.n, 10), 0);

  return {
    totalNodes,
    totalEdges,
    nodesByType:     Object.fromEntries(nodeRes.rows.map(r => [r.entity_type, parseInt(r.n, 10)])),
    avgConfByType:   Object.fromEntries(nodeRes.rows.map(r => [r.entity_type, parseFloat(r.avg_conf).toFixed(2)])),
    edgesByType:     Object.fromEntries(edgeRes.rows.map(r => [r.relationship_type, parseInt(r.n, 10)])),
  };
}
