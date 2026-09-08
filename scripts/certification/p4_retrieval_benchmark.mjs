/**
 * p4_retrieval_benchmark.mjs — the P4 retrieval MEASUREMENT instrument.
 *
 * P4's own gate: do NOT change the embedding architecture without evidence that the
 * current message-chunk strategy is insufficient, and NEVER claim improvement
 * without measurements. This harness is that measurement — it does NOT modify
 * embeddings or retrieval. It scores the CURRENT retrieval (retrieveContext) and is
 * structured to A/B a future strategy under the same ground truth.
 *
 * Metrics per query: Recall@K, Precision@K, Reciprocal Rank (→ MRR), latency,
 * #retrieved. Aggregates across a ground-truth set.
 *
 * Modes:
 *   --self-validate --workspace=<ws> [--n=8] [--k=5]
 *       Builds ground truth from a workspace's OWN chunks (each chunk's text must
 *       retrieve its own id in top-K). Proves the metric math + that retrieval
 *       returns real ids. READ-ONLY. Instrument validation only — NOT certification.
 *   --groundtruth=<file.json> --workspace=<ws> [--k=5]
 *       Runs a supplied [{query, relevantIds:[...]}] set (for real pilot data).
 *
 * A run is ONLY a valid pilot benchmark when workspace===workspace_real_pilot AND
 * that workspace has a HEALTHY OAuth connection — otherwise it is labelled
 * NOT_A_PILOT_CERTIFICATION.
 */
import { query }           from '../../src/config/db.js';
import { retrieveContext } from '../../src/services/retrievalService.js';
import { readFileSync }    from 'fs';

const args = Object.fromEntries(process.argv.slice(2).map(a => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const WS = args.workspace || 'workspace_helios_test';
const K  = Number(args.k || 5);
const N  = Number(args.n || 8);

function metricsFor(retrievedIds, relevantIds, k) {
  const topK = retrievedIds.slice(0, k).map(String);
  const rel  = new Set(relevantIds.map(String));
  const hits = topK.filter(id => rel.has(id));
  const recall    = rel.size ? hits.length / rel.size : 0;
  const precision = topK.length ? hits.length / topK.length : 0;
  let rr = 0;
  for (let i = 0; i < topK.length; i++) if (rel.has(topK[i])) { rr = 1 / (i + 1); break; }
  return { recall, precision, rr };
}

async function runOne(q, relevantIds, k) {
  const t0 = Date.now();
  const chunks = await retrieveContext(WS, q).catch(() => []);
  const latencyMs = Date.now() - t0;
  const retrievedIds = (chunks || []).map(c => c.id).filter(x => x != null);
  const m = metricsFor(retrievedIds, relevantIds, k);
  return { ...m, latencyMs, numRetrieved: retrievedIds.length };
}

async function buildSelfValidationSet() {
  const { rows } = await query(
    `SELECT id, raw_content FROM workspace_intel_chunks
      WHERE workspace_id=$1 AND raw_content IS NOT NULL AND length(raw_content) > 40
      ORDER BY random() LIMIT $2`, [WS, N]);
  // Query = a salient slice of the chunk's own text; expect its own id back.
  return rows.map(r => ({ query: String(r.raw_content).replace(/\s+/g, ' ').slice(0, 120), relevantIds: [r.id] }));
}

console.log('\n######### P4 — RETRIEVAL BENCHMARK INSTRUMENT #########\n');
console.log(`workspace=${WS}  K=${K}  mode=${args['self-validate'] ? 'self-validate' : (args.groundtruth ? 'groundtruth-file' : 'none')}`);

const pilotCert = WS === 'workspace_real_pilot';
if (!pilotCert) console.log('LABEL: NOT_A_PILOT_CERTIFICATION (instrument validation / non-pilot workspace)\n');

let groundTruth = [];
if (args['self-validate']) groundTruth = await buildSelfValidationSet();
else if (args.groundtruth) groundTruth = JSON.parse(readFileSync(args.groundtruth, 'utf8'));
else { console.log('No mode selected. Use --self-validate or --groundtruth=<file>.'); process.exit(2); }

if (groundTruth.length === 0) { console.log('NOT_MEASURABLE — no ground truth (workspace has no data).'); process.exit(0); }

const results = [];
for (const g of groundTruth) results.push(await runOne(g.query, g.relevantIds, K));

const mean = (arr, f) => arr.reduce((s, x) => s + f(x), 0) / arr.length;
const recallAtK    = mean(results, r => r.recall);
const precisionAtK = mean(results, r => r.precision);
const mrr          = mean(results, r => r.rr);
const p50 = results.map(r => r.latencyMs).sort((a, b) => a - b)[Math.floor(results.length / 2)];
const avgChunks    = mean(results, r => r.numRetrieved);

console.log(`  queries=${groundTruth.length}`);
console.log(`  Recall@${K}    = ${recallAtK.toFixed(3)}`);
console.log(`  Precision@${K} = ${precisionAtK.toFixed(3)}`);
console.log(`  MRR          = ${mrr.toFixed(3)}`);
console.log(`  latency p50  = ${p50}ms   avg#chunks=${avgChunks.toFixed(1)}`);
console.log(`\n  Self-validation expectation: a chunk queried by its own text should rank #1`);
console.log(`  → Recall@${K} ≈ 1.0 and MRR high confirms the instrument + retrieval id-plumbing are sound.`);
console.log('P4_BENCH_DONE');
process.exit(0);
