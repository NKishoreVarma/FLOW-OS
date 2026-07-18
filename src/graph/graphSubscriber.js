/**
 * graphSubscriber — the single writer to the Operational Graph.
 *
 * Registers a 'graph' subscriber on the Phase 11.0 Unified Event Platform so that
 * EVERY FLOW event incrementally updates the twin. Durable with retries: a
 * transient DB hiccup is retried, never silently dropped. There is no polling and
 * no rebuild — the graph tracks the event stream in real time.
 */

import { subscribe } from '../events/EventSubscriber.js';
import { applyEvent } from './GraphEngine.js';
import { logger } from '../utils/logger.js';

let _registered = false;

export function registerGraphSubscriber() {
  if (_registered) return;
  _registered = true;
  subscribe('graph', {}, (event) => applyEvent(event), { priority: 6, durable: true, retries: 2 });
  logger.rag('[graph] operational graph subscriber registered (single writer)');
}
