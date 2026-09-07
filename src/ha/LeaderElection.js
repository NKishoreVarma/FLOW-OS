/**
 * LeaderElection — Module 1 (HA)
 *
 * Redis SETNX-based distributed leader election.
 * One leader per service per environment. Followers poll and take over
 * if the leader's TTL expires without renewal.
 *
 * Pattern: try SET key value NX PX ttl every POLL_MS.
 * Leader renews its lock every RENEW_MS (< TTL).
 */

import Redis    from 'ioredis';
import { randomUUID } from 'crypto';
import { hostname }   from 'os';
import { query }      from '../config/db.js';
import { logger }     from '../utils/logger.js';

const LOCK_TTL_MS   = 30_000;  // 30s — leader must renew within this window
const RENEW_MS      = 10_000;  // 10s — renewal interval
const POLL_MS       = 5_000;   // 5s  — follower election attempt interval

const NODE_ID = `${hostname()}:${process.pid}:${randomUUID().slice(0, 8)}`;
const ENV     = process.env.NODE_ENV ?? 'development';

const _elections = new Map(); // service → ElectionState

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Start competing for leadership of `service`.
 * `onBecomeLeader` fires when this node wins.
 * `onLoseLeadership` fires when this node loses.
 */
export function startElection(service, redis, { onBecomeLeader, onLoseLeadership } = {}) {
  if (_elections.has(service)) return _elections.get(service);

  const state = {
    service,
    redis,
    isLeader:       false,
    leaderId:       null,
    renewTimer:     null,
    pollTimer:      null,
    onBecomeLeader: onBecomeLeader ?? (() => {}),
    onLoseLeadership: onLoseLeadership ?? (() => {}),
  };

  _elections.set(service, state);
  _attemptElection(state);
  return state;
}

export function stopElection(service) {
  const state = _elections.get(service);
  if (!state) return;
  _clearTimers(state);
  if (state.isLeader) {
    state.redis.del(_key(service)).catch(() => null);
  }
  _elections.delete(service);
}

export function isLeader(service) {
  return _elections.get(service)?.isLeader ?? false;
}

export function getLeaderId(service) {
  return _elections.get(service)?.leaderId ?? null;
}

export function getAllStatus() {
  return [..._elections.entries()].map(([svc, s]) => ({
    service:  svc,
    isLeader: s.isLeader,
    leaderId: s.leaderId,
    nodeId:   NODE_ID,
  }));
}

// ── Internal ──────────────────────────────────────────────────────────────────

function _key(service) {
  return `flow:leader:${service}:${ENV}`;
}

function _value() {
  return JSON.stringify({ nodeId: NODE_ID, host: hostname(), pid: process.pid, ts: Date.now() });
}

async function _attemptElection(state) {
  const { service, redis } = state;
  const key = _key(service);

  try {
    const result = await redis.set(key, _value(), 'NX', 'PX', LOCK_TTL_MS);

    if (result === 'OK') {
      await _onWin(state);
    } else {
      const raw = await redis.get(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        state.leaderId = parsed.nodeId;
      }
      _scheduleNextPoll(state);
    }
  } catch (err) {
    logger.warn(`[LeaderElection:${service}] attempt error: ${err.message}`);
    _scheduleNextPoll(state);
  }
}

async function _onWin(state) {
  state.isLeader = true;
  state.leaderId = NODE_ID;
  logger.info(`[LeaderElection:${state.service}] elected — node ${NODE_ID}`);

  await _persistElection(state.service).catch(() => null);
  state.onBecomeLeader();
  _scheduleRenewal(state);
}

function _scheduleRenewal(state) {
  _clearTimers(state);
  state.renewTimer = setInterval(async () => {
    try {
      const extended = await state.redis.pexpire(_key(state.service), LOCK_TTL_MS);
      if (!extended) {
        // Key vanished — lost leadership
        await _onLose(state);
      }
    } catch (err) {
      logger.warn(`[LeaderElection:${state.service}] renewal error: ${err.message}`);
    }
  }, RENEW_MS);
}

function _scheduleNextPoll(state) {
  _clearTimers(state);
  state.pollTimer = setTimeout(() => _attemptElection(state), POLL_MS);
}

async function _onLose(state) {
  state.isLeader = false;
  logger.warn(`[LeaderElection:${state.service}] lost leadership — re-entering election`);
  state.onLoseLeadership();
  _scheduleNextPoll(state);
}

function _clearTimers(state) {
  if (state.renewTimer) { clearInterval(state.renewTimer); state.renewTimer = null; }
  if (state.pollTimer)  { clearTimeout(state.pollTimer);   state.pollTimer  = null; }
}

async function _persistElection(service) {
  await query(
    `INSERT INTO leader_elections (service, env, leader_id, leader_host, expires_at)
     VALUES ($1,$2,$3,$4, NOW() + INTERVAL '30 seconds')
     ON CONFLICT (service, env) DO UPDATE
     SET leader_id=$3, leader_host=$4, elected_at=NOW(), renewed_at=NOW(),
         expires_at=NOW() + INTERVAL '30 seconds'`,
    [service, ENV, NODE_ID, hostname()]
  );
}

export { NODE_ID };
