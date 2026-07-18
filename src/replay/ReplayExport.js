/**
 * ReplayExport — serializes a replay to JSON (full fidelity) or a Markdown
 * narrative ("On [date], [actor] did X → led to Y"). The narrative turns raw
 * frames into a readable story of how events unfolded.
 */

export function exportReplay(replay, format = 'json') {
  if (format === 'markdown' || format === 'md') return toMarkdown(replay);
  return JSON.stringify(replay, null, 2);
}

function toMarkdown(replay) {
  const L = [];
  L.push(`# Workspace Replay — ${replay.mode}`);
  if (replay.span) L.push(`\n**Window:** ${fmt(replay.span.from)} → ${fmt(replay.span.to)} · **${replay.totalEvents} events**\n`);

  const m = replay.metrics;
  if (m) {
    L.push('## Overview');
    L.push(`- Busiest day: ${m.peakPeriod ? `${m.peakPeriod.day} (${m.peakPeriod.count} events)` : 'n/a'}`);
    L.push(`- Top contributors: ${m.topActors.slice(0, 5).map(a => `${a.actor} (${a.count})`).join(', ') || 'n/a'}`);
    if (m.incident?.count) L.push(`- Incidents: ${m.incident.count} (${m.incident.resolved} resolved${m.incident.mttrHours != null ? `, MTTR ${m.incident.mttrHours}h` : ''})`);
    if (m.deployment?.count) L.push(`- Deployments: ${m.deployment.count} (${m.deployment.perWeek}/week)`);
    L.push('');
  }

  L.push('## Timeline');
  for (const f of (replay.timeline?.frames || []).slice(0, 60)) {
    const top = f.events.slice(0, 5).map(e => `${icon(e)} ${e.actor ? e.actor + ': ' : ''}${(e.title || e.eventType).slice(0, 90)}`);
    L.push(`\n**${fmt(f.t)}** — ${f.count} event(s)`);
    for (const t of top) L.push(`- ${t}`);
    if (f.count > 5) L.push(`- …and ${f.count - 5} more`);
  }

  return L.join('\n');
}

function icon(e) {
  return { incident: '🔴', deployment: '🟢', meeting: '🔵', customer: '🟠', approval: '🟡', engineering: '🟣', knowledge: '📄', security: '🔐' }[e.eventType] || '•';
}
function fmt(ts) { try { return new Date(ts).toISOString().replace('T', ' ').slice(0, 16); } catch { return String(ts); } }
