/**
 * FLOW OS — Executive Synthesis (Phase 15)
 *
 * Fuses the agents' findings + the debate into ONE executive answer. Follows the
 * house pattern: an LLM synthesis when a provider is configured, with a deterministic
 * structured fallback that always works. (M2 wires the LLM path + explain() wrap.)
 */

import { aggregateConfidence } from './confidenceAggregate.js';

const SYNTH_TIMEOUT_MS = Number(process.env.COUNCIL_SYNTH_TIMEOUT_MS) || 25000;

/**
 * @returns {{ answer: string, confidence: number|null, method: string }}
 */
export async function synthesize(workspaceId, question, findings, debate, onToken) {
  const confidence = aggregateConfidence(findings);
  const deterministic = buildDeterministicBrief(question, findings, debate, confidence);

  // Attempt an LLM synthesis (house pattern) with a hard timeout; the deterministic
  // brief is always the fallback so the council never fails to answer. When onToken is
  // provided the LLM answer is streamed token-by-token as it is generated.
  if (findings.length && process.env.GEMINI_API_KEY) {
    try {
      const llm = await withTimeout(llmSynthesis(question, findings, debate, onToken), SYNTH_TIMEOUT_MS);
      if (llm && llm.trim().length > 40) return { answer: llm.trim(), confidence, method: 'llm' };
    } catch { /* fall through to deterministic */ }
  }
  if (typeof onToken === 'function') onToken(deterministic); // deliver fallback as one chunk
  return { answer: deterministic, confidence, method: 'deterministic' };
}

function buildSynthPrompt(question, findings, debate) {
  const brief = findings.map((f) =>
    `- ${f.title} (confidence ${f.confidence ?? 'n/a'}%): ${firstSentence(f.summary)}` +
    (f.recommendedActions?.length ? ` | recommends: ${actionText(f.recommendedActions[0])}` : '')
  ).join('\n');
  const debateBlock = debate?.hasDisagreement
    ? `\nDisagreement:\n${debate.conflicts.map((c) => `- ${c.topic}: ${c.tradeoffs}`).join('\n')}\nMinority: ${(debate.minorityOpinions || []).map((m) => m.title).join(', ') || 'none'}`
    : '\nThe executives are aligned.';
  return `You are the Chief of Staff synthesizing an executive council for the CEO.\n` +
    `Question: ${question}\n\nExecutive findings:\n${brief}\n${debateBlock}\n\n` +
    `Write a concise executive answer (max ~150 words): the bottom line first, then the ` +
    `key reasons, then—if the executives disagreed—the tradeoff and your recommended decision. ` +
    `Preserve any minority concern. Do not invent facts beyond the findings.`;
}

async function llmSynthesis(question, findings, debate, onToken) {
  const prompt = buildSynthPrompt(question, findings, debate);
  if (typeof onToken === 'function') {
    const { stream } = await import('../ai/BrainRouter.js');
    let acc = '';
    for await (const delta of stream({ messages: [{ role: 'user', content: prompt }], maxTokens: 400 })) {
      if (!delta) continue; acc += delta; onToken(delta);
    }
    return acc;
  }
  const { reason } = await import('../ai/BrainRouter.js');
  const out = await reason(prompt, { maxTokens: 400 });
  return typeof out === 'string' ? out : (out?.text || out?.content || '');
}

function withTimeout(p, ms) {
  return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('synth timeout')), ms))]);
}

export function buildDeterministicBrief(question, findings, debate, confidence) {
  if (!findings.length) {
    return `The council could not assemble enough evidence to answer: "${question}".`;
  }

  const lines = [];
  lines.push(`## Executive Council — ${findings.length} executive${findings.length > 1 ? 's' : ''} consulted`);
  if (confidence != null) lines.push(`Aggregate confidence: **${confidence}%**.`);
  lines.push('');

  for (const f of findings) {
    const conf = f.confidence != null ? ` _(confidence ${f.confidence}%)_` : '';
    lines.push(`**${f.title}**${conf}: ${firstSentence(f.summary)}`);
    if (f.recommendedActions?.length) {
      lines.push(`  → Recommends: ${actionText(f.recommendedActions[0])}`);
    }
  }

  if (debate?.hasDisagreement) {
    lines.push('');
    lines.push('### Where the executives disagree');
    for (const c of debate.conflicts) {
      lines.push(`- **${c.topic}** — ${c.tradeoffs}`);
    }
    if (debate.recommendation) lines.push(`\n**Recommended decision:** ${debate.recommendation}`);
    if (debate.minorityOpinions?.length) {
      lines.push(`\n_Minority view preserved:_ ${debate.minorityOpinions.map((m) => `${m.title} — ${firstSentence(m.position)}`).join('; ')}`);
    }
  } else {
    lines.push('');
    lines.push('The executives are aligned.');
  }

  return lines.join('\n');
}

function firstSentence(s) {
  return String(s || '').split(/(?<=[.!?])\s/)[0].slice(0, 240);
}
function actionText(a) {
  if (typeof a === 'string') return a;
  return a?.title || a?.action || a?.description || a?.label || 'action';
}

export default { synthesize, buildDeterministicBrief };
