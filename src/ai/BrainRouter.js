import { AIConfig } from './AIConfig.js';
import { getProvider, getFallbackProvider, getFallbackChain, selectProvider } from './AIProviderFactory.js';
import { TaskType, ProviderHint, RoutingStrategy } from './types.js';
import { isCacheable, get as cacheGet, set as cacheSet } from './cache/responseCache.js';
import { record } from './health/metricsCollector.js';

/**
 * BrainRouter — routes AI requests to the correct provider.
 *
 * The Operational Brain calls this layer. The caller specifies a taskType.
 * BrainRouter selects the provider, invokes the method, handles fallback,
 * checks the response cache, and records metrics.
 *
 * Rules:
 * - The LLM is NOT the brain — FLOW is. The provider only supplies reasoning.
 * - No caller outside src/ai/ should import from @google/genai or reference Ollama.
 * - On primary failure, BrainRouter walks the fallback chain until one succeeds.
 * - Deterministic tasks (classify, extract_entities, brief at temp≤0.1) are cached.
 */

/**
 * Execute a non-streaming AI request.
 * @param {import('./types.js').AIRequest} request
 * @returns {Promise<import('./types.js').AIResponse>}
 */
export async function ask(request) {
  const { taskType = TaskType.CHAT, providerHint, workspaceId, temperature } = request;

  // ── 1. Check cache for deterministic tasks ────────────────────────────────
  if (isCacheable(taskType, temperature)) {
    const content = request.messages ?? request.prompt ?? '';
    const hit     = await cacheGet(workspaceId ?? 'global', taskType, content);
    if (hit) {
      record({ provider: hit.provider, model: hit.model, taskType, workspaceId, latencyMs: 0, status: 'success', cached: true });
      return hit;
    }
  }

  // ── 2. Select primary provider ────────────────────────────────────────────
  const primary = _pickProvider(taskType, providerHint, request.workspaceProvider);

  // ── 3. Try primary + fallback chain ───────────────────────────────────────
  const chain       = getFallbackChain(primary.name);
  let lastError     = null;
  let fallbackFrom  = null;

  for (const provider of chain) {
    const t0 = Date.now();
    try {
      const result = await _dispatch(provider, request);
      const latencyMs = Date.now() - t0;

      record({ provider: provider.name, model: result.model, taskType, workspaceId,
        latencyMs, inputTokens: result.usage?.promptTokens,
        outputTokens: result.usage?.completionTokens, costUsd: result.costUsd,
        status: 'success', fallbackFrom });

      // Cache if deterministic
      if (isCacheable(taskType, temperature)) {
        const content = request.messages ?? request.prompt ?? '';
        cacheSet(workspaceId ?? 'global', taskType, content, result, { provider: provider.name }).catch(() => {});
      }

      return fallbackFrom
        ? { ...result, latencyMs, usedFallback: true, fallbackFrom }
        : { ...result, latencyMs };

    } catch (err) {
      record({ provider: provider.name, model: '?', taskType, workspaceId,
        latencyMs: Date.now() - t0, status: 'error' });
      lastError   = err;
      fallbackFrom = provider.name;
      // continue to next in chain
    }
  }

  throw new Error(`All AI providers failed for task "${taskType}". Last error: ${lastError?.message}`);
}

/**
 * Execute a streaming AI request.
 * Yields string deltas. Falls back to non-streaming on the fallback provider.
 * @param {import('./types.js').AIRequest} request
 * @returns {AsyncGenerator<string>}
 */
export async function *stream(request) {
  const { taskType = TaskType.CHAT, providerHint, workspaceId } = request;
  const primary = _pickProvider(taskType, providerHint, request.workspaceProvider);

  // Walk the full fallback chain (same as ask()), not just one fallback provider.
  // A provider that fails BEFORE yielding any token is skipped; once tokens have
  // been streamed we never switch mid-answer (would garble the output).
  const chain = getFallbackChain(primary.name);
  let lastError = null;

  for (const provider of chain) {
    let streamed = false;
    try {
      if (typeof provider.stream === 'function') {
        for await (const delta of provider.stream({ ...request, stream: true })) {
          streamed = true;
          yield delta;
        }
      } else {
        // Provider has no streaming — deliver its full answer as one chunk.
        const result = await provider.chat(request);
        streamed = true;
        yield result.text;
      }
      record({ provider: provider.name, model: '?', taskType, workspaceId, status: 'success',
        fallbackFrom: provider.name === primary.name ? undefined : primary.name });
      return;
    } catch (err) {
      record({ provider: provider.name, model: '?', taskType, workspaceId, status: 'error' });
      lastError = err;
      if (streamed) throw err; // partial output already sent — do not retry another provider
      // otherwise fall through to the next provider in the chain
    }
  }

  throw lastError || new Error(`All AI providers failed for streaming task "${taskType}".`);
}

/**
 * Embed text — always routes to the configured embed provider (Gemini by default
 * because we have a pre-existing 768-dim pgvector store calibrated to Gemini
 * embeddings; switching would require a full re-index).
 * @param {string} text
 * @returns {Promise<import('./types.js').EmbedResponse>}
 */
export async function embed(text) {
  const providerName = AIConfig.taskRouting[TaskType.EMBED];
  const primary      = getProvider(providerName);

  try {
    return await primary.embed(text);
  } catch (primaryErr) {
    const fallback = getFallbackProvider();
    if (fallback.name === primary.name) throw primaryErr;
    return fallback.embed(text);
  }
}

// ── Convenience wrappers used directly by brain services ─────────────────────

export async function summarize(text, options = {}) {
  return ask({ taskType: TaskType.SUMMARIZE, prompt: text, maxTokens: 512, ...options });
}

export async function classify(text, options = {}) {
  return ask({ taskType: TaskType.CLASSIFY, prompt: text, maxTokens: 128, temperature: 0.1, ...options });
}

export async function reason(prompt, options = {}) {
  return ask({ taskType: TaskType.REASON, prompt, providerHint: ProviderHint.CAPABLE, ...options });
}

export async function extractEntities(text, options = {}) {
  return ask({ taskType: TaskType.EXTRACT_ENTITIES, prompt: text, maxTokens: 256, temperature: 0.1, ...options });
}

// ── Internal helpers ─────────────────────────────────────────────────────────

function _pickProvider(taskType, hint, workspaceProvider) {
  // Explicit hint overrides strategy
  if (hint === ProviderHint.LOCAL)   return getProvider(AIConfig.defaultProvider);
  if (hint === ProviderHint.REMOTE || hint === ProviderHint.CAPABLE)
    return getFallbackProvider();

  // Use routing strategy for all other cases
  return selectProvider(taskType, {
    strategy:          AIConfig.routingStrategy,
    workspaceProvider,
  });
}

function _dispatch(provider, request) {
  const { taskType } = request;
  switch (taskType) {
    case TaskType.SUMMARIZE:        return provider.summarize?.(request) ?? provider.chat(request);
    case TaskType.CLASSIFY:         return provider.classify?.(request)  ?? provider.chat(request);
    case TaskType.REASON:
    case TaskType.PLAN:
    case TaskType.ARCHITECTURE:
    case TaskType.LONG_SYNTHESIS:
    case TaskType.EVAL:             return provider.reason?.(request)    ?? provider.chat(request);
    case TaskType.EXTRACT_ENTITIES: return provider.extractEntities?.(request) ?? provider.chat(request);
    default:                        return provider.chat(request);
  }
}
