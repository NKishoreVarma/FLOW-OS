/**
 * ReasoningEngine — core multi-step reasoning component.
 *
 * Takes intent + ranked evidence and produces a structured reasoning result:
 *   - chain: step-by-step reasoning trace
 *   - findings: key conclusions derived from evidence
 *   - gaps: what evidence is missing
 *   - contradictions: conflicting signals detected
 *   - narrative: human-readable summary of the reasoning
 */

import { ask }      from '../BrainRouter.js';
import { TaskType } from '../types.js';
import { formatEvidenceForPrompt } from './EvidenceRanker.js';

/**
 * @param {import('./IntentAnalyzer.js').IntentResult} intent
 * @param {import('./EvidenceRanker.js').RankedEvidence} ranked
 * @param {string} [capabilityContext] - Pre-built context block from ContextBuilder
 * @returns {Promise<ReasoningResult>}
 */
export async function reason(intent, ranked, capabilityContext = '') {
  const evidenceText = formatEvidenceForPrompt(ranked);
  const hasEvidence  = ranked.total > 0 || capabilityContext.length > 100;

  const systemPrompt = `You are the reasoning core of FLOW OS. You have access to real workspace data that has already been retrieved from FLOW's systems.

STRICT RULES:
- Never say "I don't have access" — data has already been retrieved.
- Never fabricate data not in the context.
- Mark every finding with the source that supports it.
- If evidence is absent, record that as a gap — do not hedge.
- Think like a COO: what does this data mean for the business?`;

  const userPrompt = `QUESTION: ${intent.question}
QUESTION TYPE: ${intent.questionType}
DOMAIN: ${intent.domain}
TIMEFRAME: ${intent.timeframe}
URGENCY: ${intent.urgency}

${capabilityContext ? capabilityContext.slice(0, 2000) + '\n' : ''}
${hasEvidence ? evidenceText : 'FLOW has no additional evidence beyond the capability data above.'}

Now reason through this question step by step. Return a JSON object with:
{
  "chain": [{"step": 1, "thought": "...", "evidence_refs": ["E1", "S2"]}],
  "findings": [{"finding": "...", "confidence": 0.0-1.0, "evidence_refs": [...]}],
  "gaps": ["what information is missing"],
  "contradictions": ["conflicting signals if any"],
  "narrative": "2-3 sentence summary of what the reasoning reveals"
}

Respond with JSON only.`;

  try {
    const result = await ask({
      taskType: TaskType.REASON,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userPrompt },
      ],
      maxTokens: 1000,
      temperature: 0.2,
    });

    const raw    = (result.text || '').replace(/```json?|```/g, '').trim();
    const parsed = JSON.parse(raw);

    return {
      chain:          parsed.chain          || [],
      findings:       parsed.findings       || [],
      gaps:           parsed.gaps           || [],
      contradictions: parsed.contradictions || [],
      narrative:      parsed.narrative      || '',
      _provider:      result.provider,
      _model:         result.model,
    };
  } catch {
    // Heuristic fallback — no LLM
    return _heuristicReason(intent, ranked);
  }
}

function _heuristicReason(intent, ranked) {
  const chain = [];
  const findings = [];
  const gaps = [];

  chain.push({ step: 1, thought: `Identified question as ${intent.questionType} in domain ${intent.domain}.`, evidence_refs: [] });

  if (ranked.total === 0) {
    gaps.push('No evidence found in workspace memory, vector store, or audit log');
    chain.push({ step: 2, thought: 'No evidence available — cannot derive conclusions from workspace data.', evidence_refs: [] });
    return { chain, findings, gaps, contradictions: [], narrative: 'Insufficient evidence in the workspace to answer this question with confidence.', _provider: 'heuristic', _model: 'fallback' };
  }

  ranked.primary.forEach((e, i) => {
    chain.push({ step: i + 2, thought: `Evidence [E${i + 1}]: ${e.content.slice(0, 150)}`, evidence_refs: [`E${i + 1}`] });
    findings.push({ finding: `From ${e.source}: ${e.content.slice(0, 100)}`, confidence: e.rankedScore, evidence_refs: [`E${i + 1}`] });
  });

  if (ranked.total < 3) gaps.push('Limited evidence — less than 3 relevant sources found');

  const narrative = `Found ${ranked.total} evidence items across ${new Set(ranked.primary.map(e => e.type)).size} source types. Top evidence from: ${ranked.primary.slice(0, 2).map(e => e.source).join(', ')}.`;

  return { chain, findings, gaps, contradictions: [], narrative, _provider: 'heuristic', _model: 'fallback' };
}
