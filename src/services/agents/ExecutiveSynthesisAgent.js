/**
 * FLOW OS — Executive Synthesis Agent
 *
 * Third and final stage of the Multi-Agent Reasoning pipeline.
 * Receives the critic-validated, contradiction-free context nodes alongside
 * the RouterAgent domain weights and produces a polished Markdown executive
 * brief via Gemini 2.5 Flash.
 *
 * When GEMINI_API_KEY is absent it falls back to a structured Markdown brief
 * built from the raw chunk text — no silent "unavailable" strings.
 *
 * Output shape:
 *   {
 *     answer:        string,   // final Markdown answer for the UI
 *     modelUsed:     string,   // 'gemini-2.5-flash' | 'local-fallback'
 *     tokensConsumed: number,  // character count proxy (no token API)
 *     synthesisNotes: string,  // meta notes for telemetry
 *   }
 */

import { GoogleGenAI } from '@google/genai';

// ── Prompt builders ───────────────────────────────────────────────────────────

const SYSTEM_PERSONA =
  'You are an Elite Chief of Staff for a multi-tenant corporate knowledge platform. ' +
  'Your role is to synthesize a single, cohesive, bulleted Executive Summary from the ' +
  'validated cross-channel intelligence nodes provided. ' +
  'You must explicitly call out any infrastructure blockers or date conflicts flags ' +
  'raised by the CriticAgent in a dedicated "Blockers & Conflicts" section if they exist. ' +
  'Write in structured Markdown using bold headers and clear sections. ' +
  'Lead with the most authoritative finding. ' +
  'Do NOT say "the context states" or "according to the provided nodes" — ' +
  'speak as the Chief of Staff reporting organizational intelligence directly to the executive.';

/**
 * Builds the synthesis prompt incorporating domain weights and critic notes.
 *
 * @param {string}   queryText      — original user query
 * @param {Object[]} validChunks    — critic-approved context nodes
 * @param {Object}   routerResult   — output of RouterAgent.routeQuery()
 * @param {string}   criticSummary  — human-readable evaluation notes from CriticAgent
 * @returns {string}
 */
function buildPrompt(queryText, validChunks, routerResult, criticSummary) {
  const { primaryDomain, intentFlags } = routerResult;

  // Build the context block — only non-deprecated nodes, ordered by weighted score
  const contextBlock = validChunks
    .filter(c => !c.deprecated)
    .map((c, i) => {
      const authorityLabel = c.authorityCoeff >= 1.5 ? '★ HIGH AUTHORITY' : 'STANDARD';
      return (
        `### Node ${i + 1} [${authorityLabel} | Source: ${c.source} | Origin: ${c.origin || 'unknown'} | Score: ${c.score}]\n` +
        (c.title ? `**Title:** ${c.title}\n\n` : '') +
        c.text
      );
    })
    .join('\n\n---\n\n');

  // Intent modifier hints for the model
  const intentHints = [];
  if (intentFlags.isUrgent)     intentHints.push('⚡ The user query has URGENT priority signals — lead with critical findings.');
  if (intentFlags.isComparison) intentHints.push('⚖️  The user is asking for a comparison — structure the answer with clear pros/cons or A vs B sections.');
  if (intentFlags.isTimeBound)  intentHints.push('🕐 The user query is time-sensitive — explicitly surface the most recent data points.');
  if (intentHints.length === 0) intentHints.push('Provide a concise, direct briefing.');

  return (
    `${SYSTEM_PERSONA}\n\n` +
    `## Intelligence Domain Focus: ${primaryDomain.toUpperCase()}\n\n` +
    `## Critic Evaluation Notes\n${criticSummary}\n\n` +
    `## Intent Directives\n${intentHints.join('\n')}\n\n` +
    `## Validated Cross-Channel Context Nodes\n\n${contextBlock}\n\n` +
    `## Executive Query\n${queryText}\n\n` +
    `## Executive Brief (Markdown)`
  );
}

/**
 * Builds a structured Markdown fallback brief without an LLM call.
 * Used when GEMINI_API_KEY is not configured or the API call fails.
 *
 * @param {string}   queryText   — original user query
 * @param {Object[]} validChunks — critic-approved context nodes
 * @param {Object}   routerResult
 * @returns {string}
 */
function buildLocalFallback(queryText, validChunks, routerResult) {
  const { primaryDomain } = routerResult;
  const active = validChunks.filter(c => !c.deprecated);

  if (active.length === 0) {
    return `## FLOW OS Executive Brief\n\n**Domain:** ${primaryDomain}\n\n_No validated context nodes available for this query._`;
  }

  const lines = [
    `## FLOW OS Executive Brief`,
    ``,
    `**Query:** ${queryText}`,
    `**Domain Focus:** ${primaryDomain.toUpperCase()}`,
    `**Validated Nodes:** ${active.length}`,
    ``,
    `---`,
    ``,
    `### Intelligence Summary`,
    ``,
  ];

  for (const [i, chunk] of active.entries()) {
    const sourceLabel = `${chunk.source || 'unknown'}`.toUpperCase();
    const authorityBadge = chunk.authorityCoeff >= 1.5 ? ' ★' : '';
    lines.push(`**[${i + 1}] ${chunk.title || sourceLabel}${authorityBadge}**`);
    lines.push('');
    // Excerpt up to 400 chars from the chunk text
    const excerpt = (chunk.text || '').trim().substring(0, 400);
    lines.push(excerpt + (chunk.text?.length > 400 ? ' …' : ''));
    lines.push('');
    lines.push(`> *Source: ${sourceLabel} | Authority: ${chunk.authorityCoeff} | Score: ${chunk.score}*`);
    lines.push('');
  }

  return lines.join('\n');
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Runs the executive synthesis step.
 *
 * @param {string}   queryText     — original user query
 * @param {Object[]} validChunks   — output of CriticAgent (includes deprecated flag)
 * @param {Object}   routerResult  — output of RouterAgent.routeQuery()
 * @param {string}   criticSummary — human-readable critic evaluation notes
 * @returns {Promise<{
 *   answer:         string,
 *   modelUsed:      string,
 *   tokensConsumed: number,
 *   synthesisNotes: string,
 * }>}
 */
export async function synthesize(queryText, validChunks, routerResult, criticSummary) {
  const activeChunks = validChunks.filter(c => !c.deprecated);

  if (activeChunks.length === 0) {
    const localAnswer = buildLocalFallback(queryText, validChunks, routerResult);
    console.log(`📋 [ExecutiveSynthesisAgent] No active nodes — returning structured local fallback.`);
    return {
      answer:         localAnswer,
      modelUsed:      'local-fallback',
      tokensConsumed: localAnswer.length,
      synthesisNotes: 'All context nodes were deprecated by CriticAgent. Returned structured local brief.',
    };
  }

  // ── Attempt Gemini synthesis ──────────────────────────────────────────────
  if (process.env.GEMINI_API_KEY) {
    try {
      const prompt = buildPrompt(queryText, validChunks, routerResult, criticSummary);

      const aiOptions = { apiKey: process.env.GEMINI_API_KEY };
      if (process.env.GEMINI_BASE_URL) {
        aiOptions.httpOptions = { baseUrl: process.env.GEMINI_BASE_URL };
      }
      const ai = new GoogleGenAI(aiOptions);
      const response = await ai.models.generateContent({
        model:    'gemini-2.5-flash',
        contents: prompt,
      });

      const answer = (response.text || '').trim();

      console.log(`✅ [ExecutiveSynthesisAgent] Gemini synthesis complete — ${answer.length} chars from ${activeChunks.length} node(s).`);

      return {
        answer,
        modelUsed:      'gemini-2.5-flash',
        tokensConsumed: answer.length,
        synthesisNotes: (
          `Synthesized from ${activeChunks.length} validated node(s) across domain [${routerResult.primaryDomain}]. ` +
          `${validChunks.length - activeChunks.length} node(s) deprecated by CriticAgent.`
        ),
      };
    } catch (geminiErr) {
      console.warn(`⚠️ [ExecutiveSynthesisAgent] Gemini call failed: ${geminiErr.message}. Falling back to local brief.`);
    }
  } else {
    console.warn(`⚠️ [ExecutiveSynthesisAgent] GEMINI_API_KEY not set — using local Markdown fallback.`);
  }

  // ── Local structured fallback ─────────────────────────────────────────────
  const localAnswer = buildLocalFallback(queryText, validChunks, routerResult);

  return {
    answer:         localAnswer,
    modelUsed:      'local-fallback',
    tokensConsumed: localAnswer.length,
    synthesisNotes: (
      `Local Markdown brief generated from ${activeChunks.length} validated node(s). ` +
      `GEMINI_API_KEY ${process.env.GEMINI_API_KEY ? 'present but call failed' : 'not configured'}.`
    ),
  };
}
