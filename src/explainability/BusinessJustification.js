/**
 * BusinessJustification — expresses impact in the six terms leaders care about:
 * revenue · customer · engineering · operational · time · risk. Wraps the Phase
 * 9.1 BusinessImpactAnalyzer output and enriches customer/revenue impact with the
 * Operational Graph blast radius (Phase 11.1) when available.
 */

export function buildBusinessJustification({ businessImpact = {}, graphImpact = null, domain, actions = {} } = {}) {
  const areas = new Set((businessImpact.affectedAreas || []).map(a => String(a).toLowerCase()));
  const affectedCustomers = graphImpact?.affectedCustomers || [];

  const revenue = businessImpact.revenueRisk
    || (affectedCustomers.length ? `${affectedCustomers.length} customer account(s) in the blast radius — potential revenue exposure.` : null)
    || (domain === 'customers' ? 'Possible revenue impact via customer accounts.' : null);

  const customer = businessImpact.customerRisk
    || (affectedCustomers.length ? `Directly affects: ${affectedCustomers.slice(0, 5).map(c => c.name || c.id).join(', ')}.` : null)
    || (areas.has('customers') || areas.has('support') ? 'Customer-facing areas may be affected.' : null);

  const engineering = (areas.has('engineering') || areas.has('operations') || domain === 'engineering')
    ? (businessImpact.operationalRisk || 'Engineering effort or delivery timelines may be affected.')
    : null;

  const operational = businessImpact.operationalRisk
    || (businessImpact.impactLevel === 'high' ? 'Elevated operational load likely.' : null);

  const time = businessImpact.timeToImpact
    ? `Time to impact: ${businessImpact.timeToImpact}.`
    : null;

  const risk = _riskStatement(businessImpact.impactLevel, actions.riskIfNoAction, graphImpact);

  return {
    revenue, customer, engineering, operational, time, risk,
    level: businessImpact.impactLevel || 'low',
    summary: businessImpact.summary || businessImpact.businessSummary || 'Business impact is limited or unclear from current evidence.',
    graphBlastRadius: graphImpact ? { impacted: graphImpact.impactedCount, score: graphImpact.impactScore } : null,
  };
}

function _riskStatement(level, riskIfNoAction, graphImpact) {
  const parts = [];
  if (level) parts.push(`${level} overall impact`);
  if (riskIfNoAction) parts.push(`if no action: ${String(riskIfNoAction).slice(0, 140)}`);
  if (graphImpact?.impactScore) parts.push(`graph blast-radius score ${graphImpact.impactScore}`);
  return parts.length ? parts.join('; ') : 'Risk appears limited on current evidence.';
}
