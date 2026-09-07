/**
 * BackgroundAnalysisScheduler — BullMQ-backed autonomous workspace engine.
 *
 * Schedules and runs all autonomous workspace intelligence cycles:
 *
 *   08:00 daily   → Morning Brief (all active workspaces)
 *   every 15 min  → Continuous workspace analysis + notifications
 *   30 min before meeting → Pre-meeting intelligence refresh
 *   18:00 daily   → EOD digest compilation
 *
 * Rules:
 * - Does NOT modify AI Provider Layer.
 * - Does NOT add new connectors.
 * - Does NOT modify Operational Brain v2.
 * - Every job is idempotent (safe to retry on failure).
 */

import { Queue, Worker } from 'bullmq';
import { logger }                   from '../../utils/logger.js';
import { prisma }                   from '../../core/config/prisma.js';
import { dispatchCapabilities }     from '../../ai/reasoning/CapabilityDispatcher.js';
import { buildPlanForAll }          from '../../ai/reasoning/CapabilityPlanner.js';
import { compileMorningBrief }      from './MorningBriefService.js';
import { analyseWorkspace }         from './WorkspaceInsightService.js';
import { generateDailyPlan }        from './DailyPlanningEngine.js';
import { generateProactiveRecommendations } from './ProactiveRecommendationEngine.js';
import { updateDigest }             from './WorkspaceDigestService.js';
import { prioritize }               from './PriorityEngine.js';
import { fireNotifications, pushCritical } from './NotificationEngine.js';
import { broadcastToWorkspace }     from '../socketService.js';

const CONNECTION = { url: process.env.REDIS_URL || 'redis://127.0.0.1:6379' };

// ── Queue definitions ─────────────────────────────────────────────────────────

const QUEUE_NAME = 'autonomous-workspace';
export const autonomousQueue = new Queue(QUEUE_NAME, { connection: CONNECTION });

// ── Job type constants ────────────────────────────────────────────────────────

export const JobType = Object.freeze({
  MORNING_BRIEF:    'morning_brief',
  ANALYSIS_CYCLE:   'analysis_cycle',
  PRE_MEETING:      'pre_meeting',
  EOD_DIGEST:       'eod_digest',
  TRIGGER_ANALYSIS: 'trigger_analysis', // on-demand manual trigger
});

// ── Worker ────────────────────────────────────────────────────────────────────

let _worker = null;

export function startAutonomousScheduler() {
  if (_worker) return; // already running

  _worker = new Worker(
    QUEUE_NAME,
    async job => {
      const { type, workspaceId, orgId } = job.data;
      logger.rag(`[Autonomous] Job ${job.id} — type=${type} workspace=${workspaceId}`);

      switch (type) {
        case JobType.MORNING_BRIEF:
          await _runMorningBriefForAll();
          break;
        case JobType.ANALYSIS_CYCLE:
          await _runAnalysisCycle(workspaceId, orgId);
          break;
        case JobType.EOD_DIGEST:
          await _runEODDigestForAll();
          break;
        case JobType.TRIGGER_ANALYSIS:
          await _runAnalysisCycle(workspaceId, orgId, { notify: true });
          break;
        case JobType.PRE_MEETING:
          await _runPreMeetingBrief(workspaceId, orgId, job.data.meetingId);
          break;
        default:
          logger.rag(`[Autonomous] Unknown job type: ${type}`);
      }
    },
    { connection: CONNECTION, concurrency: 3 },
  );

  _worker.on('failed', (job, err) => {
    logger.rag(`[Autonomous] Job ${job?.id} failed: ${err.message}`);
  });

  _scheduleRecurringJobs().catch(err => {
    logger.rag(`[Autonomous] Failed to schedule recurring jobs: ${err.message}`);
  });

  logger.rag('[Autonomous] Scheduler started');
}

export function stopAutonomousScheduler() {
  _worker?.close();
  _worker = null;
}

// ── Job schedulers ────────────────────────────────────────────────────────────

async function _scheduleRecurringJobs() {
  // Morning brief — 8AM daily
  await autonomousQueue.add(
    JobType.MORNING_BRIEF,
    { type: JobType.MORNING_BRIEF },
    { repeat: { pattern: '0 8 * * *' }, jobId: 'morning_brief_daily' },
  );

  // Continuous analysis — every 15 minutes
  await autonomousQueue.add(
    JobType.ANALYSIS_CYCLE,
    { type: JobType.ANALYSIS_CYCLE, workspaceId: null },
    { repeat: { pattern: '*/15 * * * *' }, jobId: 'analysis_cycle_15m' },
  );

  // EOD digest — 6PM daily
  await autonomousQueue.add(
    JobType.EOD_DIGEST,
    { type: JobType.EOD_DIGEST },
    { repeat: { pattern: '0 18 * * *' }, jobId: 'eod_digest_daily' },
  );

  logger.rag('[Autonomous] Recurring jobs scheduled (8AM brief, 15m analysis, 6PM digest)');
}

// ── Job handlers ──────────────────────────────────────────────────────────────

async function _runMorningBriefForAll() {
  const workspaces = await _getActiveWorkspaces();
  logger.rag(`[Autonomous] Morning brief for ${workspaces.length} workspace(s)`);

  await Promise.allSettled(workspaces.map(async ws => {
    try {
      const brief = await compileMorningBrief(ws.id, ws.orgId);
      const plan  = buildPlanForAll();
      const caps  = await dispatchCapabilities(ws.id, plan, { domain: 'general', question: 'morning' });
      const insights = await analyseWorkspace(ws.id, caps);
      await generateDailyPlan(ws.id, brief, insights);
    } catch (err) {
      logger.rag(`[Autonomous] Morning brief failed for ${ws.id}: ${err.message}`);
    }
  }));
}

async function _runAnalysisCycle(workspaceId, orgId, opts = {}) {
  // If no specific workspace, run for all active workspaces
  const workspaces = workspaceId
    ? [{ id: workspaceId, orgId }]
    : await _getActiveWorkspaces();

  await Promise.allSettled(workspaces.map(async ws => {
    try {
      const plan    = buildPlanForAll();
      const caps    = await dispatchCapabilities(ws.id, plan, { domain: 'general', question: 'analysis' });
      const recs    = await generateProactiveRecommendations(ws.id, caps);
      const insights = await analyseWorkspace(ws.id, caps);

      await updateDigest(ws.id, caps);

      // Score items for notification filtering
      const allItems = _flattenToItems(caps);
      const scored   = prioritize(allItems);

      // Push critical items immediately
      const critical = scored.filter(i => i.scores.priority === 'critical');
      for (const item of critical) {
        pushCritical(ws.id, item);
      }

      // Fire standard notifications
      if (opts.notify !== false) {
        fireNotifications(ws.id, scored, 'continuous');
      }

      // Broadcast workspace state update
      broadcastToWorkspace(ws.id, 'WORKSPACE_ANALYSIS_COMPLETE', {
        timestamp:     new Date().toISOString(),
        totalItems:    scored.length,
        criticalCount: critical.length,
        insightCount:  insights.length,
        recCount:      recs.length,
      });
    } catch (err) {
      logger.rag(`[Autonomous] Analysis cycle failed for ${ws.id}: ${err.message}`);
    }
  }));
}

async function _runEODDigestForAll() {
  const workspaces = await _getActiveWorkspaces();
  logger.rag(`[Autonomous] EOD digest for ${workspaces.length} workspace(s)`);

  await Promise.allSettled(workspaces.map(async ws => {
    try {
      const plan = buildPlanForAll();
      const caps = await dispatchCapabilities(ws.id, plan, { domain: 'general', question: 'eod digest' });
      await updateDigest(ws.id, caps);

      broadcastToWorkspace(ws.id, 'EOD_DIGEST_READY', {
        generatedAt: new Date().toISOString(),
      });
    } catch (err) {
      logger.rag(`[Autonomous] EOD digest failed for ${ws.id}: ${err.message}`);
    }
  }));
}

async function _runPreMeetingBrief(workspaceId, orgId, meetingId) {
  if (!workspaceId) return;
  try {
    const plan = buildPlanForAll();
    const caps = await dispatchCapabilities(workspaceId, plan, { domain: 'meetings', question: 'meeting preparation' });
    await updateDigest(workspaceId, caps);

    broadcastToWorkspace(workspaceId, 'PRE_MEETING_BRIEF_READY', {
      meetingId,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    logger.rag(`[Autonomous] Pre-meeting brief failed for ${workspaceId}: ${err.message}`);
  }
}

// ── On-demand trigger (called from REST API) ──────────────────────────────────

export async function triggerAnalysis(workspaceId, orgId) {
  await autonomousQueue.add(
    JobType.TRIGGER_ANALYSIS,
    { type: JobType.TRIGGER_ANALYSIS, workspaceId, orgId },
    { jobId: `trigger_${workspaceId}_${Date.now()}` },
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function _getActiveWorkspaces() {
  try {
    const ws = await prisma.workspace.findMany({
      select: { id: true, orgId: true },
      take:   100,
    });
    return ws;
  } catch {
    return [];
  }
}

function _flattenToItems(capResults) {
  const items = [];
  for (const [cap, result] of Object.entries(capResults)) {
    if (!result?.records) continue;
    for (const r of result.records) {
      items.push({ ...r, _capability: cap });
    }
  }
  return items;
}
