import { GoogleGenAI } from '@google/genai';
import { OllamaProvider }    from './providers/OllamaProvider.js';
import { GeminiProvider }    from './providers/GeminiProvider.js';
import { OpenAIProvider }    from './providers/OpenAIProvider.js';
import { AnthropicProvider } from './providers/AnthropicProvider.js';
import { AIConfig } from './AIConfig.js';
import { ProviderName, RoutingStrategy } from './types.js';

/**
 * AIProviderFactory — singleton registry of all provider instances.
 *
 * Providers are instantiated once at module load. No provider-specific code
 * should appear outside src/ai/. The Brain never knows which provider answers.
 */

const _providers = new Map();

function _init() {
  const gemini = new GeminiProvider();
  gemini.setSDK(GoogleGenAI);

  _providers.set(ProviderName.OLLAMA,     new OllamaProvider());
  _providers.set(ProviderName.GEMINI,     gemini);
  _providers.set(ProviderName.OPENAI,     new OpenAIProvider());
  _providers.set(ProviderName.ANTHROPIC,  new AnthropicProvider());
}

_init();

export function getProvider(name) {
  const p = _providers.get(name?.toLowerCase());
  if (!p) throw new Error(`Unknown AI provider: ${name}`);
  return p;
}

export function getDefaultProvider() {
  return getProvider(AIConfig.defaultProvider);
}

export function getFallbackProvider() {
  return getProvider(AIConfig.fallbackProvider);
}

export function getAllProviders() {
  return [..._providers.values()];
}

/**
 * Returns the ordered fallback chain for a given primary provider.
 * Primary is first; remaining providers are ordered by expected reliability.
 */
export function getFallbackChain(primaryName) {
  const order = [
    primaryName,
    ProviderName.GEMINI,
    ProviderName.OPENAI,
    ProviderName.ANTHROPIC,
    ProviderName.OLLAMA,
  ];
  const seen = new Set();
  return order
    .filter(n => { if (seen.has(n)) return false; seen.add(n); return _providers.has(n); })
    .map(n => _providers.get(n));
}

/**
 * Selects the best provider for a task based on the routing strategy.
 * Returns the provider instance to use.
 */
export function selectProvider(taskType, { strategy, workspaceProvider } = {}) {
  const s = strategy ?? AIConfig.routingStrategy;

  // Workspace-configured preference takes precedence for WORKSPACE strategy
  if (s === RoutingStrategy.WORKSPACE && workspaceProvider) {
    try { return getProvider(workspaceProvider); } catch {}
  }

  // Tier-based routing: task type → tier → provider
  const tier = AIConfig.taskTier[taskType] ?? 'standard';

  if (s === RoutingStrategy.COST) {
    // Cheapest: local Ollama for light, Gemini Flash for standard, Haiku for heavy
    return tier === 'light'    ? _providers.get(ProviderName.OLLAMA)
         : tier === 'standard' ? _providers.get(ProviderName.GEMINI)
         :                       _providers.get(ProviderName.ANTHROPIC) ?? _providers.get(ProviderName.GEMINI);
  }

  if (s === RoutingStrategy.SPEED) {
    // Fastest: local Ollama first for all tiers
    return _providers.get(ProviderName.OLLAMA);
  }

  if (s === RoutingStrategy.QUALITY) {
    // Highest capability: Anthropic Opus for heavy, Gemini for standard, local for light
    return tier === 'heavy'    ? _providers.get(ProviderName.ANTHROPIC) ?? _providers.get(ProviderName.OPENAI)
         : tier === 'standard' ? _providers.get(ProviderName.GEMINI) ?? _providers.get(ProviderName.OPENAI)
         :                       _providers.get(ProviderName.GEMINI);
  }

  // BALANCED (default): follows the existing task routing table
  const providerName = AIConfig.taskRouting[taskType] ?? AIConfig.defaultProvider;
  return _providers.get(providerName) ?? getDefaultProvider();
}
