/**
 * BaseAgent — abstract foundation for all 18 specialized cognitive agents.
 *
 * Each specialized agent extends BaseAgent and overrides:
 *   - definition.id, .name, .domain, .mission, .capabilities, .keywords, .connectors
 *   - buildSystemPrompt()   — domain-specific system role
 *   - filterContext(ctx)    — which parts of the shared context are relevant
 *
 * BaseAgent handles all shared logic:
 *   - filterContext fallback (keyword-based)
 *   - LLM reasoning call via BrainRouter
 *   - JSON output parsing with schema validation
 *   - Heuristic fallback when LLM is unavailable
 *   - Confidence scoring
 *   - Communication bus integration (escalations)
 *
 * Agents NEVER call executeAction() or any connector directly.
 * Agents produce AgentOutput — recommendations for the Planner.
 */

import { reason as llmReason }   from '../../ai/BrainRouter.js';
import {
  postMessage,
  MessageType,
} from '../bus/AgentCommunicationBus.js';

const AGENT_TIMEOUT_MS = parseInt(process.env.AGENT_TIMEOUT_MS, 10) || 30_000;

// ── AgentOutput schema (validated after LLM parse) ───────────────────────────

/**
 * @typedef {object} Finding
 * @property {'risk'|'opportunity'|'blocker'|'info'|'action_required'} type
 * @property {string} title
 * @property {string} description
 * @property {'critical'|'high'|'medium'|'low'} severity
 * @property {string[]} evidence
 */

/**
 * @typedef {object} AgentOutput
 * @property {string}   agentId
 * @property {string}   agentName
 * @property {string}   domain
 * @property {string}   sessionId
 * @property {number}   confidence       0-100
 * @property {number}   relevanceScore   0-100
 * @property {Finding[]} findings
 * @property {{action:string, priority:string, rationale:string}} recommendation
 * @property {{workflowId:string, params:object, connectorIds:string[], reason:string}[]} executionHints
 * @property {{targetAgentId:string, message:string, severity:string}[]} escalations
 * @property {string}   reasoning
 * @property {number}   durationMs
 * @property {boolean}  error
 */

export class BaseAgent {
  constructor(definition) {
    this.id          = definition.id;
    this.name        = definition.name;
    this.domain      = definition.domain;
    this.domains     = definition.domains || [];
    this.mission     = definition.mission;
    this.capabilities = definition.capabilities || [];
    this.keywords    = definition.keywords || [];
    this.connectors  = definition.connectors || [];
    this.role        = definition.role || 'MEMBER';
  }

  /**
   * Main reasoning entry point. Called by the ReasoningPipeline in parallel.
   *
   * @param {import('../context/AgentContextBuilder.js').AgentContext} fullContext
   * @param {string} sessionId
   * @param {string} [domainQuestion]  Optional CoS-decomposed sub-question
   * @returns {Promise<AgentOutput>}
   */
  async reason(fullContext, sessionId, domainQuestion = null) {
    const t0 = Date.now();

    // Compute relevance first — skip detailed reasoning if agent is not relevant
    const relevanceScore = this._computeRelevance(fullContext.intent);
    if (relevanceScore < 10) {
      return this._lowRelevanceOutput(fullContext.intent, sessionId, relevanceScore, Date.now() - t0);
    }

    const agentCtx = this.filterContext(fullContext);
    const question  = domainQuestion || fullContext.intent.question;

    let output;
    try {
      output = await this._llmReason(agentCtx, question, sessionId);
    } catch {
      output = this._heuristicReason(agentCtx, question, relevanceScore);
    }

    output.agentId       = this.id;
    output.agentName     = this.name;
    output.domain        = this.domain;
    output.sessionId     = sessionId;
    output.relevanceScore= relevanceScore;
    output.durationMs    = Date.now() - t0;

    // Post escalations to communication bus
    for (const escalation of (output.escalations || [])) {
      postMessage(sessionId, this.id, MessageType.ESCALATION, {
        message:  escalation.message,
        severity: escalation.severity || 'medium',
      }, escalation.targetAgentId || null);
    }

    return output;
  }

  /**
   * Override in subclasses to filter full context to domain-relevant items.
   * Default: returns full context (subclasses narrow it).
   */
  filterContext(fullContext) {
    const { vectors, memory, graphNodes, graphNeighbors, recentEvents, workflows, policies, health, intent } = fullContext;

    // Keyword-based relevance filtering
    const allKeywords = [...this.keywords, this.domain];
    const matches     = kw => allKeywords.some(k => kw?.toLowerCase().includes(k.toLowerCase()));

    return {
      intent,
      vectors:      (vectors      || []).filter(v => matches(v.content) || matches(v.source)),
      memory:       (memory       || []).filter(m => matches(m.body) || matches(m.title) || matches(m.type)),
      graphNodes:   (graphNodes   || []).filter(n => matches(n.type) || matches(n.label)),
      graphNeighbors,
      recentEvents: (recentEvents || []).filter(e => matches(e.type) || matches(e.source)),
      workflows:    (workflows    || []).filter(w => matches(w.workflow_name) || matches(w.workflow_id)),
      policies:     policies || [],
      health,
    };
  }

  /**
   * Override to provide a domain-specific system prompt.
   * Used in the LLM reasoning call.
   */
  buildSystemPrompt() {
    return `You are the ${this.name} for an enterprise intelligence system.

Mission: ${this.mission}

Capabilities: ${this.capabilities.join(', ')}

You reason ONLY within your domain (${this.domain}). You never speculate outside it.
You have access to real enterprise data provided in the context.
You produce structured JSON findings and recommendations.
You never call external systems — you only reason about provided data.`;
  }

  // ── Internal: LLM reasoning ───────────────────────────────────────────────

  async _llmReason(agentCtx, question, sessionId) {
    const systemPrompt = this.buildSystemPrompt();
    const contextSummary = this._summarizeContext(agentCtx);
    const userPrompt = this._buildUserPrompt(question, contextSummary);

    const result = await _withTimeout(
      llmReason(`${systemPrompt}\n\n${userPrompt}`, { maxTokens: 1200, temperature: 0.2 }),
      AGENT_TIMEOUT_MS
    );

    const text = result?.text || '';
    return this._parseOutput(text, agentCtx, question);
  }

  _buildUserPrompt(question, contextSummary) {
    return `ENTERPRISE QUESTION: ${question}

AVAILABLE DATA:
${contextSummary}

Respond ONLY with a JSON object (no markdown fences) matching this schema:
{
  "confidence": <number 0-100>,
  "findings": [
    { "type": "<risk|opportunity|blocker|info|action_required>", "title": "<string>", "description": "<string>", "severity": "<critical|high|medium|low>", "evidence": ["<string>"] }
  ],
  "recommendation": { "action": "<string>", "priority": "<immediate|today|this_week|monitor>", "rationale": "<string>" },
  "executionHints": [
    { "workflowId": "<string>", "params": {}, "connectorIds": ["<string>"], "reason": "<string>" }
  ],
  "escalations": [
    { "targetAgentId": "<string>", "message": "<string>", "severity": "<critical|high|medium>" }
  ],
  "reasoning": "<full reasoning chain as a paragraph>"
}`;
  }

  _summarizeContext(agentCtx) {
    const parts = [];

    if (agentCtx.vectors?.length) {
      parts.push(`KNOWLEDGE BASE (${agentCtx.vectors.length} items):\n` +
        agentCtx.vectors.slice(0, 5).map(v => `- [${v.source}] ${String(v.content || '').slice(0, 200)}`).join('\n'));
    }
    if (agentCtx.memory?.length) {
      parts.push(`ORG MEMORY (${agentCtx.memory.length} records):\n` +
        agentCtx.memory.slice(0, 5).map(m => `- [${m.type}] ${m.title || m.body || ''}`).slice(0, 200).join('\n'));
    }
    if (agentCtx.graphNodes?.length) {
      parts.push(`KNOWLEDGE GRAPH NODES (${agentCtx.graphNodes.length}):\n` +
        agentCtx.graphNodes.slice(0, 8).map(n => `- ${n.type}: ${n.label || n.id}`).join('\n'));
    }
    if (agentCtx.recentEvents?.length) {
      parts.push(`RECENT EVENTS (${agentCtx.recentEvents.length}):\n` +
        agentCtx.recentEvents.slice(0, 5).map(e => `- [${e.type}] ${e.source || ''}`).join('\n'));
    }
    if (agentCtx.workflows?.length) {
      parts.push(`WORKFLOW HISTORY (${agentCtx.workflows.length}):\n` +
        agentCtx.workflows.slice(0, 3).map(w => `- ${w.workflow_name}: ${w.status}`).join('\n'));
    }
    if (agentCtx.health) {
      parts.push(`WORKSPACE HEALTH: ${JSON.stringify(agentCtx.health).slice(0, 200)}`);
    }
    if (agentCtx.policies?.length) {
      parts.push(`ACTIVE POLICIES: ${agentCtx.policies.length} policies in effect`);
    }

    return parts.length ? parts.join('\n\n') : 'No domain-relevant data found in this workspace.';
  }

  // ── Internal: output parsing ──────────────────────────────────────────────

  _parseOutput(text, agentCtx, question) {
    try {
      const cleaned = text.replace(/```json?|```/g, '').trim();
      const json    = JSON.parse(cleaned);
      return this._normalizeOutput(json, agentCtx);
    } catch {
      return this._heuristicReason(agentCtx, question, this._computeRelevance({ question }));
    }
  }

  _normalizeOutput(json, agentCtx) {
    const confidence = Math.min(100, Math.max(0, Number(json.confidence) || 50));
    return {
      confidence,
      findings:       Array.isArray(json.findings)       ? json.findings       : [],
      recommendation: json.recommendation || { action: 'No action identified', priority: 'monitor', rationale: '' },
      executionHints: Array.isArray(json.executionHints) ? json.executionHints : [],
      escalations:    Array.isArray(json.escalations)    ? json.escalations    : [],
      reasoning:      String(json.reasoning || ''),
      error:          false,
    };
  }

  // ── Internal: heuristic fallback ──────────────────────────────────────────

  _heuristicReason(agentCtx, question, relevanceScore) {
    const hasData = (agentCtx.vectors?.length || 0) + (agentCtx.memory?.length || 0) > 0;
    const confidence = hasData
      ? Math.round(relevanceScore * 0.5)   // capped at 50% without LLM
      : 10;

    return {
      confidence,
      findings:    hasData ? [{
        type:        'info',
        title:       `${this.name} domain data available`,
        description: `Found ${agentCtx.vectors?.length || 0} knowledge items and ${agentCtx.memory?.length || 0} memory records in the ${this.domain} domain.`,
        severity:    'low',
        evidence:    (agentCtx.vectors || []).slice(0, 2).map(v => String(v.content || '').slice(0, 100)),
      }] : [],
      recommendation: {
        action:    `Review ${this.domain} domain data manually`,
        priority:  'monitor',
        rationale: 'Heuristic analysis — LLM reasoning unavailable',
      },
      executionHints: [],
      escalations:    [],
      reasoning:      `Heuristic fallback: ${hasData ? 'domain data found' : 'no domain data found'}. LLM unavailable or timed out.`,
      error:          false,
    };
  }

  // ── Internal: relevance scoring ───────────────────────────────────────────

  _computeRelevance(intent) {
    if (!intent?.question) return 50;
    const q = intent.question.toLowerCase();

    // Keyword match
    const kwMatches = this.keywords.filter(kw => q.includes(kw.toLowerCase())).length;
    const kwScore   = Math.min(60, kwMatches * 20);

    // Domain match
    const domainScore = (intent.domain === this.domain || this.domains.includes(intent.domain)) ? 40 : 0;

    // Entity match — if any graph entity aligns with our connectors
    const entityText = (intent.entities || []).map(e => e.name).join(' ').toLowerCase();
    const connectorScore = this.connectors.some(c => entityText.includes(c)) ? 15 : 0;

    return Math.min(100, kwScore + domainScore + connectorScore);
  }

  _lowRelevanceOutput(intent, sessionId, relevanceScore, durationMs) {
    return {
      agentId:        this.id,
      agentName:      this.name,
      domain:         this.domain,
      sessionId,
      confidence:     5,
      relevanceScore,
      findings:       [],
      recommendation: { action: 'Not relevant to this query', priority: 'monitor', rationale: 'Agent domain not relevant' },
      executionHints: [],
      escalations:    [],
      reasoning:      `Agent not relevant to this query (relevance: ${relevanceScore}%).`,
      durationMs,
      error:          false,
    };
  }

  toDefinition() {
    return {
      id:           this.id,
      name:         this.name,
      domain:       this.domain,
      domains:      this.domains,
      mission:      this.mission,
      capabilities: this.capabilities,
      keywords:     this.keywords,
      connectors:   this.connectors,
    };
  }
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function _withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Agent reasoning timed out after ${ms}ms`)), ms);
    promise.then(v => { clearTimeout(timer); resolve(v); }, e => { clearTimeout(timer); reject(e); });
  });
}
