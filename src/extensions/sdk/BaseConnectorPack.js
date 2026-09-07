import { BaseExtension } from './BaseExtension.js';

/**
 * BaseConnectorPack — base class for extensions that register new connectors.
 *
 * A ConnectorPack wraps one or more BaseAdapter subclasses and installs them
 * into the ConnectorRegistry at enable time, removing them at disable time.
 *
 * Subclasses must implement:
 *   - connectorDefinitions() — returns an array of { id, AdapterClass, config? }
 */
export class BaseConnectorPack extends BaseExtension {
  constructor(manifest, api) {
    super(manifest, api);
    this._registeredIds = [];
  }

  /**
   * Override to return the connectors this pack provides.
   * @returns {Array<{ id: string, AdapterClass: Function, config?: object }>}
   */
  connectorDefinitions() {
    throw new Error(`${this.constructor.name}.connectorDefinitions() must be implemented`);
  }

  async onEnable() {
    const defs = this.connectorDefinitions();
    for (const { id, AdapterClass, config = {} } of defs) {
      const adapter = new AdapterClass(config);
      this.api.connectors.register(id, adapter);
      this._registeredIds.push(id);
    }
  }

  async onDisable() {
    for (const id of this._registeredIds) {
      this.api.connectors.unregister(id);
    }
    this._registeredIds = [];
  }

  async healthCheck() {
    const results = await Promise.allSettled(
      this._registeredIds.map(id => this.api.connectors.health(id)),
    );
    const healthy = results.every(r => r.status === 'fulfilled' && r.value?.status !== 'DOWN');
    return { healthy, registeredConnectors: this._registeredIds };
  }
}
