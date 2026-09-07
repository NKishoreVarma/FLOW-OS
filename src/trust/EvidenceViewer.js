/**
 * EvidenceViewer — Trust Center
 *
 * Retrieves the original source materials that informed a FLOW decision,
 * with permission-aware filtering (users only see chunks from connectors
 * and resources they are permitted to access).
 *
 * Reads from:
 *   workspace_intel_chunks  (pgvector chunk store)
 *   flow_events             (event platform)
 *   audit_logs              (connector execution trail)
 *   integration_permissions (resource-level gate)
 */

import { query } from '../config/db.js';

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Fetch evidence sources for a given context/decision ID.
 * Returns an ordered list of source chunks with permission filtering.
 */
export async function getEvidence(contextId, workspaceId, { userId = null, connectors = null } = {}) {
  const [chunks, events] = await Promise.allSettled([
    _getChunks(contextId, workspaceId, connectors),
    _getEvents(contextId, workspaceId),
  ]);

  const allowed  = await _getAllowedConnectors(workspaceId);
  const sources  = [
    ...(chunks.status === 'fulfilled' ? chunks.value : []),
    ...(events.status === 'fulfilled' ? events.value : []),
  ]
    .filter(s => _permitted(s, allowed))
    .sort((a, b) => (b.authorityScore ?? 0) - (a.authorityScore ?? 0));

  return {
    contextId,
    workspaceId,
    sources,
    totalCount: sources.length,
    filtered:   _countFiltered(chunks, events, sources.length),
  };
}

/**
 * Get a single evidence chunk by ID, permission-checked.
 */
export async function getEvidenceChunk(chunkId, workspaceId) {
  const { rows } = await query(
    `SELECT id, workspace_id, source, channel, content, metadata,
            authority_score, importance_score, created_at
     FROM workspace_intel_chunks
     WHERE id = $1 AND workspace_id = $2`,
    [chunkId, workspaceId]
  ).catch(() => ({ rows: [] }));

  if (!rows[0]) return null;
  return _normalizeChunk(rows[0]);
}

/**
 * Get evidence grouped by connector/source for a workspace.
 * Used in the Trust Center summary view.
 */
export async function getEvidenceSummary(workspaceId, { days = 7 } = {}) {
  const since = new Date(Date.now() - days * 86400_000).toISOString();

  const { rows } = await query(
    `SELECT source,
            COUNT(*)                               AS total,
            AVG(authority_score)                   AS avg_authority,
            MAX(created_at)                        AS latest_at
     FROM workspace_intel_chunks
     WHERE workspace_id = $1 AND created_at >= $2
     GROUP BY source
     ORDER BY total DESC`,
    [workspaceId, since]
  ).catch(() => ({ rows: [] }));

  return rows.map(r => ({
    source:        r.source,
    totalChunks:   Number(r.total),
    avgAuthority:  r.avg_authority != null ? parseFloat(r.avg_authority).toFixed(3) : null,
    latestAt:      r.latest_at,
  }));
}

// ── Internal helpers ──────────────────────────────────────────────────────────

async function _getChunks(contextId, workspaceId, connectors) {
  let sql = `
    SELECT id, workspace_id, source, channel, content, metadata,
           authority_score, importance_score, created_at
    FROM workspace_intel_chunks
    WHERE workspace_id = $1`;
  const params = [workspaceId];

  if (contextId) {
    params.push(contextId);
    sql += ` AND (metadata->>'contextId' = $${params.length}
              OR metadata->>'queryId' = $${params.length}
              OR metadata->>'briefingId' = $${params.length})`;
  }
  if (connectors?.length) {
    params.push(connectors);
    sql += ` AND source = ANY($${params.length})`;
  }

  sql += ` ORDER BY authority_score DESC NULLS LAST LIMIT 50`;

  const { rows } = await query(sql, params).catch(() => ({ rows: [] }));
  return rows.map(_normalizeChunk);
}

async function _getEvents(contextId, workspaceId) {
  if (!contextId) return [];
  const { rows } = await query(
    `SELECT id, type, source, connector, metadata, importance, created_at
     FROM flow_events
     WHERE workspace_id = $1
       AND (id = $2
        OR metadata->>'contextId' = $2
        OR correlation_id = $2)
     ORDER BY created_at DESC
     LIMIT 20`,
    [workspaceId, contextId]
  ).catch(() => ({ rows: [] }));

  return rows.map(r => ({
    id:            r.id,
    type:          'event',
    sourceType:    'flow_event',
    connector:     r.connector,
    channel:       r.source,
    content:       null,
    previewText:   _safePreview(r.metadata),
    metadata:      _parseJson(r.metadata, {}),
    authorityScore: r.importance != null ? r.importance / 100 : null,
    createdAt:     r.created_at,
  }));
}

async function _getAllowedConnectors(workspaceId) {
  const { rows } = await query(
    `SELECT DISTINCT connector FROM integration_resource_permissions
     WHERE workspace_id = $1 AND status = 'allowed'`,
    [workspaceId]
  ).catch(() => ({ rows: [] }));
  return new Set(rows.map(r => r.connector));
}

function _permitted(source, allowed) {
  if (allowed.size === 0) return true;
  if (!source.connector) return true;
  return allowed.has(source.connector);
}

function _countFiltered(chunks, events, kept) {
  const total = (chunks.status === 'fulfilled' ? chunks.value.length : 0)
              + (events.status  === 'fulfilled' ? events.value.length  : 0);
  return Math.max(0, total - kept);
}

function _normalizeChunk(row) {
  const meta = _parseJson(row.metadata, {});
  return {
    id:            row.id,
    type:          'intel_chunk',
    sourceType:    'workspace_intel_chunks',
    connector:     meta.connector ?? meta.platform ?? row.source,
    channel:       row.channel,
    content:       row.content ? row.content.slice(0, 2000) : null,
    previewText:   row.content ? row.content.slice(0, 200) : null,
    metadata:      meta,
    authorityScore: row.authority_score != null ? parseFloat(row.authority_score) : null,
    importanceScore: row.importance_score != null ? parseFloat(row.importance_score) : null,
    createdAt:     row.created_at,
  };
}

function _parseJson(v, fallback) {
  if (!v) return fallback;
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch { return fallback; }
}

function _safePreview(metadata) {
  const m = _parseJson(metadata, {});
  return m.subject ?? m.title ?? m.text?.slice(0, 200) ?? null;
}
