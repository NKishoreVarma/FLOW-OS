import express from 'express';
import { authorize } from '../core/middleware/authorize.js';
import {
  generateMonthlyReport, generateQuarterlyReport,
  generateExecutiveReport, getReportHistory,
} from '../success/roiEngine.js';

const router = express.Router();

router.use((req, res, next) => {
  if (!req.tenantId) {
    return res.status(400).json({ error: { code: 'MISSING_WORKSPACE', message: 'workspace-id header is required' } });
  }
  next();
});

router.get('/monthly', authorize('ADMIN', 'OWNER'), async (req, res, next) => {
  try {
    const { month, year } = req.query;
    res.json(await generateMonthlyReport(req.tenantId, {
      month: month ? Number(month) : undefined,
      year:  year  ? Number(year)  : undefined,
    }));
  } catch (e) { next(e); }
});

router.get('/quarterly', authorize('ADMIN', 'OWNER'), async (req, res, next) => {
  try {
    const { quarter, year } = req.query;
    res.json(await generateQuarterlyReport(req.tenantId, {
      quarter: quarter ? Number(quarter) : undefined,
      year:    year    ? Number(year)    : undefined,
    }));
  } catch (e) { next(e); }
});

router.get('/executive', authorize('ADMIN', 'OWNER'), async (req, res, next) => {
  try {
    res.json(await generateExecutiveReport(req.tenantId));
  } catch (e) { next(e); }
});

router.get('/history', authorize('ADMIN', 'OWNER'), async (req, res, next) => {
  try {
    const { periodType } = req.query;
    res.json({ reports: await getReportHistory(req.tenantId, { periodType }) });
  } catch (e) { next(e); }
});

export default router;
