/**
 * Validation harness — Sprint 2.2 Adaptive Workday Engine.
 *   node scripts/validate-workday-engine.js
 *
 * Fully deterministic (pure prioritizer + queue; no DB). Verifies correct
 * prioritization, ownership filtering, dependency/blocking awareness, meeting
 * awareness, priority recalculation after completion, no duplicate work, and no
 * notification spam (FYI collapse).
 */

import { score, Tier } from '../src/workday/prioritizer.js';
import { buildQueue } from '../src/workday/workQueue.js';

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log(`  ✅ ${n}`); } else { fail++; console.log(`  ❌ ${n}`); } };

const RAHUL = { userIdentity: ['rahul', 'rahul@acme.com'], now: new Date() };
const inMin = (m) => new Date(Date.now() + m * 60000).toISOString();

// ── Fixtures ────────────────────────────────────────────────────────────────────
const approvalOwnedBlocking = { id: 'a1', type: 'approval', title: 'Approve PR #421', owners: ['rahul'], blocking: 2, businessImpact: 'high', department: 'engineering', actionRoute: '/inbox' };
const conflictOwned   = { id: 'c1', type: 'conflict', title: 'Merge conflict in auth.js', owners: ['rahul', 'kishore'], blocking: 1, businessImpact: 'high', department: 'engineering' };
const conflictNotMine = { id: 'c2', type: 'conflict', title: 'Merge conflict in billing.js', owners: ['dana', 'sam'], blocking: 1, businessImpact: 'high', department: 'engineering' };
const meetingSoon     = { id: 'm1', type: 'meeting', title: 'Engineering standup', participants: ['rahul'], startAt: inMin(15), department: 'operations' };
const customerReplied = { id: 'n1', type: 'notification', title: 'TechCorp VP replied', owners: ['rahul'], businessImpact: 'high', department: 'sales' };
const prMergedNotMine = { id: 'e1', type: 'execution', title: 'PR #440 merged', owners: ['dana'], businessImpact: 'low', department: 'engineering' };
const deployDone      = { id: 'e2', type: 'execution', title: 'Deployment completed', owners: [], businessImpact: 'low', department: 'operations' };
const generalSlack    = { id: 's1', type: 'notification', title: 'General team discussion', owners: [], businessImpact: 'low', department: 'operations' };

console.log('\n🧭 Sprint 2.2 — Adaptive Workday Engine validation\n');

// ── 1. Correct prioritization ───────────────────────────────────────────────────
console.log('1. Prioritization');
const sApproval = score(approvalOwnedBlocking, RAHUL);
const sDeploy   = score(deployDone, RAHUL);
const sSlack    = score(generalSlack, RAHUL);
ok('owned blocking approval → NOW', sApproval.tier === Tier.NOW);
ok('approval scores higher than a completed deploy', sApproval.score > sDeploy.score);
ok('approval reasons mention blocking', sApproval.reasons.some((r) => /blocking/i.test(r)));
ok('general slack collapses to IGNORE', sSlack.tier === Tier.IGNORE);

// ── 2. Ownership filtering ──────────────────────────────────────────────────────
console.log('2. Ownership filtering');
ok('conflict I own scores higher than the same conflict I do not', score(conflictOwned, RAHUL).score > score(conflictNotMine, RAHUL).score);
ok('a PR merged without me is dampened to FYI/IGNORE', [Tier.FYI, Tier.IGNORE].includes(score(prMergedNotMine, RAHUL).tier));
ok('"You own this" reason appears for owned work', score(conflictOwned, RAHUL).reasons.some((r) => /you own/i.test(r)));

// ── 3. Blocking / dependency awareness ──────────────────────────────────────────
console.log('3. Blocking awareness');
const nonBlocking = { ...approvalOwnedBlocking, id: 'a2', title: 'Approve config change', blocking: 0 };
ok('blocking work outranks the same work non-blocking', score(approvalOwnedBlocking, RAHUL).score > score(nonBlocking, RAHUL).score);

// ── 4. Meeting awareness ────────────────────────────────────────────────────────
console.log('4. Meeting awareness');
const meetingSoonScore = score(meetingSoon, RAHUL);
const meetingLater = score({ ...meetingSoon, id: 'm2', startAt: inMin(600) }, RAHUL);
ok('imminent meeting outranks a far-off one', meetingSoonScore.score > meetingLater.score);
ok('imminent meeting reason mentions the time', meetingSoonScore.reasons.some((r) => /min|start/i.test(r)));

// ── 5. Queue assembly + no spam ─────────────────────────────────────────────────
console.log('5. Work queue');
const all = [approvalOwnedBlocking, conflictOwned, meetingSoon, customerReplied, prMergedNotMine, deployDone, generalSlack, conflictNotMine];
const q = buildQueue(all, RAHUL);
ok('NOW contains the top blocking work', q.now.some((c) => c.id === 'a1'));
ok('NOW is capped + ordered by score', q.now.length <= 3 && (q.now.length < 2 || q.now[0].score >= q.now[q.now.length - 1].score));
ok('low-value noise collapses into ignoredCount', q.ignoredCount >= 1);
ok('queue is not a flat notification list (has tiers)', ['now', 'next', 'later', 'fyi'].every((k) => Array.isArray(q[k])));

// ── 6. No duplicate work ────────────────────────────────────────────────────────
console.log('6. No duplicate work');
const dupQ = buildQueue([approvalOwnedBlocking, { ...approvalOwnedBlocking, id: 'a1-dup' }], RAHUL);
ok('identical work is deduped', dupQ.total === 1);

// ── 7. Adaptive recalculation after completion ──────────────────────────────────
console.log('7. Adaptive recalculation');
const before = buildQueue(all, RAHUL);
const topId = before.now[0].id;
const afterComplete = buildQueue(all.filter((i) => i.id !== topId), RAHUL); // Rahul finished the top item
ok('completing the top item promotes the next', afterComplete.now[0]?.id !== topId);
ok('the queue shrank by the completed item', afterComplete.total === before.total - 1);

console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
