/**
 * Normalize governed tool observations into the EvidenceItem shape that the
 * existing EvidenceRanker.rankEvidence() consumes — so the agent-gathered
 * evidence flows into the exact same verification pipeline as the brain's own.
 *
 * Provenance is preserved on every item and is FLOW-stamped (never model-authored).
 */

/** Entity-id patterns present in the Helios dataset (project/person/repo/pr/incident/jira). */
const ID_PATTERNS = [
  /\b(?:PROJECT|PROJ)-[A-Za-z0-9]+\b/g,
  /\bemp-\d{3}\b/g,
  /\brepo-[a-z]+-[a-z]+\b/g,
  /\bpr-repo-[a-z-]+-\d+\b/gi,
  /\bincident-[A-Za-z0-9-]+\b/gi,
  /\b(?:HPLT|HANA|HCON|HGRD)-\d+\b/g,
  /\b[A-Z][A-Z0-9]+-\d+\b/g,          // generic KEY-123
];

/**
 * Convert one gateway observation into evidence items.
 * @param {{ toolName, data, provenance }} obs
 * @returns {import('./types.js').EvidenceItem[]}
 */
export function observationToEvidence(obs) {
  if (!obs || obs.ok === false || obs.data == null) return [];
  const { toolName, data, provenance } = obs;
  const items = [];

  if (toolName === 'get_entity') {
    // getRelatedContext() → array of context strings (graph neighbours).
    const rows = Array.isArray(data) ? data : [data];
    for (const row of rows) {
      const content = typeof row === 'string' ? row : (row?.content ?? JSON.stringify(row));
      if (!content || content.trim().length < 3) continue;
      items.push({
        type:      'entity',
        content:   String(content),
        source:    'graph',
        score:     0.6,
        authority: 1.2,
        provenance: { ...provenance, sourceId: provenance?.entityId ?? null },
      });
    }
    return items;
  }

  // search_workspace / any retrieval tool → array of chunks. Retrieval has several
  // shapes (vector rows, vault fallback, RRF-merged output) — accept them all.
  const rows = Array.isArray(data) ? data : [data];
  for (const chunk of rows) {
    if (chunk == null) continue;
    let content;
    if (typeof chunk === 'string') {
      content = chunk;
    } else {
      // Normalized connector results (createSearchResult/createWorkItem) carry
      // title + excerpt/description rather than a single content field.
      const parts = [chunk.title, chunk.excerpt ?? chunk.snippet ?? chunk.description]
        .filter(v => v && String(v).trim());
      content = chunk.content ?? chunk.text ?? chunk.markdown ?? (parts.length ? parts.join(' — ') : '');
    }
    if (!content || String(content).trim().length < 10) continue;
    items.push({
      type:      'rag',
      content:   String(content),
      source:    chunk.source ?? chunk.connector ?? chunk.platform ?? 'workspace',
      score:     Number(chunk.score ?? chunk.weightedScore) || 0.5,
      authority: Number(chunk.authority ?? chunk.authorityCoeff) || 1.0,
      ts:        chunk.ts ?? chunk.timestamp ?? chunk.createdAt ?? null,
      provenance: { ...provenance, sourceId: chunk.id ?? chunk.key ?? chunk.chunkId ?? null },
    });
  }
  return items;
}

/**
 * Extract candidate entity IDs to explore next (for a get_entity hop), most
 * distinctive first. Only IDs that actually appear in gathered evidence — the
 * loop never invents an entity to look up.
 * @param {import('./types.js').EvidenceItem[]} evidenceItems
 * @param {string} question
 * @returns {string[]}
 */
export function extractEntityCandidates(evidenceItems, question = '') {
  const haystack = [question, ...evidenceItems.map(e => e.content)].join('\n');
  const found = new Set();
  for (const re of ID_PATTERNS) {
    const matches = haystack.match(re) || [];
    for (const m of matches) found.add(m);
  }
  return [...found];
}
