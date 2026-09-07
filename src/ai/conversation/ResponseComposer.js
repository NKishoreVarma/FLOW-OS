/**
 * ResponseComposer — composes the final response from a plan + brain output.
 *
 * The Operational Brain gives raw data and answer text.
 * ResponseComposer decides how to structure and present it based on the plan.
 *
 * Different intents and shapes produce genuinely different response structures.
 * This is NOT a rewriter — it is a compositor.
 */

import { ask }               from '../BrainRouter.js';
import { TaskType }          from '../types.js';
import { ACTIONS, SHAPES }   from './ConversationPlanner.js';
import { toneToDescription } from './AdaptiveToneEngine.js';

const FLOW_VOICE = `You are FLOW — an enterprise operations intelligence system.

Voice rules (non-negotiable):
- Speak like a trusted senior colleague, not a chatbot
- Never say: "I found", "Based on the data", "As an AI", "Nothing found", "I don't have access"
- Never start a sentence with "I" as the first word
- Never use filler: "Certainly!", "Of course!", "Great question!", "Absolutely!"
- Be specific — use actual names, numbers, and statuses from the data
- End with one question or next step that moves the conversation forward
- Use markdown only when it genuinely helps (lists for multiple items, bold for key names)`;

/**
 * Compose a final response from the plan and brain output.
 *
 * @param {object} conversationPlan  — from ConversationPlanner
 * @param {object} brainOutput       — { answer, sources, cards, actions } or null
 * @param {object} ctx               — enriched conversation context
 * @returns {Promise<ComposedResponse>}
 */
export async function compose(conversationPlan, brainOutput, ctx) {
  const { shape, tone, action, includeNextStep, expandingFrom, continuingFrom } = conversationPlan;
  const rawAnswer  = brainOutput?.answer || '';
  const toneDesc   = toneToDescription(tone);

  if (!rawAnswer || rawAnswer.length < 5) {
    return {
      answer:           _buildFallback(conversationPlan, ctx),
      followUps:        _buildFollowUps(conversationPlan, ctx),
      followUpQuestion: _buildFollowUpQuestion(ctx),
      responseShape:    shape,
    };
  }

  // For very short answers — return with a next step appended
  if (rawAnswer.length < 150) {
    const answer = includeNextStep ? _appendNextStep(rawAnswer, ctx) : rawAnswer;
    return {
      answer,
      followUps:        _buildFollowUps(conversationPlan, ctx),
      followUpQuestion: _buildFollowUpQuestion(ctx),
      responseShape:    shape,
    };
  }

  // For longer answers — use LLM to polish into FLOW's voice
  try {
    const historyContext = expandingFrom
      ? `This expands on the previous answer about: "${expandingFrom.topic || expandingFrom.query}"\nPrevious summary: ${expandingFrom.answer?.slice(0, 200)}`
      : continuingFrom
        ? `This continues the discussion of: "${continuingFrom.topic || continuingFrom.query}"`
        : '';

    const shapeInstruction = {
      [SHAPES.NARRATIVE]:  'Use paragraphs. No bullet lists unless listing more than 4 items.',
      [SHAPES.CARDS]:      'Structure key data clearly. Use **name: value** patterns. Bullets OK for parallel items.',
      [SHAPES.METRICS]:    'Lead with the key number. Provide context. Use **bold** for important figures.',
      [SHAPES.TIMELINE]:   'Present events in order. Use - date: event format.',
      [SHAPES.MIXED]:      'Lead with a direct answer paragraph, then structure detail below.',
    }[shape] || 'Use paragraphs.';

    const lengthHint = ctx.timeLabel === 'late_night' ? 'Keep under 120 words.' : 'Keep under 200 words.';

    const prompt = `${FLOW_VOICE}

Tone: ${toneDesc}
User asked: "${ctx.query}"
${ctx.currentTopic ? `Topic: ${ctx.currentTopic}` : ''}
${ctx.hasIncidents ? 'Active incident in workspace — keep focused.' : ''}
${historyContext}

Raw answer to rewrite in FLOW's voice:
${rawAnswer}

Format: ${shapeInstruction}
${lengthHint}
End with exactly one question or next step.`;

    const response = await ask({
      taskType:    TaskType.CHAT,
      messages:    [{ role: 'user', content: prompt }],
      maxTokens:   350,
      temperature: 0.30,
    });

    const polished = (response?.text || response || '').toString().trim();
    if (polished.length > 20) {
      return {
        answer:           polished,
        followUps:        _buildFollowUps(conversationPlan, ctx),
        followUpQuestion: _buildFollowUpQuestion(ctx),
        responseShape:    shape,
      };
    }
  } catch { /* fall through to raw answer */ }

  return {
    answer:           _appendNextStep(rawAnswer, ctx),
    followUps:        _buildFollowUps(conversationPlan, ctx),
    followUpQuestion: _buildFollowUpQuestion(ctx),
    responseShape:    shape,
  };
}

function _appendNextStep(answer, ctx) {
  // Only append if no question mark in the last 100 chars
  if (/\?/.test(answer.slice(-120))) return answer;
  return answer + '\n\nWant me to go deeper on any of this?';
}

function _buildFallback(plan, ctx) {
  const n = ctx.userFirstName ? ` ${ctx.userFirstName}` : '';
  if (plan.action === ACTIONS.GREET) {
    return ctx.hasIncidents
      ? `Hey${n}. There is an active incident — want to dig in?`
      : `Hey${n}. Workspace health is at ${ctx.healthScore || 80}/100 — everything is calm. What should we focus on?`;
  }
  return `Looked through the workspace but did not find a clear match. Want to try a different angle?`;
}

function _buildFollowUps(plan, ctx) {
  const topic  = (ctx.currentTopic || ctx.query || '').toLowerCase();
  const intent = ctx.intent;

  // Topic-specific follow-ups
  if (/\b(pr|pull request|commit|merge|branch)\b/.test(topic))        return ['Show open PRs',       'Any blockers?',          'Who needs to review?'];
  if (/\b(meeting|calendar|agenda|schedule)\b/.test(topic))            return ['Show agenda',         'Who is attending?',      'Prep me for this'];
  if (/\b(incident|outage|alert|sev|down)\b/.test(topic))             return ['Show incident log',   'Who is on-call?',        'What is the impact?'];
  if (/\b(customer|client|account|churn)\b/.test(topic))              return ['Customer health',     'Any open issues?',       'Last interaction?'];
  if (/\b(deploy|release|rollout|ship)\b/.test(topic))                return ['Deployment status',   'Any rollback risks?',    'Who deployed?'];
  if (/\b(sprint|ticket|jira|task|backlog)\b/.test(topic))            return ['Sprint progress',     'Blocked tickets?',       'Velocity this week'];
  if (/\b(health|score|metric|kpi)\b/.test(topic))                    return ['Breakdown by area',   'Trend over the week',    'Recommendations?'];

  // State-based fallbacks
  const chips = [];
  if (ctx.hasIncidents)  chips.push('Show incident timeline');
  if (!ctx.isInboxZero)  chips.push('What needs attention?');
  chips.push("What's urgent today?", 'Workspace health');
  return chips.slice(0, 3);
}

function _buildFollowUpQuestion(ctx) {
  const pool = [
    'Want me to dig deeper on any of this?',
    'Should I pull the full details?',
    'Want me to take action on this?',
    'Anything else from this area to cover?',
    'Should I add this to your daily briefing?',
  ];
  return pool[(ctx.messageCount || 0) % pool.length];
}
