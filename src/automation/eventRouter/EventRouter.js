/**
 * EventRouter — routes a FLOW event to all matching triggers,
 * evaluates conditions, applies rate limits, transforms payloads,
 * and launches workflow executions through the Workflow Runtime.
 *
 * This is the heart of the automation platform.
 * All workflow executions still go through startExecution() — zero runtime changes.
 */

import { getTriggersForEvent }       from '../triggerRegistry/TriggerRegistry.js';
import { evaluate }                  from './ConditionEvaluator.js';
import { transform }                 from './PayloadTransformer.js';
import { checkRateLimit }            from './RateLimiter.js';
import { createExecution, updateExecution } from '../executionStore.js';
import { startExecution }            from '../../runtime/index.js';
import { publishFields }             from '../../events/index.js';
import { logger }                    from '../../utils/logger.js';

const AUTOMATION_ACTOR = {
  id:    'automation-engine',
  email: 'automation@flow-os.internal',
  role:  'AUTOMATION',
};

/**
 * Route a single FLOW event to all matching triggers.
 * @param {object} event — unified FLOW event
 */
export async function routeEvent(event) {
  const eventId = _canonicalEventId(event);
  if (!eventId) return;   // can't match without an event type

  let triggers;
  try {
    triggers = await getTriggersForEvent(eventId);
  } catch (err) {
    logger.warn(`[EventRouter] Failed to load triggers for ${eventId}: ${err.message}`);
    return;
  }

  if (!triggers.length) return;

  for (const trigger of triggers) {
    if (trigger.workspaceId !== event.workspaceId) continue; // workspace isolation

    _handleTrigger(trigger, event, eventId).catch(err => {
      logger.error(`[EventRouter] Trigger ${trigger.id} (${trigger.name}) failed: ${err.message}`);
    });
  }
}

async function _handleTrigger(trigger, event, eventId) {
  // 1. Evaluate conditions
  let conditionPassed = true;
  try {
    conditionPassed = evaluate(trigger.conditions, event);
  } catch (err) {
    logger.warn(`[EventRouter] Condition eval error for trigger ${trigger.id}: ${err.message}`);
    conditionPassed = false;
  }

  if (!conditionPassed) {
    await _recordExecution(trigger, event, eventId, 'SKIPPED', null, 'Conditions not met');
    return;
  }

  // 2. Rate limit check
  const rl = await checkRateLimit(trigger);
  if (!rl.allowed) {
    logger.warn(`[EventRouter] Trigger ${trigger.id} rate-limited: ${rl.reason}`);
    await _recordExecution(trigger, event, eventId, 'RATE_LIMITED', null, rl.reason);
    return;
  }

  // 3. Transform event payload → workflow params
  const params = {
    workspaceId: event.workspaceId,
    ...transform(trigger.paramMapping, event),
  };

  // 4. Create execution record (PENDING)
  const execRecord = await _recordExecution(trigger, event, eventId, 'PENDING', null, null);

  // 5. Launch workflow through the existing Runtime (no runtime changes)
  try {
    const { executionId } = await startExecution(
      trigger.workflowId,
      params,
      { workspaceId: event.workspaceId, orgId: event.organizationId, actor: AUTOMATION_ACTOR, orgPlan: 'enterprise' },
    );

    await updateExecution(execRecord.id, { status: 'STARTED', executionId });

    logger.info(`[EventRouter] Trigger "${trigger.name}" → workflow "${trigger.workflowId}" started (${executionId})`);

    // Publish system event so the timeline picks it up
    publishFields({
      workspaceId:  event.workspaceId,
      source:       'system',
      type:         'system.workflow.started',
      title:        `Automation: ${trigger.name}`,
      payload:      { executionId, workflowId: trigger.workflowId, triggerId: trigger.id, eventId },
      importance:   0.4,
      correlationId: event.correlationId,
    }).catch(() => {});
  } catch (err) {
    await updateExecution(execRecord.id, { status: 'FAILED', error: err.message });
    logger.error(`[EventRouter] Workflow start failed for trigger ${trigger.id}: ${err.message}`);
  }
}

async function _recordExecution(trigger, event, eventId, status, executionId, error) {
  try {
    return await createExecution({
      triggerId:     trigger.id,
      workspaceId:   trigger.workspaceId,
      eventId,
      eventSourceId: event.sourceEventId ?? null,
      workflowId:    trigger.workflowId,
      executionId,
      status,
      params:        {},
      error,
    });
  } catch {
    return { id: null };
  }
}

function _canonicalEventId(event) {
  // Map FLOW eventType → automation event registry ID
  // e.g. eventType "github.pr.opened" stays as-is
  // eventType "PULL_REQUEST_OPENED" needs a lookup — currently we use the connector + rawType pattern
  const rawType = event.rawEventType ?? event.eventType ?? '';
  const connector = event.connector ?? '';

  // If already in connector.noun.verb format, use it directly
  if (/^[a-z][a-z0-9-]*\.[a-z]/.test(rawType)) return rawType;

  // Otherwise build from connector + type
  if (connector && rawType) return `${connector}.${rawType.toLowerCase().replace(/[^a-z0-9.]/g, '_')}`;

  return null;
}
