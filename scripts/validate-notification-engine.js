/**
 * Validation harness — Phase 14 M3 Workspace Notification Engine.
 *   node scripts/validate-notification-engine.js
 *
 * Covers: targeted merge-conflict notification (only the owners), dedupe, priority,
 * permission-aware visibility (canSee + list filter), approval routing to ADMIN/OWNER,
 * and mark-read. Seeds a throwaway org + users, cleans up.
 */

import {
  notifyMergeConflict, notifyApprovalRequired, createNotification,
  listNotifications, markRead,
} from '../src/notifications/notificationEngine.js';
import { canSee, priorityFor } from '../src/notifications/notificationTargeting.js';
import { prisma } from '../src/core/config/prisma.js';

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log(`  ✅ ${n}`); } else { fail++; console.log(`  ❌ ${n}`); } };

async function main() {
  console.log('\n🔔 Phase 14 M3 — Notification Engine validation\n');
  const suffix = Date.now();
  const wsId = `workspace_notif_${suffix}`;
  const org = await prisma.organization.create({ data: { name: `NotifVal ${suffix}`, slug: `notifval-${suffix}` } });
  const mk = (r, n) => prisma.user.create({ data: { email: `${n}-${suffix}@val.local`, passwordHash: 'x', fullName: n, role: r, orgId: org.id } });
  const adminA  = await mk('ADMIN', 'adminA');
  const adminB  = await mk('OWNER', 'ownerB');
  const member  = await mk('MEMBER', 'memberC');

  // ── 1. Targeted merge-conflict notification ─────────────────────────────────
  console.log('1. Targeted merge-conflict notification');
  const ownership = { repo: 'flow-backend', number: 128, owners: ['rahul', 'kishore'],
    suggestedActions: [{ label: 'Open Diff', kind: 'open_diff' }, { label: 'Message kishore', kind: 'message' }] };
  const mc = await notifyMergeConflict({ orgId: org.id, workspaceId: wsId, ownership, message: '⚠️ conflict in auth.js', severity: 'high' });
  ok('notification created', Boolean(mc.notification.id) && mc.deduped === false);
  ok('recipients are only the owners', JSON.stringify(mc.notification.recipients) === JSON.stringify(['rahul', 'kishore']));
  ok('type MERGE_CONFLICT', mc.notification.type === 'MERGE_CONFLICT');
  ok('priority high (>=90)', mc.notification.priority >= 90);
  ok('carries actions', (mc.notification.actions || []).length === 2);

  // ── 2. Dedupe ───────────────────────────────────────────────────────────────
  console.log('2. Dedupe');
  const again = await notifyMergeConflict({ orgId: org.id, workspaceId: wsId, ownership, message: 'dup', severity: 'high' });
  ok('same conflict is deduped', again.deduped === true && again.notification.id === mc.notification.id);

  // ── 3. Permission-aware visibility ──────────────────────────────────────────
  console.log('3. Permission-aware visibility');
  ok('owner (rahul) can see it', canSee(mc.notification, { id: 'x', login: 'rahul' }));
  ok('unrelated (dana) cannot see it', !canSee(mc.notification, { id: 'y', login: 'dana' }));
  const broadcast = await createNotification({ orgId: org.id, workspaceId: wsId, type: 'INCIDENT', title: 'System-wide notice', recipients: [] });
  ok('broadcast (empty recipients) visible to anyone', canSee(broadcast.notification, { id: 'anyone' }));

  // ── 4. Approval routing to ADMIN/OWNER ──────────────────────────────────────
  console.log('4. Approval routing');
  const appr = await notifyApprovalRequired({ orgId: org.id, workspaceId: wsId, approvalId: `appr_${suffix}`, connector: 'github', actionType: 'merge', riskLevel: 'CRITICAL' });
  const recips = appr.notification.recipients;
  ok('admins/owners are recipients', recips.includes(adminA.id) && recips.includes(adminB.id));
  ok('member is NOT a recipient', !recips.includes(member.id));
  ok('approval priority elevated (CRITICAL)', appr.notification.priority >= 76);

  // ── 5. List is permission-filtered + priority-ranked ────────────────────────
  console.log('5. List filter + ranking');
  const asRahul = await listNotifications(wsId, { id: 'r', login: 'rahul' }, { limit: 50 });
  ok('rahul sees the merge conflict', asRahul.some((n) => n.id === mc.notification.id));
  ok('rahul sees the broadcast', asRahul.some((n) => n.id === broadcast.notification.id));
  ok('rahul does NOT see the admin-only approval', !asRahul.some((n) => n.id === appr.notification.id));

  const asAdmin = await listNotifications(wsId, { id: adminA.id, email: adminA.email }, { limit: 50 });
  ok('admin sees the approval', asAdmin.some((n) => n.id === appr.notification.id));
  ok('list is priority-ranked (desc)', asAdmin.length < 2 || asAdmin[0].priority >= asAdmin[asAdmin.length - 1].priority);

  // ── 6. Mark read ────────────────────────────────────────────────────────────
  console.log('6. Mark read');
  await markRead(broadcast.notification.id, wsId, adminA.id);
  const afterRead = await listNotifications(wsId, { id: adminA.id, email: adminA.email }, { limit: 50 });
  ok('broadcast now marked read for admin', afterRead.find((n) => n.id === broadcast.notification.id)?.read === true);

  ok('priorityFor MERGE_CONFLICT high > EXECUTION_DONE', priorityFor('MERGE_CONFLICT', 'high') > priorityFor('EXECUTION_DONE'));

  // ── cleanup ─────────────────────────────────────────────────────────────────
  await prisma.notification.deleteMany({ where: { workspaceId: wsId } });
  await prisma.user.deleteMany({ where: { orgId: org.id } });
  await prisma.organization.delete({ where: { id: org.id } });

  console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} passed, ${fail} failed\n`);
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (err) => { console.error('Harness error:', err); try { await prisma.$disconnect(); } catch { /* noop */ } process.exit(1); });
