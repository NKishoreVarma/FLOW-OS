/**
 * Webhook Suite — validates registration, signature verification, and event persistence.
 */

import crypto from 'crypto';
import { assert, assertString, assertObject } from '../helpers/assert.js';
import {
  registerWebhook, validateWebhookSignature,
  getWebhookInfo, listWebhooks, deactivateWebhook,
} from '../../services/integrations/WebhookManager.js';
import { normalize }    from '../../services/webhooks/EventNormalizer.js';
import { claimDelivery, extractDeliveryId } from '../../services/webhooks/ReplayProtection.js';
import { isDatabaseReachable, isRedisReachable } from '../helpers/testContext.js';

export const SUITE = 'webhook';

export const tests = [

  {
    name:                'registerWebhook returns a secret and persists the registration',
    connectors:          ['github', 'slack', 'jira'],
    requiresCredentials: false,
    requiresDatabase:    true,
    async run({ workspaceId, connectorId }) {
      if (!(await isDatabaseReachable())) throw new Error('SKIP: database unavailable');
      const secret = await registerWebhook(workspaceId, connectorId, {
        endpointUrl: `https://example.com/webhooks/${connectorId}?workspace=${workspaceId}`,
        eventTypes:  ['push', 'pull_request'],
      });
      assertString(secret, 'webhook secret');
      assert(secret.length >= 32, 'secret must be at least 32 chars');

      const info = await getWebhookInfo(workspaceId, connectorId);
      assertObject(info, 'webhook info after registration');
      assert(info.status === 'active', `webhook status should be active, got: ${info.status}`);
      assert(info.endpoint_url.includes(connectorId), 'endpoint_url contains connector name');

      // Cleanup
      await deactivateWebhook(workspaceId, connectorId);
    },
  },

  {
    name:                'listWebhooks returns registrations for the workspace',
    connectors:          'all',
    requiresCredentials: false,
    requiresDatabase:    true,
    async run({ workspaceId, connectorId }) {
      if (!(await isDatabaseReachable())) throw new Error('SKIP: database unavailable');
      await registerWebhook(workspaceId, connectorId, {
        endpointUrl: `https://example.com/wh?ws=${workspaceId}`,
        eventTypes:  ['event'],
      });
      const hooks = await listWebhooks(workspaceId);
      assert(hooks.some(h => h.connector_id === connectorId), `${connectorId} should appear in listWebhooks`);
      await deactivateWebhook(workspaceId, connectorId);
    },
  },

  {
    name:                'validateWebhookSignature returns false for unknown workspace',
    connectors:          ['github', 'slack', 'jira'],
    requiresCredentials: false,
    requiresDatabase:    true,
    async run({ connectorId }) {
      if (!(await isDatabaseReachable())) throw new Error('SKIP: database unavailable');
      const valid = await validateWebhookSignature(
        connectorId,
        'nonexistent-workspace-xyz',
        { 'x-hub-signature-256': 'sha256=fakesig' },
        Buffer.from('{}'),
      );
      assert(valid === false, 'unknown workspace should fail signature validation');
    },
  },

  {
    name:                'validateWebhookSignature accepts correct HMAC signature (GitHub scheme)',
    connectors:          ['github'],
    requiresCredentials: false,
    requiresDatabase:    true,
    async run({ workspaceId, connectorId }) {
      if (!(await isDatabaseReachable())) throw new Error('SKIP: database unavailable');
      const body   = Buffer.from(JSON.stringify({ action: 'opened' }));
      const secret = await registerWebhook(workspaceId, connectorId, {
        endpointUrl: `https://example.com/wh?ws=${workspaceId}`,
        eventTypes:  ['pull_request'],
      });
      const sig = `sha256=${crypto.createHmac('sha256', secret).update(body).digest('hex')}`;
      const valid = await validateWebhookSignature(connectorId, workspaceId,
        { 'x-hub-signature-256': sig }, body);
      assert(valid === true, 'correct HMAC should pass signature validation');
      await deactivateWebhook(workspaceId, connectorId);
    },
  },

  {
    name:                'validateWebhookSignature rejects tampered body (GitHub scheme)',
    connectors:          ['github'],
    requiresCredentials: false,
    requiresDatabase:    true,
    async run({ workspaceId, connectorId }) {
      if (!(await isDatabaseReachable())) throw new Error('SKIP: database unavailable');
      const original = Buffer.from(JSON.stringify({ action: 'opened' }));
      const secret   = await registerWebhook(workspaceId, connectorId, {
        endpointUrl: `https://example.com/wh?ws=${workspaceId}`,
        eventTypes:  ['pull_request'],
      });
      const sig     = `sha256=${crypto.createHmac('sha256', secret).update(original).digest('hex')}`;
      const tampered = Buffer.from(JSON.stringify({ action: 'malicious' }));
      const valid    = await validateWebhookSignature(connectorId, workspaceId,
        { 'x-hub-signature-256': sig }, tampered);
      assert(valid === false, 'tampered body should fail signature validation');
      await deactivateWebhook(workspaceId, connectorId);
    },
  },

  {
    name:                'EventNormalizer produces FLOW event for all supported connectors',
    connectors:          ['github', 'slack', 'jira', 'notion'],
    requiresCredentials: false,
    async run({ workspaceId, connectorId }) {
      const fixture = _webhookFixture(connectorId);
      const event = normalize(connectorId, fixture.headers, fixture.body, 'del-1', workspaceId);
      assertString(event.eventId,    'event.eventId');
      assertString(event.eventType,  'event.eventType');
      assertString(event.workspaceId,'event.workspaceId');
      assert(['high','medium','low'].includes(event.urgency), `urgency must be high/medium/low, got: ${event.urgency}`);
    },
  },

  {
    name:                'extractDeliveryId extracts connector-native ID from headers/body',
    connectors:          ['github', 'slack', 'jira'],
    requiresCredentials: false,
    async run({ connectorId }) {
      const fixture = _webhookFixture(connectorId);
      const id = extractDeliveryId(connectorId, fixture.headers, fixture.body);
      assertString(id, `deliveryId for ${connectorId}`);
    },
  },

  {
    name:                'claimDelivery grants first claim and rejects duplicate',
    connectors:          'all',
    requiresCredentials: false,
    async run({ workspaceId, connectorId }) {
      if (!(await isRedisReachable())) throw new Error('SKIP: Redis unavailable');
      const deliveryId = `test-del-${Date.now()}-${Math.random()}`;
      const first  = await claimDelivery(workspaceId, connectorId, deliveryId);
      const second = await claimDelivery(workspaceId, connectorId, deliveryId);
      assert(first  === true,  'first claim should succeed');
      assert(second === false, 'duplicate claim should be rejected');
    },
  },

];

function _webhookFixture(connectorId) {
  const deliveryId = `del-${Date.now()}`;
  switch (connectorId) {
    case 'github':
      return {
        headers: { 'x-github-event': 'pull_request', 'x-github-delivery': deliveryId },
        body: { action: 'opened', pull_request: { number: 1, title: 'Test PR', user: { login: 'alice' } }, repository: { full_name: 'org/repo' }, sender: { login: 'alice' } },
      };
    case 'slack':
      return {
        headers: {},
        // event_id at top-level per Slack Events API spec; also present in nested event
        body: { event_id: deliveryId, event: { type: 'message', text: 'hello', user: 'U123', channel: 'C456', ts: '1234.0001' } },
      };
    case 'jira':
      return {
        headers: { 'x-atlassian-event-id': deliveryId },
        body: { webhookEvent: 'jira:issue_created', issue: { key: 'PROJ-1', fields: { summary: 'Bug found', status: { name: 'Open' }, labels: [], priority: { name: 'High' } } }, user: { displayName: 'Bob' } },
      };
    case 'notion':
      return {
        headers: { 'x-notion-webhook-id': deliveryId },
        body: { type: 'page.updated', entity: { id: 'page-1', type: 'page' }, authors: [{ id: 'u1', name: 'Charlie' }] },
      };
    default:
      return { headers: {}, body: {} };
  }
}
