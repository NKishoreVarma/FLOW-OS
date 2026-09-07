/**
 * FLOW OS — Discovery Orchestrator (Phase 17)
 *
 * Track 1 "Workspace Discovery" + Track 2 "Governance during setup". Gives the onboarding
 * wizard ONE call that returns, per connector, everything FLOW found — so the admin can
 * decide exactly what FLOW may understand before any data is imported.
 *
 *   mode 'live' → reuses the real Integration-Permissions discovery (provider APIs).
 *                 A connector that isn't OAuth'd yet returns status 'not_connected'
 *                 (honest — never fabricated).
 *   mode 'demo' → a deterministic, coherent catalog for "Load Demo Company / investors
 *                 explore in 30s", consistent with the Living Workspace Simulator's world.
 *
 * No new discovery engine — this only fans out and shapes existing sources.
 */

import { runDiscovery } from '../core/governance/integrationPermissions/discoveryService.js';
import { GOVERNED_CONNECTORS } from '../core/governance/integrationPermissions/resourceTypes.js';

const res = (key, name, type, recommended = true) => ({ key, name, type, recommended });

// Coherent demo company — the same world the simulator inhabits (Acme Technologies).
const DEMO_CATALOG = {
  github: { label: 'GitHub', resourceLabel: 'repositories', resources: [
    res('flow-backend', 'flow-backend', 'repository'), res('flow-frontend', 'flow-frontend', 'repository'),
    res('flow-connectors', 'flow-connectors', 'repository'), res('flow-infra', 'flow-infra', 'repository'),
    res('flow-mobile', 'flow-mobile', 'repository'), res('flow-docs', 'flow-docs', 'repository', false),
  ] },
  slack: { label: 'Slack', resourceLabel: 'channels', resources: [
    res('engineering', '#engineering', 'channel'), res('backend', '#backend', 'channel'), res('frontend', '#frontend', 'channel'),
    res('design', '#design', 'channel'), res('product', '#product', 'channel'), res('incidents', '#incidents', 'channel'),
    res('deploys', '#deploys', 'channel'), res('sales', '#sales', 'channel'), res('customers', '#customers', 'channel'),
    res('general', '#general', 'channel', false), res('random', '#random', 'channel', false), res('hiring', '#hiring', 'channel', false),
    res('finance', '#finance', 'channel', false), res('leadership', '#leadership', 'channel', false),
  ] },
  gmail: { label: 'Gmail', resourceLabel: 'labels', resources: [
    res('INBOX', 'Inbox', 'label'), res('Customers', 'Customers', 'label'), res('Engineering', 'Engineering', 'label'),
    res('Sales', 'Sales', 'label'), res('Personal', 'Personal', 'label', false),
  ] },
  'google-calendar': { label: 'Calendar', resourceLabel: 'calendars', resources: [
    res('engineering', 'Engineering', 'calendar'), res('leadership', 'Leadership', 'calendar'),
  ] },
  notion: { label: 'Notion', resourceLabel: 'spaces', resources: [
    res('product-docs', 'Product Docs', 'page'), res('architecture', 'Architecture', 'page'),
    res('runbooks', 'Runbooks', 'page'), res('exec-notes', 'Executive Notes', 'page', false),
  ] },
  jira: { label: 'Jira', resourceLabel: 'projects', resources: [
    res('PROJ', 'Platform (PROJ)', 'project'), res('INFRA', 'Infrastructure (INFRA)', 'project'), res('CX', 'Customer Success (CX)', 'project'),
  ] },
};

// Company-level facts the wizard shows alongside connectors ("42 employees found").
const DEMO_ORG = { employees: 42, teams: 7, projects: 126, customers: 18 };

function demoConnector(connector) {
  const c = DEMO_CATALOG[connector];
  if (!c) return { connector, status: 'unsupported', resourceLabel: null, count: 0, resources: [] };
  return { connector, label: c.label, status: 'discovered', resourceLabel: c.resourceLabel, count: c.resources.length, resources: c.resources };
}

async function liveConnector(workspaceId, connector) {
  try {
    const d = await runDiscovery(workspaceId, connector);
    const resources = (d.resources || d.items || []).map((r) => ({ key: r.key || r.id, name: r.name || r.title || r.key, type: r.type || 'resource', recommended: r.recommended ?? true }));
    return { connector, status: 'discovered', resourceLabel: d.resourceLabel || 'resources', count: resources.length, resources };
  } catch (err) {
    // NotConnectedError or any provider failure → honest "connect it first", never fabricated.
    return { connector, status: 'not_connected', resourceLabel: null, count: 0, resources: [], reason: err?.message };
  }
}

/**
 * @param {string} workspaceId
 * @param {{ mode?: 'demo'|'live', connectors?: string[] }} opts
 */
export async function discover(workspaceId, { mode = 'demo', connectors } = {}) {
  if (!workspaceId) throw new Error('workspaceId required');
  const list = (connectors && connectors.length ? connectors : GOVERNED_CONNECTORS).filter((c) => GOVERNED_CONNECTORS.includes(c));
  const results = mode === 'live'
    ? await Promise.all(list.map((c) => liveConnector(workspaceId, c)))
    : list.map((c) => demoConnector(c));

  const totals = { resources: results.reduce((s, r) => s + r.count, 0), connectors: results.filter((r) => r.status === 'discovered').length };
  return { mode, org: mode === 'demo' ? DEMO_ORG : null, connectors: results, totals, discoveredAt: new Date().toISOString() };
}

export { DEMO_ORG };
export default { discover, DEMO_ORG };
