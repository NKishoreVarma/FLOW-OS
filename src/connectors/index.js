/**
 * FLOW OS — Connector Framework
 *
 * Public API for the Universal Connector Framework.
 * Import from here — never import framework internals directly.
 */

export { Capability, ActionType, AuthStrategy, CapabilityActions } from './capabilities.js';

export {
  createCommunicationItem,
  createMeeting,
  createEngineeringTask,
  createKnowledgeDocument,
  createCustomerRecord,
  createApproval,
  createIncident,
  createTimelineEvent,
  createSearchResult,
  createWorkItem,
  createCrmAccount,
  createCrmContact,
  createCrmOpportunity,
  createCrmActivity,
  createHrEmployee,
  createHrTeam,
  createHrSkill,
  createHrAvailability,
} from './normalizedTypes.js';

export { BaseAdapter, CapabilityNotSupportedError, ConnectorAuthError } from './BaseAdapter.js';

export {
  storeOAuthTokens,
  storeApiKey,
  storeServiceAccount,
  storeWebhookSecret,
  getCredentials,
  hasCredentials,
  revokeCredentials,
  validateScopes,
  refreshOAuthTokens,
  listConnectedConnectors,
  describeCredentials,
} from './authManager.js';

export {
  registerConnector,
  unregisterConnector,
  getConnector,
  getByCapability,
  isRegistered,
  listConnectors,
  listConnectedAdapters,
  checkAllHealth,
  getCapabilityMap,
} from './registry.js';

export { executeAction, getAuditLog, getTimeline } from './executionEngine.js';

export { universalSearch } from './searchOrchestrator.js';
