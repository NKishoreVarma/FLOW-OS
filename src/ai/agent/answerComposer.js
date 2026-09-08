/**
 * answerComposer — turns agent-gathered evidence into an evidence-backed answer
 * by REUSING FLOW's existing verification pipeline. It does not re-implement any
 * of it:
 *
 *   rankEvidence()          — EvidenceRanker   (the Critic's ranking)
 *   reason()                — ReasoningEngine
 *   verify()                — VerificationEngine (hallucination / temporal / contradiction)
 *   scoreConfidence()       — ConfidenceScorer
 *   verifySynthesisClaims() — ClaimVerifier     (strips invented people)
 *
 * The loop supplies evidence; this stage is identical to what the brain runs
 * after its own retrieval — so agent evidence is held to the same bar.
 */

import { rankEvidence }          from '../reasoning/EvidenceRanker.js';
import { reason }                from '../reasoning/ReasoningEngine.js';
import { verify }                from '../reasoning/VerificationEngine.js';
import { scoreConfidence }       from '../reasoning/ConfidenceScorer.js';
import { verifySynthesisClaims } from '../reasoning/ClaimVerifier.js';

async function _roster(workspaceId, injected) {
  if (injected) return injected;
  try {
    const { workspacePeople } = await import('../reasoning/EvidenceCollector.js');
    return await workspacePeople(workspaceId);
  } catch {
    return { names: new Set(), list: [] };
  }
}

/**
 * @param {object} p
 * @param {string} p.question
 * @param {object} p.intent
 * @param {import('./types.js').EvidenceItem[]} p.evidenceItems
 * @param {string} p.workspaceId
 * @param {object} [p.roster]   injectable { names:Set, list:[] } for offline tests
 * @param {boolean} [p.fast=true]  keep reasoning deterministic (no extra LLM round-trip)
 */
export async function composeAnswer({ question, intent, evidenceItems, workspaceId, roster, fast = true }) {
  const evidenceSet = {
    rag:      evidenceItems.filter(e => e.type === 'rag'),
    memory:   evidenceItems.filter(e => e.type === 'memory'),
    entities: evidenceItems.filter(e => e.type === 'entity'),
    timeline: evidenceItems.filter(e => e.type === 'timeline'),
    health:   null,
    _sources: ['agent_runtime'],
  };

  const ranked = rankEvidence(evidenceSet, intent);

  // Honest empty-state — never fabricate when there is no evidence.
  if (ranked.total === 0) {
    return {
      answer: "I don't have enough evidence in this workspace to answer that yet.",
      ranked,
      reasoning:    { chain: [], findings: [], gaps: ['no evidence gathered'], contradictions: [], narrative: '' },
      verification: { passed: true, trustLevel: 'low', issues: [], warnings: [], verificationSummary: 'No evidence.' },
      confidence:   { score: 10, level: 'low', explanation: 'No evidence retrieved.', components: {} },
      insufficientEvidence: true,
    };
  }

  let reasoning;
  try {
    reasoning = await reason(intent, ranked, '', { fast });
  } catch {
    reasoning = _heuristicReasoning(ranked);
  }

  const verification = verify(reasoning, ranked, intent);
  const confidence   = scoreConfidence(ranked, reasoning, verification, intent);

  let answer = _composeProse(reasoning, ranked);

  // Hallucination guard — identical to the brain's claim gate.
  const people = await _roster(workspaceId, roster);
  const claim  = verifySynthesisClaims(answer, { people: people.names, relationships: [] });
  if (claim.status === 'REPAIR' && claim.repaired) answer = claim.repaired;

  return { answer, ranked, reasoning, verification, confidence, claim, insufficientEvidence: false };
}

function _composeProse(reasoning, ranked) {
  if (reasoning.narrative && reasoning.narrative.trim().length > 20) {
    return reasoning.narrative.trim();
  }
  const findings = (reasoning.findings || []).slice(0, 3).map(f => f.finding).filter(Boolean);
  if (findings.length) return findings.join(' ');
  // Fall back to the top evidence content, plainly stated.
  const top = ranked.primary.slice(0, 2).map(e => String(e.content).slice(0, 220));
  return top.join(' ');
}

function _heuristicReasoning(ranked) {
  const findings = ranked.primary.slice(0, 3).map((e, i) => ({
    finding: String(e.content).slice(0, 200),
    confidence: 0.5,
    evidence_refs: [`E${i + 1}`],
  }));
  return {
    chain: findings.map((f, i) => ({ step: i + 1, thought: f.finding, evidence_refs: f.evidence_refs })),
    findings,
    gaps: [],
    contradictions: [],
    narrative: '',
  };
}
