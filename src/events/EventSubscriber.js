/**
 * EventSubscriber — the subscription registry for the single event bus.
 *
 * Consumers (Timeline, Brain, Memory, KG, Recommendations, Notifications, Feed,
 * Analytics, Audit, Search) register here. Each subscription is independent and
 * fault-isolated — no consumer can block another. There is no direct connector
 * coupling: subscribers filter on the unified event, never on a provider.
 */

import { randomUUID } from 'crypto';

/** @type {{id,name,filter,handler,opts}[]} — kept sorted by ascending priority. */
const subscriptions = [];

/**
 * Register a subscriber.
 *
 * @param {string}   name    — stable identifier (used in delivery logs / metrics)
 * @param {Object}   filter  — { types?, connectors?, workspaces?, predicate? }
 * @param {Function} handler — async (event) => void
 * @param {Object}   opts    — { durable?, priority?, retries? }
 * @returns {string} subscription id
 */
export function subscribe(name, filter, handler, opts = {}) {
  const sub = {
    id:      randomUUID(),
    name,
    filter:  filter || {},
    handler,
    opts:    { durable: false, priority: 5, retries: 0, ...opts },
  };
  subscriptions.push(sub);
  subscriptions.sort((a, b) => a.opts.priority - b.opts.priority);
  return sub.id;
}

export function unsubscribe(id) {
  const idx = subscriptions.findIndex((s) => s.id === id);
  if (idx >= 0) subscriptions.splice(idx, 1);
  return idx >= 0;
}

export function getSubscribers() {
  return subscriptions.map((s) => ({ id: s.id, name: s.name, filter: s.filter, opts: s.opts }));
}

export function matches(sub, event) {
  const f = sub.filter;
  if (f.types?.length && !f.types.includes(event.eventType)) return false;
  if (f.connectors?.length && !f.connectors.includes(event.connector)) return false;
  if (f.workspaces?.length && !f.workspaces.includes(event.workspaceId)) return false;
  if (typeof f.predicate === 'function' && !f.predicate(event)) return false;
  return true;
}

export function matchingSubscribers(event) {
  return subscriptions.filter((s) => matches(s, event));
}
