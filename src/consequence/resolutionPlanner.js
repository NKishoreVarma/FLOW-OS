/**
 * resolutionPlanner — turns a detected consequence into a concrete, reviewable,
 * executable resolution (Layer 5 "one-click resolution").
 *
 * It drafts the content with the LLM (grounded in the consequence — never invents
 * facts), then returns an executable `recommendation` in the exact shape the
 * Phase-14 Execution Engine consumes ({connector, actionType, payload, title}).
 * The human always reviews before it runs — nothing is auto-sent.
 */

import { ask }      from '../ai/BrainRouter.js';
import { TaskType } from '../ai/types.js';
import { sanitizeForLLM } from '../ai/reasoning/ContextBuilder.js';

// Consequence action → how to resolve it (connector + action + content kind).
const RESOLUTIONS = {
  draft_recovery_email:        { kind: 'email',   connector: 'gmail',           actionType: 'send' },
  draft_checkin_email:         { kind: 'email',   connector: 'gmail',           actionType: 'send' },
  notify_manager:              { kind: 'message', connector: 'slack',           actionType: 'send' },
  notify_engineering_lead:     { kind: 'message', connector: 'slack',           actionType: 'send' },
  escalate_delivery:           { kind: 'message', connector: 'slack',           actionType: 'send' },
  rebalance_workload:          { kind: 'message', connector: 'slack',           actionType: 'send' },
  schedule_knowledge_transfer: { kind: 'event',   connector: 'google-calendar', actionType: 'create' },
  review_incident:             { kind: 'note',    connector: null,              actionType: null },
};

/**
 * Prepare a reviewable resolution for a consequence.
 * @returns {Promise<{ kind, preview, recommendation, executable }>}
 */
export async function prepareResolution(workspaceId, consequence = {}) {
  const actionType = consequence.recommendedAction?.type || consequence.action;
  const spec = RESOLUTIONS[actionType];
  const entity = consequence.entity || 'the situation';
  const chain = (consequence.evidenceChain || [])
    .map(e => `- [${e.source}] ${e.text}`).join('\n');

  // Non-executable (e.g. review_incident) → return a guiding note, no plan.
  if (!spec || !spec.connector) {
    return {
      kind: 'note',
      preview: { text: `Review ${entity}: ${consequence.title}. ${consequence.businessImpact || ''}`.trim() },
      recommendation: null,
      executable: false,
    };
  }

  const drafted = await _draft(spec.kind, { title: consequence.title, entity, chain, impact: consequence.businessImpact });

  let payload = {};
  let title = '';
  if (spec.kind === 'email') {
    payload = { to: consequence.recommendedAction?.recipient || '', subject: drafted.subject || `Re: ${entity}`, body: drafted.body || '' };
    title = `Send email to ${entity}`;
  } else if (spec.kind === 'message') {
    payload = { channel: '', text: drafted.text || drafted.body || '' };
    title = `Message about ${entity}`;
  } else if (spec.kind === 'event') {
    payload = { title: drafted.subject || `Knowledge transfer: ${entity}`, description: drafted.body || drafted.text || '' };
    title = `Schedule: ${entity}`;
  }

  return {
    kind: spec.kind,
    preview: spec.kind === 'email' ? { to: payload.to, subject: payload.subject, body: payload.body } : { text: payload.text || payload.description },
    recommendation: { connector: spec.connector, actionType: spec.actionType, payload, title },
    executable: true,
  };
}

// LLM draft, grounded and in FLOW's voice. Falls back to a plain template if the LLM is down.
async function _draft(kind, { title, entity, chain, impact }) {
  const want = kind === 'email'
    ? 'Return JSON only: {"subject":"...","body":"..."}. A concise, professional email (4-6 sentences) that a chief of staff would send.'
    : 'Return JSON only: {"text":"..."}. A concise, direct message (2-3 sentences).';

  const prompt = `You are FLOW, drafting a ${kind} to resolve this situation for the user. Be specific, warm, and professional. Do NOT invent facts, names, dates, or numbers beyond what is given.

Situation: ${title}
Regarding: ${entity}
What FLOW connected across tools:
${chain || '(no additional signals)'}
${impact ? `Why it matters: ${impact}` : ''}

${want}`;

  try {
    const res = await ask({ taskType: TaskType.CHAT, messages: [{ role: 'user', content: sanitizeForLLM(prompt) }], maxTokens: 420, temperature: 0.4 });
    const clean = (res.text || '').replace(/```json?|```/g, '').trim();
    const parsed = JSON.parse(clean.slice(clean.indexOf('{'), clean.lastIndexOf('}') + 1));
    return {
      subject: parsed.subject ? sanitizeForLLM(parsed.subject) : null,
      body:    parsed.body ? sanitizeForLLM(parsed.body) : null,
      text:    parsed.text ? sanitizeForLLM(parsed.text) : null,
    };
  } catch {
    // Honest fallback — a plain, editable starting point.
    const line = `Following up regarding ${entity}. ${title}. Happy to jump on a call to work through this.`;
    return kind === 'email' ? { subject: `Following up: ${entity}`, body: line } : { text: line };
  }
}

export default { prepareResolution };
