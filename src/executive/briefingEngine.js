/**
 * Executive Briefing Engine — generates 7 brief types.
 *
 * Brief types:
 *   morning     — daily morning brief (what happened overnight, today's priorities)
 *   daily       — end-of-day summary
 *   weekly      — 7-day operational summary
 *   monthly     — 30-day trends and health
 *   quarterly   — QBR with KPI trends and strategic risks
 *   board       — board meeting brief (company health, risks, KPIs)
 *   investor    — investor update (growth metrics, product, team)
 *
 * Every brief:
 *   - Pulls live data from health, KPI, risk, recommendation, and timeline engines
 *   - Optionally uses the Cognitive Brain (multi-agent) for narrative synthesis
 *   - Falls back to deterministic structured Markdown when LLM is unavailable
 */

import { computeHealth }           from './healthEngine.js';
import { computeKPIs }             from './kpiEngine.js';
import { detectRisks }             from './riskEngine.js';
import { generateRecommendations } from './recommendationEngine.js';
import { buildTimeline }           from './timelineEngine.js';
import { reason as llmReason }     from '../ai/BrainRouter.js';

const BRIEF_TYPES  = ['morning', 'daily', 'weekly', 'monthly', 'quarterly', 'board', 'investor'];
const WINDOW_MAP   = { morning: 1, daily: 1, weekly: 7, monthly: 30, quarterly: 90, board: 90, investor: 90 };

/**
 * Generate an executive brief.
 *
 * @param {string} workspaceId
 * @param {object} [opts]
 * @param {string} [opts.type='morning']  — brief type
 * @param {string} [opts.role]            — CTO | CEO | CFO | etc.
 * @param {boolean} [opts.useLLM=true]    — attempt LLM narrative synthesis
 * @returns {Promise<ExecutiveBrief>}
 */
export async function generateBrief(workspaceId, { type = 'morning', role, useLLM = true } = {}) {
  if (!BRIEF_TYPES.includes(type)) throw new Error(`Unknown brief type: ${type}. Valid: ${BRIEF_TYPES.join(', ')}`);

  const ws     = String(workspaceId);
  const window = WINDOW_MAP[type];

  // Gather all intelligence in parallel
  const [healthRes, kpiRes, riskRes, recRes, timelineRes] = await Promise.allSettled([
    computeHealth(ws, { windowDays: window }),
    computeKPIs(ws, { windowDays: window }),
    detectRisks(ws, { windowDays: window }),
    generateRecommendations(ws, { windowDays: window, limit: 10 }),
    buildTimeline(ws, { windowDays: window, limit: 30 }),
  ]);

  const health   = healthRes.status   === 'fulfilled' ? healthRes.value   : null;
  const kpis     = kpiRes.status      === 'fulfilled' ? kpiRes.value      : null;
  const risks    = riskRes.status     === 'fulfilled' ? riskRes.value     : null;
  const recs     = recRes.status      === 'fulfilled' ? recRes.value      : null;
  const timeline = timelineRes.status === 'fulfilled' ? timelineRes.value : null;

  const dataCtx = { health, kpis, risks, recs, timeline, type, role, window };

  // Attempt LLM narrative
  let narrative = null;
  if (useLLM) {
    try { narrative = await _llmNarrative(ws, dataCtx); } catch { /* fallback below */ }
  }

  if (!narrative) narrative = _deterministicNarrative(dataCtx);

  return {
    workspaceId: ws,
    generatedAt: new Date().toISOString(),
    type,
    role:        role || null,
    windowDays:  window,
    narrative,
    sections:    _buildSections(dataCtx),
    overallHealth:  health?.overall?.score ?? null,
    healthState:    health?.overall?.state ?? null,
    criticalRisks:  (risks?.risks ?? []).filter(r => r.level === 'critical').length,
    topRecommendations: (recs?.recommendations ?? []).slice(0, 5),
    kpiSnapshot:  _kpiSnapshot(kpis),
    generatedWith: narrative.fromLLM ? 'llm' : 'deterministic',
  };
}

// ── LLM narrative ─────────────────────────────────────────────────────────────

async function _llmNarrative(ws, ctx) {
  const { type, role, health, risks, recs, kpis, timeline, window } = ctx;

  const overallScore  = health?.overall?.score ?? 'N/A';
  const criticals     = (risks?.risks ?? []).filter(r => r.level === 'critical');
  const highs         = (risks?.risks ?? []).filter(r => r.level === 'high');
  const topRec        = recs?.recommendations?.[0];
  const recentEvents  = (timeline?.entries ?? []).slice(0, 5).map(e => `- ${e.title} (${_relTime(e.ts)})`).join('\n');
  const kpiLines      = (kpis?.kpis ?? []).filter(k => k.value !== null).slice(0, 6)
    .map(k => `- ${k.label}: ${k.value} ${k.unit}`).join('\n');
  const criticalDomains = (health?.overall?.criticalDomains ?? []).join(', ') || 'none';

  const roleCtx = role ? `You are briefing the ${role}.` : 'You are briefing a senior executive.';

  const prompt = `${roleCtx} Generate a concise executive ${type} brief for this organization.

DATA SUMMARY:
Overall health: ${overallScore}/100 (${health?.overall?.state ?? 'unknown'})
Critical domains: ${criticalDomains}
Active risks: ${criticals.length} critical, ${highs.length} high
Top recommendation: ${topRec?.title ?? 'none'}
Time window: past ${window} day(s)

KEY METRICS:
${kpiLines || 'No KPI data available'}

RECENT EVENTS:
${recentEvents || 'No recent events'}

INSTRUCTIONS:
- Write in a direct, executive tone — no filler
- Lead with what needs immediate attention
- Summarize the state of the business in 3-4 sentences
- List 3 key priorities for the ${type === 'morning' ? 'day' : type === 'weekly' ? 'week' : 'period'}
- Keep total length under 300 words
- Do not invent data not in the summary above`;

  const result = await llmReason(prompt, { taskType: 'synthesis', maxTokens: 600 });
  if (!result) throw new Error('LLM returned empty response');

  return { text: result, fromLLM: true };
}

// ── Deterministic narrative ────────────────────────────────────────────────────

function _deterministicNarrative(ctx) {
  const { type, role, health, risks, recs, timeline, window } = ctx;

  const overallScore = health?.overall?.score;
  const overallState = health?.overall?.state ?? 'unknown';
  const criticals    = (risks?.risks ?? []).filter(r => r.level === 'critical');
  const highs        = (risks?.risks ?? []).filter(r => r.level === 'high');
  const topRecs      = (recs?.recommendations ?? []).slice(0, 3);
  const critDomains  = health?.overall?.criticalDomains ?? [];

  const lines = [];

  const typeLabels = {
    morning: 'Morning Brief', daily: 'Daily Summary', weekly: 'Weekly Summary',
    monthly: 'Monthly Summary', quarterly: 'Quarterly Business Review',
    board: 'Board Meeting Brief', investor: 'Investor Update',
  };

  lines.push(`# ${typeLabels[type] || 'Executive Brief'}`);
  lines.push(`*${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}*`);
  if (role) lines.push(`*Prepared for: ${role}*`);
  lines.push('');

  // Situation
  lines.push('## Situation');
  if (overallScore !== null && overallScore !== undefined) {
    lines.push(`Company health score: **${overallScore}/100** (${overallState})`);
  }
  if (critDomains.length) {
    lines.push(`Critical domains requiring attention: **${critDomains.join(', ')}**`);
  }
  if (criticals.length) {
    lines.push(`**${criticals.length} critical risk${criticals.length > 1 ? 's' : ''}** require immediate action.`);
    criticals.slice(0, 3).forEach(r => lines.push(`  - ${r.title}`));
  } else if (highs.length) {
    lines.push(`${highs.length} high-priority risk${highs.length > 1 ? 's' : ''} require attention.`);
  } else {
    lines.push('No critical risks detected. Operations are within normal parameters.');
  }
  lines.push('');

  // Key metrics for longer briefs
  if (['weekly', 'monthly', 'quarterly', 'board', 'investor'].includes(type)) {
    const healthDomains = (health?.domains ?? []).filter(d => d.state !== 'healthy');
    if (healthDomains.length) {
      lines.push('## Domain Health');
      healthDomains.forEach(d => {
        lines.push(`- **${_capitalize(d.domain)}**: ${d.score}/100 — ${d.state}${d.trend !== 'stable' ? ` (${d.trend})` : ''}`);
      });
      lines.push('');
    }
  }

  // Recent activity
  const recentEvents = (timeline?.entries ?? []).slice(0, 5);
  if (recentEvents.length) {
    lines.push(`## Recent Activity (past ${window} day${window > 1 ? 's' : ''})`);
    recentEvents.forEach(e => lines.push(`- ${e.title} *(${_relTime(e.ts)})*`));
    lines.push('');
  }

  // Priorities / recommendations
  if (topRecs.length) {
    lines.push('## Priorities');
    topRecs.forEach((r, i) => {
      lines.push(`${i + 1}. **[${_capitalize(r.severity)}]** ${r.title}`);
      if (r.estimatedBusinessImpact) lines.push(`   *Impact: ${r.estimatedBusinessImpact}*`);
    });
    lines.push('');
  }

  // Board/investor-specific sections
  if (type === 'board' || type === 'investor') {
    lines.push('## Risk Summary');
    if (risks?.risks?.length) {
      const byCategory = {};
      risks.risks.forEach(r => { byCategory[r.category] = (byCategory[r.category] || []).concat(r); });
      Object.entries(byCategory).forEach(([cat, rs]) => {
        const worst = rs.reduce((a, b) => b.score > a.score ? b : a);
        lines.push(`- **${_formatCategory(cat)}**: ${worst.level} — ${worst.title}`);
      });
    } else {
      lines.push('No significant risks detected.');
    }
    lines.push('');
  }

  lines.push('---');
  lines.push(`*Generated by FLOW OS Executive Intelligence — ${new Date().toISOString()}*`);

  return { text: lines.join('\n'), fromLLM: false };
}

// ── Section builder ───────────────────────────────────────────────────────────

function _buildSections(ctx) {
  const { health, kpis, risks, recs, timeline } = ctx;

  return {
    health: health ? {
      overall:     health.overall,
      domains:     (health.domains ?? []).map(d => ({ domain: d.domain, score: d.score, state: d.state, trend: d.trend })),
    } : null,

    risks: risks ? {
      summary:  risks.summary,
      critical: (risks.risks ?? []).filter(r => r.level === 'critical').slice(0, 5),
      high:     (risks.risks ?? []).filter(r => r.level === 'high').slice(0, 5),
    } : null,

    recommendations: (recs?.recommendations ?? []).slice(0, 8),

    kpis: _kpiSnapshot(kpis),

    recentEvents: (timeline?.entries ?? []).slice(0, 10),
  };
}

function _kpiSnapshot(kpis) {
  if (!kpis) return [];
  return (kpis.kpis ?? [])
    .filter(k => k.value !== null)
    .map(k => ({ name: k.name, label: k.label, value: k.value, unit: k.unit, trend: k.trend, domain: k.domain }));
}

function _relTime(ts) {
  const diff = Date.now() - new Date(ts).getTime();
  const h    = Math.floor(diff / 3_600_000);
  const d    = Math.floor(diff / 86_400_000);
  if (d >= 1) return `${d}d ago`;
  if (h >= 1) return `${h}h ago`;
  return 'recently';
}

function _capitalize(s) { return s ? s[0].toUpperCase() + s.slice(1) : ''; }

function _formatCategory(cat) {
  return cat.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export { BRIEF_TYPES };
