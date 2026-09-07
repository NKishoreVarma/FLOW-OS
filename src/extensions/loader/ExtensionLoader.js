import path         from 'node:path';
import { EventEmitter } from 'node:events';
import { parseManifest } from '../manifest/ManifestParser.js';
import { validateSignature } from '../security/SignatureValidator.js';
import { PermissionGate }    from '../security/PermissionGate.js';
import { DependencyResolver } from './DependencyResolver.js';
import { checkFlowCompatibility, compareVersions } from './VersionChecker.js';
import { SandboxRunner }     from './SandboxRunner.js';
import { logger }            from '../../utils/logger.js';

/**
 * ExtensionLoader — manages the full lifecycle of FLOW extensions.
 *
 * Phases: discover → validate → resolve → sandbox-load → enable
 * Reverse: disable → unload → (optionally) uninstall
 *
 * All lifecycle events are emitted so the MarketplaceRegistry can react:
 *   'extension:loaded'   { extensionId, manifest }
 *   'extension:enabled'  { extensionId }
 *   'extension:disabled' { extensionId }
 *   'extension:error'    { extensionId, error }
 *   'extension:unloaded' { extensionId }
 */
export class ExtensionLoader extends EventEmitter {
  /**
   * @param {object} flowApi      — raw FLOW API surface (pre-gate)
   * @param {object} sdkExports   — BaseExtension, Base*Pack classes
   * @param {object} [opts]
   * @param {string} [opts.extensionDir]  — base directory for extension bundles
   * @param {string} [opts.signingKey]    — PEM public key for signature verification
   */
  constructor(flowApi, sdkExports, opts = {}) {
    super();
    this._api          = flowApi;
    this._sdk          = sdkExports;
    this._signingKey   = opts.signingKey || null;
    this._extensionDir = opts.extensionDir || path.join(process.cwd(), 'extensions');
    this._sandbox      = new SandboxRunner();
    this._resolver     = new DependencyResolver();
    this._instances    = new Map(); // id → { manifest, instance }
    this._installed    = new Map(); // id → version (for dependency resolution)
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Load, validate, and enable a batch of extension manifests.
   * Safe to call incrementally (already-loaded extensions are skipped).
   *
   * @param {object[]} manifests — raw manifest JSON objects
   * @returns {{ loaded: string[], skipped: string[], errors: object[] }}
   */
  async loadAll(manifests) {
    const parsed  = [];
    const parseErrors = [];

    for (const raw of manifests) {
      const { manifest, errors } = parseManifest(raw);
      if (errors.length) {
        parseErrors.push({ id: raw.id || '(unknown)', errors });
      } else {
        parsed.push(manifest);
      }
    }

    if (parseErrors.length) {
      return { loaded: [], skipped: [], errors: parseErrors };
    }

    const { order, errors: depErrors } = this._resolver.resolve(parsed);
    if (depErrors.length) {
      return { loaded: [], skipped: [], errors: depErrors.map(e => ({ error: e })) };
    }

    const byId    = new Map(parsed.map(m => [m.id, m]));
    const loaded  = [];
    const skipped = [];
    const errors  = [];

    for (const id of order) {
      const manifest = byId.get(id);
      if (this._instances.has(id)) {
        skipped.push(id);
        continue;
      }
      try {
        await this._load(manifest);
        loaded.push(id);
      } catch (err) {
        errors.push({ id, error: err.message });
        this.emit('extension:error', { extensionId: id, error: err });
      }
    }

    return { loaded, skipped, errors };
  }

  /**
   * Enable a loaded extension.  No-op if already enabled.
   */
  async enable(extensionId) {
    const entry = this._instances.get(extensionId);
    if (!entry) throw new Error(`Extension "${extensionId}" is not loaded`);
    if (entry.instance.enabled) return;
    await entry.instance._enable();
    this.emit('extension:enabled', { extensionId });
    logger('extensions', `enabled: ${extensionId}`);
  }

  /**
   * Disable a loaded extension.  Hot-unloads without removing from registry.
   */
  async disable(extensionId) {
    const entry = this._instances.get(extensionId);
    if (!entry) throw new Error(`Extension "${extensionId}" is not loaded`);
    if (!entry.instance.enabled) return;
    await entry.instance._disable();
    this.emit('extension:disabled', { extensionId });
    logger('extensions', `disabled: ${extensionId}`);
  }

  /**
   * Upgrade an extension — disable old, load new, enable new.
   */
  async upgrade(newManifest) {
    const { manifest, errors } = parseManifest(newManifest);
    if (errors.length) throw new Error(`Manifest errors: ${errors.join(', ')}`);

    const existing = this._instances.get(manifest.id);
    const decision = existing
      ? compareVersions(existing.manifest.version, manifest.version)
      : 'upgrade';

    if (decision === 'same') return { action: 'same', version: manifest.version };
    if (decision === 'downgrade' && process.env.EXTENSION_ALLOW_DOWNGRADE !== 'true') {
      throw new Error(`Downgrade blocked: ${existing.manifest.version} → ${manifest.version}`);
    }

    if (existing) {
      await this.disable(manifest.id);
      await existing.instance.onUpgrade(existing.manifest.version);
      this._unloadEntry(manifest.id);
    }

    await this._load(manifest);
    return { action: decision, version: manifest.version };
  }

  /**
   * Permanently uninstall an extension.
   */
  async uninstall(extensionId) {
    const entry = this._instances.get(extensionId);
    if (!entry) return;

    if (entry.instance.enabled) await this.disable(extensionId);
    await entry.instance.onUninstall();
    this._unloadEntry(extensionId);
    this.emit('extension:unloaded', { extensionId });
    logger('extensions', `uninstalled: ${extensionId}`);
  }

  /**
   * Reload — disable + unload + re-load + enable.
   * Used during hot-reload development.
   */
  async reload(manifest) {
    const id = manifest.id || (parseManifest(manifest).manifest?.id);
    if (this._instances.has(id)) {
      await this.disable(id);
      this._unloadEntry(id);
    }
    return this.upgrade(manifest);
  }

  listLoaded() {
    return [...this._instances.values()].map(e => e.instance.toJSON());
  }

  getInstance(extensionId) {
    return this._instances.get(extensionId)?.instance || null;
  }

  // ── Private ───────────────────────────────────────────────────────────────

  async _load(manifest) {
    // Flow version compatibility
    const compat = checkFlowCompatibility(manifest.minimumFlowVersion);
    if (!compat.compatible) throw new Error(compat.reason);

    // Signature check (non-fatal in dev, fatal in prod)
    if (this._signingKey) {
      const { valid, reason } = validateSignature(manifest._raw, this._signingKey);
      if (!valid) throw new Error(`Signature invalid for ${manifest.id}: ${reason}`);
    }

    // Build permission-gated API surface
    const gate       = new PermissionGate(manifest.id, manifest.permissions);
    const scopedApi  = gate.buildApiSurface(this._api);

    // Resolve extension class — either from entrypoint file or synthetic
    let ExtensionClass;
    if (manifest.entrypoints?.main) {
      const entryPath = path.resolve(this._extensionDir, manifest.id, manifest.entrypoints.main);
      const exports   = await this._sandbox.load(manifest.id, entryPath, {
        FlowSDK: this._sdk,
        FlowAPI: scopedApi,
      });
      ExtensionClass = exports.default || exports[Object.keys(exports)[0]];
    } else {
      ExtensionClass = this._sdk.BaseExtension;
    }

    if (!ExtensionClass) throw new Error(`Extension "${manifest.id}" did not export a class`);

    const instance = new ExtensionClass(manifest, scopedApi);
    this._instances.set(manifest.id, { manifest, instance, gate });
    this._installed.set(manifest.id, manifest.version);

    this.emit('extension:loaded', { extensionId: manifest.id, manifest });
    logger('extensions', `loaded: ${manifest.id}@${manifest.version}`);

    // Auto-enable unless explicitly deferred
    if (process.env.EXTENSION_DISABLE_AUTOSTART !== 'true') {
      await this.enable(manifest.id);
    }
  }

  _unloadEntry(extensionId) {
    this._sandbox.unload(extensionId);
    this._instances.delete(extensionId);
    this._installed.delete(extensionId);
  }
}
