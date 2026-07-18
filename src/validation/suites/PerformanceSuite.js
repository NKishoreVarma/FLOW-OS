/**
 * Performance Suite — validates latency thresholds for key operations.
 *
 * Thresholds are deliberately generous — these are not load tests.
 * They catch catastrophic regressions (import loops, blocking I/O, missing caches).
 */

import { assertUnder, assert, assertLessThan } from '../helpers/assert.js';

export const SUITE = 'performance';

// Latency thresholds
const THRESHOLDS = {
  moduleImport:        500,   // ms — module load with no I/O
  oauthUrlGeneration:  200,   // ms — no network
  normalization:       50,    // ms — pure CPU
  signVerifyState:     100,   // ms — HMAC, no I/O
  rateLimiterCreate:   50,    // ms
  bulkMarkSynced100:   5000,  // ms — 100 DB upserts (DB-dependent)
  webhookClaimRedis:   500,   // ms — Redis SET NX (Redis-dependent)
};

export const tests = [

  {
    name:                `ConnectorCredentialStore module loads in < ${THRESHOLDS.moduleImport}ms`,
    connectors:          'all',
    requiresCredentials: false,
    async run() {
      const elapsed = await assertUnder(THRESHOLDS.moduleImport, 'ConnectorCredentialStore import', async () => {
        await import('../../services/integrations/ConnectorCredentialStore.js');
      });
      // Idempotent on repeat — just record
    },
  },

  {
    name:                `SyncEngine module loads in < ${THRESHOLDS.moduleImport}ms`,
    connectors:          'all',
    requiresCredentials: false,
    async run() {
      await assertUnder(THRESHOLDS.moduleImport, 'SyncEngine import', async () => {
        await import('../../services/sync/SyncEngine.js');
      });
    },
  },

  {
    name:                `EventNormalizer normalizes GitHub event in < ${THRESHOLDS.normalization}ms`,
    connectors:          ['github'],
    requiresCredentials: false,
    async run({ workspaceId }) {
      const { normalize } = await import('../../services/webhooks/EventNormalizer.js');
      const payload = {
        action: 'opened',
        pull_request: { number: 1, title: 'Test', user: { login: 'alice' } },
        repository: { full_name: 'org/repo' },
        sender: { login: 'alice' },
      };
      const elapsed = await assertUnder(THRESHOLDS.normalization, 'GitHub normalization', async () => {
        for (let i = 0; i < 100; i++) {
          normalize('github', { 'x-github-event': 'pull_request' }, payload, `del-${i}`, workspaceId);
        }
      });
      // 100 normalizations must complete within threshold
    },
  },

  {
    name:                `EventNormalizer normalizes Slack event in < ${THRESHOLDS.normalization}ms`,
    connectors:          ['slack'],
    requiresCredentials: false,
    async run({ workspaceId }) {
      const { normalize } = await import('../../services/webhooks/EventNormalizer.js');
      const payload = { event: { type: 'message', text: 'hello', user: 'U1', channel: 'C1', ts: '1234.0001', event_id: 'Ev1' } };
      await assertUnder(THRESHOLDS.normalization, 'Slack normalization x100', async () => {
        for (let i = 0; i < 100; i++) normalize('slack', {}, payload, `del-${i}`, workspaceId);
      });
    },
  },

  {
    name:                `signState + verifyState round-trip in < ${THRESHOLDS.signVerifyState}ms`,
    connectors:          'all',
    requiresCredentials: false,
    async run({ connectorId }) {
      const { signState, verifyState } = await import('../../services/integrations/oauthHelpers.js');
      await assertUnder(THRESHOLDS.signVerifyState, 'signState+verifyState x50', async () => {
        for (let i = 0; i < 50; i++) {
          const state = signState(connectorId, `ws-perf-${i}`);
          verifyState(connectorId, state);
        }
      });
    },
  },

  {
    name:                `rateLimiter middleware creation in < ${THRESHOLDS.rateLimiterCreate}ms`,
    connectors:          'all',
    requiresCredentials: false,
    async run() {
      const { rateLimiter } = await import('../../core/middleware/rateLimiter.js');
      await assertUnder(THRESHOLDS.rateLimiterCreate, 'rateLimiter factory x100', async () => {
        for (let i = 0; i < 100; i++) rateLimiter({ max: 100, windowSec: 60 });
      });
    },
  },

  {
    name:                `bulkMarkSynced 100 items completes in < ${THRESHOLDS.bulkMarkSynced100}ms`,
    connectors:          'all',
    requiresCredentials: false,
    requiresDatabase:    true,
    async run({ workspaceId, connectorId }) {
      const { isDatabaseReachable } = await import('../helpers/testContext.js');
      if (!(await isDatabaseReachable())) throw new Error('SKIP: database unavailable');

      const { bulkMarkSynced } = await import('../../services/sync/DeltaProcessor.js');
      const ts    = Date.now();
      const items = Array.from({ length: 100 }, (_, i) => ({
        externalId: `perf-item-${ts}-${i}`,
        etag:       `etag-${i}`,
      }));

      const elapsed = await assertUnder(THRESHOLDS.bulkMarkSynced100, 'bulkMarkSynced 100 items', async () => {
        await bulkMarkSynced(workspaceId, connectorId, 'issues', items);
      });
    },
  },

  {
    name:                `Redis claimDelivery responds in < ${THRESHOLDS.webhookClaimRedis}ms`,
    connectors:          'all',
    requiresCredentials: false,
    async run({ workspaceId, connectorId }) {
      const { isRedisReachable } = await import('../helpers/testContext.js');
      if (!(await isRedisReachable())) throw new Error('SKIP: Redis unavailable');

      const { claimDelivery } = await import('../../services/webhooks/ReplayProtection.js');
      const id = `perf-claim-${Date.now()}-${Math.random()}`;
      await assertUnder(THRESHOLDS.webhookClaimRedis, 'claimDelivery single', async () => {
        await claimDelivery(workspaceId, connectorId, id);
      });
    },
  },

  {
    name:                'getAuthUrl generates URL without blocking event loop',
    connectors:          ['github', 'slack', 'notion', 'jira'],
    requiresCredentials: false,
    async run({ workspaceId, connectorId }) {
      const svc = await _loadOAuthService(connectorId);
      if (typeof svc.getAuthUrl !== 'function') return;
      let url;
      try {
        const elapsed = await assertUnder(THRESHOLDS.oauthUrlGeneration, 'getAuthUrl', async () => {
          url = svc.getAuthUrl(workspaceId);
        });
      } catch (err) {
        if (err.message.toLowerCase().includes('client')) return; // env not configured
        throw err;
      }
    },
  },

];

async function _loadOAuthService(connectorId) {
  switch (connectorId) {
    case 'github': return import('../../services/integrations/GitHubOAuthService.js');
    case 'slack':  return import('../../services/integrations/SlackOAuthService.js');
    case 'notion': return import('../../services/integrations/NotionOAuthService.js');
    case 'jira':   return import('../../services/integrations/JiraOAuthService.js');
    default:       return {};
  }
}
