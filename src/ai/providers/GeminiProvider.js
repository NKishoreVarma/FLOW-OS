import { AIConfig } from '../AIConfig.js';

/**
 * Gemini provider — Google AI via @google/genai SDK.
 *
 * Text generation uses the direct Gemini API (no proxy).
 * Embeddings route through GEMINI_EMBED_BASE_URL (Composio proxy) when set,
 * to avoid quota exhaustion on the free embedding tier.
 */
export class GeminiProvider {
  constructor() {
    this.name       = 'gemini';
    this._cfg       = AIConfig.gemini;
    this._chatModel = this._cfg.chatModel;
    this._embedModel= this._cfg.embedModel;
    this._embedDim  = this._cfg.embedDim;
    this._aiInstance = null; // lazy init — requires GEMINI_API_KEY
    this._embedAI    = null; // may use a different baseUrl
  }

  _getAI() {
    if (!this._cfg.apiKey) throw new Error('GEMINI_API_KEY not configured');
    if (!this._aiInstance) {
      const { GoogleGenAI } = this._requireSDK();
      this._aiInstance = new GoogleGenAI({ apiKey: this._cfg.apiKey });
    }
    return this._aiInstance;
  }

  _getEmbedAI() {
    if (!this._cfg.apiKey) throw new Error('GEMINI_API_KEY not configured');
    if (!this._embedAI) {
      const { GoogleGenAI } = this._requireSDK();
      const opts = { apiKey: this._cfg.apiKey };
      if (this._cfg.embedBaseUrl) {
        opts.baseUrl = this._cfg.embedBaseUrl;
      }
      this._embedAI = new GoogleGenAI(opts);
    }
    return this._embedAI;
  }

  _requireSDK() {
    // Dynamic import avoided for simplicity — @google/genai is always installed
    try {
      // ESM workaround: use createRequire or rely on top-level dynamic import
      return { GoogleGenAI: this._GoogleGenAI };
    } catch {
      throw new Error('@google/genai package not installed');
    }
  }

  // Injected at init time by AIProviderFactory to avoid circular ESM issues
  setSDK(GoogleGenAI) {
    this._GoogleGenAI = GoogleGenAI;
    this._aiInstance  = null;
    this._embedAI     = null;
  }

  _buildContents(request) {
    if (request.messages?.length) {
      // Gemini format: map 'assistant' → 'model', merge system into first user turn
      const systemMsg = request.messages.find(m => m.role === 'system');
      const turns     = request.messages.filter(m => m.role !== 'system');
      if (systemMsg && turns.length > 0) {
        turns[0] = {
          ...turns[0],
          content: `${systemMsg.content}\n\n${turns[0].content}`,
        };
      }
      return turns.map(m => ({
        role:  m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));
    }
    return request.prompt || '';
  }

  /**
   * Non-streaming chat completion.
   */
  async chat(request) {
    const ai      = this._getAI();
    const t0      = Date.now();
    const contents = this._buildContents(request);

    const result = await ai.models.generateContent({
      model:    this._chatModel,
      contents,
      config: {
        maxOutputTokens: request.maxTokens  ?? 2048,
        temperature:     request.temperature ?? 0.3,
      },
    });

    return {
      text:      result.text ?? '',
      provider:  this.name,
      model:     this._chatModel,
      latencyMs: Date.now() - t0,
    };
  }

  /**
   * Streaming via Gemini generateContentStream.
   * Yields text delta strings matching the Ollama stream interface.
   */
  async *stream(request) {
    const ai       = this._getAI();
    const contents = this._buildContents(request);

    const iter = await ai.models.generateContentStream({
      model:    this._chatModel,
      contents,
      config: {
        maxOutputTokens: request.maxTokens ?? 2048,
        temperature:     request.temperature ?? 0.3,
      },
    });

    for await (const chunk of iter) {
      const delta = chunk.text ?? '';
      if (delta) yield delta;
    }
  }

  /**
   * Embeddings — uses embed-specific AI instance (may use proxy base URL).
   */
  async embed(text) {
    const ai  = this._getEmbedAI();
    const t0  = Date.now();

    const response = await ai.models.embedContent({
      model:    this._embedModel,
      contents: text,
      config: { outputDimensionality: this._embedDim },
    });

    const values = response?.embeddings?.[0]?.values;
    if (!Array.isArray(values) || values.length === 0) {
      throw new Error('Gemini returned empty embedding');
    }
    return {
      values,
      provider:  this.name,
      model:     this._embedModel,
      latencyMs: Date.now() - t0,
    };
  }

  async summarize(request) { return this.chat({ ...request, taskType: 'summarize' }); }
  async classify(request)  { return this.chat({ ...request, taskType: 'classify' }); }
  async reason(request)    { return this.chat({ ...request, taskType: 'reason' }); }
  async extractEntities(r) { return this.chat({ ...r, taskType: 'extract_entities' }); }

  async models() {
    if (!this._cfg.apiKey) return [];
    return [this._chatModel, this._embedModel];
  }

  async health() {
    const t0 = Date.now();
    if (!this._cfg.apiKey) {
      return {
        provider: this.name, status: 'offline', latencyMs: 0,
        models: [], error: 'GEMINI_API_KEY not set',
        isDefault: AIConfig.defaultProvider === this.name,
        isFallback: AIConfig.fallbackProvider === this.name,
      };
    }
    try {
      const ai     = this._getAI();
      await ai.models.generateContent({
        model:    this._chatModel,
        contents: 'ping',
        config:   { maxOutputTokens: 5 },
      });
      return {
        provider:   this.name,
        status:     'healthy',
        latencyMs:  Date.now() - t0,
        models:     await this.models(),
        isDefault:  AIConfig.defaultProvider === this.name,
        isFallback: AIConfig.fallbackProvider === this.name,
      };
    } catch (err) {
      return {
        provider:   this.name,
        status:     'degraded',
        latencyMs:  Date.now() - t0,
        models:     await this.models().catch(() => []),
        error:      err.message?.substring(0, 120),
        isDefault:  AIConfig.defaultProvider === this.name,
        isFallback: AIConfig.fallbackProvider === this.name,
      };
    }
  }
}
