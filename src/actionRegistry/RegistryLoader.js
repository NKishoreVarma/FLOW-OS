/**
 * Registry Loader
 *
 * Scans src/actionRegistry/actions/{connector}/*.js at boot and loads every
 * exported default ActionDefinition into the ActionRegistry singleton.
 *
 * Pattern mirrors WorkflowLoader — zero runtime changes needed to add a new
 * connector: drop a file in actions/{connector}/ and restart.
 */

import { readdirSync }    from 'fs';
import { join, dirname }  from 'path';
import { fileURLToPath }  from 'url';
import { actionRegistry } from './ActionRegistry.js';
import { logger }         from '../utils/logger.js';

const __dirname    = dirname(fileURLToPath(import.meta.url));
const ACTIONS_DIR  = join(__dirname, 'actions');

export async function loadRegistry() {
  const definitions = [];

  let connectorDirs;
  try {
    connectorDirs = readdirSync(ACTIONS_DIR, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => e.name);
  } catch {
    logger.warn('[RegistryLoader] actions/ directory not found — registry will be empty');
    actionRegistry.load([]);
    return;
  }

  for (const connector of connectorDirs) {
    const connectorPath = join(ACTIONS_DIR, connector);
    let files;
    try {
      files = readdirSync(connectorPath).filter(f => f.endsWith('.js'));
    } catch {
      continue;
    }

    for (const file of files) {
      const filePath = `file://${join(connectorPath, file)}`;
      try {
        const mod = await import(filePath);
        const def = mod.default;
        if (def && typeof def === 'object') {
          definitions.push(def);
        } else {
          logger.warn(`[RegistryLoader] No default export in ${file}`);
        }
      } catch (err) {
        logger.warn(`[RegistryLoader] Failed to import ${file}: ${err.message}`);
      }
    }
  }

  actionRegistry.load(definitions);
  logger.info(`[RegistryLoader] Registry ready — ${actionRegistry.size} actions across ${connectorDirs.length} connectors`);
}
