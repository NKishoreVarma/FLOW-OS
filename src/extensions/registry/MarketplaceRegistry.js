import { extensionRegistry } from './ExtensionRegistry.js';
import { compareVersions, checkFlowCompatibility } from '../loader/VersionChecker.js';

/**
 * MarketplaceRegistry — catalog of available extensions (local + remote).
 *
 * Maintains an in-memory catalog of extensions known to be available.
 * The catalog is populated from:
 *   1. Built-in packs registered at boot
 *   2. A remote marketplace feed (EXTENSION_MARKETPLACE_URL env var, if set)
 *   3. Locally installed extensions already in the DB
 *
 * Consumers call listAvailable(), search(), getPackage(), checkUpdates().
 * The actual install/remove operations go through ExtensionLoader + ExtensionRegistry.
 */
export class MarketplaceRegistry {
  constructor() {
    this._catalog = new Map(); // id → CatalogEntry
  }

  // ── Catalog management ───────────────────────────────────────────────────

  registerBuiltin(manifest, sourceCode = null) {
    this._catalog.set(manifest.id, {
      id:          manifest.id,
      name:        manifest.name,
      version:     manifest.version,
      description: manifest.description,
      category:    manifest.category,
      author:      manifest.author,
      license:     manifest.license,
      tags:        manifest.tags || [],
      homepage:    manifest.homepage || null,
      manifest,
      sourceCode,
      source:      'builtin',
      publishedAt: new Date().toISOString(),
    });
  }

  registerFromFeed(entries = []) {
    for (const entry of entries) {
      if (!entry.id || !entry.version) continue;
      const existing = this._catalog.get(entry.id);
      if (existing && compareVersions(existing.version, entry.version) !== 'upgrade') continue;
      this._catalog.set(entry.id, { ...entry, source: 'marketplace' });
    }
  }

  // ── Queries ──────────────────────────────────────────────────────────────

  listAvailable({ category, search, limit = 50 } = {}) {
    let entries = [...this._catalog.values()];

    if (category)  entries = entries.filter(e => e.category === category);
    if (search) {
      const q = search.toLowerCase();
      entries = entries.filter(e =>
        e.name.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q) ||
        (e.tags || []).some(t => t.toLowerCase().includes(q)),
      );
    }

    const compat = checkFlowCompatibility;
    return entries
      .filter(e => !e.manifest?.minimumFlowVersion || compat(e.manifest.minimumFlowVersion).compatible)
      .slice(0, limit)
      .map(e => this._toPublic(e));
  }

  getPackage(extensionId) {
    const entry = this._catalog.get(extensionId);
    return entry ? this._toPublic(entry) : null;
  }

  async checkUpdates(workspaceId = null) {
    const installed = await extensionRegistry.getInstalledVersionMap(workspaceId);
    const updates   = [];

    for (const [id, installedVer] of installed.entries()) {
      const catalogEntry = this._catalog.get(id);
      if (!catalogEntry) continue;
      if (compareVersions(installedVer, catalogEntry.version) === 'upgrade') {
        updates.push({
          extensionId:      id,
          installedVersion: installedVer,
          availableVersion: catalogEntry.version,
          changelog:        catalogEntry.changelog || null,
        });
      }
    }

    return updates;
  }

  async getInstalled(workspaceId = null) {
    const rows = await extensionRegistry.listAll(workspaceId);
    return rows.map(r => ({
      extensionId:  r.extension_id,
      version:      r.version,
      status:       r.status,
      installedAt:  r.installed_at,
      installedBy:  r.installed_by,
      catalogEntry: this._toPublic(this._catalog.get(r.extension_id)) || null,
    }));
  }

  async getHealth(extensionId, loader) {
    const instance = loader?.getInstance(extensionId);
    if (!instance) return { extensionId, status: 'not_loaded' };
    try {
      const h = await instance.healthCheck();
      return { extensionId, status: h.healthy ? 'healthy' : 'degraded', detail: h };
    } catch (err) {
      return { extensionId, status: 'error', error: err.message };
    }
  }

  // ── Private ───────────────────────────────────────────────────────────────

  _toPublic(entry) {
    if (!entry) return null;
    const { sourceCode: _drop, ...rest } = entry;
    return rest;
  }
}

export const marketplaceRegistry = new MarketplaceRegistry();
