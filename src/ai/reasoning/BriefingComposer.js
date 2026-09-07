/**
 * BriefingComposer (Phase 6.5) — deterministic, evidence-driven operational briefing.
 *
 * The reliability floor for open-ended briefing/risk/situation questions: it builds a
 * useful briefing DIRECTLY from ranked workspace evidence, so FLOW never has to depend on
 * the LLM alone (which can time out / deflect on local inference). The LLM may HUMANIZE
 * this text afterward, but the FACTS come only from here.
 *
 * Generic — no hardcoded entities, no question→answer map. It reads whatever the graph
 * holds (fields discovered at query time) and degrades gracefully when a field is absent.
 * Every line carries provenance (the source node id) and a claim type (EXPLICIT/INFERRED).
 */

import { prisma } from '../../core/config/prisma.js';

const OPEN_INCIDENT = new Set(['open', 'monitoring', 'investigating', 'active', 'ongoing']);
const OPEN_PR       = new Set(['open']);
const BLOCKED_ISSUE = new Set(['blocked']);
const OPEN_ISSUE    = new Set(['todo', 'inprogress', 'in progress', 'in_progress', 'blocked', 'review']);
const DONE          = new Set(['done', 'resolved', 'closed', 'merged', 'completed']);
const SEV_RANK      = { p0: 4, sev0: 4, critical: 4, p1: 3, sev1: 3, high: 3, p2: 2, medium: 2, p3: 1, low: 1 };
const sevScore = (s) => SEV_RANK[String(s || '').toLowerCase()] ?? 0;
const lc = (s) => String(s || '').toLowerCase();

/** Detect a briefing/risk/situation/priorities intent + its flavor. */
export function classifyBriefingIntent(question = '') {
  const q = lc(question);
  if (/\b(brief|briefing|executive summary|short version|the short|rundown|status update|state of)\b/.test(q)
    || /what('?s| is)\s+(going on|happening)\s+(across|in|with|company|the company|everywhere)/.test(q)
    || /\b(operational|delivery)\s+(situation|risk|risks|picture|status)\b/.test(q)
    || /what should i (pay attention to|focus on|know|look at|worry about|be worried about)/.test(q)
    || /what (are|is) the (biggest|main|top) (risk|risks|concern|concerns|issue)/.test(q)
    || /why is (engineering|the company|delivery) at risk/.test(q)
    || /(today'?s|team'?s)\s+priorities|priorities (for )?today/.test(q)
    || /current (situation|picture|state)/.test(q)) {
    let flavor = 'company';
    if (/\bengineering\b|\beng\b|\bdev\b/.test(q)) flavor = 'engineering';
    else if (/\bceo\b|executive|leadership|company/.test(q)) flavor = 'executive';
    else if (/priorit|today|focus/.test(q)) flavor = 'priorities';
    else if (/risk/.test(q)) flavor = 'risk';
    return { isBriefing: true, flavor };
  }
  return { isBriefing: false, flavor: null };
}

const rawId = (id, ws) => String(id).replace(`${ws}:`, '');

/** Gather + rank the real evidence a briefing is built from. Deterministic. */
export async function gatherBriefingEvidence(workspaceId) {
  const ws = String(workspaceId);
  const [incidents, prs, issues, meetings] = await Promise.all([
    prisma.graphNode.findMany({ where: { workspaceId: ws, type: 'INCIDENT' }, select: { id: true, name: true, metadata: true } }).catch(() => []),
    prisma.graphNode.findMany({ where: { workspaceId: ws, type: 'PR' }, select: { id: true, name: true, metadata: true } }).catch(() => []),
    prisma.graphNode.findMany({ where: { workspaceId: ws, type: 'ISSUE' }, select: { id: true, name: true, metadata: true } }).catch(() => []),
    prisma.graphNode.findMany({ where: { workspaceId: ws, type: 'MEETING' }, select: { id: true, name: true, metadata: true } }).catch(() => []),
  ]);

  const openIncidents = incidents
    .filter(n => OPEN_INCIDENT.has(lc(n.metadata?.status)) || !DONE.has(lc(n.metadata?.status)))
    .filter(n => !DONE.has(lc(n.metadata?.status)))
    .map(n => ({ id: rawId(n.id, ws), name: n.name, sev: n.metadata?.severity || null, status: n.metadata?.status || null, owner: n.metadata?.assigned_to || null, commander: n.metadata?.incident_commander || null, _score: sevScore(n.metadata?.severity) + 1 }))
    .sort((a, b) => b._score - a._score);

  const blockedIssues = issues
    .filter(n => BLOCKED_ISSUE.has(lc(n.metadata?.status)))
    .map(n => ({ id: rawId(n.id, ws), name: n.name, priority: n.metadata?.priority || null, status: n.metadata?.status, assignee: n.metadata?.assignee || null, _score: sevScore(n.metadata?.priority) + 2 }));

  const criticalOpenIssues = issues
    .filter(n => sevScore(n.metadata?.priority) >= 3 && OPEN_ISSUE.has(lc(n.metadata?.status)) && !BLOCKED_ISSUE.has(lc(n.metadata?.status)))
    .map(n => ({ id: rawId(n.id, ws), name: n.name, priority: n.metadata?.priority, status: n.metadata?.status, assignee: n.metadata?.assignee || null, _score: sevScore(n.metadata?.priority) }))
    .sort((a, b) => b._score - a._score);

  const openPRs = prs
    .filter(n => OPEN_PR.has(lc(n.metadata?.state)))
    .map(n => ({ id: rawId(n.id, ws), name: n.name, repo: n.metadata?.repo || null, author: n.metadata?.created_by || null, readiness: n.metadata?.merge_readiness ?? null }))
    .sort((a, b) => (a.readiness ?? 100) - (b.readiness ?? 100));

  const mergedPRs = prs
    .filter(n => DONE.has(lc(n.metadata?.state)))
    .map(n => ({ id: rawId(n.id, ws), name: n.name, repo: n.metadata?.repo || null }));

  const doneIssues = issues.filter(n => DONE.has(lc(n.metadata?.status)))
    .map(n => ({ id: rawId(n.id, ws), name: n.name }));

  const now = Date.now();
  const upcomingMeetings = meetings
    .map(n => ({ id: rawId(n.id, ws), name: n.name, start: n.metadata?.start_time || null }))
    .filter(m => m.start && Date.parse(m.start) >= now)
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));

  return { openIncidents, blockedIssues, criticalOpenIssues, openPRs, mergedPRs, doneIssues, upcomingMeetings };
}

const fmtDate = (iso) => { try { const d = new Date(iso); return `${d.getUTCMonth() + 1}/${d.getUTCDate()}/${d.getUTCFullYear()}`; } catch { return iso; } };

/**
 * Compose a deterministic briefing. Returns { text, claims } where claims carry
 * provenance (evidence node ids) and a type (EXPLICIT / INFERRED).
 */
export function composeBriefing(ev, flavor = 'company') {
  const claims = [];
  const add = (claim, ids, type) => claims.push({ claim, evidenceIds: ids, type });
  const lines = [];
  const eng = flavor === 'engineering';

  // ── 🔴 Critical: open incidents (highest severity first) ──
  const crit = ev.openIncidents;
  if (crit.length) {
    lines.push('🔴 Critical');
    for (const i of crit.slice(0, 3)) {
      const bits = [i.sev, i.status].filter(Boolean).join(', ');
      const own = i.owner ? ` Owner ${i.owner}${i.commander ? `, commander ${i.commander}` : ''}.` : '';
      lines.push(`• ${i.name}${bits ? ` (${bits})` : ''}.${own}`);
      add(`${i.id} is open${i.sev ? ` and ${i.sev}` : ''}.`, [i.id], 'EXPLICIT');
    }
  }

  // ── 🟠 Delivery: blocked + critical open issues + aging open PRs ──
  const deliv = [];
  for (const b of ev.blockedIssues.slice(0, 3)) { deliv.push(`• ${b.name} — ${b.priority || ''} ${b.status}${b.assignee ? `, ${b.assignee}` : ''}.`.replace(/\s+/g, ' ')); add(`${b.id} is blocked.`, [b.id], 'EXPLICIT'); }
  for (const c of ev.criticalOpenIssues.slice(0, 3)) { deliv.push(`• ${c.name} — ${c.priority}, ${c.status}${c.assignee ? `, ${c.assignee}` : ''}.`); add(`${c.id} is ${c.priority} and ${c.status}.`, [c.id], 'EXPLICIT'); }
  if (ev.openPRs.length) {
    const lead = ev.openPRs.slice(0, 3).map(p => `${p.name}${p.repo ? ` (${p.repo})` : ''}`).join('; ');
    deliv.push(`• ${ev.openPRs.length} open pull request${ev.openPRs.length === 1 ? '' : 's'} awaiting review: ${lead}.`);
    add(`There are ${ev.openPRs.length} open PRs.`, ev.openPRs.map(p => p.id), 'EXPLICIT');
  }
  if (deliv.length) { lines.push('', '🟠 Delivery'); lines.push(...deliv); }

  // ── 🟢 Progress: merged PRs + done issues ──
  const prog = [];
  if (ev.mergedPRs.length) prog.push(`• ${ev.mergedPRs.length} PR${ev.mergedPRs.length === 1 ? '' : 's'} merged recently.`);
  if (ev.doneIssues.length) prog.push(`• ${ev.doneIssues.length} issue${ev.doneIssues.length === 1 ? '' : 's'} completed.`);
  if (prog.length) { lines.push('', '🟢 Progress'); lines.push(...prog); if (ev.mergedPRs.length) add(`${ev.mergedPRs.length} PRs merged.`, ev.mergedPRs.map(p => p.id), 'EXPLICIT'); }

  // ── 📅 Watch: upcoming meetings (real dates only) ──
  if (ev.upcomingMeetings.length) {
    lines.push('', '📅 Upcoming');
    for (const m of ev.upcomingMeetings.slice(0, 3)) { lines.push(`• ${m.name} — ${fmtDate(m.start)}.`); add(`${m.name} is scheduled ${fmtDate(m.start)}.`, [m.id], 'EXPLICIT'); }
  }

  // ── The main thing to watch (EXPLICIT top signal + clearly-labeled INFERRED note) ──
  let headline = null;
  if (crit.length) {
    headline = `The main thing to watch is ${crit[0].name} — it's ${[crit[0].sev, crit[0].status].filter(Boolean).join(' and ')}.`;
    add(`${crit[0].id} is the top signal.`, [crit[0].id], 'EXPLICIT');
    if (ev.openPRs.length >= 2) { headline += ` There's also a review backlog (${ev.openPRs.length} open PRs), which may add delivery pressure.`; add('review backlog may add delivery pressure', ev.openPRs.map(p => p.id), 'INFERRED'); }
  } else if (ev.blockedIssues.length) {
    headline = `The clearest risk is ${ev.blockedIssues[0].name}, which is blocked.`;
  } else if (ev.openPRs.length) {
    headline = `Nothing is on fire; the main open thread is a review backlog of ${ev.openPRs.length} PRs.`;
  }

  if (!lines.length) {
    return { text: "Nothing critical is standing out right now — no open incidents, blocked work, or aging PRs in the data.", claims: [], empty: true };
  }
  const intro = eng ? "Here's the engineering picture:" : flavor === 'executive' ? "Here's the short version:" : "Here's the current picture:";
  const text = [intro, '', ...lines, '', headline].filter(x => x !== undefined && x !== null).join('\n');
  return { text: text.replace(/\n{3,}/g, '\n\n'), claims, empty: false };
}

export default { classifyBriefingIntent, gatherBriefingEvidence, composeBriefing };
