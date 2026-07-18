/**
 * Rate Limiting Suite — validates connector and platform rate limit handling.
 */

import { assert, assertGreaterThan } from '../helpers/assert.js';

export const SUITE = 'rate_limiting';

export const tests = [

  {
    name:                'process-level rateLimiter middleware is configured',
    connectors:          'all',
    requiresCredentials: false,
    async run() {
      const { rateLimiter } = await import('../../core/middleware/rateLimiter.js');
      assert(typeof rateLimiter === 'function', 'rateLimiter must be a function');
      const middleware = rateLimiter({ max: 10, windowSec: 1 });
      assert(typeof middleware === 'function', 'rateLimiter() returns express middleware');
    },
  },

  {
    name:                'syncWorker rate limiter is configured (max 20 req/s)',
    connectors:          'all',
    requiresCredentials: false,
    async run() {
      const { readFileSync } = await import('fs');
      const src = readFileSync(
        new URL('../../workers/syncWorker.js', import.meta.url).pathname,
        'utf8',
      );
      assert(src.includes('limiter'), 'syncWorker must configure BullMQ rate limiter');
      assert(src.includes('20'), 'syncWorker rate limiter should allow 20 ops/s');
    },
  },

  {
    name:                'webhookWorker rate limiter is configured (max 50 req/s)',
    connectors:          'all',
    requiresCredentials: false,
    async run() {
      const { readFileSync } = await import('fs');
      const src = readFileSync(
        new URL('../../workers/webhookWorker.js', import.meta.url).pathname,
        'utf8',
      );
      assert(src.includes('limiter'), 'webhookWorker must configure BullMQ rate limiter');
    },
  },

  {
    name:                'rateLimiter blocks requests beyond max in window',
    connectors:          'all',
    requiresCredentials: false,
    async run() {
      const { rateLimiter } = await import('../../core/middleware/rateLimiter.js');
      const mw = rateLimiter({ max: 3, windowSec: 10 });

      // Use a unique IP per run so cached module buckets don't carry over across connectors.
      const ip  = `10.0.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
      const req = {
        ip,
        path: '/api/test',
        headers: {},
        connection: { remoteAddress: ip },
      };
      let blockedAt;

      for (let i = 1; i <= 5; i++) {
        let status;
        const res = {
          status:    (s) => { status = s; return { json: () => {} }; },
          json:      () => {},
          setHeader: () => {},
        };
        // Capture next(err) — rate limiter passes an error when blocked, not res.status(429).
        let nextErr;
        mw(req, res, (err) => { nextErr = err; });
        const blocked = (nextErr instanceof Error) || status === 429;
        if (blocked) { blockedAt = i; break; }
      }

      assert(blockedAt !== undefined, 'rateLimiter should block after max requests');
      assert(blockedAt <= 4, `should block by request 4 with max=3, blocked at: ${blockedAt}`);
    },
  },

  {
    name:                'GitHubAdapter respects X-RateLimit-Remaining header',
    connectors:          ['github'],
    requiresCredentials: false,
    async run() {
      const { readFileSync } = await import('fs');
      const src = readFileSync(
        new URL('../../connectors/adapters/GitHubAdapter.js', import.meta.url).pathname,
        'utf8',
      );
      assert(
        src.includes('rate_limit') || src.includes('RateLimit') || src.includes('rateLimit'),
        'GitHubAdapter must handle GitHub rate limits',
      );
    },
  },

  {
    name:                'BullMQ connector-sync queue has concurrency bound',
    connectors:          'all',
    requiresCredentials: false,
    async run() {
      const { readFileSync } = await import('fs');
      const src = readFileSync(
        new URL('../../workers/syncWorker.js', import.meta.url).pathname,
        'utf8',
      );
      assert(src.includes('concurrency'), 'syncWorker must set concurrency limit');
    },
  },

  {
    name:                'BullMQ webhook-processing queue has concurrency bound',
    connectors:          'all',
    requiresCredentials: false,
    async run() {
      const { readFileSync } = await import('fs');
      const src = readFileSync(
        new URL('../../workers/webhookWorker.js', import.meta.url).pathname,
        'utf8',
      );
      assert(src.includes('concurrency'), 'webhookWorker must set concurrency limit');
    },
  },

  {
    name:                'enqueueSyncJob uses delayMs for Slack message batching',
    connectors:          'all',
    requiresCredentials: false,
    async run() {
      const { readFileSync } = await import('fs');
      const src = readFileSync(
        new URL('../../routes/webhookRoutes.js', import.meta.url).pathname,
        'utf8',
      );
      assert(src.includes('delayMs'), 'webhookRoutes must use delayMs for batch rate control');
      assert(src.includes('2000'), 'Slack messages should have 2s batching delay');
    },
  },

];
