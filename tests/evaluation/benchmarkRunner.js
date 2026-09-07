/**
 * FLOW OS — Offline RAG Evaluation Benchmark & Regression Test Harness
 */

import {
  evaluateRetrievalPrecision,
  validateCitations,
  detectHallucinations,
  evaluateContextCoverage
} from '../../src/evaluation/ragEval.js';

// Define a static benchmark dataset for regression testing
const EVAL_DATASET = [
  {
    query: "What is the timeline of the migrations project?",
    context: [
      { text: "Migration project is postponed to late September due to resource constraints.", source: "vault", title: "project_timeline_v2" },
      { text: "We are currently migrating database infrastructure to a new schema model.", source: "slack", title: "chat_log" }
    ],
    goldAnswerSample: "The migration project has been postponed to late September [1]."
  },
  {
    query: "Identify security vulnerabilities in the current auth code.",
    context: [
      { text: "Penetration audit flagged zero-trust exposure in old auth token verification flow.", source: "vault", title: "security_audit_report" }
    ],
    goldAnswerSample: "The penetration audit discovered zero-trust vulnerabilities in token verification [1]."
  },
  {
    query: "Has the Series B funding closed?",
    context: [
      { text: "Acme Corp closed Series B funding of $50M led by Sequoia Capital in 2020.", source: "vault", title: "company_overview" }
    ],
    goldAnswerSample: "Yes, Acme Corp closed a Series B funding round of $50M led by Sequoia Capital [1]."
  }
];

export function runRegressionSuite() {
  console.log("\x1b[34m[Benchmark]\x1b[0m Running FLOW OS In-Memory RAG Regression Suite...\n");

  const results = [];
  let totalPrecision = 0;
  let totalCoverage = 0;
  let totalErrorRate = 0;
  let hallucinationAlerts = 0;

  for (let i = 0; i < EVAL_DATASET.length; i++) {
    const testCase = EVAL_DATASET[i];
    console.log(`Test Case ${i + 1}: "${testCase.query}"`);

    // 1. Evaluate Retrieval Precision
    const precision = evaluateRetrievalPrecision(testCase.query, testCase.context);
    totalPrecision += precision;

    // 2. Evaluate Context Coverage
    const coverage = evaluateContextCoverage(testCase.query, testCase.context);
    totalCoverage += coverage;

    // 3. Validate Citations in gold answer sample
    const citationReport = validateCitations(testCase.goldAnswerSample, testCase.context);
    totalErrorRate += citationReport.citationErrorRate;

    // 4. Detect Hallucinations in gold answer sample
    const hallucinationReport = detectHallucinations(testCase.goldAnswerSample, testCase.context);
    if (hallucinationReport.hasHallucinationWarning) hallucinationAlerts++;

    console.log(`  - Retrieval Precision: ${(precision * 100).toFixed(1)}%`);
    console.log(`  - Context Coverage:    ${(coverage * 100).toFixed(1)}%`);
    console.log(`  - Citation Count:      ${citationReport.citationCount} (Errors: ${citationReport.invalidCitations.length})`);
    console.log(`  - Hallucinated Tokens: ${hallucinationReport.unsupportedTokens.join(', ') || 'None'}\n`);

    results.push({
      case: i + 1,
      precision,
      coverage,
      citationCount: citationReport.citationCount,
      citationErrors: citationReport.invalidCitations.length,
      hallucinated: hallucinationReport.hasHallucinationWarning
    });
  }

  const avgPrecision = totalPrecision / EVAL_DATASET.length;
  const avgCoverage = totalCoverage / EVAL_DATASET.length;
  const avgErrorRate = totalErrorRate / EVAL_DATASET.length;

  console.log("\x1b[32m[Benchmark Result]\x1b[0m Regression completed successfully:");
  console.log(`-----------------------------------------------`);
  console.log(`Average Retrieval Precision: ${(avgPrecision * 100).toFixed(2)}%`);
  console.log(`Average Context Coverage:    ${(avgCoverage * 100).toFixed(2)}%`);
  console.log(`Average Citation Error Rate: ${(avgErrorRate * 100).toFixed(2)}%`);
  console.log(`Total Hallucination Warnings: ${hallucinationAlerts}`);
  console.log(`-----------------------------------------------\n`);

  return {
    avgPrecision,
    avgCoverage,
    avgErrorRate,
    hallucinationAlerts,
    results
  };
}

// Automatically execute if run directly
if (import.meta.url.endsWith(process.argv[1])) {
  runRegressionSuite();
}
