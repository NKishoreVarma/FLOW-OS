/**
 * Model Evaluator — run the same request through multiple providers and compare.
 *
 * Used by the FVEP AI Quality domain and by the /api/ai/evaluate endpoint.
 * Returns per-provider responses with latency, cost, and a consensus score.
 */
import { getAllProviders } from '../AIProviderFactory.js';
import { record } from '../health/metricsCollector.js';

const EVAL_TIMEOUT_MS = Number(process.env.AI_EVAL_TIMEOUT_MS ?? 60_000);

/**
 * Run the same request through all configured (non-Ollama) providers and compare.
 * @param {Object} request  - Standard AIRequest
 * @param {string[]} [providers] - Which provider names to include (default: all)
 */
export async function evaluate(request, { providers: providerNames, workspaceId } = {}) {
  const all      = getAllProviders();
  const selected = providerNames
    ? all.filter(p => providerNames.includes(p.name))
    : all.filter(p => p.name !== 'ollama'); // skip local by default for eval

  if (selected.length === 0) throw new Error('No providers available for evaluation');

  const results = await Promise.allSettled(
    selected.map(async (provider) => {
      const t0 = Date.now();
      try {
        const res = await Promise.race([
          provider.chat(request),
          new Promise((_, rej) => setTimeout(() => rej(new Error('Eval timeout')), EVAL_TIMEOUT_MS)),
        ]);
        record({ provider: provider.name, model: res.model, taskType: request.taskType,
          workspaceId, latencyMs: res.latencyMs, inputTokens: res.usage?.promptTokens,
          outputTokens: res.usage?.completionTokens, costUsd: res.costUsd, status: 'success' });
        return { provider: provider.name, model: res.model, status: 'success',
          text: res.text, latencyMs: res.latencyMs, costUsd: res.costUsd ?? null,
          inputTokens: res.usage?.promptTokens ?? null, outputTokens: res.usage?.completionTokens ?? null };
      } catch (err) {
        record({ provider: provider.name, model: '?', taskType: request.taskType, workspaceId, latencyMs: Date.now() - t0, status: 'error' });
        return { provider: provider.name, status: 'error', error: err.message, latencyMs: Date.now() - t0 };
      }
    })
  );

  const responses = results.map(r => r.status === 'fulfilled' ? r.value : { provider: 'unknown', status: 'error', error: r.reason?.message });
  const successful = responses.filter(r => r.status === 'success');

  return {
    responses,
    summary: {
      providersQueried:    selected.length,
      providersSucceeded:  successful.length,
      fastestProvider:     successful.sort((a, b) => a.latencyMs - b.latencyMs)[0]?.provider ?? null,
      cheapestProvider:    successful.filter(r => r.costUsd !== null).sort((a, b) => a.costUsd - b.costUsd)[0]?.provider ?? null,
      avgLatencyMs:        successful.length > 0 ? Math.round(successful.reduce((s, r) => s + r.latencyMs, 0) / successful.length) : null,
      agreement:           _measureAgreement(successful.map(r => r.text)),
    },
  };
}

/**
 * Quick A/B test: run the same prompt through two prompt versions and compare.
 */
export async function abTest(promptA, promptB, { provider, taskType = 'eval', workspaceId, runs = 3 } = {}) {
  const all      = getAllProviders();
  const p        = provider ? all.find(pr => pr.name === provider) : all.find(pr => pr.name !== 'ollama');
  if (!p) throw new Error('No provider available for A/B test');

  async function runVersion(content, label) {
    const results = [];
    for (let i = 0; i < runs; i++) {
      const t0 = Date.now();
      const res = await p.chat({ taskType, messages: [{ role: 'user', content }] });
      results.push({ text: res.text, latencyMs: Date.now() - t0, costUsd: res.costUsd ?? null });
    }
    const avgLatency = Math.round(results.reduce((s, r) => s + r.latencyMs, 0) / results.length);
    return { label, provider: p.name, runs: results, avgLatencyMs: avgLatency };
  }

  const [a, b] = await Promise.all([runVersion(promptA, 'A'), runVersion(promptB, 'B')]);
  return { a, b, fasterVersion: a.avgLatencyMs <= b.avgLatencyMs ? 'A' : 'B' };
}

// ── Agreement metric ──────────────────────────────────────────────────────────
// Simple token-overlap measure — not semantic similarity, but a useful proxy.
function _measureAgreement(texts) {
  if (texts.length < 2) return null;
  let totalOverlap = 0;
  let pairs        = 0;
  for (let i = 0; i < texts.length; i++) {
    for (let j = i + 1; j < texts.length; j++) {
      totalOverlap += _jaccardSimilarity(texts[i], texts[j]);
      pairs++;
    }
  }
  return pairs > 0 ? +(totalOverlap / pairs * 100).toFixed(1) : null;
}

function _jaccardSimilarity(a, b) {
  const setA = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  const setB = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  const inter = [...setA].filter(w => setB.has(w)).length;
  const union = new Set([...setA, ...setB]).size;
  return union > 0 ? inter / union : 0;
}
