/**
 * AlternativeGenerator — surfaces other plausible conclusions or decisions so the
 * answer can be challenged, not just accepted. Always includes a "gather more
 * evidence / do nothing yet" option when appropriate, plus opposing
 * interpretations implied by any contradictions.
 */

export function generateAlternatives({ summary, recommendedActions = [], contradictions = [], missing, confidence } = {}) {
  const alts = [];
  const conf = confidence?.overall ?? 50;

  // 1. Defer when evidence is insufficient or confidence is low.
  if (missing && !missing.sufficient) {
    alts.push({
      title: 'Gather more evidence before deciding',
      rationale: 'The evidence is currently insufficient to conclude reliably.',
      tradeoff: 'Delays action, but avoids acting on an unreliable read.',
      confidence: 'n/a',
    });
  } else if (conf < 55) {
    alts.push({
      title: 'Treat as provisional and re-check shortly',
      rationale: `Overall confidence is ${conf}/100 — the conclusion may shift with fresh data.`,
      tradeoff: 'Slower, but reduces the risk of a premature decision.',
      confidence: 'low',
    });
  }

  // 2. Opposing interpretation for each contradiction.
  for (const c of contradictions.slice(0, 2)) {
    alts.push({
      title: `Alternative reading: ${_short(c.claimB || c.b || 'the conflicting signal')} holds`,
      rationale: `Evidence conflicts — ${_short(c.claimA || c.a)} vs ${_short(c.claimB || c.b)}. The opposite conclusion is defensible if the conflicting source is more current.`,
      tradeoff: 'Depends which source is authoritative; resolve before committing.',
      confidence: 'contested',
    });
  }

  // 3. Secondary recommended action, if the pipeline offered more than one.
  if (recommendedActions.length > 1) {
    alts.push({
      title: `Alternative action: ${_actionText(recommendedActions[1])}`,
      rationale: 'A viable secondary path with a different risk/effort profile.',
      tradeoff: 'May be lower-impact or slower than the primary recommendation.',
      confidence: 'moderate',
    });
  }

  // 4. Explicit do-nothing baseline (always worth naming).
  if (!alts.some(a => /do nothing|gather more/i.test(a.title))) {
    alts.push({
      title: 'Take no action for now',
      rationale: 'Baseline option — the situation may resolve on its own or not warrant intervention.',
      tradeoff: _risk(summary),
      confidence: 'n/a',
    });
  }

  return alts;
}

function _short(s) { return String(s || '').slice(0, 80); }
function _actionText(a) { return typeof a === 'string' ? a.slice(0, 100) : (a.title || a.action || a.description || 'secondary action').slice(0, 100); }
function _risk(summary) { return /incident|outage|churn|breach|deadline|risk/i.test(String(summary || '')) ? 'Risk: inaction may allow a known problem to worsen.' : 'Low downside if the signal is not material.'; }
