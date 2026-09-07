/**
 * Validation harness — Phase 14 M2 Merge Conflict Intelligence + Smart Collaboration.
 *   node scripts/validate-collaboration.js
 *
 * Pure (no DB / no live GitHub). Exercises the flagship: Rahul + Kishore both touch
 * auth.js → conflict → ownership targets ONLY the two of them (unrelated dev excluded).
 */

import { analyzePR, detectFromPRs, ConflictType, blockedHours } from '../src/collaboration/mergeConflictDetector.js';
import { analyzeOwnership, conflictMessage } from '../src/collaboration/ownershipAnalyzer.js';
import { detectSignals, detectRepeatCollisions, SignalType } from '../src/collaboration/collaborationDetector.js';

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log(`  ✅ ${name}`); } else { fail++; console.log(`  ❌ ${name}`); } };

console.log('\n🤝 Phase 14 M2 — Merge Conflict Intelligence validation\n');

// ── PR fixtures ────────────────────────────────────────────────────────────────
const rahulPR = { title: 'Refactor auth token flow', author: 'rahul', status: 'open', repo: 'flow-backend',
  metadata: { number: 128, mergeable: false, reviewStatus: 'pending', mergeReadinessScore: 40, baseBranch: 'main', updatedAt: new Date(Date.now() - 60 * 3600e3).toISOString(), changedFiles: 4, additions: 220, deletions: 60 },
  files: ['auth.js', 'loginService.js'] };
const kishorePR = { title: 'Add SSO login', author: 'kishore', status: 'open', repo: 'flow-backend',
  metadata: { number: 131, mergeable: true, reviewStatus: 'changes_requested', mergeReadinessScore: 55, baseBranch: 'main', updatedAt: new Date(Date.now() - 10 * 3600e3).toISOString(), changedFiles: 25, additions: 640, deletions: 120 },
  files: ['auth.js', 'ssoProvider.js'] };
const unrelatedPR = { title: 'Update README', author: 'dana', status: 'open', repo: 'flow-backend',
  metadata: { number: 140, mergeable: true, reviewStatus: 'approved', mergeReadinessScore: 95, baseBranch: 'main', updatedAt: new Date().toISOString(), changedFiles: 1, additions: 3, deletions: 1 },
  files: ['README.md'] };

// ── 1. Conflict detection ──────────────────────────────────────────────────────
console.log('1. Conflict detection');
const rAnalysis = analyzePR(rahulPR);
ok('rahul PR flagged MERGE_CONFLICT', rAnalysis.findings.includes(ConflictType.MERGE_CONFLICT));
ok('rahul PR severity high', rAnalysis.severity === 'high');
ok('unrelated PR is not blocked', analyzePR(unrelatedPR).blocked === false);
ok('changes-requested detected', analyzePR(kishorePR).findings.includes(ConflictType.CHANGES_REQUESTED));
ok('blockedHours computed', blockedHours(rahulPR) >= 59);

const blocked = await detectFromPRs('ws_val', [rahulPR, kishorePR, unrelatedPR], { emit: false });
ok('detectFromPRs returns only blocked PRs', blocked.length === 2 && !blocked.some((b) => b.number === 140));

// ── 2. Ownership analysis (flagship) ───────────────────────────────────────────
console.log('2. Ownership analysis — only the relevant people');
const ownership = analyzeOwnership({
  pr: rahulPR, files: rahulPR.files,
  otherContributions: [
    { actor: 'kishore', files: kishorePR.files },
    { actor: 'dana', files: unrelatedPR.files },
  ],
});
ok('overlapping file is auth.js', ownership.overlappingFiles.includes('auth.js'));
ok('owners = rahul + kishore', ownership.owners.includes('rahul') && ownership.owners.includes('kishore'));
ok('unrelated dev (dana) NOT an owner', !ownership.owners.includes('dana'));
ok('collision detected', ownership.hasCollision === true);
ok('introducedBy = kishore', ownership.introducedBy.includes('kishore') && !ownership.introducedBy.includes('dana'));
ok('suggests coordinate-before-merge', /coordinate/i.test(ownership.suggestedNextStep));
ok('has Message kishore action', ownership.suggestedActions.some((a) => a.kind === 'message' && a.payload.to === 'kishore'));
ok('has Create Meeting action', ownership.suggestedActions.some((a) => a.kind === 'create_meeting'));

const msg = conflictMessage(ownership, rAnalysis.findings);
ok('message names the repo + files + owners', /flow-backend/.test(msg) && /auth\.js/.test(msg) && /rahul/.test(msg) && /kishore/.test(msg));
ok('message excludes unrelated dev', !/dana/.test(msg));

// ── 3. Smart collaboration signals ─────────────────────────────────────────────
console.log('3. Smart collaboration signals');
const signals = detectSignals([rahulPR, kishorePR, unrelatedPR]);
ok('blocked signal present', signals.some((s) => s.type === SignalType.BLOCKED));
ok('waiting>48h signal for rahul PR', signals.some((s) => s.type === SignalType.WAITING && s.number === 128));
ok('large-PR signal for kishore PR', signals.some((s) => s.type === SignalType.LARGE_PR && s.number === 131));
ok('changes-requested signal present', signals.some((s) => s.type === SignalType.CHANGES_REQUESTED));
ok('signals sorted high-severity first', signals[0].severity === 'high');

// ── 4. Repeated collisions ─────────────────────────────────────────────────────
console.log('4. Repeated ownership collisions');
const repeat = detectRepeatCollisions([
  { owners: ['rahul', 'kishore'] },
  { owners: ['rahul', 'kishore'] },
  { owners: ['rahul', 'dana'] },
]);
ok('repeat collision flagged for rahul+kishore', repeat.some((r) => /rahul/.test(r.pair) && /kishore/.test(r.pair) && r.count === 2));
ok('single collision (rahul+dana) NOT flagged', !repeat.some((r) => /dana/.test(r.pair)));

console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
