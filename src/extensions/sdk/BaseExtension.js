/**
 * BaseExtension — abstract base class for all FLOW extensions.
 *
 * Every installable extension (connector pack, agent pack, workflow pack,
 * widget, capability pack, etc.) extends this class and implements the
 * lifecycle hooks it needs.  The Extension Loader calls these hooks in order;
 * an extension that does not override a hook gets the no-op default.
 *
 * Extensions MUST NOT:
 *   - import FLOW internals directly (use the injected `api` object)
 *   - store tenant data in module-level variables
 *   - bypass governance (all actions via api.execute)
 */
export class BaseExtension {
  /**
   * @param {object} manifest  — parsed, validated manifest object
   * @param {object} api       — injected FLOW API surface (scoped to permissions)
   */
  constructor(manifest, api) {
    if (new.target === BaseExtension) {
      throw new Error('BaseExtension is abstract — instantiate a subclass');
    }
    this.manifest = manifest;
    this.api      = api;
    this.id       = manifest.id;
    this.version  = manifest.version;
    this._enabled = false;
  }

  get enabled() { return this._enabled; }

  // ── Lifecycle hooks (override as needed) ─────────────────────────────────

  /**
   * Called once when the extension is first loaded into the process.
   * Register routes, actions, agents, workflows, widgets here.
   * Must be idempotent.
   */
  async onEnable()  { /* no-op */ }

  /**
   * Called when the extension is disabled (hot-unload).
   * Unregister anything registered in onEnable.
   */
  async onDisable() { /* no-op */ }

  /**
   * Called when upgrading from a previous version.
   * `previousVersion` is the semver string of the installed version.
   * Run data migrations here; always maintain forward compatibility.
   */
  async onUpgrade(previousVersion) { /* no-op */ } // eslint-disable-line no-unused-vars

  /**
   * Called when the extension is permanently uninstalled.
   * Clean up any workspace-specific data created by this extension.
   */
  async onUninstall() { /* no-op */ }

  /**
   * Health check — return { healthy: boolean, message?: string }.
   * Called by the registry during periodic health sweeps.
   */
  async healthCheck() {
    return { healthy: true };
  }

  // ── Internal (called by Loader, not by extension code) ───────────────────

  async _enable() {
    await this.onEnable();
    this._enabled = true;
  }

  async _disable() {
    await this.onDisable();
    this._enabled = false;
  }

  toJSON() {
    return {
      id:       this.id,
      version:  this.version,
      name:     this.manifest.name,
      category: this.manifest.category,
      enabled:  this._enabled,
    };
  }
}
