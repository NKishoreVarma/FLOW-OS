/**
 * Event Registry — singleton store for all FLOW event schemas.
 *
 * Loaded once at boot via RegistryLoader. Never mutated at runtime.
 * Provides fast O(1) lookup, list, and connector-scoped queries.
 */

export class EventNotFoundError extends Error {
  constructor(id) {
    super(`Event type not found in registry: "${id}"`);
    this.code   = 'EVENT_NOT_FOUND';
    this.status = 404;
  }
}

class EventRegistry {
  #events  = new Map();   // id → EventDefinition
  #loaded  = false;

  load(definitions) {
    let loaded = 0;
    for (const def of definitions) {
      if (!def?.id) continue;
      this.#events.set(def.id, Object.freeze(def));
      loaded++;
    }
    this.#loaded = true;
    return loaded;
  }

  resolve(id) {
    if (!this.#loaded) throw new Error('[EventRegistry] Not loaded — call load() first');
    const def = this.#events.get(id);
    if (!def) throw new EventNotFoundError(id);
    return def;
  }

  has(id) { return this.#events.has(id); }

  list({ connector, category, source, priority } = {}) {
    return [...this.#events.values()].filter(e =>
      (!connector || e.connector === connector) &&
      (!category  || e.category  === category)  &&
      (!source    || e.source    === source)     &&
      (!priority  || e.priority  === priority)
    );
  }

  /** Free-text search over id, displayName, description */
  search(query, limit = 20) {
    if (!query?.trim()) return this.list();
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    return [...this.#events.values()]
      .map(e => {
        const blob = `${e.id} ${e.displayName} ${e.description} ${e.connector} ${e.category}`.toLowerCase();
        const score = terms.reduce((s, t) => {
          if (e.id === t)             return s + 20;
          if (e.id.includes(t))       return s + 10;
          if (blob.includes(t))       return s + 1;
          return s;
        }, 0);
        return { e, score };
      })
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ e }) => e);
  }

  stats() {
    const all = [...this.#events.values()];
    const byConnector = {}, byCategory = {}, bySource = {};
    for (const e of all) {
      byConnector[e.connector] = (byConnector[e.connector] ?? 0) + 1;
      byCategory[e.category]   = (byCategory[e.category]   ?? 0) + 1;
      bySource[e.source]       = (bySource[e.source]       ?? 0) + 1;
    }
    return { total: all.length, byConnector, byCategory, bySource };
  }

  clear() { this.#events.clear(); this.#loaded = false; }
}

export const eventRegistry = new EventRegistry();
