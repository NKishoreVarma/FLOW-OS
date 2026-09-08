/**
 * p6_workload_study.mjs — P6 Workload measurement + local/quantized-LLM study.
 *
 * P6 does NOT build/train/quantize anything. It MEASURES the real FLOW workload and
 * derives whether a quantized LLM is justified. Measurement reuses the EXISTING AI
 * telemetry (metricsCollector via /api/ai/metrics) + times retrieval vs total to
 * separate deterministic work from LLM work.
 *
 * Runs against REAL Helios data (workload is content-independent of the pilot).
 */
import { prisma }          from '../../src/core/config/prisma.js';
import { signToken }       from '../../src/core/middleware/authenticate.js';
import { retrieveContext } from '../../src/services/retrievalService.js';
import { estimateTokens }  from '../../src/observability/tokenCounter.js';

const BASE = 'http://127.0.0.1:5001';
const WS   = 'workspace_helios_test';   // real data; workload measurement only, read-only

const ws = await prisma.workspace.findUnique({ where: { externalId: WS } });
const u  = await prisma.user.findFirst({ where: { orgId: ws.orgId } });
const jwt = signToken({ id: u.id, orgId: ws.orgId, email: u.email, role: 'OWNER' });
const H = { Authorization: `Bearer ${jwt}`, 'workspace-id': WS, 'Content-Type': 'application/json' };

// Representative query classes (real Helios workload).
const QUERIES = [
  ['simple-fact',   'What incidents are currently open?'],
  ['person',        'What has the team been working on recently?'],
  ['entity',        'Tell me about the Horizon Migration project.'],
  ['relationship',  'Who is involved in the API gateway work?'],
  ['temporal',      'What changed in the last week?'],
  ['semantic',      'Summarize the main engineering risks.'],
  ['multi-hop',     'Which customers are affected by open incidents?'],
  ['unknown',       'What is the status of NONEXISTENT-99999?'],
];

const rows = [];
console.log('\n######### P6 — WORKLOAD MEASUREMENT STUDY (real Helios data) #########\n');
console.log('Running representative workload (Ollama is single-threaded → serial)…\n');

for (const [cls, q] of QUERIES) {
  // Retrieval latency (deterministic path), measured in-process.
  const tR = Date.now();
  const chunks = await retrieveContext(WS, q).catch(() => []);
  const retrievalMs = Date.now() - tR;
  const ctxTokens = estimateTokens((chunks || []).map(c => c.markdown || '').join('\n'));

  // Total latency (retrieval + LLM synthesis + verify), via the real endpoint.
  const tT = Date.now();
  const r = await fetch(`${BASE}/api/brain/copilot`, { method: 'POST', headers: H, body: JSON.stringify({ question: q }) }).catch(() => null);
  const totalMs = Date.now() - tT;
  const body = r ? await r.json().catch(() => ({})) : {};
  const answer = String(body.answer || body.response || body.message || '');
  const llmMs = Math.max(0, totalMs - retrievalMs);

  rows.push({ cls, retrievalMs, llmMs, totalMs, chunks: chunks?.length ?? 0, ctxTokens, outTokens: estimateTokens(answer) });
  console.log(`  ${cls.padEnd(14)} retrieval=${String(retrievalMs).padStart(5)}ms  llm≈${String(llmMs).padStart(6)}ms  total=${String(totalMs).padStart(6)}ms  ctx=${String(ctxTokens).padStart(4)}tok  out=${String(estimateTokens(answer)).padStart(4)}tok  chunks=${chunks?.length ?? 0}`);
}

// ── Aggregate + server-side telemetry ───────────────────────────────────────
const mean = (a, f) => Math.round(a.reduce((s, x) => s + f(x), 0) / a.length);
const pct  = (a, f, p) => { const s = a.map(f).sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };

console.log('\n── Aggregate (measured) ──');
console.log(`  retrieval:  p50=${pct(rows, r => r.retrievalMs, 0.5)}ms  p95=${pct(rows, r => r.retrievalMs, 0.95)}ms  mean=${mean(rows, r => r.retrievalMs)}ms`);
console.log(`  LLM synth:  p50=${pct(rows, r => r.llmMs, 0.5)}ms  p95=${pct(rows, r => r.llmMs, 0.95)}ms  mean=${mean(rows, r => r.llmMs)}ms`);
console.log(`  total:      p50=${pct(rows, r => r.totalMs, 0.5)}ms  p95=${pct(rows, r => r.totalMs, 0.95)}ms  mean=${mean(rows, r => r.totalMs)}ms`);
const llmShare = Math.round(100 * mean(rows, r => r.llmMs) / mean(rows, r => r.totalMs));
console.log(`  → LLM synthesis is ~${llmShare}% of end-to-end latency; retrieval is ~${100 - llmShare}%`);
console.log(`  context size: mean=${mean(rows, r => r.ctxTokens)}tok  out=${mean(rows, r => r.outTokens)}tok`);

// Server-side AI telemetry (real record()s from this workload).
try {
  const m = await fetch(`${BASE}/api/ai/metrics/ollama?minutes=15`, { headers: H }).then(x => x.json());
  console.log('\n── Server AI telemetry (ollama, last 15m) ──');
  console.log(`  requests=${m.requestCount}  errorRate=${m.errorRate}%  fallbackRate=${m.fallbackRate}%  cacheHitRate=${m.cacheHitRate}%`);
  console.log(`  latency p50=${m.latency?.p50}ms p95=${m.latency?.p95}ms p99=${m.latency?.p99}ms`);
  console.log(`  tokens in=${m.tokens?.input} out=${m.tokens?.output}`);
  console.log(`  taskBreakdown=${JSON.stringify(m.taskBreakdown)}`);
  console.log(`  modelBreakdown=${JSON.stringify(m.modelBreakdown)}`);
} catch (e) { console.log('\n(server AI telemetry unavailable:', e.message, ')'); }

console.log('\nP6_STUDY_DONE');
await prisma.$disconnect();
process.exit(0);
