/**
 * FLOW OS — Integration Permission Taxonomy (Phase 13.1)
 *
 * The single source of truth for what a "resource" means per connector.
 * Drives discovery, the permission gate, and the UI tree.
 *
 * Adding a connector to the Permissions Center = add an entry here + a discovery
 * function + a key extractor. Nothing else changes.
 */

/** Connectors with a real sync adapter — these are discovered and enforced. */
export const GOVERNED_CONNECTORS = [
  'slack',
  'github',
  'gmail',
  'google-calendar',
  'notion',
  'jira',
];

/**
 * Connectors the product intends to support but which have no sync adapter yet.
 * Surfaced in the UI as disabled cards so the roadmap is visible — we never
 * fabricate resources for them.
 */
export const UNAVAILABLE_CONNECTORS = [
  { id: 'microsoft-teams', name: 'Microsoft Teams', category: 'Communication' },
  { id: 'sharepoint',      name: 'SharePoint',      category: 'Knowledge'     },
  { id: 'onedrive',        name: 'OneDrive',        category: 'Knowledge'     },
  { id: 'dropbox',         name: 'Dropbox',         category: 'Knowledge'     },
  { id: 'google-drive',    name: 'Google Drive',    category: 'Knowledge'     },
  { id: 'confluence',      name: 'Confluence',      category: 'Knowledge'     },
];

/**
 * Per-connector resource taxonomy.
 *
 *   label        — display name for the connector
 *   icon         — emoji used by the dashboard cards
 *   category     — grouping in the UI
 *   resourceTypes — ordered list of gateable types:
 *      type      — stored in integration_permissions.resource_type
 *      label     — section heading in the UI ("Channels", "Repositories")
 *      singular  — used in copy ("1 channel hidden")
 *      parentType — set when the type nests under another (repository → organization)
 *   supportsDmPolicy — Slack-style DM handling (radio group instead of checkboxes)
 */
export const CONNECTOR_TAXONOMY = {
  slack: {
    label:    'Slack',
    icon:     '💬',
    category: 'Communication',
    supportsDmPolicy: true,
    resourceTypes: [
      { type: 'channel',         label: 'Channels',         singular: 'channel' },
      { type: 'private_channel', label: 'Private Channels', singular: 'private channel' },
      { type: 'group',           label: 'Groups',           singular: 'group' },
    ],
  },

  github: {
    label:    'GitHub',
    icon:     '⚙️',
    category: 'Engineering',
    resourceTypes: [
      { type: 'organization', label: 'Organizations', singular: 'organization' },
      { type: 'repository',   label: 'Repositories',  singular: 'repository', parentType: 'organization' },
    ],
  },

  gmail: {
    label:    'Gmail',
    icon:     '📧',
    category: 'Communication',
    resourceTypes: [
      { type: 'label', label: 'Labels', singular: 'label' },
    ],
  },

  'google-calendar': {
    label:    'Google Calendar',
    icon:     '📅',
    category: 'Meetings',
    resourceTypes: [
      { type: 'calendar', label: 'Calendars', singular: 'calendar' },
    ],
  },

  notion: {
    label:    'Notion',
    icon:     '📝',
    category: 'Knowledge',
    resourceTypes: [
      { type: 'page',     label: 'Pages',     singular: 'page' },
      { type: 'database', label: 'Databases', singular: 'database' },
    ],
  },

  jira: {
    label:    'Jira',
    icon:     '🎯',
    category: 'Work Management',
    resourceTypes: [
      { type: 'project', label: 'Projects', singular: 'project' },
    ],
  },
};

export function isGoverned(connector) {
  return GOVERNED_CONNECTORS.includes(connector);
}

export function getTaxonomy(connector) {
  return CONNECTOR_TAXONOMY[connector] ?? null;
}

export function getResourceTypes(connector) {
  return CONNECTOR_TAXONOMY[connector]?.resourceTypes ?? [];
}
