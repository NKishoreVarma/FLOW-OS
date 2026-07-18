/**
 * FLOW OS — Capability & Action Type Registry
 *
 * Defines the business-level vocabulary FLOW speaks.
 * Connectors declare which Capabilities and ActionTypes they support.
 * The rest of FLOW references only these constants — never connector names.
 */

export const Capability = Object.freeze({
  COMMUNICATION:  'communication',   // email, chat, DMs
  MEETINGS:       'meetings',        // calendar, video calls
  ENGINEERING:    'engineering',     // code, PRs, CI/CD, issues
  KNOWLEDGE:      'knowledge',       // docs, wikis, notes
  FINANCE:        'finance',         // invoices, budgets, expenses
  CRM:            'crm',             // contacts, deals, pipelines
  HR:             'hr',              // people, orgs, time-off
  OPERATIONS:     'operations',      // incidents, monitoring, alerts
  SALES:          'sales',           // leads, opportunities, forecasts
  COMPLIANCE:     'compliance',      // audits, policies, access reviews
  WORK_MANAGEMENT: 'work_management', // Jira, Linear, Asana boards
});

export const ActionType = Object.freeze({
  READ:       'read',       // fetch a single item or list
  SEARCH:     'search',     // full-text / semantic search
  CREATE:     'create',     // create a new item
  UPDATE:     'update',     // patch an existing item
  DELETE:     'delete',     // remove an item
  SEND:       'send',       // send a communication
  APPROVE:    'approve',    // approve a pending item
  REJECT:     'reject',     // reject a pending item
  EXECUTE:    'execute',    // run a workflow or action
  SYNC:       'sync',       // pull/push a batch of data
  WEBHOOK:    'webhook',    // inbound webhook handler
  HEALTH:     'health',     // connectivity check
  AUDIT:      'audit',      // return audit records
});

export const AuthStrategy = Object.freeze({
  OAUTH2:          'oauth2',
  API_KEY:         'api_key',
  SERVICE_ACCOUNT: 'service_account',
  WEBHOOK_SECRET:  'webhook_secret',
  NONE:            'none',
});

/**
 * Maps each Capability to the ActionTypes that make sense for it.
 * Adapters may support a subset — this is the ceiling, not the floor.
 */
export const CapabilityActions = Object.freeze({
  [Capability.COMMUNICATION]: [
    ActionType.READ, ActionType.SEARCH, ActionType.SEND,
    ActionType.CREATE, ActionType.UPDATE, ActionType.DELETE,
    ActionType.APPROVE, ActionType.REJECT,
    ActionType.SYNC, ActionType.WEBHOOK, ActionType.HEALTH,
  ],
  [Capability.MEETINGS]: [
    ActionType.READ, ActionType.SEARCH, ActionType.CREATE,
    ActionType.UPDATE, ActionType.DELETE, ActionType.SYNC, ActionType.WEBHOOK,
  ],
  [Capability.ENGINEERING]: [
    ActionType.READ, ActionType.SEARCH, ActionType.CREATE,
    ActionType.UPDATE, ActionType.APPROVE, ActionType.EXECUTE,
    ActionType.SYNC, ActionType.WEBHOOK,
  ],
  [Capability.KNOWLEDGE]: [
    ActionType.READ, ActionType.SEARCH, ActionType.CREATE,
    ActionType.UPDATE, ActionType.DELETE, ActionType.SYNC,
    ActionType.HEALTH,
  ],
  [Capability.FINANCE]: [
    ActionType.READ, ActionType.SEARCH, ActionType.CREATE,
    ActionType.APPROVE, ActionType.REJECT, ActionType.AUDIT,
  ],
  [Capability.CRM]: [
    ActionType.READ, ActionType.SEARCH, ActionType.CREATE,
    ActionType.UPDATE, ActionType.DELETE, ActionType.EXECUTE,
    ActionType.SYNC, ActionType.WEBHOOK, ActionType.HEALTH,
  ],
  [Capability.HR]: [
    ActionType.READ, ActionType.SEARCH, ActionType.CREATE,
    ActionType.UPDATE, ActionType.APPROVE, ActionType.AUDIT,
    ActionType.HEALTH, ActionType.SYNC,
  ],
  [Capability.OPERATIONS]: [
    ActionType.READ, ActionType.SEARCH, ActionType.CREATE,
    ActionType.UPDATE, ActionType.EXECUTE, ActionType.WEBHOOK, ActionType.AUDIT,
  ],
  [Capability.SALES]: [
    ActionType.READ, ActionType.SEARCH, ActionType.CREATE,
    ActionType.UPDATE, ActionType.EXECUTE, ActionType.SYNC,
  ],
  [Capability.COMPLIANCE]: [
    ActionType.READ, ActionType.SEARCH, ActionType.AUDIT,
    ActionType.APPROVE, ActionType.REJECT,
  ],
  [Capability.WORK_MANAGEMENT]: [
    ActionType.READ, ActionType.SEARCH, ActionType.CREATE,
    ActionType.UPDATE, ActionType.DELETE, ActionType.SYNC,
    ActionType.EXECUTE, ActionType.HEALTH,
  ],
});
