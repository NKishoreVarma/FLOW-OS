/**
 * GeoRouter — Module 2 (Multi-Region)
 *
 * Routes requests to the nearest healthy region.
 * Falls back to primary on failure. Supports read/write split.
 */

import { REGIONS, getPrimaryRegion, getHealthyRegions, getCurrentRegion, markRegionUnhealthy } from './RegionConfig.js';
import { logger } from '../utils/logger.js';

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Select the best region for a read operation.
 * Prefers the lowest-latency healthy region (read replica or secondary).
 */
export function routeRead(clientRegionId = null) {
  const candidates = getHealthyRegions().sort((a, b) => a.latencyMs - b.latencyMs);
  if (clientRegionId) {
    const preferred = candidates.find(r => r.id === clientRegionId);
    if (preferred) return preferred;
  }
  return candidates[0] ?? getPrimaryRegion();
}

/**
 * Select the region for a write operation.
 * Always returns the primary region.
 */
export function routeWrite() {
  return getPrimaryRegion();
}

/**
 * Route a workflow to the best available region for execution.
 * Prefers regions with lower latency that are not the primary
 * (to avoid overloading primary with compute-heavy work).
 */
export function routeWorkflow(workspaceId = '') {
  const healthy    = getHealthyRegions();
  const secondaries = healthy.filter(r => r.role === 'SECONDARY');
  if (secondaries.length > 0) {
    // Consistent hashing: pick secondary by workspaceId hash
    const idx = _simpleHash(workspaceId) % secondaries.length;
    return secondaries[idx];
  }
  return getPrimaryRegion();
}

/**
 * Probe region health by measuring roundtrip to its endpoint.
 */
export async function probeRegion(region) {
  if (!region.endpoint) return { healthy: true, latencyMs: 0, region: region.id };

  const t0 = Date.now();
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(`${region.endpoint}/health/live`, { signal: ctrl.signal });
    clearTimeout(timer);
    const latencyMs = Date.now() - t0;
    region.latencyMs = latencyMs;
    const healthy = res.ok;
    if (!healthy) markRegionUnhealthy(region.id);
    return { healthy, latencyMs, region: region.id };
  } catch (err) {
    markRegionUnhealthy(region.id);
    logger.warn(`[GeoRouter] region ${region.id} probe failed: ${err.message}`);
    return { healthy: false, latencyMs: Date.now() - t0, region: region.id, error: err.message };
  }
}

/**
 * Probe all regions and return status map.
 */
export async function probeAllRegions() {
  return Promise.all(REGIONS.map(probeRegion));
}

/**
 * Express middleware that attaches region routing to req.
 */
export function geoRoutingMiddleware(req, res, next) {
  const clientRegion  = req.headers['x-region-id'] ?? null;
  req.readRegion      = routeRead(clientRegion);
  req.writeRegion     = routeWrite();
  req.currentRegion   = getCurrentRegion();
  res.setHeader('x-flow-region', req.currentRegion.id);
  next();
}

// ── Internal ──────────────────────────────────────────────────────────────────

function _simpleHash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h) + str.charCodeAt(i);
  return Math.abs(h);
}
