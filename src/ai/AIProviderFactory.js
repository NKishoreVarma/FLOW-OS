import { GoogleGenAI } from '@google/genai';
import { OllamaProvider } from './providers/OllamaProvider.js';
import { GeminiProvider } from './providers/GeminiProvider.js';
import { AIConfig } from './AIConfig.js';
import { ProviderName } from './types.js';

/**
 * AIProviderFactory — singleton registry of provider instances.
 *
 * Providers are instantiated once at module load. The factory returns the
 * configured default, fallback, or a named provider on request.
 */

const _providers = new Map();

function _init() {
  const gemini = new GeminiProvider();
  // Inject the SDK so GeminiProvider doesn't need a dynamic import workaround
  gemini.setSDK(GoogleGenAI);

  _providers.set(ProviderName.OLLAMA,  new OllamaProvider());
  _providers.set(ProviderName.GEMINI,  gemini);
}

_init();

/**
 * Returns a provider instance by name.
 * @param {string} name - ProviderName value
 * @returns {OllamaProvider|GeminiProvider}
 */
export function getProvider(name) {
  const p = _providers.get(name?.toLowerCase());
  if (!p) throw new Error(`Unknown AI provider: ${name}`);
  return p;
}

/**
 * Returns the default provider (AI_PROVIDER env var, defaults to ollama).
 */
export function getDefaultProvider() {
  return getProvider(AIConfig.defaultProvider);
}

/**
 * Returns the fallback provider (AI_FALLBACK_PROVIDER env var, defaults to gemini).
 */
export function getFallbackProvider() {
  return getProvider(AIConfig.fallbackProvider);
}

/**
 * Returns all registered providers.
 */
export function getAllProviders() {
  return [..._providers.values()];
}
