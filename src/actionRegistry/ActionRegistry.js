/**
 * Universal Action Registry (UAR)
 *
 * Single source of truth for every executable action in FLOW.
 * Answers three questions at runtime:
 *   1. Can this action be performed?  (schema validation + permission check)
 *   2. How should it be executed?     (risk tier, approval policy, retry, rollback)
 *   3. What happened?                 (audit metadata, telemetry)
 *
 * Storage: in-memory Map (same pattern as WorkflowLoader). Actions are loaded once
 * at boot by RegistryLoader and stay warm for the process lifetime.
 */

import { ActionValidator, RegistryValidationError } from './ActionValidator.js';
import { ActionSearch }                              from './ActionSearch.js';
import { logger }                                    from '../utils/logger.js';

export class ActionRegistry {
  #actions = new Map();   // id → ActionDefinition
  #loaded  = false;

  // ── Boot ────────────────────────────────────────────────────────────────────

  load(definitions) {
    let loaded = 0;
    let skipped = 0;
    for (const def of definitions) {
      try {
        ActionValidator.validateDefinition(def);
        if (def.lifecycle !== 'REMOVED') {
          this.#actions.set(def.id, Object.freeze({ ...def }));
          loaded++;
        } else {
          skipped++;
        }
      } catch (err) {
        logger.warn(`[ActionRegistry] Skipping invalid definition: ${err.message}`);
        skipped++;
      }
    }
    this.#loaded = true;
    logger.info(`[ActionRegistry] Loaded ${loaded} actions (${skipped} skipped)`);
  }

  // ── Resolution ──────────────────────────────────────────────────────────────

  resolve(actionId) {
    if (!this.#loaded) throw new Error('[ActionRegistry] Registry not initialized — call load() first');
    const def = this.#actions.get(actionId);
    if (!def) throw new ActionNotFoundError(actionId);
    return def;
  }

  has(actionId) { return this.#actions.has(actionId); }

  // ── Listing / Search ────────────────────────────────────────────────────────

  list({ connector, category, riskLevel, lifecycle = 'ACTIVE' } = {}) {
    return [...this.#actions.values()].filter(a =>
      a.lifecycle === lifecycle &&
      (!connector  || a.connector  === connector) &&
      (!category   || a.category   === category) &&
      (!riskLevel  || a.riskLevel  === riskLevel)
    );
  }

  search(query) {
    return ActionSearch.search(query, [...this.#actions.values()]);
  }

  connectorSummary() {
    const map = {};
    for (const a of this.#actions.values()) {
      if (a.lifecycle !== 'ACTIVE') continue;
      map[a.connector] = (map[a.connector] ?? 0) + 1;
    }
    return Object.entries(map).map(([connector, count]) => ({ connector, count }));
  }

  categorySummary() {
    const map = {};
    for (const a of this.#actions.values()) {
      if (a.lifecycle !== 'ACTIVE') continue;
      map[a.category] = (map[a.category] ?? 0) + 1;
    }
    return Object.entries(map).map(([category, count]) => ({ category, count }));
  }

  stats() {
    const all = [...this.#actions.values()];
    return {
      total:       all.length,
      byLifecycle: _groupCount(all, 'lifecycle'),
      byRisk:      _groupCount(all, 'riskLevel'),
      byConnector: _groupCount(all, 'connector'),
    };
  }

  // ── Registration (runtime, opt-in) ──────────────────────────────────────────

  register(definition) {
    ActionValidator.validateDefinition(definition);
    this.#actions.set(definition.id, Object.freeze({ ...definition }));
    logger.info(`[ActionRegistry] Registered action: ${definition.id}`);
  }

  // ── Input validation helper ──────────────────────────────────────────────────

  validateInputs(actionId, inputs) {
    const def = this.resolve(actionId);
    return ActionValidator.validateInputs(def, inputs);
  }

  // ── Test helpers ─────────────────────────────────────────────────────────────

  clear() {
    this.#actions.clear();
    this.#loaded = false;
  }

  get size() { return this.#actions.size; }
}

function _groupCount(arr, field) {
  const map = {};
  for (const a of arr) map[a[field]] = (map[a[field]] ?? 0) + 1;
  return map;
}

export class ActionNotFoundError extends Error {
  constructor(actionId) {
    super(`Action not found or not active in registry: ${actionId}`);
    this.code     = 'ACTION_NOT_FOUND';
    this.actionId = actionId;
    this.status   = 404;
  }
}

export { RegistryValidationError };

// Singleton — same pattern as WorkflowLoader's internal Maps
export const actionRegistry = new ActionRegistry();
