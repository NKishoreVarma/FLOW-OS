/**
 * emailComposer — detects "compose a mail to …" intent in chat and drafts a real,
 * reviewable email. The draft is returned to the client as a structured object so
 * the UI can render a Send / Edit / Cancel card. FLOW never sends without approval.
 */

import { ask }            from '../../ai/BrainRouter.js';
import { TaskType }       from '../../ai/types.js';
import { sanitizeForLLM } from '../../ai/reasoning/ContextBuilder.js';

const EMAIL_ADDR_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/;
// "compose/write/draft/send a mail/email to <addr> …"
const COMPOSE_RE = /\b(compose|write|draft|send|shoot|fire off)\b[^]*\b(e-?mail|mail|message)\b|\b(e-?mail|mail)\b[^]*\bto\b/i;

export function isEmailCompose(text) {
  const t = String(text || '');
  // It's a compose only when there's an explicit recipient address in the message.
  return COMPOSE_RE.test(t) && EMAIL_ADDR_RE.test(t);
}

// Compose intent WITHOUT an explicit address ("email the TechCorp VP …"). The caller
// resolves the named recipient from the workspace inbox before drafting.
export function looksLikeCompose(text) {
  const t = String(text || '');
  return COMPOSE_RE.test(t) && !EMAIL_ADDR_RE.test(t);
}

// Turn an email local-part into a plausible first name ("sushmithaengr23" → "Sushmitha").
function _firstNameFromEmail(addr) {
  if (!addr) return null;
  let local = addr.split('@')[0].replace(/[._-].*$/, '').replace(/\d+/g, '');
  // strip common suffixes people append
  local = local.replace(/(engr|dev|official|real|the|mr|ms)$/i, '');
  if (!local) return null;
  return local.charAt(0).toUpperCase() + local.slice(1).toLowerCase();
}

/**
 * Draft an email from a natural-language request.
 * @returns {Promise<{ to, subject, body, recipientName }|null>}
 */
export async function composeEmailDraft(text, { userName = null } = {}) {
  const to = (String(text).match(EMAIL_ADDR_RE) || [])[0] || null;
  if (!to) return null;

  const recipientName = _firstNameFromEmail(to);
  const sender = userName || 'me';

  // What the user wants to say (after "telling/saying/that/about…"), else the whole message.
  const m = String(text).match(/(?:telling|saying|tell (?:them|him|her)|say|that|about|regarding|re:?)\s+["']?(.+?)["']?\s*$/i);
  const intent = (m && m[1]) ? m[1].trim() : String(text);

  const prompt = `Write a short, professional email.
From: ${sender}
To: ${to}${recipientName ? ` (first name: ${recipientName})` : ''}
The sender wants to convey: "${intent}"

Rules: greet by first name if known; 1-3 sentences; sign off with the sender's name (${sender}); plain text, no markdown.
Return JSON only: {"subject":"...","body":"..."}`;

  let subject = `A note from ${sender}`;
  let body = '';
  try {
    const res = await ask({ taskType: TaskType.CHAT, messages: [{ role: 'user', content: sanitizeForLLM(prompt) }], maxTokens: 400, temperature: 0.4 });
    const clean = (res.text || '').replace(/```json?|```/g, '').trim();
    const parsed = JSON.parse(clean.slice(clean.indexOf('{'), clean.lastIndexOf('}') + 1));
    subject = (parsed.subject && sanitizeForLLM(parsed.subject)) || subject;
    body    = (parsed.body && sanitizeForLLM(parsed.body)) || '';
  } catch { /* fall through to template */ }

  if (!body) {
    body = `${recipientName ? `Hi ${recipientName},` : 'Hi,'}\n\n${intent}\n\nBest regards,\n${sender}`;
  }

  return { to, subject, body, recipientName };
}

export default { isEmailCompose, composeEmailDraft };
