/**
 * FLOW OS — Autonomous Operations · Action Card Service (Phase 19)
 *
 * Transforms a WorkItem (from src/workday/signalCollector.js) into an ActionCard
 * ready to render in the OperationalInbox. Builds executable steps for each suggested
 * action using the workflow template registry. Pure and side-effect-free.
 */

import { getTemplate } from './workflowTemplates.js';

const IMPACT_LABEL = {
  critical: 'Critical Impact',
  high: 'High Impact',
  medium: 'Medium Impact',
  low: 'Low Impact',
};

function evidenceFor(item) {
  const lines = [];
  if (item.subtitle) lines.push(item.subtitle);
  if (item.owners?.length) lines.push(`Owned by: ${item.owners.slice(0, 2).join(', ')}`);
  if (item.blocking > 1) lines.push(`Blocking ${item.blocking} people`);
  if (item.estimatedImpact) lines.push(item.estimatedImpact);
  return lines.slice(0, 3);
}

/**
 * @param {object} item  WorkItem from signalCollector
 * @returns {ActionCard}
 */
export function buildActionCard(item) {
  const suggestedActions = Array.isArray(item.suggestedActions) ? item.suggestedActions : [];

  const actions = suggestedActions.map((sa, idx) => {
    const tpl = getTemplate(sa.workflowId);
    const steps = tpl ? tpl.buildSteps(item, sa.params || {}) : [{
      connector: 'system',
      actionType: sa.workflowId,
      payload: sa.params || {},
      title: sa.label,
    }];
    return {
      label: sa.label,
      workflowId: sa.workflowId,
      risk: sa.risk || 'LOW',
      steps,
      isPrimary: idx === 0,
    };
  });

  // Always ensure at least one action (Open) so the card is never action-less
  if (actions.length === 0) {
    actions.push({
      label: 'Open',
      workflowId: 'navigate',
      risk: 'LOW',
      steps: [{ connector: 'system', actionType: 'NAVIGATE', payload: { route: item.actionRoute || '/' }, title: 'Open' }],
      isPrimary: true,
    });
  }

  return {
    id: item.id,
    type: item.type,
    title: item.title,
    subtitle: item.subtitle || '',
    impact: item.businessImpact || 'low',
    impactLabel: IMPACT_LABEL[item.businessImpact] || IMPACT_LABEL.low,
    estimatedImpact: item.estimatedImpact || '',
    evidenceLines: evidenceFor(item),
    actions,
    source: item.source || 'system',
    actionRoute: item.actionRoute || '/',
    score: item.score || 0,
  };
}

/**
 * @param {object[]} items  WorkItems
 * @returns {ActionCard[]}
 */
export function buildActionCards(items = []) {
  return items.map(buildActionCard);
}

