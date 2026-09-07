/**
 * EvidenceRanker — ranks evidence by relevance, authority, and recency
 * then deduplicates and groups into tiers for the reasoning engine.
 *
 * Score formula:
 *   ranked_score = (semantic_score × 0.40) + (authority × 0.35) + (recency × 0.15) + (type_boost × 0.10)
 */

/**
 * @param {import('./EvidenceCollector.js').EvidenceSet} evidenceSet
 * @param {import('./IntentAnalyzer.js').IntentResult} intent
 * @returns {RankedEvidence}
 */
export function rankEvidence(evidenceSet, intent) {
  const all = [
    ...evidenceSet.rag,
    ...evidenceSet.memory,
    ...evidenceSet.entities,
    ...evidenceSet.timeline,
  ];

  if (!all.length) {
    return { primary: [], supporting: [], context: [], total: 0, health: evidenceSet.health };
  }

  const now       = Date.now();
  const typeBoost = _buildTypeBoost(intent.domain, intent.questionType);

  const scored = all
    .filter(e => e.content?.trim().length > 10)
    .map(e => {
      const semantic  = Math.min(1, Math.max(0, e.score || 0));
      const authority = Math.min(1, Math.max(0, (e.authority || 1.0) / 1.5));
      const recency   = _recencyScore(e.ts, now);
      const boost     = typeBoost[e.type] ?? 0;

      const rankedScore =
        semantic  * 0.40 +
        authority * 0.35 +
        recency   * 0.15 +
        boost     * 0.10;

      return { ...e, rankedScore };
    })
    .sort((a, b) => b.rankedScore - a.rankedScore);

  // Deduplicate by content similarity (simple prefix match)
  const deduplicated = _deduplicate(scored);

  return {
    primary:    deduplicated.slice(0, 5),    // Top 5 — directly quoted in response
    supporting: deduplicated.slice(5, 12),   // Next 7 — used in reasoning
    context:    deduplicated.slice(12, 20),  // Background — used in action planning
    total:      deduplicated.length,
    health:     evidenceSet.health,
  };
}

/**
 * @param {RankedEvidence} ranked
 * @returns {string} Formatted evidence block for LLM prompt
 */
export function formatEvidenceForPrompt(ranked) {
  const lines = [];

  if (ranked.primary.length) {
    lines.push('=== PRIMARY EVIDENCE ===');
    ranked.primary.forEach((e, i) => {
      lines.push(`[E${i + 1}] (${e.type}, score=${e.rankedScore.toFixed(2)}, source=${e.source})`);
      lines.push(e.content.slice(0, 500));
    });
  }

  if (ranked.supporting.length) {
    lines.push('=== SUPPORTING EVIDENCE ===');
    ranked.supporting.forEach((e, i) => {
      lines.push(`[S${i + 1}] (${e.type}, source=${e.source}): ${e.content.slice(0, 200)}`);
    });
  }

  if (ranked.health) {
    lines.push('=== WORKSPACE HEALTH ===');
    lines.push(JSON.stringify(ranked.health, null, 0).slice(0, 300));
  }

  return lines.join('\n');
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _recencyScore(ts, now) {
  if (!ts) return 0.5;
  const ageMs    = now - new Date(ts).getTime();
  const ageHours = ageMs / (1000 * 60 * 60);
  if (ageHours < 24)  return 1.0;
  if (ageHours < 168) return 0.75; // 1 week
  if (ageHours < 720) return 0.50; // 1 month
  return 0.25;
}

function _buildTypeBoost(domain, questionType) {
  // memory is most authoritative for decisions/incidents
  const boosts = { rag: 0.5, memory: 0.7, entity: 0.4, timeline: 0.6 };

  if (domain === 'incidents')  boosts.memory   = 1.0;
  if (domain === 'engineering') boosts.rag     = 0.8;
  if (questionType === 'attribution') boosts.memory = 0.9;
  if (questionType === 'diagnostic')  { boosts.timeline = 0.9; boosts.memory = 0.9; }

  return boosts;
}

function _deduplicate(scored) {
  const seen = new Set();
  return scored.filter(e => {
    const key = e.content.trim().slice(0, 80);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
