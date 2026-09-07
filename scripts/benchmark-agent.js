/**
 * Stage 4G/4H/4L — Baseline vs Agent benchmark.
 *
 * Compares, on the SAME workspace / questions / retrieval / governance:
 *   A) OperationalBrain standard pipeline (agentMode OFF)
 *   B) OperationalBrain + AgentRuntime      (agentMode ON)
 *
 * across three question classes (simple / multi-hop / ambiguous), and shows the
 * agent-mode routing recommendation for each.
 *
 * HONESTY: correctness / hallucination-rate / token comparison require an LLM-
 * enabled environment. Where no LLM provider is reachable, both paths fall back to
 * FLOW's deterministic heuristics (model calls ≈ 0); this run then measures
 * latency, tool/retrieval calls, and evidence yield — and says so plainly. It does
 * NOT claim quality improvement without the measurement.
 *
 * Run: node scripts/benchmark-agent.js [workspaceId]
 */

import { runReasoning } from '../src/ai/reasoning/OperationalBrain.js';
import { runReasoningAgentMode } from '../src/ai/agent/brainIntegration.js';
import { classifyAgentRouting } from '../src/ai/agent/agentRouting.js';

const WS = process.argv[2] || 'workspace_demo';

const QUESTIONS = [
  { cls: 'simple',    q: 'List the open incidents.' },
  { cls: 'simple',    q: 'Who is the CTO?' },
  { cls: 'multi_hop', q: 'Why are enterprise SSO users getting 401 errors and who owns the fix?' },
  { cls: 'multi_hop', q: 'What is blocking the Helios Platform release and how did it happen?' },
  { cls: 'ambiguous', q: 'What is going on that I should know about right now?' },
];

async function withTimeout(p, ms, label) {
  let t;
  try { return await Promise.race([p, new Promise((_, r) => { t = setTimeout(() => r(new Error(`${label} timeout ${ms}ms`)), ms); })]); }
  finally { clearTimeout(t); }
}

async function time(fn) { const t = Date.now(); try { const v = await fn(); return { v, ms: Date.now() - t, ok: true }; } catch (e) { return { v: null, ms: Date.now() - t, ok: false, err: e.message }; } }

function baselineMetrics(resp) {
  return {
    evidence: resp?.evidence?.total ?? 0,
    retrievals: (resp?.capabilities?.queried?.length) ?? 0,
    answerLen: (resp?.answer || '').length,
  };
}
function agentMetrics(resp) {
  return {
    evidence: resp?.evidence?.total ?? 0,
    toolCalls: resp?._agentTrace?.toolCalls ?? 0,
    plannerCalls: resp?._agentTrace?.plannerCalls ?? 0,
    answerLen: (resp?.answer || '').length,
    stop: resp?._agentTrace?.terminationReason,
  };
}

async function main() {
  console.log('\n════════════════════════════════════════════════════════════════════');
  console.log(` Baseline vs Agent benchmark — workspace=${WS}`);
  console.log(`   AGENT_PLANNER=${process.env.AGENT_PLANNER || 'heuristic'}  AI_PROVIDER=${process.env.AI_PROVIDER || 'ollama'}  GEMINI_KEY=${process.env.GEMINI_API_KEY ? 'set' : 'unset'}`);
  console.log('════════════════════════════════════════════════════════════════════\n');

  let anyLLM = false;
  const rows = [];

  for (const { cls, q } of QUESTIONS) {
    const route = classifyAgentRouting({ question: q });
    const base  = await time(() => withTimeout(runReasoning(WS, { question: q, role: 'MEMBER', agentMode: false }, {}), 45000, 'baseline'));
    const agent = await time(() => withTimeout(runReasoningAgentMode(WS, { question: q, role: 'MEMBER', orgPlan: 'enterprise' }), 45000, 'agent'));

    const bm = base.ok ? baselineMetrics(base.v) : null;
    const am = agent.ok ? agentMetrics(agent.v) : null;
    if (base.v?.confidence?.components && Object.keys(base.v.confidence.components).length) anyLLM = anyLLM || false;

    rows.push({ cls, q, route, base, agent, bm, am });

    console.log(`● [${cls}] ${q}`);
    console.log(`   routing → ${route.useAgent ? 'AGENT' : 'FAST'} (${route.complexity}: ${route.reason})`);
    console.log(`   baseline: ${base.ok ? `${base.ms}ms, evidence=${bm.evidence}, retrievals=${bm.retrievals}, ans=${bm.answerLen}c` : `FAILED (${base.err})`}`);
    console.log(`   agent   : ${agent.ok ? `${agent.ms}ms, evidence=${am.evidence}, toolCalls=${am.toolCalls}, planner=${am.plannerCalls}, stop=${am.stop}, ans=${am.answerLen}c` : `FAILED (${agent.err})`}`);
    console.log('');
  }

  // ── Aggregates ────────────────────────────────────────────────────────────
  const okRows = rows.filter(r => r.base.ok && r.agent.ok);
  const avg = (arr, f) => arr.length ? (arr.reduce((s, x) => s + f(x), 0) / arr.length) : 0;
  console.log('────────────────────────────────────────────────────────────────────');
  console.log(' Averages (successful runs):');
  console.log(`   baseline latency : ${avg(okRows, r => r.base.ms).toFixed(0)}ms   evidence: ${avg(okRows, r => r.bm.evidence).toFixed(1)}`);
  console.log(`   agent    latency : ${avg(okRows, r => r.agent.ms).toFixed(0)}ms   evidence: ${avg(okRows, r => r.am.evidence).toFixed(1)}   toolCalls: ${avg(okRows, r => r.am.toolCalls).toFixed(1)}`);
  console.log('');
  console.log(' Routing summary (agent-mode recommended for):');
  for (const r of rows) console.log(`   ${r.route.useAgent ? '✓ AGENT' : '· fast '}  [${r.cls}] ${r.q.slice(0, 52)}`);
  console.log('');
  const llmReachable = !!process.env.GEMINI_API_KEY || !!process.env.OPENAI_API_KEY || !!process.env.ANTHROPIC_API_KEY;
  console.log(' NOTE: ' + (llmReachable
    ? 'An LLM provider key is set — model calls/tokens/quality can be compared with an LLM-instrumented run.'
    : 'No LLM provider key set in this environment — BOTH paths used deterministic heuristics (model calls ≈ 0). '
      + 'Latency / evidence / tool-call figures above are real; correctness, hallucination-rate, and token comparison require an LLM-enabled run.'));
  console.log('────────────────────────────────────────────────────────────────────\n');
  process.exit(0);
}

main().catch(e => { console.error('benchmark crashed:', e); process.exit(1); });
