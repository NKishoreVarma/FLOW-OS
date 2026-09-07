/**
 * ContinuousPlanner — Module 6
 *
 * Orchestrates the full autonomy planning cycle:
 *   collect → agents → goals → risks → opportunities → rank →
 *   generate plans → policy check → approval decision → submit
 *
 * The Planner NEVER executes actions directly.
 * All workflow execution goes through startExecutionWithPlan() from RuntimeEngine.
 * Agents NEVER bypass the Action Registry or execute connector actions.
 */

import { collectOrganizationState }   from './OrganizationStateCollector.js';
import { evaluateGoals, getGoalGaps } from './GoalEngine.js';
import { discoverOpportunities, saveOpportunities } from './OpportunityEngine.js';
import { runPredictions }             from './PredictiveEngine.js';
import { buildDecisionQueue }         from './DecisionEngine.js';
import { runOptimization }            from './OptimizationEngine.js';
import { ensureDefaultPolicy }        from './AutonomyPolicyEngine.js';
import { recordRecommendation }       from './LearningEngine.js';
import { startExecutionWithPlan, buildExecutionPlan } from '../runtime/index.js';
import { runCognitivePipeline }       from '../brain/pipeline/ReasoningPipeline.js';
import { query }                      from '../config/db.js';
import { publish }                    from '../events/index.js';
import { logger }                     from '../utils/logger.js';

const SAFE = async (label, fn) => {
  try { return await fn(); }
  catch (err) { logger.warn(`[ContinuousPlanner] ${label}: ${err.message}`); return null; }
};

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Run one complete planning cycle for a workspace.
 * Returns a PlanningCycleResult.
 */
export async function runPlanningCycle(workspaceId, orgId, opts = {}) {
  const { triggeredBy = 'schedule', dryRun = false } = opts;
  const t0 = Date.now();

  logger.info(`[ContinuousPlanner] cycle start — workspace ${workspaceId}`);

  // Ensure default policy exists before first evaluation
  await SAFE('ensurePolicy', () => ensureDefaultPolicy(workspaceId));

  // Stage 1: Collect unified organization state
  const orgState = await SAFE('collect', () => collectOrganizationState(workspaceId)) ?? {};

  // Stage 2: Run cognitive agents for domain assessment
  const agentInsights = await SAFE('agents', () => _runAgentAssessment(workspaceId, orgId, orgState));

  // Stage 3: Evaluate goals against current state
  const goals = await SAFE('goals', () => evaluateGoals(workspaceId, orgState)) ?? [];

  // Stage 4: Run predictions for forward-looking risk signals
  const predResult = await SAFE('predictions', () => runPredictions(workspaceId, orgState)) ?? {};
  const risks      = predResult.risks ?? [];

  // Stage 5: Discover opportunities
  const opportunities = await SAFE('opportunities', () => discoverOpportunities(workspaceId, orgState)) ?? [];
  if (opportunities.length > 0 && !dryRun) {
    await SAFE('saveOpp', () => saveOpportunities(workspaceId, opportunities));
  }

  // Stage 6: Build candidate recommendations from all signals
  const candidates = _buildCandidates(goals, risks, opportunities, agentInsights, orgState);

  // Stage 7: Run optimization analysis
  const optimization = await SAFE('optimize', () => runOptimization(workspaceId, orgState)) ?? {};

  // Stage 8: Score and rank into a decision queue
  const queue = await SAFE('rank', () =>
    buildDecisionQueue(workspaceId, candidates, { orgState, goals, predictions: risks })
  ) ?? { items: [], autoExecute: [], requireApproval: [], deferred: [], blocked: [] };

  // Stage 9: Generate workflow plans for auto-execute items
  const submitted = dryRun ? [] : await _submitAutoExecute(workspaceId, orgId, queue.autoExecute);

  // Stage 10: Record recommendations to LearningEngine
  if (!dryRun) {
    await SAFE('learn', () => _recordAllRecommendations(workspaceId, queue.items));
  }

  const durationMs = Date.now() - t0;
  const result = {
    workspaceId,
    triggeredBy,
    dryRun,
    durationMs,
    completedAt:    new Date().toISOString(),
    orgStateMs:     orgState.collectionMs ?? 0,
    goals:          goals.length,
    risks:          risks.length,
    opportunities:  opportunities.length,
    candidates:     candidates.length,
    autoExecuted:   submitted.length,
    pendingApproval: queue.requireApproval.length,
    deferred:       queue.deferred.length,
    blocked:        queue.blocked.length,
    optimizations:  optimization.recommendations?.length ?? 0,
    queue,
    optimization,
    submitted,
  };

  await SAFE('event', () => publish('autonomy', 'PLANNING_CYCLE_COMPLETE', result, { workspaceId }));

  logger.info(`[ContinuousPlanner] cycle done in ${durationMs}ms — ${submitted.length} submitted`);
  return result;
}

// ── Internal Stages ───────────────────────────────────────────────────────────

async function _runAgentAssessment(workspaceId, orgId, orgState) {
  const question = `Analyze the current operational state and identify the top 3 most critical actions needed. Workspace health: ${JSON.stringify(orgState.healthScore ?? {})}`;
  const result = await runCognitivePipeline(workspaceId, orgId ?? '', question, {
    fast: true,
    maxAgents: 3,
  });
  return result?.recommendations ?? [];
}

function _buildCandidates(goals, risks, opportunities, agentInsights, orgState) {
  const candidates = [];

  // From goal gaps: create a planning candidate per gap
  for (const goal of goals) {
    const gap = 100 - Number(goal.current_progress ?? 0);
    if (gap <= 20) continue;
    candidates.push({
      type:           `GOAL_GAP_${goal.category?.toUpperCase() ?? 'GENERAL'}`,
      title:          `Close gap on goal: ${goal.title}`,
      description:    `Goal is ${gap}% short of target`,
      riskLevel:      'LOW',
      priority:       goal.priority ?? 'MEDIUM',
      estimatedValue: gap * 100,
      goalIds:        [goal.id],
      timeHorizon:    '14d',
      source:         'goal_engine',
    });
  }

  // From risks: create a candidate per high-risk prediction
  for (const risk of risks) {
    if (Number(risk.probability) < 0.65) continue;
    candidates.push({
      type:           risk.type,
      title:          risk.prediction,
      description:    risk.drivers?.join('; ') ?? '',
      riskLevel:      Number(risk.probability) >= 0.8 ? 'HIGH' : 'MEDIUM',
      priority:       Number(risk.probability) >= 0.8 ? 'HIGH' : 'MEDIUM',
      estimatedValue: 5000,
      timeHorizon:    risk.timeHorizon ?? '7d',
      source:         'predictive_engine',
    });
  }

  // From opportunities: pass directly as candidates
  for (const opp of opportunities) {
    candidates.push({
      type:              `OPP_${opp.category}`,
      title:             opp.title,
      description:       opp.description ?? '',
      riskLevel:         'LOW',
      priority:          opp.estimated_value_usd > 10000 ? 'HIGH' : 'MEDIUM',
      estimatedValue:    Number(opp.estimated_value_usd ?? 0),
      estimatedCostUsd:  0,
      connectorId:       opp.suggested_workflow?.connectorId,
      timeHorizon:       '7d',
      source:            'opportunity_engine',
      opportunityId:     opp.id,
    });
  }

  // From agent insights
  for (const insight of (agentInsights ?? [])) {
    candidates.push({
      type:           'AGENT_RECOMMENDATION',
      title:          insight.title ?? insight,
      description:    insight.description ?? '',
      riskLevel:      'LOW',
      priority:       'MEDIUM',
      estimatedValue: 1000,
      timeHorizon:    '7d',
      source:         'cognitive_agents',
    });
  }

  return candidates;
}

async function _submitAutoExecute(workspaceId, orgId, autoItems) {
  const submitted = [];

  for (const item of autoItems.slice(0, 5)) {
    try {
      if (!item.workflowId) continue;

      const plan = await buildExecutionPlan(item.workflowId, {
        workspaceId,
        ...(item.params ?? {}),
      }, {
        workspaceId,
        userId:  `autonomy-engine`,
        orgId:   orgId ?? '',
        role:    'MEMBER',
      });

      const exec = await startExecutionWithPlan(plan, {
        workspaceId,
        userId:  `autonomy-engine`,
        orgId:   orgId ?? '',
        role:    'MEMBER',
        triggeredBy: 'autonomy-continuous-planner',
      });

      submitted.push({ item, executionId: exec.id, status: 'SUBMITTED' });
    } catch (err) {
      logger.warn(`[ContinuousPlanner] submit failed for ${item.type}: ${err.message}`);
      submitted.push({ item, error: err.message, status: 'FAILED' });
    }
  }

  return submitted;
}

async function _recordAllRecommendations(workspaceId, items) {
  for (const item of items) {
    await recordRecommendation(workspaceId, {
      recommendationType:    item.type,
      recommendationSummary: item.title,
      confidenceBefore:      item.typeConfidence ?? 0.5,
      tags:                  [item.source ?? 'unknown'],
    }).catch(() => null);
  }
}
