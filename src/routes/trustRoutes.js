/**
 * Trust Center REST API — /api/trust
 *
 * All routes require JWT auth + workspace-id header (enforced via tenantIsolation).
 * Never modifies data — pure read-only transparency surface.
 */

import { Router } from 'express';
import {
  explainDecision,
  explainRecommendation,
  listExplainableDecisions,
  getEvidence,
  getEvidenceChunk,
  getEvidenceSummary,
  explainPolicyDenial,
  explainPolicyPreview,
  listPolicies,
  getApprovalTimeline,
  listApprovalTimelines,
  getApprovalStats,
  getModelTrace,
  getModelUsageSummary,
  getWorkflowTrace,
  listWorkflowRuns,
  getKnowledgeTrace,
  getEntityContext,
  getKnowledgeMap,
} from '../trust/index.js';

const router = Router();

// ── Decision explainability ───────────────────────────────────────────────────

/** GET /api/trust/decisions — list all explainable decisions */
router.get('/decisions', async (req, res, next) => {
  try {
    const ws     = req.tenantId;
    const limit  = Math.min(Number(req.query.limit ?? 50), 200);
    const type   = req.query.type ?? null;
    const result = await listExplainableDecisions(ws, { limit, type });
    res.json(result);
  } catch (err) { next(err); }
});

/** GET /api/trust/explain/:id — explain any decision by ID */
router.get('/explain/:id', async (req, res, next) => {
  try {
    const explanation = await explainDecision(req.params.id, req.tenantId);
    res.json(explanation);
  } catch (err) { next(err); }
});

/** GET /api/trust/recommendation/:id — explain a specific recommendation */
router.get('/recommendation/:id', async (req, res, next) => {
  try {
    const explanation = await explainRecommendation(req.params.id, req.tenantId);
    res.json(explanation);
  } catch (err) { next(err); }
});

// ── Evidence viewer ───────────────────────────────────────────────────────────

/** GET /api/trust/evidence/:id — get evidence for a context/decision */
router.get('/evidence/:id', async (req, res, next) => {
  try {
    const connectors = req.query.connectors
      ? String(req.query.connectors).split(',')
      : null;
    const result = await getEvidence(req.params.id, req.tenantId, { connectors });
    res.json(result);
  } catch (err) { next(err); }
});

/** GET /api/trust/evidence/chunk/:chunkId — get a single evidence chunk */
router.get('/evidence/chunk/:chunkId', async (req, res, next) => {
  try {
    const chunk = await getEvidenceChunk(req.params.chunkId, req.tenantId);
    if (!chunk) return res.status(404).json({ error: 'Chunk not found' });
    res.json(chunk);
  } catch (err) { next(err); }
});

/** GET /api/trust/evidence — evidence summary (source breakdown) */
router.get('/evidence', async (req, res, next) => {
  try {
    const days   = Math.min(Number(req.query.days ?? 7), 90);
    const result = await getEvidenceSummary(req.tenantId, { days });
    res.json({ sources: result, workspaceId: req.tenantId });
  } catch (err) { next(err); }
});

// ── Policy explainability ─────────────────────────────────────────────────────

/** GET /api/trust/policy/:id — explain a policy denial by approval/audit ID */
router.get('/policy/:id', async (req, res, next) => {
  try {
    const result = await explainPolicyDenial(req.params.id, req.tenantId);
    res.json(result);
  } catch (err) { next(err); }
});

/** POST /api/trust/policy/preview — preview what policy would apply to an action */
router.post('/policy/preview', async (req, res, next) => {
  try {
    const { connector, actionType, role } = req.body;
    if (!connector || !actionType) return res.status(400).json({ error: 'connector and actionType are required' });
    const result = await explainPolicyPreview(req.tenantId, { connector, actionType, role: role ?? req.workspaceRole ?? 'MEMBER' });
    res.json(result);
  } catch (err) { next(err); }
});

/** GET /api/trust/policies — list all policies for the workspace */
router.get('/policies', async (req, res, next) => {
  try {
    const { connector, effect } = req.query;
    const result = await listPolicies(req.tenantId, { connector, effect });
    res.json({ policies: result, total: result.length });
  } catch (err) { next(err); }
});

// ── Approval timeline ─────────────────────────────────────────────────────────

/** GET /api/trust/approvals — list approval timelines */
router.get('/approvals', async (req, res, next) => {
  try {
    const limit  = Math.min(Number(req.query.limit ?? 100), 500);
    const status = req.query.status ?? null;
    const result = await listApprovalTimelines(req.tenantId, { status, limit });
    res.json({ approvals: result, total: result.length });
  } catch (err) { next(err); }
});

/** GET /api/trust/approvals/stats — approval statistics */
router.get('/approvals/stats', async (req, res, next) => {
  try {
    const days   = Math.min(Number(req.query.days ?? 30), 365);
    const result = await getApprovalStats(req.tenantId, { days });
    res.json(result);
  } catch (err) { next(err); }
});

/** GET /api/trust/approvals/:id — full approval timeline */
router.get('/approvals/:id', async (req, res, next) => {
  try {
    const result = await getApprovalTimeline(req.params.id, req.tenantId);
    if (!result) return res.status(404).json({ error: 'Approval not found' });
    res.json(result);
  } catch (err) { next(err); }
});

// ── Model trace ───────────────────────────────────────────────────────────────

/** GET /api/trust/model/:id — AI model trace for a resource */
router.get('/model/:id', async (req, res, next) => {
  try {
    const result = await getModelTrace(req.params.id, req.tenantId);
    res.json(result);
  } catch (err) { next(err); }
});

/** GET /api/trust/model — model usage summary */
router.get('/model', async (req, res, next) => {
  try {
    const days   = Math.min(Number(req.query.days ?? 30), 365);
    const result = await getModelUsageSummary(req.tenantId, { days });
    res.json({ usage: result, workspaceId: req.tenantId });
  } catch (err) { next(err); }
});

// ── Workflow trace ────────────────────────────────────────────────────────────

/** GET /api/trust/workflow — list recent workflow runs */
router.get('/workflow', async (req, res, next) => {
  try {
    const limit  = Math.min(Number(req.query.limit ?? 50), 200);
    const status = req.query.status ?? null;
    const result = await listWorkflowRuns(req.tenantId, { limit, status });
    res.json({ runs: result, total: result.length });
  } catch (err) { next(err); }
});

/** GET /api/trust/workflow/:id — full workflow execution trace */
router.get('/workflow/:id', async (req, res, next) => {
  try {
    const result = await getWorkflowTrace(req.params.id, req.tenantId);
    res.json(result);
  } catch (err) { next(err); }
});

// ── Knowledge trace ───────────────────────────────────────────────────────────

/** GET /api/trust/graph/:id — knowledge trace for a conversation/query */
router.get('/graph/:id', async (req, res, next) => {
  try {
    const result = await getKnowledgeTrace(req.params.id, req.tenantId);
    res.json(result);
  } catch (err) { next(err); }
});

/** GET /api/trust/graph/entity/:nodeId — entity context (neighbors + chunks) */
router.get('/graph/entity/:nodeId', async (req, res, next) => {
  try {
    const result = await getEntityContext(req.params.nodeId, req.tenantId);
    if (!result) return res.status(404).json({ error: 'Entity not found' });
    res.json(result);
  } catch (err) { next(err); }
});

/** GET /api/trust/graph — knowledge map overview */
router.get('/graph', async (req, res, next) => {
  try {
    const days   = Math.min(Number(req.query.days ?? 7), 90);
    const result = await getKnowledgeMap(req.tenantId, { days });
    res.json(result);
  } catch (err) { next(err); }
});

export default router;
