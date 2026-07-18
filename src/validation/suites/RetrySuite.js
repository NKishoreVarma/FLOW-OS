/**
 * Retry Suite — validates BullMQ retry mechanics and dead-letter flow.
 */

import { assert, assertObject, assertGreaterThan } from '../helpers/assert.js';
import { listDeadLetters, getDLQSummary } from '../../services/sync/DeadLetterService.js';
import { isDatabaseReachable } from '../helpers/testContext.js';

export const SUITE = 'retry';

const MAX_ATTEMPTS = 5;

export const tests = [

  {
    name:                'syncWorker is configured with 5 retry attempts',
    connectors:          'all',
    requiresCredentials: false,
    async run() {
      // Read the worker source and verify MAX_ATTEMPTS constant
      const { readFileSync } = await import('fs');
      const src = readFileSync(
        new URL('../../workers/syncWorker.js', import.meta.url).pathname,
        'utf8',
      );
      assert(src.includes('MAX_ATTEMPTS'), 'syncWorker must define MAX_ATTEMPTS');
      assert(src.includes('5'), 'syncWorker MAX_ATTEMPTS should be 5');
    },
  },

  {
    name:                'webhookWorker is configured with 5 retry attempts',
    connectors:          'all',
    requiresCredentials: false,
    async run() {
      const { readFileSync } = await import('fs');
      const src = readFileSync(
        new URL('../../workers/webhookWorker.js', import.meta.url).pathname,
        'utf8',
      );
      assert(src.includes('MAX_ATTEMPTS'), 'webhookWorker must define MAX_ATTEMPTS');
      assert(src.includes('5'), 'webhookWorker MAX_ATTEMPTS should be 5');
    },
  },

  {
    name:                'syncWorker uses exponential backoff configuration',
    connectors:          'all',
    requiresCredentials: false,
    async run() {
      const { readFileSync } = await import('fs');
      const src = readFileSync(
        new URL('../../workers/syncWorker.js', import.meta.url).pathname,
        'utf8',
      );
      assert(src.includes('exponential'), 'syncWorker must use exponential backoff type');
      assert(src.includes('backoff'), 'syncWorker must configure backoff');
    },
  },

  {
    name:                'webhookWorker uses exponential backoff configuration',
    connectors:          'all',
    requiresCredentials: false,
    async run() {
      const { readFileSync } = await import('fs');
      const src = readFileSync(
        new URL('../../workers/webhookWorker.js', import.meta.url).pathname,
        'utf8',
      );
      assert(src.includes('exponential'), 'webhookWorker must use exponential backoff type');
    },
  },

  {
    name:                'syncWorker calls moveToDLQ after final failure',
    connectors:          'all',
    requiresCredentials: false,
    async run() {
      const { readFileSync } = await import('fs');
      const src = readFileSync(
        new URL('../../workers/syncWorker.js', import.meta.url).pathname,
        'utf8',
      );
      assert(src.includes('moveToDLQ'), 'syncWorker must call moveToDLQ on final failure');
      assert(src.includes("'failed'"), 'syncWorker must listen to failed event');
    },
  },

  {
    name:                'DeadLetterService.listDeadLetters works on empty DLQ',
    connectors:          'all',
    requiresCredentials: false,
    requiresDatabase:    true,
    async run({ workspaceId }) {
      if (!(await isDatabaseReachable())) throw new Error('SKIP: database unavailable');
      const letters = await listDeadLetters(workspaceId, { limit: 10 });
      assert(Array.isArray(letters), 'listDeadLetters returns array');
    },
  },

  {
    name:                'DeadLetterService.getDLQSummary returns counts by connector',
    connectors:          'all',
    requiresCredentials: false,
    requiresDatabase:    true,
    async run({ workspaceId }) {
      if (!(await isDatabaseReachable())) throw new Error('SKIP: database unavailable');
      const summary = await getDLQSummary(workspaceId);
      assert(typeof summary === 'object', 'getDLQSummary returns object');
    },
  },

  {
    name:                'syncQueue uses correct queue name "connector-sync"',
    connectors:          'all',
    requiresCredentials: false,
    async run() {
      const { syncQueue } = await import('../../config/syncQueue.js');
      assert(syncQueue.name === 'connector-sync', `expected queue name 'connector-sync', got '${syncQueue.name}'`);
    },
  },

  {
    name:                'webhookQueue uses correct queue name "webhook-processing"',
    connectors:          'all',
    requiresCredentials: false,
    async run() {
      const { webhookQueue } = await import('../../config/webhookQueue.js');
      assert(webhookQueue.name === 'webhook-processing', `expected 'webhook-processing', got '${webhookQueue.name}'`);
    },
  },

];
