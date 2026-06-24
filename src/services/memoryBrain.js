/**
 * FLOW OS — Memory Brain Module
 *
 * Evaluates incoming intelligence chunks with a multi-dimensional scoring
 * engine (importance, authority, urgency) and maps the composite signal
 * to a data retention policy before the chunk enters the vector knowledge store.
 *
 * Retention Policies:
 *   PERMANENT  — High-value, authoritative operational intel
 *   90_DAYS    — Standard operational context
 *   30_DAYS    — Low-priority background context
 *   24_HOURS   — Urgent but ephemeral coordination signals
 *   DISCARD    — Noise fragments with no lasting value
 *
 * WebSocket Telemetry Events:
 *   MEMORY_RETAINED   — Chunk accepted into permanent or long-term store
 *   MEMORY_EXPIRED    — Chunk accepted with a time-bounded expiry policy
 *   MEMORY_DISCARDED  — Chunk evaluated and dropped before indexing
 *   MEMORY_ESCALATED  — Chunk flagged as high-urgency requiring attention
 */

import { broadcastToWorkspace } from './socketService.js';

// ── Keyword dictionaries ─────────────────────────────────────────────────────

const IMPORTANCE_KEYWORDS = {
  high: [
    'architecture', 'migration', 'schema', 'deploy', 'deployment', 'production',
    'release', 'rollback', 'security', 'vulnerability', 'compliance', 'audit',
    'infrastructure', 'database', 'pipeline', 'api', 'endpoint', 'authentication',
    'authorization', 'encryption', 'backup', 'disaster recovery', 'sla',
    'performance', 'scaling', 'kubernetes', 'docker', 'ci/cd', 'monitoring'
  ],
  medium: [
    'update', 'fix', 'bug', 'feature', 'refactor', 'test', 'review',
    'pull request', 'commit', 'merge', 'branch', 'sprint', 'task',
    'ticket', 'jira', 'confluence', 'documentation', 'readme', 'changelog',
    'config', 'configuration', 'environment', 'variable', 'dependency'
  ],
  low: [
    'meeting', 'sync', 'standup', 'retro', 'retrospective', 'planning',
    'brainstorm', 'discussion', 'feedback', 'opinion', 'thought',
    'suggestion', 'idea', 'fyi', 'heads up', 'reminder'
  ]
};

const AUTHORITY_SENDERS = {
  executive: ['ceo', 'cto', 'cfo', 'coo', 'vp', 'vice president', 'president', 'founder', 'co-founder'],
  director:  ['director', 'head of', 'lead', 'principal', 'staff engineer', 'senior staff'],
  manager:   ['manager', 'team lead', 'tech lead', 'engineering manager', 'pm', 'product manager']
};

const AUTHORITY_SOURCES = {
  verified: ['github', 'git', 'gitlab', 'bitbucket', 'obsidian', 'vault', 'confluence', 'wiki'],
  standard: ['slack', 'email', 'gmail', 'teams', 'discord'],
  low:      ['chat', 'sms', 'unknown']
};

const URGENCY_KEYWORDS = [
  'outage', 'broken', 'critical', 'delay', 'urgent', 'emergency', 'incident',
  'downtime', 'p0', 'p1', 'sev1', 'sev0', 'blocker', 'blocked', 'failure',
  'crash', 'crashed', 'unresponsive', 'degraded', 'alert', 'on-call',
  'rollback immediately', 'data loss', 'security breach', 'compromised'
];

// ── Scoring Functions ────────────────────────────────────────────────────────

/**
 * Computes importance score based on keyword density analysis.
 * @param {string} text - Raw chunk text
 * @returns {number} Score between 0.0 and 1.0
 */
function scoreImportance(text) {
  const t = text.toLowerCase();
  const len = t.split(/\s+/).length;

  let highHits   = 0;
  let mediumHits = 0;
  let lowHits    = 0;

  for (const kw of IMPORTANCE_KEYWORDS.high) {
    if (t.includes(kw)) highHits++;
  }
  for (const kw of IMPORTANCE_KEYWORDS.medium) {
    if (t.includes(kw)) mediumHits++;
  }
  for (const kw of IMPORTANCE_KEYWORDS.low) {
    if (t.includes(kw)) lowHits++;
  }

  // Weighted composite: high keywords contribute more signal
  const rawScore = (highHits * 3 + mediumHits * 1.5 + lowHits * 0.5);

  // Normalise against word count to avoid long texts always scoring high
  const densityFactor = Math.min(rawScore / Math.max(len * 0.1, 1), 1.0);

  // Clamp between 0.05 (minimum floor) and 1.0
  return Math.max(0.05, Math.min(densityFactor, 1.0));
}

/**
 * Computes authority score based on sender identity and source platform.
 * @param {Object} metadata
 * @param {string} [metadata.sender]  - Sender name/role
 * @param {string} [metadata.source]  - Origin platform
 * @param {string} [metadata.channel] - Channel context
 * @returns {number} Score between 0.0 and 1.0
 */
function scoreAuthority(metadata = {}) {
  const sender  = String(metadata.sender  || '').toLowerCase();
  const source  = String(metadata.source  || '').toLowerCase();

  let senderScore = 0.3; // baseline unknown sender
  let sourceScore = 0.3; // baseline unknown source

  // ── Sender tier ────────────────────────────────────────────────
  for (const title of AUTHORITY_SENDERS.executive) {
    if (sender.includes(title)) { senderScore = 1.0; break; }
  }
  if (senderScore < 1.0) {
    for (const title of AUTHORITY_SENDERS.director) {
      if (sender.includes(title)) { senderScore = 0.8; break; }
    }
  }
  if (senderScore < 0.8) {
    for (const title of AUTHORITY_SENDERS.manager) {
      if (sender.includes(title)) { senderScore = 0.6; break; }
    }
  }

  // ── Source tier ────────────────────────────────────────────────
  for (const src of AUTHORITY_SOURCES.verified) {
    if (source.includes(src)) { sourceScore = 0.9; break; }
  }
  if (sourceScore < 0.9) {
    for (const src of AUTHORITY_SOURCES.standard) {
      if (source.includes(src)) { sourceScore = 0.5; break; }
    }
  }
  if (sourceScore < 0.5) {
    for (const src of AUTHORITY_SOURCES.low) {
      if (source.includes(src)) { sourceScore = 0.2; break; }
    }
  }

  // Blend: sender has slightly more weight than source
  return Math.min((senderScore * 0.6) + (sourceScore * 0.4), 1.0);
}

/**
 * Computes urgency score based on crisis/incident keyword matches.
 * @param {string} text - Raw chunk text
 * @returns {number} Score between 0.0 and 1.0
 */
function scoreUrgency(text) {
  const t = text.toLowerCase();
  let hits = 0;

  for (const kw of URGENCY_KEYWORDS) {
    if (t.includes(kw)) hits++;
  }

  // Scale: 1 hit = 0.3, 2 hits = 0.5, 3+ hits = 0.7+, 5+ = 1.0
  if (hits === 0) return 0.0;
  if (hits === 1) return 0.3;
  if (hits === 2) return 0.5;
  if (hits <= 4)  return 0.7;
  return 1.0;
}

// ── Decision Engine ──────────────────────────────────────────────────────────

/**
 * Maps composite scores to a retention policy string.
 *
 * @param {number} importance - 0.0 to 1.0
 * @param {number} authority  - 0.0 to 1.0
 * @param {number} urgency    - 0.0 to 1.0
 * @returns {string} One of: 'PERMANENT', '90_DAYS', '30_DAYS', '24_HOURS', 'DISCARD'
 */
function decideRetention(importance, authority, urgency) {
  // Composite weighted score
  const composite = (importance * 0.45) + (authority * 0.35) + (urgency * 0.20);

  // High urgency override: escalate to 24_HOURS regardless of other scores
  // (urgent signals need immediate visibility but may not be permanently valuable)
  if (urgency >= 0.7) {
    // Unless importance AND authority are both high — then it's PERMANENT
    if (importance >= 0.6 && authority >= 0.6) return 'PERMANENT';
    return '24_HOURS';
  }

  // Standard tiered decision
  if (composite >= 0.70) return 'PERMANENT';
  if (composite >= 0.50) return '90_DAYS';
  if (composite >= 0.30) return '30_DAYS';
  if (composite >= 0.15) return '24_HOURS';

  return 'DISCARD';
}

/**
 * Maps a retention policy to a WebSocket telemetry event type.
 *
 * @param {string} policy     - Retention policy string
 * @param {number} urgency    - Urgency score (triggers escalation event)
 * @returns {string} WebSocket event type
 */
function policyToEventType(policy, urgency) {
  if (urgency >= 0.7) return 'MEMORY_ESCALATED';

  switch (policy) {
    case 'PERMANENT':
    case '90_DAYS':
      return 'MEMORY_RETAINED';
    case '30_DAYS':
    case '24_HOURS':
      return 'MEMORY_EXPIRED';
    case 'DISCARD':
      return 'MEMORY_DISCARDED';
    default:
      return 'MEMORY_RETAINED';
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Evaluates an incoming chunk and computes its retention decision.
 *
 * Calculates importance, authority, and urgency scores, determines the
 * retention policy, and broadcasts a telemetry event to the workspace
 * dashboard via WebSocket.
 *
 * @param {string}        chunkText  - Raw text content of the chunk
 * @param {Object}        metadata   - Contextual metadata
 * @param {string|number} metadata.workspaceId - Tenant isolation key
 * @param {string}        [metadata.sender]    - Sender name/role
 * @param {string}        [metadata.source]    - Origin platform (e.g. 'slack', 'github')
 * @param {string}        [metadata.channel]   - Channel context
 *
 * @returns {{
 *   importance_score:  number,
 *   authority_score:   number,
 *   urgency_score:     number,
 *   composite_score:   number,
 *   retention_policy:  string,
 *   telemetry_event:   string
 * }}
 */
export function evaluateChunk(chunkText, metadata = {}) {
  const text        = String(chunkText || '');
  const workspaceId = String(metadata.workspaceId || 'unknown');

  // ── Step 1: Compute dimensional scores ──────────────────────────
  const importance = scoreImportance(text);
  const authority  = scoreAuthority(metadata);
  const urgency    = scoreUrgency(text);

  // ── Step 2: Decide retention policy ─────────────────────────────
  const retention_policy = decideRetention(importance, authority, urgency);
  const composite_score  = parseFloat(
    ((importance * 0.45) + (authority * 0.35) + (urgency * 0.20)).toFixed(4)
  );

  // ── Step 3: Map to telemetry event type ─────────────────────────
  const telemetry_event = policyToEventType(retention_policy, urgency);

  // ── Step 4: Broadcast telemetry to dashboard ────────────────────
  broadcastToWorkspace(workspaceId, telemetry_event, {
    type:             telemetry_event,
    workspaceId,
    retention_policy,
    importance_score: parseFloat(importance.toFixed(4)),
    authority_score:  parseFloat(authority.toFixed(4)),
    urgency_score:    parseFloat(urgency.toFixed(4)),
    composite_score,
    source:           metadata.source  || 'unknown',
    sender:           metadata.sender  || 'unknown',
    textSample:       text.substring(0, 100)
  });

  console.log(
    `🧠 [Memory Brain] Policy: ${retention_policy} | Event: ${telemetry_event} ` +
    `| IMP: ${importance.toFixed(2)} | AUTH: ${authority.toFixed(2)} ` +
    `| URG: ${urgency.toFixed(2)} | COMPOSITE: ${composite_score} ` +
    `| Workspace: ${workspaceId}`
  );

  return {
    importance_score: parseFloat(importance.toFixed(4)),
    authority_score:  parseFloat(authority.toFixed(4)),
    urgency_score:    parseFloat(urgency.toFixed(4)),
    composite_score,
    retention_policy,
    telemetry_event
  };
}

export { decideRetention, scoreImportance, scoreAuthority, scoreUrgency };
