/**
 * AgentMemoryInterface — unified read-only access layer for all knowledge sources.
 *
 * All sources are queried in parallel with individual error isolation so one
 * failing source never blocks the rest. Every method is read-only — no writes.
 *
 * Sources:
 *   - Vector store    (pgvector semantic search via retrievalService)
 *   - Org memory      (decisions, incidents, project events via orgMemoryService)
 *   - Knowledge Graph (neighbors, search via graph/)
 *   - Event history   (recent events via EventStore)
 *   - Workflow history (execution history via WorkflowState)
 *   - Policies        (active governance policies via policyStore)
 *   - Health          (workspace health score)
 */

import { retrieveContext }       from '../../services/retrievalService.js';
import { queryAllMemory }        from '../../services/orgMemoryService.js';
import { searchNodes, neighbors } from '../../graph/index.js';
import { queryEvents }           from '../../events/index.js';
import { listExecutions }        from '../../workflows/WorkflowState.js';
import { listPolicies }          from '../../core/governance/policyStore.js';
import { calculateWorkspaceHealth } from '../../services/healthScoreService.js';

const MEMORY_TIMEOUT_MS = 8_000;

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Query the vector store for semantically similar content.
 * @param {string} workspaceId
 * @param {string} query
 * @param {number} [limit=10]
 * @returns {Promise<object[]>}
 */
export async function queryVectors(workspaceId, query, limit = 10) {
  return _safeQuery(() => _withTimeout(
    retrieveContext(workspaceId, query, `brain_${Date.now()}`),
    MEMORY_TIMEOUT_MS
  ), []);
}

/**
 * Query org memory (decisions, incidents, project events).
 * @param {string} workspaceId
 * @param {number} [hours=168] Look-back window in hours (default 7 days)
 * @returns {Promise<object[]>}
 */
export async function queryMemory(workspaceId, hours = 168) {
  return _safeQuery(() => _withTimeout(
    queryAllMemory(workspaceId, { hours, limit: 50 }),
    MEMORY_TIMEOUT_MS
  ), []);
}

/**
 * Search Knowledge Graph nodes by text.
 * @param {string} workspaceId
 * @param {string} text
 * @param {string} [type]  Optional node type filter
 * @returns {Promise<object[]>}
 */
export async function queryGraphNodes(workspaceId, text, type = null) {
  return _safeQuery(() => _withTimeout(
    searchNodes(workspaceId, { text, type, limit: 20 }),
    MEMORY_TIMEOUT_MS
  ), []);
}

/**
 * Get Knowledge Graph neighbors for a specific node.
 * @param {string} workspaceId
 * @param {string} nodeId
 * @returns {Promise<object[]>}
 */
export async function queryGraphNeighbors(workspaceId, nodeId) {
  return _safeQuery(() => _withTimeout(
    neighbors(workspaceId, nodeId),
    MEMORY_TIMEOUT_MS
  ), []);
}

/**
 * Query recent events from the Event Platform.
 * @param {string} workspaceId
 * @param {object} [filter]
 * @returns {Promise<object[]>}
 */
export async function queryRecentEvents(workspaceId, filter = {}) {
  return _safeQuery(() => _withTimeout(
    queryEvents({ workspace_id: workspaceId, limit: 30, ...filter }),
    MEMORY_TIMEOUT_MS
  ), []);
}

/**
 * Query recent workflow executions.
 * @param {string} workspaceId
 * @param {number} [limit=10]
 * @returns {Promise<object[]>}
 */
export async function queryWorkflowHistory(workspaceId, limit = 10) {
  return _safeQuery(() => _withTimeout(
    listExecutions(workspaceId, { limit }),
    MEMORY_TIMEOUT_MS
  ), []);
}

/**
 * Get active governance policies for the workspace.
 * @param {string} workspaceId
 * @param {string} orgId
 * @returns {Promise<object[]>}
 */
export async function queryPolicies(workspaceId, orgId) {
  return _safeQuery(() => _withTimeout(
    listPolicies({ orgId, workspaceId }),
    MEMORY_TIMEOUT_MS
  ), []);
}

/**
 * Get workspace health score.
 * @param {string} workspaceId
 * @returns {Promise<object|null>}
 */
export async function queryHealth(workspaceId) {
  return _safeQuery(() => _withTimeout(
    calculateWorkspaceHealth(workspaceId),
    MEMORY_TIMEOUT_MS
  ), null);
}

/**
 * Gather all memory sources in parallel for a given query.
 * Returns a structured MemoryBundle with results from every source.
 *
 * @param {string} workspaceId
 * @param {string} orgId
 * @param {string} query       — semantic search query
 * @param {object} [opts]
 * @returns {Promise<MemoryBundle>}
 */
export async function gatherAll(workspaceId, orgId, query, opts = {}) {
  const [vectors, memory, events, workflows, policies, health] = await Promise.all([
    queryVectors(workspaceId, query, opts.vectorLimit ?? 10),
    queryMemory(workspaceId, opts.memoryHours ?? 168),
    queryRecentEvents(workspaceId, opts.eventFilter ?? {}),
    queryWorkflowHistory(workspaceId, opts.workflowLimit ?? 10),
    queryPolicies(workspaceId, orgId),
    queryHealth(workspaceId),
  ]);

  return { vectors, memory, events, workflows, policies, health, query, workspaceId };
}

// ── Internals ─────────────────────────────────────────────────────────────────

async function _safeQuery(fn, fallback) {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

function _withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Memory query timed out after ${ms}ms`)), ms);
    promise.then(v => { clearTimeout(timer); resolve(v); }, e => { clearTimeout(timer); reject(e); });
  });
}
