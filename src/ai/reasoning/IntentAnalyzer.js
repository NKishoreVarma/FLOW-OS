/**
 * IntentAnalyzer — stage 1 of the Operational Brain v2 reasoning pipeline.
 *
 * Classifies the user's question into a structured intent object:
 * - questionType: what kind of question is this?
 * - domain: which workspace domain is relevant?
 * - timeframe: past | recent | present | future
 * - entities: named entities mentioned (people, systems, projects)
 * - urgency: how time-sensitive is this?
 * - executionHint: does this question imply an action should be taken?
 *
 * Classification is done locally first (keyword heuristics) then enriched
 * by LLM if available — the LLM is not the gate, it's the enricher.
 */

import { ask } from '../BrainRouter.js';
import { TaskType } from '../types.js';

export const QuestionType = Object.freeze({
  DIAGNOSTIC:    'diagnostic',    // "What happened?" / "Why did X fail?"
  STATUS:        'status',        // "What is the current state of X?"
  FORECAST:      'forecast',      // "What will happen if...?" / "What's at risk?"
  COMPARATIVE:   'comparative',   // "How does X compare to Y?"
  ACTION:        'action',        // "What should we do?" / "How do we fix X?"
  ATTRIBUTION:   'attribution',   // "Who is responsible for X?"
  DISCOVERY:     'discovery',     // "What's happening in engineering?"
  RELATIONSHIP:  'relationship',  // "How does X relate to Y?"
  SUMMARY:       'summary',       // "Summarize X"
});

export const Domain = Object.freeze({
  ENGINEERING:   'engineering',
  CUSTOMERS:     'customers',
  INCIDENTS:     'incidents',
  MEETINGS:      'meetings',
  PEOPLE:        'people',
  PROJECTS:      'projects',
  FINANCE:       'finance',
  SECURITY:      'security',
  KNOWLEDGE:     'knowledge',
  GENERAL:       'general',
});

/**
 * @param {string} question - Raw user question
 * @param {Object} [opts]
 * @param {string} [opts.pageContext] - Current page context
 * @param {string} [opts.entityId]   - Focused entity
 * @returns {Promise<IntentResult>}
 */
export async function analyzeIntent(question, { pageContext, entityId } = {}) {
  const q = question.toLowerCase();

  // 1. Heuristic classification (instant, no LLM)
  const questionType = _detectQuestionType(q);
  const domain       = _detectDomain(q, pageContext);
  const timeframe    = _detectTimeframe(q);
  const urgency      = _detectUrgency(q);
  const entities     = _extractHeuristicEntities(question);
  const executionHint= _detectExecutionHint(q);

  const base = { question, questionType, domain, timeframe, urgency, entities, executionHint, entityId };

  // 2. LLM enrichment — extract named entities and refine classification
  try {
    const prompt = `Analyze this enterprise workspace question and respond with a JSON object only (no markdown):

Question: "${question}"
${pageContext ? `Context: user is on the ${pageContext} page` : ''}

JSON fields:
- "refinedType": one of [diagnostic, status, forecast, comparative, action, attribution, discovery, relationship, summary]
- "domain": one of [engineering, customers, incidents, meetings, people, projects, finance, security, knowledge, general]
- "namedEntities": array of {name, type} where type is one of [person, system, project, customer, metric, incident]
- "executionHint": true if the question implies FLOW should take an action
- "urgency": "high" | "medium" | "low"
- "searchTerms": array of 3-5 key search terms to retrieve evidence`;

    const result = await ask({
      taskType: TaskType.CLASSIFY,
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 300,
      temperature: 0.1,
    });

    const raw    = (result.text || '').replace(/```json?|```/g, '').trim();
    const parsed = JSON.parse(raw);

    return {
      ...base,
      questionType:   parsed.refinedType   || questionType,
      domain:         parsed.domain        || domain,
      entities:       parsed.namedEntities || entities,
      executionHint:  parsed.executionHint ?? executionHint,
      urgency:        parsed.urgency       || urgency,
      searchTerms:    parsed.searchTerms   || _buildSearchTerms(question),
      _enriched: true,
    };
  } catch {
    // Heuristic-only fallback
    return { ...base, searchTerms: _buildSearchTerms(question), _enriched: false };
  }
}

// ── Heuristic helpers ─────────────────────────────────────────────────────────

function _detectQuestionType(q) {
  if (/what happened|why did|why is|root cause|cause of|reason for/.test(q)) return QuestionType.DIAGNOSTIC;
  if (/what should|how do|recommend|suggest|fix|resolve|improve/.test(q))    return QuestionType.ACTION;
  if (/who (is|are|did|owns|responsible|assigned)/.test(q))                  return QuestionType.ATTRIBUTION;
  if (/at risk|will fail|predict|forecast|likely/.test(q))                   return QuestionType.FORECAST;
  if (/compare|vs|versus|difference|better/.test(q))                         return QuestionType.COMPARATIVE;
  if (/how (does|do|is).*(relate|connect|linked)/.test(q))                   return QuestionType.RELATIONSHIP;
  if (/summar|overview|brief|digest|recap/.test(q))                          return QuestionType.SUMMARY;
  if (/status|current|right now|today|state of/.test(q))                     return QuestionType.STATUS;
  return QuestionType.DISCOVERY;
}

function _detectDomain(q, page) {
  if (/incident|outage|sev|p[0-9]|down|breach|alert/.test(q))              return Domain.INCIDENTS;
  if (/pr|pull request|commit|deploy|build|pipeline|repo|branch/.test(q))  return Domain.ENGINEERING;
  if (/customer|client|churn|arr|revenue|account|deal/.test(q))            return Domain.CUSTOMERS;
  if (/meeting|standup|sync|call|agenda/.test(q))                          return Domain.MEETINGS;
  if (/employee|team|hire|burnout|pto|workload/.test(q))                   return Domain.PEOPLE;
  if (/project|sprint|milestone|roadmap|epic/.test(q))                     return Domain.PROJECTS;
  if (/invoice|budget|cost|spend|vendor/.test(q))                          return Domain.FINANCE;
  if (/secret|token|access|permission|auth|vulnerability/.test(q))         return Domain.SECURITY;
  if (/doc|wiki|knowledge|policy|procedure/.test(q))                       return Domain.KNOWLEDGE;
  if (page?.includes('project'))   return Domain.PROJECTS;
  if (page?.includes('meeting'))   return Domain.MEETINGS;
  if (page?.includes('inbox'))     return Domain.CUSTOMERS;
  return Domain.GENERAL;
}

function _detectTimeframe(q) {
  if (/last night|overnight|yesterday|past 24|past day/.test(q))  return 'past_24h';
  if (/this week|last week|past week|7 day/.test(q))              return 'past_week';
  if (/this month|last month|30 day/.test(q))                     return 'past_month';
  if (/right now|currently|today|at the moment/.test(q))          return 'present';
  if (/next|upcoming|will|future|predict/.test(q))                return 'future';
  return 'recent';
}

function _detectUrgency(q) {
  if (/urgent|asap|immediately|critical|emergency|sev.?1|p0/.test(q)) return 'high';
  if (/soon|this week|important|high priority/.test(q))               return 'medium';
  return 'low';
}

function _detectExecutionHint(q) {
  return /should i|can you|please|execute|run|create|send|fix|deploy|assign|approve|merge/.test(q);
}

function _extractHeuristicEntities(question) {
  const entities = [];
  // Capitalised words (likely proper nouns)
  const words = question.match(/\b[A-Z][a-z]{2,}\b/g) || [];
  const seen  = new Set();
  for (const w of words) {
    if (seen.has(w)) continue;
    seen.add(w);
    // Classify heuristically
    const type = /inc-|iss-|pr-/i.test(w) ? 'incident'
      : /api|db|postgres|redis|github|slack|jira/i.test(w) ? 'system'
      : 'unknown';
    entities.push({ name: w, type });
  }
  return entities;
}

function _buildSearchTerms(question) {
  // Remove stop words, take top N content words
  const stop = new Set(['what', 'who', 'how', 'why', 'when', 'where', 'is', 'are', 'the', 'a', 'an', 'of', 'in', 'to', 'for', 'on', 'at', 'with', 'about', 'should', 'can', 'do', 'does', 'did', 'have', 'has', 'had', 'we', 'our', 'me', 'i', 'you', 'my', 'right', 'now', 'currently']);
  return question.toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stop.has(w))
    .slice(0, 6);
}
