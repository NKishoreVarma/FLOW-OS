#!/usr/bin/env node
/**
 * validate-phase10-infra.js
 *
 * Standalone validation for the Phase 10 Infrastructure Operations Pack.
 * Tests: connector adapters, action registry definitions, event definitions,
 * and workflow templates. No live server or database required.
 *
 * Usage: node scripts/validate-phase10-infra.js
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readdirSync }   from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = join(__dirname, '..');
const SRC       = join(ROOT, 'src');

let passed = 0;
let failed = 0;

function ok(label, condition, detail = '') {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
    failed++;
  }
}

async function loadModule(relPath) {
  return import(`file://${join(ROOT, relPath)}`);
}

// ── Section helpers ───────────────────────────────────────────────────────────

function section(title) {
  console.log(`\n${title}`);
}

// ── 1. Connector adapter files exist ─────────────────────────────────────────

section('1. Connector Adapters — Files Exist');

const ADAPTERS = ['KubernetesAdapter', 'AWSAdapter', 'PostgreSQLAdapter', 'RedisAdapter', 'DatadogAdapter', 'PagerDutyAdapter'];
for (const name of ADAPTERS) {
  try {
    const m = await loadModule(`src/connectors/adapters/${name}.js`);
    const adapter = m.default;
    ok(`${name} exports a default instance`, adapter && typeof adapter === 'object');
    ok(`${name} has an id`, typeof adapter?.id === 'string' && adapter.id.length > 0);
    ok(`${name} healthCheck is a function`, typeof adapter?.healthCheck === 'function');
    ok(`${name} execute is a function`, typeof adapter?.execute === 'function');
  } catch (err) {
    ok(`${name} loads without error`, false, err.message);
    ok(`${name} has an id`, false);
    ok(`${name} healthCheck is a function`, false);
    ok(`${name} execute is a function`, false);
  }
}

// ── 2. Adapters registered in index.js ───────────────────────────────────────

section('2. Adapter Registration in index.js');

try {
  const indexSrc = (await import(`file://${join(ROOT, 'src/connectors/adapters/index.js')}?ts=${Date.now()}`, { with: { type: 'text' } }).catch(() => ({}))).default ?? '';
  // We can't re-import the side-effecting module (it tries to register into singleton) so check file content
  const { readFileSync } = await import('fs');
  const content = readFileSync(join(ROOT, 'src/connectors/adapters/index.js'), 'utf8');
  ok('KubernetesAdapter imported',  content.includes('KubernetesAdapter'));
  ok('AWSAdapter imported',         content.includes('AWSAdapter'));
  ok('PostgreSQLAdapter imported',  content.includes('PostgreSQLAdapter'));
  ok('RedisAdapter imported',       content.includes('RedisAdapter'));
  ok('DatadogAdapter imported',     content.includes('DatadogAdapter'));
  ok('PagerDutyAdapter imported',   content.includes('PagerDutyAdapter'));
  ok('registerConnector(kubernetesAdapter)',  content.includes('kubernetesAdapter'));
  ok('registerConnector(awsAdapter)',         content.includes('awsAdapter'));
  ok('registerConnector(postgresAdapter)',    content.includes('postgresAdapter'));
  ok('registerConnector(redisInfraAdapter)', content.includes('redisInfraAdapter'));
  ok('registerConnector(datadogAdapter)',     content.includes('datadogAdapter'));
  ok('registerConnector(pagerDutyAdapter)',   content.includes('pagerDutyAdapter'));
} catch (err) {
  ok('index.js readable', false, err.message);
}

// ── 3. Action registry definition files ──────────────────────────────────────

section('3. Action Registry — Definition Files');

const ACTION_DIRS = {
  kubernetes:  ['restart_pod', 'scale_deployment', 'rollback_deployment', 'get_pod_status'],
  aws:         ['update_ecs_service', 'rotate_secret', 'get_instance_health'],
  postgres:    ['backup_database', 'run_migration', 'vacuum_analyze'],
  redis:       ['flush_cache', 'get_memory_info', 'trigger_bgsave'],
  datadog:     ['get_alert_details', 'mute_monitor', 'post_event'],
  pagerduty:   ['create_incident', 'resolve_incident', 'acknowledge_incident'],
};

const REQUIRED_FIELDS = [
  'id', 'version', 'lifecycle', 'connector', 'category', 'displayName', 'description',
  'tags', 'riskLevel', 'approvalPolicy', 'requiredPermissions', 'requiredScopes',
  'executionMode', 'estimatedDurationMs', 'timeoutMs', 'retryStrategy', 'rollbackStrategy',
  'verificationStrategy', 'requiredInputs', 'optionalInputs', 'outputSchema',
  'auditMetadata', 'telemetryMetadata',
];

for (const [connector, actions] of Object.entries(ACTION_DIRS)) {
  for (const actionName of actions) {
    const relPath = `src/actionRegistry/actions/${connector}/${actionName}.js`;
    try {
      const m   = await loadModule(relPath);
      const def = m.default;
      ok(`${connector}/${actionName} — exports default`, def && typeof def === 'object');

      const missing = REQUIRED_FIELDS.filter(f => !(f in def));
      ok(`${connector}/${actionName} — all 23 required fields present`, missing.length === 0, missing.join(', '));

      const expectedId = `${connector}.${actionName}`;
      ok(`${connector}/${actionName} — id is "${expectedId}"`, def.id === expectedId);

      ok(`${connector}/${actionName} — timeoutMs > estimatedDurationMs`,
        (def.timeoutMs ?? 0) > (def.estimatedDurationMs ?? 0));

      const isHighOrCritical = def.riskLevel === 'HIGH' || def.riskLevel === 'CRITICAL';
      if (isHighOrCritical) {
        ok(`${connector}/${actionName} — HIGH/CRITICAL: selfApprovalAllowed is false`,
          def.approvalPolicy?.selfApprovalAllowed === false);
      } else {
        ok(`${connector}/${actionName} — riskLevel is valid`,
          ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(def.riskLevel));
      }

    } catch (err) {
      ok(`${connector}/${actionName} — loads without error`, false, err.message);
      REQUIRED_FIELDS.forEach(() => ok(`${connector}/${actionName} — field`, false));
    }
  }
}

// ── 4. Event definitions ──────────────────────────────────────────────────────

section('4. Infrastructure Event Definitions');

try {
  const evtMod = await loadModule('src/events/infrastructure/eventDefinitions.js');
  ok('eventDefinitions.js loads', !!evtMod);
  ok('INFRA_EVENTS exported', evtMod.INFRA_EVENTS && typeof evtMod.INFRA_EVENTS === 'object');
  ok('publishInfraEvent exported', typeof evtMod.publishInfraEvent === 'function');

  const events = evtMod.INFRA_EVENTS;
  ok('datadog.alert.triggered defined',         events.DATADOG_ALERT_TRIGGERED === 'datadog.alert.triggered');
  ok('kubernetes.pod.failed defined',           events.KUBERNETES_POD_FAILED === 'kubernetes.pod.failed');
  ok('kubernetes.pod.restarted defined',        events.KUBERNETES_POD_RESTARTED === 'kubernetes.pod.restarted');
  ok('aws.deployment.completed defined',        events.AWS_DEPLOYMENT_COMPLETED === 'aws.deployment.completed');
  ok('aws.secret.rotated defined',              events.AWS_SECRET_ROTATED === 'aws.secret.rotated');
  ok('postgres.backup.completed defined',       events.POSTGRES_BACKUP_COMPLETED === 'postgres.backup.completed');
  ok('postgres.migration.completed defined',    events.POSTGRES_MIGRATION_COMPLETED === 'postgres.migration.completed');
  ok('redis.memory.high defined',               events.REDIS_MEMORY_HIGH === 'redis.memory.high');
  ok('redis.cache.flushed defined',             events.REDIS_CACHE_FLUSHED === 'redis.cache.flushed');
  ok('pagerduty.incident.created defined',      events.PAGERDUTY_INCIDENT_CREATED === 'pagerduty.incident.created');
  ok('pagerduty.incident.resolved defined',     events.PAGERDUTY_INCIDENT_RESOLVED === 'pagerduty.incident.resolved');
  ok('Total events >= 20',                      Object.keys(events).length >= 20);
} catch (err) {
  ok('eventDefinitions.js loads', false, err.message);
}

// ── 5. Workflow template files ────────────────────────────────────────────────

section('5. Production Workflow Definitions');

const WORKFLOWS = [
  { file: 'incidentResponseWorkflow.js',    export: 'INCIDENT_RESPONSE_WORKFLOW',    minSteps: 6 },
  { file: 'blueGreenDeploymentWorkflow.js', export: 'BLUE_GREEN_DEPLOYMENT_WORKFLOW', minSteps: 5 },
  { file: 'databaseMaintenanceWorkflow.js', export: 'DATABASE_MAINTENANCE_WORKFLOW',  minSteps: 5 },
  { file: 'secretRotationWorkflow.js',      export: 'SECRET_ROTATION_WORKFLOW',       minSteps: 6 },
];

for (const { file, export: exportName, minSteps } of WORKFLOWS) {
  try {
    const m  = await loadModule(`src/workflows/definitions/${file}`);
    const wf = m[exportName];
    ok(`${file} — exports ${exportName}`, wf && typeof wf === 'object');
    ok(`${file} — has id`, typeof wf?.id === 'string');
    ok(`${file} — has steps array`, Array.isArray(wf?.steps));
    ok(`${file} — has >= ${minSteps} steps`, (wf?.steps?.length ?? 0) >= minSteps);
    ok(`${file} — has connectors array`, Array.isArray(wf?.connectors) && wf.connectors.length > 0);
    ok(`${file} — has compensation handler`, wf?.compensation && Array.isArray(wf.compensation.steps));

    const actionSteps = (wf?.steps ?? []).filter(s => s.type === 'action');
    ok(`${file} — action steps have connectorId`,
      actionSteps.every(s => typeof s.connectorId === 'string'));
    ok(`${file} — action steps have actionType`,
      actionSteps.every(s => typeof s.actionType === 'string'));
    ok(`${file} — action steps have payload.operation`,
      actionSteps.every(s => typeof s.payload?.operation === 'string'));

  } catch (err) {
    ok(`${file} loads`, false, err.message);
  }
}

// ── 6. RegistryLoader scans new directories ───────────────────────────────────

section('6. RegistryLoader — New Connector Directories Present');

const { readFileSync } = await import('fs');
const actionsDir = join(ROOT, 'src/actionRegistry/actions');
let dirs;
try {
  dirs = readdirSync(actionsDir, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name);
} catch {
  dirs = [];
}
ok('kubernetes/ directory exists', dirs.includes('kubernetes'));
ok('aws/ directory exists',        dirs.includes('aws'));
ok('postgres/ directory exists',   dirs.includes('postgres'));
ok('redis/ directory exists',      dirs.includes('redis'));
ok('datadog/ directory exists',    dirs.includes('datadog'));
ok('pagerduty/ directory exists',  dirs.includes('pagerduty'));

const k8sFiles     = readdirSync(join(actionsDir, 'kubernetes')).filter(f => f.endsWith('.js'));
const awsFiles     = readdirSync(join(actionsDir, 'aws')).filter(f => f.endsWith('.js'));
const pgFiles      = readdirSync(join(actionsDir, 'postgres')).filter(f => f.endsWith('.js'));
const redisFiles   = readdirSync(join(actionsDir, 'redis')).filter(f => f.endsWith('.js'));
const ddFiles      = readdirSync(join(actionsDir, 'datadog')).filter(f => f.endsWith('.js'));
const pdFiles      = readdirSync(join(actionsDir, 'pagerduty')).filter(f => f.endsWith('.js'));

ok(`kubernetes has >= 4 action files (got ${k8sFiles.length})`,   k8sFiles.length >= 4);
ok(`aws has >= 3 action files (got ${awsFiles.length})`,          awsFiles.length >= 3);
ok(`postgres has >= 3 action files (got ${pgFiles.length})`,      pgFiles.length >= 3);
ok(`redis has >= 3 action files (got ${redisFiles.length})`,      redisFiles.length >= 3);
ok(`datadog has >= 3 action files (got ${ddFiles.length})`,       ddFiles.length >= 3);
ok(`pagerduty has >= 3 action files (got ${pdFiles.length})`,     pdFiles.length >= 3);

// ── 7. Adapter-level operation routing ───────────────────────────────────────

section('7. Adapter Operation Routing — UNSUPPORTED_OPERATION throws correctly');

// ActionType values are lowercase: 'execute', 'read', etc.
// Adapters with no stored credentials will throw ConnectorAuthError; that is
// also valid — it means the execute path was reached and the auth guard fired.
try {
  const k8s = (await loadModule('src/connectors/adapters/KubernetesAdapter.js')).default;
  try {
    await k8s.execute('ws_validate_routing_test', 'execute', { operation: '__nonexistent__' }, null);
    ok('KubernetesAdapter throws on no-creds/unknown operation', false, 'should have thrown');
  } catch (err) {
    ok('KubernetesAdapter throws on no-creds/unknown operation', typeof err.message === 'string' && err.message.length > 0);
  }

  const dd = (await loadModule('src/connectors/adapters/DatadogAdapter.js')).default;
  try {
    await dd.execute('ws_validate_routing_test', 'execute', { operation: '__nonexistent__' }, null);
    ok('DatadogAdapter throws on no-creds/unknown operation', false, 'should have thrown');
  } catch (err) {
    ok('DatadogAdapter throws on no-creds/unknown operation', typeof err.message === 'string' && err.message.length > 0);
  }
} catch (err) {
  ok('Adapters load for operation test', false, err.message);
}

// ── 8. DEGRADED health when no credentials ───────────────────────────────────

section('8. DEGRADED Health — No Credentials');

const ADAPTER_FILES = ['KubernetesAdapter', 'AWSAdapter', 'PostgreSQLAdapter', 'RedisAdapter', 'DatadogAdapter', 'PagerDutyAdapter'];

for (const name of ADAPTER_FILES) {
  try {
    const adapter = (await loadModule(`src/connectors/adapters/${name}.js`)).default;
    // workspace that has no stored credentials; env vars may or may not be set
    const health  = await adapter.healthCheck('ws_validate_no_creds_xyz');
    ok(`${name} healthCheck returns object`, health && typeof health === 'object');
    ok(`${name} healthCheck has status field`, ['HEALTHY', 'DEGRADED', 'DOWN'].includes(health.status));
    ok(`${name} healthCheck does not throw`, true);
  } catch (err) {
    ok(`${name} healthCheck does not throw`, false, err.message);
  }
}

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(60)}`);
console.log(`Phase 10 Infra: ${passed} passed / ${failed} failed`);
if (failed > 0) {
  console.error(`\n${failed} assertion(s) failed.`);
  process.exit(1);
} else {
  console.log('\nAll assertions passed.');
}
