import express from 'express';
import cors from 'cors';
import compression from 'compression';
import crypto from 'crypto';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import dotenv from 'dotenv';
dotenv.config();

import { registerGracefulShutdown, isShuttingDown } from './core/lifecycle/gracefulShutdown.js';
import { getQueueMetrics } from './core/monitoring/queueMetrics.js';
import { requestLogger } from './core/middleware/requestLogger.js';
import { poolStats } from './config/db.js';
import { redisHealth } from './config/redis.js';

import { validateEnv } from './utils/envValidation.js';
import { logger } from './utils/logger.js';
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
import executionRoutes      from './routes/executionRoutes.js';
import collaborationRoutes  from './routes/collaborationRoutes.js';
import notificationRoutes   from './routes/notificationRoutes.js';
import councilRoutes        from './routes/councilRoutes.js';
import workspaceRoutes      from './routes/workspaceRoutes.js';
import workdayRoutes        from './routes/workdayRoutes.js';
import { startWorkspaceCache } from './workspaceCache/index.js';
import policyRoutes         from './routes/policyRoutes.js';
import integrationPermissionsRoutes from './routes/integrationPermissionsRoutes.js';
import communicationRoutes  from './routes/communicationRoutes.js';
import meetingRoutes        from './routes/meetingRoutes.js';
import engineeringRoutes    from './routes/engineeringRoutes.js';
import brainRoutes from './routes/brainRoutes.js';
import brainAgentRoutes from './routes/brainAgentRoutes.js';
import { startCognitiveBrain } from './brain/index.js';
import executiveRoutes from './routes/executiveRoutes.js';
import aiRoutes from './routes/aiRoutes.js';
import autonomousRoutes from './routes/autonomousRoutes.js';
import phase19Routes from './routes/phase19Routes.js';
import { startAutonomousScheduler } from './services/autonomous/BackgroundAnalysisScheduler.js';
import autonomyRoutes from './routes/autonomyRoutes.js';
import { startAutonomyEngine } from './autonomy/index.js';
import adminEnterpriseRoutes from './routes/adminEnterpriseRoutes.js';
import trustRoutes            from './routes/trustRoutes.js';
import { startHA }            from './ha/index.js';
import eventRoutes             from './routes/eventRoutes.js';
import googleRoutes            from './routes/googleRoutes.js';
import webhookRoutes           from './routes/webhookRoutes.js';
import webhookManagementRoutes from './routes/webhookManagementRoutes.js';
import integrationsAdminRoutes from './routes/integrationsAdminRoutes.js';
import syncRoutes              from './routes/syncRoutes.js';
import './workers/syncWorker.js';
import './workers/webhookWorker.js';
import './events/index.js'; // Phase 11.0 — boot the unified Event Platform (registers subscribers)
import './graph/index.js';  // Phase 11.1 — boot the Operational Graph Engine (graph subscriber)
import './workers/eventRetentionWorker.js'; // Phase 11.0 — daily event-store prune cron
import './workers/predictionWorker.js';      // Phase 11.5 — proactive prediction scan cron
import workRoutes           from './routes/workRoutes.js';
import knowledgeRoutes      from './routes/knowledgeRoutes.js';
import crmRoutes            from './routes/crmRoutes.js';
import hrRoutes             from './routes/hrRoutes.js';
import workflowRoutes       from './routes/workflowRoutes.js';
import runtimeRoutes        from './routes/runtimeRoutes.js';
import { workflowInstanceRouter, callbackRouter } from './routes/workflowInstanceRoutes.js';
import { startWorkflowRuntime } from './runtime/index.js';
import { loadRegistry }         from './actionRegistry/index.js';

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

// CORS — configurable via CORS_ORIGIN env var; defaults to '*' in dev only.
// Set CORS_ORIGIN=https://app.flowos.io in production.
const corsOrigin = process.env.CORS_ORIGIN || (process.env.NODE_ENV === 'production' ? false : '*');
app.use(cors({ origin: corsOrigin, credentials: true }));

// Response compression (gzip). Skips small responses and streams automatically.
app.use(compression());

// Security headers — no framework dependency, no heap overhead.
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '0'); // modern browsers ignore; CSP is the real guard
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

// Correlation ID — propagate the caller's id or generate one; echo it back and
// attach as req.id so logs and error responses can be traced end to end.
app.use((req, res, next) => {
  const id = req.headers['x-request-id'] || crypto.randomUUID();
  req.headers['x-request-id'] = id;
  req.id = id;
  res.setHeader('x-request-id', id);
  next();
});

// Per-request timeout. Streaming/SSE endpoints are excluded (long-lived), and the
// multi-agent council is excluded too: it fans a question out to several agents, each
// of which runs the full (inherently slow) Operational Brain, so it legitimately runs
// longer than a normal request. It has its own per-agent time-isolation internally.
//
// The single-shot Brain reasoning routes (`/api/brain/copilot`, `/api/brain/reason`)
// run one full Operational Brain pass, which on local inference (Ollama) takes
// ~28–30s — right at the default 30s ceiling, so legitimate requests were 503'ing.
// They get their own longer ceiling (still bounded, so a genuinely hung request is
// still cut off). The handler runs exactly once; the timeout only sends the 503 —
// it never cancels or re-invokes the Brain, and `!res.headersSent` prevents a late
// double-write, so there is no duplicate Brain execution.
const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS ?? 30_000);
const COUNCIL_TIMEOUT_MS = Number(process.env.COUNCIL_REQUEST_TIMEOUT_MS ?? 360_000);
const BRAIN_TIMEOUT_MS   = Number(process.env.BRAIN_REQUEST_TIMEOUT_MS ?? 120_000);
const SLOW_BRAIN_PATHS = new Set(['/api/brain/copilot', '/api/brain/reason']);
app.use((req, res, next) => {
  if (req.path.endsWith('/stream')) { next(); return; }
  const ms = req.path.startsWith('/api/council') ? COUNCIL_TIMEOUT_MS
    : SLOW_BRAIN_PATHS.has(req.path) ? BRAIN_TIMEOUT_MS
    : REQUEST_TIMEOUT_MS;
  res.setTimeout(ms, () => {
    if (!res.headersSent) res.status(503).json({ error: { code: 'REQUEST_TIMEOUT', message: 'Request exceeded server time limit.', requestId: req.id } });
  });
  next();
});

// Structured per-request logging (correlation id, method/path/status/duration).
app.use(requestLogger);

// Capture the raw request bytes on parse so webhook signature verification (HMAC
// over the exact payload) works even though the global JSON parser runs first.
// The parsed body is still available on req.body; the raw buffer on req.rawBody.
const rawBodySaver = (req, _res, buf) => { if (buf?.length) req.rawBody = buf; };
app.use(express.json({ verify: rawBodySaver }));
app.use(express.urlencoded({ extended: true, verify: rawBodySaver }));
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

// ── Kubernetes-style probes ───────────────────────────────────────────────────
// Liveness: is the process up? Cheap, never touches dependencies. Fails only if
// the event loop is wedged (the request wouldn't be served at all).
app.get('/health/live', (_req, res) => {
  res.json({ status: 'alive', uptime: process.uptime(), pid: process.pid });
});

// Readiness: should the load balancer route traffic here? Checks core deps and
// flips to 503 during graceful shutdown so traffic drains before exit.
app.get('/health/ready', async (_req, res) => {
  if (isShuttingDown()) return res.status(503).json({ status: 'shutting_down' });
  const checks = {};
  let ready = true;
  try { await db.query('SELECT 1'); checks.postgres = 'ok'; } catch (e) { checks.postgres = e.message; ready = false; }
  try { checks.redis = redisHealth().status === 'ready' ? 'ok' : redisHealth().status; if (checks.redis !== 'ok') ready = false; } catch (e) { checks.redis = e.message; ready = false; }
  res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'not_ready', checks });
});

// Operational metrics — pool, redis, queues (auth-free infra snapshot; no tenant data).
app.get('/metrics/infra', async (_req, res) => {
  res.json({
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    db: poolStats(),
    redis: redisHealth(),
    queues: await getQueueMetrics().catch(() => ({ error: 'unavailable' })),
  });
});

// ── Mount New Modules ────────────────────────────────────────────────────────
// Auth is public
app.use(authModule.prefix, authModule.routes);
console.log(`📦 Public Module mounted: ${authModule.prefix}`);

// Webhook Gateway — mounted before auth middleware (signature-verified per-provider)
import { webhookRouter as _webhookRouter } from './automation/webhookGateway/WebhookGateway.js';
app.use('/webhooks', _webhookRouter);
console.log('🪝  Webhook Gateway mounted at /webhooks/{github,slack,stripe,jira,google,custom/:connector}');

// Developer Verification Dashboard (Development Only, bypasses auth)
import devDashboardRoutes from './routes/devDashboard.js';
app.use('/dev-dashboard', devDashboardRoutes);
app.use('/api/dev', devDashboardRoutes);
console.log('🛠️ Developer Verification Dashboard mounted at /dev-dashboard');

import eventInspectorRoutes from './routes/eventInspectorRoutes.js';
app.use('/event-inspector', eventInspectorRoutes);
console.log('⚡ Event Inspector mounted at /event-inspector (dev only, ADMIN+)');

// Observability metrics + alerts — self-guarded (ADMIN JWT / METRICS_TOKEN),
// available in production for monitoring systems. Mounted before global auth.
import metricsRoutes from './routes/metricsRoutes.js';
app.use('/api/metrics', metricsRoutes);
console.log('📊 Observability metrics mounted at /api/metrics (ADMIN, all envs)');

import monitoringRoutes from './routes/monitoringRoutes.js';
app.use('/monitoring', monitoringRoutes);
console.log('📟 Monitoring dashboard mounted at /monitoring (dev only, ADMIN+)');

import graphExplorerRoutes from './routes/graphExplorerRoutes.js';
app.use('/graph-explorer', graphExplorerRoutes);
console.log('🕸️ Graph Explorer mounted at /graph-explorer (dev only, ADMIN+)');

import replayPlayerRoutes from './routes/replayPlayerRoutes.js';
app.use('/replay-player', replayPlayerRoutes);
console.log('⏵ Replay Player mounted at /replay-player (dev only, ADMIN+)');

import simulationWorkspaceRoutes from './routes/simulationWorkspaceRoutes.js';
app.use('/simulation-workspace', simulationWorkspaceRoutes);
console.log('🔮 Simulation Workspace mounted at /simulation-workspace (dev only, ADMIN+)');

import predictionWorkspaceRoutes from './routes/predictionWorkspaceRoutes.js';
app.use('/prediction-workspace', predictionWorkspaceRoutes);
console.log('📈 Prediction Workspace mounted at /prediction-workspace (dev only, ADMIN+)');

import simulatorRoutes from './routes/simulatorRoutes.js';
import { start as startSimulatorHeartbeat } from './simulator/simulatorEngine.js';
app.use('/api/simulator', simulatorRoutes);
console.log('🌱 Living Workspace Simulator mounted at /api/simulator (dev only, ADMIN+)');

// Dev-only background heartbeat — off unless SIMULATOR_ENABLED=true AND SIM_WORKSPACE_ID set.
// resolveCtx picks an OWNER of the target workspace's org to requester the approvals.
function maybeStartSimulator() {
  if (process.env.SIMULATOR_ENABLED !== 'true') return;
  const ws = process.env.SIM_WORKSPACE_ID;
  if (!ws) { console.log('🌱 Simulator heartbeat idle — set SIM_WORKSPACE_ID to target a workspace'); return; }
  startSimulatorHeartbeat(async () => {
    const { prisma } = await import('./core/config/prisma.js');
    const workspace = await prisma.workspace.findUnique({ where: { id: ws } }).catch(() => null);
    if (!workspace) return null;
    const owner = await prisma.user.findFirst({ where: { orgId: workspace.orgId, role: 'OWNER' } }).catch(() => null);
    if (!owner) return null;
    return { ws, orgId: workspace.orgId, requesterId: owner.id, userEmail: owner.email };
  });
  console.log(`🌱 Simulator heartbeat armed for ${ws}`);
}

// Webhook routes — public (external platforms POST here, no JWT)
app.use('/api/webhooks', webhookRoutes);
console.log('🪝 Webhook intake routes mounted at /api/webhooks');

// Webhook management routes — JWT-protected (mounted after auth middleware below)

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

app.use('/api/execution', executionRoutes);
console.log('⚙️  Operational Execution Engine mounted at /api/execution');

app.use('/api/collaboration', collaborationRoutes);
console.log('🤝 Merge Conflict Intelligence + Smart Collaboration mounted at /api/collaboration');

app.use('/api/notifications', notificationRoutes);
console.log('🔔 Workspace Notification Engine mounted at /api/notifications');

app.use('/api/council', councilRoutes);
console.log('🏛️  Multi-Agent Executive Council mounted at /api/council');

app.use('/api/autonomy', autonomyRoutes);
console.log('🤖 Autonomous Enterprise Engine mounted at /api/autonomy');

app.use('/api/admin', adminEnterpriseRoutes);
console.log('🏢 Enterprise Admin Console mounted at /api/admin');

app.use('/api/trust', trustRoutes);
console.log('🔍 Trust Center mounted at /api/trust');

app.use('/api/workspace', workspaceRoutes);
console.log('⚡ Workspace Intelligence Cache mounted at /api/workspace');
startWorkspaceCache();

import ingestionTraceRoutes from './routes/ingestionTraceRoutes.js';
app.use('/api/observability/ingestion-trace', ingestionTraceRoutes);
console.log('🔎 Safe ingestion trace mounted at /api/observability/ingestion-trace (JWT + workspace-id)');

app.use('/api/workday', workdayRoutes);
console.log('🧭 Adaptive Workday Engine mounted at /api/workday');

import onboardingRoutes from './routes/onboardingRoutes.js';
app.use('/api/onboarding', onboardingRoutes);
console.log('🚀 Onboarding (Pilot Experience) mounted at /api/onboarding');

import successRoutes from './routes/successRoutes.js';
app.use('/api/success', successRoutes);
console.log('📊 Success / Value Dashboard mounted at /api/success');

import roiRoutes from './routes/roiRoutes.js';
app.use('/api/roi', roiRoutes);
console.log('💰 ROI Engine mounted at /api/roi');

import partnerRoutes from './routes/partnerRoutes.js';
app.use('/api/partners', partnerRoutes);
console.log('🤝 Design Partner routes mounted at /api/partners');

import analyticsRoutes from './routes/analyticsRoutes.js';
import feedbackRoutes  from './routes/feedbackRoutes.js';
import './analytics/analyticsSubscriber.js';
import { scheduleDigestCron } from './analytics/digestService.js';
app.use('/api/analytics', analyticsRoutes);
console.log('📈 Pilot Analytics mounted at /api/analytics');
app.use('/api/feedback',  feedbackRoutes);
console.log('💬 Pilot Feedback mounted at /api/feedback');

app.use('/api/policies', policyRoutes);
console.log('🔐 Policy Management routes mounted at /api/policies');

app.use('/api/integration-permissions', integrationPermissionsRoutes);
console.log('🛡️  Integration Permissions mounted at /api/integration-permissions');

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

// Multi-Agent Cognitive Brain — agents sub-router MUST be mounted before /api/brain
// so Express matches /api/brain/agents/* before the general /api/brain prefix.
app.use('/api/brain/agents', brainAgentRoutes);
console.log('🧠 Multi-Agent Cognitive Brain routes mounted at /api/brain/agents');

app.use('/api/executive', executiveRoutes);
console.log('🎯 Executive Operations Intelligence routes mounted at /api/executive');

app.use('/api/brain', brainRoutes);
console.log('🧠 Autonomous Brain routes mounted at /api/brain');

import explainRoutes from './routes/explainRoutes.js';
app.use('/api/explain', explainRoutes);
console.log('🔍 Explainable Intelligence routes mounted at /api/explain');

app.use('/api/ai', aiRoutes);
console.log('🤖 AI Provider Layer routes mounted at /api/ai');

app.use('/api/workspace', autonomousRoutes);
console.log('🔮 Autonomous Workspace Engine routes mounted at /api/workspace');

app.use('/api/autonomous', phase19Routes);
console.log('🤖 Phase 19 Autonomous Operations routes mounted at /api/autonomous');

app.use('/api/events', eventRoutes);
console.log('⚡ Real-Time Event Intelligence routes mounted at /api/events');

import graphRoutes from './routes/graphRoutes.js';
app.use('/api/graph', graphRoutes);
console.log('🕸️ Operational Graph (Digital Twin) routes mounted at /api/graph');

import replayRoutes from './routes/replayRoutes.js';
app.use('/api/replay', replayRoutes);
console.log('⏵ Workspace Replay (DVR) routes mounted at /api/replay');

import simulationEngineRoutes from './routes/simulationEngineRoutes.js';
app.use('/api/simulation', simulationEngineRoutes);
console.log('🔮 What-If Simulation routes mounted at /api/simulation');

import predictionRoutes from './routes/predictionRoutes.js';
app.use('/api/predictions', predictionRoutes);
console.log('📈 Predictive Workspace Intelligence routes mounted at /api/predictions');

import consequenceRoutes from './routes/consequenceRoutes.js';
app.use('/api/consequences', consequenceRoutes);
console.log('🔗 Consequence Engine (cross-tool) mounted at /api/consequences');

app.use('/api/google', googleRoutes);
console.log('🔑 Google OAuth routes mounted at /api/google');

app.use('/api/integrations-hub', integrationsAdminRoutes);
console.log('🔌 Integration Hub Admin routes mounted at /api/integrations-hub');

app.use('/api/sync', syncRoutes);
console.log('🔄 Sync Management routes mounted at /api/sync');

app.use('/api/webhooks/manage', webhookManagementRoutes);
console.log('🪝 Webhook Management routes mounted at /api/webhooks/manage');

app.use('/api/workflows', workflowRoutes);
console.log('🔀 Workflow routes mounted at /api/workflows');

// Universal Workflow Runtime:
//   POST   /api/workflow-executions                  — launch any registered workflow
//   GET    /api/workflow-executions                  — list executions
//   GET    /api/workflow-executions/:id              — single execution
//   POST   /api/workflow-executions/:id/pause|resume|cancel
//   GET    /api/workflow-executions/:id/stream       — SSE
//   GET    /api/workflow-executions/definitions      — registered workflow definitions
//   GET    /api/workflow-executions/definitions/:id  — single definition
app.use('/api/workflow-executions', runtimeRoutes);
console.log('🔀 Runtime routes mounted at /api/workflow-executions');

// Phase 9 — Long-running workflow instance management + external callbacks
app.use('/api/workflow-instances', workflowInstanceRouter);
app.use('/webhook/workflow-callback', callbackRouter);
console.log('⏳ Workflow Instance routes mounted at /api/workflow-instances');
console.log('🔗 Workflow callback webhook mounted at /webhook/workflow-callback/:token');

import registryRoutes from './routes/registryRoutes.js';
app.use('/api/registry', registryRoutes);
console.log('📋 Action Registry routes mounted at /api/registry');

import automationRoutes from './routes/automationRoutes.js';
app.use('/api/automation', automationRoutes);
console.log('⚡ Automation Platform routes mounted at /api/automation');

import extensionRoutes from './routes/extensionRoutes.js';
import { configureExtensionApi, startExtensionSystem } from './extensions/index.js';
app.use('/api/extensions', extensionRoutes);
console.log('🧩 Extension Marketplace routes mounted at /api/extensions');

import kgRoutes from './routes/knowledgeGraphRoutes.js';
app.use('/api/kg', kgRoutes);
console.log('🕸️  Enterprise Knowledge Graph routes mounted at /api/kg');

import fvepRoutes from './routes/fvepRoutes.js';
app.use('/api/fvep', fvepRoutes);
console.log('🧪 FVEP Validation & Evaluation Platform mounted at /api/fvep');

import certificationRoutes from './routes/certificationRoutes.js';
app.use('/api/connectors/certification', certificationRoutes);
console.log('✅ Connector Certification Engine mounted at /api/connectors/certification');

// ── Error Handler (must be last) ────────────────────────────────────────────
app.use(errorHandler);

// ── HTTP Server ───────────────────────────────────────────────────────────────
const httpServer = createServer(app);

// Exported for future in-process integration testing. Integration tests currently use
// the connect-to-running-server pattern (tests/helpers/setup.js) which requires npm run dev.
// Future: wire supertest directly to createApp() to make tests self-contained.
export function createApp() {
  return { app, httpServer };
}

// ── Boot (only when this file is run directly) ───────────────────────────────
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  httpServer.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`⚠️  Port ${PORT} in use — killing occupant and retrying in 1 s…`);
      try { execSync(`lsof -ti :${PORT} | xargs kill -9`); } catch (_) {}
      setTimeout(() => httpServer.listen(PORT, '0.0.0.0'), 1000);
    } else {
      console.error('HTTP server error:', err);
      process.exit(1);
    }
  });

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`\n=================================================`);
    console.log(`⚡ FLOW OS Platform Engine v2.0`);
    console.log(`⚡ Listening on http://127.0.0.1:${PORT}`);
    console.log(`⚡ Modules: ${protectedModules.length + 1} loaded`);
    console.log(`=================================================`);

    initSocketServer(httpServer);
    loadRegistry().catch(err => console.error('[ActionRegistry] boot load error (non-fatal):', err.message));
    startWorkflowRuntime().catch(err => console.error('[WorkflowRuntime] boot error:', err.message));
    import('./automation/index.js').then(({ startAutomationPlatform }) =>
      startAutomationPlatform().catch(err => console.error('[AutomationPlatform] boot error (non-fatal):', err.message))
    ).catch(() => {});
    startCognitiveBrain();
    startAutonomousScheduler();
    startAutonomyEngine().catch(err => console.error('[AutonomyEngine] boot error (non-fatal):', err.message));
    startHA().catch(err => console.error('[HA] boot error (non-fatal):', err.message));
    scheduleDigestCron();
    import('./knowledge/index.js').then(({ startKnowledgeGraph }) =>
      startKnowledgeGraph().catch(err => console.error('[KnowledgeGraph] boot error (non-fatal):', err.message))
    ).catch(() => {});
    registerGracefulShutdown(httpServer);
    console.log('🛡️  Graceful shutdown + probes armed (/health/live, /health/ready, /metrics/infra)');
    maybeStartSimulator();

    // Phase 14 — Extension System: configure the scoped API surface and start.
    // Non-fatal: an extension load error should never crash the host server.
    configureExtensionApi({
      events:      { query: () => Promise.resolve([]), publish: () => Promise.resolve() },
      graph:       {},
      memory:      {},
      executions:  {},
      connectors:  {
        register:   (id, adapter) => {
          const { registry } = require('./connectors/registry.js');
          if (registry?.register) registry.register(id, adapter);
        },
        unregister: () => {},
        health:     async (id) => ({ status: 'HEALTHY', connectorId: id }),
      },
      agents:      {
        register:   (def) => { try { const { registerAgent } = require('./brain/registry/AgentRegistry.js'); registerAgent(def); } catch {} },
        unregister: () => {},
      },
      workflows:   {
        register:   (def, fn) => { try { const { WorkflowLoader } = require('./runtime/WorkflowLoader.js'); WorkflowLoader.getInstance()?.registerWorkflow(def, fn); } catch {} },
        unregister: (id) => { try { const { WorkflowLoader } = require('./runtime/WorkflowLoader.js'); WorkflowLoader.getInstance()?.unregisterWorkflow(id); } catch {} },
      },
      actions:     {},
      routes:      { mount: (path, router) => app.use(path, router) },
      widgets:     { register: () => {}, unregister: () => {} },
      executive:   {},
      predictions: {},
      kpis:        {},
    });
    startExtensionSystem().catch(err =>
      console.error('[Extensions] boot error (non-fatal):', err.message),
    );

    // AI provider warmup — pre-establish the TCP/TLS connection to Ollama so the
    // first user query doesn't pay a cold-start penalty. Failures are non-fatal.
    _warmupAIProviders();
  });
}

function _warmupAIProviders() {
  const ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
  fetch(`${ollamaUrl}/api/tags`, { method: 'GET', signal: AbortSignal.timeout(5000) })
    .then(() => console.log('[Warmup] Ollama connection pre-established'))
    .catch(() => { /* Ollama may not be running — non-fatal */ });
}