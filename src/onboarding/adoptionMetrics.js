/**
 * FLOW OS — Adoption Metrics (Phase 17, M4) — Track 10.
 *
 * Measures OUTCOMES, not features: how fast the workspace reached value and how much work
 * now happens inside FLOW. Read-only aggregation of what already exists — onboarding state
 * timestamps + the Success/Value summary. No new store.
 */

import { getState } from './onboardingState.js';
import { getWeeklySummary } from '../success/successMetrics.js';

export async function getAdoptionMetrics(workspaceId) {
  if (!workspaceId) throw new Error('workspaceId required');
  const [state, summary] = await Promise.all([
    getState(workspaceId),
    getWeeklySummary(workspaceId, { sinceDays: 7 }).catch(() => null),
  ]);

  const startedAt = state.startedAt ? new Date(state.startedAt).getTime() : null;
  const completedAt = state.completedAt ? new Date(state.completedAt).getTime() : null;
  const timeToCompleteMs = startedAt && completedAt ? completedAt - startedAt : null;

  const tasks = summary?.headline?.find((m) => m.key === 'tasksCompleted')?.value ?? 0;
  const approvals = summary?.headline?.find((m) => m.key === 'approvalsExecuted')?.value ?? 0;

  return {
    onboarding: {
      started: !!startedAt,
      completed: !!state.completed,
      step: state.step,
      mode: state.mode,
      permissionsConfigured: !!state.permissionsConfigured,
      startedAt: state.startedAt ?? null,
      completedAt: state.completedAt ?? null,
      timeToCompleteMs,
      timeToCompleteMinutes: timeToCompleteMs != null ? Math.round(timeToCompleteMs / 60000) : null,
    },
    adoption: {
      connectorsDiscovered: state.discovery?.totals?.connectors ?? 0,
      resourcesDiscovered: state.discovery?.totals?.resources ?? 0,
      workCompletedInFlow: tasks + approvals,
      timeSavedHours: summary?.timeSavedHours ?? 0,
    },
    generatedAt: new Date().toISOString(),
  };
}

export default { getAdoptionMetrics };
