/**
 * Extension System — public API surface.
 *
 * Boot sequence (called once from server.js):
 *   const ext = await startExtensionSystem();
 *   // ext.loader, ext.marketplace are now available
 *
 * The system:
 *   1. Registers all built-in packs into the marketplace catalog
 *   2. Loads any extensions previously installed in the DB
 *   3. Returns the loader and marketplace for use by routes
 */

import { ExtensionLoader }      from './loader/ExtensionLoader.js';
import { extensionRegistry }    from './registry/ExtensionRegistry.js';
import { marketplaceRegistry }  from './registry/MarketplaceRegistry.js';
import * as sdk                 from './sdk/index.js';

// Built-in packs
import { EngineeringPack,  ENGINEERING_PACK_MANIFEST  } from './packs/builtin/EngineeringPack.js';
import { HRPack,           HR_PACK_MANIFEST            } from './packs/builtin/HRPack.js';
import { DevOpsPack,       DEVOPS_PACK_MANIFEST        } from './packs/builtin/DevOpsPack.js';
import { CompliancePack,   COMPLIANCE_PACK_MANIFEST    } from './packs/builtin/CompliancePack.js';

// Provide the extension system with a reference to the FLOW core API.
// This is populated lazily at start-time to avoid circular imports.
let _flowApi = null;

export function configureExtensionApi(api) {
  _flowApi = api;
}

let _loader = null;
let _started = false;

export async function startExtensionSystem() {
  if (_started) return { loader: _loader, marketplace: marketplaceRegistry };
  _started = true;

  if (!_flowApi) throw new Error('Call configureExtensionApi() before startExtensionSystem()');

  _loader = new ExtensionLoader(_flowApi, sdk, {
    extensionDir: process.env.EXTENSION_DIR || './extensions',
    signingKey:   process.env.EXTENSION_SIGNING_KEY || null,
  });

  // Register built-in packs in the marketplace catalog
  const BUILTINS = [
    { manifest: ENGINEERING_PACK_MANIFEST, Cls: EngineeringPack  },
    { manifest: HR_PACK_MANIFEST,          Cls: HRPack            },
    { manifest: DEVOPS_PACK_MANIFEST,      Cls: DevOpsPack        },
    { manifest: COMPLIANCE_PACK_MANIFEST,  Cls: CompliancePack    },
  ];

  for (const { manifest } of BUILTINS) {
    marketplaceRegistry.registerBuiltin(manifest);
  }

  // Load + enable built-in packs
  await _loader.loadAll(BUILTINS.map(b => b.manifest));

  // Re-enable any previously installed (non-builtin) extensions from DB
  try {
    const rows = await extensionRegistry.listAll(null, 'enabled');
    const thirdParty = rows.filter(r => !BUILTINS.some(b => b.manifest.id === r.extension_id));
    if (thirdParty.length > 0) {
      const manifests = thirdParty.map(r => r.manifest_json);
      await _loader.loadAll(manifests);
    }
  } catch (_) {
    // DB may not have the table yet (migration not run)
  }

  return { loader: _loader, marketplace: marketplaceRegistry };
}

export function getLoader()      { return _loader; }
export function getMarketplace() { return marketplaceRegistry; }
export { extensionRegistry, marketplaceRegistry, sdk };
export * from './sdk/index.js';
export { parseManifest }         from './manifest/ManifestParser.js';
export { PermissionGate, PermissionDeniedError } from './security/PermissionGate.js';
