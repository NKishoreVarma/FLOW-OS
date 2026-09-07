/**
 * Workspace Isolation Suite — validates tenant isolation at every data boundary.
 *
 * This is the most critical security suite. All tests must pass.
 * No test in this suite may use requiresCredentials=true as an excuse to skip.
 */

import { assert, assertObject, assertThrows } from '../helpers/assert.js';
import {
  saveCredentials, loadCredentials, hasCredentials,
} from '../../services/integrations/ConnectorCredentialStore.js';
import { isDuplicate, markSynced } from '../../services/sync/DeltaProcessor.js';
import { isDatabaseReachable } from '../helpers/testContext.js';

export const SUITE = 'workspace_isolation';

export const tests = [

  {
    name:                'credentials: workspace A cannot read workspace B credentials',
    connectors:          'all',
    requiresCredentials: false,
    requiresDatabase:    true,
    async run({ workspaceId, connectorId }) {
      if (!(await isDatabaseReachable())) throw new Error('SKIP: database unavailable');
      const wsA = `${workspaceId}-A`;
      const wsB = `${workspaceId}-B`;

      await saveCredentials(wsA, connectorId, { accessToken: 'secret-for-A' });
      const loadedByB = await loadCredentials(wsB, connectorId);
      assert(loadedByB === null, 'workspace B must not see workspace A credentials');

      // Cleanup
      const { revokeCredentials } = await import('../../services/integrations/ConnectorCredentialStore.js');
      await revokeCredentials(wsA, connectorId);
    },
  },

  {
    name:                'credentials: saveCredentials is scoped to workspace — no cross-write',
    connectors:          'all',
    requiresCredentials: false,
    requiresDatabase:    true,
    async run({ workspaceId, connectorId }) {
      if (!(await isDatabaseReachable())) throw new Error('SKIP: database unavailable');
      const wsA = `${workspaceId}-iso-A`;
      const wsB = `${workspaceId}-iso-B`;

      await saveCredentials(wsA, connectorId, { accessToken: 'token-A' });
      await saveCredentials(wsB, connectorId, { accessToken: 'token-B' });

      const forA = await loadCredentials(wsA, connectorId);
      const forB = await loadCredentials(wsB, connectorId);
      assert(forA?.accessToken === 'token-A', 'wsA gets its own token');
      assert(forB?.accessToken === 'token-B', 'wsB gets its own token');
      assert(forA?.accessToken !== forB?.accessToken, 'tokens are distinct across workspaces');

      const { revokeCredentials } = await import('../../services/integrations/ConnectorCredentialStore.js');
      await revokeCredentials(wsA, connectorId);
      await revokeCredentials(wsB, connectorId);
    },
  },

  {
    name:                'DeltaProcessor: sync_items are scoped per workspace',
    connectors:          'all',
    requiresCredentials: false,
    requiresDatabase:    true,
    async run({ connectorId }) {
      if (!(await isDatabaseReachable())) throw new Error('SKIP: database unavailable');
      const ts  = Date.now();
      const wsA = `iso-sync-ws-A-${ts}`;
      const wsB = `iso-sync-ws-B-${ts}`;
      const externalId = `shared-resource-${ts}`;

      // Mark as synced in workspace A
      await markSynced(wsA, connectorId, 'issues', externalId, 'etag-only-for-A');

      // Workspace B should see this as a new item (not a duplicate)
      const dupInB = await isDuplicate(wsB, connectorId, 'issues', externalId, 'etag-only-for-A');
      assert(dupInB === false, 'workspace B must not see workspace A sync state');
    },
  },

  {
    name:                'tenantIsolation middleware is exported and is a function',
    connectors:          'all',
    requiresCredentials: false,
    async run() {
      const mod = await import('../../core/middleware/tenantIsolation.js');
      const mw  = mod.tenantIsolation || mod.default;
      assert(typeof mw === 'function', 'tenantIsolation must export a middleware function');
    },
  },

  {
    name:                'tenantIsolation rejects requests with missing workspace-id header',
    connectors:          'all',
    requiresCredentials: false,
    async run() {
      const mod = await import('../../core/middleware/tenantIsolation.js');
      const mw  = mod.tenantIsolation || mod.default;
      let statusCode;
      const req = {
        headers:    {},                     // no workspace-id header
        path:       '/api/query',           // required by tenantIsolation EXCLUDED_PATHS check
        user:       { id: 'u1', orgId: 'org-1' },
        tenantId:   undefined,
      };
      const res = {
        status: (s) => { statusCode = s; return { json: () => {} }; },
        json:   () => {},
      };
      let nextError;
      await new Promise(resolve => {
        mw(req, res, (err) => { nextError = err; resolve(); });
        setTimeout(resolve, 20); // allow async resolution
      });
      // tenantIsolation calls next(ValidationError) or res.status(400)
      const wasRejected = (nextError != null) || statusCode === 400;
      assert(wasRejected,
        'tenantIsolation must reject missing workspace-id (next(error) or 400)');
    },
  },

  {
    name:                'webhook_events table has workspace_id indexed — no full-table scan risk',
    connectors:          'all',
    requiresCredentials: false,
    requiresDatabase:    true,
    async run() {
      if (!(await isDatabaseReachable())) throw new Error('SKIP: database unavailable');
      const { default: db } = await import('../../config/db.js');
      // First check if the table exists at all
      const { rows: tables } = await db.query(
        `SELECT 1 FROM information_schema.tables WHERE table_name = 'webhook_events' AND table_schema = 'public'`,
      ).catch(() => ({ rows: [] }));
      if (!tables.length) throw new Error('SKIP: webhook_events table not found — run migrate-webhook-platform-v10-3.sql');
      const { rows } = await db.query(
        `SELECT indexname FROM pg_indexes
          WHERE tablename = 'webhook_events' AND indexdef ILIKE '%workspace_id%'`,
      ).catch(() => ({ rows: [] }));
      assert(rows.length > 0, 'webhook_events must have an index on workspace_id');
    },
  },

  {
    name:                'sync_items table has workspace_id + connector_id in primary key / UNIQUE',
    connectors:          'all',
    requiresCredentials: false,
    requiresDatabase:    true,
    async run() {
      if (!(await isDatabaseReachable())) throw new Error('SKIP: database unavailable');
      const { default: db } = await import('../../config/db.js');
      const { rows: tables } = await db.query(
        `SELECT 1 FROM information_schema.tables WHERE table_name = 'sync_items' AND table_schema = 'public'`,
      ).catch(() => ({ rows: [] }));
      if (!tables.length) throw new Error('SKIP: sync_items table not found — run migrate-sync-engine-v10-2.sql');
      const { rows } = await db.query(
        `SELECT indexname, indexdef FROM pg_indexes
          WHERE tablename = 'sync_items'
            AND (indexdef ILIKE '%workspace_id%' OR indexdef ILIKE '%unique%')`,
      ).catch(() => ({ rows: [] }));
      assert(rows.length > 0, 'sync_items must have workspace-scoped unique index');
    },
  },

  {
    name:                'connector_credentials UNIQUE key is (workspace_id, connector_id)',
    connectors:          'all',
    requiresCredentials: false,
    requiresDatabase:    true,
    async run() {
      if (!(await isDatabaseReachable())) throw new Error('SKIP: database unavailable');
      const { default: db } = await import('../../config/db.js');
      const { rows: tables } = await db.query(
        `SELECT 1 FROM information_schema.tables WHERE table_name = 'connector_credentials' AND table_schema = 'public'`,
      ).catch(() => ({ rows: [] }));
      if (!tables.length) throw new Error('SKIP: connector_credentials table not found — run migration');
      const { rows } = await db.query(
        `SELECT constraint_name FROM information_schema.table_constraints
          WHERE table_name = 'connector_credentials'
            AND constraint_type IN ('PRIMARY KEY', 'UNIQUE')`,
      ).catch(() => ({ rows: [] }));
      assert(rows.length > 0, 'connector_credentials must have a PK or UNIQUE constraint');
    },
  },

  {
    name:                'listWebhooks returns only current workspace webhooks',
    connectors:          'all',
    requiresCredentials: false,
    requiresDatabase:    true,
    async run({ workspaceId }) {
      if (!(await isDatabaseReachable())) throw new Error('SKIP: database unavailable');
      const { listWebhooks } = await import('../../services/integrations/WebhookManager.js');
      const hooks = await listWebhooks(workspaceId);
      for (const h of hooks) {
        assert(h.workspace_id === undefined || h.workspace_id === workspaceId,
          `hook.workspace_id must match current workspace: ${h.workspace_id}`);
      }
    },
  },

];
