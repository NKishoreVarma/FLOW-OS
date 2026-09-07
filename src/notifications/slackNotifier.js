/**
 * slackNotifier — the delivery bridge that posts FLOW notifications to Slack.
 *
 * When a notification is created, if Slack is connected for the workspace and a
 * target channel is resolvable, FLOW posts a formatted message (Block Kit) through
 * the governed Slack adapter. Best-effort: a missing connection / channel / API
 * error never breaks notification creation — Slack is additive.
 *
 * Channel resolution order:
 *   1. explicit `channel` on the call
 *   2. SLACK_NOTIFY_CHANNEL env (id or #name)
 *   3. the workspace's #general (or the first non-archived public channel)
 */

import { getConnector }             from '../connectors/registry.js';
import { ActionType }               from '../connectors/capabilities.js';
import { getBotToken }              from '../services/integrations/SlackOAuthService.js';
import { logger }                   from '../utils/logger.js';

// Priority (0–100) → emoji + colour for the Block Kit attachment.
function _style(priority = 50) {
  if (priority >= 75) return { emoji: '🔴', color: '#E01E5A' };
  if (priority >= 50) return { emoji: '🟠', color: '#ECB22E' };
  return { emoji: '🟢', color: '#2EB67D' };
}

// Resolve the channel id to post to (best-effort).
async function _resolveChannel(workspaceId, explicit) {
  const wanted = explicit || process.env.SLACK_NOTIFY_CHANNEL || null;
  const slack = getConnector('slack');
  // A raw channel id (C…/G…) can be used directly.
  if (wanted && /^[CG][A-Z0-9]+$/.test(wanted)) return wanted;

  let channels = [];
  try {
    const out = await slack.read(workspaceId, { resourceType: 'channels', limit: 200 });
    channels = out?.channels || [];
  } catch { return null; }

  if (wanted) {
    const name = wanted.replace(/^#/, '').toLowerCase();
    const hit = channels.find(c => c.name?.toLowerCase() === name);
    if (hit) return hit.id;
  }
  // Default: #general, else the first non-archived channel.
  const general = channels.find(c => c.name === 'general' && !c.isArchived);
  return (general || channels.find(c => !c.isArchived))?.id || null;
}

/**
 * Deliver a notification to Slack if connected. Returns { delivered, channel } or
 * { delivered:false, reason }. Never throws.
 * @param {string} workspaceId
 * @param {object} n { type, priority, title, body, actions, channel? }
 * @param {object} ctx { actor, orgId, orgPlan }
 */
export async function deliverToSlack(workspaceId, n = {}, ctx = {}) {
  try {
    const token = await getBotToken(workspaceId);
    if (!token) return { delivered: false, reason: 'not_connected' };

    const channelId = await _resolveChannel(workspaceId, n.channel);
    if (!channelId) return { delivered: false, reason: 'no_channel' };

    const { emoji, color } = _style(n.priority);
    const actionLinks = (n.actions || [])
      .map(a => a.params?.url ? `<${a.params.url}|${a.label || 'Open'}>` : null)
      .filter(Boolean);

    const blocks = [
      { type: 'section', text: { type: 'mrkdwn', text: `${emoji} *${n.title}*` } },
    ];
    if (n.body)          blocks.push({ type: 'section', text: { type: 'mrkdwn', text: n.body } });
    if (actionLinks.length) blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: actionLinks.join('  ·  ') }] });

    const slack = getConnector('slack');
    // Fallback text keeps the message accessible in notifications/search.
    const text = `${n.title}${n.body ? ` — ${n.body}` : ''}`;
    const result = await slack.execute(workspaceId, ActionType.SEND, { channelId, text, blocks });

    logger.rag?.(`[SlackNotify] posted "${n.title}" to ${channelId}`);
    return { delivered: true, channel: channelId, ts: result?.ts || null };
  } catch (err) {
    logger.rag?.(`[SlackNotify] delivery failed: ${err.message}`);
    return { delivered: false, reason: err.message };
  }
}

export default { deliverToSlack };
