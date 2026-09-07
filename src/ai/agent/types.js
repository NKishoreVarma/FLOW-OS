/**
 * AgentRuntime — shared constants and type shapes.
 *
 * FLOW-native iterative agent loop (Stage 3). Runtime-agnostic: the same constants
 * describe any AgentRuntime implementation (FlowNativeRuntime today; a future
 * DeepSeekHarnessAdapter would emit the same events and statuses).
 */

/** Terminal + transient run statuses. */
export const AgentStatus = Object.freeze({
  RUNNING:        'RUNNING',
  AWAITING_TOOLS: 'AWAITING_TOOLS',
  DONE:           'DONE',
  FAILED:         'FAILED',
  CANCELLED:      'CANCELLED',
  TIMED_OUT:      'TIMED_OUT',
});

/** Why the loop stopped iterating (recorded, never hidden). */
export const StopReason = Object.freeze({
  SUFFICIENT:          'SUFFICIENT',           // planner decided evidence is enough
  MAX_ITERATIONS:      'MAX_ITERATIONS',
  MAX_TOOL_CALLS:      'MAX_TOOL_CALLS',
  TIMEOUT:             'TIMEOUT',
  CANCELLED:           'CANCELLED',
  TOO_MANY_FAILURES:   'TOO_MANY_FAILURES',
  NO_PRODUCTIVE_TOOL:  'NO_PRODUCTIVE_TOOL',   // planner has no new authorized move
  MODEL_UNAVAILABLE:   'MODEL_UNAVAILABLE',
  ERROR:               'ERROR',
});

/**
 * Lightweight, content-redacted execution events. No event ever carries raw
 * message bodies, tool payloads, tokens, credentials, or PII — only IDs, counts,
 * provenance metadata, and classified reasons.
 */
export const AgentEventType = Object.freeze({
  EXECUTION_STARTED:   'agent.execution.started',
  ITERATION_STARTED:   'agent.iteration.started',
  TOOL_REQUESTED:      'agent.tool.requested',
  TOOL_AUTHORIZED:     'agent.tool.authorized',
  TOOL_DENIED:         'agent.tool.denied',
  TOOL_COMPLETED:      'agent.tool.completed',
  TOOL_FAILED:         'agent.tool.failed',
  ITERATION_COMPLETED: 'agent.iteration.completed',
  EXECUTION_COMPLETED: 'agent.execution.completed',
  EXECUTION_FAILED:    'agent.execution.failed',
  EXECUTION_CANCELLED: 'agent.execution.cancelled',
});

/**
 * @typedef {object} AgentExecutionContext
 * @property {string}  workspaceId
 * @property {string}  [userId]
 * @property {string}  [orgId]
 * @property {string}  [role]        VIEWER | MEMBER | ADMIN | OWNER
 * @property {string}  [orgPlan]
 * @property {string}  [sessionId]
 * @property {string}  [requestId]
 */

/**
 * @typedef {object} EvidenceItem   (shape consumed by EvidenceRanker.rankEvidence)
 * @property {string}  content
 * @property {string}  source
 * @property {'rag'|'entity'|'memory'|'timeline'} type
 * @property {number}  score
 * @property {number}  [authority]
 * @property {string}  [ts]
 * @property {object}  provenance    { sourceId, sourceType, workspaceId, connector, toolName }
 */
