/**
 * FLOW OS — RAG Evaluation Utilities
 */

import { extractJson } from '../utils/llm/jsonParser.js';

/**
 * Calculates query-context relevance.
 *
 * @param {string} queryText
 * @param {Object[]} chunks
 * @returns {number} retrieval precision score (0.0 to 1.0)
 */
export function evaluateRetrievalPrecision(queryText, chunks) {
  if (!queryText || !Array.isArray(chunks) || chunks.length === 0) return 0;

  const queryTerms = new Set(
    queryText.toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 3)
  );

  if (queryTerms.size === 0) return 1.0; // No long terms to search

  let matchCount = 0;
  for (const chunk of chunks) {
    const chunkText = (chunk.text || '').toLowerCase();
    const hasTerm = Array.from(queryTerms).some(term => chunkText.includes(term));
    if (hasTerm) matchCount++;
  }

  return parseFloat((matchCount / chunks.length).toFixed(4));
}

/**
 * Parses inline citations (e.g. [1], [2], etc.) and verifies their validity
 * against the provided context chunks.
 *
 * @param {string} answerText
 * @param {Object[]} chunks
 * @returns {{
 *   validCitations: number[],
 *   invalidCitations: number[],
 *   citationCount: number,
 *   citationErrorRate: number
 * }}
 */
export function validateCitations(answerText, chunks) {
  if (!answerText) {
    return { validCitations: [], invalidCitations: [], citationCount: 0, citationErrorRate: 0 };
  }

  // Regex to extract all inline citations e.g. [1], [2]
  const matches = answerText.match(/\[(\d+)\]/g) || [];
  const citationIndices = Array.from(new Set(matches.map(m => parseInt(m.slice(1, -1), 10))));

  const validCitations = [];
  const invalidCitations = [];

  for (const index of citationIndices) {
    // Check if the 1-based citation index points to a valid chunk array element
    if (index > 0 && index <= chunks.length) {
      validCitations.push(index);
    } else {
      invalidCitations.push(index);
    }
  }

  const citationCount = citationIndices.length;
  const citationErrorRate = citationCount > 0 ? parseFloat((invalidCitations.length / citationCount).toFixed(4)) : 0;

  return {
    validCitations,
    invalidCitations,
    citationCount,
    citationErrorRate
  };
}

/**
 * Performs simple heuristic check to detect factual/hallucinated claims.
 * Identifies if the answer contains specific alphanumeric tokens (dates like 2026-06-26, metrics like $50M)
 * that do not appear anywhere in the retrieved chunks.
 *
 * @param {string} answerText
 * @param {Object[]} chunks
 * @returns {{
 *   hasHallucinationWarning: boolean,
 *   unsupportedTokens: string[]
 * }}
 */
export function detectHallucinations(answerText, chunks) {
  if (!answerText) return { hasHallucinationWarning: false, unsupportedTokens: [] };

  const contextTextCombined = chunks.map(c => (c.text || '') + ' ' + (c.title || '')).join(' ').toLowerCase();

  // Find all dates, numbers, and cost values (e.g., "$100k", "2026-06-24", "150%")
  const tokenRegex = /(\$\d+(?:\.\d+)?(?:k|m|b)?|\d{4}-\d{2}-\d{2}|\b\d+(?:%|px|ms|s|gb|mb)\b)/gi;
  const matches = answerText.match(tokenRegex) || [];
  const uniqueTokens = Array.from(new Set(matches.map(t => t.toLowerCase())));

  const unsupportedTokens = [];

  for (const token of uniqueTokens) {
    if (!contextTextCombined.includes(token)) {
      unsupportedTokens.push(token);
    }
  }

  return {
    hasHallucinationWarning: unsupportedTokens.length > 0,
    unsupportedTokens
  };
}

/**
 * Evaluates context coverage: checks how many of the query's core terms are covered
 * in the retrieved context nodes.
 *
 * @param {string} queryText
 * @param {Object[]} chunks
 * @returns {number} coverage score (0.0 to 1.0)
 */
export function evaluateContextCoverage(queryText, chunks) {
  if (!queryText || !Array.isArray(chunks) || chunks.length === 0) return 0;

  const queryTerms = queryText.toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 3);

  if (queryTerms.length === 0) return 1.0;

  const contextTextCombined = chunks.map(c => (c.text || '').toLowerCase()).join(' ');

  let coveredCount = 0;
  for (const term of queryTerms) {
    if (contextTextCombined.includes(term)) {
      coveredCount++;
    }
  }

  return parseFloat((coveredCount / queryTerms.length).toFixed(4));
}

export default {
  evaluateRetrievalPrecision,
  validateCitations,
  detectHallucinations,
  evaluateContextCoverage
};
