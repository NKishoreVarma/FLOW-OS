/**
 * AgentToolGateway — the ONLY door between the agent loop and FLOW data.
 *
 * The loop can never touch Postgres, pgvector, the Knowledge Graph, a connector,
 * a credential, or the filesystem. It can only ask this gateway to run a *named,
 * registered* tool. The gateway — never the model — decides whether that is allowed.
 *
 * Enforcement order (deny-by-default at every step):
 *   1. allow-list         — tool must be in the FLOW-supplied allowedToolNames
 *   2. registry           — tool must exist in the FLOW tool registry
 *   3. read-only (PoC)    — reject any side-effectful tool outright
 *   4. governance         — evaluate(role, read-action, capability, plan) via FLOW authority
 *   5. workspace stamping — the run's workspaceId is forced; a model-supplied one is ignored
 *   6. execute            — via the existing toolExecutor (internal → services, external → executeAction)
 *   7. provenance         — every result is FLOW-stamped; a foreign workspaceId is dropped
 *
 * The model never writes provenance and never sets identity, role, workspace, or risk.
 */

import { getTool } from '../tools/toolRegistry.js';
import { executeTool as realExecuteTool } from '../tools/toolExecutor.js';
import { evaluate } from '../../core/governance/permissionEvaluator.js';
import { Effect, SIDE_EFFECTFUL_ACTIONS } from '../../core/governance/constants.js';

/**
 * @param {object} opts
 * @param {import('./types.js').AgentExecutionContext} opts.ctx
 * @param {string[]} opts.allowedToolNames    FLOW-authorized allow-list (immutable for the run)
 * @param {(toolCall, execCtx)=>Promise} [opts.executeToolFn]  injectable for tests
 */
export function createToolGateway({ ctx, allowedToolNames, executeToolFn = realExecuteTool }) {
  const allow = new Set(allowedToolNames || []);

  /** Pure authorization decision. Returns { ok, tool, reason }. */
  function authorize(toolName) {
    if (!allow.has(toolName)) {
      return { ok: false, reason: 'not_in_allow_list' };
    }
    const tool = getTool(toolName);
    if (!tool) {
      return { ok: false, reason: 'unknown_tool' };
    }
    // Read-only invariant: any side-effectful ActionType is refused outright, even
    // if it is (mis)placed on the allow-list or carries a non-LOW risk tier.
    if (SIDE_EFFECTFUL_ACTIONS.includes(tool.actionType) || (tool.riskTier && tool.riskTier !== 'LOW')) {
      return { ok: false, tool, reason: 'read_only_poc_blocks_mutation' };
    }
    // Governance is the authority — evaluated with the tool's canonical ActionType
    // verb and Capability (the same values executeAction() will re-check for externals).
    const decision = evaluate({
      role:       ctx.role ?? 'MEMBER',
      actionType: tool.actionType,
      capability: tool.capability ?? 'knowledge',
      orgPlan:    ctx.orgPlan ?? 'free',
    });
    if (decision.effect !== Effect.ALLOW) {
      return { ok: false, tool, reason: `governance_${decision.effect}: ${decision.reason}` };
    }
    return { ok: true, tool };
  }

  /**
   * Authorize + execute a tool. Returns a provenanced observation.
   * @returns {Promise<{ ok, toolName, denied?, reason?, data?, provenance?, error? }>}
   */
  async function run(toolName, input = {}) {
    const auth = authorize(toolName);
    if (!auth.ok) {
      return { ok: false, denied: true, toolName, reason: auth.reason };
    }

    // Workspace scope is FIXED by FLOW. Any workspaceId the model tried to inject is
    // stripped before the input reaches the executor.
    const safeInput = { ...input };
    delete safeInput.workspaceId;
    delete safeInput.workspace_id;

    const execCtx = {
      workspaceId:   ctx.workspaceId,
      actorId:       ctx.userId ?? 'agent_runtime',
      workspaceRole: ctx.role   ?? 'MEMBER',
      orgId:         ctx.orgId,
      orgPlan:       ctx.orgPlan ?? 'free',
    };

    let res;
    try {
      res = await executeToolFn({ name: toolName, input: safeInput }, execCtx);
    } catch (err) {
      return { ok: false, toolName, error: err?.message ?? String(err) };
    }

    if (res?.error) {
      return { ok: false, toolName, error: res.error };
    }

    const provenance = {
      sourceType:  `tool:${toolName}`,
      connector:   auth.tool.connector,
      capability:  auth.tool.capability,
      actionType:  auth.tool.actionType,
      workspaceId: ctx.workspaceId,          // FLOW-stamped — never model-authored
      toolName,
    };

    return { ok: true, toolName, data: res?.result ?? null, provenance };
  }

  return { authorize, run, allowedToolNames: [...allow] };
}
