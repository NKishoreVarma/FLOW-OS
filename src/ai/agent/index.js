/**
 * AgentRuntime — public API (FLOW-native iterative agent loop, Stage 3).
 *
 * Runtime-agnostic factory. Today it returns the FlowNativeRuntime. The interface
 * is deliberately the swap-point for a future DeepSeekHarnessAdapter — no other
 * FLOW module would change:
 *
 *   AgentRuntime
 *     ├── FlowNativeRuntime          (this PoC)
 *     └── DeepSeekHarnessAdapter     (future / optional — NOT a dependency today)
 */

import { FlowNativeRuntime } from './FlowNativeRuntime.js';
import { createLLMPlanner } from './llmPlanner.js';

export { FlowNativeRuntime };
export { createLLMPlanner };
export { AgentStatus, StopReason, AgentEventType } from './types.js';
export { DEFAULT_LIMITS, HARD_CEILINGS, resolveLimits } from './agentLimits.js';
export { createToolGateway } from './toolGateway.js';

/**
 * The read-only tool set exposed to the agent loop in the PoC. These are the
 * FLOW-internal retrieval tools that route through the existing toolExecutor
 * (search_workspace → retrieveContext, get_entity → operational graph). No
 * mutation tools, no connector writes, no filesystem.
 */
export const READ_ONLY_TOOLS = Object.freeze(['search_workspace', 'get_entity']);

/**
 * Read-only EXTERNAL connector tools (Stage 4B). Each routes through the existing
 * governed toolExecutor → executeAction (governance, audit, provenance). All are
 * SEARCH/READ ActionTypes — no mutations.
 */
export const EXTERNAL_READ_TOOLS = Object.freeze([
  'search_emails',      // communication (gmail — OAuth)
  'search_calendar',    // meetings (google-calendar — OAuth)
  'search_engineering', // engineering (github — OAuth)
  'list_jira_issues',   // work management (jira — simulated, offline)
  'list_people',        // hr / workforce (workday — simulated, offline)
  'list_customers',     // crm (hubspot — simulated, offline)
  'list_docs',          // knowledge (notion — simulated, offline)
]);

/** External read tools that run fully offline (simulated connectors). */
export const OFFLINE_EXTERNAL_READ_TOOLS = Object.freeze(['list_jira_issues', 'list_people', 'list_customers', 'list_docs']);

/** Internal + external read-only tools. */
export const ALL_READ_TOOLS = Object.freeze([...READ_ONLY_TOOLS, ...EXTERNAL_READ_TOOLS]);

let _singleton = null;

/**
 * Get (or create) an AgentRuntime. `AGENT_RUNTIME` env selects the implementation;
 * only 'flow-native' exists today — anything else falls back to it with a warning.
 */
export function createAgentRuntime(opts = {}) {
  const impl = (process.env.AGENT_RUNTIME || 'flow-native').toLowerCase();
  if (impl !== 'flow-native') {
    console.warn(`[AgentRuntime] "${impl}" not available — using flow-native.`);
  }
  // Planner selection: explicit opts.planner wins; else AGENT_PLANNER=llm (or
  // opts.plannerType==='llm') selects the LLM planner; default heuristic (null).
  const plannerType = (opts.plannerType ?? process.env.AGENT_PLANNER ?? 'heuristic').toLowerCase();
  const planner = opts.planner ?? (plannerType === 'llm' ? createLLMPlanner() : null);
  return new FlowNativeRuntime({ ...opts, planner });
}

export function getAgentRuntime(opts = {}) {
  if (!_singleton) _singleton = createAgentRuntime(opts);
  return _singleton;
}

/**
 * Convenience: run one read-only agentic question end-to-end and return the
 * evidence-backed result. Governance, isolation, verification all enforced.
 *
 * @param {string} workspaceId
 * @param {{ question:string, role?, userId?, orgId?, orgPlan?, sessionId?, requestId?, allowedToolNames? }} req
 * @param {object} [options]  { limits, onEvent, gateway, roster, runtime }
 */
export async function answerWithAgent(workspaceId, req, options = {}) {
  const runtime = options.runtime ?? getAgentRuntime();
  const ctx = {
    workspaceId,
    userId:    req.userId,
    orgId:     req.orgId,
    role:      req.role ?? 'MEMBER',
    orgPlan:   req.orgPlan ?? 'free',
    sessionId: req.sessionId,
    requestId: req.requestId,
  };
  const task = {
    question: req.question,
    allowedToolNames: req.allowedToolNames ?? [...READ_ONLY_TOOLS],
  };
  const handle = runtime.start(task, ctx, options);
  return handle.done;
}
