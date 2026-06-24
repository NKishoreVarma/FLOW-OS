import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
dotenv.config();

// ── Core Infrastructure ──────────────────────────────────────────────────────
import db from './config/db.js';
import { ingestionQueue } from './config/queue.js';
import './workers/ingestionWorker.js';
import { initSocketServer } from './services/socketService.js';
import { errorHandler } from './core/errors/index.js';
import { tenantIsolation, authenticate, rateLimiter } from './core/middleware/index.js';

// ── New Modular Routes (Phase 1) ─────────────────────────────────────────────
import authModule from './modules/auth/auth.routes.js';
import orgModule from './modules/organizations/org.routes.js';
import userModule from './modules/users/user.routes.js';

// ── Legacy Routes (Backward Compatible — Phase 2 will migrate these) ─────────
import integrationRoutes from './routes/integrationRoutes.js';
import queryRoutes from './routes/queryRoutes.js';
import simulationRoutes from './routes/simulationRoutes.js';
import intelligenceRoutes from './routes/intelligenceRoutes.js';

const app = express();
const PORT = process.env.PORT || 5000;

// ── Global Middleware ────────────────────────────────────────────────────────
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(rateLimiter({ max: 200, windowSec: 60 }));

/**
 * Health Check Route (public, no auth)
 */
app.get('/api/health', async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.status(200).json({ status: 'HEALTHY', database: 'CONNECTED', uptime: process.uptime() });
  } catch (err) {
    res.status(500).json({ status: 'DEGRADED', error: err.message });
  }
});

// ── Mount New Modules ────────────────────────────────────────────────────────
// Auth is public
app.use(authModule.prefix, authModule.routes);
console.log(`📦 Public Module mounted: ${authModule.prefix}`);

// Apply JWT auth + tenant isolation to all routes below this line
app.use(authenticate);
app.use(tenantIsolation);

// Protected Modules (require JWT and tenant scope)
const protectedModules = [orgModule, userModule];
for (const mod of protectedModules) {
  app.use(mod.prefix, mod.routes);
  console.log(`📦 Protected Module mounted: ${mod.prefix}`);
}

/**
 * Inbound Communication Webhook Intake Endpoint
 */
app.post('/api/webhook/ingest', async (req, res) => {
  const { workspaceId, platform, channelId, messages } = req.body;

  if (!workspaceId || !platform || !messages) {
    return res.status(400).json({ error: 'Missing mandatory tracking parameters.' });
  }

  try {
    const jobIds = [];
    for (const msg of messages) {
      const job = await ingestionQueue.add('new-intel', {
        workspaceId: workspaceId,
        platform: platform || 'slack',
        channelId: channelId || 'general',
        text: msg.text,
        sender: msg.sender
      });
      jobIds.push(job.id);
    }

    res.status(202).json({ success: true, message: `${jobIds.length} message(s) staged in background queue.`, jobIds });
  } catch (err) {
    res.status(500).json({ error: 'Failed to stage event payload.', details: err.message });
  }
});

// ── Legacy Route Mounts (fully backward compatible) ──────────────────────────
app.use('/api/integrations', integrationRoutes);
console.log('🔌 Composio OAuth Integration routes mounted successfully.');

app.use('/api/query', queryRoutes);
console.log('🔎 Authority-Weighted RAG Query routes mounted successfully.');

app.use('/api/intelligence', intelligenceRoutes);
console.log('🧠 Intelligence Feed routes mounted successfully.');

app.use('/api/test/simulate', simulationRoutes);
console.log('🧪 End-to-End Simulation test routes mounted successfully.');

// ── Error Handler (must be last) ────────────────────────────────────────────
app.use(errorHandler);

// ── Boot ─────────────────────────────────────────────────────────────────────
const httpServer = app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n=================================================`);
  console.log(`⚡ FLOW OS Platform Engine v2.0`);
  console.log(`⚡ Listening on http://127.0.0.1:${PORT}`);
  console.log(`⚡ Modules: ${protectedModules.length + 1} loaded`);
  console.log(`=================================================`);

  initSocketServer(httpServer);
});