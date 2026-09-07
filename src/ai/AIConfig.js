import { ProviderName, TaskType, RoutingStrategy } from './types.js';

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

  // OpenAI / GPT
  openai: Object.freeze({
    apiKey:        process.env.OPENAI_API_KEY || '',
    organization:  process.env.OPENAI_ORG    || '',
    baseUrl:       process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    defaultModel:  process.env.OPENAI_MODEL       || 'gpt-4o',
    lightModel:    process.env.OPENAI_LIGHT_MODEL  || 'gpt-4o-mini',
    heavyModel:    process.env.OPENAI_HEAVY_MODEL  || 'o3-mini',
    embedModel:    process.env.OPENAI_EMBED_MODEL  || 'text-embedding-3-small',
    timeoutMs:     Number(process.env.OPENAI_TIMEOUT_MS) || 60_000,
  }),

  // Anthropic / Claude
  anthropic: Object.freeze({
    apiKey:       process.env.ANTHROPIC_API_KEY || '',
    baseUrl:      process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com',
    defaultModel: process.env.ANTHROPIC_MODEL       || 'claude-sonnet-4-6',
    lightModel:   process.env.ANTHROPIC_LIGHT_MODEL  || 'claude-haiku-4-5-20251001',
    heavyModel:   process.env.ANTHROPIC_HEAVY_MODEL  || 'claude-opus-4-8',
    timeoutMs:    Number(process.env.ANTHROPIC_TIMEOUT_MS) || 90_000,
  }),

  // Global routing strategy (default BALANCED)
  routingStrategy: (process.env.AI_ROUTING_STRATEGY || RoutingStrategy.BALANCED).toLowerCase(),

  // Task type → complexity tier (LIGHT / STANDARD / HEAVY)
  taskTier: Object.freeze({
    [TaskType.CLASSIFY]:         'light',
    [TaskType.SEARCH]:           'light',
    [TaskType.EXTRACT_ENTITIES]: 'light',
    [TaskType.SUMMARIZE]:        'light',
    [TaskType.BRIEF]:            'standard',
    [TaskType.CHAT]:             'standard',
    [TaskType.MEETING_PREP]:     'standard',
    [TaskType.REASON]:           'heavy',
    [TaskType.PLAN]:             'heavy',
    [TaskType.LONG_SYNTHESIS]:   'heavy',
    [TaskType.ARCHITECTURE]:     'heavy',
    [TaskType.EVAL]:             'heavy',
    [TaskType.EMBED]:            'light',
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
