/**
 * FLOW OS — BaseAdapter
 *
 * All connector adapters must extend this class.
 * Methods that are not overridden throw CapabilityNotSupportedError so
 * the execution engine can detect unsupported operations at runtime.
 *
 * Adapter contract:
 *   - All public methods are async.
 *   - All return values use FLOW normalized types from normalizedTypes.js.
 *   - No provider-specific objects are returned — normalize inside the adapter.
 *   - Adapters must not throw provider SDK errors directly;
 *     wrap them in AppError with a meaningful message.
 */

import { AppError } from '../core/errors/index.js';

// True if `prop` is defined anywhere on the prototype chain as a getter without
// a setter — assigning to it in strict mode would throw.
function _hasGetterOnly(obj, prop) {
  let proto = Object.getPrototypeOf(obj);
  while (proto && proto !== Object.prototype) {
    const desc = Object.getOwnPropertyDescriptor(proto, prop);
    if (desc) return typeof desc.get === 'function' && typeof desc.set !== 'function';
    proto = Object.getPrototypeOf(proto);
  }
  return false;
}

export class CapabilityNotSupportedError extends AppError {
  constructor(connectorId, action) {
    super(
      `Connector "${connectorId}" does not support action "${action}"`,
      501,
      'CAPABILITY_NOT_SUPPORTED'
    );
  }
}

export class ConnectorAuthError extends AppError {
  constructor(connectorId, detail = 'No credentials found') {
    super(
      `Connector "${connectorId}" authentication failed: ${detail}`,
      401,
      'CONNECTOR_AUTH_ERROR'
    );
  }
}

export class BaseAdapter {
  /**
   * @param {object} config
   * @param {string} config.id       — connector ID (e.g. 'gmail')
   * @param {string} config.name     — display name (e.g. 'Gmail')
   * @param {string} config.capability — Capability enum value
   * @param {string} config.authStrategy — AuthStrategy enum value
   * @param {string[]} config.supportedActions — ActionType[] this adapter supports
   * @param {string} config.version
   */
  constructor(config) {
    if (!config?.id)         throw new AppError('BaseAdapter requires config.id', 500);
    if (!config?.capability) throw new AppError('BaseAdapter requires config.capability', 500);

    this.id               = config.id;
    this.name             = config.name || config.id;
    this.capability       = config.capability;
    this.authStrategy     = config.authStrategy;
    this.version          = config.version || '1.0.0';
    this.scopes           = config.scopes || [];

    // Some adapters expose supportedActions via a read-only getter (e.g.
    // SlackAdapter). Assigning to a getter-only property throws in strict ESM
    // and crashed adapter construction at boot — only assign when writable.
    if (!_hasGetterOnly(this, 'supportedActions')) {
      this.supportedActions = config.supportedActions || [];
    }
  }

  supports(actionType) {
    return this.supportedActions.includes(actionType);
  }

  _requiresAction(actionType) {
    if (!this.supports(actionType)) {
      throw new CapabilityNotSupportedError(this.id, actionType);
    }
  }

  /**
   * Verify the connector can reach the provider.
   * Returns { status: 'HEALTHY' | 'DEGRADED' | 'DOWN', latencyMs, detail }
   *
   * @param {string} workspaceId
   * @returns {Promise<object>}
   */
  async healthCheck(workspaceId) {        // eslint-disable-line no-unused-vars
    throw new CapabilityNotSupportedError(this.id, 'health');
  }

  /**
   * Authenticate the connector for a workspace.
   * For OAuth: returns the consent URL.
   * For API Key: validates and stores the key.
   *
   * @param {string} workspaceId
   * @param {object} params
   * @returns {Promise<object>}
   */
  async authenticate(workspaceId, params) { // eslint-disable-line no-unused-vars
    throw new CapabilityNotSupportedError(this.id, 'authenticate');
  }

  /**
   * Handle an OAuth callback (exchange code for tokens).
   *
   * @param {string} workspaceId
   * @param {string} code
   * @param {object} params
   * @returns {Promise<object>}
   */
  async handleAuthCallback(workspaceId, code, params) { // eslint-disable-line no-unused-vars
    throw new CapabilityNotSupportedError(this.id, 'handleAuthCallback');
  }

  /**
   * Read a list of items or a single item.
   *
   * @param {string} workspaceId
   * @param {object} options  { folder, limit, offset, filter, id }
   * @returns {Promise<object[]>}
   */
  async read(workspaceId, options) { // eslint-disable-line no-unused-vars
    this._requiresAction('read');
  }

  /**
   * Full-text or semantic search within this connector's data.
   *
   * @param {string} workspaceId
   * @param {string} query
   * @param {object} options  { limit, filter }
   * @returns {Promise<import('./normalizedTypes.js').createSearchResult[]>}
   */
  async search(workspaceId, query, options) { // eslint-disable-line no-unused-vars
    this._requiresAction('search');
  }

  /**
   * Create a new item (email draft, task, doc, etc.).
   *
   * @param {string} workspaceId
   * @param {object} payload
   * @returns {Promise<object>}
   */
  async create(workspaceId, payload) { // eslint-disable-line no-unused-vars
    this._requiresAction('create');
  }

  /**
   * Update an existing item.
   *
   * @param {string} workspaceId
   * @param {string} id
   * @param {object} patch
   * @returns {Promise<object>}
   */
  async update(workspaceId, id, patch) { // eslint-disable-line no-unused-vars
    this._requiresAction('update');
  }

  /**
   * Delete an item.
   *
   * @param {string} workspaceId
   * @param {string} id
   * @returns {Promise<void>}
   */
  async delete(workspaceId, id) { // eslint-disable-line no-unused-vars
    this._requiresAction('delete');
  }

  /**
   * Execute a side-effectful action (send email, merge PR, close ticket, etc.).
   * This is the only method that produces external side effects.
   *
   * @param {string} workspaceId
   * @param {string} actionType  ActionType enum value
   * @param {object} payload     Action-specific data
   * @param {string} approvedBy  Email of the human who approved the action
   * @returns {Promise<object>}
   */
  async execute(workspaceId, actionType, payload, approvedBy) { // eslint-disable-line no-unused-vars
    this._requiresAction('execute');
  }

  /**
   * Pull a batch of items and push them into the ingestion pipeline.
   *
   * @param {string} workspaceId
   * @param {object} options
   * @returns {Promise<{ synced: number, errors: number }>}
   */
  async sync(workspaceId, options) { // eslint-disable-line no-unused-vars
    this._requiresAction('sync');
  }

  /**
   * Return metadata about this adapter for the registry.
   */
  describe() {
    return {
      id:               this.id,
      name:             this.name,
      capability:       this.capability,
      authStrategy:     this.authStrategy,
      supportedActions: this.supportedActions,
      version:          this.version,
      scopes:           this.scopes,
    };
  }
}
