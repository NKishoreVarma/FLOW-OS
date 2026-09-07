/**
 * DecisionTree — represents the decision path behind a recommendation as an
 * inspectable branch structure: the criteria evaluated, the branch taken, and the
 * resulting decision with its confidence. Answers "why this recommendation?".
 */

export function buildDecisionTree({ question, confidence, missing, contradictions, recommendedActions = [] } = {}) {
  const sufficient = missing ? missing.sufficient : true;
  const hasConflict = (contradictions?.length || 0) > 0;
  const conf = confidence?.overall ?? 50;
  const topAction = recommendedActions[0];

  // Root → sufficiency branch → conflict branch → confidence branch → outcome.
  return {
    root: question ? String(question).slice(0, 160) : 'Operational decision',
    branches: [
      {
        criterion: 'Is there sufficient evidence?',
        evaluated: sufficient ? 'yes' : 'no',
        branches: sufficient ? [
          {
            criterion: 'Is the evidence internally consistent?',
            evaluated: hasConflict ? 'no — contradictions present' : 'yes',
            branches: [
              {
                criterion: 'Is confidence high enough to act?',
                evaluated: conf >= 60 ? `yes (${conf}/100)` : `borderline (${conf}/100)`,
                outcome: hasConflict
                  ? 'Resolve the contradiction before acting; recommendation is provisional.'
                  : (topAction ? `Recommend: ${_actionText(topAction)}` : 'Proceed with the stated conclusion.'),
              },
            ],
          },
        ] : [
          { criterion: 'Fallback', evaluated: 'insufficient evidence', outcome: 'Do not conclude — gather the missing information first (see Missing Information).' },
        ],
      },
    ],
    decision: sufficient
      ? (hasConflict ? 'provisional' : (conf >= 60 ? 'act' : 'act_with_caution'))
      : 'defer',
    confidence: conf,
  };
}

function _actionText(a) {
  if (typeof a === 'string') return a.slice(0, 120);
  return (a.title || a.action || a.description || 'recommended action').slice(0, 120);
}
