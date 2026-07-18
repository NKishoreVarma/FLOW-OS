import { AIConfig } from '../AIConfig.js';

/**
 * Ollama provider — local inference via the Ollama REST API.
 *
 * Uses qwen-64k:latest for general tasks (64k context window fits full
 * workspace context payloads) and qwen2.5-coder:7b for engineering tasks.
 *
 * Streaming is implemented as an async generator that yields text deltas.
 */
export class OllamaProvider {
  constructor() {
    this.name     = 'ollama';
    this.baseUrl  = AIConfig.ollama.baseUrl;
    this.timeout  = AIConfig.ollama.timeoutMs;
    this._defaultModel = AIConfig.ollama.defaultModel;
    this._coderModel   = AIConfig.ollama.coderModel;
  }

  _modelFor(taskType) {
    if (taskType === 'architecture' || taskType === 'search') {
      return this._coderModel;
    }
    return this._defaultModel;
  }

  _buildMessages(request) {
    if (request.messages?.length) return request.messages;
    return [{ role: 'user', content: request.prompt || '' }];
  }

  /**
   * Non-streaming chat completion.
   * @param {import('../types.js').AIRequest} request
   * @returns {Promise<import('../types.js').AIResponse>}
   */
  async chat(request) {
    const model    = this._modelFor(request.taskType);
    const messages = this._buildMessages(request);
    const t0       = Date.now();

    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        model,
        messages,
        stream: false,
        options: {
          num_predict: request.maxTokens  ?? 2048,
          temperature: request.temperature ?? 0.3,
        },
      }),
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => res.statusText);
      throw new Error(`Ollama chat error ${res.status}: ${err}`);
    }

    const data = await res.json();
    const text = data.message?.content ?? '';
    return {
      text,
      provider:   this.name,
      model,
      latencyMs:  Date.now() - t0,
      usage: {
        promptTokens:     data.prompt_eval_count ?? 0,
        completionTokens: data.eval_count ?? 0,
      },
    };
  }

  /**
   * Streaming chat completion — yields text delta strings.
   * @param {import('../types.js').AIRequest} request
   * @returns {AsyncGenerator<string>}
   */
  async *stream(request) {
    const model    = this._modelFor(request.taskType);
    const messages = this._buildMessages(request);

    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        model,
        messages,
        stream: true,
        options: {
          num_predict: request.maxTokens ?? 2048,
          temperature: request.temperature ?? 0.3,
        },
      }),
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!res.ok) throw new Error(`Ollama stream error ${res.status}: ${res.statusText}`);

    const reader  = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer    = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const chunk = JSON.parse(line);
          const delta = chunk.message?.content ?? '';
          if (delta) yield delta;
          if (chunk.done) return;
        } catch { /* partial JSON — ignore */ }
      }
    }
  }

  /**
   * Embeddings via Ollama's /api/embeddings endpoint.
   * Requires nomic-embed-text or similar model pulled locally.
   */
  async embed(text) {
    const model = AIConfig.ollama.embedModel;
    const t0    = Date.now();

    const res = await fetch(`${this.baseUrl}/api/embeddings`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ model, prompt: text }),
      signal:  AbortSignal.timeout(this.timeout),
    });

    if (!res.ok) throw new Error(`Ollama embed error ${res.status}`);
    const data = await res.json();
    const values = data.embedding;
    if (!Array.isArray(values) || values.length === 0) {
      throw new Error('Ollama returned empty embedding');
    }
    return { values, provider: this.name, model, latencyMs: Date.now() - t0 };
  }

  async summarize(request) {
    return this.chat({ ...request, taskType: 'summarize' });
  }

  async classify(request) {
    return this.chat({ ...request, taskType: 'classify' });
  }

  async reason(request) {
    return this.chat({ ...request, taskType: 'reason' });
  }

  async extractEntities(request) {
    return this.chat({ ...request, taskType: 'extract_entities' });
  }

  async models() {
    const res  = await fetch(`${this.baseUrl}/api/tags`, { signal: AbortSignal.timeout(5000) });
    const data = await res.json();
    return (data.models ?? []).map(m => m.name);
  }

  async health() {
    const t0 = Date.now();
    try {
      const modelList = await this.models();
      return {
        provider:   this.name,
        status:     modelList.length > 0 ? 'healthy' : 'degraded',
        latencyMs:  Date.now() - t0,
        models:     modelList,
        isDefault:  AIConfig.defaultProvider === this.name,
        isFallback: AIConfig.fallbackProvider === this.name,
      };
    } catch (err) {
      return {
        provider:   this.name,
        status:     'offline',
        latencyMs:  Date.now() - t0,
        models:     [],
        error:      err.message,
        isDefault:  AIConfig.defaultProvider === this.name,
        isFallback: AIConfig.fallbackProvider === this.name,
      };
    }
  }
}
