/**
 * EventPipeline — DEPRECATED (Phase 11.0).
 *
 * The real-time event pipeline has been consolidated into the single unified
 * Event Platform at `src/events`. These exports remain as thin forwarding shims
 * for one release so any external caller keeps working; each logs a one-time
 * deprecation notice. New code MUST import from `../../events/index.js`.
 *
 * The validated intelligence engines this pipeline used (timeline, memory, feed,
 * notification, priority, correlation) are unchanged — they are now registered
 * as subscribers on the canonical bus (see src/events/builtinSubscribers.js).
 */

import { logger } from '../../utils/logger.js';

let _warned = false;
function _deprecate(fn) {
  if (_warned) return;
  _warned = true;
  logger.rag(`[EventPipeline] DEPRECATED — forward to src/events. First call: ${fn}()`);
}

export async function processRawEvent(workspaceId, source, rawType, payload, orgId) {
  _deprecate('processRawEvent');
  const { publish } = await import('../../events/index.js');
  return publish(source, rawType || 'custom', payload, { workspaceId, organizationId: orgId });
}

export async function processNormalizedEvent(event, orgId) {
  _deprecate('processNormalizedEvent');
  const { publishFields } = await import('../../events/index.js');
  return publishFields({ ...event, organizationId: orgId });
}

export async function ingestFromWorker(jobData, result) {
  _deprecate('ingestFromWorker');
  if (result?.status === 'DISCARDED') return undefined;
  const { publish } = await import('../../events/index.js');
  const { workspaceId, platform, sender, channel, text } = jobData;
  const isIncident = /incident|outage|down|sev[0-2]|p[01]/i.test(text || '');
  return publish(platform || 'ingestion_worker', isIncident ? 'incident' : 'message', {
    text, sender, channel, platform,
    traceId: jobData.metadata?.traceId, ...jobData.metadata,
  }, { workspaceId, metadata: { origin: 'ingestion' } });
}

export async function ingestFromConnector(payload) {
  _deprecate('ingestFromConnector');
  const { workspaceId, connectorId, actionType } = payload;
  if (!workspaceId) return undefined;
  const { publish } = await import('../../events/index.js');
  return publish('connector_action', actionType || 'action_executed', {
    actionType, connectorId, ...payload,
  }, { workspaceId, metadata: { origin: 'connector' } });
}
