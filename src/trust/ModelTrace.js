/**
 * ModelTrace — Trust Center
 *
 * Exposes the complete AI request trace for any FLOW reasoning output:
 * provider, model, prompt version, latency, token counts, cost estimate,
 * fallback chain, and cache status.
 *
 * Reads from:
 *   audit_logs (action=ai_call entries)
 *   briefings, briefing_recommendations
 *   copilot_conversations, copilot_messages
 *   execution_records
 *
 * Token cost is estimated from public model pricing; no external API calls.
 */

import { query } from '../config/db.js';

// Pricing estimates (USD per 1M tokens) — update as providers change rates
const MODEL_PRICING = {
  'gemini-2.5-flash':          { input: 0.075, output: 0.30  },
  'gemini-2.5-pro':            { input: 3.50,  output: 10.50 },
  'gemini-embedding-2':        { input: 0.000, output: 0.00  },
  'ollama/llama3':             { input: 0.000, output: 0.00  },
  'default':                   { input: 0.075, output: 0.30  },
};

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Get the model trace for any AI-backed resource.
 * id may be: briefing id, copilot_conversation id, execution_record id,
 *            audit_log id (ai_call action), or recommendation id.
 */
export async function getModelTrace(id, workspaceId) {
  const [briefing, copilot, execution, auditCall] = await Promise.allSettled([
    _traceBriefing(id, workspaceId),
    _traceCopilot(id, workspaceId),
    _traceExecution(id, workspaceId),
    _traceAuditAiCall(id, workspaceId),
  ]);

  const match = [briefing, copilot, execution, auditCall].find(
    r => r.status === 'fulfilled' && r.value !== null
  );
  if (match) return match.value;
  return _notFound(id);
}

/**
 * Aggregate model usage statistics for a workspace.
 */
export async function getModelUsageSummary(workspaceId, { days = 30 } = {}) {
  const since = new Date(Date.now() - days * 86400_000).toISOString();

  // Sum from audit_log ai_call entries
  const { rows } = await query(
    `SELECT
       metadata->>'model'       AS model,
       COUNT(*)                 AS calls,
       SUM((metadata->>'inputTokens')::int)  AS input_tokens,
       SUM((metadata->>'outputTokens')::int) AS output_tokens,
       AVG((metadata->>'latencyMs')::int)    AS avg_latency_ms
     FROM audit_logs
     WHERE workspace_id = $1
       AND action = 'ai_call'
       AND created_at >= $2
     GROUP BY metadata->>'model'
     ORDER BY calls DESC`,
    [workspaceId, since]
  ).catch(() => ({ rows: [] }));

  return rows.map(r => {
    const model       = r.model ?? 'unknown';
    const inputTokens = Number(r.input_tokens ?? 0);
    const outputTokens = Number(r.output_tokens ?? 0);
    const pricing     = MODEL_PRICING[model] ?? MODEL_PRICING.default;
    const costUsd     = (inputTokens / 1_000_000) * pricing.input
                      + (outputTokens / 1_000_000) * pricing.output;
    return {
      model,
      calls:          Number(r.calls),
      inputTokens,
      outputTokens,
      totalTokens:    inputTokens + outputTokens,
      estimatedCostUsd: parseFloat(costUsd.toFixed(6)),
      avgLatencyMs:   r.avg_latency_ms ? Math.round(parseFloat(r.avg_latency_ms)) : null,
    };
  });
}

// ── Type-specific tracers ─────────────────────────────────────────────────────

async function _traceBriefing(id, workspaceId) {
  const { rows } = await query(
    `SELECT id, model_used, prompt_version, input_tokens, output_tokens,
            latency_ms, fallback_used, cache_hit, error_message, created_at
     FROM briefings
     WHERE id = $1 AND workspace_id = $2`,
    [id, workspaceId]
  ).catch(() => ({ rows: [] }));
  if (!rows[0]) return null;

  const b = rows[0];
  return _buildTrace({
    id,
    resourceType:  'BRIEFING',
    model:         b.model_used,
    promptVersion: b.prompt_version,
    inputTokens:   b.input_tokens,
    outputTokens:  b.output_tokens,
    latencyMs:     b.latency_ms,
    fallbackUsed:  b.fallback_used,
    cacheHit:      b.cache_hit,
    errorMessage:  b.error_message,
    createdAt:     b.created_at,
    workspaceId,
  });
}

async function _traceCopilot(id, workspaceId) {
  const { rows } = await query(
    `SELECT cm.id, cm.model_used, cm.prompt_version,
            cm.input_tokens, cm.output_tokens, cm.latency_ms,
            cm.fallback_used, cm.cache_hit, cm.created_at,
            cc.id AS conversation_id
     FROM copilot_messages cm
     JOIN copilot_conversations cc ON cc.id = cm.conversation_id
     WHERE (cm.id = $1 OR cc.id = $1) AND cc.workspace_id = $2
       AND cm.role = 'assistant'
     ORDER BY cm.created_at DESC
     LIMIT 1`,
    [id, workspaceId]
  ).catch(() => ({ rows: [] }));
  if (!rows[0]) return null;

  const m = rows[0];
  return _buildTrace({
    id,
    resourceType:  'COPILOT_MESSAGE',
    model:         m.model_used,
    promptVersion: m.prompt_version,
    inputTokens:   m.input_tokens,
    outputTokens:  m.output_tokens,
    latencyMs:     m.latency_ms,
    fallbackUsed:  m.fallback_used,
    cacheHit:      m.cache_hit,
    errorMessage:  null,
    createdAt:     m.created_at,
    workspaceId,
  });
}

async function _traceExecution(id, workspaceId) {
  const { rows } = await query(
    `SELECT id, model_used, prompt_version, input_tokens, output_tokens,
            latency_ms, fallback_used, created_at
     FROM execution_records
     WHERE id = $1 AND workspace_id = $2`,
    [id, workspaceId]
  ).catch(() => ({ rows: [] }));
  if (!rows[0]) return null;

  const e = rows[0];
  return _buildTrace({
    id,
    resourceType:  'EXECUTION',
    model:         e.model_used,
    promptVersion: e.prompt_version,
    inputTokens:   e.input_tokens,
    outputTokens:  e.output_tokens,
    latencyMs:     e.latency_ms,
    fallbackUsed:  e.fallback_used,
    cacheHit:      false,
    errorMessage:  null,
    createdAt:     e.created_at,
    workspaceId,
  });
}

async function _traceAuditAiCall(id, workspaceId) {
  const { rows } = await query(
    `SELECT id, metadata, created_at
     FROM audit_logs
     WHERE id = $1 AND workspace_id = $2 AND action = 'ai_call'`,
    [id, workspaceId]
  ).catch(() => ({ rows: [] }));
  if (!rows[0]) return null;

  const al   = rows[0];
  const meta = _parseJson(al.metadata, {});

  return _buildTrace({
    id,
    resourceType:  'AI_AUDIT_CALL',
    model:         meta.model,
    promptVersion: meta.promptVersion,
    inputTokens:   meta.inputTokens,
    outputTokens:  meta.outputTokens,
    latencyMs:     meta.latencyMs,
    fallbackUsed:  meta.fallbackUsed ?? false,
    cacheHit:      meta.cacheHit ?? false,
    errorMessage:  meta.error ?? null,
    createdAt:     al.created_at,
    workspaceId,
  });
}

// ── Shared builder ────────────────────────────────────────────────────────────

function _buildTrace({ id, resourceType, model, promptVersion, inputTokens, outputTokens, latencyMs, fallbackUsed, cacheHit, errorMessage, createdAt, workspaceId }) {
  const resolvedModel = model ?? (process.env.GEMINI_API_KEY ? 'gemini-2.5-flash' : 'fallback/heuristic');
  const pricing       = MODEL_PRICING[resolvedModel] ?? MODEL_PRICING.default;
  const inTok         = inputTokens  != null ? Number(inputTokens)  : null;
  const outTok        = outputTokens != null ? Number(outputTokens) : null;
  const costUsd       = (inTok != null && outTok != null)
    ? parseFloat(((inTok / 1_000_000) * pricing.input + (outTok / 1_000_000) * pricing.output).toFixed(6))
    : null;

  const fallbackChain = _buildFallbackChain(resolvedModel, fallbackUsed);

  return {
    id,
    resourceType,
    provider:      _inferProvider(resolvedModel),
    model:         resolvedModel,
    promptVersion: promptVersion ?? '1.0',
    latencyMs:     latencyMs != null ? Number(latencyMs) : null,
    inputTokens:   inTok,
    outputTokens:  outTok,
    totalTokens:   (inTok != null && outTok != null) ? inTok + outTok : null,
    estimatedCostUsd: costUsd,
    pricingBasis:  `${pricing.input} USD/1M input, ${pricing.output} USD/1M output`,
    cacheHit:      cacheHit ?? false,
    fallbackUsed:  fallbackUsed ?? false,
    fallbackChain,
    errorMessage:  errorMessage ?? null,
    createdAt,
    workspaceId,
  };
}

function _inferProvider(model) {
  if (!model) return 'unknown';
  if (model.startsWith('gemini'))  return 'google';
  if (model.startsWith('ollama'))  return 'ollama';
  if (model.startsWith('gpt'))     return 'openai';
  if (model.startsWith('claude'))  return 'anthropic';
  if (model === 'fallback/heuristic') return 'local';
  return 'unknown';
}

function _buildFallbackChain(model, fallbackUsed) {
  const chain = [{ step: 1, model, status: fallbackUsed ? 'skipped' : 'used' }];
  if (fallbackUsed) {
    chain.push({ step: 2, model: 'fallback/heuristic', status: 'used', reason: 'Primary model unavailable or no API key' });
  }
  return chain;
}

function _parseJson(v, fallback) {
  if (!v) return fallback;
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch { return fallback; }
}

function _notFound(id) {
  return { id, resourceType: 'UNKNOWN', model: null, provider: null, latencyMs: null, inputTokens: null, outputTokens: null, estimatedCostUsd: null, fallbackChain: [], cacheHit: false };
}
