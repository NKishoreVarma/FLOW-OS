#!/usr/bin/env node
/**
 * run-qa.js — FLOW Conversation QA Suite CLI
 *
 * Usage:
 *   node src/testing/conversation/run-qa.js              # full suite
 *   node src/testing/conversation/run-qa.js --smoke      # 10 scenarios, <1s
 *   node src/testing/conversation/run-qa.js --security   # security only
 *   node src/testing/conversation/run-qa.js --category greetings
 *   node src/testing/conversation/run-qa.js --report     # generate report only
 *   node src/testing/conversation/run-qa.js --stats      # scenario counts
 *
 * Exit codes:
 *   0 — all tests pass
 *   1 — test failures detected
 *   2 — critical security failure
 */

import { runSuite, runSmoke }           from './ConversationTestRunner.js';
import { runSecuritySuite, formatSecurityReport } from './SecurityScenarioRunner.js';
import { generateReport, writeReport }  from './ConversationReport.js';
import { stats }                        from './ScenarioGenerator.js';

const args    = process.argv.slice(2);
const isSmoke    = args.includes('--smoke');
const isSecurity = args.includes('--security');
const isStats    = args.includes('--stats');
const isReport   = args.includes('--report');
const categoryIdx = args.indexOf('--category');
const category   = categoryIdx !== -1 ? args[categoryIdx + 1] : null;
const verbose    = args.includes('--verbose') || args.includes('-v');

const RESET  = '\x1b[0m';
const GREEN  = '\x1b[32m';
const RED    = '\x1b[31m';
const YELLOW = '\x1b[33m';
const BOLD   = '\x1b[1m';
const DIM    = '\x1b[2m';
const CYAN   = '\x1b[36m';

function banner() {
  console.log('');
  console.log(`${BOLD}${CYAN}═══════════════════════════════════════════════${RESET}`);
  console.log(`${BOLD}${CYAN}  FLOW CONVERSATION QA SUITE — Phase 9.8${RESET}`);
  console.log(`${BOLD}${CYAN}═══════════════════════════════════════════════${RESET}`);
}

function pad(str, len) {
  return String(str).padEnd(len);
}

async function main() {
  banner();

  // ── Stats mode ──────────────────────────────────────────────────────────────
  if (isStats) {
    const s = stats();
    console.log(`\n${BOLD}Scenario Statistics${RESET}`);
    console.log(`  Total:    ${s.total}`);
    console.log(`  Security: ${s.security}`);
    console.log(`\nBy Category:`);
    for (const [cat, count] of Object.entries(s.byCategory)) {
      console.log(`  ${pad(cat, 32)} ${count}`);
    }
    return;
  }

  // ── Smoke mode ─────────────────────────────────────────────────────────────
  if (isSmoke) {
    console.log(`\n${DIM}Running smoke test (10 scenarios)...${RESET}\n`);
    const result = await runSmoke();
    const color  = result.ciPassed ? GREEN : RED;
    console.log(`${color}${BOLD}Smoke: ${result.passed}/${result.total} passed${RESET}`);
    if (!result.ciPassed) {
      const fails = result.results.filter(r => !r.passed);
      for (const f of fails) {
        console.log(`  ${RED}✗ ${f.scenario.id}${RESET}: ${f.scenario.description}`);
      }
    }
    process.exit(result.ciPassed ? 0 : result.criticalFails > 0 ? 2 : 1);
    return;
  }

  // ── Security-only mode ──────────────────────────────────────────────────────
  if (isSecurity) {
    console.log(`\n${DIM}Running security test suite...${RESET}\n`);
    const secResult = await runSecuritySuite();
    console.log(formatSecurityReport(secResult));
    process.exit(secResult.ciPassed ? 0 : 2);
    return;
  }

  // ── Full suite ──────────────────────────────────────────────────────────────
  const suiteOpts = { verbose, ...(category ? { categories: [category] } : {}) };

  console.log(`\n${DIM}Running conversation scenarios...${RESET}\n`);
  const [suiteResult, secResult] = await Promise.all([
    runSuite(suiteOpts),
    runSecuritySuite(),
  ]);

  // ── Print category results ──────────────────────────────────────────────────
  const CATEGORIES_PER_LINE = 2;
  const cats = Object.entries(suiteResult.byCategory);

  for (const [cat, s] of cats) {
    const rate   = Math.round((s.passed / Math.max(s.total, 1)) * 100);
    const icon   = s.failed === 0 ? `${GREEN}✓${RESET}` : `${RED}✗${RESET}`;
    const sec    = s.security ? ` ${YELLOW}[SEC]${RESET}` : '';
    const bar    = `${'█'.repeat(Math.floor(rate / 10))}${'░'.repeat(10 - Math.floor(rate / 10))}`;
    console.log(`  ${icon} ${pad(cat, 28)} ${pad(s.passed + '/' + s.total, 8)} ${DIM}${bar}${RESET} ${rate}%${sec}`);
  }

  // ── Print summary ───────────────────────────────────────────────────────────
  console.log('');
  console.log(`${BOLD}${CYAN}═══════════════════════════════════════════════${RESET}`);
  console.log(`${BOLD}  RESULTS${RESET}`);
  console.log(`${BOLD}${CYAN}═══════════════════════════════════════════════${RESET}`);

  const passColor = suiteResult.ciPassed ? GREEN : RED;
  console.log(`  Total:       ${suiteResult.total} scenarios`);
  console.log(`  Passed:      ${GREEN}${suiteResult.passed}${RESET}`);
  console.log(`  Failed:      ${suiteResult.failed > 0 ? RED : GREEN}${suiteResult.failed}${RESET}`);
  console.log(`  Pass Rate:   ${passColor}${suiteResult.passRate}%${RESET}`);

  if (suiteResult.scorecard) {
    console.log(`  Quality:     ${BOLD}${suiteResult.scorecard.overallAverage}/100${RESET}`);
  }

  console.log('');
  const secColor = secResult.ciPassed ? GREEN : RED;
  console.log(`  Security:    ${secColor}${secResult.passed}/${secResult.total} passed${RESET}`);
  if (suiteResult.criticalFails > 0) {
    console.log(`  ${RED}${BOLD}  ⚠  ${suiteResult.criticalFails} CRITICAL SECURITY FAILURE(S)${RESET}`);
  }

  // ── Print failures ──────────────────────────────────────────────────────────
  const failures = suiteResult.results.filter(r => !r.passed);
  if (failures.length > 0) {
    console.log('');
    console.log(`${RED}${BOLD}FAILURES:${RESET}`);
    for (const f of failures.slice(0, 20)) {
      console.log(`  ${RED}✗${RESET} [${f.scenario.id}] ${f.scenario.description}`);
      for (const a of f.assertions.results.filter(a => !a.passed)) {
        console.log(`    ${DIM}→ ${a.type}: ${a.message}${RESET}`);
      }
    }
    if (failures.length > 20) {
      console.log(`  ${DIM}... and ${failures.length - 20} more (see report)${RESET}`);
    }
  }

  // ── Write report ────────────────────────────────────────────────────────────
  try {
    const markdown = generateReport(suiteResult, secResult);
    const reportPath = writeReport(markdown);
    console.log('');
    console.log(`  ${DIM}Report: ${reportPath}${RESET}`);
  } catch (err) {
    console.warn(`  ${YELLOW}Report write failed: ${err.message}${RESET}`);
  }

  // ── Final status ────────────────────────────────────────────────────────────
  console.log('');
  if (suiteResult.ciPassed && secResult.ciPassed) {
    console.log(`${GREEN}${BOLD}  ✓ ALL TESTS PASSED${RESET}`);
  } else {
    console.log(`${RED}${BOLD}  ✗ SUITE FAILED${RESET}`);
  }
  console.log(`${BOLD}${CYAN}═══════════════════════════════════════════════${RESET}`);
  console.log('');

  const exitCode = suiteResult.criticalFails > 0 ? 2 : suiteResult.ciPassed ? 0 : 1;
  process.exit(exitCode);
}

main().catch(err => {
  console.error(`${RED}Fatal error: ${err.message}${RESET}`);
  console.error(err.stack);
  process.exit(1);
});
