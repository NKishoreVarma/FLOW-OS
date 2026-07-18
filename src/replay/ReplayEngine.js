/**
 * ReplayEngine — the DVR orchestrator. Assembles a replay from the Unified Event
 * Platform: normalize scope → fetch stream → build timeline → navigation →
 * metrics. Seven replay modes preset the filters and focus. Also drives snapshot
 * comparison (Monday vs Friday, before/after incident or deployment).
 *
 * Reads ONLY from the event platform — no duplicate storage.
 */

import { normalizeScope } from './ReplayFilters.js';
import { buildStream } from './ReplayBuilder.js';
import { buildTimeline } from './ReplayTimeline.js';
import { buildNavigation } from './ReplayNavigator.js';
import { computeMetrics } from './ReplayMetrics.js';
import { snapshotAt } from './ReplaySnapshots.js';
import { diffSnapshots } from './ReplayDiffEngine.js';
import { exportReplay } from './ReplayExport.js';

// Mode presets: filter defaults + bucket + description.
export const MODES = {
  TIMELINE:         { bucket: 'day',  desc: 'Everything that happened, chronologically.' },
  INCIDENT:         { bucket: 'hour', eventTypes: ['incident', 'security'], desc: 'How an incident evolved (use scope.correlationId or scope.incident).' },
  CUSTOMER_JOURNEY: { bucket: 'day',  desc: 'Every event touching a customer (use scope.customer).' },
  ENGINEERING:      { bucket: 'day',  eventTypes: ['engineering', 'deployment'], desc: 'PRs, commits, deployments.' },
  MEETING:          { bucket: 'day',  eventTypes: ['meeting'], desc: 'Meetings and the decisions around them.' },
  EXECUTIVE:        { bucket: 'day',  eventTypes: ['incident', 'deployment', 'customer', 'security', 'approval'], minImportance: 0.6, desc: 'High-impact events only.' },
  KNOWLEDGE:        { bucket: 'week', eventTypes: ['knowledge', 'memory'], desc: 'How knowledge evolved.' },
};

/**
 * Run a replay.
 * @param {string} workspaceId
 * @param {{ mode?, scope?, bucket? }} opts
 */
export async function replay(workspaceId, { mode = 'TIMELINE', scope = {}, bucket } = {}) {
  const preset = MODES[mode] || MODES.TIMELINE;
  const mergedScope = { ...scope };
  if (preset.eventTypes && !scope.eventType && !scope.eventTypes) mergedScope.eventTypes = preset.eventTypes;
  if (preset.minImportance != null && scope.minImportance == null) mergedScope.minImportance = preset.minImportance;

  const filter = normalizeScope(mergedScope);
  const { events, truncated } = await buildStream(workspaceId, filter);
  const timeline = buildTimeline(events, { bucket: bucket || preset.bucket });
  const navigation = buildNavigation(timeline);
  const metrics = computeMetrics(events);

  return {
    mode,
    scope: mergedScope,
    window: { from: filter.since, until: filter.until },
    span: timeline.span,
    totalEvents: events.length,
    truncated,
    timeline,
    navigation,
    metrics,
  };
}

/** Compare workspace state at two instants (Monday vs Friday, before/after X). */
export async function snapshotCompare(workspaceId, t1, t2) {
  const [before, after] = await Promise.all([snapshotAt(workspaceId, t1), snapshotAt(workspaceId, t2)]);
  return { before, after, diff: diffSnapshots(before, after) };
}

/** Snapshot the workspace state as of a single instant. */
export function snapshot(workspaceId, at) {
  return snapshotAt(workspaceId, at);
}

/** Markdown narrative of a replay ("how it unfolded"). */
export function narrative(replayResult) {
  return exportReplay(replayResult, 'markdown');
}

export { exportReplay };
