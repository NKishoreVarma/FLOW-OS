import { prisma } from '../core/config/prisma.js';
import { eventBus } from '../core/events/eventBus.js';
import { executeAction } from '../connectors/executionEngine.js';
import { createDecision, updateDecision } from './decisionEngine.js';
import { broadcastToWorkspace } from './socketService.js';
import db from '../config/db.js';
import { NotFoundError } from '../core/errors/index.js';

const rulesCache = new Map();
const cacheTimestamps = new Map();
const CACHE_TTL = 60_000;

async function resolveOrgId(workspaceId) {
  const { rows } = await db.query(
    'SELECT org_id FROM workspaces WHERE external_id = $1 LIMIT 1',
    [String(workspaceId)]
  );
  return rows[0]?.org_id ?? null;
}

async function loadRules(workspaceId) {
  const wsId = String(workspaceId);
  const now = Date.now();
  const lastLoad = cacheTimestamps.get(wsId) || 0;
  if (now - lastLoad < CACHE_TTL && rulesCache.has(wsId)) {
    return rulesCache.get(wsId);
  }
  const rules = await prisma.automationRule.findMany({
    where: { workspaceId: wsId, enabled: true }
  });
  rulesCache.set(wsId, rules);
  cacheTimestamps.set(wsId, now);
  return rules;
}

function invalidateCache(workspaceId) {
  rulesCache.delete(String(workspaceId));
  cacheTimestamps.delete(String(workspaceId));
}

function conditionsMatch(conditions, payload) {
  if (!conditions || Object.keys(conditions).length === 0) return true;
  for (const [key, value] of Object.entries(conditions)) {
    if (payload[key] !== undefined && payload[key] !== value) return false;
  }
  return true;
}

function buildExplainability(rule, triggerPayload) {
  const actions = Array.isArray(rule.actions) ? rule.actions : [];
  return {
    why: `Rule "${rule.name}" matched trigger ${rule.trigger}`,
    triggeredBy: rule.trigger,
    evidence: [`Trigger payload: ${JSON.stringify(triggerPayload).slice(0, 300)}`],
    expectedOutcome: actions.map(a => `${a.connector}.${a.actionType}`),
    risks: 'Side-effectful steps are subject to governance approval gates.',
    rollbackStrategy: 'Each connector action is individually auditable; reverse via the corresponding inverse action in the timeline.'
  };
}

async function runWorkflow(workspaceId, orgId, rule, triggerPayload) {
  const wsId = String(workspaceId);
  const explain = buildExplainability(rule, triggerPayload);
  const actions = Array.isArray(rule.actions) ? rule.actions : [];

  const decision = await createDecision(wsId, orgId, {
    title: `Automation: ${rule.name}`,
    context: explain.why,
    evidence: explain.evidence,
    riskAssessment: explain.risks,
    businessImpact: `Automated workflow across ${explain.expectedOutcome.join(', ')}`,
    suggestedOwner: 'automation',
    executionSteps: explain.expectedOutcome,
    confidence: 80,
    requiresHumanApproval: false,
    rollbackStrategy: explain.rollbackStrategy,
    relatedSystems: actions.map(a => a.connector)
  });

  const run = await prisma.automationRun.create({
    data: {
      ruleId: rule.id,
      workspaceId: wsId,
      orgId,
      status: 'RUNNING',
      triggerPayload,
      results: { explainability: explain, steps: [] }
    }
  });

  await updateDecision(wsId, decision.id, { status: 'EXECUTING' });

  const results = [];
  let blocked = false;
  let denied = false;

  for (const step of actions) {
    try {
      const result = await executeAction({
        workspaceId: wsId,
        connectorId: step.connector,
        actionType: step.actionType,
        payload: { ...(step.payload || {}), triggerContext: triggerPayload },
        actor: { id: 'automation', role: 'MEMBER', orgId },
        orgPlan: 'free'
      });
      results.push({ connector: step.connector, actionType: step.actionType, status: 'OK', result });
    } catch (err) {
      if (err?.code === 'APPROVAL_REQUIRED') {
        results.push({
          connector: step.connector,
          actionType: step.actionType,
          status: 'BLOCKED',
          reason: err.message,
          approvalId: err?.meta?.approvalId ?? null
        });
        blocked = true;
        break;
      }
      // A hard governance DENY (AuthorizationError, 403) has no approval path — distinct from a pending gate.
      if (err?.statusCode === 403) {
        results.push({
          connector: step.connector,
          actionType: step.actionType,
          status: 'DENIED',
          reason: err.message,
          approvalId: null
        });
        denied = true;
        break;
      }
      results.push({ connector: step.connector, actionType: step.actionType, status: 'ERROR', error: err.message });
    }
  }

  const allOk = results.length > 0 && results.every(r => r.status === 'OK');
  const finalStatus = blocked ? 'BLOCKED_BY_GOVERNANCE'
    : denied ? 'DENIED_BY_GOVERNANCE'
    : allOk ? 'COMPLETED'
    : 'FAILED';

  await prisma.automationRun.update({
    where: { id: run.id },
    data: { status: finalStatus, results: { explainability: explain, steps: results }, finishedAt: new Date() }
  });

  await updateDecision(wsId, decision.id, {
    status: blocked ? 'AWAITING_APPROVAL' : denied ? 'REJECTED' : allOk ? 'COMPLETED' : 'FAILED',
    executionResult: { runId: run.id, status: finalStatus, steps: results }
  });

  broadcastToWorkspace(wsId, 'AUTOMATION_RUN_COMPLETE', {
    ruleId: rule.id,
    ruleName: rule.name,
    runId: run.id,
    decisionId: decision.id,
    status: finalStatus,
    actionCount: results.length
  });

  return { run, decision, results };
}

export async function evaluateTrigger(workspaceId, orgId, eventType, payload) {
  let rules;
  try {
    rules = await loadRules(workspaceId);
  } catch {
    return;
  }
  const resolvedOrg = orgId || await resolveOrgId(workspaceId);
  if (!resolvedOrg) return;

  const matching = rules.filter(r => r.trigger === eventType && conditionsMatch(r.conditions, payload));
  for (const rule of matching) {
    runWorkflow(workspaceId, resolvedOrg, rule, payload).catch(() => {});
  }
}

export async function createRule(workspaceId, orgId, { name, trigger, conditions = {}, actions }) {
  const rule = await prisma.automationRule.create({
    data: { workspaceId: String(workspaceId), orgId, name, trigger, conditions, actions, enabled: true }
  });
  invalidateCache(workspaceId);
  return rule;
}

export async function listRules(workspaceId) {
  return prisma.automationRule.findMany({
    where: { workspaceId: String(workspaceId) },
    orderBy: { createdAt: 'desc' }
  });
}

export async function listRuns(workspaceId, { limit = 20 } = {}) {
  return prisma.automationRun.findMany({
    where: { workspaceId: String(workspaceId) },
    include: { rule: { select: { name: true, trigger: true } } },
    orderBy: { startedAt: 'desc' },
    take: limit
  });
}

export async function toggleRule(workspaceId, ruleId, enabled) {
  const existing = await prisma.automationRule.findFirst({
    where: { id: ruleId, workspaceId: String(workspaceId) }
  });
  if (!existing) throw new NotFoundError('Automation rule');
  const rule = await prisma.automationRule.update({
    where: { id: ruleId },
    data: { enabled }
  });
  invalidateCache(workspaceId);
  return rule;
}

export async function deleteRule(workspaceId, ruleId) {
  const result = await prisma.automationRule.deleteMany({
    where: { id: ruleId, workspaceId: String(workspaceId) }
  });
  invalidateCache(workspaceId);
  return result;
}

export function initAutomationSubscribers() {
  const WATCHED_EVENTS = [
    'INCIDENT_CREATED', 'RISK_DETECTED',
    'INTEL_STORED', 'MEMORY_ESCALATED'
  ];
  WATCHED_EVENTS.forEach(eventType => {
    eventBus.on(eventType, (payload = {}) => {
      const workspaceId = payload.workspaceId;
      if (!workspaceId) return;
      evaluateTrigger(String(workspaceId), payload.orgId || null, eventType, payload).catch(() => {});
    });
  });
}
