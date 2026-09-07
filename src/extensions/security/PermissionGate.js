import { PERMISSION_SCOPES } from '../manifest/PermissionModel.js';

/**
 * PermissionGate — enforces that an extension only accesses APIs it declared.
 *
 * Every API method in the injected `api` object is wrapped here so that an
 * attempt to call an API without the declared permission throws immediately
 * rather than silently succeeding or silently failing.
 *
 * The gate is constructed once per loaded extension and captures that
 * extension's declared permissions.  A separate gate instance per extension
 * ensures there is no cross-extension privilege leakage.
 */
export class PermissionGate {
  /**
   * @param {string}   extensionId
   * @param {string[]} declaredPermissions — from manifest.permissions
   */
  constructor(extensionId, declaredPermissions) {
    this.extensionId = extensionId;
    this._perms      = new Set(declaredPermissions);
    this._auditLog   = [];
  }

  has(scope) { return this._perms.has(scope); }

  /**
   * Assert the extension has a given scope.
   * Throws AuthorizationError if not.
   */
  require(scope) {
    this._audit(scope, this._perms.has(scope));
    if (!this._perms.has(scope)) {
      throw new PermissionDeniedError(this.extensionId, scope);
    }
  }

  /**
   * Build an API surface object, scoping each sub-object to the
   * permissions the extension declared.
   *
   * The returned object's methods throw PermissionDeniedError if the
   * required scope is missing.
   */
  buildApiSurface(rawApi) {
    return {
      events:      this._guard(rawApi.events,      'events'),
      graph:       this._guard(rawApi.graph,        'graph'),
      memory:      this._guard(rawApi.memory,       'memory'),
      executions:  this._guard(rawApi.executions,   'executions'),
      connectors:  this._guard(rawApi.connectors,   'connectors'),
      agents:      this._guard(rawApi.agents,       'agents'),
      workflows:   this._guard(rawApi.workflows,    'workflows'),
      actions:     this._guard(rawApi.actions,      'actions'),
      routes:      this._guard(rawApi.routes,       'routes'),
      widgets:     this._guard(rawApi.widgets,      'widgets'),
      executive:   this._guard(rawApi.executive,    'executive'),
      predictions: this._guard(rawApi.predictions,  'predictions'),
      kpis:        this._guard(rawApi.kpis,         'kpis'),
    };
  }

  _guard(apiObject, namespace) {
    if (!apiObject) return null;
    const gate = this;
    return new Proxy(apiObject, {
      get(target, prop) {
        if (typeof prop !== 'string') return Reflect.get(target, prop);
        const method = Reflect.get(target, prop);
        if (typeof method !== 'function') return method;

        // Determine which scope governs this method call
        const scope = `${namespace}.${_methodToScope(namespace, prop)}`;
        if (PERMISSION_SCOPES[scope]) {
          gate.require(scope);
        }
        return method.bind(target);
      },
    });
  }

  _audit(scope, granted) {
    this._auditLog.push({ scope, granted, ts: Date.now() });
    if (this._auditLog.length > 500) this._auditLog.shift();
  }

  getAuditLog() { return [...this._auditLog]; }
}

function _methodToScope(namespace, method) {
  // Map method names to the coarser read/write/subscribe/execute/register scopes
  const WRITE_VERBS    = new Set(['publish', 'write', 'create', 'upsert', 'insert', 'update', 'delete', 'save']);
  const REGISTER_VERBS = new Set(['register', 'mount', 'add', 'install']);
  const EXECUTE_VERBS  = new Set(['execute', 'run', 'trigger', 'dispatch']);
  const SUBSCRIBE_VERBS= new Set(['subscribe', 'on', 'listen']);

  const lc = method.toLowerCase();
  if (REGISTER_VERBS.has(lc))  return 'register';
  if (EXECUTE_VERBS.has(lc))   return 'execute';
  if (SUBSCRIBE_VERBS.has(lc)) return 'subscribe';
  if (WRITE_VERBS.has(lc) || lc.startsWith('set') || lc.startsWith('put')) return 'write';
  return 'read';
}

export class PermissionDeniedError extends Error {
  constructor(extensionId, scope) {
    super(`Extension "${extensionId}" does not have permission: ${scope}`);
    this.name        = 'PermissionDeniedError';
    this.extensionId = extensionId;
    this.scope       = scope;
    this.statusCode  = 403;
  }
}
