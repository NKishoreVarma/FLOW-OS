/**
 * Event-Driven Automation Platform — public API.
 *
 * Call startAutomationPlatform() once at server boot.
 * Everything else (event bus subscription, scheduler, webhook gateway) wires up automatically.
 *
 *  Event sources:
 *    Webhook Gateway  → FLOW Event Bus → AutomationEngine → TriggerRegistry → RuntimeEngine
 *    Scheduler        → FLOW Event Bus → AutomationEngine → TriggerRegistry → RuntimeEngine
 *    Connector Events → FLOW Event Bus → AutomationEngine → TriggerRegistry → RuntimeEngine
 *
 *  Adding new automations:
 *    1. Register event definition in src/automation/eventRegistry/events/{connector}/
 *    2. Create trigger via POST /api/automation/triggers
 *    3. Register workflow via src/runtime/index.js registerWorkflow()
 *    That's it. No code changes to the engine.
 */

export { startAutomationEngine, isRunning } from './AutomationEngine.js';
export { loadEventRegistry, eventRegistry, EventNotFoundError } from './eventRegistry/index.js';
export { webhookRouter }                    from './webhookGateway/WebhookGateway.js';
export { startScheduler, stopScheduler, scheduleJob, removeScheduledJob } from './scheduler/Scheduler.js';
export {
  createTrigger, getTrigger, listTriggers, updateTrigger, deleteTrigger,
  getTriggersForEvent, invalidateTriggerCache,
} from './triggerRegistry/index.js';
export { listExecutions, getExecution } from './executionStore.js';

export async function startAutomationPlatform() {
  const { loadEventRegistry }    = await import('./eventRegistry/index.js');
  const { startAutomationEngine } = await import('./AutomationEngine.js');
  const { startScheduler }       = await import('./scheduler/Scheduler.js');

  await loadEventRegistry();
  startAutomationEngine();
  await startScheduler();
}
