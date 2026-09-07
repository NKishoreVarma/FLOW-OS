/**
 * Validation harness — Phase 14 M1 Operational Execution Engine.
 *
 *   node scripts/validate-execution-engine.js
 *
 * Covers: risk classification, gate decisions, plan dry-run, tiered two-person
 * approval with distinct-approver + self-approval enforcement, and execution history.
 * Seeds a throwaway org + users, then cleans up.
 */

import '../src/connectors/adapters/index.js'; // register connectors for dry-run
import { classifyAction, RiskLevel } from '../src/execution/riskClassifier.js';
import { decideGate, Gate } from '../src/execution/approvalEngine.js';
import { buildPlan } from '../src/execution/actionPlanner.js';
import { dryRun } from '../src/execution/executionPlanner.js';
import { createTieredApproval, castApprovalVote, getApproval } from '../src/core/governance/approvalStore.js';
import { createExecutionRecord, markRecordExecuted, listExecutionRecords } from '../src/execution/executionHistory.js';
import { prisma } from '../src/core/config/prisma.js';

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log(`  ✅ ${name}`); } else { fail++; console.log(`  ❌ ${name}`); } };

async function main() {
  console.log('\n⚙️  Phase 14 M1 — Execution Engine validation\n');

  // ── 1. Risk classification ──────────────────────────────────────────────────
  console.log('1. Risk classification');
  ok('read → LOW',                 classifyAction({ actionType: 'read' }).level === RiskLevel.LOW);
  ok('comment → LOW',              classifyAction({ actionType: 'comment' }).level === RiskLevel.LOW);
  ok('create → MEDIUM',            classifyAction({ actionType: 'create' }).level === RiskLevel.MEDIUM);
  ok('merge → HIGH',               classifyAction({ actionType: 'merge' }).level === RiskLevel.HIGH);
  ok('send → HIGH',                classifyAction({ actionType: 'send' }).level === RiskLevel.HIGH);
  ok('delete → CRITICAL',          classifyAction({ actionType: 'delete' }).level === RiskLevel.CRITICAL);
  ok('merge→main escalates CRITICAL', classifyAction({ actionType: 'merge', payload: { base: 'main' } }).level === RiskLevel.CRITICAL);
  ok('bulk escalates CRITICAL',    classifyAction({ actionType: 'update', payload: { bulk: true } }).level === RiskLevel.CRITICAL);

  // ── 2. Gate decisions ───────────────────────────────────────────────────────
  console.log('2. Approval gates');
  ok('LOW → AUTO',            decideGate(RiskLevel.LOW).gate === Gate.AUTO);
  ok('MEDIUM → CONFIRM',      decideGate(RiskLevel.MEDIUM).gate === Gate.CONFIRM);
  ok('HIGH → APPROVAL x1',    decideGate(RiskLevel.HIGH).gate === Gate.APPROVAL && decideGate(RiskLevel.HIGH).requiredApprovals === 1);
  ok('CRITICAL → APPROVAL x2', decideGate(RiskLevel.CRITICAL).gate === Gate.APPROVAL && decideGate(RiskLevel.CRITICAL).requiredApprovals === 2);

  // ── 3. Plan dry-run ─────────────────────────────────────────────────────────
  console.log('3. Plan dry-run');
  const plan = buildPlan({ connector: 'github', actionType: 'merge', payload: { base: 'main' }, title: 'Merge PR #421' });
  ok('buildPlan produces a step', plan.steps.length === 1);
  const preview = dryRun('workspace_validate', plan);
  ok('dry-run classifies plan risk CRITICAL', preview.planRisk === RiskLevel.CRITICAL);
  ok('dry-run resolves a gate', preview.steps[0].gate === Gate.APPROVAL);

  // ── 4. Two-person tiered approval ──────────────────────────────────────────
  console.log('4. Tiered two-person approval (DB)');
  const suffix = Date.now();
  const org = await prisma.organization.create({ data: { name: `ExecVal ${suffix}`, slug: `execval-${suffix}` } });
  const mk = (r, n) => prisma.user.create({ data: { email: `${n}-${suffix}@val.local`, passwordHash: 'x', fullName: n, role: r, orgId: org.id } });
  const requester = await mk('MEMBER', 'requester');
  const approverA = await mk('ADMIN', 'approverA');
  const approverB = await mk('ADMIN', 'approverB');
  const wsId = `workspace_execval_${suffix}`;

  const approval = await createTieredApproval({
    orgId: org.id, workspaceId: wsId, requesterId: requester.id, connectorId: 'github',
    capability: 'ENGINEERING', actionType: 'merge', payload: { number: 421, base: 'main' },
    riskLevel: RiskLevel.CRITICAL, requiredApprovals: 2,
  });
  ok('creates CRITICAL approval requiring 2', approval.requiredApprovals === 2);

  let selfBlocked = false;
  try { await castApprovalVote(approval.id, org.id, requester.id); } catch { selfBlocked = true; }
  ok('self-approval rejected', selfBlocked);

  const v1 = await castApprovalVote(approval.id, org.id, approverA.id);
  ok('first distinct vote → not yet satisfied', v1.satisfied === false && v1.approval.status === 'PENDING');

  let dupBlocked = false;
  try { await castApprovalVote(approval.id, org.id, approverA.id); } catch { dupBlocked = true; }
  ok('duplicate vote from same approver rejected', dupBlocked);

  const v2 = await castApprovalVote(approval.id, org.id, approverB.id);
  ok('second distinct vote → APPROVED', v2.satisfied === true && v2.approval.status === 'APPROVED');
  const fresh = await getApproval(approval.id, org.id);
  ok('two distinct approvers recorded', (fresh.approvalVotes || []).length === 2);

  // ── 5. Execution history ────────────────────────────────────────────────────
  console.log('5. Execution history');
  const rec = await createExecutionRecord({
    orgId: org.id, workspaceId: wsId, requestedById: requester.id, connector: 'github',
    actionType: 'merge', riskLevel: RiskLevel.CRITICAL, status: 'APPROVED', approvalId: approval.id, summary: 'Merge PR #421',
  });
  ok('execution record created', Boolean(rec.id));
  ok('merge is NOT rollback-available (honest)', rec.rollbackAvailable === false);
  const done = await markRecordExecuted(rec.id, { executedById: approverB.id, approverIds: [approverA.id, approverB.id], result: { merged: true }, durationMs: 42 });
  ok('record marked EXECUTED with duration', done.status === 'EXECUTED' && done.durationMs === 42);
  const list = await listExecutionRecords(wsId, { limit: 10 });
  ok('execution history lists the record', list.some((r) => r.id === rec.id));

  const rec2 = await createExecutionRecord({ orgId: org.id, workspaceId: wsId, connector: 'jira', actionType: 'create', riskLevel: 'MEDIUM' });
  ok('create IS rollback-available (honest)', rec2.rollbackAvailable === true);

  // ── cleanup ─────────────────────────────────────────────────────────────────
  await prisma.executionRecord.deleteMany({ where: { workspaceId: wsId } });
  await prisma.pendingApproval.deleteMany({ where: { workspaceId: wsId } });
  await prisma.user.deleteMany({ where: { orgId: org.id } });
  await prisma.organization.delete({ where: { id: org.id } });

  console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} passed, ${fail} failed\n`);
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (err) => { console.error('Harness error:', err); try { await prisma.$disconnect(); } catch { /* noop */ } process.exit(1); });
