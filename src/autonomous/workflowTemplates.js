/**
 * FLOW OS — Autonomous Operations · Workflow Templates (Phase 19)
 *
 * Pre-defined multi-step workflows keyed by workflowId. Each template maps to a
 * sequence of connector steps that the Execution Engine already knows how to run.
 * Nothing here bypasses governance — every step goes through executeAction().
 *
 * ADDING A TEMPLATE: add one entry to TEMPLATES and export TEMPLATE_IDS.
 * Callers: actionCardService.js, AutonomousRoutes /api/autonomous/templates.
 */

export const TEMPLATE_IDS = [
  'approve_action',
  'reject_action',
  'dismiss',
  'navigate',
  'notify_team',
  'escalate_to_council',
];

const TEMPLATES = {
  approve_action: {
    id: 'approve_action',
    label: 'Approve',
    description: 'Approve the pending governance action',
    risk: 'HIGH',
    buildSteps: (item) => [{
      connector: item.raw?.connectorId || 'system',
      actionType: 'APPROVE_ACTION',
      payload: { approvalId: item.raw?.id, actionType: item.raw?.actionType },
      title: `Approve: ${item.title}`,
    }],
  },

  reject_action: {
    id: 'reject_action',
    label: 'Reject',
    description: 'Reject the pending governance action',
    risk: 'LOW',
    buildSteps: (item) => [{
      connector: item.raw?.connectorId || 'system',
      actionType: 'REJECT_ACTION',
      payload: { approvalId: item.raw?.id },
      title: `Reject: ${item.title}`,
    }],
  },

  dismiss: {
    id: 'dismiss',
    label: 'Dismiss',
    description: 'Mark this item as reviewed and dismiss it',
    risk: 'LOW',
    buildSteps: () => [{
      connector: 'system',
      actionType: 'DISMISS_ITEM',
      payload: {},
      title: 'Dismiss item',
    }],
  },

  navigate: {
    id: 'navigate',
    label: 'Open',
    description: 'Navigate to the relevant page in FLOW',
    risk: 'LOW',
    buildSteps: (item, params = {}) => [{
      connector: 'system',
      actionType: 'NAVIGATE',
      payload: { route: params.route || item.actionRoute || '/' },
      title: `Open ${params.route || item.actionRoute || 'page'}`,
    }],
  },

  notify_team: {
    id: 'notify_team',
    label: 'Notify Team',
    description: 'Send a notification to the relevant team members',
    risk: 'LOW',
    buildSteps: (item) => [{
      connector: 'system',
      actionType: 'SEND_NOTIFICATION',
      payload: {
        title: `Attention: ${item.title}`,
        body: item.subtitle || item.title,
        recipients: item.owners || [],
      },
      title: 'Notify team',
    }],
  },

  escalate_to_council: {
    id: 'escalate_to_council',
    label: 'Ask Council',
    description: 'Ask the Executive Council for guidance on this item',
    risk: 'LOW',
    buildSteps: (item) => [{
      connector: 'system',
      actionType: 'NAVIGATE',
      payload: { route: `/council?q=${encodeURIComponent(item.title)}` },
      title: 'Ask Executive Council',
    }],
  },
};

/**
 * @param {string} workflowId
 * @returns {{ id, label, description, risk, buildSteps }} | null
 */
export function getTemplate(workflowId) {
  return TEMPLATES[workflowId] ?? null;
}

/**
 * @returns {Array<{ id, label, description, risk }>}
 */
export function listTemplates() {
  return Object.values(TEMPLATES).map(({ id, label, description, risk }) => ({ id, label, description, risk }));
}

