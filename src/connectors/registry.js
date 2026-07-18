/**
 * FLOW OS — Connector Registry
 *
 * Central catalog of every connector FLOW knows about.
 * Adapters self-register at startup via registerConnector().
 * The rest of FLOW resolves connectors by capability — never by name.
 *
 * In-memory (process-scoped). Registrations come from code, not DB,
 * so restarts repopulate automatically via module import side effects.
 */

import { AppError, NotFoundError } from '../core/errors/index.js';
import { Capability, CapabilityActions } from './capabilities.js';
import { hasCredentials, describeCredentials, listConnectedConnectors } from './authManager.js';

// connectorId → { meta, adapter }
const connectorMap = new Map();

// capability → Set<connectorId>
const capabilityIndex = new Map(
  Object.values(Capability).map(cap => [cap, new Set()])
);

/**
 * Register a connector adapter with the framework.
 *
 * @param {import('./BaseAdapter.js').BaseAdapter} adapter — must extend BaseAdapter
 */
export function registerConnector(adapter) {
  if (!adapter?.id)         throw new AppError('Connector adapter must have an id', 500);
  if (!adapter?.capability) throw new AppError('Connector adapter must declare a capability', 500);
  if (!Capability[adapter.capability.toUpperCase()] && !Object.values(Capability).includes(adapter.capability)) {
    throw new AppError(`Unknown capability: "${adapter.capability}"`, 500);
  }

  const validActions = CapabilityActions[adapter.capability] || [];
  const invalidActions = (adapter.supportedActions || []).filter(a => !validActions.includes(a));
  if (invalidActions.length) {
    throw new AppError(
      `Connector "${adapter.id}" declares unsupported actions for capability "${adapter.capability}": ${invalidActions.join(', ')}`,
      500
    );
  }

  connectorMap.set(adapter.id, adapter);

  const capSet = capabilityIndex.get(adapter.capability) ?? new Set();
  capSet.add(adapter.id);
  capabilityIndex.set(adapter.capability, capSet);

  console.log(`🔌 [ConnectorRegistry] Registered: ${adapter.id} (${adapter.capability} v${adapter.version})`);
}

/**
 * Remove a connector from the registry (e.g. on uninstall).
 */
export function unregisterConnector(connectorId) {
  const adapter = connectorMap.get(connectorId);
  if (!adapter) return;
  connectorMap.delete(connectorId);
  capabilityIndex.get(adapter.capability)?.delete(connectorId);
}

/**
 * Get a single adapter by ID. Throws NotFoundError if missing.
 */
export function getConnector(connectorId) {
  const adapter = connectorMap.get(connectorId);
  if (!adapter) throw new NotFoundError(`Connector "${connectorId}"`);
  return adapter;
}

/**
 * Get all adapters for a capability. Returns [] if none registered.
 */
export function getByCapability(capability) {
  const ids = capabilityIndex.get(capability) ?? new Set();
  return [...ids].map(id => connectorMap.get(id)).filter(Boolean);
}

/**
 * Check whether a connector is registered.
 */
export function isRegistered(connectorId) {
  return connectorMap.has(connectorId);
}

/**
 * List all registered connectors with auth status for a workspace.
 */
export function listConnectors(workspaceId) {
  return [...connectorMap.values()].map(adapter => ({
    ...adapter.describe(),
    auth: workspaceId
      ? describeCredentials(workspaceId, adapter.id)
      : null,
    connected: workspaceId
      ? hasCredentials(workspaceId, adapter.id)
      : false,
  }));
}

/**
 * Return only connectors that a workspace has authenticated.
 */
export function listConnectedAdapters(workspaceId) {
  const connectedIds = new Set(listConnectedConnectors(workspaceId));
  return [...connectorMap.values()].filter(a => connectedIds.has(a.id));
}

/**
 * Run healthCheck on all registered connectors for a workspace.
 * Returns results keyed by connectorId.
 */
export async function checkAllHealth(workspaceId) {
  const results = {};
  await Promise.all(
    [...connectorMap.values()].map(async adapter => {
      try {
        results[adapter.id] = await adapter.healthCheck(workspaceId);
      } catch (err) {
        results[adapter.id] = { status: 'DOWN', detail: err.message };
      }
    })
  );
  return results;
}

/**
 * Capability summary: capability → [connectorIds]
 */
export function getCapabilityMap() {
  const out = {};
  for (const [cap, ids] of capabilityIndex) {
    out[cap] = [...ids];
  }
  return out;
}
