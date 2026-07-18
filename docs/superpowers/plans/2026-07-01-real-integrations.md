# Real Integrations — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Wire three hardcoded-demo frontend components (AIInbox, KnowledgeExplorer, ProjectIntelligence) to their real backend APIs, following the same pattern as Meeting and Engineering capability frontends, and polish IntegrationHub to surface all 5 integration connection flows.

**Architecture:** Each component fetches from a real API endpoint, falls back to demo data if the integration is not configured or the API fails, shows a "Demo mode" indicator when falling back, and exposes a refresh button. No new backend code. WebSocket events via `useWebSocket()` → `{ token, workspaceId, isAuthLoading }`. Auth headers: `{ Authorization: Bearer ${token}, workspace-id: workspaceId }`.

**Tech Stack:** React 18, Vite, Tailwind CSS (design tokens only). Fetch from `/api/communication/*`, `/api/knowledge/*`, `/api/work/*`, `/api/connectors/*`. Lazy-loaded in App.jsx.

## Global Constraints

- **No new backend files** — all changes are in `flow-os-frontend/src/`
- **Design tokens only** — no raw hex values. Use `bg-bg-primary`, `text-text-primary`, `bg-bg-card`, `border-border-flow`, `flow-purple`, `text-text-muted`, `text-success`, `bg-warning`/`text-warning`, `text-destructive`, etc. from `styles/tokens.css`
- **Demo fallback required** on every component — if API call fails or returns empty, load inline demo data; show "Demo mode" chip in subtitle
- **Refresh button required** on every component
- **`useWebSocket()` for auth** — `const { token, workspaceId, isAuthLoading } = useWebSocket()`; all fetch calls include `Authorization: Bearer ${token}` and `workspace-id: workspaceId||'workspace_corp_alpha'`
- **`Promise.allSettled`** for any parallel fetches — never let one failing API break the whole page
- **`npm run lint && npm run build`** must pass after each task — test command is `cd flow-os-frontend && npm run lint 2>&1 | tail -10 && npm run build 2>&1 | tail -6`
- **JSX only** — no `.tsx` files. Component files are `.jsx`
- **No new npm packages** — use only what's already installed
- **Lazy loading preserved** — components are already lazy-loaded in App.jsx; do not change App.jsx
- **Framer-motion and lucide-react** are available as existing deps

---

## File Map

**Modified only:**
- `flow-os-frontend/src/components/inbox/AIInbox.jsx` — wire to Gmail API
- `flow-os-frontend/src/components/knowledge/KnowledgeExplorer.jsx` — wire to Notion + brain graph
- `flow-os-frontend/src/components/projects/ProjectIntelligence.jsx` — add Jira issues tab
- `flow-os-frontend/src/components/platform/IntegrationHub.jsx` — polish connection flows for all 5 integrations

No new files needed.

---

## Task 1: Wire AIInbox to Gmail API

**File:** `flow-os-frontend/src/components/inbox/AIInbox.jsx`

The current component has 185 lines of hardcoded `MOCK_INBOX`. Replace with real Gmail data from `/api/communication/inbox`.

**API shape:**
```
GET /api/communication/inbox?limit=20&provider=gmail
→ { success: true, result: { messages: [...], totalCount: N } }

GET /api/communication/thread/:threadId?provider=gmail
→ { success: true, result: { messages: [...] } }

POST /api/communication/reply/:messageId?provider=gmail
body: { body: "text", provider: "gmail" }

POST /api/communication/send?provider=gmail
body: { to: "...", subject: "...", body: "..." }
```

**Demo fallback data** (use existing MOCK_INBOX, extended to 6 items):

```js
const DEMO_INBOX = [
  {
    id: 'e1',
    from: 'Acme Corp (Client)',
    subject: 'Escalation: Production API Latency',
    priority: 'Critical',
    snippet: 'We are seeing 500ms+ latency on the primary ingestion endpoints.',
    timestamp: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    labels: ['inbox', 'important'],
    threadId: 'thread-001',
    aiSuggestion: 'Acknowledge immediately. Offer a 1-hour update. Reference the DB migration as likely cause.',
  },
  {
    id: 'e2',
    from: 'Sarah Chen',
    subject: 'Re: Design Tokens',
    priority: 'Action Needed',
    snippet: 'I\'ve attached the missing Figma tokens. Can you integrate them today?',
    timestamp: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
    labels: ['inbox'],
    threadId: 'thread-002',
    aiSuggestion: 'Reply confirming timeline. Tokens are already integrated in this sprint.',
  },
  {
    id: 'e3',
    from: 'GitHub Notifications',
    subject: 'Dependabot: Bump react-router-dom',
    priority: 'FYI',
    snippet: 'Bumps react-router-dom from 6.22 to 6.23.',
    timestamp: new Date(Date.now() - 5 * 3600 * 1000).toISOString(),
    labels: ['inbox'],
    threadId: 'thread-003',
    aiSuggestion: 'Low risk. Merge after quick review of changelog.',
  },
  {
    id: 'e4',
    from: 'James K. (CTO)',
    subject: 'Q3 Architecture Review — Your Input Needed',
    priority: 'Action Needed',
    snippet: 'Please prepare a 2-slide summary of our current vector DB strategy for the board.',
    timestamp: new Date(Date.now() - 8 * 3600 * 1000).toISOString(),
    labels: ['inbox', 'important'],
    threadId: 'thread-004',
    aiSuggestion: 'High priority. Reference the pgvector migration doc and Synapse Engine design.',
  },
  {
    id: 'e5',
    from: 'TechStartup Inc.',
    subject: 'Partnership Inquiry — AI Integration',
    priority: 'FYI',
    snippet: 'We are building on top of FLOW\'s API and would love to discuss a partnership.',
    timestamp: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
    labels: ['inbox'],
    threadId: 'thread-005',
    aiSuggestion: 'Forward to business development. Promising enterprise lead.',
  },
  {
    id: 'e6',
    from: 'On-Call Alert',
    subject: 'ALERT: CPU spike on prod-api-03',
    priority: 'Critical',
    snippet: 'CPU utilization at 94% for 5+ minutes. Auto-scaling triggered.',
    timestamp: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    labels: ['inbox', 'important'],
    threadId: 'thread-006',
    aiSuggestion: 'Check ingestion queue backlog. Likely correlation with increased ingest volume.',
  },
];
```

**Component changes:**

```jsx
import { useState, useEffect, useCallback } from "react";
import { Mail, CornerUpLeft, CheckSquare, X, RefreshCw, Wifi, WifiOff } from "lucide-react";
import PageContainer from "../ui/PageContainer";
import Card from "../ui/Card";
import Button from "../ui/Button";
import SourceBadge from "../workfeed/SourceBadge";
import { useWebSocket } from "../../hooks/useWebSocket";

// ... DEMO_INBOX constant ...

function normalizeMessage(msg) {
  return {
    id:           msg.id || msg.messageId,
    from:         msg.from || msg.sender || 'Unknown',
    subject:      msg.subject || '(no subject)',
    snippet:      msg.snippet || msg.body?.slice?.(0, 100) || '',
    timestamp:    msg.timestamp || msg.date || new Date().toISOString(),
    priority:     msg.labels?.includes?.('important') ? 'Action Needed' : 'FYI',
    labels:       msg.labels || [],
    threadId:     msg.threadId || msg.id,
    aiSuggestion: msg.aiSuggestion || null,
  };
}

export const AIInbox = () => {
  const { token, workspaceId, isAuthLoading } = useWebSocket();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isDemo, setIsDemo] = useState(false);
  const [activeDraft, setActiveDraft] = useState(null);
  const [selectedMessage, setSelectedMessage] = useState(null);

  const headers = {
    Authorization: `Bearer ${token}`,
    'workspace-id': workspaceId || 'workspace_corp_alpha',
    'Content-Type': 'application/json',
  };

  const loadInbox = useCallback(async () => {
    if (isAuthLoading) return;
    setLoading(true);
    try {
      const res = await fetch('/api/communication/inbox?limit=20&provider=gmail', { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const msgs = (data.result?.messages || data.result || []).map(normalizeMessage);
      if (msgs.length > 0) {
        setMessages(msgs);
        setIsDemo(false);
      } else {
        setMessages(DEMO_INBOX);
        setIsDemo(true);
      }
    } catch {
      setMessages(DEMO_INBOX);
      setIsDemo(true);
    } finally {
      setLoading(false);
    }
  }, [token, workspaceId, isAuthLoading]);

  useEffect(() => { loadInbox(); }, [loadInbox]);

  // ... rest of the component rendering (keep existing layout, add refresh button and demo indicator)
```

**Layout rules:**
- Keep the existing two-panel layout (message list left, detail/draft right)
- Add a `<Button>` with `<RefreshCw size={14}/>` in the header for refresh
- When `isDemo`, show `<span className="text-xs text-text-muted bg-bg-card border border-border-flow px-2 py-0.5 rounded-full">Demo mode</span>` next to the "AI Inbox" title
- When `loading`, show 4 skeleton rows (gray `animate-pulse` divs of the same shape)
- The "Reply" button should call `POST /api/communication/reply/:messageId` with the draft body — fall back to alert('Sent! (demo)') in demo mode
- Priority chip: "Critical" → `text-destructive`, "Action Needed" → `text-warning`, "FYI" → `text-text-muted`
- AI suggestion panel (shown when message selected): pale purple card with the `aiSuggestion` text. Label it "AI Suggestion"

- [ ] **Step 1: Read the current AIInbox.jsx fully**

- [ ] **Step 2: Rewrite AIInbox.jsx** with the API wiring, demo fallback, normalizeMessage, refresh button, demo mode indicator, loading skeleton, and existing layout preserved

- [ ] **Step 3: Lint + build**

```bash
cd flow-os-frontend && npm run lint 2>&1 | tail -10 && npm run build 2>&1 | tail -6
```

Both must pass.

- [ ] **Step 4: Commit**

```bash
git add flow-os-frontend/src/components/inbox/AIInbox.jsx
git commit -m "feat(ui): wire AIInbox to Gmail API with demo fallback, AI suggestion panel"
```

---

## Task 2: Wire KnowledgeExplorer to Notion + Brain Graph

**File:** `flow-os-frontend/src/components/knowledge/KnowledgeExplorer.jsx`

The current component (338 lines) renders a hardcoded knowledge graph with static NODES/EDGES. Wire it to:
1. `/api/knowledge/documents` — list Notion docs (when Notion is connected)
2. `/api/brain/context/:entityId` — brain entity context for selected nodes
3. `/api/knowledge/search` (POST) — search across Notion docs

**API shapes:**
```
GET /api/knowledge/documents?provider=notion
→ { success: true, result: { documents: [...] } }
  Each document: { id, title, content, type, author, tags, updatedAt }

POST /api/knowledge/search?provider=notion
body: { query: "search term", limit: 10 }
→ { success: true, result: { results: [...] } }

POST /api/brain/copilot
body: { question: "what knowledge exists about X?" }
→ { answer: "..." }
```

**Demo fallback** — use existing NODES/EDGES constants unchanged as fallback

**Component changes:**

Add to the existing component:
1. A `useEffect` that fetches documents from the API and augments the graph with real Notion docs as DOCUMENT type nodes
2. A search bar that calls `POST /api/knowledge/search` and highlights matching nodes
3. A "Demo mode" badge when API is unavailable
4. A refresh button in the header
5. A right panel (shown when a node is selected): shows the document's title, content snippet, tags, and a "View in Notion" link if available
6. An AI brief panel at the bottom: after node selection, calls `/api/brain/copilot` with `"What do we know about {nodeLabel}?"` and shows the answer

**Real document nodes** (merge with existing graph):
```js
function docToNode(doc, idx) {
  return {
    id: doc.id,
    label: doc.title?.slice(0, 25) || 'Document',
    type: 'DOCUMENT',
    x: 600 + (idx % 3) * 120,
    y: 80 + Math.floor(idx / 3) * 100,
    importance: 0.7,
    meta: doc,
  };
}
```

Keep the existing SVG canvas rendering unchanged. Just extend NODES with real doc nodes when API data is available.

**Layout changes:**
- Header: add search input (text), refresh button, demo badge (when isDemo)
- Right panel when node selected: show node label, type badge, AI brief (loading → spinner)
- The existing node detail panel (if any) stays but gets populated with real data

- [ ] **Step 1: Read KnowledgeExplorer.jsx fully** (it's 338 lines)

- [ ] **Step 2: Rewrite KnowledgeExplorer.jsx** with API wiring while preserving the SVG canvas layout

- [ ] **Step 3: Lint + build**

```bash
cd flow-os-frontend && npm run lint 2>&1 | tail -10 && npm run build 2>&1 | tail -6
```

- [ ] **Step 4: Commit**

```bash
git add flow-os-frontend/src/components/knowledge/KnowledgeExplorer.jsx
git commit -m "feat(ui): wire KnowledgeExplorer to Notion API + brain graph with demo fallback"
```

---

## Task 3: Add Jira Issues Tab to ProjectIntelligence

**File:** `flow-os-frontend/src/components/projects/ProjectIntelligence.jsx`

The current component (wired to GitHub in Phase 5.6) shows project cards with GitHub data. Add a Jira integration tab.

**API shapes:**
```
GET /api/work/status?provider=jira
→ { connector: 'jira', authenticated: boolean, health: {...} }

GET /api/work/projects?provider=jira
→ { success: true, result: { projects: [...] } }
  Each project: { id, key, name }

GET /api/work/issues?provider=jira&project=KEY&limit=20
→ { success: true, result: { issues: [...] } }
  Each issue: { id, key, title, type, status, priority, assignee }

GET /api/work/sprints?provider=jira&project=KEY
→ { success: true, result: { sprints: [...] } }
```

**Demo Jira data:**
```js
const DEMO_JIRA = {
  connected: false,
  projects: [
    { id: 'PROJ', key: 'PROJ', name: 'PostgreSQL Migration', issueCount: 12, activeSprintName: 'Sprint 14' },
    { id: 'FLOW', key: 'FLOW', name: 'FLOW Interface Rewrite', issueCount: 8, activeSprintName: 'Sprint 14' },
  ],
  issues: [
    { id: 'PROJ-42', key: 'PROJ-42', title: 'Migrate vector schema to pgvector 0.8', type: 'story', status: 'In Progress', priority: 'High', assignee: 'David O.' },
    { id: 'PROJ-43', key: 'PROJ-43', title: 'Add embedding dimension validation', type: 'task', status: 'To Do', priority: 'Medium', assignee: 'Sarah Chen' },
    { id: 'PROJ-44', key: 'PROJ-44', title: 'Fix: Query timeout on large vector search', type: 'bug', status: 'In Review', priority: 'Critical', assignee: 'James K.' },
    { id: 'FLOW-21', key: 'FLOW-21', title: 'Implement recommendation engine UI', type: 'story', status: 'Done', priority: 'High', assignee: 'Kishore V.' },
    { id: 'FLOW-22', key: 'FLOW-22', title: 'Add dark mode to dashboard', type: 'task', status: 'To Do', priority: 'Low', assignee: 'Unassigned' },
  ],
};
```

**UI change:** The current ProjectIntelligence shows a list of project cards (from GitHub). Add a tab switcher at the top:

```jsx
// Tab switcher
const [activeTab, setActiveTab] = useState('github'); // 'github' | 'jira'

// Tab bar:
<div className="flex gap-2 border-b border-border-flow mb-4">
  <button
    onClick={() => setActiveTab('github')}
    className={`px-4 py-2 text-sm font-medium ${activeTab === 'github' ? 'border-b-2 border-flow-purple text-flow-purple' : 'text-text-muted hover:text-text-primary'}`}
  >
    GitHub
  </button>
  <button
    onClick={() => setActiveTab('jira')}
    className={`px-4 py-2 text-sm font-medium ${activeTab === 'jira' ? 'border-b-2 border-flow-purple text-flow-purple' : 'text-text-muted hover:text-text-primary'}`}
  >
    Jira Issues
  </button>
</div>
```

**Jira issues panel** (shown when `activeTab === 'jira'`):
- Show Jira connection status chip: "Connected" (green) or "Demo mode" (gray)
- Show sprint name if available
- Issue list: for each issue show key + title + type badge + status badge + priority dot + assignee
- Issue status chips: "In Progress" → `text-warning`, "Done" → `text-success`, "To Do" → `text-text-muted`, "In Review" → `text-flow-purple`
- Issue type badges: "bug" → red, "story" → blue, "task" → gray
- A "Connect Jira" button (links to `/platform/integrations`) when not authenticated

**Data fetching for Jira:**
```js
const loadJira = useCallback(async () => {
  if (isAuthLoading) return;
  setJiraLoading(true);
  try {
    const statusRes = await fetch('/api/work/status?provider=jira', { headers });
    const status = await statusRes.json();
    if (!status.authenticated) { setJiraData(DEMO_JIRA); setJiraDemo(true); return; }
    const [projectsRes, issuesRes] = await Promise.allSettled([
      fetch('/api/work/projects?provider=jira', { headers }).then(r => r.json()),
      fetch('/api/work/issues?provider=jira&limit=20', { headers }).then(r => r.json()),
    ]);
    // ... normalize and set jiraData
  } catch {
    setJiraData(DEMO_JIRA); setJiraDemo(true);
  } finally {
    setJiraLoading(false);
  }
}, [token, workspaceId, isAuthLoading, activeTab]);

useEffect(() => { if (activeTab === 'jira') loadJira(); }, [activeTab, loadJira]);
```

- [ ] **Step 1: Read ProjectIntelligence.jsx fully** (understand current GitHub structure)

- [ ] **Step 2: Add Jira tab to ProjectIntelligence.jsx**

- [ ] **Step 3: Lint + build**

```bash
cd flow-os-frontend && npm run lint 2>&1 | tail -10 && npm run build 2>&1 | tail -6
```

- [ ] **Step 4: Commit**

```bash
git add flow-os-frontend/src/components/projects/ProjectIntelligence.jsx
git commit -m "feat(ui): add Jira issues tab to ProjectIntelligence with demo fallback"
```

---

## Task 4: Polish IntegrationHub — All 5 Connection Flows

**File:** `flow-os-frontend/src/components/platform/IntegrationHub.jsx`

The current IntegrationHub fetches `/api/connectors` and `/api/connectors/health` and shows all registered connectors. Enhance it to show a curated card for each of the 5 primary integrations with proper connection status and OAuth/API-key setup instructions.

**Current state:** Shows connector cards from the registry. Already fetches real data.

**Enhancements needed:**
1. Add a "Primary Integrations" section at the top with 5 curated cards
2. Each card shows: integration name, icon, description, connection status badge, and a "Connect" or "Connected ✓" button
3. "Connect" button behavior:
   - Gmail/Calendar: initiate OAuth → `POST /api/connectors/{id}/auth/initiate` with callback URL → open returned `authUrl` in new tab
   - GitHub: show inline form for PAT token → `POST /api/engineering/auth` with `{ token }`
   - Jira: show inline form for email + API token → `POST /api/work/auth` with `{ email, apiKey }`
   - Notion: show inline form for integration token → `POST /api/knowledge/auth` with `{ apiKey }`
4. "Disconnect" button: `POST /api/connectors/{id}/auth/revoke` → refresh status
5. Status from `/api/connectors/health` response

**5 integration definitions:**
```js
const PRIMARY_INTEGRATIONS = [
  {
    id: 'gmail',
    name: 'Gmail',
    description: 'Sync inbox, send replies, AI-powered email intelligence',
    icon: '📧',
    authType: 'oauth',
    statusEndpoint: '/api/communication/status',
    initiateEndpoint: '/api/connectors/gmail/auth/initiate',
    callbackUrl: `${window.location.origin}/api/communication/oauth/callback`,
    capability: 'Communication',
  },
  {
    id: 'google-calendar',
    name: 'Google Calendar',
    description: 'Meeting intelligence, AI prep context, action item tracking',
    icon: '📅',
    authType: 'oauth',
    statusEndpoint: '/api/meetings/status',
    initiateEndpoint: '/api/connectors/google-calendar/auth/initiate',
    callbackUrl: `${window.location.origin}/api/meetings/oauth/callback`,
    capability: 'Meetings',
  },
  {
    id: 'github',
    name: 'GitHub',
    description: 'PR intelligence, deployment risk scores, code search',
    icon: '⚙️',
    authType: 'pat',
    statusEndpoint: '/api/engineering/status',
    authEndpoint: '/api/engineering/auth',
    tokenField: 'token',
    tokenLabel: 'Personal Access Token',
    tokenPlaceholder: 'ghp_...',
    capability: 'Engineering',
  },
  {
    id: 'jira',
    name: 'Jira',
    description: 'Issue tracking, sprint intelligence, workflow automation',
    icon: '🎯',
    authType: 'apikey',
    statusEndpoint: '/api/work/status',
    authEndpoint: '/api/work/auth',
    fields: [
      { key: 'email', label: 'Jira Email', placeholder: 'you@company.com', type: 'email' },
      { key: 'apiKey', label: 'API Token', placeholder: 'ATATT...', type: 'password' },
    ],
    capability: 'Work Management',
  },
  {
    id: 'notion',
    name: 'Notion',
    description: 'Knowledge base sync, document intelligence, graph enrichment',
    icon: '📝',
    authType: 'apikey',
    statusEndpoint: '/api/knowledge/status',
    authEndpoint: '/api/knowledge/auth',
    fields: [
      { key: 'apiKey', label: 'Integration Token', placeholder: 'secret_...', type: 'password' },
    ],
    capability: 'Knowledge',
  },
];
```

**Connect/disconnect logic:**
- For `authType: 'oauth'`: `POST initiateEndpoint { callbackUrl }` → open `res.authUrl` in `window.open()`
- For `authType: 'pat'` or `'apikey'`: show inline form below the card → `POST authEndpoint formValues`
- Disconnect: `POST /api/connectors/{id}/auth/revoke`

**Status badge:** show green "Connected" chip or gray "Not connected" from the individual status endpoints (call them in parallel with `Promise.allSettled`).

**Layout:**
```
┌── Integration Hub ─────────────────────────────────────────────────────────┐
│  [Refresh]                                                                   │
│                                                                              │
│  Primary Integrations                                                        │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐                        │
│  │ 📧 Gmail     │ │ 📅 Calendar  │ │ ⚙️ GitHub    │                        │
│  │ Connected ✓  │ │ Not connected│ │ Not connected│                        │
│  │ [Manage]     │ │ [Connect]    │ │ [Connect]    │                        │
│  └──────────────┘ └──────────────┘ └──────────────┘                        │
│  ┌──────────────┐ ┌──────────────┐                                          │
│  │ 🎯 Jira     │ │ 📝 Notion   │                                           │
│  │ Not connected│ │ Not connected│                                           │
│  │ [Connect]    │ │ [Connect]    │                                           │
│  └──────────────┘ └──────────────┘                                          │
│                                                                              │
│  All Connectors (existing registry view below)                               │
└──────────────────────────────────────────────────────────────────────────────┘
```

- [ ] **Step 1: Read IntegrationHub.jsx fully**

- [ ] **Step 2: Rewrite IntegrationHub.jsx** with the 5-card primary section + inline forms + status fetching

- [ ] **Step 3: Lint + build**

```bash
cd flow-os-frontend && npm run lint 2>&1 | tail -10 && npm run build 2>&1 | tail -6
```

- [ ] **Step 4: Commit**

```bash
git add flow-os-frontend/src/components/platform/IntegrationHub.jsx
git commit -m "feat(ui): polish IntegrationHub with 5-integration connection flows (Gmail, Calendar, GitHub, Jira, Notion)"
```

---

## Completion Criteria

- [ ] AIInbox fetches `/api/communication/inbox` with demo fallback, refresh button, demo mode indicator
- [ ] KnowledgeExplorer fetches `/api/knowledge/documents` + merges with brain graph data, preserves SVG canvas
- [ ] ProjectIntelligence has working GitHub tab (existing) + Jira issues tab (new) with tab switcher
- [ ] IntegrationHub shows 5 curated integration cards with status + connect/disconnect flows
- [ ] `cd flow-os-frontend && npm run lint && npm run build` passes after ALL 4 tasks
- [ ] No raw hex values introduced
- [ ] No new npm packages added
- [ ] Demo fallbacks work when no backend is running
