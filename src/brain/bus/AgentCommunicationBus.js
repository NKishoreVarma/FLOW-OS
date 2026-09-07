/**
 * AgentCommunicationBus — in-process message store for inter-agent communication.
 *
 * Each reasoning session has its own isolated message channel. Agents post
 * messages (evidence, escalations, questions) during reasoning; the Chief of
 * Staff and ConsensusEngine read them during synthesis.
 *
 * This is not a real-time channel — messages are written during an agent's
 * reason() call and read at consensus time. This design avoids async
 * coordination complexity while still enabling agent collaboration.
 *
 * Message types:
 *   EVIDENCE    — factual finding another agent should be aware of
 *   ESCALATION  — concern that requires CoS attention
 *   QUESTION    — a question for a specific agent (read during synthesis)
 *   VOTE        — position on a proposed action (used by ConsensusEngine)
 *   CONFLICT    — explicit disagreement with another agent's output
 */

export const MessageType = Object.freeze({
  EVIDENCE:   'EVIDENCE',
  ESCALATION: 'ESCALATION',
  QUESTION:   'QUESTION',
  VOTE:       'VOTE',
  CONFLICT:   'CONFLICT',
});

// sessionId → Message[]
const _channels = new Map();

/**
 * Initialize a channel for a new session.
 * Called by AgentSessionManager when a session is created.
 * @param {string} sessionId
 */
export function openChannel(sessionId) {
  _channels.set(sessionId, []);
}

/**
 * Close and discard a session's channel.
 * Called by AgentSessionManager when a session ends.
 * @param {string} sessionId
 */
export function closeChannel(sessionId) {
  _channels.delete(sessionId);
}

/**
 * Post a message from one agent to the session channel.
 *
 * @param {string} sessionId
 * @param {string} fromAgentId   — sender agent id
 * @param {string} type          — one of MessageType
 * @param {object} payload       — message body
 * @param {string} [toAgentId]   — optional target agent (null = broadcast to all)
 */
export function postMessage(sessionId, fromAgentId, type, payload, toAgentId = null) {
  const channel = _channels.get(sessionId);
  if (!channel) return; // session not found — silently ignore to never block agents
  channel.push({
    id:          `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    sessionId,
    fromAgentId,
    toAgentId,
    type,
    payload,
    timestamp:   new Date().toISOString(),
  });
}

/**
 * Read all messages in a session, optionally filtered.
 *
 * @param {string} sessionId
 * @param {object} [filter]
 * @param {string} [filter.toAgentId]   — only messages addressed to this agent (or broadcast)
 * @param {string} [filter.fromAgentId] — only messages from this agent
 * @param {string} [filter.type]        — only messages of this type
 * @returns {object[]}
 */
export function readMessages(sessionId, filter = {}) {
  const channel = _channels.get(sessionId) || [];
  return channel.filter(msg => {
    if (filter.toAgentId && msg.toAgentId && msg.toAgentId !== filter.toAgentId) return false;
    if (filter.fromAgentId && msg.fromAgentId !== filter.fromAgentId)            return false;
    if (filter.type && msg.type !== filter.type)                                 return false;
    return true;
  });
}

/**
 * Count messages in a session by type.
 * @param {string} sessionId
 * @returns {Record<string, number>}
 */
export function messageStats(sessionId) {
  const channel = _channels.get(sessionId) || [];
  const counts  = {};
  for (const msg of channel) counts[msg.type] = (counts[msg.type] || 0) + 1;
  return counts;
}

/**
 * How many active channels exist (for monitoring).
 * @returns {number}
 */
export function activeChannels() {
  return _channels.size;
}
