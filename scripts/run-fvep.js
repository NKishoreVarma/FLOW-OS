#!/usr/bin/env node
/**
 * run-fvep.js — FLOW Validation & Evaluation Platform CLI
 *
 * Runs against a live backend. Outputs a full quality report.
 *
 * Usage:
 *   node scripts/run-fvep.js --host http://localhost:5001 --jwt <token> --workspace <id>
 *   node scripts/run-fvep.js --regression --version v1.0.2  # release gate
 *   node scripts/run-fvep.js --domain workflowRuntime        # single domain
 */

import { parseArgs } from 'util';

const { values: args } = parseArgs({
  args: process.argv.slice(2),
  options: {
    host:       { type: 'string',  default: 'http://localhost:5001' },
    jwt:        { type: 'string',  default: '' },
    workspace:  { type: 'string',  default: 'workspace_corp_alpha' },
    regression: { type: 'boolean', default: false },
    version:    { type: 'string',  default: '' },
    domain:     { type: 'string',  default: '' },
    json:       { type: 'boolean', default: false },
  },
});

const HOST = args.host;
const JWT  = args.jwt;
const WS   = args.workspace;

if (!JWT) { console.error('  ❌ --jwt is required'); process.exit(1); }

const h = {
  Authorization:  `Bearer ${JWT}`,
  'workspace-id': WS,
  'Content-Type': 'application/json',
};

function grade(score) {
  if (score === null) return '?';
  if (score >= 90) return 'A+';
  if (score >= 80) return 'A';
  if (score >= 70) return 'B';
  if (score >= 60) return 'C';
  return 'D';
}

function statusIcon(s) {
  if (s === 'passed')            return '✅';
  if (s === 'warning')           return '⚠️ ';
  if (s === 'failed')            return '❌';
  if (s === 'insufficient_data') return '–  ';
  return '?  ';
}

async function runSingleDomain() {
  console.log(`\n🧪 FVEP — Domain: ${args.domain}\n`);
  const r = await fetch(`${HOST}/api/fvep/domain/${args.domain}`, { headers: h });
  if (!r.ok) { console.error(`  HTTP ${r.status}`); process.exit(1); }
  const data = await r.json();
  if (args.json) { console.log(JSON.stringify(data, null, 2)); return; }

  console.log(`  Domain:   ${data.domain}`);
  console.log(`  Score:    ${data.score ?? 'N/A'} / 100  (${grade(data.score)})`);
  console.log(`  Status:   ${statusIcon(data.status)} ${data.status}`);
  console.log(`  Threshold:${data.threshold ?? 'N/A'}\n`);

  if (data.findings?.length) {
    console.log('  Findings:');
    data.findings.forEach(f => console.log(`    · ${f}`));
  }
  console.log();
}

async function runRegression() {
  console.log(`\n🧪 FVEP Regression Suite — ${args.version || 'dev'}\n`);
  const r = await fetch(`${HOST}/api/fvep/regression`, {
    method: 'POST', headers: h,
    body: JSON.stringify({ releaseVersion: args.version || 'dev', triggeredBy: 'cli' }),
  });
  const data = await r.json();
  if (args.json) { console.log(JSON.stringify(data, null, 2)); process.exit(data.passed ? 0 : 1); }

  const { report } = data;
  console.log(`  Overall Score: ${report.overallScore ?? 'N/A'} / 100`);
  console.log(`  Domains:       ${report.domainsPassed} / ${report.domainsTotal} passing\n`);

  console.log('  Release Gates:');
  for (const g of report.gates ?? []) {
    console.log(`    ${g.passed ? '✅' : '❌'} ${g.gate.padEnd(40)} required: ${String(g.required).padEnd(25)} actual: ${g.actual}`);
  }

  console.log('\n  Domain Scores:');
  for (const d of report.domainScores ?? []) {
    const scoreStr = d.score !== null ? `${d.score}/100 (${grade(d.score)})` : 'insufficient data';
    console.log(`    ${statusIcon(d.status)} ${d.domain.padEnd(30)} ${scoreStr}`);
  }

  if (report.criticalFindings?.length) {
    console.log('\n  Critical Findings:');
    report.criticalFindings.forEach(f => console.log(`    ⚠️  ${f}`));
  }

  console.log(`\n  ${data.passed ? '🎉 RELEASE GATE: PASSED' : '🚫 RELEASE GATE: BLOCKED'}\n`);
  process.exit(data.passed ? 0 : 1);
}

async function runFull() {
  console.log(`\n🧪 FVEP — Full Evaluation\n`);
  console.log(`  Host:      ${HOST}`);
  console.log(`  Workspace: ${WS}\n`);

  const r = await fetch(`${HOST}/api/fvep/run`, {
    method: 'POST', headers: h,
    body: JSON.stringify({ runType: 'manual' }),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    console.error(`  HTTP ${r.status}: ${err.error ?? 'Unknown error'}`);
    process.exit(1);
  }
  const data = await r.json();
  if (args.json) { console.log(JSON.stringify(data, null, 2)); return; }

  console.log(`  Overall Score: ${data.overallScore ?? 'N/A'} / 100  (${grade(data.overallScore)})`);
  console.log(`  Status:        ${statusIcon(data.status)} ${data.status}`);
  console.log(`  Domains:       ${data.domainsPassed} / ${data.domainsTotal} passing\n`);

  const pad = 30;
  console.log('  Domain Results:');
  for (const d of data.domains ?? []) {
    const scoreStr = d.score !== null ? `${d.score}/100` : 'N/A       ';
    const threshStr = d.threshold ? `(≥${d.threshold})` : '';
    console.log(`    ${statusIcon(d.status)} ${d.domain.padEnd(pad)} ${scoreStr.padEnd(10)} ${threshStr}`);
    if (d.findings?.length) d.findings.slice(0, 2).forEach(f => console.log(`         · ${f}`));
  }

  if (data.allFindings?.length > 0) {
    console.log(`\n  All Findings (${data.allFindings.length}):`);
    data.allFindings.slice(0, 10).forEach(f => console.log(`    · ${f}`));
    if (data.allFindings.length > 10) console.log(`    ... and ${data.allFindings.length - 10} more`);
  }

  console.log(`\n  Run ID: ${data.runId}\n`);
}

if (args.domain) {
  runSingleDomain().catch(err => { console.error(err.message); process.exit(1); });
} else if (args.regression) {
  runRegression().catch(err => { console.error(err.message); process.exit(1); });
} else {
  runFull().catch(err => { console.error(err.message); process.exit(1); });
}
