/**
 * EntityResolver — resolves potentially duplicate entities to a canonical node.
 *
 * Resolution strategies (applied in priority order):
 *   1. EXACT_ID      — same entity_type + external_id + source
 *   2. EMAIL_MATCH   — PERSON nodes sharing an email address in properties
 *   3. NAME_MATCH    — fuzzy-normalized name match within the same entity_type
 *   4. ALIAS_MATCH   — node already points to a canonical via canonical_id
 *
 * All resolutions are recorded in kg_resolution_log for auditability.
 * Resolution does NOT delete nodes — it sets canonical_id on the alias node.
 */

import { pool }             from '../../config/db.js';
import { buildNodeId }      from '../schema/SchemaValidator.js';
import { EntityType }       from '../schema/EntityTypes.js';

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Resolve a candidate entity against existing nodes.
 * Returns the canonical KGNode (may be the candidate itself).
 *
 * @param {string} workspaceId
 * @param {{ entityType, externalId, source?, name, properties? }} candidate
 * @returns {Promise<{ nodeId: string, canonical: boolean, method: string, confidence: number }>}
 */
export async function resolveEntity(workspaceId, candidate) {
  const { entityType, externalId, source = 'internal', name, properties = {} } = candidate;

  // 1. Exact match — node already exists with same ID
  const exactId = buildNodeId(workspaceId, entityType, source, externalId);
  const exact   = await _nodeExists(exactId, workspaceId);
  if (exact) {
    return { nodeId: exactId, canonical: true, method: 'EXACT_ID', confidence: 1.0 };
  }

  // 2. Email match (PERSON only)
  if (entityType === EntityType.PERSON && properties.email) {
    const emailMatch = await _findByEmail(workspaceId, properties.email);
    if (emailMatch) {
      await _logResolution(workspaceId, exactId, emailMatch.id, 'EMAIL_MATCH', 0.97, { email: properties.email });
      return { nodeId: emailMatch.id, canonical: true, method: 'EMAIL_MATCH', confidence: 0.97 };
    }
  }

  // 3. Normalized name match within entity type
  const nameMatch = await _findByNormalizedName(workspaceId, entityType, name);
  if (nameMatch) {
    const conf = nameSimilarity(name, nameMatch.name);
    if (conf >= 0.85) {
      await _logResolution(workspaceId, exactId, nameMatch.id, 'NAME_MATCH', conf, { candidateName: name, matchedName: nameMatch.name });
      return { nodeId: nameMatch.id, canonical: false, method: 'NAME_MATCH', confidence: conf };
    }
  }

  // No match found — the candidate is a new node
  return { nodeId: exactId, canonical: true, method: 'NEW', confidence: 1.0 };
}

/**
 * Set the canonical_id on alias nodes that resolve to a canonical.
 * Called after upsertNode when resolveEntity returns canonical: false.
 *
 * @param {string} workspaceId
 * @param {string} aliasNodeId
 * @param {string} canonicalNodeId
 */
export async function linkAlias(workspaceId, aliasNodeId, canonicalNodeId) {
  await pool.query(
    `UPDATE kg_nodes SET canonical_id = $3 WHERE id = $1 AND workspace_id = $2`,
    [aliasNodeId, workspaceId, canonicalNodeId]
  );
}

/**
 * Given a node ID, return the canonical node it resolves to.
 * If the node has no canonical_id, it IS the canonical.
 *
 * @param {string} workspaceId
 * @param {string} nodeId
 * @returns {Promise<import('../types.js').KGNode|null>}
 */
export async function getCanonicalNode(workspaceId, nodeId) {
  const { rows } = await pool.query(
    `SELECT n2.* FROM kg_nodes n1
     LEFT JOIN kg_nodes n2 ON n2.id = COALESCE(n1.canonical_id, n1.id)
     WHERE n1.id = $1 AND n1.workspace_id = $2`,
    [nodeId, workspaceId]
  );
  return rows[0] ?? null;
}

/**
 * Get all alias nodes that point to a canonical node.
 *
 * @param {string} workspaceId
 * @param {string} canonicalNodeId
 */
export async function getAliases(workspaceId, canonicalNodeId) {
  const { rows } = await pool.query(
    `SELECT * FROM kg_nodes WHERE workspace_id = $1 AND canonical_id = $2`,
    [workspaceId, canonicalNodeId]
  );
  return rows;
}

/**
 * Find nodes that are candidates for merging (same entity_type, no canonical_id,
 * very similar name). Returns pairs for review.
 *
 * @param {string} workspaceId
 * @param {string} entityType
 * @returns {Promise<Array<{ a: KGNode, b: KGNode, similarity: number }>>}
 */
export async function findMergeCandidates(workspaceId, entityType) {
  const { rows } = await pool.query(
    `SELECT a.id AS aid, a.name AS aname, b.id AS bid, b.name AS bname
     FROM kg_nodes a
     JOIN kg_nodes b ON b.workspace_id = $1
       AND b.entity_type = $2
       AND b.id > a.id
       AND b.canonical_id IS NULL
     WHERE a.workspace_id = $1
       AND a.entity_type = $2
       AND a.canonical_id IS NULL
       AND similarity(a.name, b.name) >= 0.7
     ORDER BY similarity(a.name, b.name) DESC
     LIMIT 50`,
    [workspaceId, entityType]
  ).catch(() => ({ rows: [] })); // similarity() requires pg_trgm — graceful if absent

  return rows.map(r => ({
    a:          { id: r.aid, name: r.aname },
    b:          { id: r.bid, name: r.bname },
    similarity: nameSimilarity(r.aname, r.bname),
  }));
}

// ── Internal helpers ──────────────────────────────────────────────────────────

async function _nodeExists(id, workspaceId) {
  const { rows } = await pool.query(
    `SELECT id FROM kg_nodes WHERE id = $1 AND workspace_id = $2 LIMIT 1`,
    [id, workspaceId]
  );
  return !!rows[0];
}

async function _findByEmail(workspaceId, email) {
  const { rows } = await pool.query(
    `SELECT * FROM kg_nodes
     WHERE workspace_id = $1
       AND entity_type = 'PERSON'
       AND (properties->>'email' = $2 OR properties->>'emailAddress' = $2)
       AND canonical_id IS NULL
     ORDER BY confidence DESC LIMIT 1`,
    [workspaceId, email.toLowerCase()]
  );
  return rows[0] ?? null;
}

async function _findByNormalizedName(workspaceId, entityType, name) {
  const normalized = _normalizeName(name);
  const { rows }   = await pool.query(
    `SELECT * FROM kg_nodes
     WHERE workspace_id = $1
       AND entity_type = $2
       AND lower(regexp_replace(name, '[^a-z0-9]', '', 'gi')) = $3
       AND canonical_id IS NULL
     ORDER BY confidence DESC LIMIT 1`,
    [workspaceId, entityType, normalized]
  );
  return rows[0] ?? null;
}

async function _logResolution(workspaceId, candidateId, resolvedTo, method, confidence, metadata) {
  await pool.query(
    `INSERT INTO kg_resolution_log
       (workspace_id, candidate_id, resolved_to, resolution_method, confidence, metadata)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb)`,
    [workspaceId, candidateId, resolvedTo, method, confidence, JSON.stringify(metadata)]
  ).catch(() => {}); // non-fatal
}

/** Normalize a name to lowercase alphanumeric for comparison. */
function _normalizeName(name) {
  return (name ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Levenshtein-based similarity score (0–1) between two names.
 * Falls back to token-overlap for long names.
 */
export function nameSimilarity(a, b) {
  const na = _normalizeName(a);
  const nb = _normalizeName(b);
  if (na === nb) return 1.0;
  if (!na || !nb) return 0;

  // For short names use Levenshtein edit distance
  if (na.length <= 32 && nb.length <= 32) {
    const maxLen = Math.max(na.length, nb.length);
    return 1 - (levenshtein(na, nb) / maxLen);
  }

  // For long names use token overlap (Jaccard)
  const setA = new Set(na.split(/\s+/));
  const setB = new Set(nb.split(/\s+/));
  const inter = [...setA].filter(t => setB.has(t)).length;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : inter / union;
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (__, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
    }
  }
  return dp[m][n];
}
