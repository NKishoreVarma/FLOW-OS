/**
 * FLOW OS — Embedding Utilities
 */

/**
 * Splits an array of strings or document objects into batches of a maximum size.
 * Useful to keep under token limits or batch sizes specified by Google / OpenAI APIs.
 *
 * @param {any[]} items - Chunks or texts to batch
 * @param {number} maxBatchSize - Maximum items per batch
 * @returns {any[][]} array of batches
 */
export function batchInputs(items, maxBatchSize = 16) {
  if (!Array.isArray(items)) return [];
  const batches = [];
  for (let i = 0; i < items.length; i += maxBatchSize) {
    batches.push(items.slice(i, i + maxBatchSize));
  }
  return batches;
}

/**
 * Calculates character and word overlap coefficients between two text blocks.
 *
 * @param {string} text1
 * @param {string} text2
 * @returns {{ charOverlapRatio: number, wordOverlapRatio: number }}
 */
export function calculateOverlapMetrics(text1, text2) {
  if (!text1 || !text2) return { charOverlapRatio: 0, wordOverlapRatio: 0 };

  const clean1 = text1.toLowerCase().trim();
  const clean2 = text2.toLowerCase().trim();

  // Word overlap
  const words1 = new Set(clean1.split(/\s+/).filter(w => w.length > 2));
  const words2 = new Set(clean2.split(/\s+/).filter(w => w.length > 2));

  let wordOverlapCount = 0;
  for (const w of words1) {
    if (words2.has(w)) wordOverlapCount++;
  }

  const maxWords = Math.max(words1.size, words2.size);
  const wordOverlapRatio = maxWords > 0 ? parseFloat((wordOverlapCount / maxWords).toFixed(4)) : 0;

  // Character overlap matching prefix/suffix substring
  let maxMatch = 0;
  const minLen = Math.min(clean1.length, clean2.length);
  for (let len = 1; len <= Math.min(minLen, 200); len++) {
    const endPart1 = clean1.substring(clean1.length - len);
    const startPart2 = clean2.substring(0, len);
    if (endPart1 === startPart2) {
      maxMatch = len;
    }
  }

  const charOverlapRatio = clean1.length > 0 ? parseFloat((maxMatch / clean1.length).toFixed(4)) : 0;

  return {
    charOverlapRatio,
    wordOverlapRatio
  };
}

/**
 * Concurrency-controlled queue runner for rate-limited embedding endpoints.
 */
export class EmbeddingQueue {
  /**
   * @param {Object} options
   * @param {number} options.concurrency - Concurrent calls allowed
   * @param {number} options.delayBetweenCallsMs - Delay in ms after each batch execution
   */
  constructor(options = {}) {
    this.concurrency = options.concurrency || 2;
    this.delayBetweenCallsMs = options.delayBetweenCallsMs || 200;
    this.activeCount = 0;
    this.queue = [];
  }

  /**
   * Enqueues an embedding task.
   *
   * @param {() => Promise<any>} task - Async function performing API call
   * @returns {Promise<any>}
   */
  enqueue(task) {
    return new Promise((resolve, reject) => {
      this.queue.push({ task, resolve, reject });
      this.next();
    });
  }

  next() {
    if (this.activeCount >= this.concurrency || this.queue.length === 0) {
      return;
    }

    const { task, resolve, reject } = this.queue.shift();
    this.activeCount++;

    task()
      .then(async res => {
        resolve(res);
        if (this.delayBetweenCallsMs > 0) {
          await new Promise(r => setTimeout(r, this.delayBetweenCallsMs));
        }
      })
      .catch(err => {
        reject(err);
      })
      .finally(() => {
        this.activeCount--;
        this.next();
      });
  }
}

/**
 * Single canonical embedding function — routes through BrainRouter so all
 * provider switching and fallback logic lives in one place. Both vectorStoreService
 * and retrievalService import this instead of maintaining separate copies (TD-07).
 *
 * @param {string} text
 * @returns {Promise<number[]>} 768-dim float array
 */
export async function generateEmbedding(text) {
  const { embed: brainEmbed } = await import('../../ai/BrainRouter.js');
  const result = await brainEmbed(text);
  const values = result?.values;
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error('[Embedding] Empty embedding returned from AI provider.');
  }
  return values;
}

/**
 * Counts estimated tokens for a string using a proxy calculation:
 * - English text average: 1 token ≈ 4 characters or 0.75 words.
 *
 * @param {string} text
 * @returns {number} estimated tokens
 */
export function countTokensEstimator(text) {
  if (!text) return 0;
  // Use character length base combined with word count to get a higher accuracy proxy
  const charTokens = text.length / 4.0;
  const wordTokens = (text.split(/\s+/).filter(Boolean).length) / 0.75;
  return Math.ceil((charTokens + wordTokens) / 2);
}

export default {
  batchInputs,
  calculateOverlapMetrics,
  EmbeddingQueue,
  countTokensEstimator
};
