/**
 * Observability API — Phase 12 Milestone 2.
 *
 * GET /api/metrics         — unified operational metrics (process, db, redis,
 *                            queues, event platform, engines, connectors, ws)
 * GET /api/metrics/alerts  — evaluated health alerts
 *
 * Self-guarded: requires an OWNER/ADMIN JWT, OR a static METRICS_TOKEN bearer for
 * scrapers (Prometheus/Datadog agents). Available in ALL environments (unlike the
 * dev-only dashboards) so production monitoring can consume it. No tenant data.
 */

import express from 'express';
import jwt from 'jsonwebtoken';
import { aggregate } from '../core/monitoring/metricsAggregator.js';
import { evaluateAlerts } from '../core/monitoring/alerts.js';

const router = express.Router();

router.use((req, res, next) => {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) return res.status(401).json({ error: 'Bearer token required' });
  const token = h.slice(7);
  if (process.env.METRICS_TOKEN && token === process.env.METRICS_TOKEN) return next();
  try {
    const d = jwt.verify(token, process.env.JWT_SECRET);
    if (!['OWNER', 'ADMIN'].includes(d.role)) return res.status(403).json({ error: 'Owner or Admin role required' });
    next();
  } catch { return res.status(401).json({ error: 'Invalid or expired token' }); }
});

router.get('/', async (_req, res) => { try { res.json(await aggregate()); } catch (e) { res.status(500).json({ error: e.message }); } });
router.get('/alerts', async (_req, res) => { try { res.json(await evaluateAlerts()); } catch (e) { res.status(500).json({ error: e.message }); } });

export default router;
