/**
 * ConversationTestRunner — orchestrates the full QA suite.
 *
 * Runs all scenarios through ConversationSimulator, evaluates assertions,
 * computes scorecards, and returns structured results.
 *
 * No external connections required. Fully deterministic in CI.
 */

import { generateAll, generateSecurityOnly } from './ScenarioGenerator.js';
import { simulate }                          from './ConversationSimulator.js';
import { evaluate }                          from './ConversationAssertions.js';
import { score, aggregateScores }            from './ConversationScorecard.js';

/**
 * Run a single scenario and return a full result object.
 *
 * @param {object} scenario
 * @returns {ScenarioResult}
 */
export function runScenario(scenario) {
  const startMs = Date.now();
  let result;

  try {
    result = simulate(scenario);
  } catch (err) {
    return {
      scenario,
      result:    null,
      assertions: { total: 0, passed: 0, failed: 1, results: [{ type: 'SIMULATOR_ERROR', passed: false, message: err.message }] },
      scorecard: null,
      passed:    false,
      latencyMs: Date.now() - startMs,
      error:     err.message,
    };
  }

  const latencyMs = Date.now() - startMs;
  const assertionResult = evaluate(scenario.assertions, result);

  // Adjust scorecard response time based on latency
  const scorecard = score(scenario, result, assertionResult);
  if (latencyMs > 500) scorecard.dimensions.responseTime = Math.max(0, scorecard.dimensions.responseTime - 3);
  if (latencyMs > 2000) scorecard.dimensions.responseTime = 0;

  const passed = assertionResult.failed === 0;

  return {
    scenario,
    result,
    assertions: assertionResult,
    scorecard,
    passed,
    latencyMs,
    error: null,
  };
}

/**
 * Run all scenarios and return full suite results.
 *
 * @param {{ categories?: string[], securityOnly?: boolean, verbose?: boolean }} opts
 * @returns {SuiteResult}
 */
export async function runSuite(opts = {}) {
  const { categories = null, securityOnly = false, verbose = false } = opts;

  let scenarios = generateAll();
  if (securityOnly) scenarios = scenarios.filter(s => s.security);
  if (categories?.length) scenarios = scenarios.filter(s => categories.includes(s.category));

  const suiteStart = Date.now();
  const results    = [];
  const byCategory = {};

  let passCount       = 0;
  let failCount       = 0;
  let securityPass    = 0;
  let securityFail    = 0;
  let criticalFail    = 0;

  for (const scenario of scenarios) {
    const result = runScenario(scenario);
    results.push(result);

    // Category tracking
    if (!byCategory[scenario.category]) {
      byCategory[scenario.category] = { total: 0, passed: 0, failed: 0, security: scenario.security };
    }
    byCategory[scenario.category].total++;

    if (result.passed) {
      passCount++;
      byCategory[scenario.category].passed++;
      if (scenario.security) securityPass++;
    } else {
      failCount++;
      byCategory[scenario.category].failed++;
      if (scenario.security) securityFail++;
      if (scenario.severity === 'critical') criticalFail++;

      if (verbose) {
        const failures = result.assertions.results.filter(r => !r.passed);
        console.error(`  ✗ [${scenario.id}] ${scenario.description}`);
        for (const f of failures) {
          console.error(`    → ${f.type}: ${f.message}`);
        }
      }
    }
  }

  const suiteDurationMs = Date.now() - suiteStart;
  const scorecards      = results.filter(r => r.scorecard).map(r => r.scorecard);
  const aggregate       = aggregateScores(scorecards);

  return {
    total:          scenarios.length,
    passed:         passCount,
    failed:         failCount,
    passRate:       Math.round((passCount / scenarios.length) * 100 * 10) / 10,
    security: {
      total:   scenarios.filter(s => s.security).length,
      passed:  securityPass,
      failed:  securityFail,
    },
    criticalFails:    criticalFail,
    suiteDurationMs,
    byCategory,
    results,
    scorecard:      aggregate,
    ciPassed:       criticalFail === 0 && failCount === 0,
  };
}

/**
 * Run only the security test scenarios.
 */
export async function runSecuritySuite(opts = {}) {
  return runSuite({ ...opts, securityOnly: true });
}

/**
 * Run only a specific category.
 */
export async function runCategory(category, opts = {}) {
  return runSuite({ ...opts, categories: [category] });
}

/**
 * Quick smoke test — run 5 greetings + 5 security tests.
 * For pre-commit hooks where speed matters.
 */
export async function runSmoke() {
  const greetings = generateAll()
    .filter(s => s.category === 'greetings')
    .slice(0, 5);
  const security = generateSecurityOnly().slice(0, 5);

  const scenarios  = [...greetings, ...security];
  const results    = scenarios.map(runScenario);
  const passed     = results.filter(r => r.passed).length;
  const critFails  = results.filter(r => !r.passed && r.scenario.severity === 'critical').length;

  return {
    total:     scenarios.length,
    passed,
    failed:    scenarios.length - passed,
    ciPassed:  critFails === 0,
    criticalFails: critFails,
    results,
  };
}
