/**
 * PR Review Workflow Definition
 *
 * Canonical schema for the "Review all open PRs, approve safe ones, merge, notify" workflow.
 * The WorkflowEngine consumes this definition; the PRReviewPlanner produces
 * a concrete ExecutionPlan bound to a specific repo + actor.
 *
 * Step types:
 *   list_prs           — Read open PRs from GitHub (no side effects)
 *   evaluate_safety    — Apply PRSafetyEvaluator to each PR (pure, no I/O)
 *   approve_pr         — Submit APPROVE review via executeAction (APPROVE)
 *   merge_pr           — Merge the PR via executeAction (EXECUTE)
 *   skip_pr            — Record skip reason (no I/O)
 *   notify_slack       — Post summary message via executeAction (SEND)
 */

export const PR_REVIEW_WORKFLOW = {
  id:          'pr-review',
  version:     '1.0.0',
  name:        'PR Review, Approve & Merge',
  description: 'Reviews all open pull requests, approves safe PRs, merges them, and notifies Engineering.',
  connectors:  ['github', 'slack'],
  steps: [
    {
      id:          'list_prs',
      name:        'List open pull requests',
      type:        'list_prs',
      connector:   'github',
      actionType:  'read',
      sideEffects: false,
    },
    {
      id:          'evaluate_safety',
      name:        'Evaluate PR safety',
      type:        'evaluate_safety',
      connector:   null,
      actionType:  null,
      sideEffects: false,
      dependsOn:   ['list_prs'],
    },
    {
      id:          'per_pr_actions',
      name:        'Approve and merge safe PRs',
      type:        'per_pr_loop',
      connector:   'github',
      sideEffects: true,
      dependsOn:   ['evaluate_safety'],
      substeps: [
        {
          id:         'approve_pr',
          name:       'Approve pull request',
          type:       'approve_pr',
          connector:  'github',
          actionType: 'approve',
        },
        {
          id:         'merge_pr',
          name:       'Merge pull request',
          type:       'merge_pr',
          connector:  'github',
          actionType: 'execute',
          verifyField: 'merged',
        },
      ],
    },
    {
      id:          'notify_slack',
      name:        'Notify Engineering channel',
      type:        'notify_slack',
      connector:   'slack',
      actionType:  'send',
      sideEffects: true,
      dependsOn:   ['per_pr_actions'],
    },
  ],
};
