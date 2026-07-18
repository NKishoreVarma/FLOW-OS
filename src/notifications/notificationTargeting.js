/**
 * FLOW OS — Notification Targeting (Phase 14 M3)
 *
 * Resolves WHO should receive a notification and whether a given user is allowed to
 * see it. Targeting is permission-aware: a notification is delivered only to the
 * relevant people (merge-conflict owners, approvers, the requester), never the whole
 * workspace — and a user may only read a notification they are a recipient of.
 */

import { prisma } from '../core/config/prisma.js';

// Base priority per notification type (0..100). Higher = more urgent.
const PRIORITY = {
  MERGE_CONFLICT:    82,
  CI_FAILED:         70,
  APPROVAL_REQUIRED: 76,
  PR_BLOCKED:        60,
  PREDICTION_WARNING: 66,
  INCIDENT:          90,
  EXECUTION_FAILED:  68,
  EXECUTION_DONE:    30,
  COLLABORATION:     55,
};

export function priorityFor(type, severity) {
  let p = PRIORITY[type] ?? 50;
  if (severity === 'high') p += 8;
  else if (severity === 'low') p -= 8;
  return Math.max(0, Math.min(100, p));
}

/** Resolve the ADMIN/OWNER user ids of an org (used for approval routing). */
export async function resolveRoleRecipients(orgId, roles = ['ADMIN', 'OWNER']) {
  if (!orgId) return [];
  const users = await prisma.user.findMany({
    where: { orgId, role: { in: roles }, isActive: true },
    select: { id: true },
  });
  return users.map((u) => u.id);
}

/**
 * A user may see a notification if they are an explicit recipient (by id, email, or
 * login token) OR the notification is a workspace broadcast (empty recipients).
 */
export function canSee(notification, user) {
  const recipients = Array.isArray(notification.recipients) ? notification.recipients : [];
  if (recipients.length === 0) return true; // broadcast
  const tokens = [user?.id, user?.email, user?.login, user?.username]
    .filter(Boolean)
    .map((t) => String(t).toLowerCase());
  return recipients.some((r) => tokens.includes(String(r).toLowerCase()));
}

/** Dedupe key so repeated signals about the same thing collapse to one notification. */
export function dedupeKeyFor(type, parts = []) {
  return [type, ...parts.filter(Boolean)].join(':');
}

export default { priorityFor, resolveRoleRecipients, canSee, dedupeKeyFor };
