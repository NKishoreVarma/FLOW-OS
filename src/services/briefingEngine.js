import { ask } from '../ai/BrainRouter.js';
import { buildBriefingPrompt } from '../ai/PromptBuilder.js';
import { formatNarrative } from '../ai/ResponseFormatter.js';
import { TaskType } from '../ai/types.js';
import { queryMemory } from './orgMemoryService.js';
import { calculateWorkspaceHealth } from './healthScoreService.js';
import { getRecentIncidents } from './incidentEngine.js';
import { getProactiveRecommendations } from './operationalIntelligenceService.js';

const ROLES = { EMPLOYEE: 'EMPLOYEE', MANAGER: 'MANAGER', EXECUTIVE: 'EXECUTIVE' };

async function callAI(role, health, incidents, recs) {
  const { messages } = buildBriefingPrompt({
    role, health, incidents, recommendations: recs
  });
  try {
    const result = await ask({ taskType: TaskType.BRIEF, messages, maxTokens: 150, temperature: 0.4 });
    return formatNarrative(result);
  } catch {
    return null;
  }
}

function buildEmployeeBrief(incidents, decisions, health, recs) {
  const openIncidents = incidents.filter(i => i.status === 'OPEN').slice(0, 3);
  return {
    priorities: openIncidents.length > 0
      ? openIncidents.map(i => ({ title: i.title || i.incidentName, source: 'incidents', urgency: 'HIGH' }))
      : [{ title: 'No critical incidents — focus on sprint tasks', source: 'system', urgency: 'LOW' }],
    actions: recs.slice(0, 2).map(r => ({
      title: r.title,
      confidence: r.confidence,
      evidence: r.evidence,
      businessImpact: r.businessImpact,
      systems: r.systems
    })),
    risks: [],
    healthSummary: health.company_health
  };
}

function buildManagerBrief(incidents, decisions, health, recs) {
  const blockers = incidents.filter(i => i.status === 'OPEN' && (i.severity === 'CRITICAL' || i.severity === 'HIGH'));
  return {
    teamBlockers: blockers.map(i => ({
      title: i.title || i.incidentName,
      severity: i.severity,
      evidence: [i.description || ''],
      systems: ['incidents']
    })),
    sprintHealth: health.sectors?.delivery ?? 82,
    approvals: [],
    resourceFlags: recs.filter(r => r.id === 'REC-2.2'),
    actions: recs.slice(0, 3).map(r => ({
      title: r.title,
      confidence: r.confidence,
      evidence: r.evidence,
      businessImpact: r.businessImpact,
      systems: r.systems
    }))
  };
}

function buildExecutiveBrief(incidents, decisions, health, recs) {
  return {
    companyHealth: health.company_health,
    sectors: health.sectors,
    customerRisks: [{
      title: 'Monitor at-risk accounts',
      confidence: 80,
      evidence: `Customer health sector score: ${health.sectors?.customer ?? 68}%`,
      systems: ['hubspot', 'crm']
    }],
    deliveryRisks: incidents.filter(i => i.severity === 'CRITICAL').map(i => ({
      title: i.title || i.incidentName,
      severity: i.severity,
      systems: ['incidents', 'github']
    })),
    strategicRecommendations: recs.map(r => ({
      id: r.id,
      title: r.title,
      confidence: r.confidence,
      impact: r.impact,
      evidence: r.evidence,
      systems: r.systems,
      owner: r.owner,
      businessImpact: r.businessImpact,
      estimatedImprovement: r.estimatedImprovement
    })),
    recentDecisions: decisions.slice(0, 5).map(d => ({
      title: d.title,
      author: d.author,
      date: d.createdAt
    }))
  };
}

function buildFallbackNarrative(role, health, incidents) {
  const score = health.company_health ?? 75;
  const open = incidents.filter(i => i.status === 'OPEN').length;
  if (role === 'EXECUTIVE') {
    return `Company health is at ${score}/100 with ${open} open incidents requiring attention. Review strategic recommendations to maintain delivery cadence.`;
  }
  if (role === 'MANAGER') {
    return `Your team has ${open} active blockers with sprint health at ${health.sectors?.delivery ?? 82}%. Address the top recommendation to unblock delivery.`;
  }
  return `${open > 0 ? `${open} active incident(s) in your workspace.` : 'No active incidents.'} Focus on today's top action items to move the needle.`;
}

export async function generateBriefing(workspaceId, orgId, role = ROLES.EMPLOYEE) {
  const wsIdStr = String(workspaceId);
  const validRole = Object.values(ROLES).includes(role.toUpperCase()) ? role.toUpperCase() : ROLES.EMPLOYEE;

  const [health, incidents, recs, decisions] = await Promise.all([
    calculateWorkspaceHealth(wsIdStr).catch(() => ({ company_health: 75, sectors: {} })),
    Promise.resolve(getRecentIncidents(wsIdStr, 24)),
    Promise.resolve(getProactiveRecommendations(wsIdStr)),
    queryMemory(wsIdStr, 'DECISION', { hours: 168, limit: 10 }).catch(() => [])
  ]);

  let sections;
  if (validRole === ROLES.EXECUTIVE) {
    sections = buildExecutiveBrief(incidents, decisions, health, recs);
  } else if (validRole === ROLES.MANAGER) {
    sections = buildManagerBrief(incidents, decisions, health, recs);
  } else {
    sections = buildEmployeeBrief(incidents, decisions, health, recs);
  }

  const aiNarrative = await callAI(validRole, health, incidents, recs);

  return {
    role: validRole,
    generatedAt: new Date().toISOString(),
    aiNarrative: aiNarrative || buildFallbackNarrative(validRole, health, incidents),
    sections,
    metadata: {
      incidentCount: incidents.length,
      openIncidents: incidents.filter(i => i.status === 'OPEN').length,
      healthScore: health.company_health,
      recommendationCount: recs.length,
      sources: ['incidents', 'health', 'decisions', 'recommendations']
    }
  };
}
