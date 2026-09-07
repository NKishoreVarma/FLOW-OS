/**
 * AgentSessionManager — lifecycle management for cognitive reasoning sessions.
 *
 * A session encapsulates one complete execution of the reasoning pipeline:
 * intent → agent outputs → consensus → decision.
 *
 * Sessions are stored in memory with a 30-minute TTL; the periodic cleanup
 * prevents unbounded growth without requiring a DB write per session.
 *
 * Session state:
 * {
 *   id, workspaceId, orgId, question,
 *   status: 'created' | 'running' | 'completed' | 'failed',
 *   intent, agentOutputs, consensus, decision,
 *   startedAt, completedAt, durationMs,
 *   error,
 * }
 */

import { randomUUID }                    from 'node:crypto';
import { openChannel, closeChannel }     from '../bus/AgentCommunicationBus.js';

const _sessions = new Map();            // sessionId → session
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes

// Lazy cleanup — runs every 10 minutes
let _cleanupTimer = null;

function _ensureCleanup() {
  if (_cleanupTimer) return;
  _cleanupTimer = setInterval(_pruneExpired, 10 * 60 * 1000);
  if (_cleanupTimer.unref) _cleanupTimer.unref();
}

function _pruneExpired() {
  const now = Date.now();
  for (const [id, session] of _sessions) {
    if (now - session._createdAt > SESSION_TTL_MS) {
      closeChannel(id);
      _sessions.delete(id);
    }
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Create a new session and open its communication channel.
 * @param {string} workspaceId
 * @param {string} orgId
 * @param {string} question
 * @returns {object} session
 */
export function createSession(workspaceId, orgId, question) {
  _ensureCleanup();
  const id = randomUUID();
  const session = {
    id,
    workspaceId,
    orgId,
    question,
    status:       'created',
    intent:       null,
    agentOutputs: [],
    consensus:    null,
    decision:     null,
    startedAt:    new Date().toISOString(),
    completedAt:  null,
    durationMs:   null,
    error:        null,
    _createdAt:   Date.now(),
  };
  _sessions.set(id, session);
  openChannel(id);
  return session;
}

/**
 * Retrieve a session by ID and workspace (tenant-isolated).
 * @param {string} sessionId
 * @param {string} workspaceId
 * @returns {object|null}
 */
export function getSession(sessionId, workspaceId) {
  const session = _sessions.get(sessionId);
  if (!session || session.workspaceId !== workspaceId) return null;
  return session;
}

/**
 * Update mutable session fields.
 * @param {string} sessionId
 * @param {object} patch
 */
export function updateSession(sessionId, patch) {
  const session = _sessions.get(sessionId);
  if (!session) return;
  Object.assign(session, patch);
}

/**
 * Transition session to a terminal state and close its channel.
 * @param {string} sessionId
 * @param {'completed'|'failed'} status
 * @param {object} result
 */
export function finalizeSession(sessionId, status, result = {}) {
  const session = _sessions.get(sessionId);
  if (!session) return;
  const now = Date.now();
  Object.assign(session, {
    status,
    completedAt: new Date().toISOString(),
    durationMs:  now - session._createdAt,
    ...result,
  });
  // Keep the session for TTL so callers can poll for result
  // Channel is no longer needed
  closeChannel(sessionId);
}

/**
 * List recent sessions for a workspace (newest first).
 * @param {string} workspaceId
 * @param {number} [limit=20]
 * @returns {object[]}
 */
export function listSessions(workspaceId, limit = 20) {
  const results = [];
  for (const session of _sessions.values()) {
    if (session.workspaceId === workspaceId) results.push(_publicView(session));
  }
  return results
    .sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt))
    .slice(0, limit);
}

/** Active session count — for observability. */
export function activeSessionCount() {
  return _sessions.size;
}

function _publicView(session) {
  const { _createdAt, ...pub } = session; // eslint-disable-line no-unused-vars
  return pub;
}
