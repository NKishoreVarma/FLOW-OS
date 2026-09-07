import crypto from 'crypto';
import { chunkText } from './parserService.js';
import { generateEmbedding } from '../utils/llm/embeddingHelpers.js';

// ── Module-level global vector database ──────────────────────────────────────
export const vectorDatabase = [];

// ── Synapse Engine: Cross-channel context clustering registry ─────────────────
// Each entry: { topicId, title, centroid, memberCount, workspaceId, createdAt }
export const topicClusters = [];

// Cosine similarity threshold for assigning a chunk to an existing cluster
const CLUSTER_SIMILARITY_THRESHOLD = 0.82;

/**
 * Calculates the cosine similarity between two vector arrays of the same length.
 *
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number} similarity in [0, 1]
 */
function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot  += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Derives a short human-readable title from a text chunk for use as a cluster label.
 * Strips punctuation, takes the first 6 meaningful words, title-cases them.
 *
 * @param {string} text
 * @returns {string}
 */
function deriveClusterTitle(text) {
  const stopwords = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'in', 'on', 'at', 'to',
    'of', 'and', 'or', 'but', 'for', 'with', 'from', 'by', 'as', 'it',
    'its', 'this', 'that', 'be', 'has', 'have', 'had', 'not', 'also'
  ]);

  const words = text
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopwords.has(w.toLowerCase()))
    .slice(0, 6)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());

  return words.length > 0 ? words.join(' ') : 'General Context Cluster';
}

/**
 * Computes a rolling centroid by averaging the existing centroid with a new vector,
 * weighted by the cluster's current member count (incremental mean update).
 *
 * @param {number[]} centroid  - Current centroid vector
 * @param {number[]} newVector - Incoming chunk vector
 * @param {number}   count     - Current member count (BEFORE adding the new member)
 * @returns {number[]} Updated centroid vector
 */
function updateCentroid(centroid, newVector, count) {
  return centroid.map((val, i) => (val * count + newVector[i]) / (count + 1));
}

/**
 * Synapse Engine: resolves which topic cluster a chunk belongs to.
 * Scans existing clusters within the same workspace, picks the best cosine match
 * above the threshold, updates its rolling centroid, and returns the topicId.
 * If no cluster qualifies, creates a brand-new one.
 *
 * @param {string}   workspaceId - Tenant isolation key
 * @param {number[]} vector      - Embedding for the incoming chunk
 * @param {string}   text        - Raw chunk text (used to derive a title on cluster creation)
 * @returns {string} topicId
 */
function resolveTopicCluster(workspaceId, vector, text) {
  const wsKey = String(workspaceId);

  // ── Score every existing cluster in this workspace ───────────────────────
  let bestScore   = -1;
  let bestCluster = null;

  for (const cluster of topicClusters) {
    if (cluster.workspaceId !== wsKey) continue;
    const score = cosineSimilarity(vector, cluster.centroid);
    if (score > bestScore) {
      bestScore   = score;
      bestCluster = cluster;
    }
  }

  // ── Assign to existing cluster if score clears the threshold ────────────
  if (bestCluster && bestScore >= CLUSTER_SIMILARITY_THRESHOLD) {
    bestCluster.centroid    = updateCentroid(bestCluster.centroid, vector, bestCluster.memberCount);
    bestCluster.memberCount += 1;

    console.log(`🔗 [Synapse Engine] Chunk joined cluster "${bestCluster.title}" (score: ${bestScore.toFixed(4)}, members: ${bestCluster.memberCount})`);
    return bestCluster.topicId;
  }

  // ── No match — spawn a new topic cluster ────────────────────────────────
  const newCluster = {
    topicId:     crypto.randomUUID(),
    title:       deriveClusterTitle(text),
    centroid:    [...vector],          // seed centroid = this chunk's vector
    memberCount: 1,
    workspaceId: wsKey,
    createdAt:   new Date().toISOString()
  };

  topicClusters.push(newCluster);

  console.log(`🧬 [Synapse Engine] New topic cluster spawned: "${newCluster.title}" (id: ${newCluster.topicId})`);
  return newCluster.topicId;
}

export { chunkText };

/**
 * Generates a vector embedding array using the GoogleGenAI gemini-embedding-2 model.
 *
 * @param {string} text - Content to vectorize
 * @returns {Promise<number[]>} Float array of size 768
 */
// generateEmbedding is re-exported from embeddingHelpers (shared canonical implementation)
export { generateEmbedding };

/**
 * Chunks raw text, vectorizes each chunk, runs the Synapse Engine cluster resolver,
 * and registers the annotated knowledge node in the global vector database.
 *
 * @param {string|number} workspaceId - Tenant filter key
 * @param {string}        rawText     - Input string payload
 * @param {string}        source      - Origin context e.g. platform / channel
 * @returns {Promise<Object[]>} Registered chunk node objects (with topicId stamped)
 */
export async function storeKnowledge(workspaceId, rawText, source) {
  const chunks        = chunkText(rawText, 500, 100);
  const storedObjects = [];

  for (const chunk of chunks) {
    // ── 1. Generate embedding vector ───────────────────────────────────────
    let vector;
    try {
      vector = await generateEmbedding(chunk);
    } catch (error) {
      if (process.env.NODE_ENV === 'production') {
        console.error(`❌ [Vector Store] Embedding failed in production:`, error.message);
        throw error;
      }
      console.warn(`⚠️ [Vector Store] Embedding failed: ${error.message}. Using normalised random fallback.`);
      vector = new Array(768).fill(0).map(() => Math.random());
      const mag = Math.sqrt(vector.reduce((s, v) => s + v * v, 0));
      vector    = vector.map(v => v / mag);
    }

    // ── 2. Synapse Engine: resolve / create topic cluster ─────────────────
    const topicId = resolveTopicCluster(workspaceId, vector, chunk);

    // ── 3. Build the knowledge node with topicId stamped in metadata ──────
    const node = {
      id:          crypto.randomUUID(),
      workspaceId: String(workspaceId),
      text:        chunk,
      vector,
      source,
      topicId,                           // ← Synapse Engine cluster assignment
      timestamp:   new Date().toISOString()
    };

    vectorDatabase.push(node);
    storedObjects.push(node);
  }

  return storedObjects;
}

/**
 * Vectorizes a query string, filters database records by workspace, computes
 * cosine similarity, and returns the top-K ranked matches.
 *
 * @param {string|number} workspaceId  - Tenant key
 * @param {string}        queryString  - Target query string
 * @param {number}        topK         - Max returned matched chunks
 * @returns {Promise<Object[]>} Ranked results: [{ text, source, topicId, score }]
 */
export async function queryKnowledge(workspaceId, queryString, topK = 3) {
  let queryVector;
  try {
    queryVector = await generateEmbedding(queryString);
  } catch (error) {
    if (process.env.NODE_ENV === 'production') {
      console.error(`❌ [Vector Store] Query embedding failed in production:`, error.message);
      throw error;
    }
    console.warn(`⚠️ [Vector Store] Query embedding failed: ${error.message}. Using normalised random fallback.`);
    queryVector = new Array(768).fill(0).map(() => Math.random());
    const mag   = Math.sqrt(queryVector.reduce((s, v) => s + v * v, 0));
    queryVector = queryVector.map(v => v / mag);
  }

  const workspaceNodes = vectorDatabase.filter(
    node => String(node.workspaceId) === String(workspaceId)
  );

  const scoredMatches = workspaceNodes.map(node => ({
    text:    node.text,
    source:  node.source,
    topicId: node.topicId,
    score:   parseFloat(cosineSimilarity(queryVector, node.vector).toFixed(4))
  }));

  return scoredMatches
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}
