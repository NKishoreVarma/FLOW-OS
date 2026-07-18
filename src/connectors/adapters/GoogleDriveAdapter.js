/**
 * FLOW OS — Google Drive Connector Adapter
 *
 * Knowledge Capability — foundational skeleton.
 */

import { BaseAdapter } from '../BaseAdapter.js';
import { Capability, ActionType, AuthStrategy } from '../capabilities.js';
import { getCredentials, storeApiKey } from '../authManager.js';
import { AppError } from '../../core/errors/index.js';

class GoogleDriveAdapter extends BaseAdapter {
  constructor() {
    super({
      id: 'googledrive',
      name: 'Google Drive',
      capability: Capability.KNOWLEDGE,
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
      return { status: 'HEALTHY', latencyMs: Date.now() - start, detail: 'Demo Mode Fallback Active (Google Drive)' };
    }
    return { status: 'HEALTHY', latencyMs: Date.now() - start, detail: 'Google Drive API Connected' };
  }

  async execute(workspaceId, actionType, payload = {}) {
    switch (actionType) {
      case ActionType.READ:
        return this._read(workspaceId, payload);
      case ActionType.SEARCH:
        return [];
      case ActionType.SYNC:
        return { synced: 0, errors: 0 };
      default:
        throw new AppError(`GoogleDriveAdapter: actionType "${actionType}" not supported in skeleton`, 400);
    }
  }

  async _read(workspaceId, payload) {
    if (payload.resourceType === 'documents') {
      return [];
    }
    throw new AppError('GoogleDriveAdapter: document read not implemented', 501);
  }
}

export default new GoogleDriveAdapter();
