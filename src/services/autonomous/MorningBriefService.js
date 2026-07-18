/**
 * MorningBriefService — compiles the daily 10-section operational brief.
 *
 * Runs at 8AM per workspace. Pulls live data from CapabilityDispatcher,
 * scores it through PriorityEngine, and synthesises a structured brief
 * that is stored in Redis and pushed via WebSocket.
 *
 * 10 sections:
 *   1. Executive Summary
 *   2. Critical Risks
 *   3. Today's Meetings
 *   4. Blocked Work
 *   5. Waiting For You
 *   6. Recent Customer Changes
 *   7. Important Pull Requests
 *   8. Incident Summary
 *   9. Suggested Actions
 *  10. Top Priorities
 */

import Redis from 'ioredis';
import { ask }                    from '../../ai/BrainRouter.js';
import { TaskType }               from '../../ai/types.js';
import { dispatchCapabilities }   from '../../ai/reasoning/CapabilityDispatcher.js';
import { buildPlanForAll }        from '../../ai/reasoning/CapabilityPlanner.js';
import { prioritize }             from './PriorityEngine.js';
import { updateDigest }           from './WorkspaceDigestService.js';
import { generateProactiveRecommendations } from './ProactiveRecommendationEngine.js';
import { broadcastToWorkspace }   from '../socketService.js';
import { logger }                 from '../../utils/logger.js';

const redis = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
  maxRetriesPerRequest: null,
  lazyConnect: true,
});
redis.connect().catch(() => {});

const BRIEF_KEY      = wsId => `flow:workspace:${wsId}:brief`;
const BRIEF_TTL_SECS = 86_400; // 24h — refreshed each morning

/**
 * Compile the full morning brief for a workspace and store it.
 *
 * @param {string} workspaceId
 * @param {string} orgId
 * @returns {Promise<MorningBrief>}
 */
export async function compileMorningBrief(workspaceId, orgId) {
  const wsId = String(workspaceId);
  logger.rag(`[MorningBrief] Compiling brief for ${wsId}`);

  const plan        = buildPlanForAll();
  const capResults  = await dispatchCapabilities(wsId, plan, { domain: 'general', question: 'morning brief' });
  const recs        = await generateProactiveRecommendations(wsId, capResults);

  // Flatten all records for priority scoring
  const allItems  = _flattenCapabilityItems(capResults);
  const scored    = prioritize(allItems);
  const critical  = scored.filter(i => i.scores.priority === 'critical');
  const high      = scored.filter(i => i.scores.priority === 'high');

  const brief = {
    workspaceId:      wsId,
    generatedAt:      new Date().toISOString(),
    sections:         _compileSections(capResults, scored, critical, high, recs),
    topPriorities:    scored.slice(0, 5),
    recommendations:  recs.slice(0, 5),
    meta: {
      totalItemsScored: scored.length,
      criticalCount:    critical.length,
      highCount:        high.length,
    },
  };

  // Inject AI executive summary
  brief.sections.executiveSummary = await _generateExecutiveSummary(wsId, brief);

  // Persist and broadcast
  await redis.set(BRIEF_KEY(wsId), JSON.stringify(brief), 'EX', BRIEF_TTL_SECS).catch(() => {});
  await updateDigest(wsId, capResults);

  broadcastToWorkspace(wsId, 'MORNING_BRIEF_READY', {
    generatedAt:   brief.generatedAt,
    criticalCount: critical.length,
    sections:      Object.keys(brief.sections),
  });

  logger.rag(`[MorningBrief] Done — ${scored.length} items scored, ${critical.length} critical`);
  return brief;
}

/**
 * Get the most recently compiled brief for a workspace.
 * Returns null if no brief has been compiled today.
 *
 * @param {string} workspaceId
 * @returns {Promise<MorningBrief|null>}
 */
export async function getMorningBrief(workspaceId) {
  const raw = await redis.get(BRIEF_KEY(String(workspaceId))).catch(() => null);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

// ── Section builders ──────────────────────────────────────────────────────────

function _compileSections(capResults, scored, critical, high, recs) {
  const now = Date.now();

  // 3. Today's meetings
  const todayMeetings = (capResults.meetings?.records || []).filter(m => {
    if (!m.ts) return false;
    const d = new Date(m.ts);
    const today = new Date();
    return d.getFullYear() === today.getFullYear() &&
           d.getMonth() === today.getMonth() &&
           d.getDate() === today.getDate();
  });

  // 4. Blocked work
  const blocked = scored.filter(i =>
    /block|stuck|waiting|hold/i.test(i.name + JSON.stringify(i.metadata || {}))
  );

  // 5. Waiting for you — PRs/issues awaiting review
  const waitingForYou = scored.filter(i =>
    (i.type === 'PR' || i.type === 'ISSUE') &&
    /review|approve|awaiting/i.test(JSON.stringify(i.metadata || {}))
  );

  // 6. Recent customer changes
  const customerChanges = (capResults.customers?.records || []).concat(
    (capResults.memory?.records || []).filter(r => r.type === 'CUSTOMER_EVENT' || r.type === 'PROJECT_EVENT')
  ).slice(0, 5);

  // 7. Important PRs
  const importantPRs = scored
    .filter(i => i.type === 'PR')
    .slice(0, 5);

  // 8. Incident summary
  const incidents = capResults.incidents?.records || [];
  const activeIncidents = incidents.filter(r => !r.status || r.status === 'open');

  // 9. Suggested actions (from recommendations + critical items)
  const suggestedActions = [
    ...recs.slice(0, 3).map(r => ({ text: r.title, detail: r.detail, urgency: r.urgency })),
    ...critical.slice(0, 2).map(i => ({ text: `Resolve: ${i.name}`, detail: `Priority: CRITICAL`, urgency: 'high' })),
  ].slice(0, 5);

  return {
    executiveSummary: '', // filled by AI after all sections are built
    criticalRisks: critical.slice(0, 5).map(i => ({
      name:     i.name,
      type:     i.type,
      priority: i.scores.priority,
      urgency:  i.scores.urgency,
    })),
    todaysMeetings: todayMeetings.map(m => ({
      name: m.name,
      ts:   m.ts,
      id:   m.id,
    })),
    blockedWork: blocked.slice(0, 5).map(i => ({
      name: i.name,
      type: i.type,
      id:   i.id,
    })),
    waitingForYou: waitingForYou.slice(0, 5).map(i => ({
      name: i.name,
      type: i.type,
      id:   i.id,
    })),
    recentCustomerChanges: customerChanges.map(c => ({
      name:    c.name,
      type:    c.type,
      summary: c.summary || c.body || '',
    })),
    importantPullRequests: importantPRs.map(pr => ({
      name:     pr.name,
      id:       pr.id,
      urgency:  pr.scores.urgency,
      readiness: pr.metadata?.mergeReadinessScore,
    })),
    incidentSummary: {
      total:   incidents.length,
      active:  activeIncidents.length,
      items:   activeIncidents.slice(0, 3).map(i => ({ name: i.name, id: i.id })),
    },
    suggestedActions,
  };
}

// ── AI executive summary ──────────────────────────────────────────────────────

async function _generateExecutiveSummary(wsId, brief) {
  const { sections, meta } = brief;
  const prompt = `You are FLOW, the enterprise operational brain. Write a 3-sentence executive summary of this workspace morning brief.

DATA:
- Critical risks: ${meta.criticalCount} (${sections.criticalRisks.slice(0,2).map(r=>r.name).join(', ') || 'none'})
- Today's meetings: ${sections.todaysMeetings.length}
- Active incidents: ${sections.incidentSummary.active}
- Blocked work items: ${sections.blockedWork.length}
- Important PRs: ${sections.importantPullRequests.length}
- Top suggested action: ${sections.suggestedActions[0]?.text || 'none'}

Write 3 crisp sentences: what needs attention today, biggest risk, and one specific recommended action.
No hedge words. No "As an AI". Write as if you are the workspace itself reporting to its owners.`;

  try {
    const result = await ask({
      taskType: TaskType.BRIEF,
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 200,
      temperature: 0.4,
    });
    return (result.text || '').trim();
  } catch {
    // Heuristic fallback
    const parts = [];
    if (meta.criticalCount > 0) {
      parts.push(`${meta.criticalCount} critical item${meta.criticalCount > 1 ? 's' : ''} require attention today.`);
    }
    if (sections.incidentSummary.active > 0) {
      parts.push(`${sections.incidentSummary.active} active incident${sections.incidentSummary.active > 1 ? 's' : ''} are in progress.`);
    }
    if (sections.suggestedActions[0]) {
      parts.push(`Recommended: ${sections.suggestedActions[0].text}.`);
    }
    return parts.join(' ') || `Workspace has ${meta.totalItemsScored} items in the operational pipeline.`;
  }
}

// ── Flatten all capability records into scored items ──────────────────────────

function _flattenCapabilityItems(capResults) {
  const items = [];
  for (const [cap, result] of Object.entries(capResults)) {
    if (!result?.records) continue;
    for (const r of result.records) {
      items.push({
        ...r,
        _capability: cap,
      });
    }
  }
  return items;
}
