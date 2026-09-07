/**
 * Tool Registry — Layer 8 of the AI Platform.
 *
 * Maps logical tool names (what the LLM sees) to FLOW's ONE canonical action
 * contract (what the execution engine runs). There is a single representation —
 * no competing vocabularies:
 *
 *   connector       — connector id ('gmail' | 'github' | 'jira' | … | 'internal')
 *   actionType      — an ActionType VERB ('read' | 'search' | 'send' | …). This is
 *                     exactly what governance evaluates, what adapter.supports()
 *                     checks, and what adapter.execute() dispatches on. It is NOT a
 *                     bespoke name like "SEARCH_MESSAGES".
 *   capability      — the Capability the tool belongs to (governance plan-gates on it)
 *   payloadTemplate — FLOW-controlled payload fields merged OVER the model input
 *                     (e.g. a fixed resourceType). The model cannot override these.
 *   parameters      — JSON Schema the LLM fills; becomes the connector payload
 *   riskTier        — LOW | MEDIUM | HIGH | CRITICAL (drives read-only gating + approval)
 *   internal        — true for FLOW-native tools that resolve through FLOW services
 *   internalOp      — internal dispatch key (internal tools only)
 *
 * The LLM never references a connector, an ActionType, or a payload verb directly —
 * it only calls tools by their FLOW name. FLOW translates, authorizes, and executes.
 */

import { ActionType, Capability } from '../../connectors/capabilities.js';

const _tools = new Map();

function register(tool) {
  _tools.set(tool.name, Object.freeze(tool));
}

// ── Internal knowledge tools (resolve through FLOW services, workspace-scoped) ──
register({
  name:        'search_workspace',
  description: 'Semantic search across all workspace intelligence and memory.',
  connector:   'internal',
  internal:    true,
  internalOp:  'SEARCH_WORKSPACE',
  actionType:  ActionType.SEARCH,
  capability:  Capability.KNOWLEDGE,
  riskTier:    'LOW',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'What to look for across the workspace' },
      limit: { type: 'integer', description: 'Max results (default 6)', default: 6 },
    },
    required: ['query'],
  },
});

register({
  name:        'get_entity',
  description: 'Look up a specific entity (person, project, system, customer) and its relationships from the Knowledge Graph.',
  connector:   'internal',
  internal:    true,
  internalOp:  'GET_ENTITY',
  actionType:  ActionType.READ,
  capability:  Capability.KNOWLEDGE,
  riskTier:    'LOW',
  parameters: {
    type: 'object',
    properties: { entityId: { type: 'string', description: 'The FLOW entity ID' } },
    required: ['entityId'],
  },
});

// ── Communication (Gmail) ─────────────────────────────────────────────────────
register({
  name:        'search_emails',
  description: 'Search emails in the connected mailbox. Returns matching message summaries.',
  connector:   'gmail',
  actionType:  ActionType.SEARCH,
  capability:  Capability.COMMUNICATION,
  riskTier:    'LOW',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Gmail search query (e.g. "from:alice@acme.com subject:invoice")' },
      limit: { type: 'integer', default: 10 },
    },
    required: ['query'],
  },
});

register({
  name:        'send_email',
  description: 'Send an email from the connected mailbox.',
  connector:   'gmail',
  actionType:  ActionType.SEND,
  capability:  Capability.COMMUNICATION,
  riskTier:    'HIGH',
  parameters: {
    type: 'object',
    properties: {
      to:      { type: 'string', description: 'Recipient email address' },
      subject: { type: 'string' },
      body:    { type: 'string' },
    },
    required: ['to', 'subject', 'body'],
  },
});

// ── Meetings (Google Calendar) ────────────────────────────────────────────────
register({
  name:        'search_calendar',
  description: 'Search calendar events (meetings) by text. Returns matching events.',
  connector:   'google-calendar',
  actionType:  ActionType.SEARCH,
  capability:  Capability.MEETINGS,
  riskTier:    'LOW',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Text to match in event titles / attendees' },
      limit: { type: 'integer', default: 10 },
    },
    required: ['query'],
  },
});

register({
  name:        'create_meeting',
  description: 'Create a calendar event.',
  connector:   'google-calendar',
  actionType:  ActionType.CREATE,
  capability:  Capability.MEETINGS,
  riskTier:    'MEDIUM',
  parameters: {
    type: 'object',
    properties: {
      title:     { type: 'string' },
      startTime: { type: 'string', description: 'ISO 8601 datetime' },
      endTime:   { type: 'string', description: 'ISO 8601 datetime' },
      attendees: { type: 'array', items: { type: 'string' }, description: 'Email addresses' },
    },
    required: ['title', 'startTime', 'endTime'],
  },
});

// ── Engineering (GitHub) ──────────────────────────────────────────────────────
register({
  name:        'search_engineering',
  description: 'Search code, repositories, commits, and pull requests on GitHub.',
  connector:   'github',
  actionType:  ActionType.SEARCH,
  capability:  Capability.ENGINEERING,
  riskTier:    'LOW',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'GitHub search query (optionally with repo:owner/name)' },
      limit: { type: 'integer', default: 10 },
    },
    required: ['query'],
  },
});

register({
  name:        'merge_pull_request',
  description: 'Merge a pull request after all approvals and governance checks pass.',
  connector:   'github',
  actionType:  ActionType.UPDATE,
  capability:  Capability.ENGINEERING,
  riskTier:    'HIGH',
  payloadTemplate: { resourceType: 'pull_request', op: 'merge' },
  parameters: {
    type: 'object',
    properties: {
      owner:       { type: 'string' },
      repo:        { type: 'string' },
      number:      { type: 'integer' },
      mergeMethod: { type: 'string', enum: ['squash', 'merge', 'rebase'], default: 'squash' },
    },
    required: ['owner', 'repo', 'number'],
  },
});

// ── Work management (Jira) ────────────────────────────────────────────────────
// Simulated connectors expose data through the READ ActionType + a FLOW-controlled
// resourceType (the pattern the capability routes already use). The `query` is an
// advisory hint the reasoning layer uses to filter; the connector returns the set.
register({
  name:        'list_jira_issues',
  description: 'List Jira issues (projects, tickets, epics). Use the query hint to focus.',
  connector:   'jira',
  actionType:  ActionType.READ,
  capability:  Capability.WORK_MANAGEMENT,
  riskTier:    'LOW',
  payloadTemplate: { resourceType: 'issues' },
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Advisory hint: what you are looking for' },
      limit: { type: 'integer', default: 10 },
    },
  },
});

// ── People / Workforce (Workday) ──────────────────────────────────────────────
register({
  name:        'list_people',
  description: 'List the people / workforce directory (employees, roles, teams).',
  connector:   'workday',
  actionType:  ActionType.READ,
  capability:  Capability.HR,
  riskTier:    'LOW',
  payloadTemplate: { resourceType: 'employees' },
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Advisory hint: name, role, team, or department' },
      limit: { type: 'integer', default: 10 },
    },
  },
});

// ── Customer intelligence (HubSpot) ───────────────────────────────────────────
register({
  name:        'list_customers',
  description: 'List customers / accounts in the CRM.',
  connector:   'hubspot',
  actionType:  ActionType.READ,
  capability:  Capability.CRM,
  riskTier:    'LOW',
  payloadTemplate: { resourceType: 'accounts' },
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Advisory hint: company, contact, or deal' },
      limit: { type: 'integer', default: 10 },
    },
  },
});

// ── Knowledge (Notion) ────────────────────────────────────────────────────────
register({
  name:        'list_docs',
  description: 'List documents, pages, and wikis in the knowledge base.',
  connector:   'notion',
  actionType:  ActionType.READ,
  capability:  Capability.KNOWLEDGE,
  riskTier:    'LOW',
  payloadTemplate: { resourceType: 'documents' },
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Advisory hint: topic, title, or keywords' },
      limit: { type: 'integer', default: 10 },
    },
  },
});

// ── Public API ─────────────────────────────────────────────────────────────────
export function getTool(name)   { return _tools.get(name) ?? null; }
export function getAllTools()   { return [..._tools.values()]; }
export function getToolsForLLM() {
  return getAllTools().map(t => ({
    name:        t.name,
    description: t.description,
    input_schema: t.parameters,
  }));
}
export function hasTool(name)  { return _tools.has(name); }
