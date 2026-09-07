/**
 * OrgMemoryFacts (Phase 7) — USER-CONFIRMED organizational relationship memory.
 *
 * STRICTLY separate from dataset graph edges and conversation memory. The ONLY way a row
 * is created here is an explicit user confirmation (createConfirmedFact) — never the LLM,
 * never a connector. Every read/write is workspace + user scoped (tenant isolation).
 *
 * Memory priority for answering a relationship question:
 *   1. USER_CONFIRMED (this store)  2. DATASET_FACT (graph edges)  3. INFERRED  4. UNKNOWN
 * Conflicts between a confirmed fact and the dataset are SURFACED, never silently resolved.
 */

import { prisma } from '../../core/config/prisma.js';

export const OrgRelationship = Object.freeze({
  REPORTS_TO: 'REPORTS_TO', MANAGES: 'MANAGES', WORKS_WITH: 'WORKS_WITH',
  TEAM_MEMBER: 'TEAM_MEMBER', TEAM_LEAD: 'TEAM_LEAD', RESPONSIBLE_FOR: 'RESPONSIBLE_FOR',
});

/**
 * Create a USER_CONFIRMED fact. Caller MUST have verified this is an explicit user
 * confirmation. Supersedes any prior ACTIVE fact for the same (user, subject, relationship)
 * so "actually, X is my manager now" updates rather than duplicating — with an audit trail.
 */
export async function createConfirmedFact({ workspaceId, userId, subjectType = 'USER', subjectId = null, subjectName, relationship, objectType = 'USER', objectId = null, objectName }) {
  if (!workspaceId || !userId || !relationship || !objectName || !subjectName) {
    throw new Error('createConfirmedFact requires workspaceId, userId, subjectName, relationship, objectName');
  }
  // Supersede prior ACTIVE facts for the same subject+relationship (keeps history).
  const prior = await prisma.orgRelationshipFact.findMany({
    where: { workspaceId: String(workspaceId), userId: String(userId), subjectName, relationship, status: 'ACTIVE' },
    select: { id: true, objectName: true },
  }).catch(() => []);
  for (const p of prior) {
    if (p.objectName.toLowerCase() !== String(objectName).toLowerCase()) {
      await prisma.orgRelationshipFact.update({ where: { id: p.id }, data: { status: 'SUPERSEDED' } }).catch(() => {});
    }
  }
  // If an identical ACTIVE fact already exists, return it (idempotent).
  const existing = prior.find(p => p.objectName.toLowerCase() === String(objectName).toLowerCase());
  if (existing) return prisma.orgRelationshipFact.findUnique({ where: { id: existing.id } });

  return prisma.orgRelationshipFact.create({
    data: {
      workspaceId: String(workspaceId), userId: String(userId), subjectType, subjectId,
      subjectName, relationship, objectType, objectId, objectName,
      source: 'USER_CONFIRMED', confidence: 'CONFIRMED', status: 'ACTIVE',
    },
  });
}

/** All ACTIVE confirmed facts for a user in a workspace. Workspace + user scoped. */
export async function getConfirmedFacts(workspaceId, userId, { relationship = null } = {}) {
  const where = { workspaceId: String(workspaceId), userId: String(userId), status: 'ACTIVE' };
  if (relationship) where.relationship = relationship;
  return prisma.orgRelationshipFact.findMany({ where, orderBy: { createdAt: 'desc' } }).catch(() => []);
}

/**
 * Look up a confirmed fact for a specific subject+relationship (subject may be "me").
 * @returns the matching fact or null. Workspace + user scoped.
 */
export async function getConfirmedFor(workspaceId, userId, subjectName, relationship) {
  const rows = await prisma.orgRelationshipFact.findMany({
    where: { workspaceId: String(workspaceId), userId: String(userId), relationship, status: 'ACTIVE',
      subjectName: { equals: subjectName, mode: 'insensitive' } },
    orderBy: { createdAt: 'desc' },
  }).catch(() => []);
  return rows[0] || null;
}

/** Mark a pending candidate as rejected (No / Not sure) — records nothing as a fact. */
export async function recordRejection() { /* intentional no-op: rejection never creates a fact */ return null; }

export default { OrgRelationship, createConfirmedFact, getConfirmedFacts, getConfirmedFor, recordRejection };
