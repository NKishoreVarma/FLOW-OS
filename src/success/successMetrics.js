/**
 * FLOW OS — Success / Value Metrics (Phase 17)
 *
 * The personal ROI dashboard's data source. It does NOT invent numbers — it reads real
 * records FLOW already writes (execution_records, pending_approvals, notifications,
 * flow_events) and counts what actually happened this week. Two derived numbers
 * (Time Saved, Context Switches Prevented) are transparently modeled from those counts
 * via valueModel and labeled `estimated`. Everything else is labeled `measured`.
 *
 * Reuse only — no new store, no new engine. Tenant-scoped on every query.
 */

import { prisma } from '../core/config/prisma.js';
import db from '../config/db.js';
import { MINUTES_PER, estimateMinutes, VALUE_MODEL } from './valueModel.js';

const DAY = 24 * 3600 * 1000;
const rx = (s) => new RegExp(s, 'i');

/**
 * @param {string} workspaceId
 * @param {{ sinceDays?: number }} opts
 * @returns hybrid summary: measured counts + estimated Time Saved / Context Switches.
 */
export async function getWeeklySummary(workspaceId, { sinceDays = 7 } = {}) {
  if (!workspaceId) throw new Error('workspaceId required');
  const since = new Date(Date.now() - sinceDays * DAY);

  // ── Measured: pull the raw records once, count in memory (one round-trip each) ──────
  const [executions, approvalsExecuted, meetingEvents] = await Promise.all([
    prisma.executionRecord.findMany({
      where: { workspaceId, status: 'EXECUTED', createdAt: { gte: since } },
      select: { connector: true, actionType: true },
    }),
    prisma.pendingApproval.count({ where: { workspaceId, status: { in: ['EXECUTED', 'APPROVED'] }, createdAt: { gte: since } } }),
    db.query(
      `SELECT count(*)::int c FROM flow_events
       WHERE workspace_id = $1 AND ts >= $2 AND (event_type = 'meeting' OR metadata->>'kind' = 'meeting')`,
      [workspaceId, since.toISOString()],
    ).then((r) => r.rows[0]?.c ?? 0),
  ]);

  const tasksCompleted = executions.length;
  const emailsDrafted = executions.filter((e) => rx('draft|reply|forward|send').test(e.actionType) && rx('gmail|communication|mail').test(e.connector)).length;
  const mergeConflictsResolved = executions.filter((e) => rx('merge').test(e.actionType)).length;
  const jiraIssuesCreated = executions.filter((e) => rx('jira|issue').test(e.connector) || (rx('create|issue').test(e.actionType) && rx('jira|work').test(e.connector))).length;
  const meetingsPrepared = meetingEvents;

  // ── Estimated: everything FLOW surfaced/handled in-app is a prevented app-open ──────
  const [notifCount, approvalCount] = await Promise.all([
    prisma.notification.count({ where: { workspaceId, createdAt: { gte: since } } }),
    prisma.pendingApproval.count({ where: { workspaceId, createdAt: { gte: since } } }),
  ]);
  const contextSwitchesPrevented = notifCount + approvalCount + tasksCompleted;

  const counts = { taskCompleted: tasksCompleted, approvalExecuted: approvalsExecuted, emailDrafted: emailsDrafted, mergeConflictResolved: mergeConflictsResolved, meetingPrepared: meetingsPrepared, jiraIssueCreated: jiraIssuesCreated, contextSwitchesPrevented };
  const timeSavedHours = Math.round((estimateMinutes(counts) / 60) * 10) / 10;

  const measured = (key, label, value, evidence) => ({ key, label, value, basis: 'measured', evidence });
  const estimated = (key, label, value, unit) => ({ key, label, value, unit, basis: 'estimated' });

  return {
    window: { sinceDays, since: since.toISOString() },
    headline: [
      estimated('timeSaved', 'Time Saved', timeSavedHours, 'hours'),
      estimated('contextSwitches', 'Context Switches Prevented', contextSwitchesPrevented),
      measured('tasksCompleted', 'Tasks Completed', tasksCompleted, 'execution_records'),
      measured('approvalsExecuted', 'Approvals Executed', approvalsExecuted, 'pending_approvals'),
    ],
    detail: [
      measured('emailsDrafted', 'Emails Drafted', emailsDrafted, 'execution_records'),
      measured('mergeConflictsResolved', 'Merge Conflicts Resolved', mergeConflictsResolved, 'execution_records'),
      measured('meetingsPrepared', 'Meetings Prepared', meetingsPrepared, 'flow_events'),
      measured('jiraIssuesCreated', 'Jira Issues Created', jiraIssuesCreated, 'execution_records'),
    ],
    timeSavedHours,
    model: VALUE_MODEL,
  };
}

export default { getWeeklySummary };
