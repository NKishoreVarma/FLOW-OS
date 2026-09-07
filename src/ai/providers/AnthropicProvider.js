import { AIConfig } from '../AIConfig.js';

/**
 * Anthropic provider — Claude models via native fetch (no SDK dependency).
 * Uses the Messages API. Supports chat, streaming, and vision.
 */
export class AnthropicProvider {
  constructor() {
    this.name    = 'anthropic';
    this._cfg    = AIConfig.anthropic;
    this.timeout = this._cfg.timeoutMs;
  }

  _headers() {
    if (!this._cfg.apiKey) throw new Error('ANTHROPIC_API_KEY not configured');
    return {
      'x-api-key':          this._cfg.apiKey,
      'anthropic-version':  '2023-06-01',
      'Content-Type':       'application/json',
    };
  }

  _modelFor(taskType, tier) {
    const t = tier ?? AIConfig.taskTier[taskType] ?? 'standard';
    return t === 'heavy'   ? this._cfg.heavyModel
         : t === 'light'   ? this._cfg.lightModel
         :                    this._cfg.defaultModel;
  }

  _toAnthropicMessages(request) {
    const msgs = request.messages ?? [{ role: 'user', content: request.prompt || '' }];
    const system = msgs.find(m => m.role === 'system')?.content;
    const turns  = msgs.filter(m => m.role !== 'system');
    return { system: system ?? undefined, messages: turns };
  }

  async chat(request) {
    const model  = this._modelFor(request.taskType, request.modelTier);
    const { system, messages } = this._toAnthropicMessages(request);
    const t0     = Date.now();

    const body = {
      model,
      messages,
      max_tokens:  request.maxTokens   ?? 2048,
      temperature: request.temperature ?? 0.3,
      ...(system ? { system } : {}),
    };

    const res = await fetch(`${this._cfg.baseUrl}/v1/messages`, {
      method:  'POST',
      headers: this._headers(),
      body:    JSON.stringify(body),
      signal:  AbortSignal.timeout(this.timeout),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: { message: res.statusText } }));
      throw new Error(`Anthropic error ${res.status}: ${err.error?.message ?? res.statusText}`);
    }

    const data = await res.json();
    const text = data.content?.find(b => b.type === 'text')?.text ?? '';
    return {
      text,
      provider:  this.name,
      model,
      latencyMs: Date.now() - t0,
      usage: {
        promptTokens:     data.usage?.input_tokens  ?? 0,
        completionTokens: data.usage?.output_tokens ?? 0,
      },
      costUsd: _estimateCost(model, data.usage?.input_tokens ?? 0, data.usage?.output_tokens ?? 0),
    };
  }

  async *stream(request) {
    const model  = this._modelFor(request.taskType, request.modelTier);
    const { system, messages } = this._toAnthropicMessages(request);

    const res = await fetch(`${this._cfg.baseUrl}/v1/messages`, {
      method:  'POST',
      headers: this._headers(),
      body: JSON.stringify({
        model, messages, max_tokens: 4096, stream: true,
        ...(system ? { system } : {}),
      }),
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!res.ok) throw new Error(`Anthropic stream error ${res.status}`);

    const reader = res.body.getReader();
    const dec    = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const lines = dec.decode(value).split('\n').filter(l => l.startsWith('data:'));
      for (const line of lines) {
        try {
          const d = JSON.parse(line.slice(5));
          if (d.type === 'content_block_delta' && d.delta?.type === 'text_delta') {
            yield d.delta.text;
          }
        } catch {}
      }
    }
  }

  // Anthropic does not offer an embedding API — throw so the factory can fallback
  async embed(_text) {
    throw new Error('Anthropic does not provide an embedding API. Use Gemini or OpenAI for embeddings.');
  }

  async health() {
    const t0 = Date.now();
    try {
      // Minimal request to verify the key works
      const res = await fetch(`${this._cfg.baseUrl}/v1/models`, {
        headers: this._headers(),
        signal: AbortSignal.timeout(5000),
      });
      const data = await res.json().catch(() => ({}));
      return {
        provider:   this.name,
        status:     res.ok ? 'healthy' : 'degraded',
        latencyMs:  Date.now() - t0,
        models:     (data.data ?? []).slice(0, 6).map(m => m.id),
        configured: !!this._cfg.apiKey,
      };
    } catch (e) {
      return { provider: this.name, status: !this._cfg.apiKey ? 'unconfigured' : 'offline', latencyMs: Date.now() - t0, configured: !!this._cfg.apiKey, error: e.message };
    }
  }
}

// USD per 1M tokens — update as Anthropic pricing changes
const COST = {
  'claude-opus-4-8':        { in: 15.00, out: 75.00  },
  'claude-sonnet-4-6':      { in: 3.00,  out: 15.00  },
  'claude-haiku-4-5-20251001': { in: 0.80, out: 4.00 },
  'claude-3-5-sonnet-20241022': { in: 3.00, out: 15.00 },
  'claude-3-haiku-20240307':    { in: 0.25, out: 1.25 },
};

function _estimateCost(model, inTok, outTok) {
  const c = COST[model];
  if (!c) return null;
  return parseFloat(((inTok * c.in + outTok * c.out) / 1_000_000).toFixed(6));
}
