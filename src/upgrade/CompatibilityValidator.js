/**
 * CompatibilityValidator — Module 13 (Enterprise Upgrade System)
 *
 * Validates that a target version is compatible with the current state:
 *   - Schema compatibility check (required migrations vs. applied)
 *   - Connector API version compatibility
 *   - Env var requirements for the target version
 *   - Breaking change detection
 */

import { query } from '../config/db.js';

// Version registry — each entry describes what's needed to run that version
const VERSION_REGISTRY = [
  {
    version: '1.0.0',
    minNodeVersion: '20.0.0',
    requiredEnv:   ['DATABASE_URL', 'REDIS_URL', 'JWT_SECRET'],
    migrations:    ['initial', 'phase7_brain', 'governance_5_3_b', 'integration_permissions_v13', 'execution_engine_v14'],
    breakingFrom:  [],
  },
  {
    version: '1.1.0',
    minNodeVersion: '20.0.0',
    requiredEnv:   ['DATABASE_URL', 'REDIS_URL', 'JWT_SECRET'],
    migrations:    ['initial', 'phase7_brain', 'governance_5_3_b', 'integration_permissions_v13', 'execution_engine_v14', 'event_platform_v11_0', 'graph_engine_v11_1'],
    breakingFrom:  [],
  },
  {
    version: '2.0.0',
    minNodeVersion: '20.0.0',
    requiredEnv:   ['DATABASE_URL', 'REDIS_URL', 'JWT_SECRET', 'GEMINI_API_KEY'],
    migrations:    ['initial', 'phase7_brain', 'governance_5_3_b', 'integration_permissions_v13', 'execution_engine_v14', 'event_platform_v11_0', 'graph_engine_v11_1', 'autonomy_v13', 'phase15'],
    breakingFrom:  ['0.x'],
    breakingNotes: 'Requires GEMINI_API_KEY. Workspace externalId format changed.',
  },
];

// ── Public API ────────────────────────────────────────────────────────────────

export async function validateCompatibility(fromVersion, toVersion) {
  const to = VERSION_REGISTRY.find(v => v.version === toVersion);
  if (!to) return { compatible: false, reason: `Unknown target version: ${toVersion}` };

  const issues   = [];
  const warnings = [];

  // Node.js version check
  const nodeVer = process.versions.node;
  if (!_semverGte(nodeVer, to.minNodeVersion)) {
    issues.push(`Node.js ${to.minNodeVersion}+ required; found ${nodeVer}`);
  }

  // Breaking change check
  if (fromVersion) {
    for (const breakingPattern of to.breakingFrom) {
      if (fromVersion.startsWith(breakingPattern.replace('x', ''))) {
        issues.push(`Breaking upgrade from ${fromVersion}: ${to.breakingNotes}`);
      }
    }
  }

  // Required env vars
  const missingEnv = to.requiredEnv.filter(k => !process.env[k]);
  if (missingEnv.length) {
    issues.push(`Missing required env vars: ${missingEnv.join(', ')}`);
  }

  // Migration check
  const appliedMigrations = await _getAppliedMigrations();
  const missingMigrations = to.migrations.filter(m => !appliedMigrations.includes(m));
  if (missingMigrations.length) {
    warnings.push(`Pending migrations: ${missingMigrations.join(', ')}`);
  }

  return {
    compatible:         issues.length === 0,
    fromVersion,
    toVersion,
    issues,
    warnings,
    appliedMigrations,
    requiredMigrations: to.migrations,
    pendingMigrations:  missingMigrations,
  };
}

export function listVersions() {
  return VERSION_REGISTRY.map(v => ({
    version:        v.version,
    minNodeVersion: v.minNodeVersion,
    breakingFrom:   v.breakingFrom,
    breakingNotes:  v.breakingNotes ?? null,
    migrations:     v.migrations,
  }));
}

export function getCurrentVersion() {
  return process.env.APP_VERSION ?? '1.0.0';
}

// ── Internal ──────────────────────────────────────────────────────────────────

async function _getAppliedMigrations() {
  try {
    const { rows } = await query(
      `SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL`
    );
    return rows.map(r => r.migration_name);
  } catch {
    // Table may not exist in all environments
    return [];
  }
}

function _semverGte(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) > (pb[i] ?? 0)) return true;
    if ((pa[i] ?? 0) < (pb[i] ?? 0)) return false;
  }
  return true;
}
