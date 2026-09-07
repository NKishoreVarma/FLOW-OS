/**
 * KnowledgeTrace — Trust Center
 *
 * Explains which knowledge contributed to a FLOW answer:
 *   - Graph nodes and edges traversed
 *   - Vector chunks retrieved
 *   - Documents surfaced
 *   - Conversation history used
 *
 * Reads from:
 *   graph_nodes, graph_edges, workspace_intel_chunks,
 *   copilot_conversations, copilot_messages, flow_events
 *
 * Never modifies data.
 */

import { query } from '../config/db.js';

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Get the full knowledge trace for a copilot conversation or query.
 * id may be: copilot_conversation id, copilot_message id, or query trace id.
 */
export async function getKnowledgeTrace(id, workspaceId) {
  const [graph, chunks, conversation] = await Promise.allSettled([
    _getGraphContext(id, workspaceId),
    _getChunkContext(id, workspaceId),
    _getConversationContext(id, workspaceId),
  ]);

  const graphNodes = graph.status  === 'fulfilled' ? graph.value.nodes  : [];
  const graphEdges = graph.status  === 'fulfilled' ? graph.value.edges  : [];
  const chunkList  = chunks.status === 'fulfilled' ? chunks.value       : [];
  const convo      = conversation.status === 'fulfilled' ? conversation.value : null;

  const entities = _buildEntitySummary(graphNodes);
  const documents = _extractDocuments(chunkList);

  return {
    id,
    workspaceId,
    graphNodes,
    graphEdges,
    chunks:      chunkList,
    documents,
    conversation: convo,
    entities,
    summary: {
      totalNodes:         graphNodes.length,
      totalEdges:         graphEdges.length,
      totalChunks:        chunkList.length,
      totalDocuments:     documents.length,
      nodeTypes:          _countByField(graphNodes, 'type'),
      edgeTypes:          _countByField(graphEdges, 'type'),
      connectorSources:   _countByField(chunkList, 'connector'),
    },
    explanation: _buildExplanation(graphNodes, chunkList, convo),
  };
}

/**
 * Get graph entity context for a node ID.
 * Returns the node, its neighbors (2 hops), and relevant chunks.
 */
export async function getEntityContext(nodeId, workspaceId) {
  const { rows: nodeRows } = await query(
    `SELECT id, type, label, properties, connector, last_observed_at
     FROM graph_nodes
     WHERE id = $1 AND workspace_id = $2`,
    [nodeId, workspaceId]
  ).catch(() => ({ rows: [] }));

  if (!nodeRows[0]) return null;
  const node = _normalizeNode(nodeRows[0]);

  const { rows: edgeRows } = await query(
    `SELECT ge.*, gn.type AS target_type, gn.label AS target_label
     FROM graph_edges ge
     JOIN graph_nodes gn ON gn.id = ge.target_id AND gn.workspace_id = $2
     WHERE ge.workspace_id = $2 AND (ge.source_id = $1 OR ge.target_id = $1)
     ORDER BY ge.strength DESC NULLS LAST LIMIT 30`,
    [nodeId, workspaceId]
  ).catch(() => ({ rows: [] }));

  const edges = edgeRows.map(_normalizeEdge);
  const neighborIds = [...new Set(edgeRows.flatMap(e => [e.source_id, e.target_id]).filter(x => x !== nodeId))];
  const neighbors = await _fetchNodes(neighborIds.slice(0, 20), workspaceId);

  const chunks = await _searchChunksByEntity(node.label, workspaceId);

  return {
    node,
    edges,
    neighbors,
    chunks,
    totalEdges:     edges.length,
    totalNeighbors: neighbors.length,
    totalChunks:    chunks.length,
  };
}

/**
 * List knowledge sources referenced in a time window.
 * Used for the Trust Center knowledge map view.
 */
export async function getKnowledgeMap(workspaceId, { days = 7 } = {}) {
  const since = new Date(Date.now() - days * 86400_000).toISOString();

  const [nodeStats, chunkStats] = await Promise.allSettled([
    query(
      `SELECT type, COUNT(*) AS count, MAX(last_observed_at) AS latest
       FROM graph_nodes WHERE workspace_id = $1 AND last_observed_at >= $2
       GROUP BY type ORDER BY count DESC`,
      [workspaceId, since]
    ).catch(() => ({ rows: [] })),
    query(
      `SELECT source, COUNT(*) AS count, MAX(created_at) AS latest
       FROM workspace_intel_chunks WHERE workspace_id = $1 AND created_at >= $2
       GROUP BY source ORDER BY count DESC`,
      [workspaceId, since]
    ).catch(() => ({ rows: [] })),
  ]);

  return {
    nodesByType:   nodeStats.status   === 'fulfilled' ? nodeStats.value.rows.map(r => ({ type: r.type, count: Number(r.count), latest: r.latest }))   : [],
    chunksBySource: chunkStats.status === 'fulfilled' ? chunkStats.value.rows.map(r => ({ source: r.source, count: Number(r.count), latest: r.latest })) : [],
    generatedAt:   new Date().toISOString(),
  };
}

// ── Internal ──────────────────────────────────────────────────────────────────

async function _getGraphContext(id, workspaceId) {
  const { rows: nodeRows } = await query(
    `SELECT gn.id, gn.type, gn.label, gn.properties, gn.connector, gn.last_observed_at
     FROM graph_nodes gn
     WHERE gn.workspace_id = $1
       AND (gn.properties->>'contextId' = $2
        OR gn.properties->>'queryId'    = $2
        OR gn.properties->>'briefingId' = $2)
     LIMIT 50`,
    [workspaceId, id]
  ).catch(() => ({ rows: [] }));

  if (!nodeRows.length) return { nodes: [], edges: [] };

  const nodeIds = nodeRows.map(r => r.id);
  const { rows: edgeRows } = await query(
    `SELECT id, source_id, target_id, type, strength, observation_count, last_observed_at
     FROM graph_edges
     WHERE workspace_id = $1
       AND (source_id = ANY($2) OR target_id = ANY($2))
     LIMIT 100`,
    [workspaceId, nodeIds]
  ).catch(() => ({ rows: [] }));

  return {
    nodes: nodeRows.map(_normalizeNode),
    edges: edgeRows.map(_normalizeEdge),
  };
}

async function _getChunkContext(id, workspaceId) {
  const { rows } = await query(
    `SELECT id, source, channel, content, metadata, authority_score, importance_score, created_at
     FROM workspace_intel_chunks
     WHERE workspace_id = $1
       AND (metadata->>'contextId' = $2
        OR metadata->>'queryId'    = $2
        OR metadata->>'briefingId' = $2)
     ORDER BY authority_score DESC NULLS LAST
     LIMIT 30`,
    [workspaceId, id]
  ).catch(() => ({ rows: [] }));

  return rows.map(r => {
    const meta = _parseJson(r.metadata, {});
    return {
      id:             r.id,
      source:         r.source,
      connector:      meta.connector ?? meta.platform ?? r.source,
      channel:        r.channel,
      previewText:    r.content?.slice(0, 200) ?? null,
      authorityScore: r.authority_score != null ? parseFloat(r.authority_score) : null,
      importanceScore: r.importance_score != null ? parseFloat(r.importance_score) : null,
      createdAt:      r.created_at,
    };
  });
}

async function _getConversationContext(id, workspaceId) {
  const { rows } = await query(
    `SELECT cc.id, cc.page_context, cc.entity_id, cc.created_at,
            json_agg(cm.* ORDER BY cm.created_at ASC) FILTER (WHERE cm.id IS NOT NULL) AS messages
     FROM copilot_conversations cc
     LEFT JOIN copilot_messages cm ON cm.conversation_id = cc.id
     WHERE cc.workspace_id = $1 AND (cc.id = $2 OR cm.id = $2)
     GROUP BY cc.id
     LIMIT 1`,
    [workspaceId, id]
  ).catch(() => ({ rows: [] }));
  if (!rows[0]) return null;

  const cc = rows[0];
  const messages = _parseJson(cc.messages, []);

  return {
    conversationId: cc.id,
    pageContext:    cc.page_context,
    entityId:       cc.entity_id,
    createdAt:      cc.created_at,
    messageCount:   messages.length,
    historyUsed:    messages.filter(m => m.role === 'user').length,
  };
}

async function _searchChunksByEntity(label, workspaceId) {
  if (!label) return [];
  const { rows } = await query(
    `SELECT id, source, channel, content, authority_score, created_at
     FROM workspace_intel_chunks
     WHERE workspace_id = $1
       AND content ILIKE $2
     ORDER BY authority_score DESC NULLS LAST
     LIMIT 10`,
    [workspaceId, `%${label}%`]
  ).catch(() => ({ rows: [] }));

  return rows.map(r => ({
    id:             r.id,
    source:         r.source,
    channel:        r.channel,
    previewText:    r.content?.slice(0, 200) ?? null,
    authorityScore: r.authority_score != null ? parseFloat(r.authority_score) : null,
    createdAt:      r.created_at,
  }));
}

async function _fetchNodes(ids, workspaceId) {
  if (!ids.length) return [];
  const { rows } = await query(
    `SELECT id, type, label, connector FROM graph_nodes
     WHERE workspace_id = $1 AND id = ANY($2)`,
    [workspaceId, ids]
  ).catch(() => ({ rows: [] }));
  return rows.map(r => ({ id: r.id, type: r.type, label: r.label, connector: r.connector }));
}

// ── Normalizers ───────────────────────────────────────────────────────────────

function _normalizeNode(r) {
  return {
    id:              r.id,
    type:            r.type,
    label:           r.label,
    connector:       r.connector,
    properties:      _parseJson(r.properties, {}),
    lastObservedAt:  r.last_observed_at,
  };
}

function _normalizeEdge(r) {
  return {
    id:              r.id,
    sourceId:        r.source_id,
    targetId:        r.target_id,
    type:            r.type,
    strength:        r.strength != null ? parseFloat(r.strength) : null,
    observationCount: r.observation_count ?? null,
    targetType:      r.target_type ?? null,
    targetLabel:     r.target_label ?? null,
    lastObservedAt:  r.last_observed_at,
  };
}

function _buildEntitySummary(nodes) {
  const byType = {};
  for (const n of nodes) {
    if (!byType[n.type]) byType[n.type] = [];
    byType[n.type].push({ id: n.id, label: n.label });
  }
  return byType;
}

function _extractDocuments(chunks) {
  const docs = new Map();
  for (const c of chunks) {
    const key = `${c.connector}:${c.channel ?? ''}`;
    if (!docs.has(key)) {
      docs.set(key, { connector: c.connector, channel: c.channel, chunkCount: 0, latestAt: null });
    }
    const d = docs.get(key);
    d.chunkCount++;
    if (!d.latestAt || c.createdAt > d.latestAt) d.latestAt = c.createdAt;
  }
  return [...docs.values()];
}

function _buildExplanation(nodes, chunks, convo) {
  const parts = [];
  if (nodes.length)  parts.push(`${nodes.length} knowledge graph node(s) traversed.`);
  if (chunks.length) parts.push(`${chunks.length} intelligence chunk(s) retrieved from the vector store.`);
  if (convo)         parts.push(`${convo.historyUsed} prior question(s) from this conversation used as context.`);
  return parts.length ? parts.join(' ') : 'No knowledge trace recorded for this context.';
}

function _countByField(arr, field) {
  const counts = {};
  for (const item of arr) {
    const v = item[field] ?? 'unknown';
    counts[v] = (counts[v] ?? 0) + 1;
  }
  return counts;
}

function _parseJson(v, fallback) {
  if (!v) return fallback;
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch { return fallback; }
}
