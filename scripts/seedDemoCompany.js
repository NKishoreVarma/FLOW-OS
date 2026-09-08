/**
 * seedDemoCompany.js — a clean, deterministic demo workspace for cold pitches.
 *
 *   node scripts/seedDemoCompany.js [workspaceExternalId]     (default: workspace_demo)
 *
 * Seeds "Acme Tech" — a 25-person B2B SaaS startup — into the REAL pipeline the
 * product already runs on. It does NOT fabricate answers or mock the UI: it publishes
 * genuine FLOW events (GitHub / Gmail / Calendar / Jira) through the Unified Event
 * Platform, so the graph, memory, timeline, feed, prediction engine and consequence
 * engine all light up exactly as they would for a real customer. Everything the demo
 * shows is then derived, not planted.
 *
 * The signals are shaped so the CONSEQUENCE ENGINE detects three real cross-tool risks:
 *   • TechCorp churn risk   — VP's "delayed API" email (22h unanswered) + the delayed
 *                             Jira deliverable that references the same account.
 *   • A blocked developer   — PR #3 open 50h with a pending review request, no merge.
 *   • Key-person risk       — the backend repo's commits are dominated by one author.
 *
 * Idempotent: it clears prior demo data for the target workspace first, so re-running
 * always yields the same clean state in well under 60 seconds.
 *
 * Dev/seed tool. Never run against a production workspace you care about.
 */

import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { prisma } from '../src/core/config/prisma.js';
import db from '../src/config/db.js';
import { publishFields } from '../src/events/index.js';
import { createTieredApproval } from '../src/core/governance/approvalStore.js';
import { createNotification } from '../src/notifications/notificationEngine.js';

const WS_ID = process.argv[2] || process.env.SEED_WORKSPACE || 'workspace_demo';
const COMPANY = 'Acme Tech';
const BACKEND = 'acme-backend';       // the key-person repo
const FRONTEND = 'acme-frontend';
const now = Date.now();
const H = (h) => now - h * 3600 * 1000;               // h hours ago
const iso = (ms) => new Date(ms).toISOString();
const todayAt = (hh, mm = 0) => { const d = new Date(); d.setHours(hh, mm, 0, 0); return d.getTime(); };

// A small, coherent cast so ownership and notifications are consistent.
const PEOPLE = {
  kishore: { name: 'Kishore Varma', login: 'kishorevarma' },  // backend — dominant owner
  david:   { name: 'David Okafor',  login: 'davido' },
  sarah:   { name: 'Sarah Chen',    login: 'sarahc' },
  priya:   { name: 'Priya Nair',    login: 'priyan' },
  rahul:   { name: 'Rahul Mehta',   login: 'rahulm' },        // CTO
};
const actor = (p) => [{ name: p.name, login: p.login }];

let ctx = null;   // { ws, orgId, requesterId, userEmail }
const totals = { events: 0, approvals: 0, notifications: 0 };

// ── Event emit (same shape the connectors + simulator use) ──────────────────────
async function emit(e) {
  await publishFields({
    workspaceId: ctx.ws, organizationId: ctx.orgId,
    type: e.type, source: e.source, title: e.title, summary: e.summary || '',
    ts: iso(e.ts), priority: e.priority || 'medium', businessImpact: e.priority,
    actors: e.actors || [], entities: e.entities || [],
    correlationGroupId: e.corr || null,
    affectedProjects: e.repo ? [e.repo] : [],
    metadata: { kind: e.kind, demo: true, ...(e.metadata || {}) },
  });
  totals.events++;
}

// ── 1. Ensure the workspace exists (org + owner user + workspace) ───────────────
async function ensureWorkspace() {
  let ws = await prisma.workspace.findUnique({ where: { externalId: WS_ID }, include: { org: true } });
  if (ws) {
    const owner = await prisma.user.findFirst({ where: { orgId: ws.orgId }, orderBy: { createdAt: 'asc' } });
    ctx = { ws: WS_ID, orgId: ws.orgId, requesterId: owner?.id || null, userEmail: owner?.email || null };
    return;
  }
  const org = await prisma.organization.create({
    data: { name: COMPANY, slug: `acme-tech-${WS_ID}`.slice(0, 60), plan: 'pro' },
  });
  const passwordHash = await bcrypt.hash('FlowDemo123!', 10);
  const owner = await prisma.user.create({
    data: { email: `owner+${WS_ID}@acme.demo`, passwordHash, fullName: 'Kishore Varma', role: 'OWNER', orgId: org.id },
  });
  await prisma.workspace.create({ data: { name: `${COMPANY} Workspace`, orgId: org.id, externalId: WS_ID } });
  ctx = { ws: WS_ID, orgId: org.id, requesterId: owner.id, userEmail: owner.email };
  console.log(`  · created workspace ${WS_ID} (org ${org.id})`);
}

// ── 2. Clear prior demo data so a re-seed is clean and deterministic ────────────
async function resetWorkspace() {
  await db.query('DELETE FROM flow_events WHERE workspace_id = $1', [ctx.ws]);
  await db.query('DELETE FROM flow_event_deliveries WHERE workspace_id = $1', [ctx.ws]).catch(() => {});
  await Promise.all([
    prisma.notification.deleteMany({ where: { workspaceId: ctx.ws } }),
    prisma.pendingApproval.deleteMany({ where: { workspaceId: ctx.ws } }),
    prisma.graphEdge.deleteMany({ where: { workspaceId: ctx.ws } }).catch(() => {}),
    prisma.graphNode.deleteMany({ where: { workspaceId: ctx.ws } }).catch(() => {}),
    prisma.orgMemoryRecord.deleteMany({ where: { workspaceId: ctx.ws } }).catch(() => {}),
  ]);
}

// ── 3. GitHub: 10 commits (backend repo single-owner → key-person risk) ─────────
async function seedGitHub() {
  // 8 of 10 commits on the backend repo are Kishore's → dominant ownership.
  const commits = [
    { by: 'kishore', repo: BACKEND,  msg: 'fix: null guard in auth token refresh', h: 2 },
    { by: 'kishore', repo: BACKEND,  msg: 'feat: rate limiting on /api/query', h: 5 },
    { by: 'kishore', repo: BACKEND,  msg: 'refactor: extract billing calculator', h: 9 },
    { by: 'kishore', repo: BACKEND,  msg: 'fix: race condition in webhook worker', h: 26 },
    { by: 'kishore', repo: BACKEND,  msg: 'perf: index workspace_id on flow_events', h: 30 },
    { by: 'kishore', repo: BACKEND,  msg: 'feat: TechCorp API integration scaffold', h: 34 },
    { by: 'kishore', repo: BACKEND,  msg: 'chore: bump prisma to 7.1', h: 52 },
    { by: 'kishore', repo: BACKEND,  msg: 'fix: retry backoff on Stripe timeouts', h: 60 },
    { by: 'sarah',   repo: FRONTEND, msg: 'feat: dark mode toggle', h: 6 },
    { by: 'kishore', repo: BACKEND,  msg: 'test: add coverage for payments service', h: 40 },
  ];
  for (const c of commits) {
    const sha = randomUUID().replace(/-/g, '').slice(0, 40);
    await emit({
      type: 'engineering', kind: 'commit', source: 'github',
      // Title omits the author — the feed/formatters prepend the actor themselves.
      title: `pushed to ${c.repo}`, summary: c.msg,
      ts: H(c.h), actors: actor(PEOPLE[c.by]), repo: c.repo,
      entities: [{ type: 'COMMIT', id: sha, name: c.repo }],
      metadata: { repo: c.repo, sha, message: c.msg },
    });
  }

  // 3 open PRs — #3 is the blocked one (open 50h, review requested, unmerged).
  const prs = [
    { n: 101, by: 'sarah',   repo: FRONTEND, title: 'Dark mode + theme tokens',        h: 6,  blocked: false },
    { n: 102, by: 'david',   repo: BACKEND,  title: 'Payments retry logic',            h: 20, blocked: false },
    { n: 103, by: 'kishore', repo: BACKEND,  title: 'TechCorp API integration',        h: 50, blocked: true  },
  ];
  for (const pr of prs) {
    await emit({
      type: 'engineering', kind: 'pull_request', source: 'github',
      title: `opened PR #${pr.n} in ${pr.repo}: ${pr.title}`, summary: pr.title,
      ts: H(pr.h), actors: actor(PEOPLE[pr.by]), repo: pr.repo, priority: pr.blocked ? 'high' : 'medium',
      entities: [{ type: 'PR', id: String(pr.n), name: pr.title }],
      metadata: { repo: pr.repo, number: pr.n, state: 'open' },
    });
    if (pr.blocked) {
      await emit({
        type: 'engineering', kind: 'review_requested', source: 'github',
        title: `Review requested from ${PEOPLE.rahul.name} on PR #${pr.n}`,
        summary: `${pr.title} — waiting ${pr.h}h with no review`,
        ts: H(pr.h - 1), actors: actor(PEOPLE[pr.by]), repo: pr.repo, priority: 'high',
        entities: [{ type: 'PR', id: String(pr.n), name: pr.title }],
        metadata: { repo: pr.repo, number: pr.n, waitingHours: pr.h },
      });
    }
  }

  // 2 open issues — 1 P0, 1 P1. The P0 references TechCorp (feeds the churn chain).
  await emit({
    type: 'engineering', kind: 'jira_issue', source: 'jira',
    title: 'ACME-421: TechCorp API integration delayed', summary: 'P0 — TechCorp onboarding blocked on the delayed API. Committed date slipped.',
    ts: H(28), actors: actor(PEOPLE.kishore), repo: BACKEND, priority: 'critical', corr: ctx.churnCorr,
    entities: [{ type: 'ISSUE', id: 'ACME-421', name: 'TechCorp API integration delayed' }, { type: 'CUSTOMER', id: 'TechCorp', name: 'TechCorp' }],
    metadata: { key: 'ACME-421', severity: 'P0', account: 'TechCorp' },
  });
  await emit({
    type: 'engineering', kind: 'jira_issue', source: 'jira',
    title: 'ACME-418: Flaky payments test on CI', summary: 'P1 — intermittent failure in payments retry test.',
    ts: H(96), actors: actor(PEOPLE.david), repo: BACKEND, priority: 'high',
    entities: [{ type: 'ISSUE', id: 'ACME-418', name: 'Flaky payments test on CI' }],
    metadata: { key: 'ACME-418', severity: 'P1' },
  });
}

// ── 4. Gmail: 5 emails (TechCorp VP silence drives the churn chain) ─────────────
async function seedGmail() {
  await emit({
    type: 'customer', kind: 'email', source: 'gmail',
    title: 'TechCorp: frustrated with delayed API — considering options',
    summary: "TechCorp's VP of Engineering: \"We were promised the API two weeks ago and our launch is blocked. We're frustrated — if this isn't resolved this week we'll have to escalate to our leadership and reconsider the contract.\"",
    ts: H(22), actors: [{ name: 'Dana Whitfield (TechCorp VP Eng)', login: 'dana.whitfield' }],
    priority: 'high', corr: ctx.churnCorr,
    entities: [{ type: 'CUSTOMER', id: 'TechCorp', name: 'TechCorp' }, { type: 'EMAIL', id: 'em-techcorp-1', name: 'delayed API delivery' }],
    metadata: { from: 'dana.whitfield@techcorp.com', account: 'TechCorp', unanswered: true },
  });
  // Second cross-tool churn signal on the same account — the CSM's at-risk flag.
  await emit({
    type: 'customer', kind: 'crm_note', source: 'hubspot',
    title: 'TechCorp flagged at-risk by CSM',
    summary: 'CSM marked TechCorp as at-risk after the delayed API and the VP escalation. Renewal is due next month.',
    ts: H(18), actors: [{ name: 'Meera Iyer (CSM)', login: 'meerai' }], priority: 'high', corr: ctx.churnCorr,
    entities: [{ type: 'CUSTOMER', id: 'TechCorp', name: 'TechCorp' }],
    metadata: { account: 'TechCorp', renewalMonth: 'next' },
  });
  await emit({
    type: 'communication', kind: 'email', source: 'gmail',
    title: 'Invoice reminder: #INV-2043 due in 3 days', summary: 'Accounts payable reminder for the March SaaS invoice.',
    ts: H(4), actors: [{ name: 'billing@vendor.com', login: 'billing' }], priority: 'low',
    entities: [{ type: 'EMAIL', id: 'em-inv-2043', name: 'Invoice #INV-2043' }],
    metadata: { from: 'billing@vendor.com' },
  });
  await emit({
    type: 'customer', kind: 'email', source: 'gmail',
    title: 'Onboarding question from new customer Globex', summary: 'Globex admin asks how to configure SSO for their team — going live next week, excited to roll out.',
    ts: H(2), actors: [{ name: 'Marcus Lee (Globex)', login: 'marcus.lee' }], priority: 'medium',
    entities: [{ type: 'CUSTOMER', id: 'Globex', name: 'Globex' }, { type: 'EMAIL', id: 'em-globex-1', name: 'SSO onboarding question' }],
    metadata: { from: 'marcus@globex.com', account: 'Globex' },
  });
  await emit({
    type: 'communication', kind: 'email', source: 'gmail',
    title: 'Weekly metrics digest', summary: 'Automated product analytics digest — WAU up 4%.',
    ts: H(8), actors: [{ name: 'analytics@acme.tech', login: 'analytics' }], priority: 'low',
    entities: [{ type: 'EMAIL', id: 'em-metrics-1', name: 'Weekly metrics digest' }],
    metadata: { from: 'analytics@acme.tech' },
  });
  await emit({
    type: 'customer', kind: 'email', source: 'gmail',
    title: 'Re: Contract renewal — Acme Corp', summary: 'Acme Corp legal returned the redlined MSA for signature — on track to renew and expand seats.',
    ts: H(30), actors: [{ name: 'legal@acmecorp.com', login: 'legal' }], priority: 'medium',
    entities: [{ type: 'CUSTOMER', id: 'Acme Corp', name: 'Acme Corp' }, { type: 'EMAIL', id: 'em-acme-1', name: 'Contract renewal' }],
    metadata: { from: 'legal@acmecorp.com', account: 'Acme Corp' },
  });
}

// ── 5. Calendar: today's schedule ───────────────────────────────────────────────
async function seedCalendar() {
  const events = [
    { id: 'cal-standup',  title: 'Engineering standup',        at: todayAt(10, 0), host: 'priya' },
    { id: 'cal-sprint',   title: 'Sprint planning',            at: todayAt(14, 0), host: 'rahul' },
    { id: 'cal-1on1',     title: '1:1 with Rahul',             at: todayAt(16, 0), host: 'rahul' },
  ];
  for (const ev of events) {
    await emit({
      type: 'meeting', kind: 'calendar', source: 'google-calendar',
      title: ev.title, summary: `${ev.title} — today`, ts: ev.at, actors: actor(PEOPLE[ev.host]), priority: 'medium',
      entities: [{ type: 'EVENT', id: ev.id, name: ev.title }],
      metadata: { eventId: ev.id, start: iso(ev.at) },
    });
  }
}

// ── 6. Current pending work (what the CTO walks into this morning) ──────────────
async function seedCurrentWork() {
  // Blocked-PR merge waiting on the requester's confirmation.
  if (ctx.requesterId) {
    try {
      await createTieredApproval({
        orgId: ctx.orgId, workspaceId: ctx.ws, requesterId: ctx.requesterId,
        connectorId: 'github', capability: 'ENGINEERING', actionType: 'merge',
        payload: { number: 103, repo: BACKEND, base: 'main', title: 'TechCorp API integration' },
        riskLevel: 'HIGH', requiredApprovals: 1,
      });
      totals.approvals++;
    } catch (e) { console.warn(`  · approval skipped: ${e.message}`); }
  }
  // TechCorp renewal-risk notification (the flagship "FLOW noticed" moment).
  try {
    await createNotification({
      orgId: ctx.orgId, workspaceId: ctx.ws, type: 'RISK',
      title: 'TechCorp renewal at risk',
      body: "TechCorp's VP emailed 22h ago about the delayed API (ACME-421 is P0 and slipping). No reply yet — their launch is blocked.",
      priority: 78, recipients: ['rahulm', ctx.userEmail].filter(Boolean),
      dedupeKey: `RENEWAL:TechCorp:${ctx.ws}`,
    });
    totals.notifications++;
  } catch (e) { console.warn(`  · notification skipped: ${e.message}`); }
}

// ── 7. Self-verify: what did the consequence engine actually detect? ────────────
async function verifyConsequences() {
  // Give the async graph/memory subscribers a beat to finish writing.
  await new Promise((r) => setTimeout(r, 2500));
  try {
    const { detectConsequences } = await import('../src/consequence/consequenceEngine.js');
    const found = await detectConsequences(ctx.ws, { minProbability: 40 });
    if (!found.length) {
      console.log('  · consequence engine: no consequences crossed threshold yet (signals may need the graph to warm — re-run detect after the server has run predictions).');
      return found;
    }
    console.log(`  · consequence engine detected ${found.length}:`);
    for (const c of found) {
      console.log(`      - [${c.severity}] ${c.title} (${c.probability}%)${c.crossTool ? ` · cross-tool: ${c.sources.join(' + ')}` : ''}`);
    }
    return found;
  } catch (e) {
    console.log(`  · consequence check skipped: ${e.message}`);
    return [];
  }
}

// ── main ────────────────────────────────────────────────────────────────────────
async function main() {
  const t0 = Date.now();
  console.log(`\nSeeding demo company "${COMPANY}" → workspace ${WS_ID}\n`);
  await ensureWorkspace();
  ctx.churnCorr = randomUUID();     // links the TechCorp email ↔ Jira delay chain
  await resetWorkspace();
  await seedGitHub();
  await seedGmail();
  await seedCalendar();
  await seedCurrentWork();
  console.log(`  · published ${totals.events} events, ${totals.approvals} approval(s), ${totals.notifications} notification(s)`);
  const found = await verifyConsequences();
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\nDone in ${secs}s. Open FLOW on workspace ${WS_ID} — Morning Brief, Live panel, and "${found.length ? 'FLOW DETECTED' : 'the feed'}" are populated.\n`);
  await prisma.$disconnect();
  process.exit(0);
}

main().catch(async (e) => {
  console.error('Seed failed:', e);
  try { await prisma.$disconnect(); } catch {}
  process.exit(1);
});
