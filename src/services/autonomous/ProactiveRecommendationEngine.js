/**
 * ProactiveRecommendationEngine — generates context-aware recommendations
 * without waiting for the user to ask.
 *
 * Unlike operationalIntelligenceService (which generates generic patterns),
 * this engine uses live capability data to generate specific, timely, actionable items.
 *
 * Examples:
 *   "Review and approve Rahul's PR before the 2PM deployment"
 *   "Acme Corp has been waiting 3 days — follow up today"
 *   "INC-021 has been open 6 hours with no owner assigned"
 */

import { ask }      from '../../ai/BrainRouter.js';
import { TaskType } from '../../ai/types.js';

/**
 * @param {string} workspaceId
 * @param {import('../../ai/reasoning/CapabilityDispatcher.js').CapabilityResults} capResults
 * @returns {Promise<Recommendation[]>}
 */
export async function generateProactiveRecommendations(workspaceId, capResults) {
  const heuristic = _heuristicRecommendations(capResults);
  const llm       = await _llmRecommendations(capResults, heuristic);

  // Merge: LLM recs take precedence, heuristic fills gaps
  const merged = [...llm];
  for (const h of heuristic) {
    if (!merged.find(r => r.category === h.category)) merged.push(h);
  }

  return merged.slice(0, 8).map((r, i) => ({ ...r, rank: i + 1 }));
}

// ── Heuristic recommendations (always fires, no LLM) ─────────────────────────

function _heuristicRecommendations(capResults) {
  const recs = [];
  const now  = Date.now();

  // Incidents
  const incidents = capResults.incidents?.records || [];
  const activeInc = incidents.filter(r => !r.status || r.status === 'open');
  if (activeInc.length > 0) {
    recs.push({
      id:          `rec_inc_${Date.now()}`,
      category:    'incident',
      title:       `Review ${activeInc.length} active incident${activeInc.length > 1 ? 's' : ''}`,
      detail:      `Most critical: "${activeInc[0].name}"`,
      urgency:     'high',
      confidence:  90,
      actionType:  'escalate',
      actionLabel: 'View Incidents',
      ts:          new Date().toISOString(),
    });
  }

  // Stale PRs
  const prs = capResults.engineering?.records?.filter(r => r.type === 'PR') || [];
  const stalePRs = prs.filter(pr => {
    if (!pr.ts) return false;
    const ageDays = (now - new Date(pr.ts).getTime()) / 86_400_000;
    return ageDays > 2;
  });
  if (stalePRs.length > 0) {
    recs.push({
      id:          `rec_pr_${Date.now()}`,
      category:    'engineering',
      title:       `${stalePRs.length} pull request${stalePRs.length > 1 ? 's' : ''} waiting for review`,
      detail:      `Oldest: "${stalePRs[0].name}"`,
      urgency:     'medium',
      confidence:  85,
      actionType:  'review',
      actionLabel: 'Review PRs',
      ts:          new Date().toISOString(),
    });
  }

  // Upcoming meetings
  const meetings = capResults.meetings?.records || [];
  const soonMeetings = meetings.filter(m => {
    if (!m.ts) return false;
    const hoursUntil = (new Date(m.ts).getTime() - now) / 3_600_000;
    return hoursUntil > 0 && hoursUntil < 2;
  });
  if (soonMeetings.length > 0) {
    recs.push({
      id:          `rec_mtg_${Date.now()}`,
      category:    'meetings',
      title:       `Prepare for "${soonMeetings[0].name}"`,
      detail:      'Meeting starts in less than 2 hours',
      urgency:     'high',
      confidence:  95,
      actionType:  'prepare',
      actionLabel: 'View Meeting Prep',
      ts:          new Date().toISOString(),
    });
  }

  // Customer risk
  const customers = capResults.customers?.records || [];
  const atRiskCustomers = customers.filter(c =>
    /churn|at.risk|escalat|cancel|unhappy/i.test(JSON.stringify(c))
  );
  if (atRiskCustomers.length > 0) {
    recs.push({
      id:          `rec_cust_${Date.now()}`,
      category:    'customers',
      title:       `${atRiskCustomers.length} customer${atRiskCustomers.length > 1 ? 's' : ''} at risk`,
      detail:      `"${atRiskCustomers[0].name}" needs attention`,
      urgency:     'high',
      confidence:  80,
      actionType:  'follow_up',
      actionLabel: 'View Customer',
      ts:          new Date().toISOString(),
    });
  }

  // Existing system recommendations
  const sysRecs = capResults.recommendations?.records || [];
  for (const sr of sysRecs.slice(0, 2)) {
    recs.push({
      id:          `rec_sys_${Date.now()}_${sr.id || Math.random()}`,
      category:    'system',
      title:       sr.name || sr.summary,
      detail:      sr.summary || '',
      urgency:     sr.priority === 'critical' ? 'high' : 'medium',
      confidence:  sr.confidence || 70,
      actionType:  'review',
      actionLabel: 'Take Action',
      ts:          sr.ts || new Date().toISOString(),
    });
  }

  return recs;
}

// ── LLM-enriched recommendations ──────────────────────────────────────────────

async function _llmRecommendations(capResults, heuristicRecs) {
  // Build a compact summary of the workspace state for the LLM
  const state = {
    incidents:      (capResults.incidents?.records || []).slice(0, 3).map(r => r.name),
    prs:            (capResults.engineering?.records || []).filter(r => r.type === 'PR').slice(0, 3).map(r => r.name),
    meetings:       (capResults.meetings?.records || []).slice(0, 3).map(r => r.name),
    customers:      (capResults.customers?.records || []).slice(0, 3).map(r => r.name),
    health:         capResults.health?.health?.company_health,
    heuristicCount: heuristicRecs.length,
  };

  if (!state.incidents.length && !state.prs.length && !state.meetings.length) {
    return []; // Not enough data for LLM to add value
  }

  const prompt = `You are FLOW, an enterprise workspace intelligence system. Based on this workspace state, generate 2-3 specific, actionable recommendations.

WORKSPACE STATE:
${JSON.stringify(state, null, 2)}

Return a JSON array of recommendations:
[{
  "category": "incident|engineering|meetings|customers|general",
  "title": "specific actionable title (max 10 words)",
  "detail": "one sentence explaining why this matters now",
  "urgency": "high|medium|low",
  "confidence": 70-95,
  "actionType": "review|approve|prepare|follow_up|escalate|investigate",
  "actionLabel": "2-3 word button label"
}]

Be specific. Reference actual items from the workspace state. Return JSON array only.`;

  try {
    const result = await ask({
      taskType: TaskType.CHAT,
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 400,
      temperature: 0.3,
    });
    const raw    = (result.text || '').replace(/```json?|```/g, '').trim();
    const parsed = JSON.parse(raw);
    return (Array.isArray(parsed) ? parsed : []).map(r => ({
      id:          `rec_llm_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      ts:          new Date().toISOString(),
      ...r,
    }));
  } catch {
    return [];
  }
}
