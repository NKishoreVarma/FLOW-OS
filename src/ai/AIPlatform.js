/**
 * AIPlatform — the single, unified entry point for all AI operations in FLOW.
 *
 * PERMANENT CONTRACT:
 *   No component outside src/ai/ may call an LLM provider directly.
 *   Every AI request must pass through AIPlatform.request().
 *
 * Nine layers, in execution order:
 *
 *   6. Guardrails    (input)  — PII, injection, workspace policy
 *   4. Model         (rate)   — per-workspace rate limiting before any I/O
 *   7. Memory        (load)   — conversation history + org memory
 *   2. Context       (assem)  — RAG + KG + workspace state assembly
 *   3. Prompt        (render) — template rendering with assembled context
 *   1. Reasoning     (route)  — provider selection, caching, fallback
 *   4. Model         (exec)   — provider inference
 *   6. Guardrails    (output) — output validation, PII echo check
 *   7. Memory        (store)  — persist response to conversation memory
 *   8. Tools         (exec)   — tool-call resolution if the model used tools
 *   9. Observability          — complete trace, record metrics
 *
 * Backward compatibility:
 *   AIPlatform.ask() is a lightweight pass-through to BrainRouter.ask()
 *   for internal services that do not need the full pipeline.
 */

import { ask as routerAsk, embed as routerEmbed, stream as routerStream } from './BrainRouter.js';
import { checkInput, checkOutput }      from './guardrails/guardrailsEngine.js';
import { assembleContext }              from './ContextAssembler.js';
import { checkAndIncrement }            from './model/rateLimiter.js';
import { startTrace }                   from './observability/requestTracer.js';
import { getToolsForLLM, hasTool }      from './tools/toolRegistry.js';
import { executeTools }                 from './tools/toolExecutor.js';
import { AIConfig }                     from './AIConfig.js';
import { TaskType }                     from './types.js';

// ── Lazy conversation memory import (avoids circular deps with Redis init) ────
async function _remember(workspaceId, turn) {
  try {
    const { remember } = await import('./conversation/ConversationMemory.js');
    await remember(workspaceId, turn);
  } catch {}
}

async function _recall(workspaceId, count = 5) {
  try {
    const { recall } = await import('./conversation/ConversationMemory.js');
    return await recall(workspaceId, count);
  } catch { return []; }
}

// ── Platform configuration ─────────────────────────────────────────────────────
const PLATFORM_DEFAULTS = {
  maxContextTokens: Number(process.env.AI_MAX_CONTEXT_TOKENS ?? 80_000),
  maxResponseTokens: Number(process.env.AI_MAX_RESPONSE_TOKENS ?? 4_096),
};

/**
 * Full 9-layer AI Platform request.
 *
 * @param {PlatformRequest} req
 * @returns {Promise<PlatformResponse>}
 *
 * @typedef {Object} PlatformRequest
 * @property {string}   taskType          - One of TaskType values
 * @property {string}   [prompt]          - Single-turn text input
 * @property {Array}    [messages]        - Multi-turn messages
 * @property {string}   [workspaceId]     - Required for context + guardrails
 * @property {string}   [conversationId]  - For memory continuity
 * @property {string}   [entityId]        - KG entity to expand context from
 * @property {string}   [pageContext]     - Current UI page (helps context)
 * @property {string}   [userId]          - For rate limiting + audit
 * @property {string}   [userRole]        - OWNER | ADMIN | MEMBER
 * @property {string}   [providerHint]    - Override routing
 * @property {number}   [maxTokens]       - Response token budget
 * @property {number}   [temperature]     - 0–1
 * @property {boolean}  [stream]          - Stream response
 * @property {string[]} [tools]           - Tool names to make available
 * @property {boolean}  [skipGuardrails]  - Trust internal callers
 * @property {boolean}  [skipContext]     - Pre-assembled context provided
 * @property {boolean}  [skipMemory]      - One-shot; do not load/store memory
 *
 * @typedef {Object} PlatformResponse
 * @property {string}   text
 * @property {string}   provider
 * @property {string}   model
 * @property {number}   latencyMs
 * @property {string}   traceId
 * @property {boolean}  [cacheHit]
 * @property {boolean}  [usedFallback]
 * @property {Object}   [usage]
 * @property {Array}    [toolResults]
 * @property {string[]} [guardrailIssues]
 */
export async function request(req = {}) {
  const trace = startTrace({
    workspaceId: req.workspaceId,
    taskType:    req.taskType ?? TaskType.CHAT,
    userId:      req.userId,
  });

  try {
    const workspaceId = req.workspaceId;
    const taskType    = req.taskType ?? TaskType.CHAT;

    // ── Layer 6: Input guardrails ─────────────────────────────────────────────
    trace.layerStart('guardrails_input');
    if (!req.skipGuardrails) {
      const guard = await checkInput(req);
      trace.layerEnd('guardrails_input', { issues: guard.issues });
      if (guard.blocked) {
        trace.addGuardrailIssue('input', guard.issues);
        trace.complete({ status: 'blocked', blockedBy: guard.reason });
        return _blockedResponse(guard, trace.traceId);
      }
      if (guard.issues.length > 0) {
        trace.addGuardrailIssue('input', guard.issues);
      }
    } else {
      trace.layerEnd('guardrails_input', { skipped: true });
    }

    // ── Layer 4: Rate limiting ─────────────────────────────────────────────────
    trace.layerStart('rate_limiter');
    if (workspaceId) {
      const tier     = AIConfig.taskTier[taskType] ?? 'standard';
      const provider = AIConfig.taskRouting[taskType] ?? AIConfig.defaultProvider;
      const rl = await checkAndIncrement(workspaceId, provider, tier);
      trace.layerEnd('rate_limiter', { allowed: rl.allowed, remaining: rl.remaining });
      if (!rl.allowed) {
        trace.complete({ status: 'blocked', blockedBy: 'rate_limit' });
        return _errorResponse('Rate limit exceeded. Please try again shortly.', trace.traceId);
      }
    } else {
      trace.layerEnd('rate_limiter', { skipped: true });
    }

    // ── Layer 7: Load memory ───────────────────────────────────────────────────
    trace.layerStart('memory_load');
    let memory = [];
    if (!req.skipMemory && workspaceId) {
      memory = await _recall(workspaceId, 5);
      trace.addMemoryOp('load', { count: memory.length });
    }
    trace.layerEnd('memory_load', { turns: memory.length });

    // ── Layer 2: Context assembly ─────────────────────────────────────────────
    trace.layerStart('context');
    let context = req.context ?? {};
    if (!req.skipContext && workspaceId) {
      const query = _extractUserText(req);
      if (query) {
        context = await assembleContext({
          workspaceId,
          query,
          entityId:      req.entityId,
          includeHealth: true,
          includeMemory: true,
          maxChunks:     8,
        });
      }
    }
    trace.layerEnd('context', { chunks: context.rawChunks?.length ?? 0 });

    // ── Layer 3: Prompt building ──────────────────────────────────────────────
    trace.layerStart('prompt');
    const enrichedMessages = _buildMessages(req, context, memory);
    trace.layerEnd('prompt', { messageCount: enrichedMessages.length });

    // ── Layer 8: Attach tools (if requested) ──────────────────────────────────
    const toolSpec = req.tools?.length
      ? getToolsForLLM().filter(t => req.tools.includes(t.name))
      : [];

    // ── Layers 1 + 4: Route and execute ──────────────────────────────────────
    trace.layerStart('model');
    const routerReq = {
      taskType,
      messages:        enrichedMessages,
      maxTokens:       req.maxTokens    ?? PLATFORM_DEFAULTS.maxResponseTokens,
      temperature:     req.temperature  ?? 0.3,
      providerHint:    req.providerHint,
      workspaceId,
      workspaceProvider: req.workspaceProvider,
      ...(toolSpec.length > 0 ? { tools: toolSpec } : {}),
    };

    const llmResponse = await routerAsk(routerReq);
    trace.layerEnd('model', {
      provider: llmResponse.provider, model: llmResponse.model,
      latencyMs: llmResponse.latencyMs, cacheHit: llmResponse.cached,
    });

    // ── Layer 8: Execute tool calls (if model used them) ──────────────────────
    let toolResults = [];
    if (llmResponse.toolCalls?.length) {
      trace.layerStart('tools');
      toolResults = await executeTools(llmResponse.toolCalls, {
        workspaceId, actorId: req.userId, workspaceRole: req.userRole,
      });
      for (const tr of toolResults) {
        trace.addToolCall(tr.toolName, tr.durationMs ?? 0, !tr.error);
      }
      trace.layerEnd('tools', { count: toolResults.length });
    }

    // ── Layer 6: Output guardrails ────────────────────────────────────────────
    trace.layerStart('guardrails_output');
    let finalText = llmResponse.text;
    const outputGuard = !req.skipGuardrails
      ? checkOutput(finalText, req)
      : { pass: true, text: finalText, issues: [] };

    trace.layerEnd('guardrails_output', { issues: outputGuard.issues, severity: outputGuard.severity });
    if (outputGuard.issues.length > 0) trace.addGuardrailIssue('output', outputGuard.issues);
    finalText = outputGuard.text;

    // ── Layer 7: Store memory ─────────────────────────────────────────────────
    trace.layerStart('memory_store');
    if (!req.skipMemory && workspaceId) {
      await _remember(workspaceId, {
        query:   _extractUserText(req),
        answer:  finalText,
        intent:  taskType,
        topic:   req.pageContext ?? null,
        entities: {},
      });
      trace.addMemoryOp('store');
    }
    trace.layerEnd('memory_store');

    // ── Layer 9: Complete trace ───────────────────────────────────────────────
    trace.complete({
      provider:     llmResponse.provider,
      model:        llmResponse.model,
      inputTokens:  llmResponse.usage?.promptTokens,
      outputTokens: llmResponse.usage?.completionTokens,
      costUsd:      llmResponse.costUsd,
      cacheHit:     llmResponse.cached ?? false,
      usedFallback: llmResponse.usedFallback ?? false,
      status:       'success',
    });

    const guardrailIssues = [
      ...trace.guardrailIssues.filter(g => g.phase === 'input').flatMap(g => g.issues),
      ...trace.guardrailIssues.filter(g => g.phase === 'output').flatMap(g => g.issues),
    ];

    return {
      text:          finalText,
      provider:      llmResponse.provider,
      model:         llmResponse.model,
      latencyMs:     llmResponse.latencyMs,
      traceId:       trace.traceId,
      cached:        llmResponse.cached ?? false,
      usedFallback:  llmResponse.usedFallback ?? false,
      usage:         llmResponse.usage,
      toolResults:   toolResults.length > 0 ? toolResults : undefined,
      guardrailIssues: guardrailIssues.length > 0 ? guardrailIssues : undefined,
    };

  } catch (err) {
    trace.complete({ status: 'error', error: err.message });
    throw err;
  }
}

/**
 * Streaming variant — yields text deltas.
 * Runs input guardrails + rate limiting, then streams through BrainRouter.
 * Does NOT run output guardrails (client assembles the stream).
 */
export async function* streamRequest(req = {}) {
  // Layer 6 + 4 checks
  if (!req.skipGuardrails) {
    const guard = await checkInput(req);
    if (guard.blocked) { yield guard.response ?? 'Request blocked.'; return; }
  }

  if (req.workspaceId) {
    const tier     = AIConfig.taskTier[req.taskType ?? TaskType.CHAT] ?? 'standard';
    const provider = AIConfig.taskRouting[req.taskType ?? TaskType.CHAT] ?? AIConfig.defaultProvider;
    const rl = await checkAndIncrement(req.workspaceId, provider, tier);
    if (!rl.allowed) { yield 'Rate limit exceeded.'; return; }
  }

  // Memory load
  const memory = req.skipMemory ? [] : await _recall(req.workspaceId, 5);

  // Context
  let context = req.context ?? {};
  if (!req.skipContext && req.workspaceId) {
    const query = _extractUserText(req);
    if (query) context = await assembleContext({ workspaceId: req.workspaceId, query, maxChunks: 6 });
  }

  const messages = _buildMessages(req, context, memory);
  yield* routerStream({ ...req, messages });
}

/**
 * Lightweight pass-through for internal services that do not need the full pipeline.
 * Maintains the Layer 1 + 4 contract (provider abstraction + metrics) without
 * running guardrails, context assembly, or memory.
 */
export { routerAsk as ask, routerEmbed as embed, routerStream as stream };

// ── Private helpers ────────────────────────────────────────────────────────────

function _extractUserText(req) {
  if (req.prompt) return req.prompt;
  const userMsg = [...(req.messages ?? [])].reverse().find(m => m.role === 'user');
  return userMsg?.content ?? '';
}

function _buildMessages(req, context, memory = []) {
  const base = req.messages ? [...req.messages] : [{ role: 'user', content: req.prompt ?? '' }];

  if (!context || Object.keys(context).length === 0) return base;

  // Inject context as a system preamble before the first user message
  const contextBlock = _serializeContext(context, memory);
  if (!contextBlock) return base;

  const hasSystem = base[0]?.role === 'system';
  if (hasSystem) {
    return [{ role: 'system', content: base[0].content + '\n\n' + contextBlock }, ...base.slice(1)];
  }
  return [{ role: 'system', content: contextBlock }, ...base];
}

function _serializeContext(ctx, memory = []) {
  const parts = [];
  if (ctx.health)    parts.push(`**Workspace Health:**\n${ctx.health}`);
  if (ctx.memory)    parts.push(`**Recent Memory:**\n${ctx.memory}`);
  if (ctx.knowledge) parts.push(`**Retrieved Knowledge:**\n${ctx.knowledge}`);
  if (ctx.connectors) parts.push(`**Live Data:**\n${ctx.connectors}`);
  if (memory.length > 0) {
    const hist = memory.map(t => `User: ${t.query}\nFLOW: ${t.answer?.slice(0, 200)}`).join('\n---\n');
    parts.push(`**Conversation History:**\n${hist}`);
  }
  return parts.join('\n\n---\n\n');
}

function _blockedResponse(guard, traceId) {
  return {
    text:      guard.response ?? 'Request blocked by safety guardrails.',
    provider:  'guardrails',
    model:     'guardrails',
    latencyMs: 0,
    traceId,
    blocked:   true,
    blockedBy: guard.reason,
    guardrailIssues: guard.issues,
  };
}

function _errorResponse(message, traceId) {
  return {
    text:      message,
    provider:  'platform',
    model:     'platform',
    latencyMs: 0,
    traceId,
    error:     true,
  };
}
