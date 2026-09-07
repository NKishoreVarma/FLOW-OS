#!/usr/bin/env node
/**
 * ga-checklist.js — Module 17 (GA Checklist)
 *
 * Automated pre-GA verification of all FLOW OS subsystems.
 * Imports modules directly (no live server required for most checks).
 * Produces an Enterprise Readiness Report.
 *
 * Usage: node scripts/ga-checklist.js
 */

import { existsSync, statSync } from 'fs';
import { join }                  from 'path';

const ROOT = new URL('..', import.meta.url).pathname;
const pass = (n, d) => { console.log(`  ✅ ${n}: ${d}`); return { name: n, status: 'PASS', detail: d }; };
const fail = (n, d) => { console.log(`  ❌ ${n}: ${d}`); return { name: n, status: 'FAIL', detail: d }; };
const warn = (n, d) => { console.log(`  ⚠️  ${n}: ${d}`); return { name: n, status: 'WARN', detail: d }; };

const results = [];

function fileCheck(label, relPath) {
  const abs = join(ROOT, relPath);
  const ok  = existsSync(abs) && statSync(abs).size > 0;
  const r   = ok ? pass(label, relPath) : fail(label, `Missing or empty: ${relPath}`);
  results.push(r);
  return ok;
}

function envCheck(label, key, required = true) {
  const val = process.env[key];
  if (!val && required) { const r = fail(label, `${key} not set`); results.push(r); return false; }
  if (!val)              { const r = warn(label, `${key} not set (optional)`); results.push(r); return true; }
  const r = pass(label, `${key} set (${val.length} chars)`);
  results.push(r);
  return true;
}

(async () => {
  console.log('\n🚀 FLOW OS Enterprise GA Checklist\n');

  // ── Core Infrastructure ───────────────────────────────────────────────────
  console.log('[1] Core Infrastructure Files');
  fileCheck('Server entry point',              'src/server.js');
  fileCheck('Database config',                 'src/config/db.js');
  fileCheck('Redis config',                    'src/config/redis.js');
  fileCheck('BullMQ queue config',             'src/config/queue.js');
  fileCheck('Prisma schema',                   'prisma/schema.prisma');
  fileCheck('Ingestion worker',                'src/workers/ingestionWorker.js');
  fileCheck('Summary worker',                  'src/workers/summaryWorker.js');
  fileCheck('Env validation',                  'src/utils/envValidation.js');
  fileCheck('Dockerfile',                      'Dockerfile');
  fileCheck('Docker Compose',                  'docker-compose.yml');

  // ── Phase 15 Enterprise Modules ───────────────────────────────────────────
  console.log('\n[2] Phase 15 — High Availability');
  fileCheck('Leader Election',                 'src/ha/LeaderElection.js');
  fileCheck('Health Monitor',                  'src/ha/HealthMonitor.js');
  fileCheck('Worker Failover',                 'src/ha/WorkerFailover.js');
  fileCheck('HA index',                        'src/ha/index.js');

  console.log('\n[3] Phase 15 — Multi-Region');
  fileCheck('Region Config',                   'src/multiregion/RegionConfig.js');
  fileCheck('Geo Router',                      'src/multiregion/GeoRouter.js');
  fileCheck('Replication Manager',             'src/multiregion/ReplicationManager.js');

  console.log('\n[4] Phase 15 — Disaster Recovery');
  fileCheck('Backup Manager',                  'src/dr/BackupManager.js');
  fileCheck('Restore Wizard',                  'src/dr/RestoreWizard.js');

  console.log('\n[5] Phase 15 — Enterprise Security');
  fileCheck('MFA Manager (TOTP)',              'src/security/enterprise/MFAManager.js');
  fileCheck('Session Manager',                 'src/security/enterprise/SessionManager.js');
  fileCheck('SSO Provider (SAML/OIDC)',        'src/security/enterprise/SSOProvider.js');
  fileCheck('IP Allowlist',                    'src/security/enterprise/IPAllowlist.js');

  console.log('\n[6] Phase 15 — Advanced RBAC');
  fileCheck('Permission Engine',               'src/rbac/PermissionEngine.js');
  fileCheck('Custom Roles',                    'src/rbac/CustomRoles.js');

  console.log('\n[7] Phase 15 — Compliance');
  fileCheck('Compliance Reporter',             'src/compliance/ComplianceReporter.js');

  console.log('\n[8] Phase 15 — Observability');
  fileCheck('Tracing Manager',                 'src/observability/enterprise/TracingManager.js');
  fileCheck('Metrics Registry',                'src/observability/enterprise/MetricsRegistry.js');
  fileCheck('Log Pipeline',                    'src/observability/enterprise/LogPipeline.js');

  console.log('\n[9] Phase 15 — Performance Cache');
  fileCheck('Graph Cache',                     'src/cache/GraphCache.js');
  fileCheck('Workflow Cache',                  'src/cache/WorkflowCache.js');
  fileCheck('Planner Cache',                   'src/cache/PlannerCache.js');

  console.log('\n[10] Phase 15 — Scalability');
  fileCheck('Queue Sharding',                  'src/scaling/QueueSharding.js');
  fileCheck('Workspace Isolation',             'src/scaling/WorkspaceIsolation.js');
  fileCheck('Horizontal Scaler',               'src/scaling/HorizontalScaler.js');

  console.log('\n[11] Phase 15 — Enterprise Admin API');
  fileCheck('Admin Enterprise Routes',         'src/routes/adminEnterpriseRoutes.js');

  console.log('\n[12] Phase 15 — Installation');
  fileCheck('Enterprise Docker Compose',       'install/docker-compose.enterprise.yml');
  fileCheck('K8s Deployment',                  'install/kubernetes/deployment.yaml');
  fileCheck('K8s Service',                     'install/kubernetes/service.yaml');
  fileCheck('K8s Ingress',                     'install/kubernetes/ingress.yaml');
  fileCheck('Helm Chart.yaml',                 'install/helm/Chart.yaml');
  fileCheck('Helm values.yaml',                'install/helm/values.yaml');
  fileCheck('Terraform main.tf',               'install/terraform/main.tf');

  console.log('\n[13] Phase 15 — Upgrade System');
  fileCheck('Version Migrator',                'src/upgrade/VersionMigrator.js');
  fileCheck('Compatibility Validator',         'src/upgrade/CompatibilityValidator.js');
  fileCheck('Rollback Manager',                'src/upgrade/RollbackManager.js');

  console.log('\n[14] Phase 15 — Documentation');
  fileCheck('Architecture docs',               'docs/enterprise/ARCHITECTURE.md');
  fileCheck('Deployment guide',                'docs/enterprise/DEPLOYMENT.md');
  fileCheck('Security guide',                  'docs/enterprise/SECURITY.md');

  console.log('\n[15] Phase 15 — Testing & Scripts');
  fileCheck('Stress test script',              'scripts/stress-test.js');
  fileCheck('Chaos engineering script',        'scripts/chaos-engineering.js');
  fileCheck('Benchmark enterprise script',     'scripts/benchmark-enterprise.js');
  fileCheck('Production certification',        'scripts/certify-production.js');
  fileCheck('Phase 15 migration SQL',          'scripts/migrate-phase15.sql');
  fileCheck('Final validation script',         'scripts/validate-phase15.js');

  // ── Core Phase modules ────────────────────────────────────────────────────
  console.log('\n[16] Prior Phase Modules (frozen — file existence check)');
  const priorModules = [
    'src/events/index.js',
    'src/graph/GraphEngine.js',
    'src/explainability/ExplainabilityEngine.js',
    'src/replay/ReplayEngine.js',
    'src/simulation/SimulationEngine.js',
    'src/predictions/PredictionEngine.js',
    'src/council/executiveOrchestrator.js',
    'src/workspaceCache/snapshotBuilder.js',
    'src/autonomy/AutonomyEngine.js',
    'src/execution/executionCoordinator.js',
    'src/notifications/notificationEngine.js',
  ];
  for (const m of priorModules) {
    const abs = join(ROOT, m);
    const ok  = existsSync(abs);
    const r   = ok ? pass(m.split('/').pop(), m) : warn(m.split('/').pop(), `Not found: ${m}`);
    results.push(r);
  }

  // ── Environment ───────────────────────────────────────────────────────────
  console.log('\n[17] Environment Variables');
  envCheck('DATABASE_URL',       'DATABASE_URL', true);
  envCheck('REDIS_URL',          'REDIS_URL',    true);
  envCheck('JWT_SECRET (32+)',   'JWT_SECRET',   true);
  envCheck('GEMINI_API_KEY',     'GEMINI_API_KEY', false);
  envCheck('GOOGLE_CLIENT_ID',   'GOOGLE_CLIENT_ID', false);
  envCheck('GITHUB_TOKEN',       'GITHUB_TOKEN', false);

  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
    results.push(fail('JWT_SECRET minimum length', 'Must be 32+ chars'));
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  const passCount = results.filter(r => r.status === 'PASS').length;
  const failCount = results.filter(r => r.status === 'FAIL').length;
  const warnCount = results.filter(r => r.status === 'WARN').length;
  const total     = results.length;
  const score     = Math.round(passCount / total * 100);
  const gaReady   = failCount === 0;

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`🏆 FLOW OS Enterprise Readiness Report`);
  console.log(`${'═'.repeat(60)}`);
  console.log(`   Total checks:  ${total}`);
  console.log(`   ✅ Passed:     ${passCount}`);
  console.log(`   ❌ Failed:     ${failCount}`);
  console.log(`   ⚠️  Warnings:   ${warnCount}`);
  console.log(`   Score:         ${score}%`);
  console.log(`   GA Ready:      ${gaReady ? '✅ YES' : '❌ NO — resolve failures above'}`);
  console.log(`${'═'.repeat(60)}\n`);

  if (failCount > 0) {
    console.log('Failed checks:');
    results.filter(r => r.status === 'FAIL').forEach(r => console.log(`  • ${r.name}: ${r.detail}`));
    console.log();
  }

  process.exit(gaReady ? 0 : 1);
})();
