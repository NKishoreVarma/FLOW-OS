/**
 * ProgressReporter — broadcasts sync progress events over WebSocket.
 *
 * Events broadcast to the workspace channel:
 *   SYNC_STARTED      { connectorId, resourceType, trigger }
 *   SYNC_PROGRESS     { connectorId, resourceType, itemsProcessed, itemsNew, itemsSkipped, page }
 *   SYNC_COMPLETED    { connectorId, resourceType, itemsSynced, itemsFailed, durationMs, newCursor }
 *   SYNC_FAILED       { connectorId, resourceType, error, attempt, maxAttempts }
 *   SYNC_DLQ          { connectorId, resourceType, error, dlqId }
 */

import { broadcastToWorkspace } from '../socketService.js';

export function reportStarted(workspaceId, connectorId, resourceType, trigger) {
  broadcastToWorkspace(workspaceId, 'SYNC_STARTED', {
    connectorId,
    resourceType,
    trigger,
    ts: Date.now(),
  });
}

export function reportProgress(workspaceId, connectorId, resourceType, stats) {
  broadcastToWorkspace(workspaceId, 'SYNC_PROGRESS', {
    connectorId,
    resourceType,
    ...stats,
    ts: Date.now(),
  });
}

export function reportCompleted(workspaceId, connectorId, resourceType, result) {
  broadcastToWorkspace(workspaceId, 'SYNC_COMPLETED', {
    connectorId,
    resourceType,
    ...result,
    ts: Date.now(),
  });
}

export function reportFailed(workspaceId, connectorId, resourceType, error, attempt, maxAttempts) {
  broadcastToWorkspace(workspaceId, 'SYNC_FAILED', {
    connectorId,
    resourceType,
    error:       error?.message ?? String(error),
    attempt,
    maxAttempts,
    ts:          Date.now(),
  });
}

export function reportDLQ(workspaceId, connectorId, resourceType, error, dlqId) {
  broadcastToWorkspace(workspaceId, 'SYNC_DLQ', {
    connectorId,
    resourceType,
    error:   error?.message ?? String(error),
    dlqId,
    ts:      Date.now(),
  });
}
