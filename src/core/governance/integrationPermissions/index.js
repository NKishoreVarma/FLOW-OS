/**
 * FLOW OS — Integration Permissions (Phase 13.1)
 *
 * OAuth authenticates. These modules decide what FLOW is allowed to understand.
 *
 * Public surface:
 *   isResourceAllowed / isWebhookAllowed / filterItems  — the gate (enforcement)
 *   getAllowedResourceIds                               — fan-out only over allowed resources
 *   runDiscovery                                        — real provider API → catalog
 *   permission store CRUD                               — REST layer
 *   taxonomy                                            — connector/resource metadata
 */

export {
  isResourceAllowed,
  isWebhookAllowed,
  isResourceIdAllowed,
  filterItems,
  getAllowedResourceIds,
  resetLegacyWarnings,
  GateReason,
} from './permissionGate.js';

export { runDiscovery } from './discoveryService.js';

export {
  NotConnectedError,
  discoverResources,
  isDiscoverable,
} from './resourceDiscovery.js';

export {
  getSettings,
  updateSettings,
  loadPermissionMap,
  listResources,
  getSummary,
  upsertDiscovered,
  setAllowed,
  setAllForConnector,
  markSynced,
  listConfiguredConnectors,
  getMissingTypes,
  invalidate,
  invalidateWorkspace,
  clearCache,
} from './permissionStore.js';

export {
  extractFromSyncItem,
  extractFromWebhook,
} from './resourceKeyExtractor.js';

export {
  GOVERNED_CONNECTORS,
  UNAVAILABLE_CONNECTORS,
  CONNECTOR_TAXONOMY,
  isGoverned,
  getTaxonomy,
  getResourceTypes,
} from './resourceTypes.js';
