# Action Card Architecture

An ActionCard is the unit of work in FLOW's Autonomous Operations layer. It wraps a WorkItem from the Workday Engine into a presentation + execution shape.

## Shape

```typescript
interface ActionCard {
  id: string;
  type: string;            // approval | conflict | execution_failed | incident | ...
  title: string;
  subtitle: string;
  impact: 'critical'|'high'|'medium'|'low';
  impactLabel: string;
  estimatedImpact: string;
  evidenceLines: string[];  // max 3
  actions: WorkflowAction[];
  source: string;
  actionRoute: string;
  score: number;
}

interface WorkflowAction {
  label: string;
  workflowId: string;     // key in workflowTemplates.js
  risk: string;           // LOW|MEDIUM|HIGH|CRITICAL
  steps: ExecutionStep[];
  isPrimary: boolean;
}
```

## Workflow Template Registry

Templates live in `src/autonomous/workflowTemplates.js`. Each template:
- Has a unique `id` (the `workflowId`)
- Has a `buildSteps(item, params)` function that constructs steps from the live item
- Steps are plain objects `{ connector, actionType, payload, title }` that `buildPlan()` in the Execution Engine can consume

**Adding a workflow:** add one entry to `TEMPLATES` in `workflowTemplates.js` and its id to `TEMPLATE_IDS`. No other files need to change.

## Data flow

```
Workday Engine (collect + score + build queue)
  → WorkItem with suggestedActions[]
     → actionCardService.buildActionCard()
        → ActionCard with actions[].steps[]
           → UI renders ActionCard
              → user clicks action
                 → executionApi.execute({ steps })
                    → Execution Engine → governed executeAction()
```

## Client-side adapter

`flow-os-frontend/src/lib/actionCardAdapter.js` — `buildActionCard(item)` converts an OperationalInbox WorkItem (from `/api/workday/queue`) to the ActionCard prop shape consumed by `ActionCard.jsx`. Add connector-specific impact mappings here without touching `ActionCard.jsx`.
