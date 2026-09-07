import { AIConfig } from '../AIConfig.js';

/**
 * OpenAI provider — GPT models via native fetch (no SDK dependency).
 * Supports chat completion, streaming, and embeddings.
 * Compatible with any OpenAI-API-compatible endpoint (Azure, Together, etc.)
 */
export class OpenAIProvider {
  constructor() {
    this.name     = 'openai';
    this._cfg     = AIConfig.openai;
    this.timeout  = this._cfg.timeoutMs;
  }

  _headers() {
    if (!this._cfg.apiKey) throw new Error('OPENAI_API_KEY not configured');
    return {
      Authorization:  `Bearer ${this._cfg.apiKey}`,
      'Content-Type': 'application/json',
      ...(this._cfg.organization ? { 'OpenAI-Organization': this._cfg.organization } : {}),
    };
  }

  _modelFor(taskType, tier) {
    const t = tier ?? AIConfig.taskTier[taskType] ?? 'standard';
    return t === 'heavy'   ? this._cfg.heavyModel
         : t === 'light'   ? this._cfg.lightModel
         :                    this._cfg.defaultModel;
  }

  _buildMessages(request) {
    if (request.messages?.length) return request.messages;
    return [{ role: 'user', content: request.prompt || '' }];
  }

  async chat(request) {
    const model    = this._modelFor(request.taskType, request.modelTier);
    const messages = this._buildMessages(request);
    const t0       = Date.now();

    const res = await fetch(`${this._cfg.baseUrl}/chat/completions`, {
      method:  'POST',
      headers: this._headers(),
      body: JSON.stringify({
        model,
        messages,
        max_completion_tokens: request.maxTokens   ?? 2048,
        temperature:           request.temperature ?? 0.3,
        stream: false,
      }),
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: { message: res.statusText } }));
      throw new Error(`OpenAI error ${res.status}: ${err.error?.message ?? res.statusText}`);
    }

    const data = await res.json();
    return {
      text:       data.choices?.[0]?.message?.content ?? '',
      provider:   this.name,
      model,
      latencyMs:  Date.now() - t0,
      usage: {
        promptTokens:     data.usage?.prompt_tokens     ?? 0,
        completionTokens: data.usage?.completion_tokens ?? 0,
      },
      costUsd: _estimateCost(model, data.usage?.prompt_tokens ?? 0, data.usage?.completion_tokens ?? 0),
    };
  }

  async *stream(request) {
    const model    = this._modelFor(request.taskType, request.modelTier);
    const messages = this._buildMessages(request);

    const res = await fetch(`${this._cfg.baseUrl}/chat/completions`, {
      method:  'POST',
      headers: this._headers(),
      body: JSON.stringify({ model, messages, stream: true, temperature: request.temperature ?? 0.3 }),
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!res.ok) throw new Error(`OpenAI stream error ${res.status}`);

    const reader = res.body.getReader();
    const dec    = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const lines = dec.decode(value).split('\n').filter(l => l.startsWith('data:'));
      for (const line of lines) {
        const payload = line.slice(5).trim();
        if (payload === '[DONE]') return;
        try {
          const d = JSON.parse(payload);
          const delta = d.choices?.[0]?.delta?.content;
          if (delta) yield delta;
        } catch {}
      }
    }
  }

  async embed(text) {
    const t0  = Date.now();
    const res = await fetch(`${this._cfg.baseUrl}/embeddings`, {
      method:  'POST',
      headers: this._headers(),
      body: JSON.stringify({ model: this._cfg.embedModel, input: text }),
      signal: AbortSignal.timeout(this.timeout),
    });
    if (!res.ok) throw new Error(`OpenAI embed error ${res.status}`);
    const data = await res.json();
    return {
      values:    data.data?.[0]?.embedding ?? [],
      provider:  this.name,
      model:     this._cfg.embedModel,
      latencyMs: Date.now() - t0,
    };
  }

  async health() {
    const t0 = Date.now();
    try {
      const res = await fetch(`${this._cfg.baseUrl}/models`, {
        headers: this._headers(),
        signal: AbortSignal.timeout(5000),
      });
      const data = await res.json();
      return {
        provider:  this.name,
        status:    res.ok ? 'healthy' : 'degraded',
        latencyMs: Date.now() - t0,
        models:    (data.data ?? []).slice(0, 6).map(m => m.id),
        configured: !!this._cfg.apiKey,
      };
    } catch (e) {
      return { provider: this.name, status: !this._cfg.apiKey ? 'unconfigured' : 'offline', latencyMs: Date.now() - t0, configured: !!this._cfg.apiKey, error: e.message };
    }
  }
}

// Rough cost estimates (USD per 1M tokens) — update as pricing changes
const COST = {
  'gpt-4o':          { in: 2.50,  out: 10.00 },
  'gpt-4o-mini':     { in: 0.15,  out: 0.60  },
  'o1':              { in: 15.00, out: 60.00  },
  'o1-mini':         { in: 1.10,  out: 4.40   },
  'o3-mini':         { in: 1.10,  out: 4.40   },
};

function _estimateCost(model, inTok, outTok) {
  const c = COST[model];
  if (!c) return null;
  return parseFloat(((inTok * c.in + outTok * c.out) / 1_000_000).toFixed(6));
}
