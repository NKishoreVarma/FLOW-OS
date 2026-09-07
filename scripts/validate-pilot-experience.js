/**
 * Validation harness — Phase 17 Pilot Experience (M1 backend).
 *   node scripts/validate-pilot-experience.js
 *
 * Deterministic. Verifies the onboarding state machine (Redis), the discovery
 * orchestrator (demo catalog shape), and the hybrid Success/Value aggregator (measured
 * counts from real records + transparently labeled estimates), plus the honest-empty
 * case. Seeds throwaway records and tears everything down.
 */

import { randomUUID } from 'node:crypto';
import redis from '../src/config/redis.js';
import { prisma } from '../src/core/config/prisma.js';
import { getState, setState, markComplete, reset } from '../src/onboarding/onboardingState.js';
import { discover } from '../src/onboarding/discoveryOrchestrator.js';
import { getWeeklySummary } from '../src/success/successMetrics.js';
import { getAdoptionMetrics } from '../src/onboarding/adoptionMetrics.js';

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log(`  ✅ ${n}`); } else { fail++; console.log(`  ❌ ${n}`); } };

const suffix = randomUUID().slice(0, 8);
const orgId = `pilot-org-${suffix}`;
const wsId = `pilot-ws-${suffix}`;
const userId = `pilot-user-${suffix}`;

async function main() {
  console.log('\n🚀 Phase 17 — Pilot Experience (M1) validation\n');

  // ── 1. Onboarding state machine (Redis) ─────────────────────────────────────────
  console.log('1. Onboarding state machine');
  await reset(wsId);
  const s0 = await getState(wsId);
  ok('fresh workspace starts at welcome, not completed', s0.step === 'welcome' && s0.completed === false);
  await setState(wsId, { step: 'permissions', mode: 'demo', discovery: { totals: { resources: 7 } } });
  const s1 = await getState(wsId);
  ok('state persists across reads (step + mode + discovery)', s1.step === 'permissions' && s1.mode === 'demo' && s1.discovery?.totals?.resources === 7);
  const s2 = await markComplete(wsId);
  ok('markComplete flips the first-run gate', s2.completed === true && !!s2.completedAt && s2.step === 'ready');
  await reset(wsId);
  ok('reset clears state back to welcome', (await getState(wsId)).step === 'welcome');

  // ── 2. Discovery orchestrator (demo catalog) ────────────────────────────────────
  console.log('2. Workspace discovery (demo)');
  const d = await discover(wsId, { mode: 'demo', connectors: ['github', 'slack', 'gmail', 'google-calendar', 'notion', 'jira'] });
  const byC = Object.fromEntries(d.connectors.map((c) => [c.connector, c]));
  ok('discovers 6 repositories', byC.github?.count === 6);
  ok('discovers 14 slack channels', byC.slack?.count === 14);
  ok('discovers 2 calendars', byC['google-calendar']?.count === 2);
  ok('discovers notion spaces', byC.notion?.count >= 3);
  ok('surfaces 42 employees at org level', d.org?.employees === 42);
  ok('every resource carries key/name/type + recommended flag', d.connectors.every((c) => c.resources.every((r) => r.key && r.name && r.type && 'recommended' in r)));
  ok('totals reflect discovered resources', d.totals.resources > 20 && d.totals.connectors === 6);

  // ── 3. Success aggregator — honest empty ────────────────────────────────────────
  console.log('3. Success metrics — empty workspace is honest');
  await prisma.organization.create({ data: { id: orgId, name: `Pilot ${suffix}`, slug: `pilot-${suffix}`, plan: 'pro' } });
  await prisma.workspace.create({ data: { id: wsId, name: 'Pilot Co', orgId, externalId: wsId } });
  await prisma.user.create({ data: { id: userId, email: `owner-${suffix}@pilot.test`, passwordHash: 'x', fullName: 'Rahul', role: 'OWNER', orgId } });
  const empty = await getWeeklySummary(wsId, { sinceDays: 7 });
  ok('empty workspace → 0 time saved (no magical numbers)', empty.timeSavedHours === 0);
  ok('empty tasks completed is 0', empty.headline.find((m) => m.key === 'tasksCompleted').value === 0);

  // ── 4. Success aggregator — measured counts + labeled estimates ─────────────────
  console.log('4. Success metrics — hybrid counts');
  await prisma.executionRecord.createMany({ data: [
    { orgId, workspaceId: wsId, connector: 'gmail', actionType: 'reply', riskLevel: 'HIGH', status: 'EXECUTED' },
    { orgId, workspaceId: wsId, connector: 'gmail', actionType: 'draft', riskLevel: 'LOW', status: 'EXECUTED' },
    { orgId, workspaceId: wsId, connector: 'github', actionType: 'merge', riskLevel: 'HIGH', status: 'EXECUTED' },
    { orgId, workspaceId: wsId, connector: 'jira', actionType: 'create_issue', riskLevel: 'MEDIUM', status: 'EXECUTED' },
    { orgId, workspaceId: wsId, connector: 'github', actionType: 'comment', riskLevel: 'LOW', status: 'FAILED' }, // not counted
  ] });
  await prisma.notification.createMany({ data: [
    { orgId, workspaceId: wsId, type: 'MERGE_CONFLICT', title: 'conflict', recipients: ['rahul'] },
    { orgId, workspaceId: wsId, type: 'INCIDENT', title: 'incident', recipients: ['rahul'] },
    { orgId, workspaceId: wsId, type: 'RISK', title: 'renewal', recipients: ['rahul'] },
  ] });
  await prisma.pendingApproval.create({ data: { orgId, workspaceId: wsId, requesterId: userId, connectorId: 'github', capability: 'ENGINEERING', actionType: 'merge', status: 'EXECUTED', riskLevel: 'HIGH', payloadRef: {} } });

  const sum = await getWeeklySummary(wsId, { sinceDays: 7 });
  const m = Object.fromEntries([...sum.headline, ...sum.detail].map((x) => [x.key, x]));
  ok('tasksCompleted counts only EXECUTED (4, not the FAILED one)', m.tasksCompleted.value === 4);
  ok('emailsDrafted counts gmail draft/reply (2)', m.emailsDrafted.value === 2);
  ok('mergeConflictsResolved counts merge executions (1)', m.mergeConflictsResolved.value === 1);
  ok('jiraIssuesCreated counts jira executions (1)', m.jiraIssuesCreated.value === 1);
  ok('approvalsExecuted counts EXECUTED approvals (1)', m.approvalsExecuted.value === 1);
  ok('measured metrics are labeled basis=measured', m.tasksCompleted.basis === 'measured' && m.emailsDrafted.basis === 'measured');
  ok('Time Saved is labeled basis=estimated', m.timeSaved.basis === 'estimated');
  ok('Time Saved is derived + non-zero once work exists', sum.timeSavedHours > 0);
  ok('Context Switches = notifications + approvals + tasks (estimated)', m.contextSwitches.basis === 'estimated' && m.contextSwitches.value === 3 + 1 + 4);
  ok('model discloses the estimate basis (transparency)', !!sum.model?.minutesPer && !!sum.model?.note);

  // ── 5. Adoption metrics — measure OUTCOMES (Track 10) ───────────────────────────
  console.log('5. Adoption metrics (measure success)');
  await setState(wsId, { startedAt: new Date(Date.now() - 6 * 60000).toISOString(), mode: 'demo', permissionsConfigured: true, discovery: { totals: { connectors: 6, resources: 34 } } });
  await markComplete(wsId);
  const adopt = await getAdoptionMetrics(wsId);
  ok('onboarding measured as completed', adopt.onboarding.completed === true);
  ok('time-to-complete onboarding is measured (~6 min)', adopt.onboarding.timeToCompleteMinutes >= 5);
  ok('connectors discovered reflected (6)', adopt.adoption.connectorsDiscovered === 6);
  ok('work completed inside FLOW = tasks + approvals (5)', adopt.adoption.workCompletedInFlow === 5);
  ok('time saved surfaces in adoption metrics', adopt.adoption.timeSavedHours > 0);
}

async function cleanup() {
  try {
    await reset(wsId);
    await prisma.executionRecord.deleteMany({ where: { workspaceId: wsId } });
    await prisma.notification.deleteMany({ where: { workspaceId: wsId } });
    await prisma.pendingApproval.deleteMany({ where: { workspaceId: wsId } });
    await prisma.workspace.delete({ where: { id: wsId } }).catch(() => {});
    await prisma.user.delete({ where: { id: userId } }).catch(() => {});
    await prisma.organization.delete({ where: { id: orgId } }).catch(() => {});
  } catch (e) { console.log(`  (cleanup warning: ${e.message})`); }
}

main()
  .catch((e) => { fail++; console.error('\n💥', e); })
  .finally(async () => {
    await cleanup();
    console.log(`\n${'─'.repeat(48)}\n${fail === 0 ? '✅' : '❌'} ${pass}/${pass + fail} passed${fail ? `, ${fail} failed` : ''}\n`);
    await prisma.$disconnect().catch(() => {});
    redis.disconnect?.();
    process.exit(fail === 0 ? 0 : 1);
  });
