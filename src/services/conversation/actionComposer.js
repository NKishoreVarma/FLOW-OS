/**
 * actionComposer — detects actionable intents in chat ("create an issue…",
 * "schedule a meeting…") and produces a REVIEWABLE draft plus a governed
 * `recommendation` ({connector, actionType, payload}) that the client executes
 * through /api/execution/execute. FLOW never executes without human approval.
 *
 * Email compose lives in emailComposer.js (already wired); this covers the other
 * write verbs so the whole action surface shares one draft-card pattern.
 */

import { ask }            from '../../ai/BrainRouter.js';
import { TaskType }       from '../../ai/types.js';
import { sanitizeForLLM } from '../../ai/reasoning/ContextBuilder.js';
import { getAccessToken } from '../integrations/GitHubOAuthService.js';

// ── GitHub issue ────────────────────────────────────────────────────────────────
const ISSUE_RE = /\b(create|open|file|raise|log|make)\b[^]*\b(issue|ticket|bug)\b/i;
export function isIssueCompose(text) { return ISSUE_RE.test(String(text || '')); }

/**
 * Draft a GitHub issue. Needs a repo; owner defaults to the connected account.
 * @returns {Promise<{kind, title, fields, recommendation}|null>}
 */
export async function composeIssueDraft(text, { workspaceId } = {}) {
  // Resolve owner from the connected GitHub identity; repo from the message.
  let owner = null;
  try {
    const token = await getAccessToken(workspaceId);
    if (token) {
      const me = await fetch('https://api.github.com/user', { headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'FLOW' } }).then(r => r.json());
      owner = me?.login || null;
    }
  } catch { /* not connected — caller handles */ }

  const slash = String(text).match(/\b([\w.-]+)\/([\w.-]+)\b/);
  const inRepo = String(text).match(/\b(?:in|for|on)\s+(?:the\s+)?(?:repo(?:sitory)?\s+)?["'`]?([\w.-]+?)["'`]?(?:\s|$|,|\.)/i);
  if (slash) { owner = slash[1]; }
  const repo = slash ? slash[2] : (inRepo ? inRepo[1] : null);
  if (!repo || !owner) return { kind: 'github_issue', needsRepo: true, owner, repo };

  // Title: explicit "titled/called '…'", else derive from the request.
  const titled = String(text).match(/(?:titled|called|named|title)\s+["'`](.+?)["'`]/i);
  const bodyM  = String(text).match(/(?:body|description|saying|that says?)\s+["'`](.+?)["'`]/i);

  const prompt = `Write a concise GitHub issue from this request. Return JSON only: {"title":"...","body":"..."}.
Request: "${text}"
Title: short, imperative (max 10 words). Body: 1-3 sentences describing the problem/task. Plain text.`;
  let title = titled ? titled[1] : null;
  let body  = bodyM ? bodyM[1] : '';
  if (!title) {
    try {
      const res = await ask({ taskType: TaskType.CHAT, messages: [{ role: 'user', content: sanitizeForLLM(prompt) }], maxTokens: 200, temperature: 0.3 });
      const clean = (res.text || '').replace(/```json?|```/g, '').trim();
      const parsed = JSON.parse(clean.slice(clean.indexOf('{'), clean.lastIndexOf('}') + 1));
      title = sanitizeForLLM(parsed.title || 'New issue');
      body  = body || sanitizeForLLM(parsed.body || '');
    } catch { title = 'New issue'; }
  }

  return {
    kind: 'github_issue',
    title: `New issue in ${owner}/${repo}`,
    fields: { repo: `${owner}/${repo}`, title, body },
    recommendation: {
      connector: 'github',
      actionType: 'create',
      title: `Create issue in ${owner}/${repo}`,
      payload: { resourceType: 'issue', owner, repo, title, body },
    },
  };
}

// ── Pull request title + description (from the diff/commits) ─────────────────────
/**
 * Generate a professional PR title and description from the commits on a branch.
 * @param {object} ctx { head, base, commits: [{message, author}], files? }
 * @returns {Promise<{title, body}>}
 */
export async function composePRDraft({ head, base, commits = [], files = [] } = {}) {
  const commitList = commits.slice(0, 20).map(c => `- ${(c.message || '').split('\n')[0]}${c.author ? ` (${c.author})` : ''}`).join('\n');
  const fileList = files.slice(0, 15).map(f => `- ${f.filename || f}`).join('\n');

  const prompt = `Write a professional pull request title and description from these commits.
Branch: ${head} → ${base}
Commits:
${commitList || '(none)'}
${fileList ? `\nChanged files:\n${fileList}` : ''}

Return JSON only: {"title":"...","body":"..."}.
Title: concise, imperative, no ticket prefix (max 12 words).
Body: a short summary paragraph, then a "## Changes" bullet list of what changed, then a "## Review notes" line. Plain markdown is fine for a PR body.`;

  try {
    const res = await ask({ taskType: TaskType.CHAT, messages: [{ role: 'user', content: sanitizeForLLM(prompt) }], maxTokens: 500, temperature: 0.3 });
    const clean = (res.text || '').replace(/```json?|```/g, '').trim();
    const parsed = JSON.parse(clean.slice(clean.indexOf('{'), clean.lastIndexOf('}') + 1));
    return {
      title: sanitizeForLLM(parsed.title || `Merge ${head} into ${base}`),
      body:  sanitizeForLLM(parsed.body || commitList),
    };
  } catch {
    // Deterministic fallback from the real commits.
    const title = commits[0]?.message?.split('\n')[0]?.slice(0, 72) || `Merge ${head} into ${base}`;
    const body = `Summary of changes on \`${head}\`:\n\n${commitList || '(no commit messages)'}`;
    return { title, body };
  }
}

// ── Calendar meeting ─────────────────────────────────────────────────────────────
const MEETING_RE = /\b(schedule|set up|book|create|arrange)\b[^]*\b(meeting|call|event|sync|1:1|one on one)\b/i;
export function isMeetingCompose(text) { return MEETING_RE.test(String(text || '')); }

/**
 * Draft a calendar event. Best-effort natural-time parsing; the user reviews/edits.
 * @returns {Promise<{kind, title, fields, recommendation}|null>}
 */
export async function composeMeetingDraft(text, { userName } = {}) {
  const titled = String(text).match(/(?:titled|called|named|about|for)\s+["'`]?(.+?)["'`]?(?:\s+(?:at|on|tomorrow|today|with)|$)/i);
  const attendee = (String(text).match(/[\w.+-]+@[\w-]+\.[\w.-]+/) || [])[0] || null;
  const durM = String(text).match(/(\d+)\s*(?:min|minute|hour|hr)/i);
  const durationMin = durM ? (/(hour|hr)/i.test(durM[0]) ? Number(durM[1]) * 60 : Number(durM[1])) : 30;

  // Time: "tomorrow at 3pm", "today at 10:00", else default to tomorrow 10:00.
  const start = _parseWhen(text);
  const end = new Date(start.getTime() + durationMin * 60000);
  const title = (titled && titled[1] && titled[1].length < 80) ? titled[1].trim() : 'Meeting';

  return {
    kind: 'calendar_event',
    title: 'New calendar event',
    fields: {
      title,
      when: `${start.toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' })} · ${durationMin} min`,
      attendees: attendee || '(none)',
    },
    recommendation: {
      connector: 'google-calendar',
      actionType: 'create',
      title: `Schedule "${title}"`,
      payload: {
        title,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        attendees: attendee ? [{ email: attendee }] : [],
        videoConference: true,
      },
    },
  };
}

// A leading read/question word means the user wants to SEE something, not DO it —
// "what tickets are open?", "any slack messages?" must never become a draft.
const READ_LEAD = /^\s*(what|show|list|any|summar|check|read|get|find|how|which|who|when|where|is|are|do|does|tell me)\b/i;

// ── Slack message ────────────────────────────────────────────────────────────────
const SLACK_VERB = /\b(send|post|message|dm|ping|shoot|drop)\b/i;
export function isSlackCompose(text) {
  const t = String(text || '');
  if (READ_LEAD.test(t)) return false;
  if (!SLACK_VERB.test(t)) return false;
  return /\bslack\b/i.test(t) || /#[\w-]+/.test(t) || /\bdm\s+@?\w+/i.test(t);
}

/**
 * Draft a Slack message. Resolves the channel/person and the message body, then
 * routes a governed slack.send recommendation the user approves.
 */
export async function composeSlackDraft(text) {
  const channelM = String(text).match(/#([\w-]+)/);
  const personM  = String(text).match(/\bto\s+@?([\w.-]+)/i);
  const channel  = channelM ? `#${channelM[1]}` : (personM && personM[1].toLowerCase() !== 'slack' ? `@${personM[1]}` : null);
  if (!channel) return { kind: 'needs_info', ask: "Which channel or person? e.g. \"send a Slack message to #engineering saying the deploy is done\"." };

  const sayingM = String(text).match(/(?:saying|say|that says?|tell(?:ing)? them|:)\s+["'`]?(.+?)["'`]?\s*$/i);
  const content = sayingM ? sayingM[1].trim() : null;
  if (!content) return { kind: 'needs_info', ask: `What should I say in ${channel}?` };

  // Keep the user's words by default; lightly polish when the model is available.
  let messageText = content;
  try {
    const res = await ask({ taskType: TaskType.CHAT, messages: [{ role: 'user', content: sanitizeForLLM(`Write a short, clear Slack message for ${channel}. Communicate: "${content}". One or two sentences, plain text, no markdown, no greeting for a channel. Return only the message.`) }], maxTokens: 120, temperature: 0.3 });
    const t = (res.text || '').trim();
    if (t && t.length >= 3 && t.length < 400) messageText = sanitizeForLLM(t);
  } catch { /* use the raw content */ }

  return {
    kind: 'slack_message',
    title: `Message to ${channel}`,
    fields: { channel, text: messageText },
    recommendation: {
      connector: 'slack',
      actionType: 'send',
      title: `Send to ${channel}`,
      payload: { channelId: channel, channelName: channel, text: messageText },
    },
  };
}

// ── Jira ticket (create / status / assign) ───────────────────────────────────────
// Ordered so a more specific status wins ("to done" → Done, never "To Do").
const JIRA_STATUS = [
  [/\b(done|complete|completed|finished|closed?)\b/i, 'Done'],
  [/\b(in review|reviewing|review)\b/i,               'In Review'],
  [/\b(in progress|started?|working on)\b/i,          'In Progress'],
  [/\b(blocked|block)\b/i,                            'Blocked'],
  [/\bbacklog\b/i,                                    'Backlog'],
  [/\bto ?do\b/i,                                     'To Do'],
];
const PRIORITY_MAP = { p0: 'P0', p1: 'P1', p2: 'P2', p3: 'P3', urgent: 'P0', critical: 'P0', high: 'P1', medium: 'P2', low: 'P3' };

export function isJiraAction(text) {
  const t = String(text || '');
  if (READ_LEAD.test(t)) return false;   // "what tickets are open?" is a read, not an action
  const hasKey = /\b[A-Z]{2,}-\d+\b/.test(t);
  const verb   = /\b(move|transition|assign|change|update|close|create|open|new|make)\b/i.test(t);
  if (hasKey && verb) return true;
  if (/\bjira\b/i.test(t) && verb) return true;
  return /\bticket\b/i.test(t) && /\b(create|open|new|make|move|assign|close)\b/i.test(t);
}

/**
 * Draft a Jira action: create a ticket, move its status, or reassign it. Each
 * returns a governed jira recommendation the user approves before it runs.
 */
export async function composeJiraDraft(text) {
  const t = String(text);
  const keyM = t.match(/\b([A-Z]{2,}-\d+)\b/);
  const ticket = keyM ? keyM[1] : null;
  const isCreate = /\b(create|open|new|make|file|raise)\b/i.test(t) && !/\b(move|transition|change|update|assign|close)\b/i.test(t);

  if (isCreate) {
    const titled = t.match(/(?:titled|called|named|title|for|about)\s+["'`]?(.+?)["'`]?(?:\s+(?:with|in|priority|,)|$)/i);
    let title = titled ? titled[1].trim() : t.replace(/.*\b(ticket|issue)\b\s*(for|about|to)?/i, '').trim();
    if (!title || title.length < 2) title = 'New ticket';
    const projM = t.match(/\bin\s+([A-Z]{2,})\b/) || t.match(/\b([A-Z]{2,})-\d+\b/);
    const projectKey = projM ? projM[1] : 'ACME';
    const prM = t.match(/\b(p0|p1|p2|p3|high|medium|low|urgent|critical)\b/i);
    const priority = prM ? (PRIORITY_MAP[prM[1].toLowerCase()] || 'P2') : 'P2';
    const type = /\b(bug|fix|error|broken|regression)\b/i.test(t) ? 'Bug' : 'Task';
    return {
      kind: 'jira_ticket',
      title: `New ${type} in ${projectKey}`,
      fields: { project: projectKey, title, priority, type },
      recommendation: { connector: 'jira', actionType: 'create', title: `Create ${type} in ${projectKey}`, payload: { projectKey, title, priority, type } },
    };
  }

  if (!ticket) return { kind: 'needs_info', ask: "Which Jira ticket? Give me a key like ACME-421." };

  const assignM = t.match(/\bassign\b[^]*?\bto\s+@?([\w][\w .-]*?)(?:\s*$|[,.])/i);
  if (assignM) {
    const assignee = assignM[1].trim();
    return {
      kind: 'jira_ticket',
      title: `Assign ${ticket}`,
      fields: { ticket, assignee },
      recommendation: { connector: 'jira', actionType: 'update', title: `Assign ${ticket} to ${assignee}`, payload: { key: ticket, assignee } },
    };
  }

  const statusHit = JIRA_STATUS.find(([re]) => re.test(t));
  if (statusHit) {
    const status = statusHit[1];
    return {
      kind: 'jira_ticket',
      title: `Move ${ticket}`,
      fields: { ticket, status },
      recommendation: { connector: 'jira', actionType: 'execute', title: `Move ${ticket} to ${status}`, payload: { resourceType: 'workflow', key: ticket, status } },
    };
  }

  return { kind: 'needs_info', ask: `What should I do with ${ticket}? I can change its status, assign it, or add a comment.` };
}

function _parseWhen(text) {
  const t = String(text).toLowerCase();
  const now = new Date();
  const base = new Date(now);
  if (/tomorrow/.test(t)) base.setDate(base.getDate() + 1);
  const hm = t.match(/at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  let hour = 10, min = 0;
  if (hm) {
    hour = Number(hm[1]); min = hm[2] ? Number(hm[2]) : 0;
    if (/pm/i.test(hm[3] || '') && hour < 12) hour += 12;
    if (/am/i.test(hm[3] || '') && hour === 12) hour = 0;
  }
  base.setHours(hour, min, 0, 0);
  if (base <= now && !/tomorrow|today/.test(t)) base.setDate(base.getDate() + 1);
  return base;
}

export default {
  isIssueCompose, composeIssueDraft, isMeetingCompose, composeMeetingDraft,
  isSlackCompose, composeSlackDraft, isJiraAction, composeJiraDraft,
};
