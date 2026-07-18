# FLOW OS — Component Library
**Document:** 18 of 20  
**Status:** Authoritative  
**Last updated:** 2026-07-18

---

## Component Philosophy

Components in FLOW follow four rules:

1. **One responsibility.** A component does one thing. `DecisionCard` shows a decision. `EvidencePanel` shows evidence. They do not share each other's responsibilities.

2. **No page-specific logic inside components.** Components receive data via props. They do not make API calls unless they are page-level orchestrators. `ActionCard` does not know what route it is on.

3. **Consistent props interface.** Components that do similar things accept similar props. `ExecutiveHero` and `DecisionCard` both accept `situation`, `recommendation`, `impact`. New components that show status must accept these same fields.

4. **Explicit empty states.** Every component that can render a list must render an explicit, designed empty state — not null, not a blank div.

---

## Decision Components

### DecisionCard
**File:** `src/components/decisions/DecisionCard.jsx`  
**Purpose:** The atomic unit of decision-making in FLOW. One card = one decision.

**Props:**
```js
{
  card: {
    id: string,
    type: string,           // 'approval' | 'merge_conflict' | 'prediction' | etc.
    source: string,         // 'GitHub' | 'Jira' | 'Slack' etc.
    situation: string,      // 5–8 word title
    description: string,    // 2–3 sentences
    recommendation: string, // 1 sentence
    impact: 'critical' | 'high' | 'medium' | 'low',
    impactLabel: string,    // "Blocks 3 engineers"
    primaryAction: { label, workflowId, risk },
    secondaryActions: [{ label, workflowId, risk }],
    evidence: [{ source, text, at }],
    createdAt: string,
  },
  onAction: (actionType, card) => void,
  onExpand: (card) => void,
}
```

**States:** default · executing · success · failed · requires-approval · denied

**Variants:** compact (homepage), standard (inbox), expanded (slide-over)

---

### DecisionStream
**File:** `src/components/decisions/DecisionStream.jsx`  
**Purpose:** An ordered list of DecisionCards.

**Props:**
```js
{
  cards: Card[],
  maxCards: number,        // default 5
  loading: boolean,
  emptyMessage: string,
  onAction: (actionType, card) => void,
}
```

**States:** loading (skeleton cards), empty (custom message), populated

---

### DecisionSlideOver
**File:** `src/components/decisions/DecisionSlideOver.jsx`  
**Purpose:** Universal right-side action panel. Opens on card click. Never navigates away.

**Props:**
```js
{
  card: Card,
  isOpen: boolean,
  onClose: () => void,
  onComplete: (result) => void,
}
```

**Layout (420px right panel, full viewport height):**
```
[×] Situation title                      [source badge]
────────────────────────────────────────────────────────
SITUATION
[2–3 sentence description]
────────────────────────────────────────────────────────
RISK          PEOPLE INVOLVED
Medium        Rahul · Alice · Marcus
────────────────────────────────────────────────────────
RECOMMENDED ACTION
[AI recommendation, 1–2 sentences]
────────────────────────────────────────────────────────
▶ Evidence   (collapsed by default, EvidencePanel)
────────────────────────────────────────────────────────
ActionBar: [Primary]   [Secondary]   [Tertiary]
```

**Behavior:** Backdrop `rgba(31,27,22,0.25)`. Escape or backdrop click closes. Enter key confirms primary action (if focused on primary button).

---

### ExecutiveHero
**File:** `src/components/decisions/ExecutiveHero.jsx`  
**Purpose:** Page-level context header. Tells the user what this page is showing right now.

**Props:**
```js
{
  situation: string,   // "3 approvals waiting · 1 merge conflict"
  priority: string,    // "PR #447 is blocking Release 2.5"
  primaryAction: { label, onClick },
  status: 'critical' | 'warning' | 'nominal',
  loading: boolean,
}
```

**Layout (140px fixed top):**
```
[status dot]  Situation text
              Priority detail
              [Primary Action Button]
```

**Appears on:** Home, Inbox, Engineering, Meetings (minimum — ideally all primary pages)

---

### EvidencePanel
**File:** `src/components/decisions/EvidencePanel.jsx`  
**Purpose:** Collapsible evidence list. Shows sources. Collapsed by default.

**Props:**
```js
{
  evidence: Array<{
    source: string,   // 'GitHub', 'Slack', etc.
    text: string,     // evidence text (never "found N records")
    at: string,       // ISO timestamp
    authority: float, // 0–1, used to order by authority
  }>,
  defaultOpen: boolean,  // default: false
}
```

**Collapsed state:** `▶ 3 sources`  
**Expanded state:** list of evidence items with source badge + text + timestamp  
**Empty state:** never renders if evidence is empty (component returns null)

---

### ActionBar
**File:** `src/components/decisions/ActionBar.jsx`  
**Purpose:** 2–3 contextual action buttons. Appears after AI responses and on cards.

**Props:**
```js
{
  actions: Array<{
    label: string,
    onClick: () => void,
    risk: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL',
    variant: 'primary' | 'secondary' | 'ghost',
    loading: boolean,
    disabled: boolean,
  }>,
}
```

**Risk badge:** HIGH and CRITICAL actions show a risk badge next to the button label.

---

## Command Components

### StickyCommandCenter
**File:** `src/components/command/StickyCommandCenter.jsx`  
**Purpose:** Always-present AI console. Global. Mounted in LayoutShell.

See `08_COMMAND_CENTER.md` for full specification.

**Props:** None. Reads route from `useLocation()` for context-aware suggestions.

---

### CommandPalette
**File:** `src/components/ui/CommandPalette.jsx`  
**Purpose:** ⌘K navigation and action palette.

**Props:**
```js
{
  isOpen: boolean,
  onClose: () => void,
}
```

---

## Trust Center Components

### TrustCenter
**File:** `src/components/integrations/TrustCenter.jsx`  
**Purpose:** Overview of all connected sources and their inclusion ratios.

**Props:** None. Fetches data internally from `/api/integration-permissions`.

**Renders:** Connector rows + ConnectorPanel on click

---

### ConnectorPanel
**File:** `src/components/integrations/ConnectorPanel.jsx`  
**Purpose:** Per-connector resource governance (two-column layout).

**Props:**
```js
{
  connectorId: string,
  onBack: () => void,
}
```

**Renders:** Two-column layout: FLOW CAN SEE / FLOW CANNOT SEE, ResourceToggle rows, bulk actions

---

### ResourceToggle
**File:** `src/components/integrations/ResourceToggle.jsx`  
**Purpose:** Individual resource row with inclusion toggle.

**Props:**
```js
{
  resource: {
    id: string,
    name: string,
    type: string,     // 'calendar' | 'repository' | 'channel' | etc.
    status: 'ALLOWED' | 'HIDDEN',
    lastSynced: string | null,
  },
  onChange: (resourceId, newStatus) => void,
  loading: boolean,
}
```

---

## Execution Components

### ExecutableActionCard
**File:** `src/components/execution/ExecutableActionCard.jsx`  
**Purpose:** ActionCard with full execution pipeline integration.

**Props:**
```js
{
  action: {
    id, title, description, riskLevel, connector, actionType, params,
    primaryOption: { label, workflowId },
    options: [{ label, workflowId, risk }],
  },
  workspaceId: string,
  onComplete: (result) => void,
}
```

**States:** default · confirming · awaiting-approval · executing · success · failed · denied

---

### MergeConflictCard
**File:** `src/components/execution/MergeConflictCard.jsx`  
**Purpose:** Conflict-specific ActionCard with file list and owner actions.

**Props:**
```js
{
  conflict: {
    id, prNumber, prTitle, repo,
    conflictingFiles: [{ filename, conflicts }],
    owners: [{ name, email, role }],
    blockingPeople: number,
    relatedRelease: string | null,
  },
  onAction: (type) => void,
}
```

**Actions:** Open Diff, Open PR, Message Owner, Create Meeting

---

## AI Brain Components

### BrainMessage
**File:** `src/components/brain/BrainMessage.jsx`  
**Purpose:** Renders a single FLOW response message.

**Message structure enforced:**
1. Executive Summary (1–3 sentences, bold lead sentence)
2. Key Insights (max 3 bullets)
3. Recommended Actions (ActionBar)
4. Evidence (EvidencePanel, collapsed)
5. Related prompts

**Client-side filters applied before rendering:**
- `humanizeDebugText()` — removes "found N records", "based on N chunks" etc.
- `citationSources()` — extracts unique source labels for citation display
- Confidence scores stripped — never displayed

**Inline card rendering:**
- `InlinePRCard` — for PR references in messages
- `InlineMeetingCard` — for meeting references
- `InlineApprovalCard` — for approval references
- `InlineMetricCard` — for metric data in messages
- `ExecutableActionCard` — for actionable items in messages
- `MergeConflictCard` — for conflict references

---

## Layout Components

### LayoutShell
**File:** `src/components/layout/LayoutShell.jsx`  
**Purpose:** Root application shell. Mounts global providers and global UI.

**Structure:**
```
WebSocketProvider
  ToastProvider
    LayoutInner
      Sidebar (col 1)
      Main content area (col 2)
      LiveFeedPanel (col 3, toggleable)
      GlobalOverlays:
        CommandPalette
        ShortcutModal
        EntityContextPanel
        CreateJiraModal
        ToastContainer
        StickyCommandCenter   ← must be added
        ⌘N Note modal
        ⌘E Email compose modal
```

---

### Sidebar
**File:** `src/components/layout/Sidebar.jsx`  
**Purpose:** Primary navigation. All capabilities discoverable here.

**Must expose:**
- PRIMARY group (5 items): Home, Inbox, Engineering, Meetings, Knowledge
- INTELLIGENCE group (5 items): Chief of Staff, Weekly Review, People, Customers, Executive Council
- PLATFORM group (4 expandable): Integrations, Workspace, AI, System

See `05_NAVIGATION.md` for complete nav structure.

---

### LiveFeedPanel
**File:** `src/components/layout/LiveFeedPanel.jsx`  
**Purpose:** Real-time company events feed (column 3).

**Toggle:** `⌘\`. Defaults open on viewport ≥ 1280px.  
**Content:** Filtered WebSocket events (company-relevant only, via `isIntegrationEvent()`)

---

## Notification Components

### NotificationDropdown
**File:** `src/components/notifications/NotificationDropdown.jsx`  
**Purpose:** Bell icon + dropdown of recent notifications.

**Data:** `GET /api/notifications` + WebSocket `NOTIFICATION_CREATED` events

---

### Toast / FlowToast
**File:** `src/components/ui/FlowToast.jsx`  
**Purpose:** Transient in-app notifications.

**Types:** info · success · warning · critical  
**Duration:** 5s auto-dismiss (critical: manual dismiss)  
**Position:** top-right  
**Dedup:** Does not show the same notification twice in 30s

---

## Form Components

### ConversationInput
**File:** (inline in BrainHome.jsx)  
**Purpose:** Multi-line text input for brain conversation.

**Props:**
```js
{
  value: string,
  onChange: (val) => void,
  onSubmit: () => void,
  placeholder: string,
  contextChips: string[],   // displayed above input
  disabled: boolean,
  loading: boolean,         // shows streaming indicator
}
```

---

## Data Display Components

### MetricCard
**File:** `src/components/ui/MetricCard.jsx`  
**Purpose:** Display a single metric with label, value, and trend.

**Props:** `{ label, value, trend: '+12%' | '-5%', trendDirection: 'up' | 'down' | 'neutral' }`

---

### SkeletonCard
**File:** `src/components/ui/Skeleton.jsx`  
**Purpose:** Loading placeholder for card-shaped content.

**Variants:** card (1-column), row (inline), hero (large)

---

### StatusDot
**File:** `src/components/ui/StatusDot.jsx`  
**Purpose:** 10px colored status indicator.

**Props:** `{ status: 'healthy' | 'degraded' | 'down' | 'connected' | 'disconnected' }`

---

### RiskBadge
**File:** `src/components/ui/RiskBadge.jsx`  
**Purpose:** Colored badge for risk levels.

**Props:** `{ level: 'critical' | 'high' | 'medium' | 'low' }`

---

### Toggle
**File:** `src/components/ui/Toggle.jsx`  
**Purpose:** Boolean switch control.

**Props:** `{ enabled: boolean, onChange: (bool) => void, disabled: boolean, loading: boolean }`

---

## AICopilot (Floating)
**File:** `src/components/ui/AICopilot.jsx`  
**Purpose:** Global floating copilot, page and entity aware.

This component predates the StickyCommandCenter. When StickyCommandCenter is fully implemented, AICopilot functionality is absorbed into it. Until then, AICopilot handles the contextual AI input.

---

## Component Deprecation Schedule

| Component | Status | Replaced by |
|---|---|---|
| `ConversationInput` (inline in BrainHome) | Active | Remains in /brain only; StickyCommandCenter is global |
| `RecommendationEngine.jsx` | Deprecated | DecisionStream + ActionCard |
| `actionCenterAdapter.js` | Deprecated | `actionCardService.buildActionCards()` (backend) |
| `ActionCenter.jsx` | Deprecated | DecisionSlideOver |
| `button.tsx` | Isolated legacy | Do not create more `.tsx` files |
| Old inline styles in legacy components | Active debt | Migrate to design tokens |
