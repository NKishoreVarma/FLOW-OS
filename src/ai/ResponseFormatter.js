/**
 * ResponseFormatter — normalises provider-specific responses into a consistent
 * shape for FLOW API endpoints.
 *
 * The frontend and Brain services never inspect provider-level fields.
 * They consume the normalised format produced here.
 */

/**
 * Format a copilot response for the /api/brain/copilot endpoint.
 */
export function formatCopilotResponse({ aiResponse, evidence = [], chunks = [] }) {
  const { text, provider, model, latencyMs, usedFallback } = aiResponse;
  const sources = [...new Set(
    chunks.map(c => c.source || c.metadata?.source || c.channel || 'workspace')
  )].slice(0, 5);

  return {
    answer:   text,
    evidence,
    confidence: _scoreConfidence(chunks.length, usedFallback),
    suggestedActions: [],
    sources,
    _meta: { provider, model, latencyMs, usedFallback: usedFallback ?? false },
  };
}

/**
 * Format a briefing aiNarrative string.
 * Strips any accidental markdown headers that confuse the frontend card.
 */
export function formatNarrative(aiResponse) {
  if (!aiResponse?.text) return null;
  return aiResponse.text
    .replace(/^#{1,3}\s+/gm, '')   // strip leading #
    .replace(/\*\*/g, '')           // strip bold markers
    .trim();
}

/**
 * Format a classification response — expects JSON from the LLM.
 * Falls back to heuristic if LLM returns malformed output.
 */
export function formatClassification(aiResponse, fallbackCategory = 'OPERATIONAL_INTEL') {
  try {
    const raw  = aiResponse.text.replace(/```json?|```/g, '').trim();
    const data = JSON.parse(raw);
    if (data.category) return data;
  } catch { /* fall through */ }

  // Heuristic fallback
  const lower = aiResponse.text.toLowerCase();
  if (lower.includes('private') || lower.includes('personal')) {
    return { category: 'PRIVATE_PERSONAL', confidence: 0.7, reasoning: 'heuristic' };
  }
  if (lower.includes('social') || lower.includes('schedule') || lower.includes('greeting')) {
    return { category: 'SOCIAL_COORDINATION', confidence: 0.7, reasoning: 'heuristic' };
  }
  return { category: fallbackCategory, confidence: 0.6, reasoning: 'heuristic-default' };
}

/**
 * Format a streaming event for WebSocket or SSE delivery.
 */
export function formatStreamChunk(delta, meta = {}) {
  return { type: 'delta', text: delta, ...meta };
}

export function formatStreamDone(fullText, meta = {}) {
  return { type: 'done', text: fullText, ...meta };
}

// ── Internal ─────────────────────────────────────────────────────────────────

function _scoreConfidence(chunkCount, usedFallback) {
  if (usedFallback) return Math.min(55, 35 + chunkCount * 4);
  if (chunkCount === 0) return 10;
  return Math.min(95, 60 + chunkCount * 5);
}
