/**
 * FLOW OS — Adaptive Workday Engine (Sprint 2.2)
 *
 * The Chief-of-Staff orchestrator: continuously answers "what is the single most
 * valuable thing this person should do right now?" It reuses existing signals, scores
 * them deterministically, and returns an ordered work queue. Recomputed on every read,
 * so it is inherently adaptive — the moment work completes, the next read reorders.
 */

import { collect } from './signalCollector.js';
import { buildQueue } from './workQueue.js';

/** Build the user's identity tokens for the ownership dimension. */
function identityOf(user = {}) {
  const email = user.email || '';
  return [user.id, email, email.split('@')[0], user.fullName, user.name]
    .filter(Boolean)
    .map((x) => String(x).toLowerCase());
}

/**
 * @param {string} workspaceId
 * @param {object} user  { id, email, fullName, role }
 * @param {object} [opts] { extraItems?: WorkItem[] }  e.g. upcoming meetings injected by the route
 * @returns Today's Work Queue
 */
export async function getWorkQueue(workspaceId, user = {}, opts = {}) {
  const ctx = { userIdentity: identityOf(user), now: new Date() };
  const items = await collect(workspaceId, { extraItems: opts.extraItems || [] });
  const queue = buildQueue(items, ctx);
  return { ...queue, workspaceId };
}

/** The single most important thing right now (or null when the queue is clear). */
export async function getNext(workspaceId, user = {}, opts = {}) {
  const q = await getWorkQueue(workspaceId, user, opts);
  return q.now[0] || q.next[0] || q.later[0] || null;
}

export { buildQueue, collect };
export default { getWorkQueue, getNext };
