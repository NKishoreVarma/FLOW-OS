/**
 * FLOW OS — Smart Collaboration & Merge Conflict Intelligence Routes (Phase 14 M2)
 *
 * JWT + workspace-id. Reads open PRs (via the governed connector READ path when
 * GitHub is connected; otherwise a clearly-labelled demo set) and surfaces
 * collaboration friction + merge-conflict ownership. Detection is poll-on-view.
 *
 *   GET  /api/collaboration/signals    smart-collab signals over open PRs
 *   GET  /api/collaboration/conflicts  blocked/conflicting PRs + ownership + notify targets
 *   POST /api/collaboration/analyze    analyze provided { prs } or { pr, files, otherContributions }
 */

import express from 'express';
import { executeAction } from '../connectors/executionEngine.js';
import { detectFromPRs, analyzePR } from '../collaboration/mergeConflictDetector.js';
import { analyzeOwnership, conflictMessage } from '../collaboration/ownershipAnalyzer.js';
import { detectSignals, detectRepeatCollisions } from '../collaboration/collaborationDetector.js';

const router = express.Router();

router.use((req, res, next) => {
  if (!req.tenantId) {
    return res.status(400).json({ error: { code: 'MISSING_WORKSPACE', message: 'workspace-id header is required' } });
  }
  next();
});

// A demo set that exercises the flagship: Rahul + Kishore both touch auth.js.
const DEMO = {
  prs: [
    { title: 'Refactor auth token flow', author: 'rahul', status: 'open', repo: 'flow-backend',
      metadata: { number: 128, mergeable: false, reviewStatus: 'pending', mergeReadinessScore: 40, baseBranch: 'main', headBranch: 'auth-refactor', changedFiles: 4, additions: 220, deletions: 60, updatedAt: new Date(Date.now() - 60 * 3600e3).toISOString() },
      files: ['auth.js', 'loginService.js'] },
    { title: 'Add SSO login path', author: 'kishore', status: 'open', repo: 'flow-backend',
      metadata: { number: 131, mergeable: true, reviewStatus: 'changes_requested', mergeReadinessScore: 55, baseBranch: 'main', headBranch: 'sso', changedFiles: 25, additions: 640, deletions: 120, updatedAt: new Date(Date.now() - 10 * 3600e3).toISOString() },
      files: ['auth.js', 'ssoProvider.js'] },
  ],
};

async function fetchOpenPRs(req) {
  const owner = req.query.owner, repo = req.query.repo;
  if (!owner || !repo) return { prs: DEMO.prs, demo: true };
  try {
    const result = await executeAction({
      workspaceId: req.tenantId, connectorId: 'github', actionType: 'read',
      payload: { resourceType: 'pulls', owner, repo, state: 'open', limit: 30 },
      actor: { id: req.user?.id, role: req.workspaceRole || req.user?.role || 'VIEWER', orgId: req.user?.orgId },
      orgPlan: req.govContext?.plan || 'free',
    });
    const prs = Array.isArray(result?.result) ? result.result : (result?.result?.pulls || result || []);
    if (!Array.isArray(prs) || !prs.length) return { prs: DEMO.prs, demo: true };
    return { prs, demo: false };
  } catch {
    return { prs: DEMO.prs, demo: true };
  }
}

// files for a PR: prefer explicit .files, else metadata.filesChanged
const filesOf = (pr) => pr.files || (pr.metadata?.filesChanged || []).map((f) => f.filename || f);

// ── GET /api/collaboration/signals ─────────────────────────────────────────────
router.get('/signals', async (req, res, next) => {
  try {
    const { prs, demo } = await fetchOpenPRs(req);
    res.json({ demo, signals: detectSignals(prs), total: prs.length });
  } catch (err) { next(err); }
});

// ── GET /api/collaboration/conflicts ───────────────────────────────────────────
router.get('/conflicts', async (req, res, next) => {
  try {
    const { prs, demo } = await fetchOpenPRs(req);
    const blocked = await detectFromPRs(req.tenantId, prs, { orgId: req.user?.orgId, emit: !demo });

    const conflicts = blocked.map((finding) => {
      const pr = prs.find((p) => (p.metadata?.number ?? p.number) === finding.number) || {};
      const others = prs
        .filter((p) => p !== pr)
        .map((p) => ({ actor: p.author || p.metadata?.author, files: filesOf(p) }));
      const ownership = analyzeOwnership({ pr, files: filesOf(pr), otherContributions: others });
      return { ...finding, ownership, message: conflictMessage(ownership, finding.findings), notify: ownership.owners };
    });

    // repeated collisions across the conflict set
    const repeat = detectRepeatCollisions(conflicts.map((c) => c.ownership));
    res.json({ demo, conflicts, repeatCollisions: repeat, total: conflicts.length });
  } catch (err) { next(err); }
});

// ── POST /api/collaboration/analyze ────────────────────────────────────────────
router.post('/analyze', (req, res, next) => {
  try {
    if (Array.isArray(req.body.prs)) {
      return res.json({ signals: detectSignals(req.body.prs) });
    }
    const { pr, files, otherContributions } = req.body;
    const ownership = analyzeOwnership({ pr: pr || {}, files: files || [], otherContributions: otherContributions || [] });
    res.json({ analysis: analyzePR(pr || {}), ownership, message: conflictMessage(ownership) });
  } catch (err) { next(err); }
});

export default router;
