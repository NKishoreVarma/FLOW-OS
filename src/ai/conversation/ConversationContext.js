/**
 * ConversationContext — assembles the full context object for all downstream services.
 *
 * This is the single source of truth about what is happening right now:
 * the user, the workspace, the time, and the conversation history.
 */

import { getState }          from './ConversationStateManager.js';
import { recall, getLastEntry } from './ConversationMemory.js';

/**
 * Build the full context for a conversation turn.
 *
 * @returns {Promise<ConversationContext>}
 */
export async function buildConversationContext(workspaceId, opts) {
  const {
    query,
    intent,
    userName           = null,
    pageContext         = '',
    healthScore        = 80,
    hasIncidents       = false,
    isInboxZero        = false,
    taskJustDone       = false,
    deploymentSuccess  = false,
    sprintCompleted    = false,
  } = opts;

  const [state, history, lastEntry] = await Promise.all([
    getState(workspaceId),
    recall(workspaceId, 5),
    getLastEntry(workspaceId),
  ]);

  const now        = new Date();
  const hour       = now.getHours();
  const dayOfWeek  = now.getDay();
  const timeLabel  = hour < 6 ? 'late_night'
    : hour < 12 ? 'morning'
    : hour < 17 ? 'afternoon'
    : hour < 21 ? 'evening'
    : 'night';

  return {
    // Current turn
    query,
    intent,

    // User
    userName,
    userFirstName: userName ? userName.split(' ')[0] : null,
    pageContext,

    // Workspace signals
    healthScore,
    hasIncidents,
    isInboxZero,
    taskJustDone,
    deploymentSuccess,
    sprintCompleted,

    // Time signals
    timeLabel,
    hour,
    dayOfWeek,
    isFriday:  dayOfWeek === 5,
    isMonday:  dayOfWeek === 1,
    isWeekend: dayOfWeek === 0 || dayOfWeek === 6,

    // Conversation state
    currentTopic:        state.currentTopic,
    previousTopic:       state.previousTopic,
    currentIntent:       state.currentIntent,
    entities:            state.entities || {},
    lastResponse:        state.lastResponse,
    lastRecommendation:  state.lastRecommendation,
    lastQuery:           state.lastQuery,
    messageCount:        state.messageCount || 0,

    // History
    history,       // last 5 entries, most-recent first
    lastEntry,     // single most recent entry

    // Derived
    isFirstMessage: (state.messageCount || 0) === 0,
    hasHistory:     history.length > 0,
  };
}
