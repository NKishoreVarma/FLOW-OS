/**
 * ConsensusEngine — builds consensus from a set of agent outputs.
 *
 * Algorithm:
 *   1. Extract each agent's recommendation action (the "stance")
 *   2. Cluster similar stances by keyword overlap (Jaccard similarity)
 *   3. Find the dominant cluster — if ≥ 60% of agents agree → consensus reached
 *   4. Detect explicit conflicts — agents with opposing go/caution polarity
 *   5. Preserve minority views that carry evidence weight
 *   6. Calculate weighted confidence: each agent's confidence × relevance score
 *
 * The ConsensusEngine is pure data — no LLM calls. It is deterministic.
 */

const CONSENSUS_THRESHOLD     = 0.6;  // 60% of agents must agree
const CONFLICT_POLARITY_WORDS = {
  proceed: /\b(proceed|approve|merge|ship|deploy|send|create|go ahead|execute|run|launch|start)\b/i,
  caution: /\b(hold|block|wait|stop|reject|deny|escalate|defer|risk|unsafe|not ready|do not|don't)\b/i,
};

/**
 * @param {import('../agents/BaseAgent.js').AgentOutput[]} agentOutputs
 * @returns {ConsensusResult}
 */
export function buildConsensus(agentOutputs) {
  const relevant = agentOutputs.filter(o => o.relevanceScore >= 15 && !o.error);

  if (!relevant.length) {
    return _emptyConsensus(agentOutputs.length);
  }

  const polarities = relevant.map(o => ({
    agentId:    o.agentId,
    agentName:  o.agentName,
    stance:     o.recommendation?.action || '',
    polarity:   _polarity(o.recommendation?.action || ''),
    confidence: o.confidence || 0,
    relevance:  o.relevanceScore || 0,
    evidenceCount: (o.findings || []).length,
  }));

  // Weighted confidence
  const totalWeight      = polarities.reduce((s, p) => s + p.relevance, 0) || 1;
  const weightedConf     = polarities.reduce((s, p) => s + (p.confidence * p.relevance / totalWeight), 0);
  const confidence       = Math.round(weightedConf);

  // Polarity counts
  const proceedCount     = polarities.filter(p => p.polarity === 'proceed').length;
  const cautionCount     = polarities.filter(p => p.polarity === 'caution').length;
  const neutralCount     = polarities.length - proceedCount - cautionCount;

  // Conflict detection
  const conflicts        = _detectConflicts(polarities, proceedCount, cautionCount);

  // Majority determination
  const majorityPolarity = proceedCount > cautionCount ? 'proceed'
    : cautionCount > proceedCount ? 'caution' : 'neutral';

  const majorityCount    = Math.max(proceedCount, cautionCount, neutralCount);
  const majorityRatio    = majorityCount / polarities.length;
  const reached          = majorityRatio >= CONSENSUS_THRESHOLD && conflicts.length === 0;

  // Supporting and minority agents
  const supportingAgents = polarities
    .filter(p => p.polarity === majorityPolarity || (majorityPolarity === 'neutral' && p.polarity === 'neutral'))
    .map(p => p.agentId);

  const minorityViews    = _extractMinorityViews(polarities, majorityPolarity);

  // Security veto — if security agent raises a caution, override consensus to not-reached
  const securityOutput   = polarities.find(p => p.agentId === 'security');
  const securityVetoed   = securityOutput?.polarity === 'caution' && majorityPolarity === 'proceed';

  return {
    reached:         reached && !securityVetoed,
    confidence,
    dominantPolarity:majorityPolarity,
    dominantAction:  _dominantAction(polarities, majorityPolarity),
    supportingAgents,
    conflicts,
    minorityViews,
    securityVetoed,
    participantCount:relevant.length,
    counts: { proceed: proceedCount, caution: cautionCount, neutral: neutralCount },
  };
}

// ── Internals ─────────────────────────────────────────────────────────────────

function _polarity(text) {
  if (!text) return 'neutral';
  const isProceed = CONFLICT_POLARITY_WORDS.proceed.test(text);
  const isCaution = CONFLICT_POLARITY_WORDS.caution.test(text);
  if (isCaution && isCaution >= isProceed) return 'caution';
  if (isProceed) return 'proceed';
  return 'neutral';
}

function _detectConflicts(polarities, proceedCount, cautionCount) {
  const conflicts = [];

  if (proceedCount > 0 && cautionCount > 0) {
    const proceeders = polarities.filter(p => p.polarity === 'proceed');
    const cautioners = polarities.filter(p => p.polarity === 'caution');
    conflicts.push({
      topic:     'Proceed vs. caution',
      positions: [
        { stance: 'proceed', agents: proceeders.map(p => p.agentId), rationale: proceeders[0]?.stance },
        { stance: 'caution', agents: cautioners.map(p => p.agentId), rationale: cautioners[0]?.stance },
      ],
    });
  }

  // Confidence spread conflict (>35 points between highest and lowest)
  const confidences = polarities.map(p => p.confidence).filter(c => c > 0);
  if (confidences.length >= 2) {
    const spread = Math.max(...confidences) - Math.min(...confidences);
    if (spread >= 35) {
      const sorted = [...polarities].sort((a, b) => b.confidence - a.confidence);
      conflicts.push({
        topic: 'Confidence divergence',
        positions: [
          { stance: 'high-confidence',  agents: [sorted[0].agentId],               rationale: `${sorted[0].confidence}% confidence` },
          { stance: 'low-confidence',   agents: [sorted[sorted.length - 1].agentId], rationale: `${sorted[sorted.length - 1].confidence}% confidence` },
        ],
      });
    }
  }

  return conflicts;
}

function _dominantAction(polarities, dominantPolarity) {
  const dominant = polarities.filter(p => p.polarity === dominantPolarity);
  if (!dominant.length) return '';
  // Return the action from the highest-confidence dominant agent
  const top = dominant.sort((a, b) => b.confidence - a.confidence)[0];
  return top.stance;
}

function _extractMinorityViews(polarities, majorityPolarity) {
  return polarities
    .filter(p => p.polarity !== majorityPolarity && p.polarity !== 'neutral' && p.evidenceCount > 0)
    .map(p => ({
      agentId:       p.agentId,
      agentName:     p.agentName,
      position:      p.stance,
      polarity:      p.polarity,
      confidence:    p.confidence,
      evidenceCount: p.evidenceCount,
    }));
}

function _emptyConsensus(participantCount) {
  return {
    reached:          false,
    confidence:       0,
    dominantPolarity: 'neutral',
    dominantAction:   '',
    supportingAgents: [],
    conflicts:        [],
    minorityViews:    [],
    securityVetoed:   false,
    participantCount,
    counts:           { proceed: 0, caution: 0, neutral: 0 },
  };
}
