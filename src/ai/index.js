/**
 * FLOW AI Platform — public barrel export.
 *
 * This is the ONLY public API surface for AI operations.
 * No module outside src/ai/ should import from any other file in this directory.
 *
 * Contract:
 *   - AIPlatform.request()     — full 9-layer pipeline
 *   - AIPlatform.streamRequest() — streaming with guardrails + rate limiting
 *   - AIPlatform.ask()         — lightweight Layer-1-only (internal services)
 *   - AIPlatform.embed()       — text embedding
 *   - TaskType, ProviderHint   — type constants for callers
 */

// Primary entry point — 9 layers
export { request, streamRequest, ask, embed, stream } from './AIPlatform.js';

// Type constants callers need to pass task types
export { TaskType, ProviderHint, RoutingStrategy } from './types.js';

// Observability — available to monitoring routes
export { getRecentTraces, getActiveTraces } from './observability/requestTracer.js';

// Metrics — available to /api/ai/metrics
export { getAllStats, getCostTrend } from './health/metricsCollector.js';

// Tool registry — available to routes that expose tool definitions to the UI
export { getAllTools, getToolsForLLM } from './tools/toolRegistry.js';

// Prompt store — available to /api/ai/prompts routes
export { getPrompt, createVersion, activate, deactivate, rollback, listVersions, listPromptNames } from './prompts/promptStore.js';

// Evaluation — available to FVEP and /api/ai/evaluate routes
export { evaluate as evaluateProviders, abTest } from './evaluation/modelEval.js';

// Provider health — available to /api/ai/providers routes
export { getAllProviders } from './AIProviderFactory.js';
export { AIConfig }        from './AIConfig.js';

// Rate limiting — available to usage dashboards
export { getUsage as getRateLimitUsage } from './model/rateLimiter.js';
