/**
 * FVEP Regression Suite — release gate.
 *
 * Every release runs this before merging. Returns { passed, report }.
 * Exit code 0 = all gates cleared. Exit code 1 = release blocked.
 */
import { runEvaluation } from './evaluationEngine.js';
import { RELEASE_GATE, THRESHOLDS } from './thresholds.js';

export async function runRegression(workspaceId, { releaseVersion = null, triggeredBy = 'ci' } = {}) {
  const result = await runEvaluation(workspaceId, {
    runType: 'regression',
    triggeredBy,
    releaseVersion,
  });

  const gates = [];

  // Gate 1: overall score
  gates.push({
    gate: 'Overall Quality Score',
    required: `>= ${RELEASE_GATE.minimumOverallScore}`,
    actual: result.overallScore,
    passed: (result.overallScore ?? 0) >= RELEASE_GATE.minimumOverallScore,
  });

  // Gate 2: minimum passing domains
  gates.push({
    gate: 'Domains Passing',
    required: `>= ${RELEASE_GATE.requiredPassingDomains} of ${result.domainsTotal}`,
    actual: result.domainsPassed,
    passed: result.domainsPassed >= RELEASE_GATE.requiredPassingDomains,
  });

  // Gate 3: critical domains must individually pass
  for (const domain of RELEASE_GATE.criticalDomains) {
    const dr = result.domains.find(d => d.domain === domain);
    gates.push({
      gate: `Critical: ${domain}`,
      required: `>= ${THRESHOLDS[domain]?.pass ?? 80}`,
      actual: dr?.score ?? 'N/A',
      passed: dr?.status === 'passed',
    });
  }

  // Gate 4: no domain in 'failed' with score null (insufficient data = block)
  const blockedDomains = result.domains.filter(d => d.status === 'failed');
  gates.push({
    gate: 'No Blocked Domains',
    required: '0 failed domains',
    actual: blockedDomains.length,
    passed: blockedDomains.length === 0,
  });

  const overallPassed = gates.every(g => g.passed);

  const report = {
    runId:         result.runId,
    workspace:     workspaceId,
    version:       releaseVersion,
    ranAt:         new Date().toISOString(),
    passed:        overallPassed,
    overallScore:  result.overallScore,
    domainsPassed: result.domainsPassed,
    domainsTotal:  result.domainsTotal,
    gates,
    domainScores:  result.domains.map(d => ({
      domain:    d.domain,
      score:     d.score,
      status:    d.status,
      threshold: d.threshold,
    })),
    criticalFindings: result.allFindings?.filter(f =>
      result.criticalFailures?.some(domain => f.startsWith(`[${domain}]`))
    ) ?? [],
    allFindings: result.allFindings ?? [],
  };

  return { passed: overallPassed, report };
}

// ── CLI entry point ───────────────────────────────────────────────────────────
if (process.argv[1]?.endsWith('regressionSuite.js')) {
  const workspaceId    = process.argv[2] || 'workspace_corp_alpha';
  const releaseVersion = process.argv[3] || 'dev';

  console.log(`\n🧪 FVEP Regression Suite`);
  console.log(`   Workspace: ${workspaceId}`);
  console.log(`   Release:   ${releaseVersion}\n`);

  runRegression(workspaceId, { releaseVersion, triggeredBy: 'cli' })
    .then(({ passed, report }) => {
      console.log(`Overall Score: ${report.overallScore ?? 'N/A'}/100`);
      console.log(`Domains:       ${report.domainsPassed}/${report.domainsTotal} passing\n`);

      console.log('Gates:');
      for (const g of report.gates) {
        console.log(`  ${g.passed ? '✅' : '❌'} ${g.gate.padEnd(35)} required: ${String(g.required).padEnd(20)} actual: ${g.actual}`);
      }

      if (report.criticalFindings.length > 0) {
        console.log('\nCritical Findings:');
        report.criticalFindings.forEach(f => console.log(`  ⚠️  ${f}`));
      }

      console.log(`\n${passed ? '🎉 RELEASE GATE: PASSED' : '🚫 RELEASE GATE: BLOCKED'}\n`);
      process.exit(passed ? 0 : 1);
    })
    .catch(err => {
      console.error('Regression suite error:', err.message);
      process.exit(1);
    });
}
