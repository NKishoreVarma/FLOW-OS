/**
 * Tool Executor — Layer 8 execution.
 *
 * Receives an LLM tool-call instruction, resolves it through the Tool Registry,
 * then routes through the Connector ExecutionEngine (never directly to a provider API).
 * All tool calls are subject to governance, audit, and approval routing.
 *
 * Internal tools (search_workspace, get_entity) bypass the connector pipeline
 * and call FLOW services directly.
 */
import { getTool } from './toolRegistry.js';
import { retrieveContext } from '../../services/retrievalService.js';
import { getRelatedContext } from '../../services/operationalGraphService.js';

/**
 * Map a registry tool + LLM input + execution context onto the EXACT argument
 * shape that connectors/executionEngine.js `executeAction()` expects.
 *
 * executeAction reads: { workspaceId, connectorId, actionType, payload, actor:{id,role,orgId}, orgPlan }.
 * Governance (evaluateWithPolicies) reads actor.role / actor.id / actor.orgId — so the
 * actor MUST be an object, never flat actorId/role fields. Passing the wrong names here
 * silently degrades every governed tool call to a default VIEWER context. Kept as a pure,
 * exported function so the wiring is unit-testable and cannot regress unnoticed.
 */
export function buildActionRequest(tool, input = {}, executionCtx = {}) {
  // FLOW-controlled payloadTemplate fields win over model input (the model cannot
  // override a fixed resourceType / op). workspaceId is never taken from the input.
  const { workspaceId: _w, workspace_id: _w2, ...safeInput } = input;
  return {
    workspaceId: executionCtx.workspaceId,
    connectorId: tool.connector,
    actionType:  tool.actionType,
    payload:     { ...safeInput, ...(tool.payloadTemplate ?? {}) },
    actor: {
      id:    executionCtx.actorId ?? 'ai_platform',
      role:  executionCtx.workspaceRole ?? 'MEMBER',
      orgId: executionCtx.orgId,
    },
    orgPlan: executionCtx.orgPlan ?? 'free',
  };
}

/**
 * Execute one tool call from an LLM response.
 *
 * @param {{ name: string, input: Object }}  toolCall   - LLM's tool invocation
 * @param {{ workspaceId, actorId, workspaceRole, govContext }} executionCtx
 * @returns {Promise<{ toolName: string, result: any, error?: string }>}
 */
export async function executeTool(toolCall, executionCtx) {
  const { name, input = {} } = toolCall;
  const tool = getTool(name);

  if (!tool) {
    return { toolName: name, result: null, error: `Unknown tool: ${name}` };
  }

  try {
    // Internal tools bypass the connector pipeline
    if (tool.internal || tool.connector === 'internal') {
      return { toolName: name, result: await _runInternal(tool, input, executionCtx) };
    }

    // External tools go through executeAction() for governance + audit.
    // executeAction returns { result, timelineEvent } — unwrap to the payload.
    const { executeAction } = await import('../../connectors/executionEngine.js');
    const { result } = await executeAction(buildActionRequest(tool, input, executionCtx));

    return { toolName: name, result };
  } catch (err) {
    return { toolName: name, result: null, error: err.message };
  }
}

/**
 * Execute a batch of tool calls in parallel (but cap concurrency at 4).
 */
export async function executeTools(toolCalls, executionCtx) {
  if (!toolCalls?.length) return [];
  const chunks = [];
  for (let i = 0; i < toolCalls.length; i += 4) chunks.push(toolCalls.slice(i, i + 4));
  const results = [];
  for (const chunk of chunks) {
    const batch = await Promise.allSettled(chunk.map(tc => executeTool(tc, executionCtx)));
    results.push(...batch.map((r, i) =>
      r.status === 'fulfilled' ? r.value : { toolName: chunk[i].name, result: null, error: r.reason?.message }
    ));
  }
  return results;
}

// ── Internal tool implementations ─────────────────────────────────────────────
async function _runInternal(tool, input, ctx) {
  switch (tool.internalOp) {
    case 'SEARCH_WORKSPACE': {
      const chunks = await retrieveContext(ctx.workspaceId, input.query, `tool-${Date.now()}`);
      return Array.isArray(chunks) ? chunks.slice(0, input.limit ?? 5) : [];
    }
    case 'GET_ENTITY': {
      const neighbors = await getRelatedContext(ctx.workspaceId, input.entityId);
      return neighbors;
    }
    default:
      throw new Error(`No internal handler for op: ${tool.internalOp}`);
  }
}
