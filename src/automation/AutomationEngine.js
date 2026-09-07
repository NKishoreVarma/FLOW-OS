/**
 * AutomationEngine — the single event bus subscriber that bridges
 * the Unified Event Platform (Phase 11) and the Workflow Runtime.
 *
 * On startup it registers one subscription on the FLOW event bus.
 * Every event that flows through the bus is evaluated against active triggers.
 * Matching triggers launch workflows through startExecution() — no runtime changes.
 *
 *   Event Bus → AutomationEngine → EventRouter → TriggerRegistry → RuntimeEngine
 *
 * This is a passive consumer — it never emits events itself (loop prevention).
 */

import { subscribe }   from '../events/index.js';
import { routeEvent }  from './eventRouter/EventRouter.js';
import { logger }      from '../utils/logger.js';

let _subscriptionId = null;
let _started        = false;

export function startAutomationEngine() {
  if (_started) return;
  _started = true;

  _subscriptionId = subscribe(
    'automation',
    {},   // no pre-filter — EventRouter does all filtering against trigger conditions
    async (event) => {
      try {
        await routeEvent(event);
      } catch (err) {
        logger.error(`[AutomationEngine] Unhandled error routing event: ${err.message}`);
      }
    },
    { priority: 8, durable: false },
  );

  logger.info('[AutomationEngine] Started — subscribed to event bus');
}

export function stopAutomationEngine() {
  if (!_started || !_subscriptionId) return;
  import('../events/index.js').then(({ unsubscribe }) => {
    unsubscribe(_subscriptionId);
  }).catch(() => {});
  _started = false;
  _subscriptionId = null;
  logger.info('[AutomationEngine] Stopped');
}

export function isRunning() { return _started; }
