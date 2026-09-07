/**
 * FLOW OS — Connector Poller (Phase 16.1 · WIC)
 *
 * Makes the workspace feel alive WITHOUT webhooks. On a background cadence it
 * checks the live connectors (GitHub, Gmail, Google Calendar) for each workspace
 * that has them connected, and publishes a FLOW event for every genuinely NEW
 * item discovered since the last cycle.
 *
 * It adds NOTHING new downstream: it publishes onto the single event platform
 * (`src/events`). The existing built-in subscribers do the rest —
 *   feed     → broadcasts NEW_EVENT to the live panel over WebSocket
 *   timeline → appends to the durable workspace timeline
 *   memory   → persists important events
 *   wic      → marks the snapshot dirty so /api/workspace/* refreshes
 * so the live panel, timeline, and cache all light up from one publish.
 *
 * Baseline-on-first-poll: the first cycle for a workspace records what already
 * exists WITHOUT emitting (so opening FLOW never floods the feed with history).
 * Only items that appear on later cycles are surfaced as live activity.
 */

import { publishFields }              from '../events/index.js';
import { getConnector }               from '../connectors/registry.js';
import { ActionType }                 from '../connectors/capabilities.js';
import { listConnectedConnectors, listWorkspacesWithConnectors } from '../connectors/authManager.js';
import { logger }                     from '../utils/logger.js';

const POLL_MS   = Number(process.env.CONNECTOR_POLL_MS) || 3 * 60 * 1000; // 3 min
const SEEN_CAP  = 800;   // max remembered ids per workspace (FIFO eviction)
const MAX_REPOS = 3;     // repos scanned per workspace per cycle

// workspaceId → { set: Set<string>, order: string[], baselined: boolean }
const seenByWorkspace = new Map();
let interval = null;

function _seen(wsId) {
  let s = seenByWorkspace.get(wsId);
  if (!s) { s = { set: new Set(), order: [], baselined: false }; seenByWorkspace.set(wsId, s); }
  return s;
}

function _remember(state, id) {
  if (state.set.has(id)) return false;
  state.set.add(id);
  state.order.push(id);
  if (state.order.length > SEEN_CAP) {
    const evicted = state.order.shift();
    state.set.delete(evicted);
  }
  return true;
}

// ── Public lifecycle ────────────────────────────────────────────────────────────
export function startConnectorPoller() {
  if (interval) return;
  // First sweep shortly after boot; it only baselines, so nothing is emitted.
  setTimeout(() => { pollAll().catch(() => {}); }, 8000);
  interval = setInterval(() => { pollAll().catch(() => {}); }, POLL_MS);
  if (interval.unref) interval.unref();
  logger.rag?.(`[Poller] Connector poller started (every ${Math.round(POLL_MS / 1000)}s)`);
}

export function stopConnectorPoller() {
  if (interval) { clearInterval(interval); interval = null; }
}

/** Poll every workspace that has connectors. Best-effort; never throws. */
export async function pollAll() {
  const workspaces = listWorkspacesWithConnectors();
  if (!workspaces.length) return;
  await Promise.allSettled(workspaces.map((ws) => pollWorkspace(ws)));
}

/**
 * Poll one workspace's live connectors and publish events for new activity.
 * First call baselines silently; later calls emit only new items.
 */
export async function pollWorkspace(workspaceId) {
  const wsId      = String(workspaceId);
  const connected = listConnectedConnectors(wsId);
  const state     = _seen(wsId);
  const emit      = state.baselined; // first cycle only records the baseline

  const items = [];
  if (connected.includes('github'))          items.push(...await _pollGitHub(wsId));
  if (connected.includes('gmail'))           items.push(...await _pollGmail(wsId));
  if (connected.includes('google-calendar')) items.push(...await _pollCalendar(wsId));

  let published = 0;
  for (const item of items) {
    const isNew = _remember(state, item.dedupeId);
    if (!isNew || !emit) continue;
    try {
      await publishFields({ ...item.fields, workspaceId: wsId });
      published++;
    } catch (err) {
      logger.rag?.(`[Poller] publish failed (${item.dedupeId}): ${err.message}`);
    }
  }

  state.baselined = true;
  if (published > 0) logger.rag?.(`[Poller] ${wsId}: ${published} new event(s) surfaced`);
  return published;
}

// ── Connector probes (best-effort; a failing connector yields no items) ──────────

async function _pollGitHub(wsId) {
  const out = [];
  try {
    const github = getConnector('github');
    if (!github) return out;
    const repos = await github.execute(wsId, ActionType.READ, { resourceType: 'repos', limit: MAX_REPOS });
    for (const repo of (repos || []).slice(0, MAX_REPOS)) {
      if (!repo?.owner || !repo?.name) continue;
      // Recent commits (last 24h)
      try {
        const commits = await github.execute(wsId, ActionType.READ, { resourceType: 'commits', owner: repo.owner, repo: repo.name, limit: 10 });
        for (const c of (commits || [])) {
          if (!c?.sha) continue;
          const author = c.author || 'unknown';
          out.push({
            dedupeId: `gh-commit-${c.sha}`,
            fields: {
              source: 'github', type: 'engineering', title: `pushed to ${repo.name}`,
              summary: `${(c.message || '').split('\n')[0].slice(0, 120)}`,
              sourceEventId: `commit-${c.sha}`, priority: 'low',
              ts: c.date || undefined,   // real commit time, not processing time
              actors:   [{ type: 'USER', id: author, name: author }],
              entities: [{ type: 'COMMIT', id: c.sha, name: repo.name }],
              metadata: { repo: repo.name, sha: c.sha, kind: 'commit' },
            },
          });
        }
      } catch { /* per-repo best-effort */ }
      // Open pull requests
      try {
        const pulls = await github.execute(wsId, ActionType.READ, { resourceType: 'pulls', owner: repo.owner, repo: repo.name, state: 'open', limit: 10 });
        for (const pr of (pulls || [])) {
          if (pr?.number == null) continue;
          const author = pr.author || pr.user?.login || 'unknown';
          const prTitle = pr.title || `#${pr.number}`;
          out.push({
            dedupeId: `gh-pr-${repo.name}-${pr.number}`,
            fields: {
              source: 'github', type: 'engineering', title: `opened PR #${pr.number} in ${repo.name}`,
              summary: prTitle,
              sourceEventId: `pr-${repo.name}-${pr.number}`, priority: 'medium',
              ts: pr.timestamp || pr.updatedAt || undefined,
              actors:   [{ type: 'USER', id: author, name: author }],
              entities: [{ type: 'PR', id: String(pr.number), name: prTitle }],
              metadata: { repo: repo.name, number: pr.number, state: pr.state || 'open', kind: 'pull_request' },
            },
          });
        }
      } catch { /* per-repo best-effort */ }
    }
  } catch (err) {
    logger.rag?.(`[Poller] GitHub probe failed: ${err.message}`);
  }
  return out;
}

async function _pollGmail(wsId) {
  const out = [];
  try {
    const gmail = getConnector('gmail');
    if (!gmail) return out;
    const msgs = await gmail.execute(wsId, ActionType.READ, { folder: 'INBOX', limit: 15, q: 'is:unread' });
    for (const m of (Array.isArray(msgs) ? msgs : [])) {
      if (!m?.id) continue;
      const from = m.from || m.sender || 'unknown';
      const subject = m.subject || '(no subject)';
      const urgent = /urgent|asap|escalat|critical|action required|follow.?up/i.test(subject);
      out.push({
        dedupeId: `gmail-${m.id}`,
        fields: {
          source: 'gmail', type: 'communication', title: subject,
          summary: m.snippet || m.preview || '',
          sourceEventId: `email-${m.id}`, priority: urgent ? 'high' : 'low',
          actors: [{ type: 'USER', id: from, name: from }],
          metadata: { messageId: m.id, kind: 'email' },
        },
      });
    }
  } catch (err) {
    logger.rag?.(`[Poller] Gmail probe failed: ${err.message}`);
  }
  return out;
}

async function _pollCalendar(wsId) {
  const out = [];
  try {
    const cal = getConnector('google-calendar');
    if (!cal) return out;
    const events = await cal.execute(wsId, ActionType.READ, { days: 1, limit: 10 });
    for (const e of (Array.isArray(events) ? events : [])) {
      if (!e?.id) continue;
      // Only surface events that haven't started yet — upcoming is what matters.
      if (e.startTime && new Date(e.startTime).getTime() < Date.now()) continue;
      const title = e.title || e.summary || 'Meeting';
      out.push({
        dedupeId: `cal-${e.id}`,
        fields: {
          source: 'google-calendar', type: 'meeting', title,
          summary: e.description || '',
          sourceEventId: `event-${e.id}`, priority: 'medium',
          ts: e.startTime || undefined,
          entities: [{ type: 'EVENT', id: String(e.id), name: title }],
          metadata: { eventId: e.id, start: e.startTime, kind: 'calendar' },
        },
      });
    }
  } catch (err) {
    logger.rag?.(`[Poller] Calendar probe failed: ${err.message}`);
  }
  return out;
}

export default { startConnectorPoller, stopConnectorPoller, pollAll, pollWorkspace };
