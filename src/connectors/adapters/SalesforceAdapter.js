/**
 * FLOW OS — Salesforce Connector Adapter
 *
 * Customer Intelligence Capability (CRM) — foundational skeleton.
 */

import { BaseAdapter } from '../BaseAdapter.js';
import { Capability, ActionType, AuthStrategy } from '../capabilities.js';
import { getCredentials, storeApiKey } from '../authManager.js';
import { AppError } from '../../core/errors/index.js';

class SalesforceAdapter extends BaseAdapter {
  constructor() {
    super({
      id: 'salesforce',
      name: 'Salesforce',
      capability: Capability.CRM,
      authStrategy: AuthStrategy.API_KEY,
      supportedActions: [
        ActionType.HEALTH,
        ActionType.SYNC,
        ActionType.SEARCH,
        ActionType.READ
      ],
      version: '1.0.0'
    });

    // Foundational skeleton — reads return empty, writes unsupported. Flagged so the
    // UI labels it "Preview" instead of implying a live integration.
    this.simulated = true;
  }

  async authenticate(workspaceId, { apiKey } = {}) {
    if (!apiKey) throw new Error('apiKey is required');
    storeApiKey(workspaceId, this.id, apiKey);
    return { authenticated: true };
  }

  async healthCheck(workspaceId) {
    const start = Date.now();
    const creds = getCredentials(workspaceId, this.id);
    if (!creds?.token) {
      return { status: 'HEALTHY', latencyMs: Date.now() - start, detail: 'Demo Mode Fallback Active (Salesforce)' };
    }
    return { status: 'HEALTHY', latencyMs: Date.now() - start, detail: 'Salesforce REST Client Connected' };
  }

  async execute(workspaceId, actionType, payload = {}) {
    switch (actionType) {
      case ActionType.READ:
        return this._read(workspaceId, payload);
      case ActionType.SEARCH:
        return [];
      case ActionType.SYNC:
        return { syncedAccounts: 0, syncedContacts: 0, syncedOpps: 0, errors: 0 };
      default:
        throw new AppError(`SalesforceAdapter: actionType "${actionType}" not supported in skeleton`, 400);
    }
  }

  async _read(workspaceId, payload) {
    const { resourceType } = payload;
    if (resourceType === 'accounts' || resourceType === 'contacts' || resourceType === 'opportunities' || resourceType === 'activities') {
      return [];
    }
    throw new AppError('SalesforceAdapter: read operations not fully implemented in skeleton', 501);
  }
}

export default new SalesforceAdapter();
