/**
 * Connector Certification API
 *
 * GET  /api/connectors/certification          — all reports (cached)
 * GET  /api/connectors/certification/:id      — single connector report
 * POST /api/connectors/certification/run      — run certification for one or all connectors
 * POST /api/connectors/certification/:id/run  — run certification for a single connector
 */

import { Router } from 'express';
import { listConnectors, getConnector } from '../connectors/registry.js';
import {
  certifyConnector,
  certifyAll,
  getCertificationReport,
  getAllCertificationReports,
} from '../connectors/certification/index.js';

const router = Router();

// ── GET /api/connectors/certification — list all cached reports ───────────────
router.get('/', async (req, res, next) => {
  try {
    const cached = await getAllCertificationReports();
    const connectors = listConnectors();

    // Merge catalog (all registered connectors) with cached results so
    // connectors that haven't been certified yet still appear in the dashboard
    const catalogMap = new Map(connectors.map(c => [c.id, c]));
    const resultMap  = new Map(cached.map(r => [r.connectorId, r]));

    const TIER = {
      gmail: 1, 'google-calendar': 1, github: 1, slack: 1, jira: 1,
      notion: 2, confluence: 2, 'google-drive': 2, linear: 2, gitlab: 2,
      kubernetes: 2, aws: 2, postgresql: 2, 'redis-infra': 2, datadog: 2, pagerduty: 2,
      hubspot: 3, salesforce: 3, workday: 3, bamboohr: 3,
    };

    const merged = [];
    for (const [id, adapter] of catalogMap) {
      const report = resultMap.get(id);
      merged.push(report || {
        connectorId:         id,
        connectorName:       adapter.name || id,
        tier:                TIER[id] ?? 3,
        certificationStatus: 'PENDING',
        certificationScore:  null,
        healthStatus:        'unknown',
        latencyMs:           null,
        oauthStatus:         'not_connected',
        version:             adapter.version || 'unknown',
        capability:          adapter.capability || 'UNKNOWN',
        supportedActions:    adapter.supportedActions || [],
        testedAt:            null,
        domains:             null,
      });
    }

    const summary = {
      total:     merged.length,
      certified: merged.filter(r => r.certificationStatus === 'CERTIFIED').length,
      provisional: merged.filter(r => r.certificationStatus === 'PROVISIONALLY_CERTIFIED').length,
      pending:   merged.filter(r => ['PENDING', 'NOT_CERTIFIED'].includes(r.certificationStatus) && r.testedAt).length,
      untested:  merged.filter(r => !r.testedAt).length,
    };

    res.json({ summary, connectors: merged });
  } catch (e) {
    next(e);
  }
});

// ── GET /api/connectors/certification/:id — single connector report ───────────
router.get('/:id', async (req, res, next) => {
  try {
    const report = await getCertificationReport(req.params.id);
    if (!report) return res.status(404).json({ error: `No certification report for "${req.params.id}"` });
    res.json(report);
  } catch (e) {
    next(e);
  }
});

// ── POST /api/connectors/certification/run — run for one or all ──────────────
router.post('/run', async (req, res, next) => {
  try {
    const { connectorId, workspaceId } = req.body;
    const ctx = { workspaceId: workspaceId || req.headers['workspace-id'] };

    if (connectorId) {
      const report = await certifyConnector(connectorId, ctx);
      return res.json({ report });
    }

    // Full ecosystem certification (non-blocking — returns immediately with a job promise)
    const reports = await certifyAll(ctx);
    res.json({
      message: `Certification complete for ${reports.length} connectors`,
      reports,
    });
  } catch (e) {
    next(e);
  }
});

// ── POST /api/connectors/certification/:id/run — certify a single connector ──
router.post('/:id/run', async (req, res, next) => {
  try {
    const ctx = { workspaceId: req.body?.workspaceId || req.headers['workspace-id'] };
    const report = await certifyConnector(req.params.id, ctx);
    res.json({ report });
  } catch (e) {
    next(e);
  }
});

export default router;
