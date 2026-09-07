/**
 * FLOW OS — Observability Token Accounting & Cost Estimators
 */

import { countTokensEstimator } from '../utils/llm/embeddingHelpers.js';

// Cost per 1M tokens in USD (as of standard API pricing benchmarks)
const MODEL_PRICING = {
  'gemini-2.5-flash': { input: 0.075, output: 0.30 },
  'gpt-4o':           { input: 2.50,  output: 10.00 },
  'gpt-4o-mini':      { input: 0.150, output: 0.60 },
  'claude-3-5-sonnet':{ input: 3.00,  output: 15.00 },
  'default':          { input: 0.10,  output: 0.40 }
};

/**
 * Estimates token counts for query prompts and answers.
 *
 * @param {string} text
 * @returns {number} token count
 */
export function estimateTokens(text) {
  return countTokensEstimator(text);
}

/**
 * Computes running costs of API executions in USD.
 *
 * @param {number} inputTokens
 * @param {number} outputTokens
 * @param {string} modelName
 * @returns {number} cost in USD
 */
export function calculateCost(inputTokens, outputTokens, modelName = 'gemini-2.5-flash') {
  const modelKey = Object.keys(MODEL_PRICING).find(k => modelName.toLowerCase().includes(k)) || 'default';
  const pricing = MODEL_PRICING[modelKey];

  const inputCost = (inputTokens / 1000000) * pricing.input;
  const outputCost = (outputTokens / 1000000) * pricing.output;

  return parseFloat((inputCost + outputCost).toFixed(8));
}

/**
 * Decorator to trace latency execution and calculate billing tokens on LLM runs.
 */
export class ExecutionTracker {
  constructor(modelName = 'gemini-2.5-flash') {
    this.modelName = modelName;
    this.startTime = Date.now();
    this.endTime = null;
    this.latencyMs = 0;
  }

  start() {
    this.startTime = Date.now();
  }

  stop() {
    this.endTime = Date.now();
    this.latencyMs = this.endTime - this.startTime;
    return this.latencyMs;
  }

  /**
   * Tracks an LLM invocation, computing latency, estimated tokens, and costs.
   *
   * @param {string} prompt
   * @param {string} completion
   * @returns {{
   *   latencyMs: number,
   *   inputTokens: number,
   *   outputTokens: number,
   *   totalTokens: number,
   *   estimatedCost: number,
   *   model: string
   * }}
   */
  trackCall(prompt, completion) {
    this.stop();
    const inputTokens = estimateTokens(prompt);
    const outputTokens = estimateTokens(completion);
    const totalTokens = inputTokens + outputTokens;
    const estimatedCost = calculateCost(inputTokens, outputTokens, this.modelName);

    return {
      latencyMs: this.latencyMs,
      inputTokens,
      outputTokens,
      totalTokens,
      estimatedCost,
      model: this.modelName
    };
  }
}

export default {
  estimateTokens,
  calculateCost,
  ExecutionTracker
};
