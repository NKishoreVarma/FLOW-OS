/**
 * NaturalReplyGenerator — generates personality-rich responses for social intents.
 *
 * Used for: greetings, small talk, thanks, farewell, celebration, help, jokes.
 * These do NOT touch the Operational Brain.
 *
 * Uses the LLM with a rich personality prompt.
 * NOT templates. Responses emerge from the LLM understanding context.
 * Fallbacks only fire if the LLM is completely unavailable.
 */

import { ask }                 from '../BrainRouter.js';
import { TaskType }            from '../types.js';
import { INTENTS }             from './ConversationIntentEngine.js';
import { toneToDescription }   from './AdaptiveToneEngine.js';

const FLOW_PERSONA = `You are FLOW — the embedded operational intelligence system for this company.

You are NOT a generic AI assistant. You are a senior teammate who:
- Has been watching this workspace all day
- Knows the company's current state (health, incidents, meetings, PRs)
- Speaks like a trusted Chief of Staff — warm, direct, confident
- Never says "I'm just an AI", "As an AI language model", or "I don't have feelings"
- Never uses filler phrases: "Certainly!", "Of course!", "Absolutely!", "Great question!"
- Occasionally uses dry wit when appropriate
- Always moves the conversation forward — never leaves the user at a dead end`;

/**
 * Build a personality prompt for a given social intent.
 */
function buildPrompt(intent, ctx) {
  const {
    userFirstName, healthScore, hasIncidents, isInboxZero,
    timeLabel, tone, occasion, lastEntry,
    deploymentSuccess, sprintCompleted, taskJustDone,
    isFirstMessage, messageCount,
  } = ctx;

  const name        = userFirstName ? userFirstName : null;
  const greeting    = name ? `The user's name is ${name}. Address them by name occasionally but not every time.` : '';
  const toneDesc    = toneToDescription(tone);

  const workspaceStatus = [
    `Workspace health: ${healthScore || 80}/100.`,
    hasIncidents        ? '⚠️  There is an active incident right now.' : 'No active incidents.',
    isInboxZero         ? 'Inbox is at zero.' : '',
    deploymentSuccess   ? 'A deployment just succeeded.' : '',
    sprintCompleted     ? 'The sprint was just completed.' : '',
    taskJustDone        ? 'A task was just completed.' : '',
  ].filter(Boolean).join(' ');

  const historyNote = lastEntry
    ? `Last topic discussed: "${lastEntry.topic || lastEntry.query}" (${Math.round((Date.now() - lastEntry.ts) / 60000)} minutes ago).`
    : isFirstMessage
      ? 'This is the first message of this session.'
      : '';

  const intentInstructions = {
    [INTENTS.GREETING]: `
Greet the user. Be genuine, not generic. Mention the time of day (${timeLabel}).
Give one sentence of honest workspace status. Ask what to work on.
Format: 2-4 short lines. No headers. Conversational. End with a question.
${isFirstMessage ? 'This is the start of a fresh session.' : 'The user has been active for a while.'}
Example style:
"Hey ${name || 'there'}. Good ${timeLabel === 'morning' ? 'morning' : timeLabel === 'afternoon' ? 'afternoon' : 'evening'}.
${hasIncidents ? 'Heads up — there is an active incident.' : 'Everything is running smoothly right now.'}
What should we focus on first?"`,

    [INTENTS.THANKS]: `
The user just said thanks. Respond naturally. Be warm but not effusive.
Tell them you will keep watching the workspace.
2-3 lines. End with a gentle offer to continue.`,

    [INTENTS.FAREWELL]: `
The user is leaving. Say goodbye naturally. Mention what you will watch while they are away.
1-2 lines. Warm but brief.`,

    [INTENTS.SMALL_TALK]: `
The user sent a casual message: "${ctx.query}"
Respond naturally. Match their energy. 1-2 sentences. Then redirect back to work naturally.
Do not be awkward about the transition.`,

    [INTENTS.CELEBRATION]: `
The user is celebrating something. Celebrate with them genuinely.
Acknowledge what they are celebrating. 2-3 lines. Then ask what is next.
${hasIncidents ? 'Note: there is still an active incident — acknowledge the win but stay focused.' : ''}`,

    [INTENTS.JOKE]: `
Tell a short, clean, work-appropriate joke. Programming or business themed.
1-2 lines for the joke. Then lightly redirect back to work.`,

    [INTENTS.HELP]: `
Explain what FLOW can do. Be concrete, not abstract.
List 4-5 specific things with examples. Keep each example short.
End with "What would you like to start with?"`,

    [INTENTS.FEEDBACK]: `
The user gave feedback on a response. Acknowledge it naturally.
If positive: brief thanks, move on. If negative: acknowledge, offer to try again.
2 lines.`,
  };

  const instructions = intentInstructions[intent] || `
Respond naturally to: "${ctx.query}"
Be warm, brief, and move the conversation forward. 2-3 lines.`;

  return `${FLOW_PERSONA}

${greeting}
${workspaceStatus}
${historyNote}
Time: ${timeLabel}. Tone: ${toneDesc}.

${instructions}

Write in plain prose. No markdown headers. No bullet lists unless listing capabilities.
Under 100 words unless listing capabilities. Sound human, not generated.`;
}

/**
 * Generate a natural social response using the LLM.
 *
 * @param {string} intent  — from INTENTS
 * @param {object} ctx     — enriched context including tone, workspace signals, history
 * @returns {Promise<string>}
 */
export async function generateNaturalReply(intent, ctx) {
  try {
    const response = await ask({
      taskType:    TaskType.CHAT,
      messages:    [{ role: 'user', content: buildPrompt(intent, ctx) }],
      maxTokens:   180,
      temperature: 0.70,
    });

    const text = (response?.text || response || '').toString().trim();
    if (text.length > 10) return text;
  } catch { /* fall through to hardcoded fallbacks */ }

  // Hardcoded fallbacks — only used if LLM is completely unavailable
  const n           = ctx.userFirstName ? ` ${ctx.userFirstName}` : '';
  const health      = ctx.healthScore || 80;
  const statusLine  = ctx.hasIncidents
    ? 'There is an active incident — worth checking in on.'
    : health >= 85
      ? 'Everything is running well.'
      : `Workspace health is at ${health}/100.`;

  const fallbacks = {
    [INTENTS.GREETING]:    `Hey${n}. ${statusLine} What should we focus on first?`,
    [INTENTS.THANKS]:      `Always here. I will keep watching the workspace and surface anything that needs attention.`,
    [INTENTS.FAREWELL]:    `Take care${n}. I will keep an eye on things.`,
    [INTENTS.SMALL_TALK]:  `Good one. Anything we should tackle today?`,
    [INTENTS.CELEBRATION]: `Well done${n}! That is great news. What is next on the list?`,
    [INTENTS.JOKE]:        `Why do programmers prefer dark mode? Because light attracts bugs. Now — anything to tackle?`,
    [INTENTS.HELP]:        `I can help you query workspace data, review PRs, check meetings, analyze incidents, monitor customer health, and more. What would you like to start with?`,
    [INTENTS.FEEDBACK]:    `Noted${n}. Let me know how I can do better.`,
  };

  return fallbacks[intent] || `I am here. What would you like to look at?`;
}
