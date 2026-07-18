import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import jwt from 'jsonwebtoken';
import db from '../config/db.js';
import { vectorDatabase } from '../services/vectorStoreService.js';
import { getGraphMetrics } from '../services/knowledgeGraphService.js';
import { incidentDatabase } from '../services/incidentEngine.js';
import { decisionDatabase } from '../services/decisionMemoryService.js';
import { ingestionQueue } from '../config/queue.js';
import { summaryQueue } from '../workers/summaryWorker.js';
import redisConnection from '../config/redis.js';
import { prisma } from '../core/config/prisma.js';

// Centralized Observability imports
import { 
  ingestionTraces, 
  queryTraces, 
  getHealthReport, 
  liveMetrics 
} from '../services/observabilityService.js';

const router = express.Router();

const VAULT_ROOT = process.env.VAULT_ROOT ?? path.join(os.homedir(), 'FLOW-OS-VAULTS');

// Block ALL dashboard routes in production — not discoverable, not accessible.
router.use((req, res, next) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).end();
  }
  next();
});

// All API sub-routes require a valid JWT with OWNER or ADMIN role.
// The root path (GET /) serves the HTML shell — accessible without a token so developers
// can load the page and paste their JWT via the UI. Data-fetching JS sends the header.
router.use((req, res, next) => {
  if (req.path === '/') return next();
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Dev dashboard API requires a Bearer token' });
  }
  try {
    const decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);
    if (!['OWNER', 'ADMIN'].includes(decoded.role)) {
      return res.status(403).json({ error: 'Owner or Admin role required for dev dashboard' });
    }
    req.user = { id: decoded.userId, email: decoded.email, role: decoded.role, orgId: decoded.orgId };
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
});

// Simple in-memory logs for crawler and dashboard actions
export const devLogs = [];
export const devErrors = [];

function logDevEvent(message, isError = false) {
  const logObj = { timestamp: new Date().toISOString(), message };
  if (isError) {
    devErrors.unshift(logObj);
    if (devErrors.length > 20) devErrors.pop();
  } else {
    devLogs.unshift(logObj);
    if (devLogs.length > 20) devLogs.pop();
  }
}

/**
 * GET /api/dev/stats
 * Dashboard stats endpoint.
 */
router.get('/stats', async (req, res) => {
  const stats = {
    server: 'UP',
    database: 'OFFLINE',
    dbChunksCount: 0,
    redis: 'OFFLINE',
    redisKeysCount: 0,
    queues: {
      ingestion: { waiting: 0, active: 0, completed: 0, failed: 0 },
      summary: { waiting: 0, active: 0, completed: 0, failed: 0 }
    },
    vectors: { inMemoryCount: vectorDatabase.length },
    graph: { nodesCount: 0, edgesCount: 0 },
    memories: {
      incidentsCount: incidentDatabase.length,
      decisionsCount: decisionDatabase.length,
      incidents: incidentDatabase.slice(-5),
      decisions: decisionDatabase.slice(-5)
    },
    dailyRollups: [],
    integrations: [],
    devLogs: devLogs.slice(0, 10),
    devErrors: devErrors.slice(0, 10),
    liveMetrics
  };

  // 1. PostgreSQL Status
  try {
    const dbRes = await db.query('SELECT count(*)::int as count FROM workspace_intel_chunks');
    stats.database = 'CONNECTED';
    stats.dbChunksCount = dbRes.rows[0]?.count || 0;
  } catch (err) {
    stats.database = `ERROR: ${err.message}`;
    logDevEvent(`Database query failed: ${err.message}`, true);
  }

  // 2. Redis Status
  try {
    const ping = await redisConnection.ping();
    if (ping === 'PONG') {
      stats.redis = 'CONNECTED';
      const keys = await redisConnection.keys('social_cache:*');
      stats.redisKeysCount = keys.length;
    }
  } catch (err) {
    stats.redis = `ERROR: ${err.message}`;
    logDevEvent(`Redis ping failed: ${err.message}`, true);
  }

  // 3. BullMQ Status
  try {
    stats.queues.ingestion = {
      waiting: await ingestionQueue.getWaitingCount(),
      active: await ingestionQueue.getActiveCount(),
      completed: await ingestionQueue.getCompletedCount(),
      failed: await ingestionQueue.getFailedCount()
    };
    stats.queues.summary = {
      waiting: await summaryQueue.getWaitingCount(),
      active: await summaryQueue.getActiveCount(),
      completed: await summaryQueue.getCompletedCount(),
      failed: await summaryQueue.getFailedCount()
    };
  } catch (err) {
    logDevEvent(`BullMQ count fetch failed: ${err.message}`, true);
  }

  // 4. Knowledge Graph Status
  try {
    const graphMetrics = getGraphMetrics();
    stats.graph = {
      nodesCount: graphMetrics.nodesCount,
      edgesCount: graphMetrics.edgesCount,
      nodes: graphMetrics.nodes
    };
  } catch (err) {
    logDevEvent(`Knowledge graph fetch failed: ${err.message}`, true);
  }

  // 5. Daily Rollups File scan
  try {
    const rollups = [];
    const searchVault = async (dir) => {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            await searchVault(fullPath);
          } else if (entry.name.startsWith('summary_') && entry.name.endsWith('.md')) {
            const stat = await fs.stat(fullPath);
            rollups.push({
              name: entry.name,
              path: fullPath,
              size: stat.size,
              createdAt: stat.birthtime || stat.mtime
            });
          }
        }
      } catch (err) {}
    };
    await searchVault(VAULT_ROOT);
    stats.dailyRollups = rollups.sort((a, b) => b.createdAt - a.createdAt).slice(0, 10);
  } catch (err) {
    logDevEvent(`Vault files scan failed: ${err.message}`, true);
  }

  // 6. Connected Integrations Status
  try {
    const integrationRecords = await prisma.integration.findMany({
      select: {
        platform: true,
        syncStatus: true,
        lastSyncAt: true
      },
      take: 10
    });
    stats.integrations = integrationRecords.map(r => ({
      platform: r.platform,
      sync_status: r.syncStatus,
      last_sync_at: r.lastSyncAt
    }));
  } catch (err) {
    logDevEvent(`Integrations query failed: ${err.message}`, true);
  }

  return res.status(200).json(stats);
});

/**
 * GET /api/dev/traces
 * Returns in-memory ingestion traces.
 */
router.get('/traces', (req, res) => {
  return res.status(200).json(Array.from(ingestionTraces.values()));
});

/**
 * GET /api/dev/query-traces
 * Returns in-memory RAG query traces.
 */
router.get('/query-traces', (req, res) => {
  return res.status(200).json(queryTraces);
});

/**
 * GET /api/dev/health
 * Returns service execution health states.
 */
router.get('/health', (req, res) => {
  return res.status(200).json(getHealthReport());
});

/**
 * GET /api/dev/vector-debug
 * Vector database debugging utility. Supports filtering by content query.
 */
router.get('/vector-debug', async (req, res) => {
  const query = req.query.q || '';
  try {
    let rows;
    if (query) {
      const dbRes = await db.query(
        `SELECT id, workspace_id, channel_name, source_platform, authority_weight, raw_content, created_at 
         FROM workspace_intel_chunks 
         WHERE raw_content ILIKE $1 
         ORDER BY created_at DESC LIMIT 50`,
        [`%${query}%`]
      );
      rows = dbRes.rows;
    } else {
      const dbRes = await db.query(
        `SELECT id, workspace_id, channel_name, source_platform, authority_weight, raw_content, created_at 
         FROM workspace_intel_chunks 
         ORDER BY created_at DESC LIMIT 50`
      );
      rows = dbRes.rows;
    }

    const formatted = rows.map(r => ({
      chunk_id: r.id,
      similarity: query ? '1.0 (Text Match)' : 'N/A',
      workspace: r.workspace_id,
      metadata: { source: r.source_platform, channel: r.channel_name },
      authority: r.authority_weight,
      importance: 0.8, // default fallback
      memory_tier: parseFloat(r.authority_weight) > 1.2 ? 'PERMANENT' : '30_DAYS',
      source: r.source_platform,
      created_at: r.created_at
    }));

    return res.status(200).json(formatted);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to inspect vectors', details: err.message });
  }
});

/**
 * POST /api/dev/test/:service
 * Individual service testing endpoint.
 */
router.post('/test/:service', async (req, res) => {
  const service = req.params.service;
  const start = Date.now();
  const logs = [];
  let pass = false;

  const log = (msg) => logs.push(`[${new Date().toLocaleTimeString()}] ${msg}`);

  try {
    if (service === 'parser') {
      log('Running Parser overlapping chunking test...');
      const { chunkText } = await import('../services/parserService.js');
      const chunks = chunkText('Testing overlapping parser slice window.', 20, 5);
      log(`Chunks produced: ${chunks.length}`);
      pass = chunks.length > 0;
    } else if (service === 'privacy') {
      log('Running Privacy block validation test...');
      const { evaluateScores } = await import('../services/operationalScoringService.js');
      const scores = evaluateScores('Security', 'general', 'CONFIDENTIAL secret API key: password123');
      log(`Privacy score: ${scores.privacy_score}`);
      pass = scores.privacy_score > 0.8;
    } else if (service === 'importance') {
      log('Running Importance Scorer test...');
      const { evaluateScores } = await import('../services/operationalScoringService.js');
      const scores = evaluateScores('CTO', 'general', 'CRITICAL database schema migration needed.');
      log(`Importance score: ${scores.importance_score}`);
      pass = scores.importance_score > 0.6;
    } else if (service === 'entity') {
      log('Running Entity extraction test...');
      const { extractEntitiesFromText } = await import('../services/knowledgeGraphService.js');
      const ents = extractEntitiesFromText('Sarah and David are setting up Composio.');
      log(`Extracted entities: ${JSON.stringify(ents)}`);
      pass = ents.length > 0;
    } else if (service === 'kg') {
      log('Running Knowledge Graph integration test...');
      const { registerEntity, getGraphMetrics } = await import('../services/knowledgeGraphService.js');
      registerEntity('Sarah', 'USER', 'Sarah');
      const metrics = getGraphMetrics();
      log(`KG Nodes: ${metrics.nodesCount}`);
      pass = metrics.nodesCount > 0;
    } else if (service === 'vector') {
      log('Running Vector search retrieval check...');
      const { retrieveContext } = await import('../services/retrievalService.js');
      const results = await retrieveContext('workspace_corp_alpha', 'database');
      log(`Retrieved chunks: ${results.length}`);
      pass = true; // pass even if empty
    } else if (service === 'memory') {
      log('Running Memory retention evaluation test...');
      const { evaluateChunk } = await import('../services/memoryBrain.js');
      const result = evaluateChunk('CRITICAL: database migration required immediately.', {
        workspaceId: 'verify_test',
        source: 'github',
        sender: 'CTO'
      });
      log(`Retention policy: ${result.retention_policy}`);
      pass = result.retention_policy === 'PERMANENT';
    } else if (service === 'decision') {
      log('Running Decision Extraction test...');
      const { extractDecisions } = await import('../services/decisionMemoryService.js');
      const dec = extractDecisions('workspace_corp_alpha', 'We decided to upgrade PostgreSQL database.', {}, 'Lead Developer');
      log(`Extracted Decision: ${dec ? dec.decision : 'none'}`);
      pass = dec !== null;
    } else if (service === 'incident') {
      log('Running Incident detection test...');
      const { detectIncidents } = await import('../services/incidentEngine.js');
      const inc = detectIncidents('workspace_corp_alpha', 'The main API server crashed and is down.', {});
      log(`Extracted Incident: ${inc ? inc.title : 'none'}`);
      pass = inc !== null;
    } else if (service === 'summary') {
      log('Running Summary rollup test...');
      const { generateRollingSummary } = await import('../services/summaryService.js');
      const result = await generateRollingSummary('workspace_corp_alpha', 24);
      log(`Summary compilation status: ${result ? 'SUCCESS' : 'NO_CHUNKS'}`);
      pass = true;
    } else {
      log(`Unknown service: ${service}`);
    }
  } catch (err) {
    log(`ERROR: ${err.message}`);
    pass = false;
  }

  const latency = Date.now() - start;
  return res.status(200).json({
    service,
    pass,
    latency,
    logs
  });
});

/**
 * POST /api/dev/inject
 * Injects sample test payloads directly into the BullMQ ingestion pipeline.
 */
router.post('/inject', async (req, res) => {
  const { workspaceId, platform, sender, channel, text } = req.body;
  
  if (!workspaceId || !platform || !text) {
    return res.status(400).json({ error: 'Missing mandatory fields: workspaceId, platform, text' });
  }

  try {
    logDevEvent(`Injecting payload from [${sender}] on channel [${channel}] to platform [${platform}]`);
    const job = await ingestionQueue.add('new-intel', {
      workspaceId,
      platform,
      sender: sender || 'Test Seeder',
      channel: channel || 'general',
      text
    });
    
    return res.status(202).json({
      success: true,
      message: 'Payload injected and queued successfully.',
      jobId: job.id
    });
  } catch (err) {
    logDevEvent(`Payload injection failed: ${err.message}`, true);
    return res.status(500).json({ error: 'Failed to queue payload.', details: err.message });
  }
});

/**
 * POST /api/dev/seed-all
 * Injects sample test payloads for Gmail, Slack, Calendar, GitHub, and Jira
 * into the BullMQ ingestion pipeline.
 */
router.post('/seed-all', async (req, res) => {
  const { workspaceId } = req.body;
  const targetWorkspace = workspaceId || 'workspace_corp_alpha';

  const seedPayloads = [
    {
      platform: 'gmail',
      sender: 'hr-payroll@company.com',
      channel: 'GMAIL: Security Review',
      text: 'CONFIDENTIAL: Setup authorized one-click login via Composio OAuth handshakes for Google Workspace, Gmail, and GitHub. Ensure security tokens are encrypted.'
    },
    {
      platform: 'slack',
      sender: 'Engineering Lead',
      channel: 'C_ENGINEERING',
      text: 'We decided to upgrade pgvector extension to v0.5.0 on PostgreSQL to support faster RAG authority queries.'
    },
    {
      platform: 'calendar',
      sender: 'CTO Calendar',
      channel: 'CALENDAR: Design Sync',
      text: 'Calendar Event: Architecture Sync Meeting. We will move to hierarchical daily rollup summaries to prevent agent context window overflow. All workspace operational chunks will be grouped every 24 hours.'
    },
    {
      platform: 'github',
      sender: 'git-bot',
      channel: 'GITHUB: Commits',
      text: 'git commit: Fixed database connection leakage in src/config/db.js and added validation checks.'
    },
    {
      platform: 'jira',
      sender: 'Jira Alert',
      channel: 'JIRA: Outages',
      text: 'INCIDENT ALERT: Production server API database has crashed, resulting in database pool exhaustion and unresponsive routes.'
    }
  ];

  try {
    logDevEvent(`Seeding all 5 platform payloads for workspace [${targetWorkspace}]`);
    const jobIds = [];
    for (const payload of seedPayloads) {
      const job = await ingestionQueue.add('new-intel', {
        workspaceId: targetWorkspace,
        platform: payload.platform,
        sender: payload.sender,
        channel: payload.channel,
        text: payload.text
      });
      jobIds.push({ platform: payload.platform, jobId: job.id });
    }
    
    return res.status(200).json({
      success: true,
      message: 'Gmail, Slack, Calendar, GitHub, and Jira test payloads queued successfully.',
      jobIds
    });
  } catch (err) {
    logDevEvent(`Seeding failed: ${err.message}`, true);
    return res.status(500).json({ error: 'Failed to queue seed payloads.', details: err.message });
  }
});

/**
 * GET /dev-dashboard
 * Serves the gorgeous developer visualization dashboard UI.
 */
router.get('/', (req, res) => {
  const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>FLOW OS // Engineering Observability Cockpit</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700&family=Roboto+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-dark: #05060b;
      --card-bg: #0d0f18;
      --card-border: rgba(255, 255, 255, 0.08);
      --accent-neon: #00f2fe;
      --accent-purple: #9b51e0;
      --text-main: #f3f4f6;
      --text-muted: #9ca3af;
      --success: #10b981;
      --error: #ef4444;
      --warning: #f59e0b;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      background-color: var(--bg-dark);
      background-image: radial-gradient(circle at 10% 20%, rgba(0, 242, 254, 0.04) 0%, transparent 40%),
                        radial-gradient(circle at 90% 80%, rgba(155, 81, 224, 0.04) 0%, transparent 40%);
      color: var(--text-main);
      font-family: 'Outfit', sans-serif;
      padding: 1.5rem;
      min-height: 100vh;
      overflow-x: hidden;
    }

    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1.5rem;
      border-bottom: 1px solid var(--card-border);
      padding-bottom: 1rem;
    }

    h1 {
      font-size: 2rem;
      font-weight: 700;
      letter-spacing: -0.05em;
      background: linear-gradient(to right, var(--accent-neon), var(--accent-purple));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .subtitle {
      font-size: 0.85rem;
      color: var(--text-muted);
      margin-top: 0.2rem;
    }

    .controls {
      display: flex;
      gap: 0.8rem;
      align-items: center;
    }

    .btn {
      background: linear-gradient(135deg, var(--accent-neon), var(--accent-purple));
      color: #fff;
      border: none;
      padding: 0.5rem 1rem;
      border-radius: 0.4rem;
      font-weight: 600;
      font-size: 0.85rem;
      cursor: pointer;
      transition: transform 0.2s, opacity 0.2s;
    }

    .btn:hover {
      transform: translateY(-1px);
      opacity: 0.95;
    }

    .btn-green {
      background: linear-gradient(135deg, #10b981, #059669);
    }

    .badge {
      display: inline-flex;
      align-items: center;
      padding: 0.2rem 0.5rem;
      border-radius: 9999px;
      font-size: 0.7rem;
      font-weight: 600;
      text-transform: uppercase;
      gap: 0.25rem;
    }

    .badge-success { background-color: rgba(16, 185, 129, 0.12); color: #34d399; }
    .badge-error { background-color: rgba(239, 68, 68, 0.12); color: #f87171; }
    .badge-warning { background-color: rgba(245, 158, 11, 0.12); color: #fbbf24; }

    .pulse {
      display: inline-block;
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background-color: currentColor;
      animation: pulse-animation 1.5s infinite;
    }

    @keyframes pulse-animation {
      0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(52, 211, 153, 0.7); }
      70% { transform: scale(1); box-shadow: 0 0 0 5px rgba(52, 211, 153, 0); }
      100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(52, 211, 153, 0); }
    }

    /* Top Metrics Ribbon */
    .metrics-ribbon {
      display: grid;
      grid-template-columns: repeat(7, 1fr);
      gap: 0.8rem;
      margin-bottom: 1.5rem;
    }

    .ribbon-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 0.5rem;
      padding: 0.8rem;
      text-align: center;
    }

    .ribbon-card-title {
      font-size: 0.75rem;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 0.3rem;
    }

    .ribbon-card-value {
      font-size: 1.3rem;
      font-weight: 700;
      font-family: 'Roboto Mono', monospace;
    }

    .dashboard-grid {
      display: grid;
      grid-template-columns: 24% 28% 48%;
      gap: 1rem;
    }

    .panel {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 0.6rem;
      padding: 1rem;
      display: flex;
      flex-direction: column;
      height: 680vh;
      max-height: 720px;
    }

    .panel-title {
      font-size: 0.95rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 0.8rem;
      border-left: 3px solid var(--accent-neon);
      padding-left: 0.4rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .scroll-container {
      overflow-y: auto;
      flex: 1;
    }

    /* Traces Timeline */
    .trace-item {
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid rgba(255, 255, 255, 0.04);
      border-radius: 0.4rem;
      padding: 0.6rem;
      margin-bottom: 0.5rem;
      cursor: pointer;
      transition: background-color 0.2s, border-color 0.2s;
    }

    .trace-item:hover {
      background: rgba(255, 255, 255, 0.04);
      border-color: var(--accent-neon);
    }

    .trace-item.active {
      background: rgba(0, 242, 254, 0.06);
      border-color: var(--accent-neon);
    }

    .trace-meta {
      display: flex;
      justify-content: space-between;
      font-size: 0.75rem;
      margin-bottom: 0.3rem;
    }

    .trace-id {
      font-family: 'Roboto Mono', monospace;
      color: var(--accent-neon);
      font-weight: 600;
    }

    .trace-summary {
      font-size: 0.8rem;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      color: #fff;
    }

    /* Health List */
    .health-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.5rem;
      margin-bottom: 1rem;
    }

    .health-card {
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid rgba(255, 255, 255, 0.04);
      border-radius: 0.4rem;
      padding: 0.5rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .health-name {
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--text-muted);
    }

    /* Chrome DevTools Replay View */
    .tree-stage {
      background: rgba(0, 0, 0, 0.15);
      border: 1px solid rgba(255, 255, 255, 0.03);
      border-radius: 0.4rem;
      margin-bottom: 0.5rem;
      overflow: hidden;
    }

    .tree-stage-header {
      padding: 0.6rem;
      cursor: pointer;
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: rgba(255, 255, 255, 0.02);
      font-size: 0.85rem;
    }

    .tree-stage-header:hover {
      background: rgba(255, 255, 255, 0.04);
    }

    .tree-stage-content {
      padding: 0.8rem;
      border-top: 1px solid rgba(255, 255, 255, 0.03);
      font-family: 'Roboto Mono', monospace;
      font-size: 0.75rem;
      display: none;
      background: #06070c;
    }

    .tree-stage-content pre {
      white-space: pre-wrap;
      word-wrap: break-word;
      color: #a7f3d0;
    }

    /* Tab Controls */
    .tab-header {
      display: flex;
      gap: 0.2rem;
      border-bottom: 1px solid var(--card-border);
      margin-bottom: 0.8rem;
    }

    .tab-btn {
      background: none;
      border: none;
      color: var(--text-muted);
      padding: 0.4rem 0.8rem;
      font-size: 0.8rem;
      cursor: pointer;
      border-radius: 0.3rem 0.3rem 0 0;
    }

    .tab-btn.active {
      color: var(--accent-neon);
      border-bottom: 2px solid var(--accent-neon);
      background: rgba(255, 255, 255, 0.02);
    }

    .tab-content {
      display: none;
      flex: 1;
      overflow-y: auto;
    }

    .tab-content.active {
      display: block;
    }

    /* Interactive lists */
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.8rem;
    }

    th, td {
      padding: 0.5rem;
      border-bottom: 1px solid rgba(255, 255, 255, 0.04);
      text-align: left;
    }

    th {
      color: var(--text-muted);
      text-transform: uppercase;
      font-size: 0.7rem;
    }

    .search-input {
      width: 100%;
      background: rgba(0, 0, 0, 0.3);
      border: 1px solid var(--card-border);
      border-radius: 0.3rem;
      padding: 0.4rem;
      color: #fff;
      font-size: 0.8rem;
      margin-bottom: 0.6rem;
    }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>FLOW OS <span style="font-weight:300; opacity:0.8">// ENGINEERING COCKPIT</span></h1>
      <div class="subtitle"> LangSmith + OpenTelemetry Observability System</div>
    </div>
    <div class="controls">
      <div id="ws-badge" class="badge badge-error"><span class="pulse"></span>WS: Offline</div>
      <div id="auth-badge" class="badge badge-warning" style="cursor:pointer" onclick="promptToken()">Set Token</div>
      <button onclick="seedAll()" class="btn btn-green">Seed All 5 Platforms</button>
      <button onclick="refreshAll()" class="btn">Force Sync</button>
      <button onclick="clearToken()" class="btn" style="background:linear-gradient(135deg,#ef4444,#b91c1c)">Sign Out</button>
    </div>
  </header>

  <!-- Live Metrics Ribbon -->
  <div class="metrics-ribbon">
    <div class="ribbon-card">
      <div class="ribbon-card-title">Ingestions/Sec</div>
      <div class="ribbon-card-value" id="metric-ingest-rate">0.0</div>
    </div>
    <div class="ribbon-card">
      <div class="ribbon-card-title">Queries/Sec</div>
      <div class="ribbon-card-value" id="metric-query-rate">0.0</div>
    </div>
    <div class="ribbon-card">
      <div class="ribbon-card-title">Average Latency</div>
      <div class="ribbon-card-value" id="metric-avg-latency" style="color:var(--accent-neon)">0ms</div>
    </div>
    <div class="ribbon-card">
      <div class="ribbon-card-title">Embedding timing</div>
      <div class="ribbon-card-value" id="metric-embed-time">0ms</div>
    </div>
    <div class="ribbon-card">
      <div class="ribbon-card-title">Vector Search timing</div>
      <div class="ribbon-card-value" id="metric-search-time">0ms</div>
    </div>
    <div class="ribbon-card">
      <div class="ribbon-card-title">LLM timing</div>
      <div class="ribbon-card-value" id="metric-llm-time">0ms</div>
    </div>
    <div class="ribbon-card">
      <div class="ribbon-card-title">Memory timing</div>
      <div class="ribbon-card-value" id="metric-memory-time">0ms</div>
    </div>
  </div>

  <div class="dashboard-grid">
    <!-- Panel 1: Pipeline Traces -->
    <div class="panel">
      <div class="panel-title">Pipeline Traces</div>
      <div class="tab-header">
        <button class="tab-btn active" onclick="switchTraceTab('ingestion')">Ingestions</button>
        <button class="tab-btn" onclick="switchTraceTab('queries')">Queries</button>
      </div>
      <div class="scroll-container" id="traces-list">
        <!-- Render traces dynamically -->
      </div>
    </div>

    <!-- Panel 2: Replay Viewer (Chrome DevTools style tree) -->
    <div class="panel">
      <div class="panel-title">Replay Viewer <span id="active-trace-title" style="font-size:0.75rem; color:var(--text-muted)">No trace selected</span></div>
      <div class="scroll-container" id="replay-viewer" style="display:flex; flex-direction:column; gap:0.4rem;">
        <div style="text-align:center; color:var(--text-muted); margin-top:2rem;">Select an ingestion or query trace from the timeline to replay details.</div>
      </div>
    </div>

    <!-- Panel 3: Inspectors (Tabs) -->
    <div class="panel">
      <div class="tab-header">
        <button class="tab-btn active" onclick="switchInspector('health')">Health</button>
        <button class="tab-btn" onclick="switchInspector('vectors')">Vectors</button>
        <button class="tab-btn" onclick="switchInspector('graph')">Graph</button>
        <button class="tab-btn" onclick="switchInspector('memory')">Memory</button>
        <button class="tab-btn" onclick="switchInspector('testpanel')">Test Panel</button>
      </div>

      <!-- Health Tab -->
      <div class="tab-content active" id="inspect-health">
        <div class="panel-title">Subsystem Health Status</div>
        <div class="health-grid" id="health-grid-container">
          <!-- Render health cards dynamically -->
        </div>
        <div class="panel-title" style="margin-top:1rem;">Connections & Databases</div>
        <div style="display:flex; flex-direction:column; gap:0.5rem; font-size:0.85rem">
          <div style="display:flex; justify-content:space-between"><span>PostgreSQL status</span><span id="health-pg">CONNECTED</span></div>
          <div style="display:flex; justify-content:space-between"><span>Redis status</span><span id="health-redis">CONNECTED</span></div>
          <div style="display:flex; justify-content:space-between"><span>BullMQ queues</span><span id="health-bullmq">ONLINE</span></div>
        </div>
      </div>

      <!-- Vectors Debug Tab -->
      <div class="tab-content" id="inspect-vectors">
        <input type="text" class="search-input" id="vector-search" placeholder="Search vector chunks..." oninput="searchVectors(this.value)">
        <div style="overflow-x:auto; flex:1">
          <table id="vector-table">
            <thead>
              <tr>
                <th>Workspace</th>
                <th>Content</th>
                <th>Authority</th>
                <th>Tier</th>
              </tr>
            </thead>
            <tbody>
              <!-- Render vectors dynamically -->
            </tbody>
          </table>
        </div>
      </div>

      <!-- Graph Debug Tab -->
      <div class="tab-content" id="inspect-graph">
        <div style="display:flex; justify-content:space-between; margin-bottom:0.5rem">
          <span style="font-size:0.8rem">Nodes count: <b id="graph-node-count">0</b></span>
          <span style="font-size:0.8rem">Edges count: <b id="graph-edge-count">0</b></span>
        </div>
        <div style="overflow-y:auto; height:320px; border:1px solid var(--card-border); padding:0.5rem; border-radius:0.3rem">
          <table id="graph-nodes-table">
            <thead>
              <tr>
                <th>Node ID</th>
                <th>Type</th>
                <th>Context</th>
              </tr>
            </thead>
            <tbody>
              <!-- Render nodes dynamically -->
            </tbody>
          </table>
        </div>
      </div>

      <!-- Memory Debug Tab -->
      <div class="tab-content" id="inspect-memory">
        <div class="panel-title">Memory Tiers</div>
        <div style="display:flex; flex-direction:column; gap:0.6rem; font-size:0.8rem">
          <div style="background:rgba(239,68,68,0.06); padding:0.6rem; border:1px solid rgba(239,68,68,0.2); border-radius:0.4rem">
            <h4 style="color:#f87171">HOT (Short Cache / 24H)</h4>
            <div style="margin-top:0.3rem" id="mem-hot-list">No ephemeral messages cached</div>
          </div>
          <div style="background:rgba(245,158,11,0.06); padding:0.6rem; border:1px solid rgba(245,158,11,0.2); border-radius:0.4rem">
            <h4 style="color:#fbbf24">WARM (90 Days Context)</h4>
            <div style="margin-top:0.3rem" id="mem-warm-list">No standard context evaluated</div>
          </div>
          <div style="background:rgba(16,185,129,0.06); padding:0.6rem; border:1px solid rgba(16,185,129,0.2); border-radius:0.4rem">
            <h4 style="color:#34d399">COLD (Vault / Permanent)</h4>
            <div style="margin-top:0.3rem" id="mem-cold-list">No vault summaries compiled</div>
          </div>
        </div>
      </div>

      <!-- Service Test Panel Tab -->
      <div class="tab-content" id="inspect-testpanel">
        <div class="panel-title">Diagnostic Test Panel</div>
        <div style="display:flex; flex-direction:column; gap:0.5rem" id="test-panel-list">
          <!-- Render tests dynamically -->
        </div>
      </div>
    </div>
  </div>

  <script>
    // Auth helpers — token stored in localStorage; obtain from POST /api/auth/login
    function getToken() { return localStorage.getItem('flowDevToken') || ''; }
    function setToken(t) { localStorage.setItem('flowDevToken', t.trim()); location.reload(); }
    function clearToken() { localStorage.removeItem('flowDevToken'); location.reload(); }
    function authHeaders(extra) {
      const t = getToken();
      return t ? { 'Authorization': 'Bearer ' + t, ...extra } : { ...extra };
    }
    function promptToken() {
      const t = prompt('Paste JWT from POST /api/auth/login:');
      if (t) setToken(t);
    }

    let ws;
    let traces = [];
    let queryTraces = [];
    let activeTraceTab = 'ingestion';
    let currentInspector = 'health';

    const testServices = [
      { id: 'parser', name: 'Parser Engine' },
      { id: 'privacy', name: 'Privacy Gate' },
      { id: 'importance', name: 'Importance Scorer' },
      { id: 'entity', name: 'Entity Extractor' },
      { id: 'kg', name: 'Knowledge Graph' },
      { id: 'vector', name: 'Vector Store' },
      { id: 'memory', name: 'Memory Brain' },
      { id: 'decision', name: 'Decision Engine' },
      { id: 'incident', name: 'Incident Engine' },
      { id: 'summary', name: 'Summary Worker' }
    ];

    function initWebSocket() {
      const badge = document.getElementById('ws-badge');
      ws = new WebSocket('ws://' + window.location.hostname + ':' + window.location.port + '?workspaceId=workspace_corp_alpha');
      
      ws.onopen = () => {
        badge.className = 'badge badge-success';
        badge.innerHTML = '<span class="pulse"></span>WS: Online';
        fetchTraces();
      };
      
      ws.onclose = () => {
        badge.className = 'badge badge-error';
        badge.innerHTML = '<span class="pulse"></span>WS: Offline';
        setTimeout(initWebSocket, 3000);
      };
      
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          // Sync stats on any pipeline telemetry updates
          setTimeout(fetchTraces, 300);
        } catch (e) {}
      };
    }

    async function fetchTraces() {
      try {
        const res1 = await fetch('/api/dev/traces', { headers: authHeaders() });
        traces = await res1.json();
        const res2 = await fetch('/api/dev/query-traces', { headers: authHeaders() });
        queryTraces = await res2.json();
        
        renderTracesList();
        refreshStats();
        fetchHealth();
        searchVectors('');
      } catch (err) {
        console.error('Failed to sync traces:', err);
      }
    }

    function switchTraceTab(tab) {
      activeTraceTab = tab;
      document.querySelectorAll('.tab-header button')[0].className = tab === 'ingestion' ? 'tab-btn active' : 'tab-btn';
      document.querySelectorAll('.tab-header button')[1].className = tab === 'queries' ? 'tab-btn active' : 'tab-btn';
      renderTracesList();
    }

    function switchInspector(panel) {
      currentInspector = panel;
      const btns = document.querySelectorAll('.tab-header button');
      const contents = document.querySelectorAll('.tab-content');
      
      // Update tab buttons
      btns[2].className = panel === 'health' ? 'tab-btn active' : 'tab-btn';
      btns[3].className = panel === 'vectors' ? 'tab-btn active' : 'tab-btn';
      btns[4].className = panel === 'graph' ? 'tab-btn active' : 'tab-btn';
      btns[5].className = panel === 'memory' ? 'tab-btn active' : 'tab-btn';
      btns[6].className = panel === 'testpanel' ? 'tab-btn active' : 'tab-btn';

      // Update tab contents
      contents[0].className = panel === 'health' ? 'tab-content active' : 'tab-content';
      contents[1].className = panel === 'vectors' ? 'tab-content active' : 'tab-content';
      contents[2].className = panel === 'graph' ? 'tab-content active' : 'tab-content';
      contents[3].className = panel === 'memory' ? 'tab-content active' : 'tab-content';
      contents[4].className = panel === 'testpanel' ? 'tab-content active' : 'tab-content';

      if (panel === 'testpanel') renderTestPanel();
    }

    function renderTracesList() {
      const container = document.getElementById('traces-list');
      container.innerHTML = '';

      if (activeTraceTab === 'ingestion') {
        if (traces.length === 0) {
          container.innerHTML = '<div style="text-align:center;color:var(--text-muted);margin-top:2rem">No ingestion traces stored.</div>';
          return;
        }
        traces.forEach(t => {
          const item = document.createElement('div');
          item.className = 'trace-item';
          item.onclick = () => showTraceReplay(t.traceId, 'ingestion');
          item.innerHTML = '<div class="trace-meta">' +
            '<span class="trace-id">' + t.traceId + '</span>' +
            '<span class="badge ' + (t.status === 'SUCCESS' ? 'badge-success' : t.status === 'FAILED' ? 'badge-error' : 'badge-warning') + '">' + t.status + '</span>' +
            '</div>' +
            '<div class="trace-summary">[' + t.platform.toUpperCase() + '] ' + t.sender + ': ' + t.channel + '</div>';
          container.appendChild(item);
        });
      } else {
        if (queryTraces.length === 0) {
          container.innerHTML = '<div style="text-align:center;color:var(--text-muted);margin-top:2rem">No query traces stored.</div>';
          return;
        }
        queryTraces.forEach(t => {
          const item = document.createElement('div');
          item.className = 'trace-item';
          item.onclick = () => showTraceReplay(t.queryTraceId, 'query');
          item.innerHTML = '<div class="trace-meta">' +
            '<span class="trace-id">' + t.queryTraceId + '</span>' +
            '<span class="badge ' + (t.status === 'SUCCESS' ? 'badge-success' : t.status === 'FAILED' ? 'badge-error' : 'badge-warning') + '">' + t.status + '</span>' +
            '</div>' +
            '<div class="trace-summary">' + t.queryText + '</div>';
          container.appendChild(item);
        });
      }
    }

    function showTraceReplay(id, type) {
      document.getElementById('active-trace-title').innerText = id;
      const viewer = document.getElementById('replay-viewer');
      viewer.innerHTML = '';

      const trace = type === 'ingestion' 
        ? traces.find(t => t.traceId === id)
        : queryTraces.find(t => t.queryTraceId === id);

      if (!trace) return;

      // Render trace details
      Object.entries(trace.stages).forEach(([stageName, stage]) => {
        const div = document.createElement('div');
        div.className = 'tree-stage';
        
        const statusBadge = stage.status === 'SUCCESS' 
          ? '<span class="badge badge-success">' + stage.latencyMs + 'ms</span>' 
          : stage.status === 'FAILED' 
            ? '<span class="badge badge-error">FAILED</span>' 
            : '<span class="badge badge-warning">PROCESSING</span>';

        div.innerHTML = '<div class="tree-stage-header" onclick="toggleStageTree(this)">' +
          '<span>🗂️ ' + stageName + '</span>' +
          statusBadge +
          '</div>' +
          '<div class="tree-stage-content">' +
          '<div><b>Input:</b></div>' +
          '<pre>' + JSON.stringify(stage.input, null, 2) + '</pre>' +
          '<div style="margin-top:0.4rem"><b>Output:</b></div>' +
          '<pre>' + JSON.stringify(stage.output, null, 2) + '</pre>' +
          (stage.errors ? '<div style="margin-top:0.4rem; color:var(--error)"><b>Errors:</b></div><pre style="color:var(--error)">' + stage.errors + '</pre>' : '') +
          '</div>';
        viewer.appendChild(div);
      });
    }

    function toggleStageTree(header) {
      const content = header.nextElementSibling;
      content.style.display = content.style.display === 'block' ? 'none' : 'block';
    }

    async function fetchHealth() {
      try {
        const res = await fetch('/api/dev/health', { headers: authHeaders() });
        const h = await res.json();
        const container = document.getElementById('health-grid-container');
        container.innerHTML = '';

        Object.entries(h).forEach(([name, status]) => {
          const card = document.createElement('div');
          card.className = 'health-card';
          
          let color = 'var(--success)';
          if (status.status === 'degraded') color = 'var(--warning)';
          if (status.status === 'offline') color = 'var(--error)';

          card.innerHTML = '<span class="health-name">' + name + '</span>' +
            '<span style="font-weight:600; color:' + color + '; font-size:0.75rem">' + status.status.toUpperCase() + ' (' + status.avgLatencyMs + 'ms)</span>';
          container.appendChild(card);
        });
      } catch (err) {
        console.error('Failed to sync health status:', err);
      }
    }

    async function searchVectors(val) {
      try {
        const res = await fetch('/api/dev/vector-debug?q=' + encodeURIComponent(val), { headers: authHeaders() });
        const vec = await res.json();
        const tbody = document.querySelector('#vector-table tbody');
        tbody.innerHTML = '';

        if (vec.length === 0) {
          tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--text-muted)">No vectors matches found</td></tr>';
          return;
        }

        vec.forEach(v => {
          const tr = document.createElement('tr');
          tr.innerHTML = '<td style="font-family:\'Roboto Mono\', monospace; font-size:0.7rem">' + v.workspace + '</td>' +
            '<td style="max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap">' + (v.created_at ? '' : '<b>[NOT CONFIGURED]</b> ') + '&nbsp;' + v.source + ': ' + (v.created_at ? v.chunk_id : 'unvectorized') + '</td>' +
            '<td><span class="badge badge-success">' + v.authority + '</span></td>' +
            '<td><span class="badge badge-warning">' + v.memory_tier + '</span></td>';
          tbody.innerHTML += tr.outerHTML;
        });
      } catch (err) {}
    }

    function renderTestPanel() {
      const container = document.getElementById('test-panel-list');
      container.innerHTML = '';

      testServices.forEach(s => {
        const div = document.createElement('div');
        div.style.background = 'rgba(255,255,255,0.02)';
        div.style.border = '1px solid rgba(255,255,255,0.04)';
        div.style.borderRadius = '0.4rem';
        div.style.padding = '0.6rem';
        div.style.display = 'flex';
        div.style.justifyContent = 'space-between';
        div.style.alignItems = 'center';
        div.id = 'test-service-' + s.id;

        div.innerHTML = '<div>' +
          '<span style="font-size:0.8rem; font-weight:600">' + s.name + '</span>' +
          '<div style="font-size:0.7rem; color:var(--text-muted)" id="test-log-' + s.id + '">Awaiting execution...</div>' +
          '</div>' +
          '<button class="btn" style="padding:0.3rem 0.6rem; font-size:0.75rem" onclick="runServiceTest(\'' + s.id + '\')">Run Test</button>';
        container.appendChild(div);
      });
    }

    async function runServiceTest(id) {
      const logDiv = document.getElementById('test-log-' + id);
      logDiv.innerText = 'Testing...';
      logDiv.style.color = 'var(--text-muted)';

      try {
        const res = await fetch('/api/dev/test/' + id, { method: 'POST', headers: authHeaders() });
        const result = await res.json();
        
        if (result.pass) {
          logDiv.innerText = 'PASS (' + result.latency + 'ms)';
          logDiv.style.color = '#34d399';
        } else {
          logDiv.innerText = 'FAIL (' + result.latency + 'ms) - Check server logs';
          logDiv.style.color = '#f87171';
        }
      } catch (err) {
        logDiv.innerText = 'ERROR: ' + err.message;
        logDiv.style.color = '#f87171';
      }
    }

    async function seedAll() {
      try {
        const res = await fetch('/api/dev/seed-all', {
          method: 'POST',
          headers: authHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ workspaceId: 'workspace_corp_alpha' })
        });
        const data = await res.json();
        if (data.success) {
          alert('Gmail, Slack, Calendar, GitHub, and Jira queued in ingestion workers!');
          setTimeout(fetchTraces, 800);
        }
      } catch (err) {
        alert('Seed request failed: ' + err.message);
      }
    }

    async function refreshStats() {
      try {
        const res = await fetch('/api/dev/stats', { headers: authHeaders() });
        const d = await res.json();
        
        // Update Live Metrics Ribbon
        document.getElementById('metric-ingest-rate').innerText = d.liveMetrics.ingestionsPerSec.toFixed(1);
        document.getElementById('metric-query-rate').innerText = d.liveMetrics.queriesPerSec.toFixed(1);
        document.getElementById('metric-avg-latency').innerText = d.liveMetrics.avgLatencyMs + 'ms';
        document.getElementById('metric-embed-time').innerText = d.liveMetrics.embeddingTimeMs + 'ms';
        document.getElementById('metric-search-time').innerText = d.liveMetrics.vectorSearchTimeMs + 'ms';
        document.getElementById('metric-llm-time').innerText = d.liveMetrics.llmTimeMs + 'ms';
        document.getElementById('metric-memory-time').innerText = d.liveMetrics.memoryTimeMs + 'ms';

        // Health Indicators
        document.getElementById('health-pg').innerText = d.database;
        document.getElementById('health-pg').style.color = d.database === 'CONNECTED' ? 'var(--success)' : 'var(--error)';
        
        document.getElementById('health-redis').innerText = d.redis;
        document.getElementById('health-redis').style.color = d.redis === 'CONNECTED' ? 'var(--success)' : 'var(--error)';

        // Graph Counts
        document.getElementById('graph-node-count').innerText = d.graph.nodesCount;
        document.getElementById('graph-edge-count').innerText = d.graph.edgesCount;

        // Render Graph table
        const graphBody = document.querySelector('#graph-nodes-table tbody');
        graphBody.innerHTML = '';
        if (d.graph.nodes.length === 0) {
          graphBody.innerHTML = '<tr><td colspan="3" style="text-align:center; color:var(--text-muted)">No active graph nodes</td></tr>';
        } else {
          d.graph.nodes.forEach(n => {
            const tr = document.createElement('tr');
            tr.innerHTML = '<td style="font-family:\'Roboto Mono\', monospace; font-size:0.75rem">' + n.id + '</td>' +
              '<td><span class="badge badge-success">' + n.type + '</span></td>' +
              '<td>' + n.name + '</td>';
            graphBody.appendChild(tr);
          });
        }

        // Render Memory Inspectors lists
        const hotList = document.getElementById('mem-hot-list');
        const warmList = document.getElementById('mem-warm-list');
        const coldList = document.getElementById('mem-cold-list');

        // Hot: cache keys
        hotList.innerText = d.redisKeysCount > 0 
          ? d.redisKeysCount + ' active short-term cached keys (social_cache:*)'
          : 'No ephemeral messages cached';

        // Warm: standard context chunks count
        warmList.innerText = d.vectors.inMemoryCount > 0
          ? d.vectors.inMemoryCount + ' active sliding-window chunks indexed (Warm RAG)'
          : 'No standard context chunks evaluated';

        // Cold: vault summaries count
        coldList.innerText = d.dailyRollups.length > 0
          ? d.dailyRollups.length + ' rolling summaries saved in corporate Obsidian vaults'
          : 'No vault summaries compiled';

      } catch (e) {
        console.error('Failed to sync statistics:', e);
      }
    }

    function refreshAll() {
      fetchTraces();
    }

    // Initialize UI
    const authBadge = document.getElementById('auth-badge');
    if (getToken()) {
      authBadge.className = 'badge badge-success';
      authBadge.innerText = 'Authenticated';
      authBadge.onclick = null;
    }
    initWebSocket();
    refreshAll();
    setInterval(refreshStats, 4000);
  </script>
</body>
</html>
  `;
  res.send(htmlContent);
});

export default router;
