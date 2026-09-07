/**
 * predictionWorker — the proactive arm of Predictive Workspace Intelligence.
 *
 * On a schedule it recomputes predictions for active workspaces (those with
 * recent events), persists each run to Prediction History, and pushes a
 * PREDICTION_WARNING over WebSocket for any elevated risk — delivering the
 * "warn before it happens" mandate as push, not just pull.
 *
 * Cron via PREDICTION_CRON (default: every 6 hours). Warning threshold via
 * PREDICTION_WARN_THRESHOLD (default 65).
 */

import { Worker, Queue } from 'bullmq';
import Redis from 'ioredis';
import db from '../config/db.js';
import { predict } from '../predictions/index.js';
import { broadcastToWorkspace } from '../services/socketService.js';
import { isFrozenWorkspace } from '../core/governance/frozenWorkspaces.js';
import { logger } from '../utils/logger.js';
import dotenv from 'dotenv';
dotenv.config();

const THRESHOLD = Number(process.env.PREDICTION_WARN_THRESHOLD ?? 65);
const MAX_WORKSPACES = 50;

const connection = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', { maxRetriesPerRequest: null });

export const predictionQueue = new Queue('prediction-queue', { connection });

async function activeWorkspaces() {
  const { rows } = await db.query(
    `SELECT workspace_id, count(*)::int c FROM flow_events
      WHERE ts > NOW() - INTERVAL '7 days'
      GROUP BY workspace_id ORDER BY c DESC LIMIT $1`, [MAX_WORKSPACES]).catch(() => ({ rows: [] }));
  // Never proactively scan a frozen certification fixture (keeps its rows stable).
  return rows.map(r => r.workspace_id).filter(ws => !isFrozenWorkspace(ws));
}

export const predictionWorker = new Worker('prediction-queue', async () => {
  const workspaces = await activeWorkspaces();
  logger.rag(`[prediction] proactive scan across ${workspaces.length} active workspace(s)`);
  let warned = 0;

  for (const ws of workspaces) {
    try {
      const result = await predict(ws, { persist: true, minRisk: THRESHOLD });
      for (const risk of result.topRisks) {
        broadcastToWorkspace(ws, 'PREDICTION_WARNING', {
          type: risk.type, prediction: risk.prediction, riskScore: risk.riskScore, generatedAt: result.generatedAt,
        });
        warned++;
      }
    } catch (err) {
      logger.rag(`[prediction] scan failed for ${ws}: ${err.message}`);
    }
  }
  return { workspaces: workspaces.length, warnings: warned };
}, { connection, concurrency: 1 });

predictionWorker.on('failed', (job, err) => logger.rag(`[prediction] worker job failed: ${err.message}`));

predictionQueue.add('proactive-scan', {}, {
  repeat: { pattern: process.env.PREDICTION_CRON || '0 */6 * * *' },
  jobId: 'prediction-proactive-scan',
  removeOnComplete: { count: 20 },
  removeOnFail: { count: 20 },
}).then(() => {
  console.log('⏰ [Prediction] Proactive prediction scan scheduled.');
}).catch((err) => {
  console.warn('⚠️ [Prediction] Failed to schedule proactive scan:', err.message);
});
