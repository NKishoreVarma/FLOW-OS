/**
 * Scorecard — renders connector validation results as a formatted report.
 *
 * Outputs:
 *   1. Per-suite summary table (PASS/FAIL/SKIP per connector per suite)
 *   2. Connector production-readiness verdict
 *   3. Full failure log
 */

import { ALL_SUITES, ALL_CONNECTORS, INFRASTRUCTURE_SUITES, evaluateReadiness } from './ValidationRunner.js';

const SUITE_LABELS = {
  oauth:                  'OAuth',
  permissions:            'Permissions',
  refresh:                'Token Refresh',
  disconnect:             'Disconnect',
  reconnect:              'Reconnect',
  initial_sync:           'Initial Sync',
  incremental_sync:       'Incremental Sync',
  webhook:                'Webhook',
  retry:                  'Retry',
  failure_recovery:       'Failure Recovery',
  duplicate_protection:   'Duplicate Protection',
  rate_limiting:          'Rate Limiting',
  workspace_isolation:    'Workspace Isolation',
  performance:            'Performance',
};

const CONNECTOR_LABELS = {
  github:           'GitHub',
  gmail:            'Gmail',
  'google-calendar':'Calendar',
  slack:            'Slack',
  notion:           'Notion',
  jira:             'Jira',
};

/**
 * Build a scorecard object from test results.
 */
export function buildScorecard(results) {
  const suiteNames = ALL_SUITES.map(s => s.SUITE);

  // Grid: connector → suite → { pass, fail, skip }
  const grid = {};
  for (const connector of ALL_CONNECTORS) {
    grid[connector] = {};
    for (const suite of suiteNames) {
      const matching = results.filter(r => r.connector === connector && r.suite === suite);
      grid[connector][suite] = {
        pass:  matching.filter(r => r.status === 'PASS').length,
        fail:  matching.filter(r => r.status === 'FAIL').length,
        skip:  matching.filter(r => r.status === 'SKIP').length,
        total: matching.length,
      };
    }
  }

  const readiness = evaluateReadiness(results);

  return { grid, readiness, suiteNames, results };
}

/**
 * Print the scorecard to stdout.
 */
export function printScorecard(scorecard) {
  const { grid, readiness, suiteNames, results } = scorecard;

  const hr = (char = '─', width = 100) => char.repeat(width);

  console.log('\n' + hr('═'));
  console.log(' FLOW OS Integration Validation — Connector Scorecard');
  console.log(hr('═'));

  // ── Per-suite grid ──────────────────────────────────────────────────────────
  console.log('\n Suite Results by Connector\n');

  const COL = 12;
  const SUITE_COL = 22;

  // Header
  process.stdout.write(' ' + 'Suite'.padEnd(SUITE_COL));
  for (const c of ALL_CONNECTORS) process.stdout.write((CONNECTOR_LABELS[c] || c).padEnd(COL));
  console.log();
  console.log(' ' + hr('-', SUITE_COL + ALL_CONNECTORS.length * COL));

  for (const suite of suiteNames) {
    const isInfra = INFRASTRUCTURE_SUITES.has(suite);
    const label   = (isInfra ? '★ ' : '  ') + (SUITE_LABELS[suite] || suite);
    process.stdout.write(' ' + label.padEnd(SUITE_COL));

    for (const connector of ALL_CONNECTORS) {
      const { pass, fail, skip, total } = grid[connector][suite];
      let cell;
      if (total === 0) {
        cell = '  —  ';
      } else if (fail > 0) {
        cell = `❌${fail}F ${pass}P${skip > 0 ? ` ${skip}S` : ''}`;
      } else if (pass === total) {
        cell = `✅ ${pass}/${total}`;
      } else {
        cell = `⏭️  ${pass}P ${skip}S`;
      }
      process.stdout.write(cell.padEnd(COL));
    }
    console.log();
  }

  console.log(' ' + hr('-', SUITE_COL + ALL_CONNECTORS.length * COL));
  console.log(' ★ = Infrastructure suite (must PASS for production-ready)\n');

  // ── Connector readiness verdict ─────────────────────────────────────────────
  console.log(hr('─'));
  console.log(' Connector Production-Readiness Verdict\n');

  for (const connector of ALL_CONNECTORS) {
    const r   = readiness[connector];
    const pct = r.total > 0 ? Math.round((r.pass / r.total) * 100) : 0;
    const verdict = r.ready ? '🟢 PRODUCTION READY' : '🔴 NOT READY';
    const label   = (CONNECTOR_LABELS[connector] || connector).padEnd(16);
    const counts  = `${r.pass}✅ ${r.fail}❌ ${r.skip}⏭️  / ${r.total} tests (${pct}%)`;
    console.log(` ${label} ${verdict}  ${counts}`);
    if (!r.ready) {
      for (const b of r.blockers.slice(0, 5)) console.log(`   └─ ${b}`);
      if (r.blockers.length > 5) console.log(`   └─ ... and ${r.blockers.length - 5} more`);
    }
  }

  // ── Summary ─────────────────────────────────────────────────────────────────
  console.log('\n' + hr('─'));
  const totalPass  = results.filter(r => r.status === 'PASS').length;
  const totalFail  = results.filter(r => r.status === 'FAIL').length;
  const totalSkip  = results.filter(r => r.status === 'SKIP').length;
  const totalTotal = results.length;
  const readyCount = Object.values(readiness).filter(r => r.ready).length;

  console.log(` Total: ${totalTotal} tests — ✅ ${totalPass} PASS  ❌ ${totalFail} FAIL  ⏭️  ${totalSkip} SKIP`);
  console.log(` Production-ready connectors: ${readyCount}/${ALL_CONNECTORS.length}`);

  if (totalFail === 0 && readyCount === ALL_CONNECTORS.length) {
    console.log('\n ✅  ALL CONNECTORS PRODUCTION READY\n');
  } else if (totalFail > 0) {
    console.log('\n ❌  VALIDATION FAILURES — review blockers above\n');
    _printFailures(results);
  } else {
    console.log('\n ⚠️   PARTIAL VALIDATION — some connectors need credential configuration\n');
  }

  console.log(hr('═') + '\n');
}

function _printFailures(results) {
  const failures = results.filter(r => r.status === 'FAIL');
  if (!failures.length) return;
  console.log(' Failure Details:\n');
  for (const f of failures) {
    const infra = INFRASTRUCTURE_SUITES.has(f.suite) ? ' [INFRA]' : '';
    console.log(`   ❌ [${f.connector}]${infra} ${f.suite} » ${f.test}`);
    console.log(`      ${f.error}`);
  }
  console.log();
}

/**
 * Produce a JSON-serializable report for CI integration.
 */
export function buildJsonReport(scorecard) {
  const { readiness, results } = scorecard;
  return {
    timestamp:         new Date().toISOString(),
    summary: {
      total:    results.length,
      pass:     results.filter(r => r.status === 'PASS').length,
      fail:     results.filter(r => r.status === 'FAIL').length,
      skip:     results.filter(r => r.status === 'SKIP').length,
      ready:    Object.values(readiness).filter(r => r.ready).length,
      total_connectors: ALL_CONNECTORS.length,
    },
    connectors: readiness,
    results:    results.map(r => ({
      connector: r.connector,
      suite:     r.suite,
      test:      r.test,
      status:    r.status,
      elapsed:   r.elapsed,
      error:     r.error,
    })),
  };
}
