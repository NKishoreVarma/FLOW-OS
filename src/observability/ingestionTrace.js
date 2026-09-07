/**
 * ingestionTrace — a SAFE, metadata-only per-item trace across the real ingestion
 * pipeline: EVENT_RECEIVED → VALIDATED → DEDUPED → NORMALIZED → ENTITY_EXTRACTED
 * → RELATIONSHIP_EXTRACTED → EMBEDDED → INDEXED → AVAILABLE_FOR_RETRIEVAL.
 *
 * This is DELIBERATELY NOT the observabilityService dev trace, which stores raw
 * input/output text (message bodies) for the engineering dashboard. This tracer
 * NEVER stores content:
 *   - It hard-whitelists the fields it will keep (SAFE_FIELDS). Anything else —
 *     text, body, subject, token, credential — is dropped, not stored, not logged.
 *   - As defence-in-depth it also scans kept string values for secret-looking
 *     patterns and redacts them.
 *
 * Tenant-scoped: every entry carries workspaceId and reads are filtered by it.
 * In-memory (process-scoped, bounded ring) — workers run in-process with the
 * server here, so SyncEngine, ingestionWorker and the graph subscriber all share
 * this store. Durable persistence is intentionally out of scope for P2 (TD-01).
 */

export const STAGES = Object.freeze({
  EVENT_RECEIVED:           'EVENT_RECEIVED',
  VALIDATED:                'VALIDATED',
  DEDUPED:                  'DEDUPED',
  NORMALIZED:               'NORMALIZED',
  ENTITY_EXTRACTED:         'ENTITY_EXTRACTED',
  RELATIONSHIP_EXTRACTED:   'RELATIONSHIP_EXTRACTED',
  EMBEDDED:                 'EMBEDDED',
  INDEXED:                  'INDEXED',
  AVAILABLE_FOR_RETRIEVAL:  'AVAILABLE_FOR_RETRIEVAL',
});

export const STAGE_ORDER = [
  STAGES.EVENT_RECEIVED, STAGES.VALIDATED, STAGES.DEDUPED, STAGES.NORMALIZED,
  STAGES.ENTITY_EXTRACTED, STAGES.RELATIONSHIP_EXTRACTED, STAGES.EMBEDDED,
  STAGES.INDEXED, STAGES.AVAILABLE_FOR_RETRIEVAL,
];

// The ONLY fields ever persisted. Content/credentials are structurally impossible
// to store because they are not on this list.
const SAFE_FIELDS = ['workspaceId', 'provider', 'providerObjectId', 'eventId',
  'eventType', 'stage', 'timestamp', 'status', 'durationMs', 'errorCode', 'count'];

// Defence-in-depth: even a whitelisted field must not smuggle a secret.
const SECRET_RE = /(ya29\.|gh[pousr]_|xox[baprs]-|eyJ[A-Za-z0-9_-]{10,}|-----BEGIN|Bearer\s+[A-Za-z0-9._-]{12,}|[A-Za-z0-9_-]{40,})/;

const RING_MAX = 4000;
const _ring = [];                 // newest-last bounded array
const _byKey = new Map();         // `${workspaceId}::${eventId}` → entries[]

function keyOf(workspaceId, eventId) { return `${workspaceId}::${eventId}`; }

function sanitize(meta = {}) {
  const out = {};
  for (const f of SAFE_FIELDS) {
    if (meta[f] === undefined || meta[f] === null) continue;
    let v = meta[f];
    if (typeof v === 'string') {
      if (SECRET_RE.test(v)) v = '[REDACTED]';
      if (v.length > 200) v = v.slice(0, 200); // no room for a body to hide
    } else if (typeof v === 'number' || typeof v === 'boolean') {
      // ok as-is
    } else {
      v = String(v).slice(0, 120);
    }
    out[f] = v;
  }
  return out;
}

/**
 * Build a stable correlation id for a provider item.
 */
export function makeEventId({ connectorId, resourceType, externalId }) {
  return `${connectorId || 'unknown'}:${resourceType || 'default'}:${externalId || 'noid'}`;
}

/**
 * Record one stage transition. Only safe metadata is retained.
 * @param {string} stage — one of STAGES
 * @param {object} meta  — { workspaceId, eventId, provider, providerObjectId, eventType, status, durationMs, errorCode, count }
 */
export function traceStage(stage, meta = {}) {
  if (!STAGE_ORDER.includes(stage)) return;
  const safe = sanitize({ ...meta, stage });
  const entry = { ...safe, stage, timestamp: safe.timestamp || new Date().toISOString() };
  if (!entry.workspaceId || !entry.eventId) return; // tenant + correlation are mandatory

  _ring.push(entry);
  if (_ring.length > RING_MAX) _ring.shift();

  const k = keyOf(entry.workspaceId, entry.eventId);
  const arr = _byKey.get(k) || [];
  arr.push(entry);
  _byKey.set(k, arr);

  // Track G: stream the SAFE (whitelisted + redacted) stage to the workspace's
  // frontend telemetry channel. Best-effort + lazy import (never breaks ingestion,
  // no circular dep). The entry contains ONLY safe metadata — never bodies/secrets.
  if (process.env.WS_INGESTION_TELEMETRY !== 'false') {
    import('../services/socketService.js')
      .then(({ broadcastToWorkspace }) => broadcastToWorkspace(entry.workspaceId, 'INGESTION_STAGE', entry))
      .catch(() => {});
  }
  return entry;
}

/** Full ordered trace for one item (tenant-scoped). */
export function getTrace(workspaceId, eventId) {
  const arr = _byKey.get(keyOf(workspaceId, eventId)) || [];
  return arr.slice().sort((a, b) => (a.timestamp < b.timestamp ? -1 : 1));
}

/** Which of the 9 stages have been observed for this item. */
export function stagesSeen(workspaceId, eventId) {
  const seen = new Set(getTrace(workspaceId, eventId).map(e => e.stage));
  return STAGE_ORDER.filter(s => seen.has(s));
}

/** Recent trace entries for a workspace (safe metadata only). */
export function listRecent(workspaceId, { limit = 200 } = {}) {
  return _ring.filter(e => e.workspaceId === workspaceId).slice(-limit).reverse();
}

/** Distinct recent eventIds for a workspace with their stage progress. */
export function listItems(workspaceId, { limit = 50 } = {}) {
  const ids = [];
  const seen = new Set();
  for (let i = _ring.length - 1; i >= 0 && ids.length < limit; i--) {
    const e = _ring[i];
    if (e.workspaceId !== workspaceId || seen.has(e.eventId)) continue;
    seen.add(e.eventId);
    ids.push({ eventId: e.eventId, provider: e.provider, providerObjectId: e.providerObjectId,
      stages: stagesSeen(workspaceId, e.eventId), lastStatus: e.status });
  }
  return ids;
}

/** Test/util: clear a workspace's traces. */
export function _clear(workspaceId) {
  for (const k of [..._byKey.keys()]) if (k.startsWith(`${workspaceId}::`)) _byKey.delete(k);
  for (let i = _ring.length - 1; i >= 0; i--) if (_ring[i].workspaceId === workspaceId) _ring.splice(i, 1);
}
