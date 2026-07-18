/**
 * FLOW OS — Executive Debate Engine (Phase 15)
 *
 * Deterministically detects disagreement across agent findings and surfaces it rather
 * than hiding it: conflicting positions, confidence spread, and unresolved
 * contradictions. High-evidence minority opinions are preserved. (M2 enriches the
 * tradeoff narrative.)
 */

const CONFIDENCE_SPREAD = 35; // points between most/least confident agents → notable
const RISK_WORDS = /\b(risk|risky|block|blocked|delay|fail|failing|unsafe|do not|don't|hold|postpone|reject|concern|vulnerab\w*|breach|churn|burnout|over ?budget|not ready)\b/gi;
const GO_WORDS   = /\b(proceed|ship|approve|go ahead|safe|ready|launch|merge|green ?light|on track)\b/gi;

function countMatches(text, re) {
  const m = String(text).match(re);
  return m ? m.length : 0;
}

/**
 * A COO's go / no-go lean. Counting (not first-match) so a phrase like
 * "do not proceed — security risk, unsafe" reads as caution even though it contains
 * the word "proceed". Risk signals only need to match, not exceed, go signals to win —
 * for a go/no-go decision an unresolved risk dominates.
 */
function polarity(finding) {
  const text = `${finding.stance || ''} ${finding.summary || ''}`;
  const risk = countMatches(text, RISK_WORDS) + ((finding.contradictions || []).length ? 1 : 0);
  const go   = countMatches(text, GO_WORDS);
  if (risk > 0 && risk >= go) return 'caution';
  if (go > 0) return 'go';
  return 'neutral';
}

export function detectDebate(findings = []) {
  if (findings.length < 2) {
    return { hasDisagreement: false, conflicts: [], minorityOpinions: [], recommendation: null, note: 'Single agent — no debate.' };
  }

  const withPolarity = findings.map((f) => ({ f, polarity: polarity(f) }));
  const gos      = withPolarity.filter((x) => x.polarity === 'go').map((x) => x.f);
  const cautions = withPolarity.filter((x) => x.polarity === 'caution').map((x) => x.f);

  const confidences = findings.map((f) => f.confidence).filter((v) => typeof v === 'number');
  const spread = confidences.length >= 2 ? Math.max(...confidences) - Math.min(...confidences) : 0;

  const conflicts = [];
  if (gos.length && cautions.length) {
    conflicts.push({
      topic: 'Proceed vs. hold',
      positions: [
        { stance: 'proceed', agents: gos.map((f) => f.title), rationale: gos[0].summary },
        { stance: 'caution', agents: cautions.map((f) => f.title), rationale: cautions[0].summary },
      ],
      tradeoffs: `${gos.map((f) => f.title).join(', ')} see readiness; ${cautions.map((f) => f.title).join(', ')} see risk. Weigh speed against the flagged exposure before deciding.`,
    });
  }
  if (spread >= CONFIDENCE_SPREAD) {
    const sorted = [...findings].filter((f) => typeof f.confidence === 'number').sort((a, b) => b.confidence - a.confidence);
    conflicts.push({
      topic: 'Confidence divergence',
      positions: [
        { stance: 'high confidence', agents: [sorted[0].title], rationale: `${sorted[0].confidence}% — ${sorted[0].summary}` },
        { stance: 'low confidence', agents: [sorted[sorted.length - 1].title], rationale: `${sorted[sorted.length - 1].confidence}% — evidence is thinner here` },
      ],
      tradeoffs: 'Agents disagree on how strong the evidence is; treat the low-confidence domain as the key uncertainty to resolve.',
    });
  }

  // Minority: the smaller polarity camp, kept when it carries real evidence.
  const majorityPolarity = gos.length >= cautions.length ? 'go' : 'caution';
  const minority = withPolarity
    .filter((x) => x.polarity !== 'neutral' && x.polarity !== majorityPolarity)
    .map((x) => x.f)
    .filter((f) => (f.evidenceCount || 0) > 0 || (f.contradictions || []).length > 0)
    .map((f) => ({ agent: f.agent, title: f.title, position: f.stance || f.summary, evidenceCount: f.evidenceCount }));

  const hasDisagreement = conflicts.length > 0;
  const recommendation = hasDisagreement
    ? (cautions.length && cautions.some((f) => f.agent === 'security')
        ? 'Security raised a concern — resolve it before proceeding.'
        : gos.length >= cautions.length
          ? 'Majority leans toward proceeding; address the minority concern in parallel.'
          : 'Majority urges caution; hold until the flagged risks are resolved.')
    : null;

  return { hasDisagreement, conflicts, minorityOpinions: minority, recommendation };
}

export default { detectDebate };
