/**
 * FLOW OS — Critic Agent
 *
 * Second stage of the Multi-Agent Reasoning pipeline.
 * Evaluates the merged context node array produced by the retrieval layer and:
 *
 *   1. Detects TEMPORAL CONTRADICTIONS — flags when a newer chunk explicitly
 *      overrides state described in an older chunk (e.g. "project delayed" in
 *      vault vs. "project on track" in a Slack message from the same day).
 *
 *   2. Detects AUTHORITY CONFLICTS — flags when a low-authority source (Slack,
 *      chat) contradicts a high-authority source (Obsidian Vault, GitHub commit)
 *      on the same topic keyword cluster.
 *
 *   3. DEPRECATES stale chunks — any node whose content is overridden by a
 *      contradicting higher-authority node receives `deprecated: true` and a
 *      `deprecationReason` field so ExecutiveSynthesisAgent can discard it.
 *
 * Output shape:
 *   {
 *     validatedChunks:  Array<ContextNode & { deprecated: boolean, deprecationReason?: string }>,
 *     contradictions:   Array<{ challenger: ContextNode, incumbent: ContextNode, topic: string }>,
 *     criticSummary:    string,    // human-readable evaluation notes
 *   }
 */

// ── Authority tier helpers ────────────────────────────────────────────────────

const HIGH_AUTHORITY_SOURCES = ['vault', 'vault_fallback', 'github', 'obsidian', 'git'];
const LOW_AUTHORITY_SOURCES  = ['slack', 'chat', 'discord', 'sms', 'unknown', 'vector_store'];

/**
 * Returns a numeric authority tier for a chunk.
 * High = 2, Standard = 1, Low = 0
 * @param {Object} chunk
 * @returns {number}
 */
function authorityTier(chunk) {
  const src = String(chunk.source || '').toLowerCase();
  if (HIGH_AUTHORITY_SOURCES.some(s => src.includes(s))) return 2;
  if (LOW_AUTHORITY_SOURCES.some(s => src.includes(s)))  return 0;
  return 1;
}

// ── Contradiction keyword clusters ───────────────────────────────────────────
// Each cluster defines a topic and two opposing signal sets.
// If chunk A contains a `positive` signal and chunk B contains a `negative`
// signal for the same cluster, they are marked as contradictory.

const CONTRADICTION_CLUSTERS = [
  {
    topic: 'project_timeline',
    positive: ['on track', 'on schedule', 'ahead of schedule', 'completed', 'shipped', 'launched'],
    negative: ['delayed', 'delay', 'postponed', 'blocked', 'behind schedule', 'slipped'],
  },
  {
    topic: 'system_health',
    positive: ['stable', 'healthy', 'operational', 'running', 'up', 'deployed successfully'],
    negative: ['outage', 'down', 'broken', 'crashed', 'incident', 'degraded', 'unresponsive'],
  },
  {
    topic: 'infrastructure_migration',
    positive: ['migration complete', 'migrated', 'new system', 'switched over'],
    negative: ['migration pending', 'not migrated', 'still on old', 'rollback'],
  },
  {
    topic: 'feature_availability',
    positive: ['feature released', 'live', 'available', 'enabled', 'rolled out'],
    negative: ['not released', 'disabled', 'rolled back', 'removed', 'deprecated'],
  },
  {
    topic: 'security_posture',
    positive: ['patched', 'secure', 'resolved', 'fixed', 'cleared'],
    negative: ['vulnerable', 'exposed', 'breach', 'compromised', 'unpatched'],
  },
];

// ── Temporal heuristic ────────────────────────────────────────────────────────

/**
 * Extracts an ISO date string from a chunk's text or title metadata, if present.
 * Used to determine which of two contradicting chunks is more recent.
 * @param {Object} chunk
 * @returns {Date|null}
 */
function extractDate(chunk) {
  const haystack = (chunk.text || '') + ' ' + (chunk.title || '');
  const isoMatch = haystack.match(/\d{4}-\d{2}-\d{2}T[\d:.\-Z]+/);
  if (isoMatch) return new Date(isoMatch[0]);
  const dateMatch = haystack.match(/\d{4}-\d{2}-\d{2}/);
  if (dateMatch) return new Date(dateMatch[0]);
  return null;
}

// ── Core contradiction checker ────────────────────────────────────────────────

/**
 * Scans all chunk pairs for semantic contradictions within the same topic cluster.
 *
 * @param {Object[]} chunks — normalised context nodes
 * @returns {{
 *   contradictions: Array<{challenger: Object, incumbent: Object, topic: string}>,
 *   flagged: Set<number>   // indices of chunks marked deprecated
 * }}
 */
function detectContradictions(chunks) {
  const contradictions = [];
  const flagged = new Map(); // index → reason

  for (let i = 0; i < chunks.length; i++) {
    for (let j = i + 1; j < chunks.length; j++) {
      const a = chunks[i];
      const b = chunks[j];
      const textA = (a.text || '').toLowerCase();
      const textB = (b.text || '').toLowerCase();

      for (const cluster of CONTRADICTION_CLUSTERS) {
        const aPositive = cluster.positive.some(s => textA.includes(s));
        const aNegative = cluster.negative.some(s => textA.includes(s));
        const bPositive = cluster.positive.some(s => textB.includes(s));
        const bNegative = cluster.negative.some(s => textB.includes(s));

        // Only flag if one is clearly positive and the other clearly negative
        const aVsB = (aPositive && bNegative);
        const bVsA = (aNegative && bPositive);

        if (!aVsB && !bVsA) continue;

        // Determine which chunk is the challenger (lower authority / older)
        const tierA = authorityTier(a);
        const tierB = authorityTier(b);
        const dateA = extractDate(a);
        const dateB = extractDate(b);

        let deprecateIdx = i;  // default: deprecate A
        let reason = '';

        if (tierA !== tierB) {
          // Authority difference: deprecate the lower-authority chunk
          deprecateIdx = tierA < tierB ? i : j;
          reason = `Overridden by higher-authority source (${chunks[j === deprecateIdx ? i : j].source}) on topic [${cluster.topic}]`;
        } else if (dateA && dateB) {
          // Same authority: deprecate the older chunk
          deprecateIdx = dateA < dateB ? i : j;
          reason = `Superseded by more recent chunk (${chunks[j === deprecateIdx ? i : j].title || 'unknown'}) on topic [${cluster.topic}]`;
        } else {
          // Fallback: deprecate the one with the lower weighted score
          deprecateIdx = (a.score * (a.authorityCoeff || 1)) < (b.score * (b.authorityCoeff || 1)) ? i : j;
          reason = `Deprecated due to lower weighted score on topic [${cluster.topic}]`;
        }

        if (!flagged.has(deprecateIdx)) {
          flagged.set(deprecateIdx, reason);
        }

        contradictions.push({
          topic:      cluster.topic,
          challenger: chunks[deprecateIdx],
          incumbent:  chunks[deprecateIdx === i ? j : i],
          reason,
        });

        break; // one cluster match per pair is enough
      }
    }
  }

  return { contradictions, flagged };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Evaluates the context node array for temporal contradictions and authority
 * conflicts, deprecates stale/low-authority nodes, and returns a validated set.
 *
 * @param {Object[]} chunks     — merged, deduplicated context nodes from retrieval
 * @param {string}   queryText  — original query (used for focused analysis logging)
 * @returns {{
 *   validatedChunks: Object[],
 *   contradictions:  Object[],
 *   criticSummary:   string,
 * }}
 */
export function evaluateContext(chunks, queryText) {
  if (!Array.isArray(chunks) || chunks.length === 0) {
    return {
      validatedChunks: [],
      contradictions:  [],
      criticSummary:   'No context nodes to evaluate.',
    };
  }

  console.log(`🔬 [CriticAgent] Evaluating ${chunks.length} context node(s) for query: "${(queryText || '').substring(0, 60)}"`);

  const { contradictions, flagged } = detectContradictions(chunks);

  // Annotate chunks with deprecation metadata
  const validatedChunks = chunks.map((chunk, idx) => {
    if (flagged.has(idx)) {
      return {
        ...chunk,
        deprecated:        true,
        deprecationReason: flagged.get(idx),
      };
    }
    return { ...chunk, deprecated: false };
  });

  // Build human-readable critic summary
  const activeCount     = validatedChunks.filter(c => !c.deprecated).length;
  const deprecatedCount = flagged.size;
  const lines = [];

  lines.push(`CriticAgent evaluated ${chunks.length} node(s): ${activeCount} validated, ${deprecatedCount} deprecated.`);

  if (contradictions.length > 0) {
    lines.push(`\nContradictions detected (${contradictions.length}):`);
    for (const c of contradictions) {
      lines.push(
        `  • Topic [${c.topic}]: ` +
        `"${(c.challenger.title || c.challenger.source || '?').substring(0, 40)}" ` +
        `deprecated — ${c.reason}`
      );
    }
  } else {
    lines.push('No contradictions found — all nodes consistent.');
  }

  const criticSummary = lines.join('\n');

  console.log(`🔬 [CriticAgent] ${activeCount} valid / ${deprecatedCount} deprecated | ${contradictions.length} contradiction(s) found.`);

  return { validatedChunks, contradictions, criticSummary };
}
