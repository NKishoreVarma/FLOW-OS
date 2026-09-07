/**
 * FVEP — Validation & Evaluation Platform routes
 * Mounted at /api/fvep
 * Internal only — ADMIN/OWNER access required.
 */
import { Router } from 'express';
import { authenticate } from '../core/middleware/authenticate.js';
import { authorize }    from '../core/middleware/authorize.js';
import {
  runEvaluation,
  runDomain,
  getRunHistory,
  getDomainTrends,
  getLatestScores,
} from '../fvep/evaluationEngine.js';
import { runRegression }                from '../fvep/regressionSuite.js';
import { THRESHOLDS, RELEASE_GATE }     from '../fvep/thresholds.js';
import { query }         from '../config/db.js';

const router = Router();

// All FVEP routes require authentication
router.use(authenticate);

// ── GET /api/fvep/score — latest scores for all domains ───────────────────────
router.get('/score', async (req, res, next) => {
  try {
    const workspaceId = req.headers['workspace-id'];
    if (!workspaceId) return res.status(400).json({ error: 'workspace-id header required' });

    const scores = await getLatestScores(workspaceId);
    const overallScore = scores.length > 0
      ? Math.round(scores.filter(s => s.score !== null).reduce((sum, s) => sum + (s.score ?? 0), 0) /
          scores.filter(s => s.score !== null).length)
      : null;

    res.json({ workspaceId, overallScore, domains: scores });
  } catch (err) { next(err); }
});

// ── POST /api/fvep/run — trigger a full evaluation ────────────────────────────
router.post('/run', authorize('ADMIN', 'OWNER'), async (req, res, next) => {
  try {
    const workspaceId = req.headers['workspace-id'];
    if (!workspaceId) return res.status(400).json({ error: 'workspace-id header required' });

    const { runType = 'manual', releaseVersion } = req.body;
    const triggeredBy = req.user?.email ?? req.user?.id ?? 'api';

    // Start async — respond immediately with runId
    const result = await runEvaluation(workspaceId, { runType, triggeredBy, releaseVersion });
    res.json(result);
  } catch (err) { next(err); }
});

// ── GET /api/fvep/runs — run history ─────────────────────────────────────────
router.get('/runs', async (req, res, next) => {
  try {
    const workspaceId = req.headers['workspace-id'];
    if (!workspaceId) return res.status(400).json({ error: 'workspace-id header required' });

    const limit = Math.min(50, parseInt(req.query.limit ?? '20', 10));
    const runs  = await getRunHistory(workspaceId, { limit });
    res.json({ runs });
  } catch (err) { next(err); }
});

// ── GET /api/fvep/runs/:id — single run detail ───────────────────────────────
router.get('/runs/:id', async (req, res, next) => {
  try {
    const workspaceId = req.headers['workspace-id'];
    const r = await query(
      `SELECT r.*, json_agg(res ORDER BY res.domain) AS domain_results
       FROM fvep_runs r
       LEFT JOIN fvep_results res ON res.run_id = r.id
       WHERE r.id = $1 AND r.workspace_id = $2
       GROUP BY r.id`,
      [req.params.id, workspaceId]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: 'Run not found' });
    res.json(r.rows[0]);
  } catch (err) { next(err); }
});

// ── GET /api/fvep/domain/:name — single domain evaluation ────────────────────
router.get('/domain/:name', async (req, res, next) => {
  try {
    const workspaceId = req.headers['workspace-id'];
    if (!workspaceId) return res.status(400).json({ error: 'workspace-id header required' });

    const result = await runDomain(workspaceId, req.params.name);
    res.json(result);
  } catch (err) {
    if (err.message?.startsWith('Unknown domain')) return res.status(400).json({ error: err.message });
    next(err);
  }
});

// ── GET /api/fvep/trends — domain score trends ───────────────────────────────
router.get('/trends', async (req, res, next) => {
  try {
    const workspaceId = req.headers['workspace-id'];
    if (!workspaceId) return res.status(400).json({ error: 'workspace-id header required' });

    const lastN  = Math.min(20, parseInt(req.query.n ?? '10', 10));
    const trends = await getDomainTrends(workspaceId, { lastN });
    res.json({ trends });
  } catch (err) { next(err); }
});

// ── POST /api/fvep/regression — release gate check ───────────────────────────
router.post('/regression', authorize('ADMIN', 'OWNER'), async (req, res, next) => {
  try {
    const workspaceId = req.headers['workspace-id'];
    if (!workspaceId) return res.status(400).json({ error: 'workspace-id header required' });

    const { releaseVersion, triggeredBy } = req.body;
    const { passed, report } = await runRegression(workspaceId, {
      releaseVersion,
      triggeredBy: triggeredBy ?? req.user?.email ?? 'api',
    });

    res.status(passed ? 200 : 422).json({ passed, report });
  } catch (err) { next(err); }
});

// ── GET /api/fvep/thresholds — expose thresholds for UI ──────────────────────
router.get('/thresholds', (_req, res) => {
  res.json({ thresholds: THRESHOLDS, releaseGate: RELEASE_GATE });
});

export default router;
