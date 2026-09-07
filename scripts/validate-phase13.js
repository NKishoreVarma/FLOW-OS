#!/usr/bin/env node
/**
 * validate-phase13.js — Phase 13 Autonomous Enterprise Engine
 *
 * Validates all 14 modules without requiring a live server or database.
 * Run: node scripts/validate-phase13.js
 */

import { readFileSync, existsSync }  from 'fs';
import { resolve, dirname }          from 'path';
import { fileURLToPath }             from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const root  = resolve(__dir, '..');

let passed = 0;
let failed = 0;

function ok(label) {
  console.log(`  ✓ ${label}`);
  passed++;
}
function fail(label, reason = '') {
  console.error(`  ✗ ${label}${reason ? ` — ${reason}` : ''}`);
  failed++;
}
function section(title) {
  console.log(`\n${title}`);
}

function fileExists(rel) {
  return existsSync(resolve(root, rel));
}

function fileContains(rel, ...strings) {
  const content = readFileSync(resolve(root, rel), 'utf8');
  return strings.every(s => content.includes(s));
}

function readFile(rel) {
  return readFileSync(resolve(root, rel), 'utf8');
}

// ── Section 1: Migration SQL ──────────────────────────────────────────────────
section('1. Migration SQL');

const migPath = 'scripts/migrate-autonomy-v13.sql';
if (fileExists(migPath)) {
  ok('migrate-autonomy-v13.sql exists');
  const sql = readFile(migPath);
  for (const table of ['autonomy_goals', 'autonomy_opportunities', 'autonomy_learning_records', 'autonomy_policies', 'autonomy_runs']) {
    if (sql.includes(`CREATE TABLE IF NOT EXISTS ${table}`)) ok(`${table} table defined`);
    else fail(`${table} table missing`);
  }
  if (sql.includes('autonomy_level BETWEEN 0 AND 5')) ok('autonomy_level constraint (0-5)');
  else fail('autonomy_level constraint missing');
  if (sql.includes('COALESCE(scope_id')) ok('unique index uses COALESCE on scope_id');
  else fail('unique index COALESCE missing');
} else {
  fail('migrate-autonomy-v13.sql missing');
}

// ── Section 2: OrganizationStateCollector (Module 2) ─────────────────────────
section('2. OrganizationStateCollector (Module 2)');

const oscPath = 'src/autonomy/OrganizationStateCollector.js';
if (fileExists(oscPath)) {
  ok('OrganizationStateCollector.js exists');
  const src = readFile(oscPath);
  if (src.includes('export async function collectOrganizationState')) ok('collectOrganizationState exported');
  else fail('collectOrganizationState not exported');
  if (src.includes('Promise.all')) ok('parallel collection with Promise.all');
  else fail('Promise.all not used');
  const collectors = ['workflowHistory','kgStats','executionMetrics','recentEvents','connectorState',
    'healthScore','incidents','predictions','teamWorkload','infraHealth',
    'calendarContext','customerSignals','budgetSignals','knowledgeSilos'];
  const missing = collectors.filter(c => !src.includes(c));
  if (missing.length === 0) ok(`all ${collectors.length} collectors present`);
  else fail(`missing collectors: ${missing.join(', ')}`);
  if (src.includes('SAFE')) ok('SAFE best-effort wrapper present');
  else fail('SAFE wrapper missing');
} else {
  fail('OrganizationStateCollector.js missing');
}

// ── Section 3: GoalEngine (Module 3) ─────────────────────────────────────────
section('3. GoalEngine (Module 3)');

const gePath = 'src/autonomy/GoalEngine.js';
if (fileExists(gePath)) {
  ok('GoalEngine.js exists');
  const src = readFile(gePath);
  for (const fn of ['createGoal','listGoals','getGoal','updateGoal','deleteGoal','evaluateGoals','getGoalGaps']) {
    if (src.includes(`export async function ${fn}`) || src.includes(`export function ${fn}`))
      ok(`${fn} exported`);
    else fail(`${fn} not exported`);
  }
  if (src.includes('GoalStatus') && src.includes('GoalCategory') && src.includes('GoalPriority'))
    ok('GoalStatus, GoalCategory, GoalPriority enums exported');
  else fail('enum exports missing');
  for (const cat of ['engineering','infrastructure','security','hr','sales']) {
    if (src.includes(`case '${cat}'`)) ok(`category-specific evaluation: ${cat}`);
    else fail(`missing category eval: ${cat}`);
  }
} else {
  fail('GoalEngine.js missing');
}

// ── Section 4: OpportunityEngine (Module 4) ───────────────────────────────────
section('4. OpportunityEngine (Module 4)');

const oePath = 'src/autonomy/OpportunityEngine.js';
if (fileExists(oePath)) {
  ok('OpportunityEngine.js exists');
  const src = readFile(oePath);
  for (const fn of ['discoverOpportunities','saveOpportunities','listOpportunities','updateOpportunityStatus']) {
    if (src.includes(`export async function ${fn}`) || src.includes(`export function ${fn}`))
      ok(`${fn} exported`);
    else fail(`${fn} not exported`);
  }
  const categories = ['AUTOMATION','COST','RELIABILITY','PRODUCTIVITY','QUALITY','SECURITY','KNOWLEDGE','COLLABORATION'];
  const missing = categories.filter(c => !src.includes(c));
  if (missing.length === 0) ok(`all ${categories.length} opportunity categories present`);
  else fail(`missing categories: ${missing.join(', ')}`);
  const matcherCount = (src.match(/_match|_detect|_find|async function _|const _match|_idle|_high|_bottleneck|_large|_overload|_at_risk|_silo|_calendar|_infra|_cost/g) ?? []).length;
  if (matcherCount >= 5) ok('at least 5 discovery matchers');
  else {
    const arrowMatchers = (src.match(/=> \{[\s\S]*?category:/g) ?? []).length;
    if (arrowMatchers >= 5 || src.split('category:').length - 1 >= 5) ok('at least 5 discovery matchers (arrow style)');
    else fail('fewer than 5 discovery matchers');
  }
} else {
  fail('OpportunityEngine.js missing');
}

// ── Section 5: PredictiveEngine (Module 5) ────────────────────────────────────
section('5. PredictiveEngine (Module 5)');

const pePath = 'src/autonomy/PredictiveEngine.js';
if (fileExists(pePath)) {
  ok('PredictiveEngine.js exists');
  const src = readFile(pePath);
  for (const fn of ['runPredictions','getPredictionsForDomain']) {
    if (src.includes(`export async function ${fn}`)) ok(`${fn} exported`);
    else fail(`${fn} not exported`);
  }
  const types = ['RELEASE_FAILURE','DEPLOYMENT_RISK','INCIDENT_PROBABILITY','APPROVAL_DELAY',
    'BUDGET_OVERRUN','CAPACITY_SHORTAGE','KNOWLEDGE_SILO','CHURN_SIGNAL','BURNOUT_RISK','SLA_VIOLATION'];
  const missing = types.filter(t => !src.includes(t));
  if (missing.length === 0) ok(`all ${types.length} autonomy prediction types present`);
  else fail(`missing prediction types: ${missing.join(', ')}`);
  if (src.includes("from '../predictions/PredictionEngine.js'")) ok('wraps existing PredictionEngine');
  else fail('does not import from PredictionEngine');
} else {
  fail('PredictiveEngine.js missing');
}

// ── Section 6: ContinuousPlanner (Module 6) ───────────────────────────────────
section('6. ContinuousPlanner (Module 6)');

const cpPath = 'src/autonomy/ContinuousPlanner.js';
if (fileExists(cpPath)) {
  ok('ContinuousPlanner.js exists');
  const src = readFile(cpPath);
  if (src.includes('export async function runPlanningCycle')) ok('runPlanningCycle exported');
  else fail('runPlanningCycle not exported');
  if (src.includes('startExecutionWithPlan')) ok('uses startExecutionWithPlan (not executeAction)');
  else fail('does not use startExecutionWithPlan');
  if (!src.includes('executeAction(')) ok('does not call executeAction directly');
  else fail('calls executeAction directly — violates invariant');
  const stages = ['collect','agents','goals','predictions','opportunities','rank','generate','submit'];
  const missing = stages.filter(s => !src.includes(s));
  if (missing.length === 0) ok('all planning stages referenced');
  else fail(`missing stages: ${missing.join(', ')}`);
  if (src.includes('runCognitivePipeline')) ok('uses cognitive agents (runCognitivePipeline)');
  else fail('does not use runCognitivePipeline');
} else {
  fail('ContinuousPlanner.js missing');
}

// ── Section 7: LearningEngine (Module 7) ──────────────────────────────────────
section('7. LearningEngine (Module 7)');

const lePath = 'src/autonomy/LearningEngine.js';
if (fileExists(lePath)) {
  ok('LearningEngine.js exists');
  const src = readFile(lePath);
  for (const fn of ['recordRecommendation','recordDecision','recordOutcome','getTypeConfidence','getLearningStats','listLearningRecords']) {
    if (src.includes(`export async function ${fn}`) || src.includes(`export function ${fn}`))
      ok(`${fn} exported`);
    else fail(`${fn} not exported`);
  }
  if (src.includes('Decision') && src.includes('Outcome')) ok('Decision and Outcome enums exported');
  else fail('enums missing');
  if (src.includes('_recalibrate')) ok('confidence recalibration function present');
  else fail('confidence recalibration missing');
  if (src.includes('ACCEPTED') && src.includes('SUCCESS') && src.includes('FAILURE'))
    ok('positive/negative reinforcement implemented');
  else fail('reinforcement logic missing');
} else {
  fail('LearningEngine.js missing');
}

// ── Section 8: OptimizationEngine (Module 8) ──────────────────────────────────
section('8. OptimizationEngine (Module 8)');

const optPath = 'src/autonomy/OptimizationEngine.js';
if (fileExists(optPath)) {
  ok('OptimizationEngine.js exists');
  const src = readFile(optPath);
  if (src.includes('export async function runOptimization')) ok('runOptimization exported');
  else fail('runOptimization not exported');
  if (src.includes('export async function getImprovementMetrics')) ok('getImprovementMetrics exported');
  else fail('getImprovementMetrics not exported');
  const domains = ['workflow','approvals','timing','retry','resources'];
  const missing = domains.filter(d => !src.includes(d));
  if (missing.length === 0) ok(`all ${domains.length} optimization domains present`);
  else fail(`missing domains: ${missing.join(', ')}`);
} else {
  fail('OptimizationEngine.js missing');
}

// ── Section 9: AutonomyPolicyEngine (Module 9) ────────────────────────────────
section('9. AutonomyPolicyEngine (Module 9)');

const apePath = 'src/autonomy/AutonomyPolicyEngine.js';
if (fileExists(apePath)) {
  ok('AutonomyPolicyEngine.js exists');
  const src = readFile(apePath);
  for (const fn of ['createPolicy','listPolicies','getPolicy','updatePolicy','deletePolicy',
      'resolvePolicy','canExecuteAutonomously','ensureDefaultPolicy']) {
    if (src.includes(`export async function ${fn}`) || src.includes(`export function ${fn}`))
      ok(`${fn} exported`);
    else fail(`${fn} not exported`);
  }
  if (src.includes('AUTONOMY_LEVELS')) ok('AUTONOMY_LEVELS enum exported');
  else fail('AUTONOMY_LEVELS missing');
  for (let i = 0; i <= 5; i++) {
    if (src.includes(`${i}:`)) ok(`level ${i} defined`);
    else fail(`level ${i} missing`);
  }
  if (src.includes('RISK_AUTO_THRESHOLD')) ok('risk-to-level mapping present');
  else fail('RISK_AUTO_THRESHOLD missing');
} else {
  fail('AutonomyPolicyEngine.js missing');
}

// ── Section 10: DecisionEngine (Module 10) ────────────────────────────────────
section('10. DecisionEngine (Module 10)');

const dePath = 'src/autonomy/DecisionEngine.js';
if (fileExists(dePath)) {
  ok('DecisionEngine.js exists');
  const src = readFile(dePath);
  if (src.includes('export async function buildDecisionQueue')) ok('buildDecisionQueue exported');
  else fail('buildDecisionQueue not exported');
  if (src.includes('export async function scoreCandidate')) ok('scoreCandidate exported');
  else fail('scoreCandidate not exported');
  const factors = ['valueScore','priorityScore','confidenceScore','urgencyScore',
    'goalAlignment','riskPenalty','predBoost','depPenalty','costPenalty'];
  const missing = factors.filter(f => !src.includes(f));
  if (missing.length === 0) ok(`all ${factors.length} scoring factors present`);
  else fail(`missing factors: ${missing.join(', ')}`);
  if (src.includes('AUTO_EXECUTE') && src.includes('REQUIRE_APPROVAL') && src.includes('DEFER') && src.includes('BLOCK'))
    ok('all 4 decision outcomes (AUTO_EXECUTE / REQUIRE_APPROVAL / DEFER / BLOCK)');
  else fail('decision outcomes incomplete');
} else {
  fail('DecisionEngine.js missing');
}

// ── Section 11: ExecutionMonitor (Module 11) ──────────────────────────────────
section('11. ExecutionMonitor (Module 11)');

const emPath = 'src/autonomy/ExecutionMonitor.js';
if (fileExists(emPath)) {
  ok('ExecutionMonitor.js exists');
  const src = readFile(emPath);
  for (const fn of ['runMonitorTick','getMonitorStatus','pauseAutonomousExecution',
      'resumeAutonomousExecution','cancelAutonomousExecution']) {
    if (src.includes(`export async function ${fn}`) || src.includes(`export function ${fn}`))
      ok(`${fn} exported`);
    else fail(`${fn} not exported`);
  }
  if (src.includes('MAX_AUTO_RETRIES')) ok('MAX_AUTO_RETRIES constant defined');
  else fail('MAX_AUTO_RETRIES missing');
  if (src.includes('_autoRetry') && src.includes('_escalate') && src.includes('_handleStaleExecution'))
    ok('retry/escalate/stale handlers present');
  else fail('handler functions missing');
  if (src.includes('APPROVAL_WAIT_MS') && src.includes('STALE_RUNNING_MS'))
    ok('timeout thresholds defined');
  else fail('timeout thresholds missing');
} else {
  fail('ExecutionMonitor.js missing');
}

// ── Section 12: REST Routes (Module 12) ────────────────────────────────────────
section('12. REST Routes — /api/autonomy (Module 12)');

const routePath = 'src/routes/autonomyRoutes.js';
if (fileExists(routePath)) {
  ok('autonomyRoutes.js exists');
  const src = readFile(routePath);
  const routes = [
    ['/status',        'get'],
    ['/start',         'post'],
    ['/stop',          'post'],
    ['/pause',         'post'],
    ['/resume',        'post'],
    ['/cycle',         'post'],
    ['/queue',         'get'],
    ['/runs',          'get'],
    ['/metrics',       'get'],
    ['/goals',         'get'],
    ['/goals',         'post'],
    ['/opportunities', 'get'],
    ['/policies',      'get'],
    ['/policies',      'post'],
    ['/executions',    'get'],
  ];
  for (const [path, method] of routes) {
    if (src.includes(`router.${method}('${path}'`)) ok(`${method.toUpperCase()} ${path}`);
    else fail(`${method.toUpperCase()} ${path} missing`);
  }
  if (src.includes("router.post('/executions/:id/pause'") &&
      src.includes("router.post('/executions/:id/resume'") &&
      src.includes("router.post('/executions/:id/cancel'"))
    ok('execution lifecycle routes (pause/resume/cancel)');
  else fail('execution lifecycle routes missing');
} else {
  fail('autonomyRoutes.js missing');
}

// ── Section 13: AutonomyMetrics (Module 13) ────────────────────────────────────
section('13. AutonomyMetrics (Module 13)');

const amPath = 'src/autonomy/AutonomyMetrics.js';
if (fileExists(amPath)) {
  ok('AutonomyMetrics.js exists');
  const src = readFile(amPath);
  const metrics = [
    'recommendations_generated','recommendations_accepted','recommendations_dismissed',
    'workflows_executed','workflows_succeeded','workflow_success_rate',
    'predictions_generated','prediction_accuracy','goals_completed',
    'cost_savings_usd','time_saved_minutes','approval_latency_avg_ms','learning_accuracy',
  ];
  const missing = metrics.filter(m => !src.includes(m));
  if (missing.length === 0) ok(`all 13 metric types present`);
  else fail(`missing metrics: ${missing.join(', ')}`);
  if (src.includes('export async function collectMetrics')) ok('collectMetrics exported');
  else fail('collectMetrics not exported');
  if (src.includes('export async function getMetricsSummary')) ok('getMetricsSummary exported');
  else fail('getMetricsSummary not exported');
} else {
  fail('AutonomyMetrics.js missing');
}

// ── Section 14: AutonomyEngine (Module 1) + server wiring ─────────────────────
section('14. AutonomyEngine (Module 1) + Server Wiring');

const aePath = 'src/autonomy/AutonomyEngine.js';
if (fileExists(aePath)) {
  ok('AutonomyEngine.js exists');
  const src = readFile(aePath);
  for (const fn of ['startEngine','stopEngine','pauseEngine','resumeEngine',
      'triggerCycle','getHealth','getMetrics','listRuns','startAutonomyEngine']) {
    if (src.includes(`export async function ${fn}`) || src.includes(`export function ${fn}`))
      ok(`${fn} exported`);
    else fail(`${fn} not exported`);
  }
  if (src.includes('_engines') && src.includes('new Map()')) ok('per-workspace engine state Map');
  else fail('engine state Map missing');
  if (src.includes('autonomy_runs')) ok('autonomy_runs table used for persistence');
  else fail('autonomy_runs table not used');
  if (src.includes('runMonitorTick')) ok('monitor ticking inside engine');
  else fail('runMonitorTick not called from engine');
} else {
  fail('AutonomyEngine.js missing');
}

const idxPath = 'src/autonomy/index.js';
if (fileExists(idxPath)) {
  ok('autonomy/index.js exists');
  const src = readFile(idxPath);
  if (src.includes('startAutonomyEngine')) ok('startAutonomyEngine exported from index');
  else fail('startAutonomyEngine not in index');
} else {
  fail('autonomy/index.js missing');
}

const serverSrc = readFile('src/server.js');
if (serverSrc.includes("import autonomyRoutes from './routes/autonomyRoutes.js'"))
  ok('autonomyRoutes imported in server.js');
else fail('autonomyRoutes not imported');

if (serverSrc.includes("app.use('/api/autonomy', autonomyRoutes)"))
  ok('/api/autonomy mounted in server.js');
else fail('/api/autonomy not mounted');

if (serverSrc.includes('startAutonomyEngine'))
  ok('startAutonomyEngine called at server boot');
else fail('startAutonomyEngine not called at boot');

// ── Invariant checks ──────────────────────────────────────────────────────────
section('15. Invariant checks');

const plannerSrc = fileExists(cpPath) ? readFile(cpPath) : '';
if (!plannerSrc.includes('executeAction('))
  ok('ContinuousPlanner never calls executeAction()');
else fail('ContinuousPlanner violates invariant — calls executeAction()');

if (plannerSrc.includes('startExecutionWithPlan'))
  ok('ContinuousPlanner uses startExecutionWithPlan for all execution');
else fail('ContinuousPlanner missing startExecutionWithPlan');

const monitorSrc = fileExists(emPath) ? readFile(emPath) : '';
if (!monitorSrc.includes('executeAction('))
  ok('ExecutionMonitor never calls executeAction()');
else fail('ExecutionMonitor violates invariant — calls executeAction()');

const engineSrc = fileExists(aePath) ? readFile(aePath) : '';
if (!engineSrc.includes('executeAction('))
  ok('AutonomyEngine never calls executeAction()');
else fail('AutonomyEngine violates invariant — calls executeAction()');

const policyEngineSrc = fileExists(apePath) ? readFile(apePath) : '';
if (!policyEngineSrc.includes('governanceMiddleware') && !policyEngineSrc.includes('evaluate('))
  ok('AutonomyPolicyEngine is separate from governance policy engine');
else fail('AutonomyPolicyEngine confused with governance policy engine');

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(60)}`);
console.log(`Phase 13 Autonomy: ${passed} passed / ${failed} failed`);
if (failed === 0) {
  console.log('\nAll assertions passed.');
  process.exit(0);
} else {
  console.error(`\n${failed} assertion(s) failed.`);
  process.exit(1);
}
