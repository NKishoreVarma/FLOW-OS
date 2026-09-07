/**
 * FLOW OS — Memory Helper Utilities
 */

/**
 * Summarizes conversation context or operational chunks into short highlights.
 *
 * @param {string[]} messages
 * @returns {string} summarized string
 */
export function summarizeMemoryLocal(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return '';

  const bulletPoints = [];
  for (const msg of messages) {
    const text = typeof msg === 'string' ? msg : JSON.stringify(msg);
    // Grab the first sentence or first 100 characters
    const firstLine = text.split(/[.\n]/)[0].trim();
    if (firstLine.length > 0) {
      bulletPoints.push(`- ${firstLine}`);
    }
  }

  return bulletPoints.join('\n');
}

/**
 * Checks for duplicates between two text strings using Jaccard word-set similarity.
 *
 * @param {string} text1
 * @param {string} text2
 * @param {number} threshold - Similarity percentage (e.g. 0.8 for 80% overlap)
 * @returns {boolean} true if texts are similar above the threshold
 */
export function isDuplicateMemory(text1, text2, threshold = 0.8) {
  if (!text1 || !text2) return false;

  const cleanText = t => t.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 2);

  const set1 = new Set(cleanText(text1));
  const set2 = new Set(cleanText(text2));

  if (set1.size === 0 || set2.size === 0) return false;

  let intersectionCount = 0;
  for (const item of set1) {
    if (set2.has(item)) intersectionCount++;
  }

  const unionSize = set1.size + set2.size - intersectionCount;
  const jaccard = intersectionCount / unionSize;

  return jaccard >= threshold;
}

/**
 * Calculates cosine similarity between two vector embedding arrays of identical length.
 *
 * @param {number[]} vecA
 * @param {number[]} vecB
 * @returns {number} similarity score between -1.0 and 1.0 (typically 0.0 to 1.0 for embeddings)
 */
export function calculateCosineSimilarity(vecA, vecB) {
  if (!Array.isArray(vecA) || !Array.isArray(vecB) || vecA.length !== vecB.length || vecA.length === 0) {
    return 0;
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  if (normA === 0 || normB === 0) return 0;

  return parseFloat((dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))).toFixed(6));
}

export default {
  summarizeMemoryLocal,
  isDuplicateMemory,
  calculateCosineSimilarity
};
