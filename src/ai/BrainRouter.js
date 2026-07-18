import { AIConfig } from './AIConfig.js';
import { getProvider, getFallbackProvider } from './AIProviderFactory.js';
import { TaskType, ProviderHint } from './types.js';

/**
 * BrainRouter — routes AI requests to the correct provider.
 *
 * The Operational Brain calls this layer. The caller specifies a taskType.
 * BrainRouter selects the provider, invokes the method, and handles fallback
 * if the primary provider fails or is unavailable.
 *
 * Rules:
 * - The LLM is NOT the brain — FLOW is. The provider only supplies reasoning.
 * - No caller outside src/ai/ should import from @google/genai or reference Ollama.
 * - On primary failure, BrainRouter silently retries with the fallback provider.
 */

/**
 * Execute a non-streaming AI request.
 * @param {import('./types.js').AIRequest} request
 * @returns {Promise<import('./types.js').AIResponse>}
 */
export async function ask(request) {
  const { taskType = TaskType.CHAT, providerHint } = request;
  const primaryName  = _resolveProviderName(taskType, providerHint);
  const primary      = getProvider(primaryName);

  try {
    return await _dispatch(primary, request);
  } catch (primaryErr) {
    const fallback = getFallbackProvider();
    if (fallback.name === primary.name) throw primaryErr;
    try {
      const result = await _dispatch(fallback, request);
      return { ...result, usedFallback: true, primaryError: primaryErr.message };
    } catch (fallbackErr) {
      throw new Error(
        `All AI providers failed. Primary (${primary.name}): ${primaryErr.message}. ` +
        `Fallback (${fallback.name}): ${fallbackErr.message}`
      );
    }
  }
}

/**
 * Execute a streaming AI request.
 * Yields string deltas. Falls back to non-streaming on the fallback provider
 * if streaming from the primary fails.
 * @param {import('./types.js').AIRequest} request
 * @returns {AsyncGenerator<string>}
 */
export async function *stream(request) {
  const { taskType = TaskType.CHAT, providerHint } = request;
  const primaryName = _resolveProviderName(taskType, providerHint);
  const primary     = getProvider(primaryName);

  try {
    yield* primary.stream({ ...request, stream: true });
  } catch (primaryErr) {
    const fallback = getFallbackProvider();
    if (fallback.name === primary.name) throw primaryErr;
    // Fallback: collect full response and yield as single chunk
    const result = await fallback.chat(request);
    yield result.text;
  }
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
  return ask({
    taskType: TaskType.SUMMARIZE,
    prompt:   text,
    maxTokens: 512,
    ...options,
  });
}

export async function classify(text, options = {}) {
  return ask({
    taskType: TaskType.CLASSIFY,
    prompt:   text,
    maxTokens: 128,
    temperature: 0.1,
    ...options,
  });
}

export async function reason(prompt, options = {}) {
  return ask({
    taskType: TaskType.REASON,
    prompt,
    providerHint: ProviderHint.CAPABLE,
    ...options,
  });
}

export async function extractEntities(text, options = {}) {
  return ask({
    taskType: TaskType.EXTRACT_ENTITIES,
    prompt:   text,
    maxTokens: 256,
    temperature: 0.1,
    ...options,
  });
}

// ── Internal helpers ─────────────────────────────────────────────────────────

function _resolveProviderName(taskType, hint) {
  // Explicit hint overrides routing table
  if (hint === ProviderHint.LOCAL)   return AIConfig.defaultProvider === 'ollama' ? 'ollama' : AIConfig.defaultProvider;
  if (hint === ProviderHint.REMOTE)  return AIConfig.fallbackProvider;
  if (hint === ProviderHint.CAPABLE) return AIConfig.fallbackProvider;

  return AIConfig.taskRouting[taskType] ?? AIConfig.defaultProvider;
}

function _dispatch(provider, request) {
  const { taskType } = request;
  switch (taskType) {
    case TaskType.SUMMARIZE:        return provider.summarize(request);
    case TaskType.CLASSIFY:         return provider.classify(request);
    case TaskType.REASON:
    case TaskType.PLAN:
    case TaskType.ARCHITECTURE:
    case TaskType.LONG_SYNTHESIS:
    case TaskType.EVAL:             return provider.reason(request);
    case TaskType.EXTRACT_ENTITIES: return provider.extractEntities(request);
    default:                        return provider.chat(request);
  }
}
