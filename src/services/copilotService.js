import { GoogleGenAI } from '@google/genai';
import { retrieveContext } from './retrievalService.js';
import { getRelatedContext } from './operationalGraphService.js';

export async function answerCopilotQuery(workspaceId, { pageContext = '', question, entityId = null }) {
  const wsIdStr = String(workspaceId);

  const enrichedQuery = pageContext ? `[Context: ${pageContext}] ${question}` : question;
  const queryTraceId = `cop-${Date.now()}`;

  let chunks = [];
  try {
    const result = await retrieveContext(wsIdStr, enrichedQuery, queryTraceId);
    chunks = Array.isArray(result) ? result : [];
  } catch {
    chunks = [];
  }

  let graphContext = [];
  if (entityId) {
    try {
      graphContext = await getRelatedContext(wsIdStr, entityId, 1);
    } catch {
      graphContext = [];
    }
  }

  const contextText = [
    ...chunks.map(c => c.text || c.content || ''),
    ...graphContext
  ].filter(Boolean).slice(0, 10).join('\n---\n');

  const evidence = chunks.slice(0, 5).map(c => ({
    text: (c.text || c.content || '').substring(0, 120),
    source: c.source || c.metadata?.source || 'workspace',
    score: c.finalScore || c.score || 0
  }));

  if (process.env.GEMINI_API_KEY && contextText) {
    try {
      const aiOptions = { apiKey: process.env.GEMINI_API_KEY };
      if (process.env.GEMINI_BASE_URL) {
        aiOptions.httpOptions = { baseUrl: process.env.GEMINI_BASE_URL };
      }
      const ai = new GoogleGenAI(aiOptions);
      const prompt = `You are FLOW OS Copilot — a context-aware assistant. Answer the following question concisely based only on the provided workspace context. If the answer is not in the context, say so directly.\n\nQuestion: ${question}\n\nContext:\n${contextText}\n\nProvide a direct answer in 1-3 sentences. Do not say "based on the context". Speak as a knowledgeable assistant.`;
      const result = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt });
      return {
        answer: result.text,
        evidence,
        confidence: Math.min(95, 60 + chunks.length * 5),
        suggestedActions: buildSuggestedActions(question, chunks),
        sources: [...new Set(chunks.map(c => c.source || c.metadata?.source || 'workspace'))].slice(0, 5)
      };
    } catch {
      // fall through to heuristic
    }
  }

  const fallbackAnswer = chunks.length > 0
    ? `Based on your workspace data: ${(chunks[0].text || chunks[0].content || '').substring(0, 200)}`
    : 'No matching information found in your workspace. Try refining the question or ingesting more data.';

  return {
    answer: fallbackAnswer,
    evidence,
    confidence: chunks.length > 0 ? 45 : 10,
    suggestedActions: buildSuggestedActions(question, chunks),
    sources: [...new Set(chunks.map(c => c.source || c.metadata?.source || 'workspace'))].slice(0, 5)
  };
}

function buildSuggestedActions(question, chunks) {
  const q = question.toLowerCase();
  const actions = [];
  if (q.includes('pr') || q.includes('pull request') || q.includes('review')) {
    actions.push({ label: 'View PRs', route: '/projects' });
  }
  if (q.includes('meeting') || q.includes('calendar')) {
    actions.push({ label: 'View Meetings', route: '/meetings' });
  }
  if (q.includes('incident') || q.includes('outage') || q.includes('issue')) {
    actions.push({ label: 'View Briefing', route: '/briefing' });
  }
  if (chunks.length === 0) {
    actions.push({ label: 'Search Workspace', route: '/search' });
  }
  return actions.slice(0, 3);
}
