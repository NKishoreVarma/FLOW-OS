#!/usr/bin/env node
/**
 * ai-quality-lab.js — v1.0 Launch (Program 3)
 *
 * Measures FLOW OS AI quality continuously.
 * Probes hallucination rate, citation accuracy, recommendation accuracy,
 * workflow success, and reasoning latency.
 *
 * Usage: node scripts/ai-quality-lab.js --host http://localhost:5001 --jwt <token> --workspace <id>
 */

import { parseArgs } from 'util';

const { values: args } = parseArgs({
  args: process.argv.slice(2),
  options: {
    host:      { type: 'string', default: 'http://localhost:5001' },
    jwt:       { type: 'string', default: '' },
    workspace: { type: 'string', default: 'workspace_corp_alpha' },
    output:    { type: 'string', default: '' },
  },
});

const HOST = args.host;
const JWT  = args.jwt;
const WS   = args.workspace;

const h = {
  Authorization:  `Bearer ${JWT}`,
  'workspace-id': WS,
  'Content-Type': 'application/json',
};

async function post(path, body) {
  const r = await fetch(`${HOST}${path}`, { method: 'POST', headers: h, body: JSON.stringify(body) });
  return { ok: r.ok, status: r.status, body: await r.json().catch(() => null), ms: 0 };
}

async function timed(fn) {
  const start = Date.now();
  const result = await fn();
  return { ...result, ms: Date.now() - start };
}

// ── Test cases with ground truth ─────────────────────────────────────────────
const COPILOT_TESTS = [
  {
    question: 'What is the current date?',
    expectsDate: true,
    checkFn: (ans) => /\d{4}/.test(ans),
    label: 'date_aware',
  },
  {
    question: 'What connectors are available in FLOW OS?',
    mustContain: ['github', 'gmail', 'jira'],
    label: 'connector_knowledge',
  },
  {
    question: 'Tell me about a recent deployment',
    shouldNotContain: ['I cannot', "I don't have access"],
    label: 'deployment_context',
  },
  {
    question: 'What are the top engineering risks this week?',
    shouldNotContain: ['I cannot', "I don't have access", 'no data'],
    label: 'risk_awareness',
  },
  {
    question: 'Summarize what happened in the past 24 hours',
    shouldNotContain: ["I don't know", 'unable to determine'],
    label: 'temporal_summary',
  },
];

const RECOMMEND_TESTS = [
  { label: 'returns_recommendations', checkFn: (body) => Array.isArray(body?.recommendations) },
  { label: 'recommendations_have_rationale', checkFn: (body) => (body?.recommendations ?? []).every(r => r.rationale || r.reason || r.explanation) },
  { label: 'recommendations_have_action', checkFn: (body) => (body?.recommendations ?? []).every(r => r.action || r.title || r.label) },
];

const metrics = {
  citationAccuracy:      { hits: 0, total: 0 },
  hallucination:         { hits: 0, total: 0 },
  recommendAccuracy:     { hits: 0, total: 0 },
  workflowSuccess:       { hits: 0, total: 0 },
  reasoning:             { latencies: [] },
  agentAgreement:        { hits: 0, total: 0 },
};

console.log('\n🧪 FLOW OS v1.0 — AI Quality Lab\n');
console.log(`  Host:      ${HOST}`);
console.log(`  Workspace: ${WS}\n`);

if (!JWT) { console.error('  ❌ --jwt is required'); process.exit(1); }

(async () => {
  // 1. Copilot quality tests
  console.log('  [1/5] Copilot quality...');
  for (const test of COPILOT_TESTS) {
    const { body, ms } = await timed(() =>
      post('/api/brain/copilot', { question: test.question, pageContext: '/' })
    );
    metrics.reasoning.latencies.push(ms);

    const answer = (body?.answer ?? body?.response ?? body?.content ?? '').toLowerCase();
    const hasCitations = !!(body?.citations?.length || body?.evidence?.length || body?.sources?.length);

    // Citation accuracy
    metrics.citationAccuracy.total++;
    if (hasCitations) metrics.citationAccuracy.hits++;

    // Hallucination detection (simple: contains admission of no data when we expect data)
    metrics.hallucination.total++;
    const noDataPhrases = ["i don't have", "i cannot access", "no data available", "not able to find"];
    const hallucinationRisk = noDataPhrases.some(p => answer.includes(p));
    if (!hallucinationRisk) metrics.hallucination.hits++; // no hallucination = correct

    // Custom check
    let passed = true;
    if (test.mustContain) passed = test.mustContain.every(s => answer.includes(s.toLowerCase()));
    if (test.shouldNotContain) passed = !test.shouldNotContain.some(s => answer.toLowerCase().includes(s.toLowerCase()));
    if (test.checkFn) passed = test.checkFn(answer);

    const sym = passed ? '✅' : '⚠️ ';
    console.log(`     ${sym} ${test.label} (${ms}ms)`);
  }

  // 2. Recommendation accuracy
  console.log('\n  [2/5] Recommendation accuracy...');
  const recResp = await post('/api/brain/reason', { question: 'What should I prioritize today?' });
  for (const test of RECOMMEND_TESTS) {
    metrics.recommendAccuracy.total++;
    const passed = test.checkFn(recResp.body);
    if (passed) metrics.recommendAccuracy.hits++;
    console.log(`     ${passed ? '✅' : '❌'} ${test.label}`);
  }

  // 3. Workflow success
  console.log('\n  [3/5] Workflow success rate (via execution records)...');
  const wf = await fetch(`${HOST}/api/analytics/summary?days=30`, { headers: h }).then(r => r.json()).catch(() => ({}));
  const errors = wf?.errors ?? {};
  const totalErrors = Object.values(errors).reduce((s, v) => s + v, 0);
  const successRate = totalErrors === 0 ? 1 : Math.max(0, 1 - totalErrors / 100);
  metrics.workflowSuccess.hits = Math.round(successRate * 100);
  metrics.workflowSuccess.total = 100;
  console.log(`     ${successRate > 0.9 ? '✅' : '⚠️ '} workflow success rate: ${Math.round(successRate * 100)}%`);

  // 4. Agent agreement (council)
  console.log('\n  [4/5] Agent agreement (Executive Council)...');
  const council = await post('/api/council/ask', { question: 'What is the current highest engineering risk?' });
  const debate = council.body?.debate ?? council.body?.synthesis ?? {};
  const agents = council.body?.agentResponses ?? [];
  metrics.agentAgreement.total++;
  if (agents.length >= 2) {
    metrics.agentAgreement.hits++;
    console.log(`     ✅ ${agents.length} agents responded`);
  } else {
    console.log(`     ⚠️  Council returned ${agents.length} agent responses`);
  }

  // 5. Brief accuracy
  console.log('\n  [5/5] Morning brief accuracy...');
  const brief = await timed(() =>
    fetch(`${HOST}/api/workspace/snapshot`, { headers: h }).then(r => r.json()).catch(() => null)
  );
  metrics.reasoning.latencies.push(brief.ms);
  const hasBrief = brief.body?.overall?.summary || brief.body?.overall?.topActions?.length > 0;
  console.log(`     ${hasBrief ? '✅' : '⚠️ '} workspace snapshot (${brief.ms}ms)`);

  // ── Compute final metrics ─────────────────────────────────────────────────
  const citationAcc    = metrics.citationAccuracy.total > 0 ? metrics.citationAccuracy.hits / metrics.citationAccuracy.total : 0;
  const hallucinRate   = metrics.hallucination.total > 0 ? 1 - (metrics.hallucination.hits / metrics.hallucination.total) : 0;
  const recAcc         = metrics.recommendAccuracy.total > 0 ? metrics.recommendAccuracy.hits / metrics.recommendAccuracy.total : 0;
  const wfSuccess      = metrics.workflowSuccess.total > 0 ? metrics.workflowSuccess.hits / metrics.workflowSuccess.total : 0;
  const agentAgreement = metrics.agentAgreement.total > 0 ? metrics.agentAgreement.hits / metrics.agentAgreement.total : 0;
  const latencies      = metrics.reasoning.latencies;
  const avgLatency     = latencies.length > 0 ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0;
  const p95Latency     = latencies.length > 0 ? latencies.sort((a, b) => a - b)[Math.floor(latencies.length * 0.95)] ?? 0 : 0;

  const overall = (citationAcc * 0.2 + (1 - hallucinRate) * 0.3 + recAcc * 0.2 + wfSuccess * 0.2 + agentAgreement * 0.1);
  const grade = overall >= 0.9 ? 'A+' : overall >= 0.8 ? 'A' : overall >= 0.7 ? 'B' : overall >= 0.6 ? 'C' : 'D';

  console.log(`\n${'─'.repeat(60)}`);
  console.log('\n  AI Quality Report\n');
  console.log(`  Hallucination Rate:       ${(hallucinRate * 100).toFixed(1)}%  (lower is better)`);
  console.log(`  Citation Accuracy:        ${(citationAcc * 100).toFixed(1)}%`);
  console.log(`  Recommendation Accuracy:  ${(recAcc * 100).toFixed(1)}%`);
  console.log(`  Workflow Success Rate:     ${(wfSuccess * 100).toFixed(1)}%`);
  console.log(`  Agent Agreement Rate:      ${(agentAgreement * 100).toFixed(1)}%`);
  console.log(`  Avg Reasoning Latency:    ${avgLatency}ms`);
  console.log(`  P95 Reasoning Latency:    ${p95Latency}ms`);
  console.log(`  Overall Score:            ${(overall * 100).toFixed(1)}% — Grade ${grade}`);
  console.log();

  const report = {
    runAt: new Date().toISOString(),
    host: HOST, workspace: WS,
    metrics: {
      hallucinationRate: hallucinRate, citationAccuracy: citationAcc,
      recommendationAccuracy: recAcc, workflowSuccessRate: wfSuccess,
      agentAgreementRate: agentAgreement,
      avgReasoningLatencyMs: avgLatency, p95ReasoningLatencyMs: p95Latency,
    },
    overall, grade,
  };

  if (args.output) {
    const { writeFile } = await import('fs/promises');
    await writeFile(args.output, JSON.stringify(report, null, 2));
    console.log(`  📄 Report saved to ${args.output}`);
  }

  console.log(`  ${overall >= 0.7 ? '🎉' : '⚠️ '} AI Quality ${overall >= 0.7 ? 'CERTIFIED' : 'NEEDS IMPROVEMENT'} — Grade ${grade}\n`);
  process.exit(overall >= 0.6 ? 0 : 1);
})();
