/**
 * ConversationPolicy — enforces non-negotiable rules on every response.
 *
 * Applied AFTER composition, BEFORE returning to the frontend.
 * Modifies or repairs responses that violate conversation quality rules.
 */

/**
 * Apply all policies to a composed response.
 *
 * @param {object} response  — { answer, followUps, followUpQuestion, responseShape }
 * @param {object} plan      — from ConversationPlanner
 * @param {object} ctx       — enriched conversation context
 * @returns {object}         — possibly modified response
 */
export function applyPolicies(response, plan, ctx) {
  let { answer, followUps = [], followUpQuestion } = response;

  // ── Rule 1: Never celebrate during incidents ────────────────────────────────
  if (ctx.hasIncidents) {
    answer    = answer.replace(/🎉|🚀|🎊|🥳/g, '');
    answer    = answer.replace(/\b(congratulations?|celebrate|amazing achievement|great news)\b/gi, 'noted');
    followUps = followUps.filter(f => !/(celebrate|congrat|amazing)/i.test(f));
    // Inject incident follow-up if missing
    if (!followUps.some(f => /incident|outage|on-?call/i.test(f))) {
      followUps = ['Show incident status', ...followUps].slice(0, 3);
    }
  }

  // ── Rule 2: Never dead-end — always have at least one action ───────────────
  if (!followUps?.length && !followUpQuestion) {
    followUps = ["What's urgent today?", 'Workspace health', "What should I look at?"];
  }

  // ── Rule 3: Late-night — keep it concise ───────────────────────────────────
  if (ctx.timeLabel === 'late_night' && answer.length > 500) {
    const sentences = answer.match(/[^.!?\n]+[.!?\n]+/g) || [answer];
    const shortened = sentences.slice(0, 3).join(' ').trim();
    if (shortened.length > 60) {
      answer = shortened;
      if (!/\?/.test(answer.slice(-80))) answer += '\n\nWe can go deeper tomorrow.';
    }
  }

  // ── Rule 4: Replace "Nothing found" language ────────────────────────────────
  answer = answer
    .replace(/nothing (to show|found)\./gi,     'Did not surface a direct match here.')
    .replace(/i couldn'?t find anything[^.]*\./gi, 'Did not find a direct match — want me to try a different search?')
    .replace(/no results? (found|available)[^.]*\./gi, 'Did not find anything specific there.')
    .replace(/\bnothing here\b/gi,              'Nothing came up directly');

  // ── Rule 5: Never start with "I " (chatbot smell) ──────────────────────────
  answer = answer.replace(/^I (found|searched|looked|checked|analyzed|believe|think)\b/im, (_, verb) => {
    const replacements = {
      found:    'Here is what came up:',
      searched: 'Searching the workspace —',
      looked:   'Looking through the workspace —',
      checked:  'Checking the workspace:',
      analyzed: 'Here is the analysis:',
      believe:  'Based on the workspace data:',
      think:    'Based on the workspace data:',
    };
    return replacements[verb.toLowerCase()] || 'Here is what came up:';
  });

  return { ...response, answer, followUps, followUpQuestion };
}

/**
 * Validate and repair a plan before execution.
 * Prevents logic errors like calling the brain for a greeting.
 */
export function validatePlan(conversationPlan, ctx) {
  let { action, requiresBrain } = conversationPlan;

  // Social actions must not query the brain
  if (['greet', 'respond_social', 'celebrate', 'provide_help'].includes(action) && requiresBrain) {
    return { ...conversationPlan, requiresBrain: false, queryText: null };
  }

  // Cannot celebrate during an incident
  if (ctx.hasIncidents && action === 'celebrate') {
    return { ...conversationPlan, action: 'respond_social', tone: 'serious' };
  }

  return conversationPlan;
}
