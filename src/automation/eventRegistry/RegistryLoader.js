/**
 * RegistryLoader — scans src/automation/eventRegistry/events/{connector}/*.js
 * and loads all definitions into the eventRegistry singleton.
 */

import { readdirSync, statSync } from 'fs';
import { fileURLToPath }        from 'url';
import { join, dirname }        from 'path';
import { eventRegistry }        from './EventRegistry.js';
import { logger }               from '../../utils/logger.js';

const EVENTS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'events');

export async function loadEventRegistry() {
  if (eventRegistry.stats().total > 0) return; // idempotent

  const defs = [];

  let connectorDirs;
  try {
    connectorDirs = readdirSync(EVENTS_DIR).filter(name => {
      try { return statSync(join(EVENTS_DIR, name)).isDirectory(); } catch { return false; }
    });
  } catch {
    logger.warn('[EventRegistry] events/ directory not found — no event schemas loaded');
    eventRegistry.load([]);
    return;
  }

  for (const connector of connectorDirs) {
    const connectorDir = join(EVENTS_DIR, connector);
    let files;
    try { files = readdirSync(connectorDir).filter(f => f.endsWith('.js')); }
    catch { continue; }

    for (const file of files) {
      try {
        const mod = await import(join(connectorDir, file));
        const def = mod.default;
        if (def?.id) defs.push(def);
        else logger.warn(`[EventRegistry] ${file} has no default export with id`);
      } catch (err) {
        logger.warn(`[EventRegistry] Failed to load ${file}: ${err.message}`);
      }
    }
  }

  const loaded = eventRegistry.load(defs);
  logger.info(`[EventRegistry] Loaded ${loaded} event definitions across ${connectorDirs.length} connectors`);
}
