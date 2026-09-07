import { query } from '../config/db.js';
import { domainStatus, overallStatus, THRESHOLDS } from './thresholds.js';
import { evaluate as evalExecIntel }   from './domains/executiveIntelligence.js';
import { evaluate as evalBrain }        from './domains/cognitiveBrain.js';
import { evaluate as evalWorkflow }     from './domains/workflowRuntime.js';
import { evaluate as evalGraph }        from './domains/knowledgeGraph.js';
import { evaluate as evalConnectors }   from './domains/connectors.js';
import { evaluate as evalReports }      from './domains/executiveReports.js';
import { evaluate as evalPredictions }  from './domains/predictionEngine.js';
import { evaluate as evalAutonomy }     from './domains/autonomy.js';
import { evaluate as evalUX }           from './domains/userExperience.js';

const EVALUATORS = [
  evalExecIntel,
  evalBrain,
  evalWorkflow,
  evalGraph,
  evalConnectors,
  evalReports,
  evalPredictions,
  evalAutonomy,
  evalUX,
];

// ── Run a full evaluation for a workspace ─────────────────────────────────────
export async function runEvaluation(workspaceId, { runType = 'manual', triggeredBy = null, releaseVersion = null } = {}) {
  // Create run record
  const runRes = await query(
    `INSERT INTO fvep_runs (workspace_id, run_type, status, triggered_by, release_version)
     VALUES ($1, $2, 'running', $3, $4) RETURNING id`,
    [workspaceId, runType, triggeredBy, releaseVersion]
  );
  const runId = runRes.rows[0].id;

  const domainResults = [];
  const errors = [];

  // Evaluate all domains (fault-isolated)
  await Promise.allSettled(
    EVALUATORS.map(async (evaluator) => {
      try {
        const result = await evaluator(workspaceId);
        const status = result.status ?? domainStatus(result.domain, result.score);
        domainResults.push({ ...result, status });
      } catch (err) {
        errors.push({ evaluator: evaluator.name, error: err.message });
      }
    })
  );

  // Attach status to each result
  const annotated = domainResults.map(r => ({
    ...r,
    status: r.status ?? domainStatus(r.domain, r.score),
    threshold: THRESHOLDS[r.domain]?.pass ?? null,
  }));

  // Compute overall quality score (weighted average of non-null scores)
  const scorable = annotated.filter(r => r.score !== null);
  const overallScore = scorable.length > 0
    ? Math.round(scorable.reduce((sum, r) => sum + r.score, 0) / scorable.length)
    : null;

  const domainsPassed = annotated.filter(r => r.status === 'passed').length;
  const domainsTotal  = annotated.length;
  const status        = overallStatus(overallScore ?? 0, annotated);

  const summary = {
    overallScore,
    status,
    domainsPassed,
    domainsTotal,
    errors,
    criticalFailures: annotated
      .filter(r => r.status === 'failed' && ['workflowRuntime', 'connectors'].includes(r.domain))
      .map(r => r.domain),
    allFindings: annotated.flatMap(r => (r.findings ?? []).map(f => `[${r.domain}] ${f}`)),
  };

  // Persist domain results
  for (const r of annotated) {
    await query(
      `INSERT INTO fvep_results (run_id, domain, status, score, threshold, metrics, findings)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [runId, r.domain, r.status, r.score, r.threshold,
       JSON.stringify(r.metrics ?? {}), r.findings ?? []]
    ).catch(() => {}); // never fail the run on persistence error
  }

  // Mark run complete
  await query(
    `UPDATE fvep_runs
     SET status = $1, quality_score = $2, domains_passed = $3, domains_total = $4,
         completed_at = NOW(), summary = $5
     WHERE id = $6`,
    [status, overallScore, domainsPassed, domainsTotal, JSON.stringify(summary), runId]
  );

  return { runId, ...summary, domains: annotated };
}

// ── Run a single domain evaluation (no DB persistence) ────────────────────────
export async function runDomain(workspaceId, domainName) {
  const evaluator = EVALUATORS.find(e => {
    const mod = e.toString();
    return mod.includes(`'${domainName}'`) || mod.includes(`"${domainName}"`);
  });

  // Direct lookup by checking the DOMAIN export
  const domainMap = {
    executiveIntelligence: evalExecIntel,
    cognitiveBrain:        evalBrain,
    workflowRuntime:       evalWorkflow,
    knowledgeGraph:        evalGraph,
    connectors:            evalConnectors,
    executiveReports:      evalReports,
    predictionEngine:      evalPredictions,
    autonomy:              evalAutonomy,
    userExperience:        evalUX,
  };

  const fn = domainMap[domainName];
  if (!fn) throw new Error(`Unknown domain: ${domainName}`);

  const result = await fn(workspaceId);
  return {
    ...result,
    status: result.status ?? domainStatus(result.domain, result.score),
    threshold: THRESHOLDS[domainName]?.pass ?? null,
  };
}

// ── Get run history for a workspace ───────────────────────────────────────────
export async function getRunHistory(workspaceId, { limit = 20 } = {}) {
  const r = await query(
    `SELECT id, run_type, status, quality_score, domains_passed, domains_total,
            release_version, triggered_by, started_at, completed_at, summary
     FROM fvep_runs
     WHERE workspace_id = $1
     ORDER BY started_at DESC
     LIMIT $2`,
    [workspaceId, limit]
  );
  return r.rows;
}

// ── Get domain trends across recent runs ──────────────────────────────────────
export async function getDomainTrends(workspaceId, { lastN = 10 } = {}) {
  const r = await query(
    `SELECT res.domain, res.score, res.status, res.evaluated_at
     FROM fvep_results res
     JOIN fvep_runs run ON run.id = res.run_id
     WHERE run.workspace_id = $1
       AND run.status IN ('passed', 'failed', 'warning')
     ORDER BY res.evaluated_at DESC
     LIMIT $2`,
    [workspaceId, lastN * 9]
  );

  const byDomain = {};
  for (const row of r.rows) {
    if (!byDomain[row.domain]) byDomain[row.domain] = [];
    if (byDomain[row.domain].length < lastN) byDomain[row.domain].push(row);
  }
  return byDomain;
}

// ── Get latest scores for all domains (single snapshot) ──────────────────────
export async function getLatestScores(workspaceId) {
  const r = await query(
    `SELECT DISTINCT ON (res.domain)
       res.domain, res.score, res.status, res.threshold, res.metrics, res.findings, res.evaluated_at
     FROM fvep_results res
     JOIN fvep_runs run ON run.id = res.run_id
     WHERE run.workspace_id = $1
     ORDER BY res.domain, res.evaluated_at DESC`,
    [workspaceId]
  );
  return r.rows;
}
