#!/usr/bin/env node
/**
 * validate-integrations — CLI entry point for Phase 10.4 Integration Validation Suite.
 *
 * Usage:
 *   node scripts/validate-integrations.js
 *   node scripts/validate-integrations.js --connector github
 *   node scripts/validate-integrations.js --connector github,slack
 *   node scripts/validate-integrations.js --suite oauth,permissions,webhook
 *   node scripts/validate-integrations.js --connector github --suite oauth --verbose
 *   node scripts/validate-integrations.js --json > report.json
 *
 * Exit codes:
 *   0 — all infrastructure tests pass (may have SKIPs)
 *   1 — one or more FAIL results
 *   2 — fatal error (import failure, env issue)
 */

import '../src/utils/envValidation.js';

import { parseArgs } from 'util';
import { writeFileSync } from 'fs';

import { runValidation, ALL_CONNECTORS, evaluateReadiness } from '../src/validation/ValidationRunner.js';
import { buildScorecard, printScorecard, buildJsonReport } from '../src/validation/Scorecard.js';

const { values: args } = parseArgs({
  options: {
    connector: { type: 'string', short: 'c' },
    suite:     { type: 'string', short: 's' },
    verbose:   { type: 'boolean', short: 'v', default: false },
    json:      { type: 'boolean', default: false },
    output:    { type: 'string', short: 'o' },
    help:      { type: 'boolean', short: 'h', default: false },
  },
  allowPositionals: true,
});

if (args.help) {
  console.log(`
  FLOW OS Integration Validation Suite (Phase 10.4)

  Usage:
    node scripts/validate-integrations.js [options]

  Options:
    -c, --connector  Comma-separated connector IDs (default: all)
                     Supported: github, gmail, google-calendar, slack, notion, jira
    -s, --suite      Comma-separated suite names (default: all)
                     Supported: oauth, permissions, refresh, disconnect, reconnect,
                                initial_sync, incremental_sync, webhook, retry,
                                failure_recovery, duplicate_protection, rate_limiting,
                                workspace_isolation, performance
    -v, --verbose    Show per-test results as they run
    --json           Output machine-readable JSON report to stdout
    -o, --output     Write JSON report to file path
    -h, --help       Show this help message

  Exit codes:
    0 — all infrastructure tests pass
    1 — one or more tests FAIL
    2 — fatal startup error
  `);
  process.exit(0);
}

const connectors = args.connector
  ? args.connector.split(',').map(s => s.trim()).filter(s => ALL_CONNECTORS.includes(s))
  : ALL_CONNECTORS;

const suites = args.suite
  ? args.suite.split(',').map(s => s.trim())
  : undefined;

if (connectors.length === 0) {
  console.error('No valid connectors specified. Valid: ' + ALL_CONNECTORS.join(', '));
  process.exit(2);
}

console.log(`\n  FLOW OS Integration Validation Suite`);
console.log(`  Connectors: ${connectors.join(', ')}`);
console.log(`  Suites:     ${suites ? suites.join(', ') : 'all (14)'}`);
console.log(`  Verbose:    ${args.verbose}`);
console.log();

let results;
try {
  results = await runValidation({ connectors, suites, verbose: args.verbose });
} catch (err) {
  console.error('Fatal: validation runner crashed:', err.message);
  console.error(err.stack);
  process.exit(2);
}

const scorecard = buildScorecard(results);

if (!args.json) {
  printScorecard(scorecard);
}

const report = buildJsonReport(scorecard);

if (args.json) {
  console.log(JSON.stringify(report, null, 2));
}

if (args.output) {
  writeFileSync(args.output, JSON.stringify(report, null, 2));
  console.error(`Report written to: ${args.output}`);
}

// Exit 1 if any test failed
const hasFail = results.some(r => r.status === 'FAIL');
process.exit(hasFail ? 1 : 0);
