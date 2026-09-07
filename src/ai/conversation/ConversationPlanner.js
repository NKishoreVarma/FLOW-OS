/**
 * ConversationPlanner — decides what FLOW should do given intent + context.
 *
 * This is the decision layer. It does NOT generate content.
 * It produces a plan that ResponseComposer and NaturalReplyGenerator execute.
 *
 * The key question: "What is the user trying to accomplish?"
 */

import { INTENTS, isDirectReplyIntent, isExpansionIntent } from './ConversationIntentEngine.js';

export const ACTIONS = Object.freeze({
  GREET:             'greet',
  RESPOND_SOCIAL:    'respond_social',
  QUERY_BRAIN:       'query_brain',
  EXPAND_PREVIOUS:   'expand_previous',
  CONTINUE_TOPIC:    'continue_topic',
  CELEBRATE:         'celebrate',
  PROVIDE_HELP:      'provide_help',
  ACKNOWLEDGE:       'acknowledge',    // corrections, feedback
});

export const SHAPES = Object.freeze({
  NARRATIVE:  'narrative',  // prose answer with structure
  CARDS:      'cards',      // inline data cards dominate
  METRICS:    'metrics',    // numbers / health scores
  TIMELINE:   'timeline',   // ordered events
  MIXED:      'mixed',      // narrative + cards
});

/**
 * Produce a plan from intent + context.
 *
 * @param {string}  intent — from ConversationIntentEngine
 * @param {object}  ctx    — from buildConversationContext, enriched with tone/emotion
 * @returns {ConversationPlan}
 */
export function plan(intent, ctx) {
  const { lastEntry, hasIncidents, tone } = ctx;

  switch (intent) {

    case INTENTS.GREETING:
      return {
        action:                  ACTIONS.GREET,
        requiresBrain:           false,
        queryText:               null,
        shape:                   SHAPES.NARRATIVE,
        tone,
        includeWorkspaceSummary: true,
        includeNextStep:         true,
      };

    case INTENTS.THANKS:
      return {
        action:          ACTIONS.RESPOND_SOCIAL,
        requiresBrain:   false,
        queryText:       null,
        shape:           SHAPES.NARRATIVE,
        tone,
        includeNextStep: true,
      };

    case INTENTS.FAREWELL:
      return {
        action:          ACTIONS.RESPOND_SOCIAL,
        requiresBrain:   false,
        queryText:       null,
        shape:           SHAPES.NARRATIVE,
        tone,
        includeNextStep: false,
      };

    case INTENTS.SMALL_TALK:
      return {
        action:          ACTIONS.RESPOND_SOCIAL,
        requiresBrain:   false,
        queryText:       null,
        shape:           SHAPES.NARRATIVE,
        tone,
        includeNextStep: true,
      };

    case INTENTS.CELEBRATION:
      return {
        action:          hasIncidents ? ACTIONS.RESPOND_SOCIAL : ACTIONS.CELEBRATE,
        requiresBrain:   false,
        queryText:       null,
        shape:           SHAPES.NARRATIVE,
        tone:            hasIncidents ? 'serious' : tone,
        includeNextStep: true,
      };

    case INTENTS.JOKE:
      return {
        action:          ACTIONS.RESPOND_SOCIAL,
        requiresBrain:   false,
        queryText:       null,
        shape:           SHAPES.NARRATIVE,
        tone,
        forceJoke:       true,
        includeNextStep: true,
      };

    case INTENTS.HELP:
      return {
        action:          ACTIONS.PROVIDE_HELP,
        requiresBrain:   false,
        queryText:       null,
        shape:           SHAPES.NARRATIVE,
        tone,
        includeNextStep: true,
      };

    case INTENTS.FEEDBACK:
    case INTENTS.CORRECTION:
      return {
        action:          ACTIONS.ACKNOWLEDGE,
        requiresBrain:   lastEntry !== null,
        queryText:       lastEntry ? `${ctx.query} (correcting: ${lastEntry.query})` : null,
        shape:           SHAPES.NARRATIVE,
        tone,
        includeNextStep: true,
        expandingFrom:   lastEntry,
      };

    case INTENTS.CONTINUATION:
      if (lastEntry) {
        return {
          action:          ACTIONS.CONTINUE_TOPIC,
          requiresBrain:   true,
          queryText:       `Continue explaining: ${lastEntry.topic || lastEntry.query}`,
          shape:           SHAPES.NARRATIVE,
          tone,
          includeNextStep: true,
          continuingFrom:  lastEntry,
        };
      }
      // No previous context — treat as a greeting
      return {
        action:          ACTIONS.GREET,
        requiresBrain:   false,
        queryText:       null,
        shape:           SHAPES.NARRATIVE,
        tone,
        includeNextStep: true,
        note:            'no_history',
      };

    case INTENTS.CLARIFICATION:
    case INTENTS.FOLLOW_UP:
      if (lastEntry) {
        return {
          action:          ACTIONS.EXPAND_PREVIOUS,
          requiresBrain:   true,
          queryText:       `${ctx.query} (context: the previous answer was about "${lastEntry.topic || lastEntry.query}")`,
          shape:           SHAPES.NARRATIVE,
          tone,
          includeNextStep: true,
          expandingFrom:   lastEntry,
        };
      }
      // No history — treat as fresh workspace query
      return {
        action:          ACTIONS.QUERY_BRAIN,
        requiresBrain:   true,
        queryText:       ctx.query,
        shape:           _inferShape(ctx.query),
        tone,
        includeNextStep: true,
      };

    case INTENTS.WORKSPACE_QUERY:
    case INTENTS.TASK_REQUEST:
    case INTENTS.SUGGESTION:
    case INTENTS.UNKNOWN:
    default:
      return {
        action:          ACTIONS.QUERY_BRAIN,
        requiresBrain:   true,
        queryText:       ctx.query,
        shape:           _inferShape(ctx.query),
        tone,
        includeNextStep: true,
      };
  }
}

function _inferShape(query) {
  const q = query.toLowerCase();
  if (/\b(pr|pull request|commit|branch|deploy|release|ci|pipeline)\b/.test(q))  return SHAPES.MIXED;
  if (/\b(meeting|calendar|agenda|schedule|attendees?)\b/.test(q))               return SHAPES.MIXED;
  if (/\b(health|score|metrics?|stats?|numbers|kpi|analytics)\b/.test(q))        return SHAPES.METRICS;
  if (/\b(timeline|history|log|recent|last|audit|activity)\b/.test(q))           return SHAPES.TIMELINE;
  return SHAPES.NARRATIVE;
}
