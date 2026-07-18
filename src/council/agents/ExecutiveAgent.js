/**
 * FLOW OS — Executive Agent (Phase 15)
 *
 * A specialized executive. It does NOT contain its own reasoning engine — it frames a
 * domain question and delegates to the existing Operational Brain via explainQuestion(),
 * then normalizes the explanation envelope into a structured, comparable "finding" the
 * Orchestrator, Debate, and Synthesis layers consume.
 */

import { runReasoning } from '../../ai/reasoning/OperationalBrain.js';
import { getAgentConfig } from './registry.js';

export class ExecutiveAgent {
  constructor(config) {
    this.id = config.id;
    this.title = config.title;
    this.role = config.role || 'MANAGER';
    this.capabilities = config.capabilities || [];
    this.keywords = config.keywords || [];
    this.domainPrompt = config.domainPrompt;
  }

  /**
   * Run a domain-scoped analysis of a question. Delegates to the existing Operational
   * Brain (`runReasoning` — the same entry point explainQuestion wraps) with a domain
   * prompt + role, then normalizes the brain response into a comparable finding. Using
   * runReasoning directly (rather than the heavier explain() envelope) keeps each agent
   * fast enough to stream, while still being the Brain — no reasoning is reimplemented.
   */
  async analyze(workspaceId, question) {
    const framed = `${this.domainPrompt}\n\nExecutive question: ${question}\n\nAnswer from your domain's perspective only.`;
    let brain;
    try {
      brain = await runReasoning(workspaceId, { question: framed, role: this.role });
    } catch (err) {
      return this._errorFinding(err);
    }
    return this._toFinding(brain);
  }

  /**
   * Lighter domain-health pass for the Executive Dashboard (Phase 15 M3). Reuses the
   * same Brain, asks a fixed health question, derives a status band from confidence
   * and contradictions.
   */
  async healthReport(workspaceId) {
    const q = `${this.domainPrompt}\n\nGive a concise health assessment for this domain: the single most important risk, the single best opportunity, and one recommended action.`;
    let brain;
    try {
      brain = await runReasoning(workspaceId, { question: q, role: this.role });
    } catch {
      return { agent: this.id, title: this.title, status: 'unknown', score: null, topRisks: [], topOpportunities: [], recommendedActions: [] };
    }
    const f = this._toFinding(brain);
    return {
      agent: this.id,
      title: this.title,
      status: statusFromScore(f.confidence, f.contradictions.length),
      score: f.confidence,
      topRisks: f.risks.slice(0, 3),
      topOpportunities: f.opportunities.slice(0, 3),
      recommendedActions: f.recommendedActions.slice(0, 3),
      summary: f.summary,
    };
  }

  _toFinding(brain) {
    const recommendedActions = brain.actions?.recommended || [];
    const contradictions = brain.reasoning?.contradictions || [];
    const summary = brain.summary || brain.answer || 'No assessment available.';
    // Risks: surfaced contradictions + a stated risk-if-no-action.
    const risks = contradictions.map((c) => (typeof c === 'string' ? c : c.summary || c.claim || 'Conflicting signal'));
    if (brain.actions?.riskIfNoAction) risks.push(brain.actions.riskIfNoAction);
    const opportunities = recommendedActions.map((a) => actionText(a));

    return {
      agent: this.id,
      title: this.title,
      summary,
      confidence: brain.confidence?.score ?? null,
      confidenceLevel: brain.confidence?.level ?? 'unknown',
      trust: brain.confidence?.score ?? null,
      evidenceCount: brain.evidence?.total ?? 0,
      evidence: (brain.evidence?.primary || []).slice(0, 5),
      recommendedActions,
      contradictions,
      risks,
      opportunities,
      stance: recommendedActions.length ? actionText(recommendedActions[0]) : summary.split(/[.\n]/)[0],
    };
  }

  _errorFinding(err) {
    return {
      agent: this.id, title: this.title, summary: `Unavailable: ${err.message}`,
      confidence: null, confidenceLevel: 'unknown', trust: null, evidenceCount: 0,
      evidence: [], recommendedActions: [], contradictions: [], risks: [], opportunities: [],
      stance: null, error: true,
    };
  }
}

export function actionText(a) {
  if (typeof a === 'string') return a;
  return a?.title || a?.action || a?.description || a?.label || 'recommended action';
}

function statusFromScore(score, contradictionCount) {
  if (score == null) return 'unknown';
  if (contradictionCount > 0 && score < 60) return 'at_risk';
  if (score >= 75) return 'healthy';
  if (score >= 55) return 'watch';
  return 'at_risk';
}

/** Instantiate an agent by id. */
export function makeAgent(id) {
  const config = getAgentConfig(id);
  return config ? new ExecutiveAgent(config) : null;
}

export default ExecutiveAgent;
