# Phase 19 — Autonomous Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn FLOW from an intelligence reporter into an operational command center where the CTO completes work without ever leaving the app.

**Architecture:** A thin `src/autonomous/` service layer wraps existing systems (Workday Engine, Execution Engine, Council, Memory, Analytics) to produce Action Cards — multi-step, one-approve workflows. No new AI models, no new databases, no new event platforms. Everything new is an orchestration or presentation layer over what already exists.

**Tech Stack:** Node.js 20+ ESM, Express 5, Prisma + pg.Pool (read from existing tables only), React 18 + Vite, design tokens

## Global Constraints

- ESM only — `import`/`export`, never `require()`
- Parameterized SQL — `$1`, `$2` only, no string interpolation
- Tenant isolation — every route guards `req.tenantId`; return `400` if absent
- Design tokens only in JSX — `var(--brand)`, `var(--border)`, `var(--border-strong)`, `var(--t1)`–`var(--t5)`, `var(--bg-secondary)`, `var(--bg-primary)`, `var(--p-critical-text)`, `var(--p-normal-text)`, `var(--p-high-text)` — NO raw hex in components
- MUST reuse: `src/workday/` (signal collector + prioritizer + work queue), `src/execution/` (buildPlan, dryRun, executePlan), `src/council/` (askCouncil), `src/services/orgMemoryService.js`, `src/analytics/pilotTracker.js`, `src/success/successMetrics.js`
- MUST NOT create new AI models, databases, vector systems, graph layers, event platforms, execution engines, prediction systems
- All side-effects flow through `executeAction()` — governance never bypassed
- Named exports preferred; default export only for single-responsibility modules
- `pilotTracker` calls are fire-and-forget in the frontend — never block UI

---

## File Map

### New backend files
| File | Responsibility |
|------|---------------|
| `src/autonomous/workflowTemplates.js` | Named multi-step workflow templates keyed by item type |
| `src/autonomous/actionCardService.js` | WorkItem → ActionCard with 2–4 suggested workflow options |
| `src/autonomous/memoryPersonalizer.js` | Reads `execution_records` → preferences (preferred reviewers, delegation habits) |
| `src/autonomous/chiefOfStaffService.js` | Top-5 NOW items + context for Chief of Staff panel |
| `src/autonomous/weeklyReviewService.js` | Weekly executive review: extends `getWeeklySummary()` with velocity + success rate + risks |
| `src/routes/autonomousRoutes.js` | Mounts all `/api/autonomous/*` endpoints |

### Modified backend files
| File | Change |
|------|--------|
| `src/workday/signalCollector.js` | Add 3 new signal sources: failed executions, connector warnings, incidents; add `suggestedActions[]` + `estimatedImpact` to every WorkItem |
| `src/routes/brainRoutes.js` | Extend `/api/brain/copilot`: if response text contains actionable intent, add `plan` built by `buildPlan()` |
| `src/analytics/pilotMetrics.js` | Add `getEfficiencyMetrics(workspaceId, days)` |
| `src/server.js` | Mount `autonomousRoutes` at `/api/autonomous` |

### New frontend files
| File | Responsibility |
|------|---------------|
| `flow-os-frontend/src/components/inbox/ActionCard.jsx` | Multi-option action card — impact badge, 2–4 workflow buttons, inline execution |
| `flow-os-frontend/src/components/autonomous/ChiefOfStaff.jsx` | Chief of Staff panel at `/chief` |
| `flow-os-frontend/src/components/autonomous/WeeklyReview.jsx` | Weekly executive review at `/review` |

### Modified frontend files
| File | Change |
|------|--------|
| `flow-os-frontend/src/components/inbox/OperationalInbox.jsx` | Render `ActionCard` for each item; track `action.accepted`/`action.dismissed` |
| `flow-os-frontend/src/components/brain/BrainMessage.jsx` | Render `ExecutableActionCard` when `message.plan` is present |
| `flow-os-frontend/src/components/layout/Sidebar.jsx` | Add Chief of Staff + Weekly Review nav items |
| `flow-os-frontend/src/App.jsx` | Add `/chief` and `/review` routes |

### New scripts + docs
| File | |
|------|--|
| `scripts/validate-phase19.js` | Full deterministic validation (~40 assertions, no live server needed) |
| `docs/AUTONOMOUS_OPERATIONS.md` | Phase overview + architecture |
| `docs/ACTION_CARD_ARCHITECTURE.md` | ActionCard format + workflow template registry |
| `docs/CHIEF_OF_STAFF.md` | Chief of Staff service description |
| `docs/OPERATIONAL_INBOX.md` | Inbox signal sources + item lifecycle |
| `docs/EXECUTION_WORKFLOWS.md` | Multi-step workflow reference |
| Update `CLAUDE.md` §25 | Document Phase 19 |
| Update `docs/PILOT_RUNBOOK.md` | Add Chief of Staff + weekly review procedures |

---

### Task 1: Signal Collector Enhancement

**Files:**
- Modify: `src/workday/signalCollector.js`

**Interfaces:**
- Consumes: `prisma.executionRecord`, `checkAllHealth(workspaceId)` from `src/connectors/registry.js`, `queryMemory` from `src/services/orgMemoryService.js`
- Produces: augmented `WorkItem` shape — every item now has `suggestedActions: Array<{ label: string, workflowId: string, risk: string, params: object }>` and `estimatedImpact: string`

- [ ] **Step 1: Read the existing `collect()` function**

Open `src/workday/signalCollector.js` and note its current structure. The function is async, makes 3 `Promise.allSettled` calls, and pushes items to a local `items[]` array.

- [ ] **Step 2: Add `suggestedActions` and `estimatedImpact` to existing item shapes**

Find every `items.push(...)` call in the file. Add two fields to each pushed object:

For **approval** items:
```js
suggestedActions: [
  { label: 'Approve', workflowId: 'approve_action', risk: a.riskLevel === 'CRITICAL' ? 'CRITICAL' : 'HIGH', params: { approvalId: a.id, connectorId: a.connectorId, actionType: a.actionType } },
  { label: 'Reject', workflowId: 'reject_action', risk: 'LOW', params: { approvalId: a.id } },
],
estimatedImpact: `Unblocks ${a.riskLevel === 'CRITICAL' ? 'critical' : 'HIGH risk'} workflow`,
```

For **notification** items (add after existing `items.push` in the notifications loop):
```js
suggestedActions: [
  { label: 'Open', workflowId: 'navigate', risk: 'LOW', params: { route: meta.route } },
],
estimatedImpact: 'Clears notification',
```

For **prediction** items:
```js
suggestedActions: [
  { label: 'Investigate', workflowId: 'navigate', risk: 'LOW', params: { route: '/brain' } },
],
estimatedImpact: pred.p.probability >= 0.8 ? 'Prevents high-probability risk' : 'Mitigates risk',
```

- [ ] **Step 3: Add failed execution signal source**

After the existing 3 `Promise.allSettled` calls and before `return items`, add:

```js
// ── Failed executions (last 24 h) ─────────────────────────────────────────
try {
  const failed = await prisma.executionRecord.findMany({
    where: { workspaceId, status: 'FAILED', createdAt: { gte: new Date(Date.now() - 24 * 3_600_000) } },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: { id: true, connector: true, actionType: true, summary: true, riskLevel: true, createdAt: true },
  });
  for (const e of failed) {
    items.push({
      id: `fe-${e.id}`, type: 'execution_failed', source: e.connector || 'system',
      title: `Failed: ${e.summary || e.actionType || 'execution'}`,
      subtitle: `${e.connector} · ${e.riskLevel || 'MEDIUM'} risk · retry available`,
      owners: [], participants: [], blocking: 1,
      businessImpact: 'high', department: deptOfConnector(e.connector),
      actionRoute: '/inbox', actionLabel: 'Retry',
      suggestedActions: [
        { label: 'Dismiss', workflowId: 'dismiss', risk: 'LOW', params: { recordId: e.id } },
      ],
      estimatedImpact: 'Clears failed workflow',
      raw: e,
    });
  }
} catch { /* best-effort */ }
```

- [ ] **Step 4: Add connector warning signal source**

```js
// ── Connector warnings (DEGRADED / DOWN) ─────────────────────────────────
try {
  const { checkAllHealth } = await import('../connectors/registry.js');
  const health = await checkAllHealth(workspaceId);
  for (const [connectorId, h] of Object.entries(health || {})) {
    if (!h || h.status === 'HEALTHY') continue;
    items.push({
      id: `cw-${connectorId}`, type: 'connector_warning', source: connectorId,
      title: `${connectorId} needs attention`,
      subtitle: h.message || `Status: ${h.status} — reconnect to restore access`,
      owners: [], participants: [], blocking: 1,
      businessImpact: h.status === 'DOWN' ? 'critical' : 'medium',
      department: deptOfConnector(connectorId),
      actionRoute: '/admin/ops', actionLabel: 'Reconnect',
      suggestedActions: [
        { label: 'Go to Admin', workflowId: 'navigate', risk: 'LOW', params: { route: '/admin/ops' } },
      ],
      estimatedImpact: 'Restores connector access',
      raw: { connectorId, health: h },
    });
  }
} catch { /* best-effort */ }
```

- [ ] **Step 5: Add incident memory signal source**

```js
// ── Recent incidents (last 48 h) ──────────────────────────────────────────
try {
  const { queryMemory } = await import('../services/orgMemoryService.js');
  const incidents = await queryMemory(workspaceId, 'INCIDENT', { hours: 48, limit: 5 });
  for (const inc of incidents) {
    items.push({
      id: `inc-${inc.id}`, type: 'incident', source: 'system',
      title: inc.title,
      subtitle: inc.body || 'Investigate and resolve',
      owners: [inc.author].filter(Boolean), participants: [],
      blocking: 2, businessImpact: 'critical', department: 'engineering',
      actionRoute: '/inbox', actionLabel: 'Investigate',
      suggestedActions: [
        { label: 'Investigate', workflowId: 'navigate', risk: 'LOW', params: { route: '/brain' } },
        { label: 'Escalate', workflowId: 'navigate', risk: 'LOW', params: { route: '/council' } },
      ],
      estimatedImpact: 'Resolves production incident',
      raw: inc,
    });
  }
} catch { /* best-effort */ }
```

- [ ] **Step 6: Verify the work queue still runs**

```bash
node -e "
import('./src/workday/workdayEngine.js').then(m =>
  m.getWorkQueue('workspace_corp_alpha', { id: 'test', email: 'test@test.com' })
    .then(q => console.log('now:', q.now.length, 'next:', q.next.length, 'total:', q.total))
    .catch(e => console.error(e.message))
)"
```

Expected output: prints NOW/NEXT/total counts without error.

- [ ] **Step 7: Commit**

```bash
git add src/workday/signalCollector.js
git commit -m "feat(phase19): enrich WorkItems with suggestedActions + 3 new signal sources"
```

---

### Task 2: Workflow Templates

**Files:**
- Create: `src/autonomous/workflowTemplates.js`

**Interfaces:**
- Produces: `getTemplate(workflowId)` → `{ id, label, risk, buildSteps(item) }` or `null`; `TEMPLATE_IDS` constant array; `listTemplates()` → array

- [ ] **Step 1: Create the file**

```js
/**
 * FLOW OS — Autonomous Operations · Workflow Templates (Phase 19)
 *
 * Pre-defined multi-step workflows keyed by workflowId. Each template maps to a
 * sequence of connector steps that the Execution Engine already knows how to run.
 * Nothing here bypasses governance — every step goes through executeAction().
 *
 * ADDING A TEMPLATE: add one entry to TEMPLATES and export TEMPLATE_IDS.
 * Callers: actionCardService.js, AutonomousRoutes /api/autonomous/templates.
 */

export const TEMPLATE_IDS = [
  'approve_action',
  'reject_action',
  'dismiss',
  'navigate',
  'notify_team',
  'escalate_to_council',
];

const TEMPLATES = {
  approve_action: {
    id: 'approve_action',
    label: 'Approve',
    description: 'Approve the pending governance action',
    risk: 'HIGH',
    buildSteps: (item) => [{
      connector: item.raw?.connectorId || 'system',
      actionType: 'APPROVE_ACTION',
      payload: { approvalId: item.raw?.id, actionType: item.raw?.actionType },
      title: `Approve: ${item.title}`,
    }],
  },

  reject_action: {
    id: 'reject_action',
    label: 'Reject',
    description: 'Reject the pending governance action',
    risk: 'LOW',
    buildSteps: (item) => [{
      connector: item.raw?.connectorId || 'system',
      actionType: 'REJECT_ACTION',
      payload: { approvalId: item.raw?.id },
      title: `Reject: ${item.title}`,
    }],
  },

  dismiss: {
    id: 'dismiss',
    label: 'Dismiss',
    description: 'Mark this item as reviewed and dismiss it',
    risk: 'LOW',
    buildSteps: () => [{
      connector: 'system',
      actionType: 'DISMISS_ITEM',
      payload: {},
      title: 'Dismiss item',
    }],
  },

  navigate: {
    id: 'navigate',
    label: 'Open',
    description: 'Navigate to the relevant page in FLOW',
    risk: 'LOW',
    buildSteps: (item, params = {}) => [{
      connector: 'system',
      actionType: 'NAVIGATE',
      payload: { route: params.route || item.actionRoute || '/' },
      title: `Open ${params.route || item.actionRoute || 'page'}`,
    }],
  },

  notify_team: {
    id: 'notify_team',
    label: 'Notify Team',
    description: 'Send a notification to the relevant team members',
    risk: 'LOW',
    buildSteps: (item) => [{
      connector: 'system',
      actionType: 'SEND_NOTIFICATION',
      payload: {
        title: `Attention: ${item.title}`,
        body: item.subtitle || item.title,
        recipients: item.owners || [],
      },
      title: 'Notify team',
    }],
  },

  escalate_to_council: {
    id: 'escalate_to_council',
    label: 'Ask Council',
    description: 'Ask the Executive Council for guidance on this item',
    risk: 'LOW',
    buildSteps: (item) => [{
      connector: 'system',
      actionType: 'NAVIGATE',
      payload: { route: `/council?q=${encodeURIComponent(item.title)}` },
      title: 'Ask Executive Council',
    }],
  },
};

/**
 * @param {string} workflowId
 * @returns {{ id, label, description, risk, buildSteps }} | null
 */
export function getTemplate(workflowId) {
  return TEMPLATES[workflowId] ?? null;
}

/**
 * @returns {Array<{ id, label, description, risk }>}
 */
export function listTemplates() {
  return Object.values(TEMPLATES).map(({ id, label, description, risk }) => ({ id, label, description, risk }));
}

export default { getTemplate, listTemplates, TEMPLATE_IDS };
```

- [ ] **Step 2: Verify the file is importable**

```bash
node -e "import('./src/autonomous/workflowTemplates.js').then(m => console.log('templates:', m.TEMPLATE_IDS.join(', ')))"
```

Expected: `templates: approve_action, reject_action, dismiss, navigate, notify_team, escalate_to_council`

- [ ] **Step 3: Commit**

```bash
git add src/autonomous/workflowTemplates.js
git commit -m "feat(phase19): workflow template registry"
```

---

### Task 3: Action Card Service

**Files:**
- Create: `src/autonomous/actionCardService.js`

**Interfaces:**
- Consumes: `getTemplate(workflowId)` from `./workflowTemplates.js`; `WorkItem` shape from `src/workday/signalCollector.js`
- Produces: `buildActionCard(item)` → `ActionCard`; `buildActionCards(items)` → `ActionCard[]`

ActionCard shape:
```js
{
  id: string,           // same as WorkItem.id
  type: string,         // same as WorkItem.type
  title: string,
  subtitle: string,
  impact: 'critical'|'high'|'medium'|'low',
  impactLabel: string,  // human-readable e.g. "High Impact"
  estimatedImpact: string,
  evidenceLines: string[],  // 1–3 short evidence sentences
  actions: Array<{
    label: string,
    workflowId: string,
    risk: string,       // LOW|MEDIUM|HIGH|CRITICAL
    steps: Array<{ connector, actionType, payload, title }>,
    isPrimary: boolean, // first action is primary
  }>,
  source: string,
  actionRoute: string,
  score: number,        // from WorkItem.s or 0
}
```

- [ ] **Step 1: Write a failing test**

```bash
cat > /tmp/test-action-card.mjs << 'EOF'
import { buildActionCard, buildActionCards } from './src/autonomous/actionCardService.js';

const item = {
  id: 'ap-1', type: 'approval', title: 'Approve github MERGE_PR', subtitle: 'HIGH risk',
  owners: ['alice'], participants: [], blocking: 1, businessImpact: 'high',
  department: 'engineering', actionRoute: '/inbox', actionLabel: 'Review',
  suggestedActions: [
    { label: 'Approve', workflowId: 'approve_action', risk: 'HIGH', params: { approvalId: '1' } },
    { label: 'Reject', workflowId: 'reject_action', risk: 'LOW', params: { approvalId: '1' } },
  ],
  estimatedImpact: 'Unblocks workflow', raw: { id: '1', connectorId: 'github', actionType: 'MERGE_PR' },
};

const card = buildActionCard(item);
console.assert(card.id === 'ap-1', 'id');
console.assert(card.actions.length >= 2, 'actions');
console.assert(card.actions[0].isPrimary === true, 'first action is primary');
console.assert(card.actions[0].steps.length > 0, 'steps present');
console.assert(typeof card.impact === 'string', 'impact');
console.log('✅ buildActionCard works');

const cards = buildActionCards([item, { ...item, id: 'ap-2', suggestedActions: [] }]);
console.assert(cards.length === 2, 'buildActionCards length');
console.log('✅ buildActionCards works');
EOF
node /tmp/test-action-card.mjs 2>&1 | head -10
```

Expected: error — `actionCardService.js` doesn't exist yet.

- [ ] **Step 2: Create `src/autonomous/actionCardService.js`**

```js
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
  high:     'High Impact',
  medium:   'Medium Impact',
  low:      'Low Impact',
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

export default { buildActionCard, buildActionCards };
```

- [ ] **Step 3: Run the test**

```bash
node /tmp/test-action-card.mjs
```

Expected:
```
✅ buildActionCard works
✅ buildActionCards works
```

- [ ] **Step 4: Commit**

```bash
git add src/autonomous/actionCardService.js
git commit -m "feat(phase19): Action Card Service — WorkItem → ActionCard"
```

---

### Task 4: Memory Personalizer

**Files:**
- Create: `src/autonomous/memoryPersonalizer.js`

**Interfaces:**
- Consumes: `prisma.executionRecord` (read-only), `prisma.pendingApproval` (read-only)
- Produces: `getPreferences(workspaceId)` → `{ preferredReviewers: string[], frequentDelegatees: string[], approvalHabits: { avgRiskLevel: string }, recentlyBlockedConnectors: string[] }`

- [ ] **Step 1: Write a failing test**

```bash
cat > /tmp/test-memory-personalizer.mjs << 'EOF'
import { getPreferences } from './src/autonomous/memoryPersonalizer.js';
const prefs = await getPreferences('workspace_test_missing');
console.assert(Array.isArray(prefs.preferredReviewers), 'preferredReviewers array');
console.assert(Array.isArray(prefs.frequentDelegatees), 'frequentDelegatees array');
console.assert(typeof prefs.approvalHabits === 'object', 'approvalHabits object');
console.assert(Array.isArray(prefs.recentlyBlockedConnectors), 'recentlyBlockedConnectors array');
console.log('✅ getPreferences returns correct shape for empty workspace');
EOF
node /tmp/test-memory-personalizer.mjs 2>&1 | head -5
```

Expected: error — file doesn't exist yet.

- [ ] **Step 2: Create `src/autonomous/memoryPersonalizer.js`**

```js
/**
 * FLOW OS — Autonomous Operations · Memory Personalizer (Phase 19)
 *
 * Reads real FLOW records to derive workspace-level preferences.
 * Pure reads — no writes, no new tables. Reuses prisma + pg.Pool.
 * Used by actionCardService to personalize "Assign to Alice" suggestions.
 */

import { prisma } from '../core/config/prisma.js';

/**
 * @param {string} workspaceId
 * @returns {{ preferredReviewers, frequentDelegatees, approvalHabits, recentlyBlockedConnectors }}
 */
export async function getPreferences(workspaceId) {
  const since = new Date(Date.now() - 30 * 24 * 3_600_000); // last 30 days

  const [executions, failedApprovals] = await Promise.allSettled([
    prisma.executionRecord.findMany({
      where: { workspaceId, status: 'EXECUTED', createdAt: { gte: since } },
      select: { connector: true, actionType: true, executedById: true, requestedById: true },
      take: 200,
    }),
    prisma.pendingApproval.findMany({
      where: { workspaceId, status: 'PENDING', createdAt: { gte: since } },
      select: { connectorId: true, riskLevel: true },
      take: 50,
    }),
  ]);

  const execs = executions.status === 'fulfilled' ? executions.value : [];
  const blocked = failedApprovals.status === 'fulfilled' ? failedApprovals.value : [];

  // Who has been executing (approving/completing) most? → preferred reviewers
  const reviewerCounts = {};
  for (const e of execs) {
    if (e.executedById) reviewerCounts[e.executedById] = (reviewerCounts[e.executedById] || 0) + 1;
  }
  const preferredReviewers = Object.entries(reviewerCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id]) => id);

  // Who has been requested to act most? → frequent delegatees
  const delegateCounts = {};
  for (const e of execs) {
    if (e.requestedById && e.requestedById !== e.executedById) {
      delegateCounts[e.requestedById] = (delegateCounts[e.requestedById] || 0) + 1;
    }
  }
  const frequentDelegatees = Object.entries(delegateCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id]) => id);

  // What connectors currently have pending high-risk approvals? → recently blocked
  const recentlyBlockedConnectors = [...new Set(
    blocked
      .filter((a) => a.riskLevel === 'HIGH' || a.riskLevel === 'CRITICAL')
      .map((a) => a.connectorId)
  )];

  // Approval habits: what risk level do they typically approve?
  const riskCounts = {};
  for (const e of execs) {
    const r = e.actionType?.includes('APPROVE') ? 'HIGH' : 'LOW';
    riskCounts[r] = (riskCounts[r] || 0) + 1;
  }
  const avgRiskLevel = (riskCounts['HIGH'] || 0) > (riskCounts['LOW'] || 0) ? 'HIGH' : 'LOW';

  return {
    preferredReviewers,
    frequentDelegatees,
    approvalHabits: { avgRiskLevel },
    recentlyBlockedConnectors,
  };
}

export default { getPreferences };
```

- [ ] **Step 3: Run the test**

```bash
node /tmp/test-memory-personalizer.mjs
```

Expected: `✅ getPreferences returns correct shape for empty workspace`

- [ ] **Step 4: Commit**

```bash
git add src/autonomous/memoryPersonalizer.js
git commit -m "feat(phase19): Memory Personalizer — reads execution history for preferences"
```

---

### Task 5: Action Card UI Component

**Files:**
- Create: `flow-os-frontend/src/components/inbox/ActionCard.jsx`

**Interfaces:**
- Props: `{ card: ActionCard, onExecute?: fn, onDismiss?: fn }`
- `card` shape: same as Task 3 `ActionCard`
- Calls `POST /api/execution/execute` via `executionApi.execute()` when user clicks an action button

- [ ] **Step 1: Create `flow-os-frontend/src/components/inbox/ActionCard.jsx`**

```jsx
import { useState } from "react";
import { Zap, ChevronDown, Check, AlertTriangle, Clock, Loader2, ShieldCheck } from "lucide-react";
import executionApi from "../../lib/executionApi";

function trackPilot(event, props = {}) {
  const token = localStorage.getItem("flow_os_token") || "";
  const wsId = localStorage.getItem("flow_os_workspace_id") || "";
  if (!token || !wsId) return;
  fetch("/api/analytics/event", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "workspace-id": wsId, "Content-Type": "application/json" },
    body: JSON.stringify({ event, properties: props }),
  }).catch(() => {});
}

const IMPACT_COLOR = {
  critical: "var(--p-critical-text)",
  high:     "var(--p-high-text)",
  medium:   "var(--brand)",
  low:      "var(--t4)",
};

const RISK_BG = {
  LOW:      "rgba(76,175,130,0.10)",
  MEDIUM:   "rgba(91,158,255,0.10)",
  HIGH:     "rgba(255,151,65,0.10)",
  CRITICAL: "rgba(255,87,87,0.10)",
};
const RISK_BORDER = {
  LOW:      "rgba(76,175,130,0.30)",
  MEDIUM:   "rgba(91,158,255,0.30)",
  HIGH:     "rgba(255,151,65,0.30)",
  CRITICAL: "rgba(255,87,87,0.30)",
};
const RISK_COLOR = {
  LOW:      "var(--p-normal-text)",
  MEDIUM:   "rgba(91,158,255,0.90)",
  HIGH:     "var(--p-high-text)",
  CRITICAL: "var(--p-critical-text)",
};

function RiskChip({ risk }) {
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase",
      padding: "2px 6px", borderRadius: 3,
      color: RISK_COLOR[risk] || RISK_COLOR.LOW,
      background: RISK_BG[risk] || RISK_BG.LOW,
      border: `1px solid ${RISK_BORDER[risk] || RISK_BORDER.LOW}`,
      display: "inline-flex", alignItems: "center", gap: 3,
    }}>
      <ShieldCheck style={{ width: 9, height: 9 }} /> {risk}
    </span>
  );
}

export default function ActionCard({ card = {}, onExecute, onDismiss }) {
  const [state, setState] = useState("idle"); // idle|running|confirm|done|error|approval
  const [activeMsg, setActiveMsg] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [doneId, setDoneId] = useState(null);

  const actions = card.actions || [];
  const primary = actions[0];
  const secondary = actions.slice(1);

  async function handleAction(action) {
    if (state === "running") return;
    trackPilot("action.accepted", { workflowId: action.workflowId, type: card.type });
    setState("running");
    try {
      const plan = { title: action.label, steps: action.steps };
      const out = await executionApi.execute(plan, { confirmed: false });
      const step = out.results?.[0] || {};
      if (step.status === "EXECUTED" || out.completed) {
        setState("done");
        setDoneId(action.workflowId);
        setActiveMsg("Done.");
        onExecute?.({ card, action, result: out });
      } else if (step.status === "CONFIRM_REQUIRED") {
        setState("confirm");
        setActiveMsg(step.reason || "Please confirm this action.");
      } else if (step.status === "APPROVAL_REQUIRED") {
        setState("approval");
        setActiveMsg(`Sent for approval — ${step.requiredApprovals || 1} approval(s) required.`);
      } else if (step.status === "DENIED") {
        setState("error");
        setActiveMsg(step.error || "Denied by governance.");
      } else {
        setState("error");
        setActiveMsg(step.error || "Could not execute.");
      }
    } catch (err) {
      setState("error");
      setActiveMsg(err.message || "Something went wrong.");
    }
  }

  async function handleConfirm() {
    setState("running");
    try {
      const out = await executionApi.execute({ title: primary.label, steps: primary.steps }, { confirmed: true });
      setState(out.completed ? "done" : "error");
      setActiveMsg(out.completed ? "Done." : "Could not complete.");
    } catch {
      setState("error");
      setActiveMsg("Something went wrong.");
    }
  }

  function handleDismiss() {
    trackPilot("action.dismissed", { type: card.type });
    onDismiss?.({ card });
  }

  return (
    <div style={{
      background: "var(--bg-secondary)", border: "1px solid var(--border)",
      borderRadius: 10, overflow: "hidden", marginBottom: 10,
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 14px 10px" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: IMPACT_COLOR[card.impact] || "var(--t4)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
              {card.impactLabel || "Impact"}
            </span>
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--t1)", lineHeight: 1.4, marginBottom: 4 }}>{card.title}</div>
          {card.subtitle && <div style={{ fontSize: 12, color: "var(--t3)", lineHeight: 1.4 }}>{card.subtitle}</div>}
        </div>
        <button onClick={handleDismiss} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--t5)", padding: 2, lineHeight: 1 }} aria-label="Dismiss">✕</button>
      </div>

      {/* Evidence lines */}
      {card.evidenceLines?.length > 0 && (
        <div style={{ padding: "0 14px 10px" }}>
          {card.evidenceLines.map((line, i) => (
            <div key={i} style={{ fontSize: 11, color: "var(--t4)", lineHeight: 1.5 }}>· {line}</div>
          ))}
        </div>
      )}

      {/* Status banner */}
      {activeMsg && (
        <div style={{ margin: "0 14px 10px", padding: "8px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg-primary)", display: "flex", alignItems: "center", gap: 8 }}>
          {state === "done" && <Check style={{ width: 13, height: 13, color: "var(--p-normal-text)", flexShrink: 0 }} />}
          {state === "approval" && <Clock style={{ width: 13, height: 13, color: "var(--p-high-text)", flexShrink: 0 }} />}
          {state === "error" && <AlertTriangle style={{ width: 13, height: 13, color: "var(--p-critical-text)", flexShrink: 0 }} />}
          <span style={{ fontSize: 12, color: state === "done" ? "var(--p-normal-text)" : state === "error" ? "var(--p-critical-text)" : "var(--t2)" }}>{activeMsg}</span>
          {state === "confirm" && (
            <button onClick={handleConfirm} style={{ marginLeft: "auto", padding: "3px 10px", borderRadius: 5, background: "var(--brand)", color: "var(--t1)", border: "none", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
              Confirm
            </button>
          )}
        </div>
      )}

      {/* Action buttons */}
      {state !== "done" && (
        <div style={{ padding: "0 14px 12px", display: "flex", flexWrap: "wrap", gap: 8 }}>
          {primary && (
            <button
              onClick={() => handleAction(primary)}
              disabled={state === "running"}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "6px 14px", borderRadius: 6,
                background: "var(--brand)", color: "var(--t1)",
                border: "none", fontSize: 12, fontWeight: 600, cursor: state === "running" ? "default" : "pointer",
                opacity: state === "running" ? 0.7 : 1,
              }}
            >
              {state === "running" ? <Loader2 style={{ width: 12, height: 12, animation: "spin 1s linear infinite" }} /> : <Zap style={{ width: 12, height: 12 }} />}
              {primary.label}
              <RiskChip risk={primary.risk} />
            </button>
          )}
          {secondary.length > 0 && (
            <button
              onClick={() => setExpanded(!expanded)}
              style={{
                padding: "6px 10px", borderRadius: 6, border: "1px solid var(--border)",
                background: "transparent", color: "var(--t3)", fontSize: 12, cursor: "pointer",
                display: "flex", alignItems: "center", gap: 4,
              }}
            >
              More <ChevronDown style={{ width: 12, height: 12, transform: expanded ? "rotate(180deg)" : "none", transition: "transform 150ms" }} />
            </button>
          )}
        </div>
      )}

      {/* Secondary actions */}
      {expanded && secondary.length > 0 && (
        <div style={{ padding: "0 14px 12px", display: "flex", flexWrap: "wrap", gap: 8 }}>
          {secondary.map((action, i) => (
            <button
              key={i}
              onClick={() => handleAction(action)}
              disabled={state === "running"}
              style={{
                padding: "5px 12px", borderRadius: 6, border: "1px solid var(--border)",
                background: "transparent", color: "var(--t2)", fontSize: 12, cursor: "pointer",
                display: "flex", alignItems: "center", gap: 6,
              }}
            >
              {action.label} <RiskChip risk={action.risk} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify the frontend build still passes**

```bash
cd flow-os-frontend && npm run build 2>&1 | tail -5
```

Expected: build completes without errors.

- [ ] **Step 3: Commit**

```bash
cd .. && git add flow-os-frontend/src/components/inbox/ActionCard.jsx
git commit -m "feat(phase19): ActionCard UI — multi-option, risk-aware, inline execution"
```

---

### Task 6: OperationalInbox Enhancement

**Files:**
- Modify: `flow-os-frontend/src/components/inbox/OperationalInbox.jsx`

**Goal:** Replace per-item action buttons with `ActionCard`. Source items from `/api/workday/queue` instead of parallel fetches. Track `action.accepted`/`action.dismissed`.

- [ ] **Step 1: Read the current OperationalInbox**

Open `flow-os-frontend/src/components/inbox/OperationalInbox.jsx`. Note the existing `load()` function and how items are rendered (each item has an inline set of action buttons). The workday queue endpoint is `/api/workday/queue` and returns `{ now[], next[], later[], fyi[] }`.

- [ ] **Step 2: Add workday queue as the primary data source**

In the `load()` function, add a call to `/api/workday/queue` as the FIRST source. Merge the queue items at the top of `out[]` before the existing approval/conflict/recommendation calls.

Find the `load` callback and add at the start of the `Promise.allSettled` array:

```js
const [queue, appr, conf, recs, notifs, meets] = await Promise.allSettled([
  getJSON("/api/workday/queue"),
  // ... existing calls unchanged
]);

const out = [];

// ── Workday queue items (NOW + NEXT) ──────────────────────────────────────
if (queue.status === "fulfilled") {
  const q = queue.value;
  for (const item of [...(q.now || []), ...(q.next || [])]) {
    out.push({
      id: item.id || `wq-${Math.random()}`,
      type: item.type || "notification",
      source: item.source || "system",
      priority: item.score || 50,
      title: item.title,
      body: item.subtitle || item.reasons?.[0] || "",
      time: new Date(),
      raw: item,
      suggestedActions: item.suggestedActions || [],
      estimatedImpact: item.estimatedImpact || "",
      evidenceLines: item.reasons || [],
    });
  }
}
// ... existing appr/conf/recs/notifs/meets handling unchanged
```

- [ ] **Step 3: Import ActionCard and use it for rendering**

At the top of the file, add:
```js
import ActionCard from "./ActionCard";
import { buildActionCard } from "../../lib/actionCardAdapter";
```

Create `flow-os-frontend/src/lib/actionCardAdapter.js`:
```js
/**
 * Adapts an OperationalInbox item to the ActionCard prop shape.
 * Inbox items are not exactly WorkItems but share the same key fields.
 */
export function buildActionCard(item) {
  return {
    id: item.id,
    type: item.type,
    title: item.title,
    subtitle: item.body || "",
    impact: item.priority >= 85 ? "critical" : item.priority >= 65 ? "high" : item.priority >= 45 ? "medium" : "low",
    impactLabel: item.priority >= 85 ? "Critical Impact" : item.priority >= 65 ? "High Impact" : item.priority >= 45 ? "Medium Impact" : "Low Impact",
    estimatedImpact: item.estimatedImpact || "",
    evidenceLines: item.evidenceLines || (item.body ? [item.body] : []),
    actions: (item.suggestedActions || []).map((sa, i) => ({
      label: sa.label,
      workflowId: sa.workflowId,
      risk: sa.risk || "LOW",
      steps: sa.steps || [{ connector: "system", actionType: sa.workflowId, payload: sa.params || {}, title: sa.label }],
      isPrimary: i === 0,
    })).concat(
      item.suggestedActions?.length ? [] : [{
        label: "Open", workflowId: "navigate", risk: "LOW",
        steps: [{ connector: "system", actionType: "NAVIGATE", payload: { route: item.actionRoute || "/inbox" }, title: "Open" }],
        isPrimary: true,
      }]
    ),
    source: item.source,
    actionRoute: item.actionRoute || "/inbox",
    score: item.priority || 0,
  };
}
```

- [ ] **Step 4: Replace per-item action buttons with ActionCard in the render**

Find the JSX that renders each item card (look for `{items.filter(...).map((item) => (` or similar). Replace the individual item render with:

```jsx
{filtered.map((item) => (
  <ActionCard
    key={item.id}
    card={buildActionCard(item)}
    onExecute={({ card }) => setDone(d => ({ ...d, [card.id]: "Done" }))}
    onDismiss={({ card }) => setItems(prev => prev.filter(i => i.id !== card.id))}
  />
))}
```

Keep the existing filter bar, loading state, and demo fallback unchanged.

- [ ] **Step 5: Verify the frontend build**

```bash
cd flow-os-frontend && npm run build 2>&1 | tail -5
```

Expected: build completes without errors.

- [ ] **Step 6: Commit**

```bash
cd .. && git add flow-os-frontend/src/components/inbox/OperationalInbox.jsx flow-os-frontend/src/lib/actionCardAdapter.js
git commit -m "feat(phase19): OperationalInbox uses ActionCard + workday queue as primary source"
```

---

### Task 7: Natural Language Operations Bridge

**Files:**
- Modify: `src/routes/brainRoutes.js` (copilot endpoint only)
- Modify: `flow-os-frontend/src/components/brain/BrainMessage.jsx`

**Goal:** When the copilot detects an actionable intent ("assign X to Y", "merge PR", "approve deployment"), include a `plan` object in the response. BrainMessage renders an `ExecutableActionCard` when `message.plan` is present.

- [ ] **Step 1: Add NL intent detection to the copilot route**

In `src/routes/brainRoutes.js`, find the `router.post('/copilot', ...)` handler. After `const payload = { success: true, ...result };`, add:

```js
// Natural Language Operations: if the response is actionable, include a plan.
if (!payload.plan) {
  try {
    const { buildPlan } = await import('../execution/actionPlanner.js');
    const text = String(result.response || result.message || '').toLowerCase();
    const ACTIONABLE_PATTERNS = [
      /assign\s+\w+/i, /merge\s+(pr|pull request)/i, /approve\s+\w+/i,
      /create\s+(issue|ticket|pr)/i, /notify\s+\w+/i, /deploy\s+\w+/i,
      /reschedule\s+\w+/i, /review\s+(pr|pull request)/i,
    ];
    const isActionable = ACTIONABLE_PATTERNS.some((p) => p.test(text));
    if (isActionable && result.actions?.length) {
      // Use the Brain's existing recommended actions as plan steps
      const steps = result.actions
        .filter((a) => a.connector && a.actionType)
        .map((a) => ({ connector: a.connector, actionType: a.actionType, payload: a.payload || {}, title: a.label || a.title || a.actionType }))
        .slice(0, 3);
      if (steps.length) {
        payload.plan = buildPlan({ title: question, steps });
      }
    }
  } catch { /* NL bridge is best-effort — never breaks the copilot */ }
}
```

- [ ] **Step 2: Extend BrainMessage to render ActionCard when plan is present**

In `flow-os-frontend/src/components/brain/BrainMessage.jsx`, find the `renderCard` function. Add a new case:

```js
case "plan": return (
  <ExecutableActionCard key={i} card={{
    title: card.data?.title || "Suggested action",
    recommendation: card.data,
    risk: card.data?.steps?.[0]?.risk || "MEDIUM",
  }} />
);
```

Then find where `message.cards` is mapped (or where the content is rendered after the main text). After the existing card renders, add:

```jsx
{message.plan && !message.streaming && (
  <div style={{ marginTop: 12 }}>
    <ExecutableActionCard card={{
      title: message.plan.title || "Execute this",
      recommendation: message.plan,
      summary: "FLOW detected an action in your request. Click to execute it.",
    }} />
  </div>
)}
```

- [ ] **Step 3: Verify the frontend build**

```bash
cd flow-os-frontend && npm run build 2>&1 | tail -5
```

Expected: build completes without errors.

- [ ] **Step 4: Commit**

```bash
cd .. && git add src/routes/brainRoutes.js flow-os-frontend/src/components/brain/BrainMessage.jsx
git commit -m "feat(phase19): NL Operations bridge — copilot detects actionable intent, BrainMessage renders plan"
```

---

### Task 8: Chief of Staff Service + Panel

**Files:**
- Create: `src/autonomous/chiefOfStaffService.js`
- Modify: `src/routes/autonomousRoutes.js` (create file)
- Create: `flow-os-frontend/src/components/autonomous/ChiefOfStaff.jsx`

**Interfaces:**
- `getChiefOfStaffBriefing(workspaceId, user)` → `{ greeting, topItems: ActionCard[], summary: string, generatedAt }`
- Route: `GET /api/autonomous/chief-of-staff`

- [ ] **Step 1: Create `src/autonomous/chiefOfStaffService.js`**

```js
/**
 * FLOW OS — Chief of Staff Service (Phase 19)
 *
 * Returns a prioritized briefing: the top 5 NOW items from the Workday Engine
 * + a one-sentence workspace summary from the WIC snapshot. No new reasoning —
 * reuses workdayEngine.getWorkQueue() and the existing workspace snapshot.
 */

import { getWorkQueue } from '../workday/workdayEngine.js';
import { buildActionCard } from './actionCardService.js';
import { getPreferences } from './memoryPersonalizer.js';

function greet(user = {}) {
  const h = new Date().getHours();
  const name = user.fullName || user.name || (user.email || '').split('@')[0] || 'there';
  const part = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  return `${part}, ${name.charAt(0).toUpperCase() + name.slice(1)}.`;
}

/**
 * @param {string} workspaceId
 * @param {object} user  { id, email, fullName, role }
 * @returns {{ greeting, topItems, summary, preferences, generatedAt }}
 */
export async function getChiefOfStaffBriefing(workspaceId, user = {}) {
  const [queueResult, prefResult] = await Promise.allSettled([
    getWorkQueue(workspaceId, user),
    getPreferences(workspaceId),
  ]);

  const queue = queueResult.status === 'fulfilled' ? queueResult.value : { now: [], next: [] };
  const prefs = prefResult.status === 'fulfilled' ? prefResult.value : { preferredReviewers: [], frequentDelegatees: [] };

  const topRaw = [...(queue.now || []), ...(queue.next || [])].slice(0, 5);
  const topItems = topRaw.map((item) => buildActionCard(item));

  const nowCount = (queue.now || []).length;
  const totalCount = queue.total || 0;
  let summary = 'All clear — no urgent items right now.';
  if (nowCount > 0) {
    const types = [...new Set(topRaw.map((i) => i.type))].slice(0, 2).join(' and ');
    summary = `${nowCount} item${nowCount > 1 ? 's' : ''} need${nowCount === 1 ? 's' : ''} your attention now${types ? ` (${types})` : ''}. ${totalCount > nowCount ? `${totalCount - nowCount} more can wait.` : ''}`;
  }

  return {
    greeting: greet(user),
    topItems,
    summary,
    preferences: prefs,
    generatedAt: new Date().toISOString(),
  };
}

export default { getChiefOfStaffBriefing };
```

- [ ] **Step 2: Create `src/routes/autonomousRoutes.js`**

```js
/**
 * FLOW OS — Autonomous Operations Routes (Phase 19)
 *
 *   GET /api/autonomous/chief-of-staff    Top-5 NOW items + greeting
 *   GET /api/autonomous/weekly-review     Weekly executive review
 *   GET /api/autonomous/templates         Available workflow templates
 *   GET /api/autonomous/efficiency        FLOW efficiency metrics
 */

import express from 'express';
import { getChiefOfStaffBriefing } from '../autonomous/chiefOfStaffService.js';
import { listTemplates }            from '../autonomous/workflowTemplates.js';

const router = express.Router();

router.use((req, res, next) => {
  if (!req.tenantId) return res.status(400).json({ error: { code: 'MISSING_WORKSPACE', message: 'workspace-id header is required' } });
  next();
});

const userOf = (req) => ({ id: req.user?.id, email: req.user?.email, fullName: req.user?.fullName, role: req.workspaceRole || req.user?.role });

router.get('/chief-of-staff', async (req, res, next) => {
  try { res.json(await getChiefOfStaffBriefing(req.tenantId, userOf(req))); }
  catch (err) { next(err); }
});

router.get('/templates', (req, res) => res.json({ templates: listTemplates() }));

// weekly-review and efficiency routes added in Task 9 and Task 10

export default router;
```

- [ ] **Step 3: Create `flow-os-frontend/src/components/autonomous/ChiefOfStaff.jsx`**

```jsx
import { useState, useEffect } from "react";
import { Star, RefreshCw, Zap } from "lucide-react";
import ActionCard from "../inbox/ActionCard";

function authHeaders() {
  return {
    Authorization: `Bearer ${localStorage.getItem("flow_os_token") || ""}`,
    "workspace-id": localStorage.getItem("flow_os_workspace_id") || "workspace_corp_alpha",
    "Content-Type": "application/json",
  };
}
async function getJSON(p) {
  const r = await fetch(p, { headers: authHeaders() });
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
}

const DEMO = {
  greeting: "Good morning, Rahul.",
  summary: "3 items need your attention now (approval and conflict). 5 more can wait.",
  topItems: [
    {
      id: "d-1", type: "approval", title: "Approve: github MERGE_PULL_REQUEST",
      subtitle: "HIGH risk · 2 approvals required",
      impact: "critical", impactLabel: "Critical Impact",
      estimatedImpact: "Unblocks 3 engineers",
      evidenceLines: ["HIGH risk · 2 approvals required", "Blocking 3 engineers"],
      actions: [
        { label: "Approve", workflowId: "approve_action", risk: "HIGH", steps: [], isPrimary: true },
        { label: "Reject", workflowId: "reject_action", risk: "LOW", steps: [], isPrimary: false },
      ],
      source: "github", actionRoute: "/inbox",
    },
    {
      id: "d-2", type: "conflict", title: "Merge conflict in flow-backend",
      subtitle: "auth.js — Rahul & Kishore both modified",
      impact: "high", impactLabel: "High Impact",
      estimatedImpact: "Unblocks merge",
      evidenceLines: ["auth.js changed by 2 people", "Owned by: rahul, kishore"],
      actions: [
        { label: "Resolve", workflowId: "navigate", risk: "LOW", steps: [], isPrimary: true },
        { label: "Notify Team", workflowId: "notify_team", risk: "LOW", steps: [], isPrimary: false },
      ],
      source: "github", actionRoute: "/inbox",
    },
  ],
};

export default function ChiefOfStaff() {
  const [data, setData] = useState(null);
  const [demo, setDemo] = useState(false);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);

  const load = async () => {
    setLoading(true);
    try {
      const d = await getJSON("/api/autonomous/chief-of-staff");
      setData(d);
      setItems(d.topItems || []);
      setDemo(false);
    } catch {
      setData(DEMO);
      setItems(DEMO.topItems);
      setDemo(true);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  return (
    <div style={{ padding: "28px 24px 48px", maxWidth: 720, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Star style={{ width: 18, height: 18, color: "var(--brand)" }} />
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "var(--t1)" }}>Chief of Staff</h1>
          {demo && <span style={{ fontSize: 11, color: "var(--t4)", background: "var(--bg-secondary)", padding: "2px 8px", borderRadius: 10, border: "1px solid var(--border)" }}>Sample data</span>}
        </div>
        <button onClick={load} style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 7, border: "1px solid var(--border)", background: "transparent", color: "var(--t3)", fontSize: 12, cursor: "pointer" }}>
          <RefreshCw style={{ width: 12, height: 12 }} /> Refresh
        </button>
      </div>

      {loading ? (
        <div style={{ color: "var(--t4)", fontSize: 13 }}>Loading…</div>
      ) : (
        <>
          {data?.greeting && (
            <div style={{ marginBottom: 6 }}>
              <p style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "var(--t1)" }}>{data.greeting}</p>
              <p style={{ margin: "6px 0 20px", fontSize: 14, color: "var(--t3)" }}>{data.summary}</p>
            </div>
          )}

          {items.length === 0 ? (
            <div style={{ padding: 32, textAlign: "center", color: "var(--t4)", background: "var(--bg-secondary)", borderRadius: 12, border: "1px solid var(--border)" }}>
              <Zap style={{ width: 24, height: 24, marginBottom: 8, opacity: 0.4 }} />
              <p style={{ margin: 0, fontSize: 14 }}>All clear — no urgent items.</p>
            </div>
          ) : (
            <div>
              {items.map((card) => (
                <ActionCard
                  key={card.id}
                  card={card}
                  onExecute={() => setItems(prev => prev.filter(i => i.id !== card.id))}
                  onDismiss={() => setItems(prev => prev.filter(i => i.id !== card.id))}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Verify the frontend build**

```bash
cd flow-os-frontend && npm run build 2>&1 | tail -5
```

Expected: build completes without errors.

- [ ] **Step 5: Commit**

```bash
cd .. && git add src/autonomous/chiefOfStaffService.js src/routes/autonomousRoutes.js flow-os-frontend/src/components/autonomous/ChiefOfStaff.jsx
git commit -m "feat(phase19): Chief of Staff service + route + panel"
```

---

### Task 9: Weekly Executive Review

**Files:**
- Create: `src/autonomous/weeklyReviewService.js`
- Modify: `src/routes/autonomousRoutes.js` (add route)
- Create: `flow-os-frontend/src/components/autonomous/WeeklyReview.jsx`

**Interfaces:**
- `getWeeklyReview(workspaceId, opts)` → full weekly review object
- Route: `GET /api/autonomous/weekly-review?days=7`

- [ ] **Step 1: Create `src/autonomous/weeklyReviewService.js`**

```js
/**
 * FLOW OS — Weekly Executive Review Service (Phase 19)
 *
 * Extends the existing Phase 17 getWeeklySummary() with:
 *   - Engineering velocity (PR/commit events from flow_events)
 *   - Execution success rate (execution_records)
 *   - Operational risks (top-3 from Prediction Engine)
 *   - Recommended priorities (NOW items from workday queue)
 *
 * Reuse only — no new DB tables. Every number is evidence-backed.
 */

import { getWeeklySummary } from '../success/successMetrics.js';
import { prisma }           from '../core/config/prisma.js';
import db                   from '../config/db.js';
import { predict }          from '../predictions/PredictionEngine.js';
import { getWorkQueue }     from '../workday/workdayEngine.js';

export async function getWeeklyReview(workspaceId, { days = 7 } = {}) {
  const since = new Date(Date.now() - days * 24 * 3_600_000);

  const [baseResult, execResult, predResult, queueResult] = await Promise.allSettled([
    getWeeklySummary(workspaceId, { sinceDays: days }),
    prisma.executionRecord.groupBy({
      by: ['status'],
      where: { workspaceId, createdAt: { gte: since } },
      _count: { _all: true },
    }),
    predict(workspaceId, {}),
    getWorkQueue(workspaceId, {}),
  ]);

  const base = baseResult.status === 'fulfilled' ? baseResult.value : { headline: [], detail: [] };
  const execGroups = execResult.status === 'fulfilled' ? execResult.value : [];
  const predictions = predResult.status === 'fulfilled' ? predResult.value.predictions || [] : [];
  const queue = queueResult.status === 'fulfilled' ? queueResult.value : { now: [] };

  // Execution success rate
  const totalExec = execGroups.reduce((s, g) => s + g._count._all, 0);
  const executedCount = (execGroups.find((g) => g.status === 'EXECUTED')?._count._all) || 0;
  const failedCount   = (execGroups.find((g) => g.status === 'FAILED')?._count._all) || 0;
  const executionSuccessRate = totalExec > 0 ? Math.round((executedCount / totalExec) * 100) : null;

  // Engineering velocity from flow_events
  let prsMerged = 0, deploymentsCompleted = 0;
  try {
    const evRes = await db.query(
      `SELECT
         COUNT(*) FILTER (WHERE (event_type = 'engineering' OR metadata->>'kind' = 'pull_request') AND metadata->>'action' = 'closed') ::int AS prs,
         COUNT(*) FILTER (WHERE event_type = 'deployment' OR metadata->>'kind' = 'deployment') ::int AS deploys
       FROM flow_events
       WHERE workspace_id = $1 AND ts >= $2`,
      [workspaceId, since.toISOString()],
    );
    prsMerged = evRes.rows[0]?.prs || 0;
    deploymentsCompleted = evRes.rows[0]?.deploys || 0;
  } catch { /* best-effort */ }

  // Top operational risks from predictions
  const operationalRisks = predictions
    .filter((p) => p.probability >= 0.5)
    .sort((a, b) => b.probability - a.probability)
    .slice(0, 3)
    .map((p) => ({
      prediction: p.prediction,
      probability: Math.round(p.probability * 100),
      trend: p.trend,
      timeHorizon: p.timeHorizon,
    }));

  // Recommended priorities from NOW queue
  const recommendedPriorities = (queue.now || []).slice(0, 3).map((item) => ({
    title: item.title,
    type: item.type,
    reason: item.reasons?.[0] || item.subtitle || '',
  }));

  return {
    window: { days, since: since.toISOString() },
    generatedAt: new Date().toISOString(),
    summary: base,
    engineeringVelocity: {
      prsMerged,
      deploymentsCompleted,
      evidenceSource: 'flow_events',
    },
    executionSuccessRate: {
      rate: executionSuccessRate,
      executed: executedCount,
      failed: failedCount,
      total: totalExec,
      evidenceSource: 'execution_records',
    },
    operationalRisks,
    recommendedPriorities,
  };
}

export default { getWeeklyReview };
```

- [ ] **Step 2: Add route to `src/routes/autonomousRoutes.js`**

Add the import at the top of the file:
```js
import { getWeeklyReview } from '../autonomous/weeklyReviewService.js';
```

Add the route before `export default router`:
```js
router.get('/weekly-review', async (req, res, next) => {
  try {
    const days = Math.min(30, Math.max(1, Number(req.query.days) || 7));
    res.json(await getWeeklyReview(req.tenantId, { days }));
  } catch (err) { next(err); }
});
```

- [ ] **Step 3: Test the route manually**

```bash
node -e "
import('./src/autonomous/weeklyReviewService.js').then(m =>
  m.getWeeklyReview('workspace_corp_alpha').then(r => {
    console.assert(r.window?.days === 7, 'days');
    console.assert(typeof r.executionSuccessRate?.rate === 'number' || r.executionSuccessRate?.rate === null, 'success rate');
    console.assert(Array.isArray(r.operationalRisks), 'risks array');
    console.assert(Array.isArray(r.recommendedPriorities), 'priorities array');
    console.log('✅ getWeeklyReview shape correct');
  })
)" 2>&1 | tail -5
```

- [ ] **Step 4: Create `flow-os-frontend/src/components/autonomous/WeeklyReview.jsx`**

```jsx
import { useState, useEffect } from "react";
import { TrendingUp, RefreshCw, AlertTriangle, Target, Zap, CheckCircle2 } from "lucide-react";

function authHeaders() {
  return {
    Authorization: `Bearer ${localStorage.getItem("flow_os_token") || ""}`,
    "workspace-id": localStorage.getItem("flow_os_workspace_id") || "workspace_corp_alpha",
  };
}
async function getJSON(p) {
  const r = await fetch(p, { headers: authHeaders() });
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
}

const SECTION = { background: "var(--bg-secondary)", border: "1px solid var(--border)", borderRadius: 10, padding: "16px 18px", marginBottom: 14 };
const LABEL = { fontSize: 10, fontWeight: 700, letterSpacing: "0.09em", textTransform: "uppercase", color: "var(--t4)", marginBottom: 12, display: "flex", alignItems: "center", gap: 6 };

export default function WeeklyReview() {
  const [data, setData] = useState(null);
  const [demo, setDemo] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      setData(await getJSON("/api/autonomous/weekly-review?days=7"));
      setDemo(false);
    } catch {
      setData({
        window: { days: 7 },
        summary: { headline: [
          { key: "timeSaved", label: "Time Saved", value: 3.5, unit: "hours", basis: "estimated" },
          { key: "tasksCompleted", label: "Tasks Completed", value: 12, basis: "measured" },
          { key: "approvalsExecuted", label: "Approvals", value: 4, basis: "measured" },
        ]},
        engineeringVelocity: { prsMerged: 8, deploymentsCompleted: 3 },
        executionSuccessRate: { rate: 92, executed: 11, failed: 1, total: 12 },
        operationalRisks: [
          { prediction: "Sprint delay likely if PR backlog grows", probability: 72, trend: "rising" },
          { prediction: "Knowledge loss risk — David is sole owner of payments module", probability: 85, trend: "stable" },
        ],
        recommendedPriorities: [
          { title: "Review Auth PR — blocked 2 days", type: "conflict", reason: "Blocking 2 engineers" },
          { title: "Approve deployment to production", type: "approval", reason: "HIGH risk · 2 approvals required" },
        ],
      });
      setDemo(true);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const r = data;
  return (
    <div style={{ padding: "28px 24px 48px", maxWidth: 760, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <TrendingUp style={{ width: 18, height: 18, color: "var(--brand)" }} />
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "var(--t1)" }}>Weekly Review</h1>
          {demo && <span style={{ fontSize: 11, color: "var(--t4)", background: "var(--bg-secondary)", padding: "2px 8px", borderRadius: 10, border: "1px solid var(--border)" }}>Sample data</span>}
        </div>
        <button onClick={load} style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 7, border: "1px solid var(--border)", background: "transparent", color: "var(--t3)", fontSize: 12, cursor: "pointer" }}>
          <RefreshCw style={{ width: 12, height: 12 }} /> Refresh
        </button>
      </div>

      {loading ? <div style={{ color: "var(--t4)", fontSize: 13 }}>Loading…</div> : r && (
        <>
          {/* Headline metrics */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px,1fr))", gap: 10, marginBottom: 14 }}>
            {(r.summary?.headline || []).map((m) => (
              <div key={m.key} style={{ ...SECTION, marginBottom: 0, textAlign: "center" }}>
                <div style={{ fontSize: 26, fontWeight: 700, color: "var(--t1)" }}>{m.value}{m.unit ? ` ${m.unit}` : ""}</div>
                <div style={{ fontSize: 11, color: "var(--t4)", marginTop: 3 }}>{m.label}</div>
                <div style={{ fontSize: 10, color: "var(--t5)", marginTop: 2 }}>{m.basis}</div>
              </div>
            ))}
          </div>

          {/* Engineering velocity */}
          <div style={SECTION}>
            <div style={LABEL}><Zap style={{ width: 11, height: 11 }} /> Engineering Velocity</div>
            <div style={{ display: "flex", gap: 24 }}>
              <div><div style={{ fontSize: 22, fontWeight: 700, color: "var(--t1)" }}>{r.engineeringVelocity?.prsMerged ?? "—"}</div><div style={{ fontSize: 11, color: "var(--t4)" }}>PRs Merged</div></div>
              <div><div style={{ fontSize: 22, fontWeight: 700, color: "var(--t1)" }}>{r.engineeringVelocity?.deploymentsCompleted ?? "—"}</div><div style={{ fontSize: 11, color: "var(--t4)" }}>Deployments</div></div>
              {r.executionSuccessRate?.rate != null && (
                <div><div style={{ fontSize: 22, fontWeight: 700, color: "var(--p-normal-text)" }}>{r.executionSuccessRate.rate}%</div><div style={{ fontSize: 11, color: "var(--t4)" }}>Execution Success</div></div>
              )}
            </div>
          </div>

          {/* Operational risks */}
          {r.operationalRisks?.length > 0 && (
            <div style={SECTION}>
              <div style={LABEL}><AlertTriangle style={{ width: 11, height: 11 }} /> Operational Risks</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {r.operationalRisks.map((risk, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: risk.probability >= 75 ? "var(--p-critical-text)" : "var(--p-high-text)", flexShrink: 0 }}>{risk.probability}%</div>
                    <div>
                      <div style={{ fontSize: 13, color: "var(--t1)" }}>{risk.prediction}</div>
                      {risk.timeHorizon && <div style={{ fontSize: 11, color: "var(--t4)" }}>{risk.timeHorizon} · {risk.trend}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recommended priorities */}
          {r.recommendedPriorities?.length > 0 && (
            <div style={SECTION}>
              <div style={LABEL}><Target style={{ width: 11, height: 11 }} /> Recommended Priorities</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {r.recommendedPriorities.map((p, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                    <CheckCircle2 style={{ width: 13, height: 13, color: "var(--brand)", flexShrink: 0, marginTop: 1 }} />
                    <div>
                      <div style={{ fontSize: 13, color: "var(--t1)", fontWeight: 500 }}>{p.title}</div>
                      {p.reason && <div style={{ fontSize: 11, color: "var(--t4)" }}>{p.reason}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Verify build**

```bash
cd flow-os-frontend && npm run build 2>&1 | tail -5
```

- [ ] **Step 6: Commit**

```bash
cd .. && git add src/autonomous/weeklyReviewService.js src/routes/autonomousRoutes.js flow-os-frontend/src/components/autonomous/WeeklyReview.jsx
git commit -m "feat(phase19): Weekly Executive Review — velocity, success rate, risks, priorities"
```

---

### Task 10: FLOW Efficiency Metrics

**Files:**
- Modify: `src/analytics/pilotMetrics.js` (add `getEfficiencyMetrics`)
- Modify: `src/routes/autonomousRoutes.js` (add `/efficiency` route)

**Goal:** Track `action.accepted`, `action.dismissed`, `workflow.started`, `workflow.completed` in `pilot_events`. Add `getEfficiencyMetrics(wsId, days)` that returns real rates from those events.

- [ ] **Step 1: Add `getEfficiencyMetrics` to `src/analytics/pilotMetrics.js`**

Open `src/analytics/pilotMetrics.js`. Add this export at the end of the file:

```js
/**
 * FLOW Efficiency — how much work is being completed inside FLOW vs. dismissed.
 * Reads pilot_events WHERE event IN ('action.accepted','action.dismissed','workflow.started','workflow.completed').
 * Plus execution_records for execution success rate.
 */
export async function getEfficiencyMetrics(workspaceId, days = 7) {
  const [eventsRes, execRes] = await Promise.all([
    query(
      `SELECT event, COUNT(*)::int AS n
       FROM pilot_events
       WHERE workspace_id = $1
         AND event IN ('action.accepted','action.dismissed','workflow.started','workflow.completed')
         AND ts > NOW() - ($2::int * INTERVAL '1 day')
       GROUP BY event`,
      [workspaceId, days]
    ),
    query(
      `SELECT status, COUNT(*)::int AS n
       FROM execution_records
       WHERE workspace_id = $1
         AND created_at > NOW() - ($2::int * INTERVAL '1 day')
       GROUP BY status`,
      [workspaceId, days]
    ),
  ]);

  const ev = Object.fromEntries(eventsRes.rows.map(r => [r.event, r.n]));
  const ex = Object.fromEntries(execRes.rows.map(r => [r.status, r.n]));

  const accepted  = ev['action.accepted'] || 0;
  const dismissed = ev['action.dismissed'] || 0;
  const totalShown = accepted + dismissed;
  const acceptanceRate = totalShown > 0 ? Math.round((accepted / totalShown) * 100) : null;

  const wStarted   = ev['workflow.started'] || 0;
  const wCompleted = ev['workflow.completed'] || 0;
  const completionRate = wStarted > 0 ? Math.round((wCompleted / wStarted) * 100) : null;

  const executed = ex['EXECUTED'] || 0;
  const failed   = ex['FAILED'] || 0;
  const totalExec = executed + failed + (ex['PENDING'] || 0) + (ex['DENIED'] || 0);
  const executionSuccessRate = (executed + failed) > 0 ? Math.round((executed / (executed + failed)) * 100) : null;

  return {
    actionsAccepted: accepted,
    actionsDismissed: dismissed,
    acceptanceRate,
    workflowsStarted: wStarted,
    workflowsCompleted: wCompleted,
    workflowCompletionRate: completionRate,
    executionSuccessRate,
    executedTotal: executed,
    failedTotal: failed,
    evidenceSource: 'pilot_events + execution_records',
  };
}
```

- [ ] **Step 2: Add `/efficiency` route to `src/routes/autonomousRoutes.js`**

Add import at the top:
```js
import { getEfficiencyMetrics } from '../analytics/pilotMetrics.js';
```

Add route before `export default router`:
```js
router.get('/efficiency', async (req, res, next) => {
  try {
    const days = Math.min(30, Math.max(1, Number(req.query.days) || 7));
    res.json(await getEfficiencyMetrics(req.tenantId, days));
  } catch (err) { next(err); }
});
```

- [ ] **Step 3: Verify the service**

```bash
node -e "
import('./src/analytics/pilotMetrics.js').then(m =>
  m.getEfficiencyMetrics('workspace_corp_alpha').then(r => {
    console.assert(typeof r.acceptanceRate === 'number' || r.acceptanceRate === null, 'acceptanceRate');
    console.assert(typeof r.executionSuccessRate === 'number' || r.executionSuccessRate === null, 'executionSuccessRate');
    console.log('✅ getEfficiencyMetrics shape correct');
  })
)" 2>&1 | tail -5
```

Expected: `✅ getEfficiencyMetrics shape correct`

- [ ] **Step 4: Commit**

```bash
git add src/analytics/pilotMetrics.js src/routes/autonomousRoutes.js
git commit -m "feat(phase19): FLOW efficiency metrics — acceptance rate, workflow completion, execution success"
```

---

### Task 11: Route Wiring + Sidebar

**Files:**
- Modify: `src/server.js`
- Modify: `flow-os-frontend/src/App.jsx`
- Modify: `flow-os-frontend/src/components/layout/Sidebar.jsx`

- [ ] **Step 1: Mount autonomous routes in `src/server.js`**

Find the block in `src/server.js` that mounts the workday routes (search for `workdayRoutes`). After that block, add:

```js
import autonomousRoutes from './routes/autonomousRoutes.js';
// ...
app.use('/api/autonomous', autonomousRoutes);
```

- [ ] **Step 2: Add lazy imports and routes to `flow-os-frontend/src/App.jsx`**

Add to the lazy import section (after existing lazy imports):
```js
const ChiefOfStaff  = lazy(() => import('./components/autonomous/ChiefOfStaff'));
const WeeklyReview  = lazy(() => import('./components/autonomous/WeeklyReview'));
```

Add routes in the Routes section (add after the `/success` and `/admin/ops` routes):
```jsx
<Route path="/chief"  element={<ChiefOfStaff />} />
<Route path="/review" element={<WeeklyReview />} />
```

- [ ] **Step 3: Add nav items to `flow-os-frontend/src/components/layout/Sidebar.jsx`**

Find the `PRIMARY` array and the `INTEL` array. Add to `PRIMARY` after Inbox:
```js
{ label: "Chief of Staff", path: "/chief",  icon: Star,       badge: null },
```

Add to `INTEL`:
```js
{ label: "Weekly Review",  path: "/review",  icon: TrendingUp, badge: null },
```

Add the missing imports at the top of `Sidebar.jsx`:
```js
import { ..., Star, TrendingUp } from "lucide-react";
```

- [ ] **Step 4: Verify the frontend build**

```bash
cd flow-os-frontend && npm run build 2>&1 | tail -5
```

Expected: build completes without errors.

- [ ] **Step 5: Commit**

```bash
cd .. && git add src/server.js flow-os-frontend/src/App.jsx flow-os-frontend/src/components/layout/Sidebar.jsx
git commit -m "feat(phase19): wire autonomous routes, /chief + /review frontend routes, sidebar nav"
```

---

### Task 12: Validation

**Files:**
- Create: `scripts/validate-phase19.js`

**Goal:** Deterministic in-process validation (~40 assertions, no live server needed).

- [ ] **Step 1: Create `scripts/validate-phase19.js`**

```js
/**
 * Phase 19 — Autonomous Operations Validation
 *   node scripts/validate-phase19.js
 *
 * In-process only — no live server required.
 * Run validate-pilot-journeys.js separately for HTTP journeys.
 */

import { existsSync } from 'node:fs';
import { join }       from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const __dir = fileURLToPath(new URL('..', import.meta.url));
let pass = 0, fail = 0;
const ok = (name, cond) => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else       { fail++; console.log(`  ❌ ${name}`); }
};

async function main() {
  console.log('\n🚀 Phase 19 — Autonomous Operations Validation\n');

  // ── 1. Workflow Templates ──────────────────────────────────────────────────
  console.log('1. workflowTemplates');
  const { getTemplate, listTemplates, TEMPLATE_IDS } = await import('../src/autonomous/workflowTemplates.js');
  ok('TEMPLATE_IDS is array',  Array.isArray(TEMPLATE_IDS));
  ok('at least 5 templates',   TEMPLATE_IDS.length >= 5);
  ok('approve_action exists',  !!getTemplate('approve_action'));
  ok('approve_action has buildSteps', typeof getTemplate('approve_action')?.buildSteps === 'function');
  const tpl = getTemplate('approve_action');
  const steps = tpl.buildSteps({ id: 't1', title: 'Test', raw: { id: 'a1', connectorId: 'github', actionType: 'MERGE_PR' } });
  ok('approve_action buildSteps returns array', Array.isArray(steps) && steps.length > 0);
  ok('step has connector + actionType', !!steps[0]?.connector && !!steps[0]?.actionType);
  const templates = listTemplates();
  ok('listTemplates returns array', Array.isArray(templates));
  ok('each template has id+label+risk', templates.every(t => t.id && t.label && t.risk));
  ok('unknown template returns null', getTemplate('nonexistent_xyz') === null);

  // ── 2. Action Card Service ─────────────────────────────────────────────────
  console.log('2. actionCardService');
  const { buildActionCard, buildActionCards } = await import('../src/autonomous/actionCardService.js');
  const item = {
    id: 'ap-test', type: 'approval', title: 'Approve github MERGE_PR',
    subtitle: 'HIGH risk · 1 approval required',
    owners: ['alice'], participants: [], blocking: 1,
    businessImpact: 'high', department: 'engineering',
    actionRoute: '/inbox', actionLabel: 'Review',
    suggestedActions: [
      { label: 'Approve', workflowId: 'approve_action', risk: 'HIGH', params: { approvalId: '1' } },
      { label: 'Reject',  workflowId: 'reject_action',  risk: 'LOW',  params: { approvalId: '1' } },
    ],
    estimatedImpact: 'Unblocks workflow',
    raw: { id: '1', connectorId: 'github', actionType: 'MERGE_PR' },
  };
  const card = buildActionCard(item);
  ok('card.id matches item.id',         card.id === item.id);
  ok('card.impact is high',             card.impact === 'high');
  ok('card.actions length >= 2',        card.actions.length >= 2);
  ok('first action isPrimary',          card.actions[0].isPrimary === true);
  ok('second action is not primary',    card.actions[1].isPrimary === false);
  ok('first action has steps',          Array.isArray(card.actions[0].steps) && card.actions[0].steps.length > 0);
  ok('evidenceLines is array',          Array.isArray(card.evidenceLines));
  const noActionItem = { ...item, id: 'no-sa', suggestedActions: [] };
  const noActionCard = buildActionCard(noActionItem);
  ok('card always has at least 1 action', noActionCard.actions.length >= 1);
  const cards = buildActionCards([item, noActionItem]);
  ok('buildActionCards returns array',  Array.isArray(cards) && cards.length === 2);

  // ── 3. Memory Personalizer ─────────────────────────────────────────────────
  console.log('3. memoryPersonalizer');
  const { getPreferences } = await import('../src/autonomous/memoryPersonalizer.js');
  const prefs = await getPreferences(`phase19-test-${randomUUID().slice(0,6)}`);
  ok('preferredReviewers array',        Array.isArray(prefs.preferredReviewers));
  ok('frequentDelegatees array',        Array.isArray(prefs.frequentDelegatees));
  ok('approvalHabits object',           typeof prefs.approvalHabits === 'object' && !!prefs.approvalHabits);
  ok('recentlyBlockedConnectors array', Array.isArray(prefs.recentlyBlockedConnectors));
  ok('approvalHabits.avgRiskLevel string', typeof prefs.approvalHabits.avgRiskLevel === 'string');

  // ── 4. Chief of Staff Service ──────────────────────────────────────────────
  console.log('4. chiefOfStaffService');
  const { getChiefOfStaffBriefing } = await import('../src/autonomous/chiefOfStaffService.js');
  const briefing = await getChiefOfStaffBriefing(`phase19-test-${randomUUID().slice(0,6)}`, { id: 'u1', email: 'rahul@test.com', fullName: 'Rahul' });
  ok('greeting is string',              typeof briefing.greeting === 'string' && briefing.greeting.includes('Rahul'));
  ok('topItems array',                  Array.isArray(briefing.topItems));
  ok('topItems <= 5',                   briefing.topItems.length <= 5);
  ok('summary string',                  typeof briefing.summary === 'string' && briefing.summary.length > 0);
  ok('generatedAt ISO string',          typeof briefing.generatedAt === 'string');

  // ── 5. Weekly Review Service ───────────────────────────────────────────────
  console.log('5. weeklyReviewService');
  const { getWeeklyReview } = await import('../src/autonomous/weeklyReviewService.js');
  const review = await getWeeklyReview(`phase19-test-${randomUUID().slice(0,6)}`, { days: 7 });
  ok('window.days === 7',               review.window?.days === 7);
  ok('engineeringVelocity object',      typeof review.engineeringVelocity === 'object');
  ok('prsMerged is number',             typeof review.engineeringVelocity?.prsMerged === 'number');
  ok('executionSuccessRate object',     typeof review.executionSuccessRate === 'object');
  ok('operationalRisks array',          Array.isArray(review.operationalRisks));
  ok('recommendedPriorities array',     Array.isArray(review.recommendedPriorities));
  ok('summary.headline array',          Array.isArray(review.summary?.headline));

  // ── 6. Efficiency Metrics ──────────────────────────────────────────────────
  console.log('6. efficiencyMetrics');
  const { getEfficiencyMetrics } = await import('../src/analytics/pilotMetrics.js');
  const eff = await getEfficiencyMetrics(`phase19-test-${randomUUID().slice(0,6)}`, 7);
  ok('actionsAccepted number',           typeof eff.actionsAccepted === 'number');
  ok('actionsDismissed number',          typeof eff.actionsDismissed === 'number');
  ok('acceptanceRate null or number',    eff.acceptanceRate === null || typeof eff.acceptanceRate === 'number');
  ok('workflowCompletionRate null/num',  eff.workflowCompletionRate === null || typeof eff.workflowCompletionRate === 'number');
  ok('executionSuccessRate null/num',    eff.executionSuccessRate === null || typeof eff.executionSuccessRate === 'number');

  // ── 7. File presence ──────────────────────────────────────────────────────
  console.log('7. File presence');
  const files = [
    'src/autonomous/workflowTemplates.js',
    'src/autonomous/actionCardService.js',
    'src/autonomous/memoryPersonalizer.js',
    'src/autonomous/chiefOfStaffService.js',
    'src/autonomous/weeklyReviewService.js',
    'src/routes/autonomousRoutes.js',
    'flow-os-frontend/src/components/inbox/ActionCard.jsx',
    'flow-os-frontend/src/components/autonomous/ChiefOfStaff.jsx',
    'flow-os-frontend/src/components/autonomous/WeeklyReview.jsx',
    'flow-os-frontend/src/lib/actionCardAdapter.js',
    'docs/AUTONOMOUS_OPERATIONS.md',
    'docs/ACTION_CARD_ARCHITECTURE.md',
    'docs/CHIEF_OF_STAFF.md',
    'docs/OPERATIONAL_INBOX.md',
    'docs/EXECUTION_WORKFLOWS.md',
  ];
  for (const f of files) {
    ok(`${f} exists`, existsSync(join(__dir, f)));
  }

  console.log(`\n${'─'.repeat(44)}`);
  console.log(`Phase 19: ${pass} passed / ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch(err => { console.error(err); process.exit(1); });
```

- [ ] **Step 2: Run the validation script**

```bash
node scripts/validate-phase19.js
```

Expected: all assertions pass. If file-presence checks fail, confirm previous tasks are committed and docs created in Task 13.

- [ ] **Step 3: Commit**

```bash
git add scripts/validate-phase19.js
git commit -m "test(phase19): full validation suite"
```

---

### Task 13: Documentation

**Files:**
- Create: `docs/AUTONOMOUS_OPERATIONS.md`
- Create: `docs/ACTION_CARD_ARCHITECTURE.md`
- Create: `docs/CHIEF_OF_STAFF.md`
- Create: `docs/OPERATIONAL_INBOX.md`
- Create: `docs/EXECUTION_WORKFLOWS.md`
- Modify: `CLAUDE.md` — add Phase 19 section (§25)
- Modify: `docs/PILOT_RUNBOOK.md` — add Chief of Staff + weekly review procedures

- [ ] **Step 1: Create `docs/AUTONOMOUS_OPERATIONS.md`**

```markdown
# FLOW OS — Autonomous Operations (Phase 19)

> Turns FLOW from an intelligence reporter into an operational command center.
> No new AI models, no new databases. Every layer reuses Phase 14–18 systems.

## Goal

A CTO spends an hour inside FLOW and realizes:
- "I barely opened Slack."
- "I barely opened Jira."
- "I barely opened GitHub."
- "I completed my work from one place."

## Architecture

```
Signal Sources → Workday Engine → Action Card Service → OperationalInbox
                                       ↓
                             Chief of Staff Panel (/chief)
                                       ↓
                             Execution Engine (governed)
                                       ↓
                             Audit + Timeline + Notification
```

## What was built

| Component | Location | Description |
|-----------|----------|-------------|
| Signal Collector (enhanced) | `src/workday/signalCollector.js` | Adds failed executions, connector warnings, incidents |
| Workflow Templates | `src/autonomous/workflowTemplates.js` | Named multi-step workflow library |
| Action Card Service | `src/autonomous/actionCardService.js` | WorkItem → ActionCard with 2–4 options |
| Memory Personalizer | `src/autonomous/memoryPersonalizer.js` | Reads execution history for preferences |
| Chief of Staff Service | `src/autonomous/chiefOfStaffService.js` | Top-5 NOW items + greeting |
| Weekly Review Service | `src/autonomous/weeklyReviewService.js` | Engineering velocity + execution success rate + risks |
| Autonomous Routes | `src/routes/autonomousRoutes.js` | `/api/autonomous/*` |
| ActionCard UI | `flow-os-frontend/src/components/inbox/ActionCard.jsx` | Multi-option, risk-aware, inline execution |
| ChiefOfStaff UI | `flow-os-frontend/src/components/autonomous/ChiefOfStaff.jsx` | `/chief` |
| WeeklyReview UI | `flow-os-frontend/src/components/autonomous/WeeklyReview.jsx` | `/review` |

## API

| Route | Description |
|-------|-------------|
| `GET /api/autonomous/chief-of-staff` | Top-5 NOW items + greeting + preferences |
| `GET /api/autonomous/weekly-review?days=7` | Weekly executive review |
| `GET /api/autonomous/templates` | Available workflow templates |
| `GET /api/autonomous/efficiency?days=7` | FLOW efficiency metrics |

## Invariants

- All actions still flow through `executeAction()` — governance never bypassed
- Action Cards never duplicate execution logic — they call `executionApi.execute()` client-side
- Signal sources are best-effort (wrapped in try/catch) — inbox never breaks if a source fails
- NL bridge is best-effort — copilot always returns a response even if plan detection fails
```

- [ ] **Step 2: Create `docs/ACTION_CARD_ARCHITECTURE.md`**

```markdown
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
```

- [ ] **Step 3: Create `docs/CHIEF_OF_STAFF.md`**

```markdown
# Chief of Staff Panel

Route: `/chief`
Backend: `GET /api/autonomous/chief-of-staff`
Service: `src/autonomous/chiefOfStaffService.js`

## What it does

The Chief of Staff panel is the "Good Morning" surface. It:
1. Calls `getWorkQueue(workspaceId, user)` to get the NOW bucket
2. Converts the top 5 items to ActionCards using `buildActionCard()`
3. Reads workspace preferences from `getPreferences()` for personalization
4. Returns a greeting + summary sentence + top 5 cards

## No new reasoning

The Chief of Staff does NOT call the Executive Council or Operational Brain.
It reuses the Workday Engine's deterministic prioritizer. The Council remains
available for deep questions at `/council`.

## Adding to the panel

Add new signal sources to `src/workday/signalCollector.js`. The Chief of Staff
panel will reflect them automatically on the next request.
```

- [ ] **Step 4: Create `docs/OPERATIONAL_INBOX.md`**

```markdown
# Operational Inbox

Route: `/inbox`
Component: `flow-os-frontend/src/components/inbox/OperationalInbox.jsx`

## Signal sources

| Source | Type | Backend |
|--------|------|---------|
| Pending approvals | `approval` | `prisma.pendingApproval` |
| Notifications (merge conflicts, CI failures) | `conflict`, `ci`, etc. | `prisma.notification` |
| Prediction risks | `prediction` | `PredictionEngine.predict()` |
| Failed executions (last 24h) | `execution_failed` | `prisma.executionRecord` WHERE status=FAILED |
| Connector warnings | `connector_warning` | `registry.checkAllHealth()` |
| Recent incidents (last 48h) | `incident` | `orgMemoryService.queryMemory()` |
| Executive recommendations | `recommendation` | `/api/brain/recommendations` |
| Upcoming meetings | `meeting` | `/api/meetings/upcoming` |
| Workday queue (NOW+NEXT) | various | `/api/workday/queue` |

## Item lifecycle

1. Signal source → WorkItem (signalCollector.js)
2. WorkItem + suggestedActions → ActionCard (actionCardService.js / actionCardAdapter.js)
3. User clicks action → executionApi.execute() → governed pipeline
4. Tracking: `action.accepted` or `action.dismissed` in pilot_events

## Invariants

- Inbox never breaks if a signal source fails (all sources are best-effort)
- Every item has at least one action (fallback: "Open" navigation)
- Dismissed items are removed client-side — no server state needed
```

- [ ] **Step 5: Create `docs/EXECUTION_WORKFLOWS.md`**

```markdown
# Execution Workflows

## Multi-step workflow execution

FLOW uses the Phase 14 Execution Engine for all side-effects. A multi-step workflow
is a `Plan` — an ordered list of steps that `executePlan()` runs fault-isolated:
the first failed/blocked step halts the plan and waits for human input.

## Risk tiers

| Tier | Gate | Who approves |
|------|------|-------------|
| LOW | Auto-run | Nobody |
| MEDIUM | Confirm | Requester confirms in FLOW |
| HIGH | 1 approval | Any ADMIN/OWNER |
| CRITICAL | 2 approvals | Two distinct ADMIN/OWNER users |

## Action Card → Execution flow

```
User clicks action button
  → executionApi.execute({ title, steps })
     → POST /api/execution/execute
        → buildPlan(body)
           → executePlan(workspaceId, plan, actor)
              → for each step: runStep() → classifyAction() → decideGate()
                 → if LOW: executeAction() immediately
                 → if MEDIUM: return CONFIRM_REQUIRED → user confirms → re-run
                 → if HIGH/CRITICAL: openApproval() → notify approvers → wait
```

## Built-in workflows

See `src/autonomous/workflowTemplates.js` for the full registry.
Add new workflows there — no other files need to change.
```

- [ ] **Step 6: Update `CLAUDE.md` — add Phase 19 section**

Append to the bottom of `CLAUDE.md`:

```markdown
---

## 25. Autonomous Operations (Phase 19)

> Full reference: [`docs/AUTONOMOUS_OPERATIONS.md`](docs/AUTONOMOUS_OPERATIONS.md)

**Mission:** FLOW should help people finish work, not just tell them what's happening.

`src/autonomous/` — thin orchestration layer, no new AI:
- `workflowTemplates.js` — named multi-step workflow registry (6 templates; add by extending TEMPLATES)
- `actionCardService.js` — `buildActionCard(item)` / `buildActionCards(items)` — WorkItem → ActionCard
- `memoryPersonalizer.js` — `getPreferences(workspaceId)` — reads execution_records for preferences
- `chiefOfStaffService.js` — `getChiefOfStaffBriefing(workspaceId, user)` — top-5 NOW items + greeting
- `weeklyReviewService.js` — `getWeeklyReview(workspaceId, {days})` — extends Phase 17 ROI with velocity/success/risks

**Signal sources (Workday Engine enhanced):** pending approvals · notifications · predictions · failed executions · connector warnings · incidents

**Frontend:** `ActionCard.jsx` (multi-option, inline execution, risk badges) · `ChiefOfStaff.jsx` (`/chief`) · `WeeklyReview.jsx` (`/review`)

**Routes:** `/api/autonomous/chief-of-staff` · `/api/autonomous/weekly-review` · `/api/autonomous/templates` · `/api/autonomous/efficiency`

**NL bridge:** `/api/brain/copilot` detects actionable intent → adds `plan` to response → `BrainMessage.jsx` renders `ExecutableActionCard`

**FLOW Efficiency Metrics:** `getEfficiencyMetrics(wsId, days)` in `pilotMetrics.js` — tracks action.accepted, action.dismissed, workflow.started, workflow.completed

**Invariants:** all actions flow through `executeAction()` (governance never bypassed); signal sources are best-effort (inbox never breaks); NL bridge is best-effort (copilot always returns response)

**Validation:** `scripts/validate-phase19.js` (~40 assertions, no live server needed)
```

- [ ] **Step 7: Update `docs/PILOT_RUNBOOK.md`**

Append to `docs/PILOT_RUNBOOK.md`:

```markdown
---

## Chief of Staff panel

Available at `/chief`. Opens automatically in the sidebar under "Chief of Staff."

The panel shows the most important items right now — approvals, conflicts, risks — with one-click action buttons. Click the primary button on each card to execute the action inside FLOW. A risk badge (LOW/MEDIUM/HIGH/CRITICAL) appears on each button so you know what you're approving before you click.

For HIGH or CRITICAL actions: you will be prompted for approval from an admin. That person will get a notification automatically.

## Weekly Review

Available at `/review`. A structured weekly digest covering:
- Time saved + tasks completed (measured from FLOW records)
- Engineering velocity (PRs merged, deployments)
- Execution success rate
- Operational risks (from AI predictions)
- Recommended priorities

Review this every Monday morning. If "Execution Success Rate" drops below 80%, check the Admin panel for failed executions.
```

- [ ] **Step 8: Run validation one more time to confirm all file-presence checks pass**

```bash
node scripts/validate-phase19.js 2>&1 | tail -10
```

Expected: all assertions pass (file-presence assertions will now find the docs).

- [ ] **Step 9: Commit**

```bash
git add docs/AUTONOMOUS_OPERATIONS.md docs/ACTION_CARD_ARCHITECTURE.md docs/CHIEF_OF_STAFF.md docs/OPERATIONAL_INBOX.md docs/EXECUTION_WORKFLOWS.md CLAUDE.md docs/PILOT_RUNBOOK.md
git commit -m "docs(phase19): AUTONOMOUS_OPERATIONS, ACTION_CARD_ARCHITECTURE, CHIEF_OF_STAFF, OPERATIONAL_INBOX, EXECUTION_WORKFLOWS; update CLAUDE.md + PILOT_RUNBOOK.md"
```

---

## Self-Review

**Spec coverage:**

| Track | Task |
|-------|------|
| T1 Unified Operational Inbox — 9 sources, Priority/Owner/Evidence/Suggested Action/Estimated Impact | Task 1 (signal collector) + Task 6 (ActionCard render) |
| T2 Action Cards — impact, reason, suggested actions | Tasks 2+3+5 |
| T3 Multi-Step Execution — user approves once → workflow runs | Task 5 (ActionCard calls executePlan) |
| T4 AI Chief of Staff — evidence-backed priorities | Task 8 |
| T5 Natural Language Operations | Task 7 |
| T6 Operational Memory — preferred reviewers, habits | Task 4 |
| T7 Weekly Executive Review | Task 9 |
| T8 Work Completion Loop — every item has "what next?" | Tasks 2+5 (every ActionCard always has ≥1 action) |
| T9 FLOW Efficiency — real execution records | Task 10 |
| T10 Validation | Task 12 |
| Docs | Task 13 |

**No placeholders found.**

**Type consistency:** `WorkItem.suggestedActions[].workflowId` matches `TEMPLATE_IDS` in `workflowTemplates.js`. `ActionCard.actions[].steps[]` shape matches `buildPlan()` input shape `{ connector, actionType, payload, title }`. `getEfficiencyMetrics` added to `pilotMetrics.js` and imported in `autonomousRoutes.js`.
