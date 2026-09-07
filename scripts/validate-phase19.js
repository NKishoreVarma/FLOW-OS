/**
 * Phase 19 — Autonomous Operations Validation
 *   node scripts/validate-phase19.js
 *
 * In-process only — no live server required.
 * Run validate-pilot-journeys.js separately for HTTP journeys.
 */

import { existsSync } from 'node:fs';
import { join }       from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const __dir = fileURLToPath(new URL('..', import.meta.url));
let pass = 0, fail = 0;
const ok = (name, cond) => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else       { fail++; console.log(`  ❌ ${name}`); }
};

async function main() {
  console.log('\n🚀 Phase 19 — Autonomous Operations Validation\n');

  // ── 1. Workflow Templates ──────────────────────────────────────────────────
  console.log('1. workflowTemplates');
  const { getTemplate, listTemplates, TEMPLATE_IDS } = await import('../src/autonomous/workflowTemplates.js');
  ok('TEMPLATE_IDS is array',  Array.isArray(TEMPLATE_IDS));
  ok('at least 5 templates',   TEMPLATE_IDS.length >= 5);
  ok('approve_action exists',  !!getTemplate('approve_action'));
  ok('approve_action has buildSteps', typeof getTemplate('approve_action')?.buildSteps === 'function');
  const tpl = getTemplate('approve_action');
  const steps = tpl.buildSteps({ id: 't1', title: 'Test', raw: { id: 'a1', connectorId: 'github', actionType: 'MERGE_PR' } });
  ok('approve_action buildSteps returns array', Array.isArray(steps) && steps.length > 0);
  ok('step has connector + actionType', !!steps[0]?.connector && !!steps[0]?.actionType);
  const templates = listTemplates();
  ok('listTemplates returns array', Array.isArray(templates));
  ok('each template has id+label+risk', templates.every(t => t.id && t.label && t.risk));
  ok('unknown template returns null', getTemplate('nonexistent_xyz') === null);

  // ── 2. Action Card Service ─────────────────────────────────────────────────
  console.log('2. actionCardService');
  const { buildActionCard, buildActionCards } = await import('../src/autonomous/actionCardService.js');
  const item = {
    id: 'ap-test', type: 'approval', title: 'Approve github MERGE_PR',
    subtitle: 'HIGH risk · 1 approval required',
    owners: ['alice'], participants: [], blocking: 1,
    businessImpact: 'high', department: 'engineering',
    actionRoute: '/inbox', actionLabel: 'Review',
    suggestedActions: [
      { label: 'Approve', workflowId: 'approve_action', risk: 'HIGH', params: { approvalId: '1' } },
      { label: 'Reject',  workflowId: 'reject_action',  risk: 'LOW',  params: { approvalId: '1' } },
    ],
    estimatedImpact: 'Unblocks workflow',
    raw: { id: '1', connectorId: 'github', actionType: 'MERGE_PR' },
  };
  const card = buildActionCard(item);
  ok('card.id matches item.id',         card.id === item.id);
  ok('card.impact is high',             card.impact === 'high');
  ok('card.actions length >= 2',        card.actions.length >= 2);
  ok('first action isPrimary',          card.actions[0].isPrimary === true);
  ok('second action is not primary',    card.actions[1].isPrimary === false);
  ok('first action has steps',          Array.isArray(card.actions[0].steps) && card.actions[0].steps.length > 0);
  ok('evidenceLines is array',          Array.isArray(card.evidenceLines));
  const noActionItem = { ...item, id: 'no-sa', suggestedActions: [] };
  const noActionCard = buildActionCard(noActionItem);
  ok('card always has at least 1 action', noActionCard.actions.length >= 1);
  const cards = buildActionCards([item, noActionItem]);
  ok('buildActionCards returns array',  Array.isArray(cards) && cards.length === 2);

  // ── 3. Memory Personalizer ─────────────────────────────────────────────────
  console.log('3. memoryPersonalizer');
  const { getPreferences } = await import('../src/autonomous/memoryPersonalizer.js');
  const prefs = await getPreferences(`phase19-test-${randomUUID().slice(0,6)}`);
  ok('preferredReviewers array',        Array.isArray(prefs.preferredReviewers));
  ok('frequentDelegatees array',        Array.isArray(prefs.frequentDelegatees));
  ok('approvalHabits object',           typeof prefs.approvalHabits === 'object' && !!prefs.approvalHabits);
  ok('recentlyBlockedConnectors array', Array.isArray(prefs.recentlyBlockedConnectors));
  ok('approvalHabits.avgRiskLevel string', typeof prefs.approvalHabits.avgRiskLevel === 'string');

  // ── 4. Chief of Staff Service ──────────────────────────────────────────────
  console.log('4. chiefOfStaffService');
  const { getChiefOfStaffBriefing } = await import('../src/autonomous/chiefOfStaffService.js');
  const briefing = await getChiefOfStaffBriefing(`phase19-test-${randomUUID().slice(0,6)}`, { id: 'u1', email: 'rahul@test.com', fullName: 'Rahul' });
  ok('greeting is string',              typeof briefing.greeting === 'string' && briefing.greeting.includes('Rahul'));
  ok('topItems array',                  Array.isArray(briefing.topItems));
  ok('topItems <= 5',                   briefing.topItems.length <= 5);
  ok('summary string',                  typeof briefing.summary === 'string' && briefing.summary.length > 0);
  ok('generatedAt ISO string',          typeof briefing.generatedAt === 'string');

  // ── 5. Weekly Review Service ───────────────────────────────────────────────
  console.log('5. weeklyReviewService');
  const { getWeeklyReview } = await import('../src/autonomous/weeklyReviewService.js');
  const review = await getWeeklyReview(`phase19-test-${randomUUID().slice(0,6)}`, { days: 7 });
  ok('window.days === 7',               review.window?.days === 7);
  ok('engineeringVelocity object',      typeof review.engineeringVelocity === 'object');
  ok('prsMerged is number',             typeof review.engineeringVelocity?.prsMerged === 'number');
  ok('executionSuccessRate object',     typeof review.executionSuccessRate === 'object');
  ok('operationalRisks array',          Array.isArray(review.operationalRisks));
  ok('recommendedPriorities array',     Array.isArray(review.recommendedPriorities));
  ok('summary.headline array',          Array.isArray(review.summary?.headline));

  // ── 6. Efficiency Metrics ──────────────────────────────────────────────────
  console.log('6. efficiencyMetrics');
  const { getEfficiencyMetrics } = await import('../src/analytics/pilotMetrics.js');
  const eff = await getEfficiencyMetrics(`phase19-test-${randomUUID().slice(0,6)}`, 7);
  ok('actionsAccepted number',           typeof eff.actionsAccepted === 'number');
  ok('actionsDismissed number',          typeof eff.actionsDismissed === 'number');
  ok('acceptanceRate null or number',    eff.acceptanceRate === null || typeof eff.acceptanceRate === 'number');
  ok('workflowCompletionRate null/num',  eff.workflowCompletionRate === null || typeof eff.workflowCompletionRate === 'number');
  ok('executionSuccessRate null/num',    eff.executionSuccessRate === null || typeof eff.executionSuccessRate === 'number');

  // ── 7. File presence ──────────────────────────────────────────────────────
  console.log('7. File presence');
  const files = [
    'src/autonomous/workflowTemplates.js',
    'src/autonomous/actionCardService.js',
    'src/autonomous/memoryPersonalizer.js',
    'src/autonomous/chiefOfStaffService.js',
    'src/autonomous/weeklyReviewService.js',
    'src/routes/phase19Routes.js',
    'flow-os-frontend/src/components/inbox/ActionCard.jsx',
    'flow-os-frontend/src/components/autonomous/ChiefOfStaff.jsx',
    'flow-os-frontend/src/components/autonomous/WeeklyReview.jsx',
    'flow-os-frontend/src/lib/actionCardAdapter.js',
  ];
  for (const f of files) {
    ok(`${f} exists`, existsSync(join(__dir, f)));
  }

  console.log(`\n${'─'.repeat(44)}`);
  console.log(`Phase 19: ${pass} passed / ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch(err => { console.error(err); process.exit(1); });
