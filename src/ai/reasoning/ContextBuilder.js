/**
 * ContextBuilder — assembles all capability results into a structured context block
 * for the LLM. This is the "FLOW already looked" layer.
 *
 * The LLM receives:
 *   1. What capabilities were queried
 *   2. What data was found (structured, with counts)
 *   3. Key records per capability (top N, formatted)
 *   4. What was NOT found (explicit empty-state facts)
 *
 * The LLM is never asked to speculate about data it doesn't have.
 * If FLOW found 0 PRs, the context says "0 pull requests exist."
 * The LLM synthesises that into natural language — it does not hedge.
 */

import { Capability } from './CapabilityPlanner.js';

/**
 * @param {import('./CapabilityDispatcher.js').CapabilityResults} capabilityResults
 * @param {import('./IntentAnalyzer.js').IntentResult} intent
 * @returns {BuiltContext}
 */
export function buildContext(capabilityResults, intent) {
  const sections = [];
  const rawData  = {};
  const counts   = {};
  let totalRecords = 0;

  for (const [capName, result] of Object.entries(capabilityResults)) {
    if (!result) continue;
    counts[capName] = result.count || 0;
    totalRecords   += counts[capName];
    rawData[capName] = result;

    const section = _buildCapabilitySection(capName, result, intent);
    if (section) sections.push(section);
  }

  const contextBlock = sections.join('\n\n');
  const emptySections = Object.entries(counts)
    .filter(([, c]) => c === 0)
    .map(([cap]) => _emptyStateStatement(cap, intent));

  return {
    contextBlock,
    emptySections,
    counts,
    totalRecords,
    rawData,
    hasData: totalRecords > 0,
    // Flat record list for evidence pipeline compatibility
    flatRecords: Object.values(capabilityResults)
      .flatMap(r => (r?.records || []).map(rec => ({
        type:      'capability',
        capType:   rec.type || r.capability,
        content:   [rec.name, rec.summary].filter(Boolean).join(': ').slice(0, 500),
        score:     rec.importance ? rec.importance : 0.7,
        source:    r.capability,
        authority: _authorityForCapability(r.capability),
        ts:        rec.ts || null,
        metadata:  rec.metadata || {},
      }))),
  };
}

/**
 * Formats the full context block for injection into LLM system prompt.
 * Returns a string the LLM can reason over directly.
 */
export function formatContextForPrompt(builtContext, intent) {
  const lines = [
    `=== YOUR WORKSPACE ===`,
    `Here is what's currently happening across the connected tools and records.`,
    '',
  ];

  if (builtContext.contextBlock) {
    lines.push(builtContext.contextBlock);
  }

  // Explicit empty-state statements — the LLM must use these instead of hedging
  if (builtContext.emptySections.length > 0) {
    lines.push('');
    lines.push('=== NOTHING FOUND (state as facts, do not hedge) ===');
    builtContext.emptySections.forEach(s => lines.push(`• ${s}`));
  }

  lines.push('');
  lines.push('=== END ===');

  // Final safety net: strip internal system vocabulary so even a small local
  // model cannot echo implementation jargon back to the user (RULE 1 / RULE 2).
  return _sanitizeForLLM(lines.join('\n'));
}

// ── Section builders ──────────────────────────────────────────────────────────

function _buildCapabilitySection(capName, result, intent) {
  if (!result?.count || result.count === 0) return null;

  const header  = _capabilityHeader(capName, result);
  const records = (result.records || []).slice(0, 8);

  if (!records.length) return null;

  const lines = [header];

  switch (capName) {
    case Capability.ENGINEERING:
      lines.push(_formatEngineeringRecords(records, result));
      break;
    case Capability.MEETINGS:
      lines.push(_formatMeetingRecords(records, result));
      break;
    case Capability.CUSTOMERS:
      lines.push(_formatCustomerRecords(records, result));
      break;
    case Capability.INCIDENTS:
      lines.push(_formatIncidentRecords(records, result));
      break;
    case Capability.KNOWLEDGE:
      lines.push(_formatKnowledgeRecords(records));
      break;
    case Capability.COMMUNICATIONS:
      lines.push(_formatCommunicationRecords(records));
      break;
    case Capability.TIMELINE:
      lines.push(_formatTimelineRecords(records));
      break;
    case Capability.MEMORY:
      lines.push(_formatMemoryRecords(records, result));
      break;
    case Capability.RECOMMENDATIONS:
      lines.push(_formatRecommendationRecords(records));
      break;
    case Capability.HEALTH:
      lines.push(_formatHealthRecord(result));
      break;
    case Capability.PEOPLE:
      lines.push(_formatPeopleRecords(records, result));
      break;
    case Capability.TRANSCRIPTS:
      lines.push(_formatTranscriptRecords(records));
      break;
    default:
      lines.push(records.slice(0, 5).map(r => `• ${r.name}: ${(r.summary || '').slice(0, 150)}`).join('\n'));
  }

  return lines.filter(Boolean).join('\n');
}

function _liveTag(r) { return r.liveSource ? ` [live from ${r.liveSource}]` : ''; }

// Surface the real author + time so the model cites who did what — never a
// placeholder. For commits/PRs the author lives in the record summary ("repo · author")
// or metadata.author; the timestamp lives in ts.
function _authorTime(r) {
  let author = r.actor || r.author || r.metadata?.author
    || (typeof r.summary === 'string' && r.summary.includes(' · ') ? r.summary.split(' · ').pop().trim() : null);
  if (author && /^(unknown|null|undefined|author not shown)$/i.test(author)) author = null;
  const when = r.ts ? _relTime(r.ts) : null;
  // Include the repo so the model cites the right one — but only if the record's
  // name doesn't already contain it (PR names embed "repo#number").
  const repo = r.metadata?.repo
    || (typeof r.summary === 'string' && r.summary.includes(' · ') ? r.summary.split(' · ')[0].trim() : null);
  const showRepo = repo && !String(r.name || '').includes(repo);
  const bits = [showRepo ? repo : null, author, when].filter(Boolean);
  return bits.length ? ` — ${bits.join(', ')}` : '';
}

function _shortSha(r) {
  const sha = r.sha || r.metadata?.sha || (typeof r.id === 'string' && /^[0-9a-f]{7,40}$/i.test(r.id) ? r.id : null);
  return sha ? ` (${String(sha).slice(0, 7)})` : '';
}

function _relTime(ts) {
  const ms = Date.now() - new Date(ts).getTime();
  if (Number.isNaN(ms)) return null;
  const h = Math.floor(ms / 3600000);
  if (h < 1) return 'just now';
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function _formatEngineeringRecords(records, result) {
  const byType = {};
  records.forEach(r => { byType[r.type] = byType[r.type] || []; byType[r.type].push(r); });
  const parts = [];
  if (byType.REPOSITORY?.length) parts.push(
    `Repositories (${byType.REPOSITORY.length}):\n` +
    byType.REPOSITORY.slice(0, 10).map(r => `  • ${r.name}${r.status ? ` [${r.status}]` : ''}${r.summary ? ': ' + r.summary.slice(0, 100) : ''}${_liveTag(r)}`).join('\n')
  );
  if (byType.PR?.length)     parts.push(
    `Pull Requests (${byType.PR.length}):\n` +
    byType.PR.slice(0, 8).map(r => `  • ${r.name}${r.status ? ` [${r.status}]` : ''}${_authorTime(r)}${_liveTag(r)}`).join('\n')
  );
  if (byType.COMMIT?.length) parts.push(
    `Recent Commits (${byType.COMMIT.length}, most recent first):\n` +
    byType.COMMIT.slice(0, 5).map(r => `  • ${r.name}${_shortSha(r)}${_authorTime(r)}${_liveTag(r)}`).join('\n')
  );
  if (byType.ISSUE?.length)  parts.push(
    `Issues/Tickets (${byType.ISSUE.length}):\n` +
    byType.ISSUE.slice(0, 5).map(r => `  • ${r.name}${r.status ? ` [${r.status}]` : ''}${_liveTag(r)}`).join('\n')
  );
  return parts.join('\n');
}

function _formatMeetingRecords(records, result) {
  return records.slice(0, 8).map(r => {
    const when = r.ts ? new Date(r.ts).toLocaleDateString() : 'date unknown';
    return `  • ${r.name} (${when})${r.status ? ` — ${r.status}` : ''}${_liveTag(r)}`;
  }).join('\n');
}

function _formatCustomerRecords(records, result) {
  const lines = [];
  if (result.totalCustomers) lines.push(`Total customer accounts: ${result.totalCustomers}`);
  records.slice(0, 8).forEach(r => {
    lines.push(`  • ${r.name}${r.status ? ` [${r.status}]` : ''}${r.summary ? ': ' + r.summary.slice(0, 100) : ''}`);
  });
  return lines.join('\n');
}

function _formatIncidentRecords(records, result) {
  const lines = [];
  if (result.activeCount != null) lines.push(`Active incidents: ${result.activeCount} of ${result.count}`);
  records.slice(0, 8).forEach(r => {
    lines.push(`  • [${r.status || 'open'}] ${r.name}${r.summary ? ': ' + r.summary.slice(0, 150) : ''}`);
  });
  return lines.join('\n');
}

function _formatKnowledgeRecords(records) {
  const byType = {};
  records.forEach(r => { byType[r.type] = byType[r.type] || []; byType[r.type].push(r); });
  const parts = [];
  if (byType.ISSUE || byType.SPRINT) {
    const jiraRecords = [...(byType.SPRINT || []), ...(byType.ISSUE || [])];
    parts.push(
      `Jira Issues/Sprints (${jiraRecords.length} live):\n` +
      jiraRecords.slice(0, 8).map(r => `  • ${r.name}${r.status ? ` [${r.status}]` : ''}${r.summary ? ': ' + r.summary.slice(0, 100) : ''}${_liveTag(r)}`).join('\n')
    );
  }
  const docs = records.filter(r => !r.liveSource);
  if (docs.length) {
    parts.push(docs.slice(0, 6).map(r => `  • ${r.name}${r.summary ? ': ' + r.summary.slice(0, 100) : ''}`).join('\n'));
  }
  return parts.join('\n') || records.slice(0, 6).map(r => `  • ${r.name}${r.summary ? ': ' + r.summary.slice(0, 100) : ''}${_liveTag(r)}`).join('\n');
}

function _formatCommunicationRecords(records) {
  const bySource = {};
  records.forEach(r => { const s = r.liveSource || 'memory'; bySource[s] = bySource[s] || []; bySource[s].push(r); });
  const parts = [];
  for (const [src, recs] of Object.entries(bySource)) {
    const label = src === 'gmail' ? 'Gmail' : src === 'slack' ? 'Slack' : src === 'memory' ? 'Knowledge Graph' : src;
    parts.push(
      `${label} (${recs.length}):\n` +
      recs.slice(0, 5).map(r => {
        const when = r.ts ? new Date(r.ts).toLocaleDateString() : '';
        return `  • ${r.name}${when ? ` (${when})` : ''}${r.status ? ` [${r.status}]` : ''}`;
      }).join('\n')
    );
  }
  return parts.join('\n') || records.slice(0, 6).map(r => `  • ${r.name}`).join('\n');
}

function _formatTimelineRecords(records) {
  return records.slice(0, 10).map(r => {
    const when = r.ts ? new Date(r.ts).toLocaleString() : '';
    return `  • [${when}] ${r.name}${r.summary ? ': ' + r.summary.slice(0, 100) : ''}`;
  }).join('\n');
}

function _formatMemoryRecords(records, result) {
  const lines = [];
  if (result.byType) {
    lines.push(`Memory breakdown: ${Object.entries(result.byType).map(([t, c]) => `${c} ${t}`).join(', ')}`);
  }
  records.slice(0, 6).forEach(r => {
    lines.push(`  • [${r.type}] ${r.name}${r.summary ? ': ' + r.summary.slice(0, 120) : ''}`);
  });
  return lines.join('\n');
}

function _formatRecommendationRecords(records) {
  return records.slice(0, 5).map((r, i) =>
    `  ${i + 1}. ${r.name}${r.summary ? ' — ' + r.summary.slice(0, 120) : ''}${r.confidence ? ` (confidence: ${r.confidence}%)` : ''}`
  ).join('\n');
}

function _formatHealthRecord(result) {
  const h = result.health;
  if (!h) return '';
  return [
    `Overall: ${h.company_health}/100`,
    h.sectors ? `Sectors: ${Object.entries(h.sectors).map(([k, v]) => `${k}=${v}`).join(', ')}` : '',
  ].filter(Boolean).join(' | ');
}

function _formatPeopleRecords(records, result) {
  return `Team size: ${result.count} people\n` +
    records.slice(0, 8).map(r => `  • ${r.name}${r.metadata?.role ? ` (${r.metadata.role})` : ''}${r.metadata?.department ? ` — ${r.metadata.department}` : ''}`).join('\n');
}

function _formatTranscriptRecords(records) {
  return records.slice(0, 4).map(r => `  • ${r.name}${r.summary ? ': ' + r.summary.slice(0, 150) : ''}`).join('\n');
}

// ── Empty state statements (honest, factual, no hedging) ─────────────────────

function _emptyStateStatement(cap, intent) {
  const stmts = {
    [Capability.ENGINEERING]:    'No engineering records (PRs, commits, issues) found in this workspace.',
    [Capability.MEETINGS]:       'No meetings or calendar events found in this workspace.',
    [Capability.CUSTOMERS]:      'No customer accounts found in this workspace.',
    [Capability.INCIDENTS]:      'No incidents recorded in this workspace.',
    [Capability.KNOWLEDGE]:      'No documents or knowledge records found in this workspace.',
    [Capability.COMMUNICATIONS]: 'No emails or communication threads found in this workspace.',
    [Capability.TIMELINE]:       'No recent activity in the audit log.',
    [Capability.MEMORY]:         'No decisions or memory records found.',
    [Capability.RECOMMENDATIONS]:'No recommendations generated for this workspace.',
    [Capability.HEALTH]:         'Workspace health score is not available.',
    [Capability.PEOPLE]:         'No team members found in this workspace.',
    [Capability.TRANSCRIPTS]:    'No meeting transcripts found in this workspace.',
  };
  return stmts[cap] || `No data found for capability: ${cap}.`;
}

// Neutralize internal system vocabulary before any of it reaches the LLM. This is
// the last line of defense: record names and labels sometimes carry engine terms
// (e.g. a prediction literally named "…top: BUS_FACTOR"), and a small local model
// will happily parrot them. Map each to plain, user-facing language.
const _JARGON_MAP = [
  [/\bbus[_\s-]?factor\b/gi,          'key-person dependency'],
  [/\borg memory\b/gi,               'company records'],
  [/\bworkspace health\b/gi,         'overall status'],
  [/\bhealth score\b/gi,             'overall status'],
  [/\bvector search\b/gi,            'search'],
  [/\bknowledge graph\b/gi,          'related context'],
  [/\bcapability (?:system|router)s?\b/gi, 'systems'],
  [/\bpredictions?\s*:/gi,           'Outlook:'],
  [/\bcomposite[_\s-]?score\b/gi,    'priority'],
  [/\bfound \d+ record\(s\)/gi,      'here is what stands out'],
  // Raw null/empty score artifacts must never reach the user as "null/100".
  [/\b(?:null|undefined|nan)\s*\/\s*100\b/gi, 'not yet measured'],
  [/\bscore is (?:null|undefined|nan)\b/gi,   'is not yet measured'],
];

export function sanitizeForLLM(text) {
  let out = String(text || '');
  for (const [re, repl] of _JARGON_MAP) out = out.replace(re, repl);
  return out;
}
const _sanitizeForLLM = sanitizeForLLM;

function _capabilityHeader(capName, result) {
  const liveNote = result.liveCount > 0 ? `, ${result.liveCount} live from connector` : '';
  const labels = {
    [Capability.ENGINEERING]:    `Engineering (${result.count} records${liveNote})`,
    [Capability.MEETINGS]:       `Meetings & Calendar (${result.count} events${liveNote})`,
    [Capability.CUSTOMERS]:      `Customer Intelligence (${result.count} records)`,
    [Capability.INCIDENTS]:      `Incidents (${result.count} total${result.activeCount != null ? `, ${result.activeCount} active` : ''})`,
    [Capability.KNOWLEDGE]:      `Knowledge Base (${result.count} documents)`,
    [Capability.COMMUNICATIONS]: `Communications (${result.count} messages${liveNote})`,
    [Capability.TIMELINE]:       `Recent Activity (${result.count} events)`,
    [Capability.MEMORY]:         `Company Records (${result.count})`,
    [Capability.RECOMMENDATIONS]:`Suggested Focus (${result.count})`,
    [Capability.HEALTH]:         `Overall Status`,
    [Capability.PEOPLE]:         `People & Teams (${result.count} members)`,
    [Capability.TRANSCRIPTS]:    `Meeting Transcripts (${result.count} records)`,
  };
  return `--- ${labels[capName] || capName} ---`;
}

function _authorityForCapability(cap) {
  const authority = {
    [Capability.INCIDENTS]:      1.5,
    [Capability.MEMORY]:         1.3,
    [Capability.HEALTH]:         1.3,
    [Capability.ENGINEERING]:    1.2,
    [Capability.CUSTOMERS]:      1.2,
    [Capability.MEETINGS]:       1.0,
    [Capability.KNOWLEDGE]:      1.0,
    [Capability.TIMELINE]:       0.9,
    [Capability.COMMUNICATIONS]: 0.8,
    [Capability.TRANSCRIPTS]:    0.9,
    [Capability.PEOPLE]:         1.0,
    [Capability.RECOMMENDATIONS]:1.1,
  };
  return authority[cap] ?? 1.0;
}
