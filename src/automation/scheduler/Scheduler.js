/**
 * Scheduler — BullMQ-backed automation scheduler.
 *
 * Supports:
 *   CRON      — repeatable cron job (uses BullMQ repeatEvery / pattern)
 *   DELAY     — one-shot delayed job
 *   RECURRING — alias for CRON with explicit repeat pattern
 *
 * When a job fires, it publishes a synthetic `system.scheduler.fired` event
 * to the FLOW event bus, which then routes to matching automation triggers.
 *
 * Queue: "automation-scheduler"
 */

import { Queue, Worker } from 'bullmq';
import redisConnection   from '../../config/redis.js';
import { publishFields } from '../../events/index.js';
import { createJob, updateJob, deleteJob, listJobs, getJob } from './ScheduledJobStore.js';
import { isBusinessHours, nextBusinessHoursStart }           from './BusinessHours.js';
import { logger }        from '../../utils/logger.js';

const QUEUE_NAME = 'automation-scheduler';

let _queue  = null;
let _worker = null;

export function getSchedulerQueue() {
  if (!_queue) {
    _queue = new Queue(QUEUE_NAME, { connection: redisConnection });
  }
  return _queue;
}

export async function startScheduler() {
  const queue = getSchedulerQueue();

  _worker = new Worker(QUEUE_NAME, async (job) => {
    const { jobId, workspaceId, eventId, payload, timezone, businessHoursOnly } = job.data;

    if (businessHoursOnly && !isBusinessHours(timezone)) {
      logger.info(`[Scheduler] Job ${jobId} skipped — outside business hours`);
      return { skipped: true };
    }

    await publishFields({
      workspaceId,
      source:   'system',
      type:     'system.scheduler.fired',
      title:    `Scheduled: ${job.name}`,
      payload:  { jobId, jobName: job.name, schedule: job.opts?.repeat?.pattern, targetEventId: eventId, payload },
      importance: 0.3,
      sourceEventId: `sched:${jobId}:${Date.now()}`,
    });

    await updateJob(jobId, workspaceId, { lastFiredAt: new Date().toISOString() }).catch(() => {});
    logger.info(`[Scheduler] Job "${job.name}" fired → event ${eventId}`);
    return { fired: true };
  }, { connection: redisConnection, concurrency: 10 });

  _worker.on('failed', (job, err) => {
    logger.error(`[Scheduler] Job ${job?.id} failed: ${err.message}`);
  });

  // Restore all enabled jobs from DB on startup
  try {
    const { rows } = await import('../../config/db.js').then(m => m.query(
      "SELECT * FROM scheduled_jobs WHERE enabled=true",
    ));
    for (const row of rows) {
      const job = {
        id: row.id, workspaceId: row.workspace_id, name: row.name,
        eventId: row.event_id, payload: row.payload ?? {},
        scheduleType: row.schedule_type, cronExpression: row.cron_expression,
        delayMs: row.delay_ms, timezone: row.timezone,
        businessHoursOnly: row.business_hours_only,
      };
      await _addToQueue(queue, job);
    }
    logger.info(`[Scheduler] Restored ${rows.length} scheduled jobs`);
  } catch (err) {
    logger.warn(`[Scheduler] Failed to restore jobs: ${err.message}`);
  }

  logger.info('[Scheduler] Started');
}

export async function scheduleJob(params) {
  const job = await createJob(params);
  const queue = getSchedulerQueue();
  const bullJobId = await _addToQueue(queue, job);
  if (bullJobId) await updateJob(job.id, params.workspaceId, { bullJobId: String(bullJobId) });
  return job;
}

export async function removeScheduledJob(id, workspaceId) {
  const job = await getJob(id, workspaceId);
  if (!job) return false;

  const queue = getSchedulerQueue();
  if (job.bullJobId) {
    try {
      const bullJob = await queue.getJob(job.bullJobId);
      if (bullJob) await bullJob.remove();
    } catch { /* non-fatal */ }
  }

  return deleteJob(id, workspaceId);
}

async function _addToQueue(queue, job) {
  const jobData = {
    jobId:            job.id,
    workspaceId:      job.workspaceId,
    eventId:          job.eventId,
    payload:          job.payload,
    timezone:         job.timezone,
    businessHoursOnly: job.businessHoursOnly,
  };

  try {
    if (job.scheduleType === 'DELAY') {
      const bj = await queue.add(job.name, jobData, { delay: job.delayMs, attempts: 2 });
      return bj.id;
    }
    if (job.scheduleType === 'CRON' || job.scheduleType === 'RECURRING') {
      const bj = await queue.add(job.name, jobData, {
        repeat: { pattern: job.cronExpression, tz: job.timezone },
        attempts: 3,
        backoff: { type: 'exponential', delay: 5_000 },
      });
      return bj.id;
    }
  } catch (err) {
    logger.warn(`[Scheduler] Failed to enqueue job ${job.id}: ${err.message}`);
  }
  return null;
}

export async function stopScheduler() {
  if (_worker) await _worker.close();
  if (_queue)  await _queue.close();
  logger.info('[Scheduler] Stopped');
}
