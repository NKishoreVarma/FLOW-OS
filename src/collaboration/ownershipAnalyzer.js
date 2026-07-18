/**
 * FLOW OS — Ownership Analyzer (Phase 14 M2)
 *
 * For a blocked/conflicting PR, work out WHO is actually involved so FLOW notifies
 * only the relevant people (never the whole team). Deterministic and pure — it takes
 * the PR plus other people's recent work on the same files and computes the overlap.
 *
 * Example: Rahul changed auth.js, Kishore changed auth.js → the analyzer returns
 * owners [Rahul, Kishore], overlapping file auth.js, and coordinate-before-merge.
 */

function norm(x) { return String(x || '').trim(); }
function uniq(arr) { return [...new Set(arr.filter(Boolean))]; }

/**
 * @param {object} input
 *   pr: normalized PR { author, reviewers[], repo, metadata:{ number, headBranch, baseBranch } }
 *   files: string[]                        files this PR changes
 *   otherContributions: [{ actor, files[] }]  other people's recent changes (other open PRs / recent commits)
 * @returns ownership analysis
 */
export function analyzeOwnership({ pr = {}, files = [], otherContributions = [] } = {}) {
  const md = pr.metadata || pr;
  const prAuthor = norm(pr.author || md.author);
  const prFiles = uniq(files.length ? files : (md.filesChanged || []).map((f) => f.filename || f));

  // Files where someone else also worked recently.
  const overlappingFiles = [];
  const collaborators = [];

  for (const contrib of otherContributions) {
    const actor = norm(contrib.actor);
    if (!actor || actor === prAuthor) continue;
    const shared = (contrib.files || []).filter((f) => prFiles.includes(f));
    if (shared.length) {
      overlappingFiles.push(...shared);
      collaborators.push(actor);
    }
  }

  const overlap = uniq(overlappingFiles);
  const others  = uniq(collaborators);
  // People to notify = the PR author + whoever else touched the overlapping files.
  const owners  = uniq([prAuthor, ...others]);

  const hasCollision = overlap.length > 0 && others.length > 0;

  const suggestedActions = buildActions(pr, md, others, hasCollision);

  return {
    repo:            pr.repo || md.repo,
    number:          md.number,
    branch:          md.headBranch || md.head_branch,
    baseBranch:      md.baseBranch || md.base_branch,
    prAuthor,
    owners,
    introducedBy:    others,            // the other people whose overlapping work collides
    overlappingFiles: overlap,
    hasCollision,
    suggestedNextStep: hasCollision
      ? 'Coordinate before merging — the same files were changed by more than one person.'
      : 'Resolve the block and re-request review.',
    suggestedActions,
  };
}

function buildActions(pr, md, others, hasCollision) {
  const actions = [
    { label: 'Open Diff', kind: 'open_diff', payload: { repo: pr.repo || md.repo, number: md.number } },
    { label: 'Open PR',   kind: 'open_pr',   payload: { url: md.url || pr.url, number: md.number } },
  ];
  for (const person of others) {
    actions.push({ label: `Message ${person}`, kind: 'message', payload: { connector: 'slack', to: person } });
  }
  if (hasCollision) {
    actions.push({ label: 'Create Meeting', kind: 'create_meeting', payload: { connector: 'google-calendar', attendees: others } });
  }
  return actions;
}

/**
 * Build the flagship human-readable merge-conflict notification body.
 */
export function conflictMessage(analysis, findings = []) {
  const lines = [];
  lines.push(`⚠️ Merge conflict detected in ${analysis.repo || 'repository'}.`);
  if (analysis.overlappingFiles.length) {
    lines.push('');
    lines.push('Files affected:');
    for (const f of analysis.overlappingFiles) lines.push(`• ${f}`);
  }
  if (analysis.owners.length) {
    lines.push('');
    lines.push('Primary owners:');
    for (const o of analysis.owners) lines.push(o);
  }
  lines.push('');
  lines.push('Suggested next step:');
  lines.push(analysis.suggestedNextStep);
  return lines.join('\n');
}

export default { analyzeOwnership, conflictMessage };
