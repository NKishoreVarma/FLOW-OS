import { ProviderName, TaskType } from './types.js';

/**
 * Centralised AI configuration. Read once at import time from process.env.
 * All AI-layer modules import from here — never from process.env directly.
 */

export const AIConfig = Object.freeze({
  // Primary and fallback providers
  defaultProvider:  (process.env.AI_PROVIDER  || ProviderName.OLLAMA).toLowerCase(),
  fallbackProvider: (process.env.AI_FALLBACK_PROVIDER || ProviderName.GEMINI).toLowerCase(),

  // Ollama
  ollama: Object.freeze({
    baseUrl:     process.env.OLLAMA_URL   || 'http://localhost:11434',
    defaultModel: process.env.OLLAMA_MODEL || 'qwen-64k:latest',
    coderModel:  process.env.OLLAMA_CODER_MODEL || 'qwen2.5-coder:7b',
    embedModel:  process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text',
    timeoutMs:   Number(process.env.OLLAMA_TIMEOUT_MS) || 60_000,
  }),

  // Gemini
  gemini: Object.freeze({
    apiKey:      process.env.GEMINI_API_KEY || '',
    embedBaseUrl: process.env.GEMINI_EMBED_BASE_URL || '',
    chatModel:   process.env.GEMINI_CHAT_MODEL    || 'gemini-2.5-flash',
    embedModel:  process.env.GEMINI_EMBED_MODEL   || 'gemini-embedding-2',
    embedDim:    Number(process.env.GEMINI_EMBED_DIM) || 768,
    timeoutMs:   Number(process.env.GEMINI_TIMEOUT_MS) || 30_000,
  }),

  // Task → preferred provider routing table.
  // Overridable via FLOW_TASK_ROUTING env var (JSON object).
  taskRouting: Object.freeze(
    (() => {
      const defaults = {
        [TaskType.CHAT]:             ProviderName.OLLAMA,
        [TaskType.SUMMARIZE]:        ProviderName.OLLAMA,
        [TaskType.CLASSIFY]:         ProviderName.OLLAMA,
        [TaskType.EXTRACT_ENTITIES]: ProviderName.OLLAMA,
        [TaskType.BRIEF]:            ProviderName.OLLAMA,
        [TaskType.SEARCH]:           ProviderName.OLLAMA,
        [TaskType.MEETING_PREP]:     ProviderName.OLLAMA,
        [TaskType.REASON]:           ProviderName.GEMINI,
        [TaskType.PLAN]:             ProviderName.GEMINI,
        [TaskType.LONG_SYNTHESIS]:   ProviderName.GEMINI,
        [TaskType.ARCHITECTURE]:     ProviderName.GEMINI,
        [TaskType.EVAL]:             ProviderName.GEMINI,
        [TaskType.EMBED]:            ProviderName.GEMINI,
      };
      try {
        const override = process.env.FLOW_TASK_ROUTING
          ? JSON.parse(process.env.FLOW_TASK_ROUTING)
          : {};
        return { ...defaults, ...override };
      } catch {
        return defaults;
      }
    })()
  ),
});
