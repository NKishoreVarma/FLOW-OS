/**
 * FLOW OS — Normalized Data Types
 *
 * Every connector adapter must return objects from these factories.
 * No provider-specific field names cross the adapter boundary.
 * The UI and execution engine operate exclusively on these shapes.
 */

import { randomUUID } from 'crypto';

// ─── Communication ────────────────────────────────────────────────────────────

/**
 * Represents any message-based communication: email, chat, DM.
 */
export function createCommunicationItem({
  id            = randomUUID(),
  connector,                          // connector ID (e.g. 'gmail', 'slack')
  capability    = 'communication',
  title         = '',                 // subject line or first-line summary
  sender        = '',
  recipients    = [],                 // [{ name, address }]
  body          = '',                 // full plain-text body
  bodyHtml      = null,               // HTML body if available
  summary       = null,               // AI-generated summary (populated by communicationService)
  threadId      = null,
  threadLength  = 1,
  labels        = [],
  attachments   = [],                 // [{ name, mimeType, sizeBytes }]
  timestamp     = new Date().toISOString(),
  priority      = 'P2',              // CRITICAL | P1 | P2 | P3
  read          = true,
  folder        = 'INBOX',
  metadata      = {},
} = {}) {
  return {
    id, connector, capability, title, sender, recipients, body, bodyHtml,
    summary, threadId, threadLength, labels, attachments,
    timestamp, priority, read, folder, metadata,
  };
}

// ─── Meetings ─────────────────────────────────────────────────────────────────

export function createMeeting({
  id           = randomUUID(),
  connector,
  capability   = 'meetings',
  title        = '',
  organizer    = '',
  participants = [],                  // [{ name, email, rsvp }]
  startTime    = null,
  endTime      = null,
  duration     = null,               // minutes
  location     = null,
  agenda       = null,
  notes        = null,
  videoUrl     = null,
  timestamp    = new Date().toISOString(),
  metadata     = {},
} = {}) {
  return {
    id, connector, capability, title, organizer, participants,
    startTime, endTime, duration, location, agenda, notes, videoUrl,
    timestamp, metadata,
  };
}

// ─── Engineering ──────────────────────────────────────────────────────────────

export function createEngineeringTask({
  id          = randomUUID(),
  connector,
  capability  = 'engineering',
  type        = 'issue',             // issue | pr | deployment | pipeline
  title       = '',
  description = '',
  status      = 'open',
  priority    = 'P2',
  assignee    = null,
  author      = null,
  labels      = [],
  url         = null,
  repo        = null,
  branch      = null,
  timestamp   = new Date().toISOString(),
  metadata    = {},
} = {}) {
  return {
    id, connector, capability, type, title, description,
    status, priority, assignee, author, labels, url, repo, branch,
    timestamp, metadata,
  };
}

// ─── Knowledge ────────────────────────────────────────────────────────────────

export function createKnowledgeDocument({
  id        = randomUUID(),
  connector,
  capability = 'knowledge',
  title     = '',
  content   = '',
  excerpt   = '',
  author    = null,
  space     = null,
  url       = null,
  tags      = [],
  aiIntelligence = {},
  updatedAt = new Date().toISOString(),
  metadata  = {},
} = {}) {
  return {
    id, connector, capability, title, content, excerpt,
    author, space, url, tags, aiIntelligence, updatedAt, metadata,
  };
}

// ─── Customer Record (CRM / Sales) ───────────────────────────────────────────

export function createCustomerRecord({
  id        = randomUUID(),
  connector,
  capability = 'crm',
  name      = '',
  email     = null,
  company   = null,
  stage     = null,               // lead | qualified | opportunity | closed
  value     = null,               // deal value
  owner     = null,
  tags      = [],
  lastContact = null,
  timestamp = new Date().toISOString(),
  metadata  = {},
} = {}) {
  return {
    id, connector, capability, name, email, company,
    stage, value, owner, tags, lastContact, timestamp, metadata,
  };
}

// ─── Approval ─────────────────────────────────────────────────────────────────

export function createApproval({
  id           = randomUUID(),
  connector,
  capability   = 'operations',
  title        = '',
  requestor    = '',
  body         = '',
  draftContent = null,             // AI-generated draft response
  context      = [],               // [string] bullet points
  priority     = 'P1',
  expiresAt    = null,
  timestamp    = new Date().toISOString(),
  metadata     = {},
} = {}) {
  return {
    id, connector, capability, title, requestor, body,
    draftContent, context, priority, expiresAt, timestamp, metadata,
  };
}

// ─── Incident ─────────────────────────────────────────────────────────────────

export function createIncident({
  id              = randomUUID(),
  connector,
  capability      = 'operations',
  title           = '',
  severity        = 'P2',          // CRITICAL | P1 | P2 | P3
  description     = '',
  affectedSystems = [],
  status          = 'open',
  assignee        = null,
  detectedAt      = new Date().toISOString(),
  resolvedAt      = null,
  metadata        = {},
} = {}) {
  return {
    id, connector, capability, title, severity, description,
    affectedSystems, status, assignee, detectedAt, resolvedAt, metadata,
  };
}

// ─── Timeline Event ───────────────────────────────────────────────────────────

/**
 * Every executed action publishes one of these to the company timeline.
 */
export function createTimelineEvent({
  id          = randomUUID(),
  workspaceId,
  connectorId,
  capability,
  actionType,
  actor       = 'system',          // user email or 'system'
  target      = null,              // item ID or identifier that was acted on
  summary     = '',                // human-readable description
  timestamp   = new Date().toISOString(),
  metadata    = {},
} = {}) {
  return {
    id, workspaceId, connectorId, capability, actionType,
    actor, target, summary, timestamp, metadata,
  };
}

// ─── Universal Search Result ──────────────────────────────────────────────────

export function createSearchResult({
  id         = randomUUID(),
  connector,
  capability,
  type,                            // normalized type name (e.g. 'communication_item')
  title      = '',
  excerpt    = '',
  score      = 0,                  // 0–1 relevance
  timestamp  = null,
  url        = null,
  metadata   = {},
} = {}) {
  return { id, connector, capability, type, title, excerpt, score, timestamp, url, metadata };
}

// ─── Work Item (Work Management) ──────────────────────────────────────────────

export function createWorkItem({
  id            = randomUUID(),
  connector,
  capability    = 'work_management',
  key           = '',
  title         = '',
  description   = '',
  status        = 'To Do',            // To Do | In Progress | Review | QA | Done | Blocked
  priority      = 'P2',               // P0 | P1 | P2 | P3
  assignee      = null,
  reporter      = null,
  projectKey    = '',
  projectName   = '',
  labels        = [],
  components    = [],
  versions      = [],
  parent        = null,
  children      = [],
  links         = [],
  sprintId      = null,
  sprintName    = '',
  aiIntelligence = {},
  timestamp     = new Date().toISOString(),
  metadata      = {},
} = {}) {
  return {
    id, connector, capability, key, title, description, status, priority,
    assignee, reporter, projectKey, projectName, labels, components, versions,
    parent, children, links, sprintId, sprintName, aiIntelligence, timestamp, metadata
  };
}

// ─── Customer Intelligence (CRM) ───────────────────────────────────────────────

export function createCrmAccount({
  id            = randomUUID(),
  connector,
  capability    = 'crm',
  name          = '',
  domain        = '',
  industry      = '',
  annualRevenue = null,
  stage         = 'Prospect',         // Prospect | Customer | Churned
  owner         = null,
  healthScore   = 100,                // 0–100
  aiIntelligence = {},
  updatedAt     = new Date().toISOString(),
  metadata      = {},
} = {}) {
  return {
    id, connector, capability, name, domain, industry, annualRevenue, stage,
    owner, healthScore, aiIntelligence, updatedAt, metadata
  };
}

export function createCrmContact({
  id            = randomUUID(),
  connector,
  capability    = 'crm',
  firstName     = '',
  lastName      = '',
  email         = '',
  phone         = '',
  accountId     = null,
  title         = '',
  owner         = null,
  lastContactedAt = null,
  updatedAt     = new Date().toISOString(),
  metadata      = {},
} = {}) {
  return {
    id, connector, capability, firstName, lastName, email, phone, accountId,
    title, owner, lastContactedAt, updatedAt, metadata
  };
}

export function createCrmOpportunity({
  id            = randomUUID(),
  connector,
  capability    = 'crm',
  name          = '',
  accountId     = null,
  stage         = 'Discovery',        // Discovery | Proposal | Negotiation | Closed Won | Closed Lost
  amount        = null,
  closeDate     = null,
  probability   = 0,                  // 0–100
  owner         = null,
  aiIntelligence = {},
  updatedAt     = new Date().toISOString(),
  metadata      = {},
} = {}) {
  return {
    id, connector, capability, name, accountId, stage, amount, closeDate,
    probability, owner, aiIntelligence, updatedAt, metadata
  };
}

export function createCrmActivity({
  id            = randomUUID(),
  connector,
  capability    = 'crm',
  type          = 'note',             // call | email | meeting | note | task
  subject       = '',
  description   = '',
  accountId     = null,
  contactId     = null,
  owner         = null,
  activityDate  = new Date().toISOString(),
  metadata      = {},
} = {}) {
  return {
    id, connector, capability, type, subject, description, accountId, contactId,
    owner, activityDate, metadata
  };
}

// ─── Workforce Intelligence (HR) ──────────────────────────────────────────────

export function createHrEmployee({
  id            = randomUUID(),
  connector,
  capability    = 'hr',
  name          = '',
  email         = '',
  role          = '',
  department    = '',
  status        = 'Active',           // Active | On Leave | Terminated
  managerId     = null,
  skills        = [],
  timezone      = 'UTC',
  availability  = {},                 // status, timeoff schedule
  workload      = {},                 // projects, Jira, meetings, email load
  aiIntelligence = {},
  updatedAt     = new Date().toISOString(),
  metadata      = {},
} = {}) {
  return {
    id, connector, capability, name, email, role, department, status, managerId,
    skills, timezone, availability, workload, aiIntelligence, updatedAt, metadata
  };
}

export function createHrTeam({
  id            = randomUUID(),
  connector,
  capability    = 'hr',
  name          = '',
  department    = '',
  leadId        = null,
  memberIds     = [],
  metadata      = {},
} = {}) {
  return {
    id, connector, capability, name, department, leadId, memberIds, metadata
  };
}

export function createHrSkill({
  id            = randomUUID(),
  connector,
  capability    = 'hr',
  name          = '',
  category      = 'Frontend',         // Frontend | Backend | DevOps | Database | Security | Domain
  expertIds     = [],
  metadata      = {},
} = {}) {
  return {
    id, connector, capability, name, category, expertIds, metadata
  };
}

export function createHrAvailability({
  id            = randomUUID(),
  connector,
  capability    = 'hr',
  employeeId    = null,
  type          = 'PTO',              // PTO | Sick | Holiday
  startDate     = null,
  endDate       = null,
  status        = 'Approved',         // Approved | Pending
  metadata      = {},
} = {}) {
  return {
    id, connector, capability, employeeId, type, startDate, endDate, status, metadata
  };
}
