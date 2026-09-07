/**
 * FLOW OS — Living Workspace Simulator · Scenarios (Sprint 5)
 *
 * Coherent CAUSAL chains, not random records. Each scenario emits a sequence of linked
 * FLOW events (shared correlationId, consistent people/repos/customers) through the
 * existing Unified Event Platform, and — when run "live" — creates the current pending
 * approvals and notifications that the Workday queue / Morning / Inbox read.
 *
 *   email → Slack → Jira → PR → deploy → incident → postmortem
 *   customer complaint → escalation → renewal risk
 *
 * Reuse only: publishFields (Event Platform), createTieredApproval (Governance),
 * notifyMergeConflict / createNotification (Notification Engine). No new backend.
 */

import { randomUUID } from 'node:crypto';
import { publishFields } from '../events/index.js';
import { createTieredApproval } from '../core/governance/approvalStore.js';
import { notifyMergeConflict, createNotification } from '../notifications/notificationEngine.js';
import { persona, REPOS, CUSTOMERS, pick } from './personas.js';

const FEATURES = ['SSO login', 'usage-based billing', 'audit export', 'webhook retries', 'dark mode', 'rate limiting', 'bulk import', 'saved views'];
let prCounter = 400;
let jiraCounter = 800;

function nextPR() { return ++prCounter; }
function nextJira() { return ++jiraCounter; }
const iso = (ts) => new Date(ts).toISOString();
const actorOf = (p) => [{ name: p.name, login: p.login }];

// The Event Platform validates the coarse `type` against a canonical enum; the granular
// activity ("pull_request", "email"…) rides along in metadata.kind so chains stay legible.
async function emit(ctx, e) {
  return publishFields({
    workspaceId: ctx.ws, organizationId: ctx.orgId,
    type: e.type, source: e.source, title: e.title, summary: e.summary || '',
    ts: iso(e.ts), priority: e.priority || 'medium', businessImpact: e.priority,
    actors: e.actors || [], correlationGroupId: ctx.corr,
    affectedProjects: e.repo ? [e.repo] : [],
    metadata: { kind: e.kind, simulated: true },
  });
}

/** email → slack → jira → PR → CI → deploy (+ merge approval when live). */
export async function featureShip(ctx) {
  ctx.corr = randomUUID();
  const feature = pick(FEATURES, ctx.rnd);
  const repo = REPOS[0];
  const dev = persona('kishore'), pm = persona('james'), sales = persona('meera'), cust = pick(CUSTOMERS, ctx.rnd);
  const pr = nextPR(), jira = nextJira();
  let t = ctx.baseTs;
  const step = () => (t += 25 * 60000);

  await emit(ctx, { type: 'communication', kind: 'email', source: 'gmail', title: `${cust} requested ${feature}`, summary: `${cust} asked for ${feature} in their renewal call.`, ts: step(), actors: actorOf(sales), priority: 'medium' });
  await emit(ctx, { type: 'communication', kind: 'slack_message', source: 'slack', title: `#engineering: scoping ${feature}`, summary: `Discussion on ${feature} for ${cust}.`, ts: step(), actors: actorOf(dev) });
  await emit(ctx, { type: 'task', kind: 'jira_issue', source: 'jira', title: `PROJ-${jira}: ${feature}`, summary: `Implement ${feature} (requested by ${cust}).`, ts: step(), actors: actorOf(pm) });
  await emit(ctx, { type: 'engineering', kind: 'pull_request', source: 'github', title: `PR #${pr}: ${feature}`, summary: `Implements PROJ-${jira}.`, ts: step(), actors: actorOf(dev), repo, priority: 'high' });
  await emit(ctx, { type: 'engineering', kind: 'ci_run', source: 'github', title: `CI passed for PR #${pr}`, ts: step(), actors: actorOf(dev), repo });
  await emit(ctx, { type: 'deployment', kind: 'deployment', source: 'github', title: `Deployment queued: ${feature}`, ts: step(), actors: actorOf(persona('priya')), repo, priority: 'high' });

  if (ctx.live) {
    await createTieredApproval({ orgId: ctx.orgId, workspaceId: ctx.ws, requesterId: ctx.requesterId, connectorId: 'github', capability: 'ENGINEERING', actionType: 'merge', payload: { number: pr, repo, base: 'main' }, riskLevel: 'HIGH', requiredApprovals: 1 });
  }
  return { events: 6, approvals: ctx.live ? 1 : 0, notifications: 0 };
}

/** deploy → incident → warroom → postmortem → follow-up (+ incident alert when live). */
export async function incident(ctx) {
  ctx.corr = randomUUID();
  const repo = REPOS[0], sre = persona('priya'), owner = persona('david');
  let t = ctx.baseTs; const step = () => (t += 20 * 60000);

  await emit(ctx, { type: 'deployment', kind: 'deployment', source: 'github', title: `Deployed payments service`, ts: step(), actors: actorOf(owner), repo, priority: 'high' });
  await emit(ctx, { type: 'incident', kind: 'incident', source: 'system', title: `Payments API returning 500s`, summary: `Error rate spiked after the payments deploy.`, ts: step(), actors: actorOf(sre), priority: 'critical' });
  await emit(ctx, { type: 'communication', kind: 'slack_message', source: 'slack', title: `#incidents: war room open`, ts: step(), actors: actorOf(sre), priority: 'high' });
  await emit(ctx, { type: 'knowledge', kind: 'document', source: 'notion', title: `Postmortem: payments 500s`, summary: `Root cause: migration lock. Rollback applied.`, ts: step(), actors: actorOf(owner) });
  await emit(ctx, { type: 'task', kind: 'jira_issue', source: 'jira', title: `PROJ-${nextJira()}: add migration lock guard`, ts: step(), actors: actorOf(owner) });

  if (ctx.live) {
    await createNotification({ orgId: ctx.orgId, workspaceId: ctx.ws, type: 'INCIDENT', title: 'Payments API returning 500s', body: 'Error rate spiked after a deploy — war room open.', recipients: ['priya', 'rahul', ctx.userEmail].filter(Boolean), dedupeKey: `INCIDENT:${ctx.corr}` });
  }
  return { events: 5, approvals: 0, notifications: ctx.live ? 1 : 0 };
}

/** two engineers touch the same file → merge conflict (+ targeted notification when live). */
export async function mergeConflict(ctx) {
  ctx.corr = randomUUID();
  const repo = REPOS[0], a = persona('kishore'), b = persona('rahul'), pr = nextPR();
  let t = ctx.baseTs; const step = () => (t += 30 * 60000);

  await emit(ctx, { type: 'engineering', kind: 'pull_request', source: 'github', title: `PR #${pr}: refactor auth token flow`, ts: step(), actors: actorOf(a), repo, priority: 'high' });
  await emit(ctx, { type: 'engineering', kind: 'commit', source: 'github', title: `${b.name} pushed changes to auth.js`, ts: step(), actors: actorOf(b), repo });
  await emit(ctx, { type: 'engineering', kind: 'merge_conflict', source: 'github', title: `Merge conflict in ${repo}`, summary: `auth.js changed by ${a.name} and ${b.name}.`, ts: step(), actors: actorOf(a), repo, priority: 'high' });

  if (ctx.live) {
    // The demo CTO IS the logged-in user — attribute CTO-owned files to them so the
    // conflict surfaces to NOW in their workday, not just to the persona 'rahul'.
    const owners = ['rahul', 'kishore', ctx.userEmail].filter(Boolean);
    await notifyMergeConflict({ orgId: ctx.orgId, workspaceId: ctx.ws, severity: 'high',
      ownership: { repo, number: pr, owners, overlappingFiles: ['auth.js'], suggestedNextStep: 'Coordinate before merging — the same file was changed by two people.', suggestedActions: [{ label: 'Open Diff', kind: 'open_diff' }, { label: 'Message kishore', kind: 'message', payload: { to: 'kishore' } }] },
      message: `⚠️ Merge conflict in ${repo}\n\nFiles affected:\n• auth.js\n\nPrimary owners:\nrahul\nkishore` });
  }
  return { events: 3, approvals: 0, notifications: ctx.live ? 1 : 0 };
}

/** customer complaint → escalation → renewal risk (+ notification when live). */
export async function customerEscalation(ctx) {
  ctx.corr = randomUUID();
  const cust = pick(CUSTOMERS, ctx.rnd), sales = persona('meera');
  let t = ctx.baseTs; const step = () => (t += 40 * 60000);

  await emit(ctx, { type: 'customer', kind: 'email', source: 'gmail', title: `${cust} VP: frustrated with reliability`, summary: `${cust}'s VP raised concerns after recent downtime.`, ts: step(), actors: actorOf(sales), priority: 'high' });
  await emit(ctx, { type: 'communication', kind: 'slack_message', source: 'slack', title: `#sales: ${cust} escalation`, ts: step(), actors: actorOf(sales), priority: 'high' });

  if (ctx.live) {
    await createNotification({ orgId: ctx.orgId, workspaceId: ctx.ws, type: 'RISK', title: `${cust} renewal at risk`, body: `${cust}'s VP replied — reliability concerns after recent downtime. Renewal is this quarter.`, priority: 72, recipients: ['meera', 'rahul', ctx.userEmail].filter(Boolean), dedupeKey: `RENEWAL:${cust}` });
  }
  return { events: 2, approvals: 0, notifications: ctx.live ? 1 : 0 };
}

/** a PR needs Rahul's review/approval (+ pending approval when live). */
export async function reviewNeeded(ctx) {
  ctx.corr = randomUUID();
  const repo = REPOS[0], dev = persona('david'), pr = nextPR();
  let t = ctx.baseTs; const step = () => (t += 15 * 60000);

  await emit(ctx, { type: 'engineering', kind: 'pull_request', source: 'github', title: `PR #${pr}: payments retry logic`, ts: step(), actors: actorOf(dev), repo, priority: 'high' });
  await emit(ctx, { type: 'engineering', kind: 'review_requested', source: 'github', title: `Review requested from Rahul on PR #${pr}`, ts: step(), actors: actorOf(dev), repo });

  if (ctx.live) {
    await createTieredApproval({ orgId: ctx.orgId, workspaceId: ctx.ws, requesterId: ctx.requesterId, connectorId: 'github', capability: 'ENGINEERING', actionType: 'merge', payload: { number: pr, repo, base: 'main' }, riskLevel: 'CRITICAL', requiredApprovals: 2 });
  }
  return { events: 2, approvals: ctx.live ? 1 : 0, notifications: 0 };
}

export const HISTORY_SCENARIOS = [featureShip, incident, mergeConflict, customerEscalation, reviewNeeded];
export const LIVE_SCENARIOS = [mergeConflict, customerEscalation, reviewNeeded, incident, featureShip];

export default { featureShip, incident, mergeConflict, customerEscalation, reviewNeeded, HISTORY_SCENARIOS, LIVE_SCENARIOS };
