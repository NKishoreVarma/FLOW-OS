/**
 * Confidence Scorer — computes and decays confidence values for KG nodes and edges.
 *
 * Confidence model:
 *   Node confidence — based on source reliability + field completeness
 *   Edge confidence — based on observation count, source, and recency
 *   Path confidence — product of edge confidences along a traversal path
 *
 * All functions are pure (no I/O). Decays are applied by the sync layer.
 */

// ── Source reliability weights ────────────────────────────────────────────────

const SOURCE_RELIABILITY = {
  // Authoritative / strongly-typed systems
  'github':          0.95,
  'jira':            0.95,
  'google-calendar': 0.90,
  'gmail':           0.80,
  'slack':           0.75,
  'notion':          0.85,
  'confluence':      0.85,
  'hubspot':         0.88,
  'salesforce':      0.90,
  'workday':         0.93,
  'bamboohr':        0.93,
  // Internal FLOW-generated
  'flow':            0.85,
  'internal':        0.80,
  // Inferred / derived
  'inferred':        0.65,
};

const DEFAULT_SOURCE_RELIABILITY = 0.70;

export function sourceReliability(source) {
  return SOURCE_RELIABILITY[source?.toLowerCase()] ?? DEFAULT_SOURCE_RELIABILITY;
}

// ── Node confidence ───────────────────────────────────────────────────────────

/**
 * Score a node's confidence based on source reliability and field completeness.
 * @param {{ source?: string, name?: string, description?: string, properties?: object }} node
 * @returns {number} 0–1
 */
export function scoreNode(node) {
  const sourceFactor = sourceReliability(node.source);

  // Completeness: reward filled-in optional fields
  let completeness = 0.6; // baseline for having name + externalId
  if (node.description)                           completeness += 0.10;
  if (node.display_name || node.displayName)      completeness += 0.05;
  const props = node.properties ?? {};
  const propCount = Object.keys(props).length;
  if (propCount >= 3)  completeness += 0.15;
  else if (propCount >= 1) completeness += 0.08;
  completeness = Math.min(completeness, 1.0);

  return round2(sourceFactor * completeness);
}

// ── Edge confidence ───────────────────────────────────────────────────────────

/**
 * Score an edge's confidence based on observation count, source, and age.
 * @param {{ observation_count?: number, source_system?: string, last_observed_at?: Date|string }} edge
 * @returns {number} 0–1
 */
export function scoreEdge(edge) {
  const obs     = edge.observation_count ?? 1;
  const source  = edge.source_system ?? edge.source;
  const lastObs = edge.last_observed_at ? new Date(edge.last_observed_at) : new Date();

  // Observation-based confidence (logarithmic growth, caps at 0.95)
  const obsFactor = Math.min(0.95, 0.5 + 0.15 * Math.log10(Math.max(1, obs)));

  // Source reliability
  const srcFactor = sourceReliability(source);

  // Recency decay (edges not observed in > 90 days lose confidence)
  const daysSinceObs = (Date.now() - lastObs.getTime()) / (1000 * 60 * 60 * 24);
  const recencyFactor = daysSinceObs <= 90
    ? 1.0
    : Math.max(0.4, 1.0 - 0.006 * (daysSinceObs - 90)); // -0.6% per day after 90d

  return round2(obsFactor * srcFactor * recencyFactor);
}

/**
 * Apply time-based confidence decay to an existing edge score.
 * Called during sync when an edge was not re-observed.
 *
 * @param {number} currentConfidence — current edge confidence (0–1)
 * @param {Date}   lastObservedAt
 * @returns {number} decayed confidence
 */
export function decayEdgeConfidence(currentConfidence, lastObservedAt) {
  const days = (Date.now() - new Date(lastObservedAt).getTime()) / (1000 * 60 * 60 * 24);
  if (days <= 30) return currentConfidence;
  // Exponential decay: half-life of 180 days
  const decayed = currentConfidence * Math.pow(0.5, (days - 30) / 180);
  return round2(Math.max(0.1, decayed));
}

// ── Path confidence ───────────────────────────────────────────────────────────

/**
 * Compute the confidence of a traversal path as the product of edge confidences.
 * A path with no edges has confidence 1.0.
 *
 * @param {number[]} edgeConfidences
 * @returns {number} 0–1
 */
export function computePathConfidence(edgeConfidences) {
  if (!edgeConfidences.length) return 1.0;
  return round2(edgeConfidences.reduce((acc, c) => acc * c, 1.0));
}

// ── Score update for upsert ───────────────────────────────────────────────────

/**
 * Compute the updated confidence for an edge that is being re-observed.
 * Each new observation increases confidence slightly (bounded).
 *
 * @param {number} currentConfidence
 * @param {number} newObservationCount — AFTER increment
 * @param {string|null} sourceSystem
 * @returns {number}
 */
export function edgeReobservationConfidence(currentConfidence, newObservationCount, sourceSystem) {
  const src = sourceReliability(sourceSystem);
  const obsFactor = Math.min(0.97, 0.5 + 0.15 * Math.log10(Math.max(1, newObservationCount)));
  // Blend current + new observation signal
  const newScore = obsFactor * src;
  return round2(Math.min(0.99, (currentConfidence * 0.7) + (newScore * 0.3)));
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function round2(n) {
  return Math.round(n * 100) / 100;
}
