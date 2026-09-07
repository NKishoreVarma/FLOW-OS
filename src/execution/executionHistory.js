/**
 * FLOW OS — Execution History (Phase 14)
 *
 * Durable record of every operational action FLOW attempts: who requested it, who
 * approved it, who executed it, the connector, result, duration, whether a rollback
 * is available, and links to the timeline + audit rows. Backed by PostgreSQL
 * (`execution_records` via Prisma).
 */

import { prisma } from '../core/config/prisma.js';

// Which action types expose a true inverse we can offer as a rollback.
const REVERSIBLE = new Set(['create', 'comment', 'label', 'note', 'addNote', 'draft', 'assign']);

export function isRollbackAvailable(actionType) {
  const base = String(actionType || '').split(/[._:]/)[0].toLowerCase();
  return REVERSIBLE.has(base);
}

export async function createExecutionRecord({
  orgId, workspaceId, planId, requestedById, connector, actionType, riskLevel,
  status = 'PENDING', approvalId, summary,
}) {
  return prisma.executionRecord.create({
    data: {
      orgId, workspaceId, planId: planId ?? null, requestedById: requestedById ?? null,
      connector, actionType, riskLevel, status, approvalId: approvalId ?? null,
      summary: summary ?? null,
      rollbackAvailable: isRollbackAvailable(actionType),
    },
  });
}

export async function updateExecutionRecord(id, patch = {}) {
  return prisma.executionRecord.update({ where: { id }, data: { ...patch, updatedAt: new Date() } });
}

export async function markRecordExecuted(id, { executedById, approverIds, result, durationMs, timelineEventId, auditLogId }) {
  return updateExecutionRecord(id, {
    status: 'EXECUTED',
    executedById: executedById ?? null,
    approverIds: approverIds ?? [],
    result: result ?? {},
    durationMs: durationMs ?? null,
    timelineEventId: timelineEventId ?? null,
    auditLogId: auditLogId ?? null,
  });
}

export async function markRecordFailed(id, { result, durationMs } = {}) {
  return updateExecutionRecord(id, { status: 'FAILED', result: result ?? {}, durationMs: durationMs ?? null });
}

export async function listExecutionRecords(workspaceId, { limit = 50, status } = {}) {
  const where = { workspaceId };
  if (status) where.status = status;
  return prisma.executionRecord.findMany({
    where, orderBy: { createdAt: 'desc' }, take: Math.min(limit, 200),
  });
}

export async function getExecutionRecord(id, workspaceId) {
  return prisma.executionRecord.findFirst({ where: { id, workspaceId } });
}

export default {
  isRollbackAvailable, createExecutionRecord, updateExecutionRecord,
  markRecordExecuted, markRecordFailed, listExecutionRecords, getExecutionRecord,
};
