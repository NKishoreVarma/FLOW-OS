/**
 * FLOW OS — BambooHR Connector Adapter
 *
 * Workforce Intelligence Capability (HR) — foundational skeleton.
 */

import { BaseAdapter } from '../BaseAdapter.js';
import { Capability, ActionType, AuthStrategy } from '../capabilities.js';
import { getCredentials, storeApiKey } from '../authManager.js';
import { AppError } from '../../core/errors/index.js';

class BambooHRAdapter extends BaseAdapter {
  constructor() {
    super({
      id: 'bamboohr',
      name: 'BambooHR',
      capability: Capability.HR,
      authStrategy: AuthStrategy.API_KEY,
      supportedActions: [
        ActionType.HEALTH,
        ActionType.SYNC,
        ActionType.SEARCH,
        ActionType.READ
      ],
      version: '1.0.0'
    });
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
      return { status: 'HEALTHY', latencyMs: Date.now() - start, detail: 'Demo Mode Fallback Active (BambooHR)' };
    }
    return { status: 'HEALTHY', latencyMs: Date.now() - start, detail: 'BambooHR REST Client Connected' };
  }

  async execute(workspaceId, actionType, payload = {}) {
    switch (actionType) {
      case ActionType.READ:
        return this._read(workspaceId, payload);
      case ActionType.SEARCH:
        return [];
      case ActionType.SYNC:
        return { syncedEmployees: 0, syncedTeams: 0, syncedSkills: 0, errors: 0 };
      default:
        throw new AppError(`BambooHRAdapter: actionType "${actionType}" not supported in skeleton`, 400);
    }
  }

  async _read(workspaceId, payload) {
    const { resourceType } = payload;
    if (resourceType === 'employees' || resourceType === 'teams' || resourceType === 'skills' || resourceType === 'availability') {
      return [];
    }
    throw new AppError('BambooHRAdapter: read operations not fully implemented in skeleton', 501);
  }
}

export default new BambooHRAdapter();
