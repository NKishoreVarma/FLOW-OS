/**
 * PredictionEngine — moves FLOW from "what happened / what would happen" to
 * "what is likely to happen next". Orchestrates the deterministic model registry
 * over a shared, real-signal context, scores + explains each prediction, and
 * persists the run to memory (Prediction History).
 *
 * Everything is deterministic: no ML, no invented numbers. Replaces the former
 * mock generatePredictions().
 */

import { buildContext, runModels } from './PredictionPipeline.js';
import { MODELS, DOMAINS, modelsByDomain, allTypes } from './PredictionModels.js';
import { scoreRisk } from './RiskScorer.js';
import { estimateConfidence } from './ConfidenceEstimator.js';
import { generatePreventiveActions } from './RecommendationGenerator.js';
import { report } from './PredictionReporter.js';
import { saveMemory, queryMemory } from '../services/orgMemoryService.js';
import { resolveOrgId } from '../events/orgResolver.js';
import { logger } from '../utils/logger.js';

/**
 * Produce predictions.
 * @param {string} workspaceId
 * @param {{ domain?, types?, persist?, minRisk? }} opts
 */
export async function predict(workspaceId, opts = {}) {
  const started = Date.now();
  const ctx = await buildContext(workspaceId);

  let types = opts.types;
  if (!types) types = opts.domain ? modelsByDomain(opts.domain) : allTypes();

  const raw = await runModels(ctx, types);

  const predictions = raw.map((r) => {
    const risk = scoreRisk(r);
    const withRisk = { ...r, ...risk };
    const confidence = estimateConfidence(withRisk, ctx);
    const preventiveActions = generatePreventiveActions({ ...withRisk, confidence });
    return report({ ...withRisk, confidence, preventiveActions }, ctx);
  });

  predictions.sort((a, b) => b.riskScore - a.riskScore);

  const result = {
    workspaceId,
    generatedAt: new Date().toISOString(),
    elapsedMs: Date.now() - started,
    windowDays: ctx.windowDays,
    total: predictions.length,
    topRisks: predictions.filter(p => !p.insufficient && p.riskScore >= (opts.minRisk ?? 50)).slice(0, 8).map(p => ({ type: p.type, prediction: p.prediction, riskScore: p.riskScore })),
    predictions,
    byDomain: DOMAINS.reduce((acc, d) => { acc[d] = predictions.filter(p => p.domain === d).length; return acc; }, {}),
  };

  if (opts.persist !== false) await persist(workspaceId, result);
  (await import('../core/monitoring/engineMetrics.js')).record('prediction', result.elapsedMs);
  return result;
}

/** A single prediction type. */
export async function predictOne(workspaceId, type) {
  if (!MODELS[type]) throw new Error(`Unknown prediction type: ${type}`);
  const result = await predict(workspaceId, { types: [type], persist: false });
  return result.predictions[0];
}

export { allTypes, DOMAINS, modelsByDomain };

// ── Prediction history (persistence) ──────────────────────────────────────────

async function persist(workspaceId, result) {
  try {
    const orgId = await resolveOrgId(workspaceId);
    if (!orgId) return;
    const top = result.topRisks[0];
    await saveMemory(workspaceId, orgId, 'PREDICTION', {
      title: `Predictions: ${result.topRisks.length} elevated risk(s)${top ? ` — top: ${top.type}` : ''}`,
      body: result.predictions.filter(p => !p.insufficient).slice(0, 6).map(p => `• ${p.prediction}`).join('\n'),
      author: 'FLOW Prediction Engine',
      source: 'prediction',
      tags: ['prediction', ...result.topRisks.slice(0, 3).map(r => r.type)],
      importance: Math.min(1, (top?.riskScore || 0) / 100),
      metadata: { topRisks: result.topRisks, byDomain: result.byDomain, generatedAt: result.generatedAt },
    });
  } catch (err) {
    logger.rag(`[predict] history persist failed: ${err.message}`);
  }
}

export async function getHistory(workspaceId, limit = 20) {
  const rows = await queryMemory(workspaceId, 'PREDICTION', { hours: 24 * 90, limit }).catch(() => []);
  return rows.map(r => ({ at: r.createdAt, title: r.title, topRisks: r.metadata?.topRisks || [], byDomain: r.metadata?.byDomain }));
}
