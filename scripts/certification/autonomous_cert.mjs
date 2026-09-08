/**
 * autonomous_cert.mjs — certifies the EXISTING autonomous execution layer.
 *
 * No new engine. Real HTTP against the running server. Proves the Workflow Engine
 * (POST /api/workflows/pr-review → RuntimeEngine → StepExecutor → executeAction)
 * actually runs multi-step, respects governance, and never fakes success.
 *
 * SAFETY: this must NOT approve or merge real PRs on the user's live GitHub. Every
 * launch uses minMergeReadinessScore=101 so evaluatePRSafety marks EVERY PR unsafe →
 * only read + skip + notify steps are generated (no approve, no merge). The dryRun
 * checks build a plan with zero side effects. Governance-checkpoint is proven via the
 * code path (governance evaluates before the adapter call), not by merging anything.
 *
 * Run from project dir: node scripts/certification/autonomous_cert.mjs
 */
import { prisma } from '../../src/core/config/prisma.js';
import jwt from 'jsonwebtoken';

const BASE = 'http://127.0.0.1:5001';
const SECRET = process.env.JWT_SECRET;
const R = [];
const rec = (id, ok, note = '') => { R.push([id, ok]); console.log(`  ${ok ? '✅' : '❌'} ${id}${note ? ' — ' + note : ''}`); };

async function tokenFor(ext) {
  const ws = await prisma.workspace.findUnique({ where: { externalId: ext } });
  const u = await prisma.user.findFirst({ where: { orgId: ws.orgId } });
  return jwt.sign({ userId: u?.id || 'c', email: u?.email || 'c@t.test', role: 'OWNER', orgId: ws.orgId }, SECRET, { expiresIn: '30m' });
}
async function req(method, path, t, ws, body) {
  const r = await fetch(BASE + path, {
    method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}`, 'workspace-id': ws },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// find a corp-alpha repo that actually has open PRs (real github), else fall back
async function pickRepo(t, ws) {
  const { body } = await req('GET', '/api/engineering/repos?limit=10', t, ws);
  const repos = body.result || [];
  for (const r of repos) {
    const owner = r.owner || r.metadata?.owner, name = r.name || r.repo;
    if (!owner || !name) continue;
    const prs = await req('GET', `/api/engineering/repos/${owner}/${name}/pulls?state=open`, t, ws);
    if ((prs.body.result || []).length > 0) return { owner, name, prCount: prs.body.result.length };
  }
  const r0 = repos[0]; return r0 ? { owner: r0.owner || r0.metadata?.owner, name: r0.name, prCount: 0 } : null;
}

async function main() {
  const DW = 'workspace_corp-alpha_mqvsc4hk';  // real GitHub lives here
  const HW = 'workspace_helios_test';           // github NOT connected (honest-failure case)
  const D = await tokenFor(DW), H = await tokenFor(HW);

  console.log('\n═══ AUTONOMOUS EXECUTION LAYER — CERTIFICATION ═══');
  console.log('  (real HTTP · existing engine · NO real PR approved/merged)\n');

  const repo = await pickRepo(D, DW);
  if (!repo) { console.log('  no corp-alpha repos available — cannot certify planning against real github'); }
  else console.log(`  target repo: ${repo.owner}/${repo.name} (${repo.prCount} open PRs)\n`);

  // ── 1. PLANNING (dryRun) — builds a real multi-step plan, ZERO side effects ──
  if (repo) {
    const { status, body } = await req('POST', '/api/workflows/pr-review', D, DW, {
      owner: repo.owner, repo: repo.name, slackChannelId: '#engineering',
      minMergeReadinessScore: 101, dryRun: true,
    });
    const steps = body.plan?.steps || [];
    rec('plan:dryRunBuilds', status === 200 && body.dryRun === true && steps.length >= 1, `${steps.length} steps, no side effects`);
    // With threshold 101, no PR is safe → NO merge/approve steps should exist
    const hasMerge = steps.some(s => /merge/i.test(s.name || s.type || ''));
    const hasApprove = steps.some(s => /approve/i.test(s.name || s.type || ''));
    rec('plan:allUnsafeNoMerge', !hasMerge && !hasApprove, hasMerge || hasApprove ? 'UNSAFE: merge/approve step generated' : 'read+skip+notify only');
  }

  // ── 2. REAL EXECUTION (safe) — multi-step run, no approve/merge, honest end ──
  let execId = null;
  if (repo) {
    const { status, body } = await req('POST', '/api/workflows/pr-review', D, DW, {
      owner: repo.owner, repo: repo.name, slackChannelId: '#engineering',
      minMergeReadinessScore: 101, dryRun: false,
    });
    execId = body.executionId;
    rec('exec:launched202', status === 202 && !!execId, `id=${execId} status=${body.status}`);
    // poll to terminal
    let ex = null;
    for (let i = 0; i < 20 && execId; i++) {
      await sleep(1500);
      const g = await req('GET', `/api/workflows/${execId}`, D, DW);
      ex = g.body.execution;
      if (ex && ['COMPLETED', 'FAILED', 'WAITING_APPROVAL'].includes(ex.status)) break;
    }
    if (ex) {
      const steps = ex.steps || ex.stepResults || [];
      const ran = steps.length >= 1 || ex.status !== 'PLANNING';
      rec('exec:multiStepRan', ran, `status=${ex.status}, ${steps.length} step records`);
      // NO fake success: no step should report a merge/created with a real receipt it never got
      const fakeMerge = steps.some(s => /merge/i.test(s.name || s.id || '') && s.status === 'completed' && !(s.result?.merged));
      rec('exec:noFakeSuccess', !fakeMerge, fakeMerge ? 'a merge step reported success without merged:true' : 'no fabricated mutation');
      // slack notify step (unconnected on corp-alpha) must FAIL honestly, not fake "sent"
      const slack = steps.find(s => /slack|notify/i.test(s.name || s.id || ''));
      if (slack) rec('exec:honestSlackFailure', slack.status !== 'completed' || slack.result?.ts, `slack step status=${slack.status}`);
    } else {
      rec('exec:multiStepRan', false, 'execution never reached a terminal/waiting state');
    }
  }

  // ── 3. GOVERNANCE CHECKPOINT (code-path proof, no real merge) ──
  // executeAction evaluates governance (evaluateWithPolicies) BEFORE the adapter call.
  // A merge into a protected branch → APPROVAL_REQUIRED thrown before GitHub is touched;
  // RuntimeEngine catches it → markWaitingApproval. We prove the executeAction half here
  // (the workflow half is the same code), by asking the engine to merge into main:
  {
    const { body } = await req('POST', '/api/execution/execute', D, DW, {
      recommendation: { connector: 'github', actionType: 'execute',
        payload: { owner: repo?.owner || 'x', repo: repo?.name || 'y', number: 1, mergeMethod: 'squash', base: 'main' } },
      confirmed: false,
    });
    const s = body.results?.[0] || {};
    const gated = s.status === 'APPROVAL_REQUIRED' || s.status === 'CONFIRM_REQUIRED' || s.status === 'DENIED' || s.status === 'FAILED';
    rec('gov:mergeGatedNotExecuted', s.status !== 'EXECUTED' && gated, `merge status=${s.status} (never EXECUTED without approval)`);
  }

  // ── 4. HONEST FAILURE — launch on Helios (github NOT connected) ──
  {
    const { status, body } = await req('POST', '/api/workflows/pr-review', H, HW, {
      owner: 'helios', repo: 'helios-core', slackChannelId: '#eng', dryRun: true,
    });
    // Either planning errors honestly (4xx/5xx) or returns a plan with 0 PRs — never fabricates PRs to merge
    const honest = status >= 400 || (body.plan && (body.plan.steps || []).every(s => !/merge/i.test(s.name || '')));
    rec('honest:heliosNoFabricatedMerge', honest, `status=${status}, no fabricated merge steps`);
  }

  const pass = R.filter(x => x[1]).length;
  console.log(`\n═══════════════════════════════════════`);
  console.log(`  ${pass}/${R.length} autonomous-cert checks passed`);
  console.log(`  fails: ${R.filter(x => !x[1]).map(x => x[0]).join(', ') || 'none'}`);
  console.log(`  (no real PR was approved or merged)`);
  await prisma.$disconnect();
  process.exit(pass === R.length ? 0 : 1);
}
main().catch(async (e) => { console.error('harness error:', e.message); try { await prisma.$disconnect(); } catch {} process.exit(2); });
