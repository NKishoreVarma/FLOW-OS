import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { runLifecycleOperation, validateOnly } from '../core/workspaceLifecycle/lifecycleEngine.js';
import { getSupportedTypes } from '../core/workspaceLifecycle/datasetRegistry.js';
import { ENGINE_VERSION } from '../core/workspaceLifecycle/manifestParser.js';
import { prisma } from '../core/config/prisma.js';
import { ValidationError } from '../core/errors/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEMO_DIR = path.resolve(__dirname, '../../demo-company/exports');

// Async so a large demo import never blocks the event loop (request path).
async function loadDemoPayload() {
  const manifestPath = path.join(DEMO_DIR, 'manifest.json');
  let manifestRaw;
  try {
    manifestRaw = await fs.readFile(manifestPath, 'utf8');
  } catch {
    throw new ValidationError('Demo company manifest not found. Run: cd demo-company && npm run generate');
  }
  const manifest = JSON.parse(manifestRaw);
  const datasets = {};
  await Promise.all(manifest.datasets.map(async (entry) => {
    try {
      datasets[entry.type] = JSON.parse(await fs.readFile(path.join(DEMO_DIR, entry.file), 'utf8'));
    } catch { /* missing dataset file — skip */ }
  }));
  return { manifest, datasets };
}

const router = express.Router();

// workspace-id header enforcement
router.use((req, res, next) => {
  const workspaceId = req.headers['workspace-id'] || req.headers['x-workspace-id'];
  if (!workspaceId) throw new ValidationError('Missing required workspace-id header');
  req.workspaceId = workspaceId;
  next();
});

// POST /api/lifecycle/create
// CREATE operates on an existing workspace (tenant-validated by tenantIsolation).
// It does NOT provision a new org — use POST /api/auth/signup for that.
router.post('/create', async (req, res) => {
  if (!['OWNER', 'ADMIN'].includes(req.workspaceRole)) {
    return res.status(403).json({ error: 'Lifecycle write operations require OWNER or ADMIN role' });
  }
  const { manifest, datasets = {} } = req.body;
  const record = await runLifecycleOperation('CREATE', req.workspaceId, { manifest, datasets });
  res.json({ success: true, ...record });
});

// POST /api/lifecycle/import
router.post('/import', async (req, res) => {
  if (!['OWNER', 'ADMIN'].includes(req.workspaceRole)) {
    return res.status(403).json({ error: 'Lifecycle write operations require OWNER or ADMIN role' });
  }
  const { manifest, datasets = {} } = req.body;
  const record = await runLifecycleOperation('IMPORT', req.workspaceId, { manifest, datasets });
  res.json({ success: true, ...record });
});

// POST /api/lifecycle/sync
router.post('/sync', async (req, res) => {
  if (!['OWNER', 'ADMIN'].includes(req.workspaceRole)) {
    return res.status(403).json({ error: 'Lifecycle write operations require OWNER or ADMIN role' });
  }
  const { manifest, datasets = {} } = req.body;
  const record = await runLifecycleOperation('SYNC', req.workspaceId, { manifest, datasets });
  res.json({ success: true, ...record });
});

// POST /api/lifecycle/refresh
router.post('/refresh', async (req, res) => {
  if (!['OWNER', 'ADMIN'].includes(req.workspaceRole)) {
    return res.status(403).json({ error: 'Lifecycle write operations require OWNER or ADMIN role' });
  }
  const record = await runLifecycleOperation('REFRESH', req.workspaceId, {});
  res.json({ success: true, ...record });
});

// POST /api/lifecycle/validate  (dry-run, no DB writes)
router.post('/validate', async (req, res) => {
  const { manifest, datasets = {} } = req.body;
  const result = await validateOnly(req.workspaceId, { manifest, datasets });
  res.json({ success: true, ...result });
});

// GET /api/lifecycle/history
router.get('/history', async (req, res) => {
  const records = await prisma.importRecord.findMany({
    where: { workspaceId: req.workspaceId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  res.json({ success: true, history: records });
});

// GET /api/lifecycle/demo/manifest — returns the demo company manifest + dataset record counts (no auth needed for preview)
router.get('/demo/manifest', async (_req, res) => {
  try {
    const { manifest, datasets } = await loadDemoPayload();
    const datasetSizes = Object.entries(datasets).map(([type, records]) => ({
      type,
      count: Array.isArray(records) ? records.length : 0,
    }));
    res.json({ success: true, manifest, datasetSizes });
  } catch (err) {
    res.status(503).json({ error: err.message });
  }
});

// POST /api/lifecycle/demo — import the bundled Helios Software Inc. demo company into a workspace
// Returns immediately with importId; vectorization runs in background (9k records can take 20-60 min).
router.post('/demo', async (req, res) => {
  if (!['OWNER', 'ADMIN'].includes(req.workspaceRole)) {
    return res.status(403).json({ error: 'Demo import requires OWNER or ADMIN role' });
  }
  const { manifest, datasets } = await loadDemoPayload();

  // Kick off the operation without awaiting — it streams WS events and updates ImportRecord in DB.
  // Clients poll GET /api/lifecycle/history to check status.
  const importId = `IMP-${Math.random().toString(16).slice(2, 10).toUpperCase()}`;
  runLifecycleOperation('IMPORT', req.workspaceId, { manifest, datasets }).catch(err =>
    console.error('[lifecycle/demo] background import failed:', err.message)
  );

  res.status(202).json({
    success: true,
    importId,
    workspaceId: req.workspaceId,
    status: 'RUNNING',
    message: 'Demo import started. Poll GET /api/lifecycle/history for progress. Vectorization of 9k records may take 20-60 minutes.',
  });
});

// GET /api/lifecycle/schema
router.get('/schema', (req, res) => {
  res.json({
    success: true,
    supportedTypes: getSupportedTypes(),
    engineVersion: ENGINE_VERSION,
    schemaVersionFloor: '1.0',
    operations: ['CREATE', 'IMPORT', 'SYNC', 'REFRESH', 'VALIDATE'],
  });
});

export default router;
