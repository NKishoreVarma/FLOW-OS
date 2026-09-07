/**
 * Universal Workflow Runtime — public API and boot entry point.
 *
 * Call startWorkflowRuntime() once at server boot (server.js).
 * It registers all known workflow definitions and starts recovery.
 *
 * To add a new workflow:
 *   1. Create src/workflows/definitions/myWorkflow.js
 *   2. Create src/workflows/planner/myPlanner.js (optional)
 *   3. Add registerWorkflow(MY_WORKFLOW, buildMyPlan) below — that's it.
 *      No RuntimeEngine changes required.
 */

import { registerWorkflow }       from './WorkflowLoader.js';
import { recoverStaleExecutions } from './RuntimeEngine.js';
import { PR_REVIEW_WORKFLOW }     from '../workflows/definitions/prReviewWorkflow.js';
import { buildPRReviewPlan }      from '../workflows/planner/PRReviewPlanner.js';

export async function startWorkflowRuntime() {
  // ── Register all workflow definitions ──────────────────────────────────────
  registerWorkflow(PR_REVIEW_WORKFLOW, buildPRReviewPlan);
  // Add future workflows here — no other file changes needed:
  //   registerWorkflow(GMAIL_TRIAGE_WORKFLOW, buildGmailTriagePlan);
  //   registerWorkflow(JIRA_SPRINT_WORKFLOW,  buildJiraSprintPlan);

  // ── Recover executions that were in-flight when the server last stopped ────
  try {
    await recoverStaleExecutions();
  } catch (err) {
    console.error('[WorkflowRuntime] stale-execution recovery error (non-fatal):', err.message);
  }

  console.log('[WorkflowRuntime] started');
}

// Re-export the public API for routes
export {
  startExecution,
  startExecutionWithPlan,
  pauseExecution,
  resumeExecution,
  cancelExecution,
  resumeAfterApproval,
  getWorkflowExecution,
  listWorkflowExecutions,
  registerSSEPush,
} from './RuntimeEngine.js';

export { loadDefinition, listDefinitions } from './WorkflowLoader.js';
export { buildExecutionPlan }              from './WorkflowLoader.js';
