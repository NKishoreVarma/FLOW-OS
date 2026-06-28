import { prisma } from '../core/config/prisma.js';

function buildDecisionRecord(record) {
  const meta = record.metadata || {};
  return {
    id: record.id,
    workspaceId: record.workspaceId,
    title: record.title,
    status: meta.status || 'PENDING',
    context: meta.context || '',
    evidence: meta.evidence || [],
    riskAssessment: meta.riskAssessment || '',
    businessImpact: meta.businessImpact || '',
    suggestedOwner: meta.suggestedOwner || '',
    executionSteps: meta.executionSteps || [],
    confidence: meta.confidence ?? 50,
    requiresHumanApproval: meta.requiresHumanApproval ?? true,
    rollbackStrategy: meta.rollbackStrategy || '',
    approvedBy: meta.approvedBy || null,
    rejectedBy: meta.rejectedBy || null,
    executionResult: meta.executionResult || null,
    lessonLearned: meta.lessonLearned || null,
    relatedSystems: meta.relatedSystems || [],
    createdAt: record.createdAt
  };
}

export async function createDecision(workspaceId, orgId, {
  title,
  context = '',
  evidence = [],
  riskAssessment = '',
  businessImpact = '',
  suggestedOwner = '',
  executionSteps = [],
  confidence = 50,
  requiresHumanApproval = true,
  rollbackStrategy = '',
  relatedSystems = []
}) {
  const record = await prisma.orgMemoryRecord.create({
    data: {
      workspaceId: String(workspaceId),
      orgId,
      type: 'DECISION',
      title,
      body: context,
      source: 'decision-engine',
      importance: confidence / 100,
      metadata: {
        status: 'PENDING',
        context,
        evidence,
        riskAssessment,
        businessImpact,
        suggestedOwner,
        executionSteps,
        confidence,
        requiresHumanApproval,
        rollbackStrategy,
        relatedSystems
      }
    }
  });
  return buildDecisionRecord(record);
}

export async function listDecisions(workspaceId, { hours = 168, limit = 20 } = {}) {
  const since = new Date(Date.now() - hours * 3600 * 1000);
  const records = await prisma.orgMemoryRecord.findMany({
    where: {
      workspaceId: String(workspaceId),
      type: 'DECISION',
      createdAt: { gte: since }
    },
    orderBy: [{ importance: 'desc' }, { createdAt: 'desc' }],
    take: limit
  });
  return records.map(buildDecisionRecord);
}

export async function updateDecision(workspaceId, decisionId, updates) {
  const existing = await prisma.orgMemoryRecord.findFirst({
    where: { id: decisionId, workspaceId: String(workspaceId), type: 'DECISION' }
  });
  if (!existing) throw new Error(`Decision ${decisionId} not found`);

  const mergedMeta = { ...(existing.metadata || {}), ...updates };
  const record = await prisma.orgMemoryRecord.update({
    where: { id: decisionId },
    data: { metadata: mergedMeta }
  });
  return buildDecisionRecord(record);
}

export async function fromRecommendation(workspaceId, orgId, recommendation) {
  const evidenceList = Array.isArray(recommendation.evidence)
    ? recommendation.evidence
    : [recommendation.evidence].filter(Boolean);

  return createDecision(workspaceId, orgId, {
    title: recommendation.title,
    context: recommendation.businessImpact || '',
    evidence: evidenceList,
    riskAssessment: `Confidence: ${recommendation.confidence}%. Systems: ${(recommendation.systems || []).join(', ')}.`,
    businessImpact: recommendation.businessImpact || '',
    suggestedOwner: recommendation.owner || recommendation.suggestedOwner || '',
    executionSteps: [],
    confidence: recommendation.confidence ?? 50,
    requiresHumanApproval: (recommendation.confidence ?? 50) < 90,
    rollbackStrategy: '',
    relatedSystems: recommendation.systems || []
  });
}
