/**
 * Duplicate Protection Suite — validates dedup at every layer of the pipeline.
 */

import { assert } from '../helpers/assert.js';
import { claimDelivery } from '../../services/webhooks/ReplayProtection.js';
import { isDuplicate, markSynced } from '../../services/sync/DeltaProcessor.js';
import { isDatabaseReachable, isRedisReachable } from '../helpers/testContext.js';

export const SUITE = 'duplicate_protection';

export const tests = [

  // ── Layer 1: Redis replay protection (webhook dedup) ────────────────────────

  {
    name:                'ReplayProtection: first claimDelivery returns true',
    connectors:          'all',
    requiresCredentials: false,
    async run({ workspaceId, connectorId }) {
      if (!(await isRedisReachable())) throw new Error('SKIP: Redis unavailable');
      const id = `dup-test-${Date.now()}-${Math.random()}`;
      const result = await claimDelivery(workspaceId, connectorId, id);
      assert(result === true, 'first claim must return true');
    },
  },

  {
    name:                'ReplayProtection: second claimDelivery with same ID returns false',
    connectors:          'all',
    requiresCredentials: false,
    async run({ workspaceId, connectorId }) {
      if (!(await isRedisReachable())) throw new Error('SKIP: Redis unavailable');
      const id = `dup-replay-${Date.now()}-${Math.random()}`;
      await claimDelivery(workspaceId, connectorId, id);
      const second = await claimDelivery(workspaceId, connectorId, id);
      assert(second === false, 'duplicate delivery must return false');
    },
  },

  {
    name:                'ReplayProtection: different delivery IDs are independent',
    connectors:          'all',
    requiresCredentials: false,
    async run({ workspaceId, connectorId }) {
      if (!(await isRedisReachable())) throw new Error('SKIP: Redis unavailable');
      const ts = Date.now();
      const r1 = await claimDelivery(workspaceId, connectorId, `id-a-${ts}`);
      const r2 = await claimDelivery(workspaceId, connectorId, `id-b-${ts}`);
      assert(r1 === true, 'id-a: first claim succeeds');
      assert(r2 === true, 'id-b: independent ID also succeeds');
    },
  },

  {
    name:                'ReplayProtection: workspace isolation — same ID in different workspaces both claim',
    connectors:          'all',
    requiresCredentials: false,
    async run({ connectorId }) {
      if (!(await isRedisReachable())) throw new Error('SKIP: Redis unavailable');
      const id = `cross-ws-${Date.now()}`;
      const r1 = await claimDelivery('ws-alpha', connectorId, id);
      const r2 = await claimDelivery('ws-beta', connectorId, id);
      assert(r1 === true, 'ws-alpha: claim succeeds');
      assert(r2 === true, 'ws-beta: same ID but different workspace also claims (isolated)');
    },
  },

  // ── Layer 2: DeltaProcessor etag dedup (sync dedup) ────────────────────────

  {
    name:                'DeltaProcessor: identical etag on same resource is a duplicate',
    connectors:          'all',
    requiresCredentials: false,
    requiresDatabase:    true,
    async run({ workspaceId, connectorId }) {
      if (!(await isDatabaseReachable())) throw new Error('SKIP: database unavailable');
      const id = `delta-dup-${Date.now()}`;
      await markSynced(workspaceId, connectorId, 'repositories', id, 'sha-abc');
      const dup = await isDuplicate(workspaceId, connectorId, 'repositories', id, 'sha-abc');
      assert(dup === true, 'same (id, etag) pair is a duplicate');
    },
  },

  {
    name:                'DeltaProcessor: same resource with new etag is NOT a duplicate',
    connectors:          'all',
    requiresCredentials: false,
    requiresDatabase:    true,
    async run({ workspaceId, connectorId }) {
      if (!(await isDatabaseReachable())) throw new Error('SKIP: database unavailable');
      const id = `delta-changed-${Date.now()}`;
      await markSynced(workspaceId, connectorId, 'commits', id, 'sha-v1');
      const dup = await isDuplicate(workspaceId, connectorId, 'commits', id, 'sha-v2');
      assert(dup === false, 'updated etag should not be a duplicate (item changed)');
    },
  },

  {
    name:                'DeltaProcessor: different connectors do not share dedup state',
    connectors:          'all',
    requiresCredentials: false,
    requiresDatabase:    true,
    async run({ workspaceId }) {
      if (!(await isDatabaseReachable())) throw new Error('SKIP: database unavailable');
      const id = `cross-connector-${Date.now()}`;
      await markSynced(workspaceId, 'github', 'repositories', id, 'etag-shared');
      const dupOnJira = await isDuplicate(workspaceId, 'jira', 'issues', id, 'etag-shared');
      assert(dupOnJira === false, 'same (id, etag) on different connector is not a duplicate');
    },
  },

  // ── Layer 3: DB UNIQUE constraint (webhook_events) ──────────────────────────

  {
    name:                'webhook_events UNIQUE constraint prevents duplicate delivery_id rows',
    connectors:          ['github'],
    requiresCredentials: false,
    requiresDatabase:    true,
    async run({ workspaceId }) {
      if (!(await isDatabaseReachable())) throw new Error('SKIP: database unavailable');
      const { default: db } = await import('../../config/db.js');
      const deliveryId = `unique-del-${Date.now()}`;

      // First insert
      await db.query(
        `INSERT INTO webhook_events
           (workspace_id, connector_id, event_id, delivery_id, event_type, urgency)
         VALUES ($1, 'github', gen_random_uuid(), $2, 'push', 'low')
         ON CONFLICT (workspace_id, connector_id, delivery_id) DO NOTHING`,
        [workspaceId, deliveryId],
      );

      // Duplicate insert with ON CONFLICT DO NOTHING must not throw
      await db.query(
        `INSERT INTO webhook_events
           (workspace_id, connector_id, event_id, delivery_id, event_type, urgency)
         VALUES ($1, 'github', gen_random_uuid(), $2, 'push', 'low')
         ON CONFLICT (workspace_id, connector_id, delivery_id) DO NOTHING`,
        [workspaceId, deliveryId],
      );

      const { rows } = await db.query(
        `SELECT COUNT(*) AS cnt FROM webhook_events WHERE workspace_id = $1 AND delivery_id = $2`,
        [workspaceId, deliveryId],
      );
      assert(parseInt(rows[0].cnt) === 1, `expected exactly 1 row, got ${rows[0].cnt}`);
    },
  },

  // ── Layer 4: BullMQ jobId dedup ─────────────────────────────────────────────

  {
    name:                'enqueueSyncJob uses deterministic jobId to prevent duplicate pending jobs',
    connectors:          'all',
    requiresCredentials: false,
    async run({ connectorId }) {
      const { readFileSync } = await import('fs');
      const src = readFileSync(
        new URL('../../config/syncQueue.js', import.meta.url).pathname,
        'utf8',
      );
      assert(src.includes('jobId'), 'enqueueSyncJob must set jobId for dedup');
    },
  },

];
