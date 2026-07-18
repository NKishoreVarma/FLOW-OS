/**
 * DailyPlanningEngine — generates a prioritised daily plan for the workspace.
 *
 * Combines morning brief sections, workspace insights, and scored items into
 * a structured day plan: time-blocked schedule, OKR alignment, and focus blocks.
 *
 * The plan is stored in Redis and returned via the autonomous REST API.
 */

import Redis from 'ioredis';
import { ask }          from '../../ai/BrainRouter.js';
import { TaskType }     from '../../ai/types.js';
import { logger }       from '../../utils/logger.js';

const redis = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
  maxRetriesPerRequest: null,
  lazyConnect: true,
});
redis.connect().catch(() => {});

const PLAN_KEY     = wsId => `flow:workspace:${wsId}:dailyplan`;
const PLAN_TTL_SEC = 86_400; // 24h

/**
 * Generate the daily plan from a compiled morning brief and insights.
 *
 * @param {string} workspaceId
 * @param {import('./MorningBriefService.js').MorningBrief} brief
 * @param {import('./WorkspaceInsightService.js').Insight[]} insights
 * @returns {Promise<DailyPlan>}
 */
export async function generateDailyPlan(workspaceId, brief, insights) {
  const wsId = String(workspaceId);
  logger.rag(`[DailyPlan] Generating plan for ${wsId}`);

  const heuristic = _buildHeuristicPlan(brief, insights);
  const llmPlan   = await _enrichWithAI(heuristic, brief, insights);

  const plan = {
    workspaceId: wsId,
    date:        new Date().toISOString().split('T')[0],
    generatedAt: new Date().toISOString(),
    focusBlocks: llmPlan.focusBlocks || heuristic.focusBlocks,
    schedule:    llmPlan.schedule    || heuristic.schedule,
    priorities:  brief.topPriorities?.slice(0, 5) || [],
    reminders:   _buildReminders(brief),
    insights:    insights.filter(i => i.severity === 'high').slice(0, 3),
    meta: {
      criticalCount: brief.meta?.criticalCount ?? 0,
      meetingCount:  brief.sections?.todaysMeetings?.length ?? 0,
    },
  };

  await redis.set(PLAN_KEY(wsId), JSON.stringify(plan), 'EX', PLAN_TTL_SEC).catch(() => {});
  logger.rag(`[DailyPlan] Saved for ${wsId}`);
  return plan;
}

/**
 * Get the current day plan for a workspace.
 *
 * @param {string} workspaceId
 * @returns {Promise<DailyPlan|null>}
 */
export async function getDailyPlan(workspaceId) {
  const raw = await redis.get(PLAN_KEY(String(workspaceId))).catch(() => null);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

// ── Heuristic plan builder ────────────────────────────────────────────────────

function _buildHeuristicPlan(brief, insights) {
  const sections = brief.sections || {};
  const blocks   = [];
  const schedule = [];

  // Morning block: handle critical items first
  if (brief.meta?.criticalCount > 0) {
    blocks.push({
      id:       'block_critical',
      label:    'Critical Response',
      duration: '30 min',
      time:     '9:00 AM',
      items:    (sections.criticalRisks || []).slice(0, 3).map(r => r.name),
      priority: 'critical',
    });
  }

  // Incident review if active
  if (sections.incidentSummary?.active > 0) {
    blocks.push({
      id:       'block_incidents',
      label:    'Incident Review',
      duration: '20 min',
      time:     '9:30 AM',
      items:    (sections.incidentSummary?.items || []).slice(0, 3).map(i => i.name),
      priority: 'high',
    });
  }

  // Meeting prep
  if (sections.todaysMeetings?.length > 0) {
    for (const mtg of sections.todaysMeetings.slice(0, 2)) {
      blocks.push({
        id:       `block_prep_${mtg.id || Date.now()}`,
        label:    `Prep: ${mtg.name}`,
        duration: '15 min',
        time:     mtg.ts ? _subtractMinutes(mtg.ts, 30) : '10:00 AM',
        items:    [`Prepare materials for "${mtg.name}"`],
        priority: 'high',
      });
    }
  }

  // PR reviews
  if (sections.importantPullRequests?.length > 0) {
    blocks.push({
      id:       'block_pr_review',
      label:    'PR Reviews',
      duration: '45 min',
      time:     '11:00 AM',
      items:    sections.importantPullRequests.slice(0, 3).map(pr => pr.name),
      priority: 'medium',
    });
  }

  // Customer follow-ups
  if (sections.recentCustomerChanges?.length > 0) {
    blocks.push({
      id:       'block_customers',
      label:    'Customer Follow-ups',
      duration: '30 min',
      time:     '2:00 PM',
      items:    sections.recentCustomerChanges.slice(0, 3).map(c => c.name),
      priority: 'medium',
    });
  }

  // EOD: blocked work
  if (sections.blockedWork?.length > 0) {
    blocks.push({
      id:       'block_unblock',
      label:    'Unblock Team',
      duration: '30 min',
      time:     '4:30 PM',
      items:    sections.blockedWork.slice(0, 3).map(w => w.name),
      priority: 'high',
    });
  }

  // Build simple schedule summary
  for (const block of blocks) {
    schedule.push({
      time:  block.time,
      title: block.label,
      type:  block.priority,
    });
  }

  return { focusBlocks: blocks, schedule };
}

// ── AI enrichment ─────────────────────────────────────────────────────────────

async function _enrichWithAI(heuristic, brief, insights) {
  const sections = brief.sections || {};
  const highInsights = insights.filter(i => i.severity === 'high').map(i => i.title);

  const prompt = `You are FLOW, the enterprise workspace AI. Based on this workspace state, output a daily plan as JSON.

WORKSPACE STATE:
- Critical items: ${brief.meta?.criticalCount || 0}
- Today's meetings: ${sections.todaysMeetings?.length || 0} (${sections.todaysMeetings?.slice(0,2).map(m=>m.name).join(', ') || 'none'})
- Active incidents: ${sections.incidentSummary?.active || 0}
- Blocked work: ${sections.blockedWork?.length || 0} items
- PRs awaiting review: ${sections.importantPullRequests?.length || 0}
- High alerts: ${highInsights.slice(0,3).join(', ') || 'none'}
- Top suggested action: ${sections.suggestedActions?.[0]?.text || 'none'}

Output JSON: { "focusBlocks": [{"id":"string","label":"string","duration":"string","time":"string","items":["string"],"priority":"critical|high|medium|low"}], "schedule": [{"time":"string","title":"string","type":"string"}] }
Return ONLY the JSON object.`;

  try {
    const result = await ask({
      taskType: TaskType.PLAN,
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 600,
      temperature: 0.3,
    });
    const raw    = (result.text || '').replace(/```json?|```/g, '').trim();
    const parsed = JSON.parse(raw);
    if (parsed.focusBlocks && parsed.schedule) return parsed;
    return {};
  } catch {
    return {};
  }
}

// ── Reminders ─────────────────────────────────────────────────────────────────

function _buildReminders(brief) {
  const reminders = [];
  const sections  = brief.sections || {};

  if (sections.waitingForYou?.length > 0) {
    reminders.push({
      text:    `${sections.waitingForYou.length} item${sections.waitingForYou.length > 1 ? 's' : ''} waiting for your review`,
      urgency: 'medium',
    });
  }

  if (sections.blockedWork?.length > 0) {
    reminders.push({
      text:    `${sections.blockedWork.length} team member${sections.blockedWork.length > 1 ? 's' : ''} blocked — follow up`,
      urgency: 'high',
    });
  }

  if ((sections.todaysMeetings?.length || 0) > 0) {
    reminders.push({
      text:    `${sections.todaysMeetings.length} meeting${sections.todaysMeetings.length > 1 ? 's' : ''} today`,
      urgency: 'low',
    });
  }

  return reminders;
}

// ── Utils ─────────────────────────────────────────────────────────────────────

function _subtractMinutes(isoTs, minutes) {
  try {
    const d = new Date(new Date(isoTs).getTime() - minutes * 60_000);
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '9:00 AM';
  }
}
