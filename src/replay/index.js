/**
 * FLOW Workspace Replay Engine — public API.
 *
 * A DVR for company operations. Replay exactly how decisions, incidents,
 * deployments, and customer events unfolded over time — by time, employee,
 * customer, project, incident, repository, meeting, deployment, connector, or the
 * whole workspace, in seven replay modes. Snapshots and diffs answer "what
 * changed between Monday and Friday?".
 *
 * Reads ONLY from the Unified Event Platform (Phase 11.0) — no duplicate storage.
 */

export { replay, snapshotCompare, snapshot, narrative, exportReplay, MODES } from './ReplayEngine.js';

// Building blocks (for the Player / REST layer and testing).
export { normalizeScope } from './ReplayFilters.js';
export { buildStream } from './ReplayBuilder.js';
export { buildTimeline } from './ReplayTimeline.js';
export { snapshotAt } from './ReplaySnapshots.js';
export { diffSnapshots } from './ReplayDiffEngine.js';
export { buildNavigation, seek, step } from './ReplayNavigator.js';
export { frameAt, cursorView, playbackPlan } from './ReplayPlayer.js';
export { computeMetrics } from './ReplayMetrics.js';
