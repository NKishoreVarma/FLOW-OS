/**
 * EvidenceFormatter — normalizes raw evidence into a consistent, attributable
 * shape and classifies each item by source type (email, meeting, slack, github,
 * jira, document, timeline, graph, memory). Every downstream explanation part
 * reads this normalized form.
 */

const SOURCE_TYPE_RULES = [
  [/gmail|email|mail|outlook|inbox/i, 'EMAIL'],
  [/slack|chat|discord|teams/i,       'SLACK'],
  [/github|git|gitlab|bitbucket|\bpr\b|commit/i, 'GITHUB'],
  [/jira|linear|asana|issue/i,        'JIRA'],
  [/calendar|meeting|event|zoom|meet/i, 'MEETING'],
  [/notion|confluence|drive|doc|vault|wiki|rfc/i, 'DOCUMENT'],
  [/timeline/i,                        'TIMELINE'],
  [/graph|entit|relationship|node/i,   'GRAPH'],
  [/memory|decision|briefing/i,        'MEMORY'],
  [/hubspot|salesforce|crm|customer/i, 'CRM'],
];

export function classifySourceType(source = '', type = '', capType = '') {
  const hay = `${source} ${type} ${capType}`.toLowerCase();
  for (const [re, label] of SOURCE_TYPE_RULES) if (re.test(hay)) return label;
  return 'OTHER';
}

function daysSince(ts) {
  const t = new Date(ts).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.round((Date.now() - t) / 86_400_000));
}

/**
 * @param {Array} rawEvidence items: { ref?, type, capType, source, content, score, authority, ts, metadata }
 * @returns {Array} normalized evidence
 */
export function formatEvidence(rawEvidence = []) {
  return (rawEvidence || []).map((e, i) => {
    const ts = e.ts || e.timestamp || e.created_at || null;
    return {
      ref:        e.ref || `E${i + 1}`,
      sourceType: classifySourceType(e.source, e.type, e.capType),
      source:     e.source || e.capType || 'unknown',
      content:    String(e.content || e.text || '').slice(0, 400),
      score:      Number.isFinite(e.score) ? +Number(e.score).toFixed(3) : null,
      authority:  Number.isFinite(e.authority) ? e.authority : 1.0,
      ts,
      freshnessDays: ts ? daysSince(ts) : null,
      actor:      e.actor || e.metadata?.sender || e.metadata?.author || null,
    };
  });
}

/** Aggregate freshness signal over a formatted evidence set. */
export function summarizeFreshness(formatted = []) {
  const dated = formatted.filter(e => e.freshnessDays != null);
  if (!dated.length) return { known: false, avgDays: null, staleCount: 0, freshest: null };
  const avg = dated.reduce((s, e) => s + e.freshnessDays, 0) / dated.length;
  return {
    known: true,
    avgDays: Math.round(avg),
    staleCount: dated.filter(e => e.freshnessDays > 30).length,
    freshest: Math.min(...dated.map(e => e.freshnessDays)),
    undatedCount: formatted.length - dated.length,
  };
}
