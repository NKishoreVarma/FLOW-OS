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
    `=== FLOW WORKSPACE DATA ===`,
    `FLOW queried ${Object.keys(builtContext.counts).length} capability systems and found ${builtContext.totalRecords} records.`,
    '',
  ];

  if (builtContext.contextBlock) {
    lines.push(builtContext.contextBlock);
  }

  // Explicit empty-state statements — the LLM must use these instead of hedging
  if (builtContext.emptySections.length > 0) {
    lines.push('');
    lines.push('=== EMPTY STATES (state as facts, do not hedge) ===');
    builtContext.emptySections.forEach(s => lines.push(`• ${s}`));
  }

  lines.push('');
  lines.push('=== END FLOW DATA ===');

  return lines.join('\n');
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

function _formatEngineeringRecords(records, result) {
  const byType = {};
  records.forEach(r => { byType[r.type] = (byType[r.type] || []); byType[r.type].push(r); });
  const parts = [];
  if (byType.PR?.length)     parts.push(`Pull Requests (${byType.PR.length}):\n` + byType.PR.slice(0, 5).map(r => `  • ${r.name}${r.status ? ` [${r.status}]` : ''}`).join('\n'));
  if (byType.COMMIT?.length) parts.push(`Recent Commits (${byType.COMMIT.length}):\n` + byType.COMMIT.slice(0, 5).map(r => `  • ${r.name}`).join('\n'));
  if (byType.ISSUE?.length)  parts.push(`Issues/Tickets (${byType.ISSUE.length}):\n` + byType.ISSUE.slice(0, 5).map(r => `  • ${r.name}${r.status ? ` [${r.status}]` : ''}`).join('\n'));
  return parts.join('\n');
}

function _formatMeetingRecords(records, result) {
  return records.slice(0, 8).map(r => {
    const when = r.ts ? new Date(r.ts).toLocaleDateString() : 'date unknown';
    return `  • ${r.name} (${when})${r.status ? ` — ${r.status}` : ''}`;
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
  return records.slice(0, 6).map(r => `  • ${r.name}${r.summary ? ': ' + r.summary.slice(0, 100) : ''}`).join('\n');
}

function _formatCommunicationRecords(records) {
  return records.slice(0, 6).map(r => {
    const when = r.ts ? new Date(r.ts).toLocaleDateString() : '';
    return `  • ${r.name}${when ? ` (${when})` : ''}`;
  }).join('\n');
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

function _capabilityHeader(capName, result) {
  const labels = {
    [Capability.ENGINEERING]:    `Engineering (${result.count} records — PRs, commits, issues)`,
    [Capability.MEETINGS]:       `Meetings & Calendar (${result.count} events)`,
    [Capability.CUSTOMERS]:      `Customer Intelligence (${result.count} records)`,
    [Capability.INCIDENTS]:      `Incidents (${result.count} total${result.activeCount != null ? `, ${result.activeCount} active` : ''})`,
    [Capability.KNOWLEDGE]:      `Knowledge Base (${result.count} documents)`,
    [Capability.COMMUNICATIONS]: `Communications (${result.count} messages)`,
    [Capability.TIMELINE]:       `Recent Activity (${result.count} events)`,
    [Capability.MEMORY]:         `Org Memory (${result.count} records)`,
    [Capability.RECOMMENDATIONS]:`Recommendations (${result.count} items)`,
    [Capability.HEALTH]:         `Workspace Health`,
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
