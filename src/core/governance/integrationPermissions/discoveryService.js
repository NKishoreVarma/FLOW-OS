/**
 * FLOW OS — Discovery Service (Phase 13.1)
 *
 * Orchestrates: call the provider → upsert the catalog → resolve grandfathering.
 *
 * The grandfathering handoff lives here. A connector that was syncing before
 * Integration Permissions shipped is flagged legacy_grandfathered by the v13
 * migration, and the gate lets its traffic through untouched. The first discovery
 * seeds that connector's catalog as ALLOWED (preserving the status quo — nothing
 * the workspace was already reading suddenly disappears) and clears the flag.
 * From that moment the connector is governed: anything new is hidden by default.
 */

import { logger }               from '../../../utils/logger.js';
import { discoverResources }    from './resourceDiscovery.js';
import {
  getSettings,
  updateSettings,
  upsertDiscovered,
  getSummary,
}                               from './permissionStore.js';

/**
 * Run discovery for one workspace+connector.
 *
 * @returns {Promise<{discovered: number, created: number, updated: number,
 *                    seededAllowed: boolean, summary: object}>}
 */
export async function runDiscovery(workspaceId, connector) {
  const settings  = await getSettings(workspaceId, connector);
  const resources = await discoverResources(workspaceId, connector);

  // First discovery of a grandfathered connector: preserve what it already reads.
  const seededAllowed = settings.legacyGrandfathered === true;

  const result = await upsertDiscovered(workspaceId, connector, resources, {
    defaultAllowed: seededAllowed,
  });

  await updateSettings(workspaceId, connector, {
    lastDiscoveredAt:    new Date(),
    ...(seededAllowed ? { legacyGrandfathered: false } : {}),
  });

  if (seededAllowed) {
    logger.security(
      `integrationPermissions: ${connector} in ${workspaceId} is now GOVERNED — ` +
      `${result.total} existing resources grandfathered as allowed; new resources hidden by default`,
    );
  }

  const summary = await getSummary(workspaceId, connector);

  return {
    discovered: resources.length,
    created:    result.created,
    updated:    result.updated,
    seededAllowed,
    summary,
  };
}
