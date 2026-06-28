import prisma from '../core/config/prisma.js';

export async function saveMemory(workspaceId, orgId, type, { title, body, author, source, tags = [], importance = 0.5, metadata = {} }) {
  return prisma.orgMemoryRecord.create({
    data: { workspaceId: String(workspaceId), orgId, type, title, body, author, source, tags, importance, metadata }
  });
}

export async function queryMemory(workspaceId, type, { hours = 168, limit = 50 } = {}) {
  const since = new Date(Date.now() - hours * 3600 * 1000);
  return prisma.orgMemoryRecord.findMany({
    where: { workspaceId: String(workspaceId), type, createdAt: { gte: since } },
    orderBy: [{ importance: 'desc' }, { createdAt: 'desc' }],
    take: limit
  });
}

export async function queryAllMemory(workspaceId, { hours = 168, limit = 100 } = {}) {
  const since = new Date(Date.now() - hours * 3600 * 1000);
  return prisma.orgMemoryRecord.findMany({
    where: { workspaceId: String(workspaceId), createdAt: { gte: since } },
    orderBy: [{ importance: 'desc' }, { createdAt: 'desc' }],
    take: limit
  });
}

export async function getMemoryStats(workspaceId) {
  const [decisions, incidents, total] = await Promise.all([
    prisma.orgMemoryRecord.count({ where: { workspaceId: String(workspaceId), type: 'DECISION' } }),
    prisma.orgMemoryRecord.count({ where: { workspaceId: String(workspaceId), type: 'INCIDENT' } }),
    prisma.orgMemoryRecord.count({ where: { workspaceId: String(workspaceId) } })
  ]);
  return { decisions, incidents, total };
}
