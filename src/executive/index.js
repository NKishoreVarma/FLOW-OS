/**
 * Executive Operations Intelligence — public API barrel.
 *
 * Engines:
 *   briefingEngine       — generate 7 brief types (morning/daily/weekly/monthly/quarterly/board/investor)
 *   healthEngine         — domain health scores (engineering/infra/support/sales/finance/hr/security/ops)
 *   kpiEngine            — 12 automatically computed KPIs from connected systems
 *   riskEngine           — 9 risk categories continuously detected
 *   recommendationEngine — prioritized, evidence-backed recommendations
 *   timelineEngine       — chronological operational timeline
 */

export { generateBrief, BRIEF_TYPES }                        from './briefingEngine.js';
export { computeHealth, computeDomainHealth }                from './healthEngine.js';
export { computeKPIs, computeKPI, KPI_NAMES }               from './kpiEngine.js';
export { detectRisks, detectCategoryRisk, RISK_CATEGORIES } from './riskEngine.js';
export { generateRecommendations }                           from './recommendationEngine.js';
export { buildTimeline }                                     from './timelineEngine.js';
