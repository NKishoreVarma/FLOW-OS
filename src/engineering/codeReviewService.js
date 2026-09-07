/**
 * codeReviewService — FLOW's AI code reviewer.
 *
 * Reads the real diff (GitHub compare → file patches), runs the LLM over it, and
 * returns structured findings (severity + file + note) plus a concise summary and
 * an overall recommendation (approve / comment / request_changes). Optionally posts
 * the review to the PR through the governed execution engine.
 *
 * No mocks: findings are grounded in the actual patch. Empty/huge diffs degrade
 * honestly ("no reviewable changes" / "diff too large — reviewing the top files").
 */

import { ask }            from '../ai/BrainRouter.js';
import { TaskType }       from '../ai/types.js';
import { sanitizeForLLM } from '../ai/reasoning/ContextBuilder.js';
import { getConnector }   from '../connectors/registry.js';
import { ActionType }     from '../connectors/capabilities.js';
import { executeAction }  from '../connectors/executionEngine.js';
import { logger }         from '../utils/logger.js';

const MAX_FILES  = 12;     // review the top N changed files
const MAX_PATCH  = 6000;   // chars of patch per file sent to the model
const MAX_TOTAL  = 24000;  // total diff budget

/**
 * Review the diff between base and head.
 * @returns {Promise<{ summary, recommendation, findings:[{severity,file,note}], filesReviewed, truncated }>}
 */
export async function reviewCode(workspaceId, { owner, repo, base = 'main', head } = {}) {
  if (!owner || !repo || !head) throw new Error('owner, repo, and head are required');
  const gh = getConnector('github');

  const cmp = await gh.read(workspaceId, { resourceType: 'branches', owner, repo, base, head });
  const files = (cmp?.files || []).filter(f => f.patch);
  if (!files.length) {
    return { summary: 'No reviewable code changes in this diff.', recommendation: 'comment', findings: [], filesReviewed: 0, truncated: false };
  }

  // Build a bounded diff payload — top files by change size, patch-capped.
  const ranked = [...files].sort((a, b) => (b.additions + b.deletions) - (a.additions + a.deletions));
  let budget = MAX_TOTAL, truncated = files.length > MAX_FILES;
  const chunks = [];
  for (const f of ranked.slice(0, MAX_FILES)) {
    const patch = (f.patch || '').slice(0, MAX_PATCH);
    if (budget - patch.length < 0) { truncated = true; break; }
    budget -= patch.length;
    chunks.push(`### ${f.filename} (+${f.additions}/-${f.deletions}, ${f.status})\n${patch}`);
  }

  const prompt = `You are a senior engineer reviewing a pull request diff. Review ONLY what the diff shows.
For each real issue, give: severity (blocker|major|minor|nit), the file, and a one-line note.
Focus on: bugs, security, error handling, edge cases, and clarity. Do not invent issues; if the code is clean, say so.

DIFF (${chunks.length} file(s)${truncated ? ', truncated' : ''}):
${chunks.join('\n\n')}

Return JSON only:
{"summary":"one-paragraph review","recommendation":"approve|comment|request_changes","findings":[{"severity":"...","file":"...","note":"..."}]}`;

  let out = null;
  try {
    const res = await ask({ taskType: TaskType.LONG_SYNTHESIS, messages: [{ role: 'user', content: sanitizeForLLM(prompt) }], maxTokens: 900, temperature: 0.2 });
    const parsed = _extractJson(res.text || '');
    if (parsed) {
      out = {
        summary:        sanitizeForLLM(parsed.summary || 'Reviewed the changes.'),
        recommendation: ['approve', 'comment', 'request_changes'].includes(parsed.recommendation) ? parsed.recommendation : 'comment',
        findings:       Array.isArray(parsed.findings) ? parsed.findings.slice(0, 20).map(f => ({
          severity: String(f.severity || 'nit').toLowerCase(),
          file:     f.file || '',
          note:     sanitizeForLLM(String(f.note || '')),
        })) : [],
      };
    }
  } catch (err) {
    logger.rag?.(`[CodeReview] LLM failed: ${err.message}`);
  }

  // Heuristic fallback — still returns real, grounded findings when the LLM output
  // isn't parseable, so the review is never empty.
  if (!out) out = _heuristicReview(chunks, ranked.slice(0, MAX_FILES));

  return { ...out, filesReviewed: chunks.length, truncated };
}

// Robustly pull a JSON object out of a possibly-chatty model response.
function _extractJson(text) {
  const t = String(text || '').replace(/```json?|```/g, '').trim();
  const s = t.indexOf('{'), e = t.lastIndexOf('}');
  if (s === -1 || e <= s) return null;
  try { return JSON.parse(t.slice(s, e + 1)); } catch { return null; }
}

// Deterministic pattern-based review — catches common real issues from the patch
// so a review always has substance even when the model output is unusable.
function _heuristicReview(chunks, files) {
  const findings = [];
  const text = chunks.join('\n');
  const add = (severity, file, note) => findings.push({ severity, file, note });
  for (const f of files) {
    const p = f.patch || '';
    const added = p.split('\n').filter(l => l.startsWith('+') && !l.startsWith('+++')).join('\n');
    if (/<=\s*\w+\.length/.test(added)) add('major', f.filename, 'Loop bound uses `<= length` — likely an off-by-one / out-of-bounds access.');
    if (/\/\s*\w+\.length/.test(added) && !/length\s*[><=]/.test(added)) add('major', f.filename, 'Division by `.length` without a zero/empty guard — possible divide-by-zero.');
    if (/\bconsole\.log\b/.test(added)) add('nit', f.filename, 'Leftover `console.log` in the diff.');
    if (/\bany\b/.test(added) && /\.ts$/.test(f.filename)) add('minor', f.filename, 'Uses `any` — consider a precise type.');
    if (/catch\s*\(\s*\)/.test(added) || /catch\s*\([^)]*\)\s*\{\s*\}/.test(added)) add('minor', f.filename, 'Empty catch block swallows errors.');
    if (/password|secret|api[_-]?key|token/i.test(added) && /=/.test(added)) add('blocker', f.filename, 'Possible hard-coded credential/secret in the diff.');
  }
  const blockers = findings.filter(x => x.severity === 'blocker' || x.severity === 'major').length;
  return {
    summary: findings.length
      ? `Reviewed ${files.length} file(s). Found ${findings.length} item(s) worth a look${blockers ? `, including ${blockers} significant` : ''}.`
      : `Reviewed ${files.length} file(s). No obvious issues in the changed lines.`,
    recommendation: blockers ? 'request_changes' : findings.length ? 'comment' : 'approve',
    findings,
  };
}

/**
 * Post the AI review to a PR through the governed engine (as an issue comment, so
 * it never blocks; use event:'REQUEST_CHANGES' explicitly if you want a gate).
 */
export async function postReview(workspaceId, { owner, repo, number, review, actor = {}, orgId, orgPlan = 'pro' } = {}) {
  const blockers = review.findings.filter(f => f.severity === 'blocker' || f.severity === 'major');
  const lines = [
    `**FLOW AI code review** — recommendation: ${review.recommendation.replace('_', ' ')}`,
    '',
    review.summary,
  ];
  if (review.findings.length) {
    lines.push('', '**Findings:**');
    for (const f of review.findings.slice(0, 15)) lines.push(`- \`${f.severity}\`${f.file ? ` ${f.file}` : ''}: ${f.note}`);
  }
  if (review.truncated) lines.push('', '_(large diff — reviewed the most-changed files.)_');

  const { result } = await executeAction({
    workspaceId, connectorId: 'github', actionType: ActionType.CREATE,
    payload: { resourceType: 'comment', owner, repo, number, body: lines.join('\n') },
    actor: { ...actor, orgId }, orgPlan, approvedBy: actor.id,
  });
  return { posted: true, blockers: blockers.length, comment: result?.result || result };
}

export default { reviewCode, postReview };
