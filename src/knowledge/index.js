/**
 * Enterprise Knowledge Graph — public API and boot entry point.
 *
 * Boot order:
 *   1. server.js calls startKnowledgeGraph() after the database pool is ready.
 *   2. startKnowledgeGraph() registers the FLOW event bus subscriber so the KG
 *      begins updating as connector events arrive.
 *
 * Consumer contract:
 *   Import from KGQueryGateway for reads.
 *   Import from SyncEngine for batch writes.
 *   Never import from sub-modules directly — this keeps the API surface stable.
 */

import { logger }                from '../utils/logger.js';
import { registerKGSubscriber }  from './sync/KGEventSubscriber.js';

export * from './KGQueryGateway.js';
export * from './sync/SyncEngine.js';
export * from './schema/EntityTypes.js';
export * from './schema/RelationshipTypes.js';
export * from './schema/SchemaValidator.js';

let _started = false;

/**
 * Start the Enterprise Knowledge Graph subsystem.
 * Safe to call multiple times — subsequent calls are no-ops.
 *
 * @returns {Promise<void>}
 */
export async function startKnowledgeGraph() {
  if (_started) return;
  _started = true;

  await registerKGSubscriber();
  logger.info('[KnowledgeGraph] Enterprise Knowledge Graph subsystem started');
}
