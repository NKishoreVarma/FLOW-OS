import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
dotenv.config();

import { validateEnv } from './utils/envValidation.js';
validateEnv();

// ── Core Infrastructure ──────────────────────────────────────────────────────
import db from './config/db.js';
import { ingestionQueue } from './config/queue.js';
import './workers/ingestionWorker.js';
import './workers/summaryWorker.js';
import { initSocketServer, getSocketStatus } from './services/socketService.js';
import fs from 'fs';
import Redis from 'ioredis';
import { errorHandler } from './core/errors/index.js';
import { tenantIsolation, authenticate, rateLimiter } from './core/middleware/index.js';
import { governanceMiddleware, initGovernanceSubscribers } from './core/governance/index.js';
import { initAutomationSubscribers } from './services/automationEngine.js';

// ── New Modular Routes (Phase 1) ─────────────────────────────────────────────
import authModule from './modules/auth/auth.routes.js';
import orgModule from './modules/organizations/org.routes.js';
import userModule from './modules/users/user.routes.js';

// ── Connector Framework (Phase 5) ────────────────────────────────────────────
// Side-effect import: registers all adapters (GmailAdapter, …) into the registry.
import './connectors/adapters/index.js';
// Side-effect import: registers all 23 workspace lifecycle dataset types.
import './core/workspaceLifecycle/datasets/index.js';

import connectorsRoutes     from './routes/connectorsRoutes.js';
import approvalRoutes       from './routes/approvalRoutes.js';
import policyRoutes         from './routes/policyRoutes.js';
import communicationRoutes  from './routes/communicationRoutes.js';
import meetingRoutes        from './routes/meetingRoutes.js';
import engineeringRoutes    from './routes/engineeringRoutes.js';
import brainRoutes from './routes/brainRoutes.js';
import workRoutes           from './routes/workRoutes.js';
import knowledgeRoutes      from './routes/knowledgeRoutes.js';
import crmRoutes            from './routes/crmRoutes.js';
import hrRoutes             from './routes/hrRoutes.js';

// ── Legacy Routes (Backward Compatible — Phase 2 will migrate these) ─────────
import integrationRoutes from './routes/integrationRoutes.js';
import queryRoutes from './routes/queryRoutes.js';
import simulationRoutes from './routes/simulationRoutes.js';
import intelligenceRoutes from './routes/intelligenceRoutes.js';
import crawlerRoutes from './routes/crawlerRoutes.js';
import importRoutes from './routes/importRoutes.js';
import lifecycleRoutes from './routes/lifecycleRoutes.js';
import evaluationRoutes from './routes/evaluationRoutes.js';

const app = express();
const PORT = process.env.PORT || 5000;

// ── Global Middleware ────────────────────────────────────────────────────────
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(rateLimiter({ max: 200, windowSec: 60 }));

/**
 * Health Check Route (public, no auth)
 * Supports both /health and /api/health
 */
app.get(['/health', '/api/health'], async (req, res) => {
  const health = {
    status: 'HEALTHY',
    version: '1.0.0',
    buildTime: new Date().toISOString(),
    uptime: process.uptime(),
    components: {
      postgres: { status: 'UNKNOWN' },
      redis: { status: 'UNKNOWN' },
      queue: { status: 'UNKNOWN' },
      websocket: { status: 'UNKNOWN' },
      embeddings: { status: 'UNKNOWN' },
      memory: { status: 'ACTIVE' },
      vectorStore: { status: 'ACTIVE' }
    }
  };

  // Get version & build time dynamically
  try {
    const packageJson = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url)));
    health.version = packageJson.version || '1.0.0';
    health.buildTime = fs.statSync(new URL('../package.json', import.meta.url)).mtime.toISOString();
  } catch (err) {
    // fallback
  }

  // 1. PostgreSQL check
  try {
    const start = Date.now();
    await db.query('SELECT 1');
    health.components.postgres = {
      status: 'CONNECTED',
      latencyMs: Date.now() - start
    };
  } catch (err) {
    health.status = 'DEGRADED';
    health.components.postgres = {
      status: 'FAILED',
      error: err.message
    };
  }

  // 2. Redis check
  let tempRedis;
  try {
    tempRedis = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
      maxRetriesPerRequest: 1,
      connectTimeout: 1000
    });
    const pong = await tempRedis.ping();
    if (pong === 'PONG') {
      health.components.redis = { status: 'CONNECTED' };
    } else {
      throw new Error(`Unexpected Redis ping response: ${pong}`);
    }
  } catch (err) {
    health.status = 'DEGRADED';
    health.components.redis = {
      status: 'FAILED',
      error: err.message
    };
  } finally {
    if (tempRedis) {
      try { tempRedis.disconnect(); } catch (e) {}
    }
  }

  // 3. Queue check
  try {
    const qClient = await ingestionQueue.client;
    const qStatus = qClient ? qClient.status : 'offline';
    health.components.queue = {
      status: qStatus === 'ready' ? 'CONNECTED' : 'FAILED',
      details: `Queue connection: ${qStatus}`
    };
    if (qStatus !== 'ready') {
      health.status = 'DEGRADED';
    }
  } catch (err) {
    health.status = 'DEGRADED';
    health.components.queue = {
      status: 'FAILED',
      error: err.message
    };
  }

  // 4. WebSocket check
  try {
    const wsStatus = getSocketStatus();
    health.components.websocket = {
      status: wsStatus.active ? 'CONNECTED' : 'FAILED',
      activeWorkspaces: wsStatus.workspaces,
      activeClients: wsStatus.clients
    };
    if (!wsStatus.active) {
      health.status = 'DEGRADED';
    }
  } catch (err) {
    health.status = 'DEGRADED';
    health.components.websocket = {
      status: 'FAILED',
      error: err.message
    };
  }

  // 5. Embeddings check
  try {
    if (process.env.GEMINI_API_KEY) {
      health.components.embeddings = {
        status: 'CONNECTED',
        provider: 'Gemini',
        model: 'gemini-embedding-2'
      };
    } else {
      throw new Error('GEMINI_API_KEY is missing');
    }
  } catch (err) {
    health.status = 'DEGRADED';
    health.components.embeddings = {
      status: 'FAILED',
      error: err.message
    };
  }

  const statusCode = health.status === 'HEALTHY' ? 200 : 500;
  res.status(statusCode).json(health);
});

// ── Mount New Modules ────────────────────────────────────────────────────────
// Auth is public
app.use(authModule.prefix, authModule.routes);
console.log(`📦 Public Module mounted: ${authModule.prefix}`);

// Developer Verification Dashboard (Development Only, bypasses auth)
import devDashboardRoutes from './routes/devDashboard.js';
app.use('/dev-dashboard', devDashboardRoutes);
app.use('/api/dev', devDashboardRoutes);
console.log('🛠️ Developer Verification Dashboard mounted at /dev-dashboard');

// Apply JWT auth + tenant isolation + governance context to all routes below this line
app.use(authenticate);
app.use(tenantIsolation);
app.use(governanceMiddleware);

// Start governance event subscribers (analytics, notifications, memory)
initGovernanceSubscribers();
initAutomationSubscribers();
console.log('🤖 Automation Engine subscribers wired to event bus');

// Protected Modules (require JWT and tenant scope)
const protectedModules = [orgModule, userModule];
for (const mod of protectedModules) {
  app.use(mod.prefix, mod.routes);
  console.log(`📦 Protected Module mounted: ${mod.prefix}`);
}

app.use('/api/work', workRoutes);
console.log('💼 Work Management Capability routes mounted successfully.');

app.use('/api/knowledge', knowledgeRoutes);
console.log('📚 Knowledge Capability routes mounted successfully.');

app.use('/api/crm', crmRoutes);
console.log('🤝 Customer Intelligence Capability routes mounted successfully.');

app.use('/api/hr', hrRoutes);
console.log('👥 Workforce Intelligence Capability routes mounted successfully.');

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
app.use('/api/connectors', connectorsRoutes);
console.log('🔌 Universal Connector Framework mounted at /api/connectors');

app.use('/api/approvals', approvalRoutes);
console.log('✅ Approval Lifecycle routes mounted at /api/approvals');

app.use('/api/policies', policyRoutes);
console.log('🔐 Policy Management routes mounted at /api/policies');

app.use('/api/integrations', integrationRoutes);
console.log('🔌 Composio OAuth Integration routes mounted successfully.');

app.use('/api/query', queryRoutes);
console.log('🔎 Authority-Weighted RAG Query routes mounted successfully.');

app.use('/api/intelligence', intelligenceRoutes);
console.log('🧠 Intelligence Feed routes mounted successfully.');

app.use('/api/crawler', crawlerRoutes);
console.log('🕷️ SSRF-Safe Crawler routes mounted successfully.');

app.use('/api/test/simulate', simulationRoutes);
console.log('🧪 End-to-End Simulation test routes mounted successfully.');

app.use('/api/import', importRoutes);
console.log('📥 Universal Import Engine routes mounted successfully.');

app.use('/api/lifecycle', lifecycleRoutes);
console.log('🔄 Workspace Lifecycle Engine routes mounted at /api/lifecycle');

app.use('/api/evaluation', evaluationRoutes.routes);
console.log('📊 AI Evaluation & Explainability routes mounted successfully.');

app.use('/api/communication', communicationRoutes);
console.log('📧 Communication Capability routes mounted at /api/communication');

app.use('/api/meetings', meetingRoutes);
console.log('📅 Meeting Capability routes mounted at /api/meetings');

app.use('/api/engineering', engineeringRoutes);
console.log('⚙️  Engineering Capability routes mounted at /api/engineering');

app.use('/api/brain', brainRoutes);
console.log('🧠 Autonomous Brain routes mounted at /api/brain');

// ── Error Handler (must be last) ────────────────────────────────────────────
app.use(errorHandler);

// ── HTTP Server ───────────────────────────────────────────────────────────────
const httpServer = createServer(app);

// Named export — used by integration tests to get the configured app without
// starting the server (no .listen() call).
export function createApp() {
  return { app, httpServer };
}

// ── Boot (only when this file is run directly) ───────────────────────────────
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`\n=================================================`);
    console.log(`⚡ FLOW OS Platform Engine v2.0`);
    console.log(`⚡ Listening on http://127.0.0.1:${PORT}`);
    console.log(`⚡ Modules: ${protectedModules.length + 1} loaded`);
    console.log(`=================================================`);

    initSocketServer(httpServer);
  });
}