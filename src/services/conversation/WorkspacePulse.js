/**
 * WorkspacePulse — the proactive, connector-first opening of every conversation.
 *
 * When a user greets FLOW ("hi", "hello", "good morning"), FLOW must prove it
 * understands the workspace BEFORE the user asks anything. It inspects the LIVE
 * connectors that are actually connected — GitHub, Gmail, Google Calendar — plus
 * the incident engine, and greets with real, cited activity. It never fabricates.
 *
 * Tool priority is strict: connectors first. Memory/vector/prediction jargon is
 * NEVER surfaced here — this is the Chief-of-Staff voice, not an implementation dump.
 */

import { getConnector }            from '../../connectors/registry.js';
import { ActionType }              from '../../connectors/capabilities.js';
import { listConnectedConnectors } from '../../connectors/authManager.js';
import { getRecentIncidents }      from '../incidentEngine.js';

// ── Greeting detection ─────────────────────────────────────────────────────────
// Plain openers the reasoning pipeline should never touch. Kept deliberately tight
// so a real question ("what's my latest repo?") is never mistaken for a greeting.
const GREETING_RE = /^(?:hi+|hey+|hello+|helo+|yo+|sup|heyya?|howdy|hiya|good\s+(?:morning|afternoon|evening)|morning|afternoon|evening|greetings|what'?s\s+up|wassup|whats\s+good|gm)(?:\s+(?:there|flow))?[\s.!?]*$/i;

export function isGreeting(text) {
  return GREETING_RE.test(String(text || '').trim());
}

// Vague, antecedent-less commands ("do that for me", "do it", "make it happen").
// These reference nothing, so reasoning over the workspace produces a confusing
// "not enough activity" answer. Better to ask what, specifically.
const VAGUE_RE = /^(?:do that(?:\s+for me)?|(?:do|make|get|handle|fix|finish|sort)\s+(?:it|that|this)(?:\s+(?:for me|out))?|go ahead(?:\s+and do it)?|just do it|make it happen|proceed)[\s.!?]*$/i;

export function isVague(text) {
  return VAGUE_RE.test(String(text || '').trim());
}

// Confirmation of a pending offer ("yeah do it", "go ahead", "send it", "approve").
// When one arrives WITH prior conversation, FLOW carries out what it just offered
// instead of re-answering the previous question.
const CONFIRM_RE = /^(?:ye(?:s|ah|p|a)?|yup|sure|ok(?:ay)?|go ahead|go for it|do it|yeah do it|do that|please do|send it|send that|send|approve(?:d)?|confirm(?:ed)?|proceed|make it happen)[\s!.]*$/i;

export function isConfirmation(text) {
  return CONFIRM_RE.test(String(text || '').trim());
}

export function vagueClarification() {
  return {
    text: "Happy to — what would you like me to do? Give me the specific action and I'll take it. For example:\n\n• \"Reply to the latest email from Acme\"\n• \"Create a Jira ticket for the login bug\"\n• \"Merge the ready pull request in flow-os-backend\"\n• \"Draft a Slack message that the deploy is done\"",
    suggestions: ["Show today's pull requests", "Summarize my unread email", "What should I focus on?"],
  };
}

// ── Time helpers ────────────────────────────────────────────────────────────────
function timeGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function minutesUntil(iso) {
  if (!iso) return null;
  const diff = new Date(iso).getTime() - Date.now();
  return Math.round(diff / 60000);
}

function withinHours(iso, hours) {
  if (!iso) return false;
  return Date.now() - new Date(iso).getTime() <= hours * 3600 * 1000;
}

// ── Live connector pulse ─────────────────────────────────────────────────────────
/**
 * Inspect the connected tools and return a structured snapshot of recent activity.
 * Every field is best-effort; a failing connector never breaks the greeting.
 *
 * @returns {Promise<{
 *   connected: string[],
 *   commits: number, prs: number, topRepo: string|null,
 *   unreadEmails: number, topSender: string|null,
 *   nextMeeting: { title: string, inMinutes: number|null }|null,
 *   openIncidents: number,
 *   deployFailures: number,
 * }>}
 */
export async function buildWorkspacePulse(workspaceId) {
  const wsId      = String(workspaceId);
  const connected = listConnectedConnectors(wsId);

  // GitHub is often connected via durable OAuth even when the in-memory credential
  // store is empty (e.g. right after a restart). Detect that so the greeting still
  // cites real repos.
  let githubConnected = connected.includes('github');
  if (!githubConnected) {
    try {
      const { getAccessToken } = await import('../integrations/GitHubOAuthService.js');
      githubConnected = !!(await getAccessToken(wsId));
    } catch { /* not connected */ }
  }
  if (githubConnected && !connected.includes('github')) connected.push('github');

  const pulse = {
    connected,
    liveConnected: [...connected],   // connectors backed by real OAuth/API
    ingestedSources: [],              // sources present as INGESTED data (no live API)
    sourceMode: connected.length ? 'live' : 'none',
    commits: 0, prs: 0, topRepo: null,
    unreadEmails: 0, topSender: null,
    nextMeeting: null,
    openIncidents: 0,
    deployFailures: 0,
  };

  // ── Ingested-data recognition (certification / imported workspaces) ───────────
  // A workspace can hold real, ingested enterprise state (graph + events + vectors)
  // WITHOUT any live OAuth — e.g. the Helios certification world. The greeting must
  // NOT demand "Connect GitHub" in that case; it should reflect the ingested state
  // with honest provenance (this is data, not a live provider). We derive the pulse
  // from flow_events / graph, and mark those sources as ingested (never as "live").
  try {
    const db = (await import('../../config/db.js')).default;
    const [{ rows: srcRows }, { rows: incRows }] = await Promise.all([
      db.query(`SELECT connector, count(*)::int c FROM flow_events WHERE workspace_id=$1 GROUP BY connector`, [wsId]),
      db.query(`SELECT count(*)::int c FROM flow_events WHERE workspace_id=$1 AND event_type='incident'`, [wsId]),
    ]);
    const ingested = (srcRows || []).map(r => r.connector).filter(Boolean);
    if (ingested.length) {
      pulse.ingestedSources = ingested;
      // Merge ingested sources into `connected` so downstream logic sees them —
      // but keep liveConnected separate so nothing claims a live API it doesn't have.
      for (const s of ingested) if (!pulse.connected.includes(s)) pulse.connected.push(s);
      pulse.sourceMode = pulse.liveConnected.length ? 'mixed' : 'ingested';
      // Activity counts from the ingested event stream (real records, real authors).
      const { rows: evRows } = await db.query(
        `SELECT connector, count(*)::int c FROM flow_events WHERE workspace_id=$1
           AND ts > now() - interval '30 days' GROUP BY connector`, [wsId]);
      const byConn = Object.fromEntries((evRows || []).map(r => [r.connector, r.c]));
      pulse.commits = byConn.github ? byConn.github : pulse.commits;
      pulse.openIncidents = incRows?.[0]?.c ?? pulse.openIncidents;
    }
  } catch { /* best-effort — a DB hiccup never breaks the greeting */ }

  // ── GitHub: commits (last 24h) + open PRs across most-recent repos ──────────
  if (githubConnected) {
    try {
      const github = getConnector('github');
      if (github) {
        const repos = await github.execute(wsId, ActionType.READ, { resourceType: 'repos', limit: 3 });
        // Default to the most-recently-updated repo, but prefer the repo that
        // actually has the latest commit (repos[0] may be empty — no commits).
        if (repos?.length) pulse.topRepo = repos[0].name || repos[0].fullName || null;
        for (const repo of (repos || []).slice(0, 3)) {
          if (!repo?.owner || !repo?.name) continue;
          try {
            const commits = await github.execute(wsId, ActionType.READ, {
              resourceType: 'commits', owner: repo.owner, repo: repo.name, limit: 20,
            });
            pulse.commits += (commits || []).filter(c => withinHours(c.date, 24)).length;
            // Cite the commit WITH the repo it belongs to — never pair a commit
            // with an unrelated (e.g. empty) repo.
            if (!pulse.latestCommit && commits?.[0]?.message) {
              pulse.latestCommit = commits[0].message.slice(0, 60);
              pulse.latestCommitRepo = repo.name;
              if (!pulse.commits) pulse.topRepo = repo.name; // top repo had no commits — cite the one that does
            }
          } catch { /* per-repo best-effort */ }
          try {
            const pulls = await github.execute(wsId, ActionType.READ, {
              resourceType: 'pulls', owner: repo.owner, repo: repo.name, state: 'open', limit: 10,
            });
            pulse.prs += (pulls || []).length;
          } catch { /* per-repo best-effort */ }
        }
      }
    } catch { /* github unavailable — cite nothing */ }
  }

  // ── Gmail: unread inbox count + top sender ──────────────────────────────────
  if (connected.includes('gmail')) {
    try {
      const gmail = getConnector('gmail');
      if (gmail) {
        const msgs = await gmail.execute(wsId, ActionType.READ, { folder: 'INBOX', limit: 20, q: 'is:unread' });
        if (Array.isArray(msgs)) {
          pulse.unreadEmails = msgs.length;
          if (msgs[0]) pulse.topSender = _senderName(msgs[0].from || msgs[0].sender);
        }
      }
    } catch { /* gmail unavailable — cite nothing */ }
  }

  // ── Calendar: next upcoming meeting ─────────────────────────────────────────
  if (connected.includes('google-calendar')) {
    try {
      const cal = getConnector('google-calendar');
      if (cal) {
        const events = await cal.execute(wsId, ActionType.READ, { days: 1, limit: 10 });
        const upcoming = (Array.isArray(events) ? events : [])
          .filter(e => e.startTime && new Date(e.startTime).getTime() > Date.now())
          .sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
        if (upcoming[0]) {
          pulse.nextMeeting = {
            title:     upcoming[0].title || upcoming[0].summary || 'Untitled meeting',
            inMinutes: minutesUntil(upcoming[0].startTime),
          };
        }
      }
    } catch { /* calendar unavailable — cite nothing */ }
  }

  // ── Incidents (in-memory, cheap) ────────────────────────────────────────────
  try {
    const incidents = getRecentIncidents(wsId, 24);
    pulse.openIncidents  = incidents.filter(i => !i.status || i.status === 'OPEN').length;
    pulse.deployFailures = incidents.filter(i => /deploy|deployment|rollback|build fail/i.test(`${i.title || ''} ${i.type || ''}`)).length;
  } catch { /* non-fatal */ }

  return pulse;
}

function _senderName(from) {
  if (!from) return null;
  // "Jane Doe <jane@x.com>" → "Jane Doe"; "jane@x.com" → "jane"
  const named = String(from).match(/^\s*"?([^"<]+?)"?\s*</);
  if (named) return named[1].trim();
  return String(from).split('@')[0];
}

// ── Proactive greeting composition ───────────────────────────────────────────────
/**
 * Compose the natural, workspace-aware greeting text plus suggested next actions.
 * Returns { text, suggestions }. Never fabricates — only cites what the pulse found.
 */
export async function composeProactiveGreeting(workspaceId, { userName = null } = {}) {
  const pulse = await buildWorkspacePulse(workspaceId);
  const name  = userName ? `, ${String(userName).split(/[\s._]+/)[0]}` : '';
  const hello = `${timeGreeting()}${name}.`;

  // No LIVE connectors, but the workspace HAS ingested data (certification / imported):
  // greet from the ingested state with honest provenance — never "Connect GitHub".
  if (!pulse.liveConnected.length && pulse.ingestedSources.length) {
    const srcs = pulse.ingestedSources.map(s => ({ github: 'GitHub', gmail: 'Gmail', slack: 'Slack', jira: 'Jira', 'google-calendar': 'Calendar', system: 'incidents' }[s] || s));
    const incidentBit = pulse.openIncidents > 0 ? ` I can see ${pulse.openIncidents} open incident${pulse.openIncidents === 1 ? '' : 's'}.` : '';
    return {
      text: `${hello}\n\nI'm working from this workspace's ingested data — ${srcs.join(', ')} — not live connectors.${incidentBit} Ask me anything about it and I'll answer from what's here.`,
      suggestions: ["What's happening?", "Show open incidents", "What needs my attention?"],
      pulse,
    };
  }

  // Nothing connected AND nothing ingested — be honest, guide the user.
  if (!pulse.connected.length) {
    return {
      text: `${hello}\n\nNo tools are connected yet, so there's nothing for me to watch. Connect GitHub, Gmail, or your calendar and I'll start tracking your work and briefing you the moment you arrive.`,
      suggestions: ['Connect GitHub', 'Connect Gmail', 'Connect Calendar'],
      pulse,
    };
  }

  const bullets = [];
  if (pulse.commits > 0)      bullets.push(`• ${pulse.commits} commit${pulse.commits === 1 ? ' was' : 's were'} pushed${pulse.topRepo ? ` (most recent in ${pulse.topRepo})` : ''}.`);
  if (pulse.prs > 0)          bullets.push(`• ${pulse.prs} pull request${pulse.prs === 1 ? ' is' : 's are'} open and waiting.`);
  if (pulse.unreadEmails > 0) bullets.push(`• ${pulse.unreadEmails} unread email${pulse.unreadEmails === 1 ? '' : 's'}${pulse.topSender ? `, latest from ${pulse.topSender}` : ''}.`);
  if (pulse.nextMeeting) {
    const m = pulse.nextMeeting.inMinutes;
    const when = m == null ? 'later today' : m <= 0 ? 'now' : m < 60 ? `in ${m} minutes` : `in ${Math.round(m / 60)}h`;
    bullets.push(`• "${pulse.nextMeeting.title}" starts ${when}.`);
  }
  // No fresh commits/PRs but GitHub is connected — cite the real repo so the user
  // sees FLOW is looking at their actual work.
  if (pulse.commits === 0 && pulse.prs === 0 && pulse.topRepo) {
    // Cite the commit with the repo it actually came from (may differ from topRepo).
    const commitRepo = pulse.latestCommitRepo || pulse.topRepo;
    bullets.push(pulse.latestCommit
      ? `• Your most active repository is ${commitRepo} — last commit "${pulse.latestCommit}".`
      : `• Your most recent repository is ${pulse.topRepo}.`);
  }
  if (pulse.openIncidents > 0) bullets.push(`• ${pulse.openIncidents} open incident${pulse.openIncidents === 1 ? '' : 's'} need${pulse.openIncidents === 1 ? 's' : ''} attention.`);
  else if (pulse.deployFailures === 0 && pulse.commits === 0 && pulse.prs === 0 && !pulse.topRepo && pulse.connected.includes('github')) bullets.push('• No deployment failures detected.');

  // Suggestions derived from what's actually present.
  const suggestions = [];
  if (pulse.prs > 0)          suggestions.push('Review open PRs');
  if (pulse.unreadEmails > 0) suggestions.push('Summarize my unread emails');
  if (pulse.nextMeeting)      suggestions.push('Prep me for my next meeting');
  if (pulse.openIncidents > 0) suggestions.unshift('Show the open incident');
  if (!suggestions.length)    suggestions.push("What's my latest repository?", 'What should I focus on?');

  let text;
  if (bullets.length) {
    text = `${hello}\n\nSince your last visit:\n\n${bullets.join('\n')}\n\nHow can I help?`;
  } else {
    // Connected but genuinely quiet — say so honestly, don't invent.
    const tools = pulse.connected.filter(c => ['github', 'gmail', 'google-calendar'].includes(c)).length;
    text = `${hello}\n\nYour workspace is quiet right now — nothing new across your ${tools > 1 ? 'connected tools' : 'connected tool'} since you were last here. What would you like to look at?`;
  }

  return { text, suggestions: suggestions.slice(0, 3), pulse };
}
