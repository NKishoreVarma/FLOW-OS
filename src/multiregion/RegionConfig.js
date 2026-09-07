/**
 * RegionConfig — Module 2 (Multi-Region)
 *
 * Region configuration, routing priority, and geo-aware database selection.
 * Reads from environment variables and supports runtime reconfiguration.
 */

export const RegionRole = Object.freeze({
  PRIMARY:   'PRIMARY',
  SECONDARY: 'SECONDARY',
  READ_ONLY: 'READ_ONLY',
});

export const REGIONS = _parseRegionConfig();

function _parseRegionConfig() {
  const primary = {
    id:       process.env.REGION_ID      ?? 'us-east-1',
    name:     process.env.REGION_NAME    ?? 'US East',
    role:     RegionRole.PRIMARY,
    dbUrl:    process.env.DATABASE_URL   ?? '',
    redisUrl: process.env.REDIS_URL      ?? '',
    endpoint: process.env.REGION_ENDPOINT ?? '',
    latencyMs: 0,
    healthy:  true,
  };

  const regions = [primary];

  // Secondary regions from SECONDARY_REGIONS env (comma-separated JSON)
  const secondaryRaw = process.env.SECONDARY_REGIONS;
  if (secondaryRaw) {
    try {
      const secondaries = JSON.parse(secondaryRaw);
      for (const s of secondaries) {
        regions.push({
          id:       s.id,
          name:     s.name ?? s.id,
          role:     RegionRole.SECONDARY,
          dbUrl:    s.dbUrl ?? '',
          redisUrl: s.redisUrl ?? '',
          endpoint: s.endpoint ?? '',
          latencyMs: s.latencyMs ?? 50,
          healthy:  true,
        });
      }
    } catch {
      // SECONDARY_REGIONS not set or invalid — single-region mode
    }
  }

  // Read replicas from READ_REPLICAS env
  const replicasRaw = process.env.READ_REPLICAS;
  if (replicasRaw) {
    try {
      const replicas = JSON.parse(replicasRaw);
      for (const r of replicas) {
        regions.push({
          id:       r.id,
          name:     r.name ?? r.id,
          role:     RegionRole.READ_ONLY,
          dbUrl:    r.dbUrl ?? '',
          redisUrl: '',
          endpoint: r.endpoint ?? '',
          latencyMs: r.latencyMs ?? 10,
          healthy:  true,
        });
      }
    } catch { /* no replicas */ }
  }

  return regions;
}

export function getPrimaryRegion() {
  return REGIONS.find(r => r.role === RegionRole.PRIMARY);
}

export function getSecondaryRegions() {
  return REGIONS.filter(r => r.role === RegionRole.SECONDARY);
}

export function getReadReplicas() {
  return REGIONS.filter(r => r.role === RegionRole.READ_ONLY);
}

export function getHealthyRegions() {
  return REGIONS.filter(r => r.healthy);
}

export function markRegionUnhealthy(regionId) {
  const r = REGIONS.find(r => r.id === regionId);
  if (r) r.healthy = false;
}

export function markRegionHealthy(regionId) {
  const r = REGIONS.find(r => r.id === regionId);
  if (r) r.healthy = true;
}

export function getCurrentRegion() {
  const id = process.env.REGION_ID ?? 'us-east-1';
  return REGIONS.find(r => r.id === id) ?? getPrimaryRegion();
}

export function isMultiRegion() {
  return REGIONS.length > 1;
}
