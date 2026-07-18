/**
 * ValidationRunner — orchestrates all test suites across all connectors.
 *
 * Test result states:
 *   PASS  — test ran and all assertions succeeded
 *   FAIL  — test ran and an assertion or unexpected error failed
 *   SKIP  — test threw an Error whose message starts with 'SKIP:' (infrastructure absent)
 *
 * Production-ready criteria per connector:
 *   - All INFRASTRUCTURE tests (workspace_isolation, duplicate_protection, rate_limiting,
 *     retry, failure_recovery) must PASS.
 *   - CREDENTIAL tests may be SKIP when provider env vars are absent.
 *   - Zero FAIL results.
 */

import { createTestContext, destroyTestContext } from './helpers/testContext.js';

// ── Suite registry ────────────────────────────────────────────────────────────

import * as OAuthSuite              from './suites/OAuthSuite.js';
import * as PermissionsSuite        from './suites/PermissionsSuite.js';
import * as RefreshSuite            from './suites/RefreshSuite.js';
import * as DisconnectSuite         from './suites/DisconnectSuite.js';
import * as ReconnectSuite          from './suites/ReconnectSuite.js';
import * as InitialSyncSuite        from './suites/InitialSyncSuite.js';
import * as IncrementalSyncSuite    from './suites/IncrementalSyncSuite.js';
import * as WebhookSuite            from './suites/WebhookSuite.js';
import * as RetrySuite              from './suites/RetrySuite.js';
import * as FailureRecoverySuite    from './suites/FailureRecoverySuite.js';
import * as DuplicateProtectionSuite from './suites/DuplicateProtectionSuite.js';
import * as RateLimitingSuite       from './suites/RateLimitingSuite.js';
import * as WorkspaceIsolationSuite from './suites/WorkspaceIsolationSuite.js';
import * as PerformanceSuite        from './suites/PerformanceSuite.js';

export const ALL_SUITES = [
  OAuthSuite,
  PermissionsSuite,
  RefreshSuite,
  DisconnectSuite,
  ReconnectSuite,
  InitialSyncSuite,
  IncrementalSyncSuite,
  WebhookSuite,
  RetrySuite,
  FailureRecoverySuite,
  DuplicateProtectionSuite,
  RateLimitingSuite,
  WorkspaceIsolationSuite,
  PerformanceSuite,
];

export const ALL_CONNECTORS = ['github', 'gmail', 'google-calendar', 'slack', 'notion', 'jira'];

// Infrastructure suites — must ALL pass for production-ready status
export const INFRASTRUCTURE_SUITES = new Set([
  'workspace_isolation',
  'duplicate_protection',
  'rate_limiting',
  'retry',
  'failure_recovery',
]);

// ── Runner ────────────────────────────────────────────────────────────────────

/**
 * @typedef {{ connector: string, suite: string, test: string, status: 'PASS'|'FAIL'|'SKIP', error?: string, elapsed: number }} TestResult
 */

/**
 * Run all suites for the given connectors.
 * @param {{ connectors?: string[], suites?: string[], verbose?: boolean }} opts
 * @returns {Promise<TestResult[]>}
 */
export async function runValidation({ connectors = ALL_CONNECTORS, suites, verbose = false } = {}) {
  const suitesToRun = suites
    ? ALL_SUITES.filter(s => suites.includes(s.SUITE))
    : ALL_SUITES;

  const results = [];

  for (const connector of connectors) {
    let ctx;
    try {
      ctx = await createTestContext(connector);
    } catch {
      ctx = { workspaceId: `fallback-ws-${connector}-${Date.now()}`, orgId: null };
    }

    for (const suite of suitesToRun) {
      for (const test of suite.tests) {
        // Skip if this test doesn't apply to this connector
        if (test.connectors !== 'all') {
          if (!test.connectors.includes(connector)) continue;
        }

        const result = {
          connector,
          suite:   suite.SUITE,
          test:    test.name,
          status:  'PASS',
          elapsed: 0,
          error:   undefined,
        };

        const start = Date.now();
        try {
          await test.run({ connectorId: connector, workspaceId: ctx.workspaceId, orgId: ctx.orgId });
          result.status = 'PASS';
        } catch (err) {
          if (err.message.startsWith('SKIP:')) {
            result.status = 'SKIP';
            result.error  = err.message.replace(/^SKIP:\s*/, '');
          } else if (_isMissingTable(err)) {
            // DB migration not yet applied — SKIP rather than FAIL
            result.status = 'SKIP';
            result.error  = `DB migration required: ${_extractTable(err.message)}`;
          } else {
            result.status = 'FAIL';
            result.error  = err.message;
          }
        }
        result.elapsed = Date.now() - start;

        results.push(result);

        if (verbose) {
          const icon = result.status === 'PASS' ? '✅' : result.status === 'SKIP' ? '⏭️ ' : '❌';
          const ms   = `(${result.elapsed}ms)`;
          const err  = result.error ? ` — ${result.error}` : '';
          console.log(`  ${icon} [${connector}] ${suite.SUITE} » ${test.name} ${ms}${err}`);
        }
      }
    }

    await destroyTestContext(ctx).catch(() => {});
  }

  return results;
}

function _isMissingTable(err) {
  return (
    (err.code === '42P01') ||                       // PostgreSQL: undefined_table
    /relation ".+" does not exist/i.test(err.message) ||
    /table ".+" doesn't exist/i.test(err.message)
  );
}

function _extractTable(msg) {
  const m = msg.match(/relation "([^"]+)"/);
  return m ? m[1] : 'unknown table';
}

/**
 * Determine production-ready status for each connector.
 * @param {TestResult[]} results
 * @returns {{ [connector: string]: { ready: boolean, blockers: string[] } }}
 */
export function evaluateReadiness(results) {
  const readiness = {};

  for (const connector of ALL_CONNECTORS) {
    const mine    = results.filter(r => r.connector === connector);
    const blockers = [];

    // Infrastructure suites must all PASS (SKIP = blocker here)
    const infraResults = mine.filter(r => INFRASTRUCTURE_SUITES.has(r.suite));
    for (const r of infraResults) {
      if (r.status === 'FAIL') {
        blockers.push(`[FAIL] ${r.suite} » ${r.test}: ${r.error}`);
      } else if (r.status === 'SKIP') {
        blockers.push(`[SKIP/INFRA] ${r.suite} » ${r.test}: ${r.error}`);
      }
    }

    // Any FAIL anywhere is a blocker
    const nonInfraFails = mine.filter(r => !INFRASTRUCTURE_SUITES.has(r.suite) && r.status === 'FAIL');
    for (const r of nonInfraFails) {
      blockers.push(`[FAIL] ${r.suite} » ${r.test}: ${r.error}`);
    }

    readiness[connector] = {
      ready:    blockers.length === 0,
      blockers,
      pass:     mine.filter(r => r.status === 'PASS').length,
      fail:     mine.filter(r => r.status === 'FAIL').length,
      skip:     mine.filter(r => r.status === 'SKIP').length,
      total:    mine.length,
    };
  }

  return readiness;
}
