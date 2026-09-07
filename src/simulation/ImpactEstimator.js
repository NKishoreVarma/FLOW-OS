/**
 * ImpactEstimator — converts real findings (graph cascade, history, memory) into
 * the simulation's impact dimensions: business · engineering · customer ·
 * operational · knowledge loss · dependencies · timeline, plus a HEURISTIC
 * financial estimate. Scores are derived from measured blast radius and history —
 * not invented. The financial model is explicitly heuristic and states its basis.
 */

const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));
const level = (s) => (s >= 80 ? 'critical' : s >= 60 ? 'high' : s >= 35 ? 'moderate' : 'low');

// Tier → annual value fallback when a customer node has no ARR.
const TIER_ARR = { enterprise: 250_000, mid: 60_000, smb: 18_000 };
const REVENUE_PER_HOUR = 2_500;      // heuristic company revenue exposure per outage hour
const EMPLOYEE_REPLACEMENT = 75_000; // heuristic: recruiting + ramp + lost productivity
const WEEK_OPPORTUNITY_COST = 40_000; // heuristic opportunity cost per week of delay

export function estimate(scenario, findings, plan) {
  const impactedCount = findings.impact?.impactedCount || 0;
  const impactScore   = findings.impact?.impactScore || 0;
  const affectedCustomers = findings.impact?.affectedCustomers || [];
  const depCount = findings.dependencies?.dependencyCount || 0;
  const neighborCount = findings.neighbors?.length || 0;
  const incidentHistory = findings.history?.metrics?.incident?.count || 0;

  const customer = customerImpact(scenario, affectedCustomers, impactedCount);
  const engineering = engineeringImpact(scenario, impactedCount, depCount, findings);
  const operational = operationalImpact(scenario, impactedCount, depCount, incidentHistory);
  const knowledgeLoss = knowledge(scenario, findings);
  const financial = financialEstimate(scenario, affectedCustomers, findings);
  const business = businessImpact(customer, financial, operational);

  return {
    business, engineering, customer, operational, knowledgeLoss, financial,
    dependenciesAffected: {
      count: depCount || neighborCount,
      byType: findings.dependencies?.byType || {},
      items: (findings.dependencies?.dependencies || findings.neighbors?.map(n => n.node) || []).slice(0, 15),
    },
    timelineChanges: timeline(scenario, depCount),
    cascade: { impactedCount, impactScore, byType: findings.impact?.byType || {} },
  };
}

function customerImpact(s, customers, impacted) {
  if (s.type === 'CUSTOMER_CHURN') {
    const arr = s.target?.metadata?.arr;
    const score = arr ? clamp(60 + Math.min(35, arr / 10_000)) : 70;
    return { score, level: level(score), affectedCustomers: [{ id: s.target?.id, name: s.target?.name }], note: `Direct loss of ${s.target?.name || 'the customer'}${arr ? ` (ARR ~$${arr.toLocaleString()})` : ''}.` };
  }
  const n = customers.length;
  const score = clamp(n * 12 + (impacted ? 10 : 0));
  return { score, level: level(score), affectedCustomers: customers.slice(0, 10), note: n ? `${n} customer account(s) in the blast radius.` : 'No direct customer accounts in the blast radius.' };
}

function engineeringImpact(s, impacted, deps, findings) {
  const engImpacted = (findings.impact?.byType?.PULL_REQUEST || 0) + (findings.impact?.byType?.REPOSITORY || 0) + (findings.impact?.byType?.ISSUE || 0);
  const base = { SERVICE_OUTAGE: 55, REPOSITORY_LOSS: 65, RELEASE_SLIP: 50, DEPLOYMENT_POSTPONE: 40, EMPLOYEE_DEPARTURE: 45, PROJECT_CANCEL: 40, INTEGRATION_OUTAGE: 50 }[s.type] || 20;
  const score = clamp(base + engImpacted * 4 + deps * 3);
  return { score, level: level(score), note: `${engImpacted} engineering artifact(s) and ${deps} dependency link(s) affected.` };
}

function operationalImpact(s, impacted, deps, incidents) {
  const score = clamp(impacted * 5 + deps * 3 + incidents * 8 + ({ INTEGRATION_OUTAGE: 40, SERVICE_OUTAGE: 45, TEAM_MERGE: 35 }[s.type] || 15));
  return { score, level: level(score), note: `${impacted} node(s) downstream; ${incidents} related incident(s) in the last 90 days.` };
}

function knowledge(s, findings) {
  if (s.type !== 'EMPLOYEE_DEPARTURE') return { score: level(0) === 'low' ? 10 : 10, level: 'low', note: 'No significant single-person knowledge concentration in this scenario.', atRisk: [] };
  const orphan = findings.orphanRisk || [];
  const owned = findings.ownedAssets || [];
  const backups = findings.backupCandidates || [];
  const score = clamp(orphan.length * 22 + owned.length * 6 + (backups.length === 0 && owned.length ? 25 : 0));
  return {
    score, level: level(score),
    note: `${owned.length} asset(s) owned/authored; ${orphan.length} would have NO remaining owner (bus-factor risk). ${backups.length} potential backup(s).`,
    atRisk: orphan, backups,
  };
}

function financialEstimate(s, customers, findings) {
  const A = [];
  let estimate = null;
  if (s.type === 'CUSTOMER_CHURN') {
    const arr = s.target?.metadata?.arr || TIER_ARR[s.target?.metadata?.tier] || TIER_ARR.mid;
    estimate = arr; A.push(`Annual recurring revenue of the churned account${s.target?.metadata?.arr ? '' : ' (tier-estimated)'}.`);
  } else if (s.type === 'EMPLOYEE_DEPARTURE') {
    const orphanMult = 1 + (findings.orphanRisk?.length || 0) * 0.25;
    estimate = Math.round(EMPLOYEE_REPLACEMENT * orphanMult); A.push('Recruiting + onboarding + ~6mo productivity ramp; scaled up by unowned critical assets.');
  } else if (s.type === 'SERVICE_OUTAGE' || s.type === 'INTEGRATION_OUTAGE') {
    const hours = s.params?.hours || 6; estimate = REVENUE_PER_HOUR * hours; A.push(`~$${REVENUE_PER_HOUR}/hour revenue exposure × ${hours}h assumed downtime.`);
  } else if (s.type === 'RELEASE_SLIP' || s.type === 'DEPLOYMENT_POSTPONE') {
    const weeks = s.params?.weeks || 2; estimate = WEEK_OPPORTUNITY_COST * weeks; A.push(`~$${WEEK_OPPORTUNITY_COST}/week opportunity cost × ${weeks} week(s).`);
  } else if (s.type === 'CUSTOMER_CHURN') { /* handled */ }
  return { estimate, currency: 'USD', heuristic: true, basis: A[0] || 'No direct financial model for this scenario type; assess qualitatively.', assumptions: A };
}

function businessImpact(customer, financial, operational) {
  const fin = financial.estimate ? Math.min(40, financial.estimate / 10_000) : 0;
  const score = clamp(customer.score * 0.45 + operational.score * 0.35 + fin);
  return { score, level: level(score), note: `Composite of customer exposure, operational load${financial.estimate ? `, and ~$${Number(financial.estimate).toLocaleString()} estimated cost` : ''}.` };
}

function timeline(s, deps) {
  if (s.type === 'RELEASE_SLIP' || s.type === 'DEPLOYMENT_POSTPONE') {
    const weeks = s.params?.weeks || 2;
    return { delayWeeks: weeks, affected: deps, note: `~${weeks}-week shift; ${deps} dependent item(s) would move with it.` };
  }
  if (s.type === 'PROJECT_CANCEL') return { delayWeeks: null, affected: deps, note: `${deps} dependent item(s) would be freed or stranded.` };
  return { delayWeeks: null, affected: deps, note: deps ? `${deps} dependent item(s) may shift.` : 'No direct timeline change.' };
}

export { level };
