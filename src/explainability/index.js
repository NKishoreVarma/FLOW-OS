/**
 * FLOW Explainable Intelligence Engine (XAI) — public API.
 *
 * FLOW already reasons; this layer makes it explain. Every AI output can be
 * wrapped into a standard envelope that shows the evidence, the reasoning, a
 * six-dimension confidence breakdown, source attribution, contradictions,
 * missing information, alternatives, business impact, recommended actions, a
 * trust score, and graph-based relationship/impact explanations — so every
 * answer can be understood, verified, and challenged.
 */

export { explain, explainQuestion, answerFollowUp, FOLLOWUPS } from './ExplanationEngine.js';

// Individual building blocks (for targeted use / testing).
export { formatEvidence, classifySourceType, summarizeFreshness } from './EvidenceFormatter.js';
export { attributeSources } from './SourceAttribution.js';
export { buildConfidenceBreakdown } from './ConfidenceBreakdown.js';
export { buildReasoningTrace } from './ReasoningTrace.js';
export { buildDecisionTree } from './DecisionTree.js';
export { generateAlternatives } from './AlternativeGenerator.js';
export { detectMissingEvidence } from './MissingEvidenceDetector.js';
export { buildBusinessJustification } from './BusinessJustification.js';
export { scoreTrust } from './TrustScorer.js';
