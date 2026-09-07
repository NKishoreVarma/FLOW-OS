/**
 * LiveConnectorLayer — bridges the AI reasoning pipeline to live connector APIs.
 *
 * Called from CapabilityDispatcher when intent signals require fresh data
 * that may not yet be in the knowledge graph (just-pushed repos, new emails,
 * today's meetings). Reads credentials from ConnectorCredentialStore (PostgreSQL)
 * so tokens saved via the integration hub are visible without a server restart.
 *
 * Returns records in the same shape as CapabilityDispatcher._formatNode() so
 * they can be prepended to graph results transparently.
 *
 * All failures are non-fatal: each function returns null on any error and lets
 * graph data serve as fallback.
 */

import { getAccessToken } from '../../services/integrations/GitHubOAuthService.js';
import { loadTokens }     from '../../services/google/GoogleTokenManager.js';
import { loadCredentials } from '../../services/integrations/ConnectorCredentialStore.js';
import { logger }          from '../../utils/logger.js';

const GH_API       = process.env.GITHUB_API_URL || 'https://api.github.com';
const GH_HDR       = {
  Accept:                 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent':           'FLOW-OS/ai-layer',
};
const JIRA_API     = 'https://api.atlassian.com';
const SLACK_API    = 'https://slack.com/api';

// Questions that signal the user wants current/live data from a connector.
// Includes operational priority phrases so "What should I focus on?" and
// "What engineering work needs attention?" trigger live fetches.
// Prefix-anchored (no trailing \b) so "recently", "changed", "working", etc. all match.
const LIVE_RE = /\b(latest|my |open |current|today|upcoming|recent|now|this week|active|show me|list|what are|how many|new |just |unread|show|give me|focus|attention|priorit|risk|block|urgent|critical|important|need|work|change)/i;

export function hasLiveSignal(question) {
  return LIVE_RE.test(question);
}

// ── GitHub ─────────────────────────────────────────────────────────────────────

async function _ghGet(path, token) {
  const res = await fetch(`${GH_API}${path}`, {
    headers: { ...GH_HDR, Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    // Log 401/403 explicitly so operators can see the token needs rotation
    // without having to grep for silent null returns.
    if (res.status === 401 || res.status === 403) {
      logger.warn(`[LiveConnectorLayer] GitHub ${res.status} on ${path} — token expired or revoked; live engineering data unavailable`);
    }
    throw new Error(`GitHub ${res.status} ${path}`);
  }
  return res.json();
}

function _repoRecord(repo) {
  return {
    type:     'REPOSITORY',
    id:       `github:repo:${repo.full_name}`,
    name:     repo.full_name,
    summary:  [
      repo.description,
      repo.language ? `Language: ${repo.language}` : null,
      `${repo.open_issues_count} open issues`,
      repo.archived ? 'archived' : null,
    ].filter(Boolean).join(' · '),
    status:   repo.archived ? 'archived' : 'active',
    ts:       repo.pushed_at || repo.updated_at,
    metadata: {
      pushedAt:      repo.pushed_at,
      defaultBranch: repo.default_branch,
      stars:         repo.stargazers_count,
      forks:         repo.forks_count,
      visibility:    repo.visibility,
      url:           repo.html_url,
    },
    liveSource: 'github',
  };
}

function _prRecord(pr, repoName) {
  return {
    type:    'PR',
    id:      `github:pr:${repoName}#${pr.number}`,
    name:    `${repoName}#${pr.number}: ${pr.title}`,
    summary: [
      `State: ${pr.draft ? 'draft' : pr.state}`,
      pr.user?.login  ? `Author: ${pr.user.login}` : null,
      pr.body         ? pr.body.slice(0, 120)       : null,
    ].filter(Boolean).join(' · '),
    status:  pr.draft ? 'draft' : pr.state,
    ts:      pr.updated_at || pr.created_at,
    metadata: { number: pr.number, repo: repoName, draft: pr.draft, url: pr.html_url, author: pr.user?.login },
    liveSource: 'github',
  };
}

function _commitRecord(commit, repoName) {
  return {
    type:    'COMMIT',
    id:      `github:commit:${commit.sha?.slice(0, 8)}`,
    name:    commit.commit?.message?.split('\n')[0] || commit.sha?.slice(0, 8),
    summary: `${repoName} · ${commit.author?.login || commit.commit?.author?.name || 'unknown'}`,
    ts:      commit.commit?.author?.date,
    metadata: { repo: repoName, sha: commit.sha, url: commit.html_url },
    liveSource: 'github',
  };
}

/**
 * Fetch live engineering data from GitHub using the stored workspace token.
 * Returns an array of normalized records, or null if GitHub is not connected
 * or the question has no live intent signal.
 */
export async function fetchLiveEngineering(workspaceId, question) {
  if (!hasLiveSignal(question)) return null;

  let token;
  try {
    token = await getAccessToken(workspaceId);
  } catch { return null; }
  if (!token) return null;

  const q = question.toLowerCase();
  const records = [];
  let fetchError = null;

  try {
    if (/repo|repositor/.test(q)) {
      const repos = await _ghGet('/user/repos?per_page=10&sort=pushed', token);
      records.push(...repos.map(_repoRecord));
    }

    if (/pull request|\bprs?\b|merge request|open pr/.test(q)) {
      const repos = await _ghGet('/user/repos?per_page=5&sort=pushed', token).catch(() => []);
      await Promise.all(
        repos.slice(0, 3).map(async repo => {
          try {
            const prs = await _ghGet(`/repos/${repo.full_name}/pulls?state=open&per_page=10`, token);
            records.push(...prs.map(pr => _prRecord(pr, repo.full_name)));
          } catch { /* skip repo with no accessible PRs */ }
        })
      );
    }

    if (/commit|\bpush\b/.test(q)) {
      const repos = await _ghGet('/user/repos?per_page=3&sort=pushed', token).catch(() => []);
      await Promise.all(
        repos.slice(0, 2).map(async repo => {
          try {
            const commits = await _ghGet(`/repos/${repo.full_name}/commits?per_page=5`, token);
            records.push(...commits.map(c => _commitRecord(c, repo.full_name)));
          } catch { /* skip */ }
        })
      );
    }

    // Default for generic engineering questions — list repos
    if (!records.length) {
      const repos = await _ghGet('/user/repos?per_page=10&sort=pushed', token).catch(e => { fetchError = e; return []; });
      records.push(...repos.map(_repoRecord));
    }
  } catch (e) {
    fetchError = e;
  }

  if (!records.length && fetchError) {
    // Surface the error string on the result so CapabilityDispatcher can include it
    // in the Brain context instead of silently falling back to demo graph nodes.
    const err = { liveError: fetchError.message, liveSource: 'github' };
    return err;
  }

  return records.length ? records : null;
}

// ── Google Calendar ────────────────────────────────────────────────────────────

export async function fetchLiveMeetings(workspaceId, question) {
  if (!hasLiveSignal(question)) return null;

  let tokens;
  try {
    tokens = await loadTokens(workspaceId);
  } catch { return null; }
  if (!tokens) return null;

  try {
    const { google } = await import('googleapis');
    const oauth2 = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID || process.env.GMAIL_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET || process.env.GMAIL_CLIENT_SECRET,
    );
    oauth2.setCredentials(tokens);

    const calendar = google.calendar({ version: 'v3', auth: oauth2 });
    const now      = new Date();
    const maxDate  = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const res = await calendar.events.list({
      calendarId:   'primary',
      timeMin:      now.toISOString(),
      timeMax:      maxDate.toISOString(),
      maxResults:   15,
      orderBy:      'startTime',
      singleEvents: true,
    });

    return (res.data.items || []).map(ev => ({
      type:    'EVENT',
      id:      `gcal:${ev.id}`,
      name:    ev.summary || 'Untitled Event',
      summary: [
        ev.start?.dateTime ? new Date(ev.start.dateTime).toLocaleString() : ev.start?.date,
        ev.attendees?.length ? `${ev.attendees.length} attendees` : null,
        ev.location || null,
      ].filter(Boolean).join(' · '),
      status:  ev.status,
      ts:      ev.start?.dateTime || ev.start?.date,
      metadata: {
        eventId:     ev.id,
        startTime:   ev.start?.dateTime,
        hangoutLink: ev.hangoutLink,
        attendees:   (ev.attendees || []).map(a => a.email || a.displayName),
      },
      liveSource: 'google-calendar',
    }));
  } catch { return null; }
}

// ── Gmail ──────────────────────────────────────────────────────────────────────

export async function fetchLiveCommunications(workspaceId, question) {
  if (!hasLiveSignal(question)) return null;

  let tokens;
  try {
    tokens = await loadTokens(workspaceId);
  } catch { return null; }
  if (!tokens) return null;

  try {
    const { google } = await import('googleapis');
    const oauth2 = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID || process.env.GMAIL_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET || process.env.GMAIL_CLIENT_SECRET,
    );
    oauth2.setCredentials(tokens);

    const gmail = google.gmail({ version: 'v1', auth: oauth2 });
    const qStr  = /unread/.test(question.toLowerCase()) ? 'is:unread' : 'in:inbox';

    const list = await gmail.users.messages.list({ userId: 'me', q: qStr, maxResults: 8 });
    const refs  = list.data.messages || [];

    const details = await Promise.all(
      refs.slice(0, 8).map(m =>
        gmail.users.messages.get({
          userId: 'me', id: m.id, format: 'metadata',
          metadataHeaders: ['Subject', 'From', 'Date'],
        }).catch(() => null)
      )
    );

    return details.filter(Boolean).map(res => {
      const hdrs = Object.fromEntries(
        (res.data.payload?.headers || []).map(h => [h.name.toLowerCase(), h.value])
      );
      return {
        type:    'EMAIL',
        id:      `gmail:${res.data.id}`,
        name:    hdrs['subject'] || '(no subject)',
        summary: `From: ${hdrs['from'] || 'unknown'} · ${hdrs['date'] || ''}`,
        status:  res.data.labelIds?.includes('UNREAD') ? 'unread' : 'read',
        ts:      hdrs['date'],
        metadata: { messageId: res.data.id, from: hdrs['from'], subject: hdrs['subject'] },
        liveSource: 'gmail',
      };
    });
  } catch { return null; }
}

// ── Jira ───────────────────────────────────────────────────────────────────────

export async function fetchLiveJira(workspaceId, question) {
  if (!hasLiveSignal(question)) return null;

  let cred;
  try { cred = await loadCredentials(workspaceId, 'jira'); } catch { return null; }
  if (!cred?.accessToken || !cred?.cloudId) return null;

  const q   = question.toLowerCase();
  const hdrs = { Authorization: `Bearer ${cred.accessToken}`, Accept: 'application/json' };
  const base = `${JIRA_API}/ex/jira/${cred.cloudId}/rest/api/3`;

  try {
    const records = [];

    if (/sprint|velocity|burndown|active sprint/.test(q)) {
      // Get active sprint issues — requires Agile API
      const boards = await fetch(`${JIRA_API}/ex/jira/${cred.cloudId}/rest/agile/1.0/board?maxResults=3`, { headers: hdrs })
        .then(r => r.ok ? r.json() : null).catch(() => null);
      const boardList = boards?.values || [];

      for (const board of boardList.slice(0, 2)) {
        const sprintRes = await fetch(`${JIRA_API}/ex/jira/${cred.cloudId}/rest/agile/1.0/board/${board.id}/sprint?state=active&maxResults=1`, { headers: hdrs })
          .then(r => r.ok ? r.json() : null).catch(() => null);
        const sprint = sprintRes?.values?.[0];
        if (sprint) {
          records.push({
            type:    'SPRINT',
            id:      `jira:sprint:${sprint.id}`,
            name:    sprint.name,
            summary: `Active sprint — started ${sprint.startDate?.slice(0, 10) || 'unknown'}, ends ${sprint.endDate?.slice(0, 10) || 'unknown'}`,
            status:  sprint.state,
            ts:      sprint.startDate,
            metadata: { sprintId: sprint.id, boardId: board.id, state: sprint.state, boardName: board.name },
            liveSource: 'jira',
          });
        }
      }
    }

    // Always fetch recent issues for context
    let jql = 'ORDER BY updated DESC';
    if (/my |assigned to me/.test(q))  jql = 'assignee = currentUser() ORDER BY updated DESC';
    else if (/open|to do|in progress/.test(q)) jql = 'status in ("To Do","In Progress","In Review") ORDER BY updated DESC';
    else if (/bug|blocker|critical/.test(q))   jql = 'priority in (Blocker,Critical) AND status != Done ORDER BY priority DESC';
    else if (/done|completed|closed/.test(q))  jql = 'status = Done ORDER BY updated DESC';

    const issueRes = await fetch(`${base}/search?jql=${encodeURIComponent(jql)}&maxResults=12&fields=summary,status,priority,assignee,updated,issuetype`, { headers: hdrs })
      .then(r => r.ok ? r.json() : null).catch(() => null);

    (issueRes?.issues || []).forEach(issue => {
      records.push({
        type:    'ISSUE',
        id:      `jira:issue:${issue.key}`,
        name:    `${issue.key}: ${issue.fields?.summary || '(no title)'}`,
        summary: [
          issue.fields?.status?.name,
          issue.fields?.priority?.name ? `Priority: ${issue.fields.priority.name}` : null,
          issue.fields?.assignee?.displayName ? `Assignee: ${issue.fields.assignee.displayName}` : null,
        ].filter(Boolean).join(' · '),
        status:  issue.fields?.status?.name?.toLowerCase().replace(/ /g, '_') || 'unknown',
        ts:      issue.fields?.updated,
        metadata: {
          key:        issue.key,
          issueType:  issue.fields?.issuetype?.name,
          status:     issue.fields?.status?.name,
          priority:   issue.fields?.priority?.name,
          assignee:   issue.fields?.assignee?.displayName,
          url:        `${cred.cloudUrl || ''}/browse/${issue.key}`,
        },
        liveSource: 'jira',
      });
    });

    return records.length ? records : null;
  } catch { return null; }
}

// ── Slack ──────────────────────────────────────────────────────────────────────

export async function fetchLiveSlack(workspaceId, question) {
  if (!hasLiveSignal(question)) return null;

  let cred;
  try { cred = await loadCredentials(workspaceId, 'slack'); } catch { return null; }
  if (!cred?.botToken) return null;

  const botToken = cred.botToken;
  const q        = question.toLowerCase();

  try {
    const records = [];

    async function slackGet(method, params = {}) {
      const url = `${SLACK_API}/${method}?${new URLSearchParams(params)}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${botToken}` } });
      const data = await res.json();
      return data.ok ? data : null;
    }

    // Get relevant channels
    const chanRes = await slackGet('conversations.list', { types: 'public_channel', limit: 30, exclude_archived: true });
    const allChans = chanRes?.channels || [];

    // Filter channels by question context
    let targetChans = allChans;
    const channelMatch = q.match(/(?:in\s+)?#([a-z0-9_-]+)/i);
    if (channelMatch) {
      const name = channelMatch[1].toLowerCase();
      const exact = allChans.filter(c => c.name === name);
      targetChans = exact.length ? exact : allChans.filter(c => c.name.includes(name));
    } else if (/incident|alert|p0|p1|outage/.test(q)) {
      targetChans = allChans.filter(c => /incident|alert|ops|sre|on.?call/.test(c.name));
    } else if (/engineer|dev|build|deploy|release|pr|code/.test(q)) {
      targetChans = allChans.filter(c => /eng|dev|build|deploy|release|tech/.test(c.name));
    } else if (/general|company|announce/.test(q)) {
      targetChans = allChans.filter(c => /general|company|announce|all/.test(c.name));
    }

    // Limit to top 3 channels by member count
    const topChans = (targetChans.length ? targetChans : allChans)
      .sort((a, b) => (b.num_members || 0) - (a.num_members || 0))
      .slice(0, 3);

    for (const chan of topChans) {
      const histRes = await slackGet('conversations.history', {
        channel: chan.id,
        limit:   10,
        oldest:  String((Date.now() / 1000) - 7 * 86400), // last 7 days
      }).catch(() => null);

      (histRes?.messages || [])
        .filter(m => m.type === 'message' && m.text && !m.subtype)
        .slice(0, 5)
        .forEach(m => {
          records.push({
            type:    'SLACK_MESSAGE',
            id:      `slack:${chan.id}:${m.ts}`,
            name:    m.text.length > 80 ? m.text.slice(0, 77) + '…' : m.text,
            summary: `#${chan.name} · ${new Date(parseFloat(m.ts) * 1000).toLocaleDateString()}`,
            status:  m.reactions?.length ? 'reacted' : 'sent',
            ts:      new Date(parseFloat(m.ts) * 1000).toISOString(),
            metadata: {
              channelId:   chan.id,
              channelName: chan.name,
              userId:      m.user,
              threadTs:    m.thread_ts,
              replyCount:  m.reply_count || 0,
            },
            liveSource: 'slack',
          });
        });
    }

    return records.length ? records : null;
  } catch { return null; }
}
