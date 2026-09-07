/**
 * WorkflowEngine — backward-compatible adapter over RuntimeEngine.
 *
 * Preserved for /api/workflows/* routes. Delegates all execution to
 * RuntimeEngine.startExecutionWithPlan so the PR Review Workflow runs through
 * the same generic step executor as every other workflow.
 *
 * No workflow-specific execution logic remains here.
 */

import {
  startExecutionWithPlan,
  getWorkflowExecution,
  listWorkflowExecutions,
  registerSSEPush,
} from '../runtime/RuntimeEngine.js';

export { getWorkflowExecution, listWorkflowExecutions, registerSSEPush };

/**
 * Launch a PR review workflow from a pre-built plan.
 * Called by workflowRoutes after PRReviewPlanner.buildPRReviewPlan().
 *
 * @param {object} plan — from buildPRReviewPlan()
 * @param {object} ctx  — { workspaceId, orgId, actor, orgPlan }
 */
export async function launchWorkflow(plan, ctx) {
  return startExecutionWithPlan(plan, ctx);
}
