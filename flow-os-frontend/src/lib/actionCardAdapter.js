/**
 * Adapts an OperationalInbox item to the ActionCard prop shape.
 * Inbox items share key fields with WorkItems but come from different sources.
 */
export function buildActionCard(item) {
  const priority = item.priority || 0;
  const impact =
    priority >= 85 ? "critical" :
    priority >= 65 ? "high" :
    priority >= 45 ? "medium" : "low";
  const impactLabel =
    priority >= 85 ? "Critical Impact" :
    priority >= 65 ? "High Impact" :
    priority >= 45 ? "Medium Impact" : "Low Impact";

  const suggestedActions = item.suggestedActions || [];
  const actions = suggestedActions.length
    ? suggestedActions.map((sa, i) => ({
        label: sa.label,
        workflowId: sa.workflowId,
        risk: sa.risk || "LOW",
        steps: sa.steps || [{ connector: "system", actionType: sa.workflowId, payload: sa.params || {}, title: sa.label }],
        isPrimary: i === 0,
      }))
    : [{
        label: "Open",
        workflowId: "navigate",
        risk: "LOW",
        steps: [{ connector: "system", actionType: "NAVIGATE", payload: { route: item.actionRoute || "/inbox" }, title: "Open" }],
        isPrimary: true,
      }];

  return {
    id: item.id,
    type: item.type,
    title: item.title,
    subtitle: item.body || "",
    impact,
    impactLabel,
    estimatedImpact: item.estimatedImpact || "",
    evidenceLines: item.evidenceLines || (item.body ? [item.body] : []),
    actions,
    source: item.source,
    actionRoute: item.actionRoute || "/inbox",
    score: priority,
  };
}
