/**
 * BusinessImpactAnalyzer — translates technical findings into business language.
 *
 * Produces:
 *   - impactLevel: critical | high | medium | low
 *   - affectedAreas: which business functions are impacted
 *   - revenueRisk: dollar/percentage estimate if applicable
 *   - customerRisk: number of affected customers if known
 *   - operationalRisk: operational continuity impact
 *   - timeToImpact: how quickly will the business feel this
 *   - businessSummary: one sentence for executive briefing
 */

import { ask }      from '../BrainRouter.js';
import { TaskType } from '../types.js';

const BUSINESS_AREA_MAP = {
  engineering:  ['product_delivery', 'uptime', 'developer_velocity'],
  incidents:    ['uptime', 'customer_experience', 'revenue'],
  customers:    ['revenue', 'customer_retention', 'nps'],
  meetings:     ['decision_velocity', 'team_alignment'],
  people:       ['talent_retention', 'productivity', 'hiring'],
  projects:     ['product_delivery', 'roadmap', 'stakeholder_confidence'],
  finance:      ['revenue', 'cost_efficiency', 'cash_flow'],
  security:     ['compliance', 'reputation', 'uptime'],
  knowledge:    ['decision_quality', 'onboarding_efficiency'],
  general:      ['operations'],
};

/**
 * @param {import('./IntentAnalyzer.js').IntentResult} intent
 * @param {import('./ReasoningEngine.js').ReasoningResult} reasoning
 * @param {import('./VerificationEngine.js').VerificationResult} verification
 * @param {import('./EvidenceRanker.js').RankedEvidence} ranked
 * @returns {Promise<BusinessImpact>}
 */
export async function analyzeBusinessImpact(intent, reasoning, verification, ranked, { fast = false } = {}) {
  const affectedAreas = BUSINESS_AREA_MAP[intent.domain] || ['operations'];

  // Fast path (chat) or low-urgency: heuristic impact only — no LLM round-trip.
  if (fast || (intent.urgency === 'low' && verification.trustLevel !== 'high')) {
    return _heuristicImpact(intent, reasoning, affectedAreas, verification);
  }

  const contextSummary = [
    reasoning.narrative,
    ...reasoning.findings.slice(0, 3).map(f => f.finding),
  ].join('\n');

  const prompt = `As a Chief Operating Officer analyzing an enterprise situation, assess the business impact.

SITUATION:
${contextSummary}

DOMAIN: ${intent.domain}
URGENCY: ${intent.urgency}
BUSINESS AREAS INVOLVED: ${affectedAreas.join(', ')}

Assess business impact. Return JSON:
{
  "impactLevel": "critical|high|medium|low",
  "affectedAreas": ["list of impacted business functions"],
  "timeToImpact": "immediate|hours|days|weeks|months",
  "revenueRisk": "brief statement or null",
  "customerRisk": "brief statement or null",
  "operationalRisk": "brief statement or null",
  "complianceRisk": "brief statement or null",
  "businessSummary": "one executive-facing sentence"
}

Return JSON only. Be specific to the situation, not generic.`;

  try {
    const result = await ask({
      taskType: TaskType.BRIEF,
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 400,
      temperature: 0.2,
    });

    const raw    = (result.text || '').replace(/```json?|```/g, '').trim();
    const parsed = JSON.parse(raw);

    return {
      impactLevel:      parsed.impactLevel      || _deriveImpactLevel(intent, verification),
      affectedAreas:    parsed.affectedAreas    || affectedAreas,
      timeToImpact:     parsed.timeToImpact     || _deriveTimeToImpact(intent),
      revenueRisk:      parsed.revenueRisk      || null,
      customerRisk:     parsed.customerRisk     || null,
      operationalRisk:  parsed.operationalRisk  || null,
      complianceRisk:   parsed.complianceRisk   || null,
      businessSummary:  parsed.businessSummary  || reasoning.narrative,
    };
  } catch {
    return _heuristicImpact(intent, reasoning, affectedAreas, verification);
  }
}

function _heuristicImpact(intent, reasoning, affectedAreas, verification) {
  return {
    impactLevel:     _deriveImpactLevel(intent, verification),
    affectedAreas,
    timeToImpact:    _deriveTimeToImpact(intent),
    revenueRisk:     intent.domain === 'customers' || intent.domain === 'incidents' ? 'Potential revenue impact — assess customer-facing services' : null,
    customerRisk:    intent.domain === 'incidents' ? 'Customer-facing services may be affected' : null,
    operationalRisk: reasoning.gaps.length > 2 ? 'Operational risk unclear due to evidence gaps' : null,
    complianceRisk:  intent.domain === 'security' ? 'Security domain — compliance impact possible' : null,
    businessSummary: reasoning.narrative || 'Business impact assessment requires more evidence.',
  };
}

function _deriveImpactLevel(intent, verification) {
  if (intent.urgency === 'high' || intent.domain === 'incidents') return 'high';
  if (intent.domain === 'security') return 'high';
  if (intent.urgency === 'medium' || verification.trustLevel === 'low') return 'medium';
  return 'low';
}

function _deriveTimeToImpact(intent) {
  if (intent.urgency === 'high') return 'immediate';
  if (intent.timeframe === 'present') return 'hours';
  if (intent.timeframe === 'past_24h') return 'hours';
  if (intent.timeframe === 'past_week') return 'days';
  return 'weeks';
}
