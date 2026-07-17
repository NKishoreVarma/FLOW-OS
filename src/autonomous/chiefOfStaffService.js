/**
 * FLOW OS — Chief of Staff Service (Phase 19)
 *
 * Returns a prioritized briefing: the top 5 NOW items from the Workday Engine
 * + a one-sentence workspace summary from the WIC snapshot. No new reasoning —
 * reuses workdayEngine.getWorkQueue() and the existing workspace snapshot.
 */

import { getWorkQueue } from '../workday/workdayEngine.js';
import { buildActionCard } from './actionCardService.js';
import { getPreferences } from './memoryPersonalizer.js';

function greet(user = {}) {
  const h = new Date().getHours();
  const name = user.fullName || user.name || (user.email || '').split('@')[0] || 'there';
  const part = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  return `${part}, ${name.charAt(0).toUpperCase() + name.slice(1)}.`;
}

/**
 * @param {string} workspaceId
 * @param {object} user  { id, email, fullName, role }
 * @returns {{ greeting, topItems, summary, preferences, generatedAt }}
 */
export async function getChiefOfStaffBriefing(workspaceId, user = {}) {
  const [queueResult, prefResult] = await Promise.allSettled([
    getWorkQueue(workspaceId, user),
    getPreferences(workspaceId),
  ]);

  const queue = queueResult.status === 'fulfilled' ? queueResult.value : { now: [], next: [] };
  const prefs = prefResult.status === 'fulfilled' ? prefResult.value : { preferredReviewers: [], frequentDelegatees: [] };

  const topRaw = [...(queue.now || []), ...(queue.next || [])].slice(0, 5);
  const topItems = topRaw.map((item) => buildActionCard(item));

  const nowCount = (queue.now || []).length;
  const totalCount = queue.total || 0;
  let summary = 'All clear — no urgent items right now.';
  if (nowCount > 0) {
    const types = [...new Set(topRaw.map((i) => i.type))].slice(0, 2).join(' and ');
    summary = `${nowCount} item${nowCount > 1 ? 's' : ''} need${nowCount === 1 ? 's' : ''} your attention now${types ? ` (${types})` : ''}. ${totalCount > nowCount ? `${totalCount - nowCount} more can wait.` : ''}`;
  }

  return {
    greeting: greet(user),
    topItems,
    summary,
    preferences: prefs,
    generatedAt: new Date().toISOString(),
  };
}
