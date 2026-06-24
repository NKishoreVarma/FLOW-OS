/**
 * FLOW OS — Centralized Event Bus
 * 
 * Decouples modules from each other. Any module can emit events,
 * any module can subscribe. Replaces scattered direct imports.
 * 
 * Usage:
 *   import { eventBus } from '../../core/events/eventBus.js';
 *   eventBus.emit('INCIDENT_CREATED', payload);
 *   eventBus.on('INCIDENT_CREATED', handler);
 */

import { EventEmitter } from 'events';

class FlowEventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(50); // Enterprise modules can have many subscribers
    this._eventLog = [];
  }

  /**
   * Emit a typed event with tenant-scoped payload.
   * @param {string} eventType - e.g. 'INCIDENT_CREATED', 'INTEL_STORED'
   * @param {Object} payload - Must include workspaceId for tenant isolation
   */
  emit(eventType, payload = {}) {
    const envelope = {
      eventType,
      payload,
      timestamp: new Date().toISOString()
    };

    // Keep a rolling log of last 500 events for debugging
    this._eventLog.push(envelope);
    if (this._eventLog.length > 500) this._eventLog.shift();

    return super.emit(eventType, payload);
  }

  /**
   * Get recent events for debugging/audit.
   * @param {number} count 
   */
  getRecentEvents(count = 20) {
    return this._eventLog.slice(-count);
  }
}

export const eventBus = new FlowEventBus();
