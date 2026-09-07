/**
 * Canonical entity type enumeration for the Enterprise Knowledge Graph.
 * These match the CHECK constraint in kg_nodes.entity_type.
 */

export const EntityType = Object.freeze({
  PERSON:        'PERSON',
  TEAM:          'TEAM',
  DEPARTMENT:    'DEPARTMENT',
  PROJECT:       'PROJECT',
  REPOSITORY:    'REPOSITORY',
  SERVICE:       'SERVICE',
  CUSTOMER:      'CUSTOMER',
  VENDOR:        'VENDOR',
  DOCUMENT:      'DOCUMENT',
  MEETING:       'MEETING',
  EMAIL:         'EMAIL',
  SLACK_CHANNEL: 'SLACK_CHANNEL',
  JIRA_ISSUE:    'JIRA_ISSUE',
  PULL_REQUEST:  'PULL_REQUEST',
  INCIDENT:      'INCIDENT',
  DEPLOYMENT:    'DEPLOYMENT',
  ENVIRONMENT:   'ENVIRONMENT',
  BUSINESS_GOAL: 'BUSINESS_GOAL',
  KPI:           'KPI',
  RISK:          'RISK',
  APPROVAL:      'APPROVAL',
  POLICY:        'POLICY',
  ASSET:         'ASSET',
});

export const ALL_ENTITY_TYPES = Object.values(EntityType);

/** Return true if t is a valid EntityType value. */
export function isEntityType(t) {
  return ALL_ENTITY_TYPES.includes(t);
}

/** Human-readable label for an entity type. */
export function entityTypeLabel(t) {
  const labels = {
    PERSON:        'Person',
    TEAM:          'Team',
    DEPARTMENT:    'Department',
    PROJECT:       'Project',
    REPOSITORY:    'Repository',
    SERVICE:       'Service',
    CUSTOMER:      'Customer',
    VENDOR:        'Vendor',
    DOCUMENT:      'Document',
    MEETING:       'Meeting',
    EMAIL:         'Email',
    SLACK_CHANNEL: 'Slack Channel',
    JIRA_ISSUE:    'Jira Issue',
    PULL_REQUEST:  'Pull Request',
    INCIDENT:      'Incident',
    DEPLOYMENT:    'Deployment',
    ENVIRONMENT:   'Environment',
    BUSINESS_GOAL: 'Business Goal',
    KPI:           'KPI',
    RISK:          'Risk',
    APPROVAL:      'Approval',
    POLICY:        'Policy',
    ASSET:         'Asset',
  };
  return labels[t] ?? t;
}

/**
 * Which entity types are "organizational" (people, teams, structure).
 * Used by OrgExplorer.
 */
export const ORG_ENTITY_TYPES = new Set([
  EntityType.PERSON,
  EntityType.TEAM,
  EntityType.DEPARTMENT,
]);

/**
 * Which entity types are "technical" (systems, code, deployments).
 * Used by ServiceDependencyMapper.
 */
export const TECHNICAL_ENTITY_TYPES = new Set([
  EntityType.REPOSITORY,
  EntityType.SERVICE,
  EntityType.DEPLOYMENT,
  EntityType.ENVIRONMENT,
  EntityType.ASSET,
]);

/**
 * Which entity types are "work items" (tasks, issues, reviews).
 * Used by executive insights and planner integration.
 */
export const WORK_ENTITY_TYPES = new Set([
  EntityType.PROJECT,
  EntityType.JIRA_ISSUE,
  EntityType.PULL_REQUEST,
  EntityType.INCIDENT,
  EntityType.APPROVAL,
]);
