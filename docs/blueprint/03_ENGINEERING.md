# Blueprint: Engineering — `/projects`
**Document:** BP-03  
**Last updated:** 2026-07-18  
**Status:** Authoritative

---

## Purpose

Answer one question: **"What is blocking the release?"**

Engineering is the live dashboard for engineering velocity. It surfaces PRs at risk, deployment status, merge conflicts, and contributors who need unblocking. Its primary action is reviewing or approving the highest-risk PR.

---

## Target User

**Primary:** CTO, VP Engineering, Engineering Manager  
**Secondary:** Senior Engineers on-call for reviews  
**Frequency:** Multiple times per day during active sprints

---

## Entry Points

| Source | How |
|---|---|
| Sidebar | "Engineering" item (PRIMARY group, position 3) |
| `⌘K` → "Go to Engineering" | CommandPalette |
| `⌘E` shortcut | Global (opens Engineering) |
| MergeConflictCard action | From Home or Inbox |
| AI response | FLOW Brain surfacing a PR risk |
| Direct URL | `/projects` |

---

## Layout Hierarchy

```
┌─────────────────────────────────────────────────────────────────┐
│ Sidebar (220px)                                                 │
├──────────────────────────────────────────────┬──────────────────┤
│                                              │                  │
│  PageHeader (60px)                           │  LiveFeed        │
│  Engineering  [Demo mode · connected badge]  │  (260px)         │
│  [Refresh ↺]  [Connect GitHub]               │                  │
│  ──────────────────────────────────────────  │                  │
│  ExecutiveHero                               │                  │
│  "2 PRs at risk · 1 merge conflict"          │                  │
│  ──────────────────────────────────────────  │                  │
│  RepoSelector  [repo tabs or dropdown]       │                  │
│  ──────────────────────────────────────────  │                  │
│  2-column grid:                              │                  │
│  ┌────────────────┐  ┌──────────────────┐   │                  │
│  │  PRAtRisk      │  │  MergeConflicts  │   │                  │
│  │  (list, ≤5)   │  │  (list, ≤3)      │   │                  │
│  └────────────────┘  └──────────────────┘   │                  │
│  ──────────────────────────────────────────  │                  │
│  RecentCommits  (collapsed, max 10)          │                  │
│  ──────────────────────────────────────────  │                  │
│  Deployments   (collapsed, max 5)            │                  │
│                                              │                  │
│  [StickyCommandCenter]                       │                  │
└──────────────────────────────────────────────┴──────────────────┘
```

---

## Information Hierarchy

```
Level 1  ExecutiveHero — "N PRs at risk · N merge conflicts"
Level 2  PRs at risk — merge readiness < 50 or changes requested (actionable)
Level 3  Merge Conflicts — active conflicts with owners
Level 4  Recent Commits — last 10, collapsed
Level 5  Deployments — last 5 by environment, collapsed
Level 6  StickyCommandCenter
```

---

## Components

| Component | File | Notes |
|---|---|---|
| `ExecutiveHero` | `components/decisions/ExecutiveHero.jsx` | |
| `ProjectIntelligence` | `components/projects/ProjectIntelligence.jsx` | Page orchestrator |
| `PRCard` | Inline in ProjectIntelligence | PR with merge readiness score |
| `MergeConflictCard` | `components/execution/MergeConflictCard.jsx` | Files + owners + actions |
| `CommitRow` | Inline | Compact commit with author + message |
| `DeploymentCard` | Inline | Deployment with risk score |
| `RiskBadge` | `components/ui/RiskBadge.jsx` | On At Risk PRs |
| `StatusDot` | `components/ui/StatusDot.jsx` | Deployment health |
| `DecisionSlideOver` | `components/decisions/DecisionSlideOver.jsx` | PR detail panel |

---

## Data Sources

| Data | Source | Refresh |
|---|---|---|
| Connection status | `GET /api/engineering/status` | On mount |
| Repository list | `GET /api/engineering/repos` | On mount |
| Pull requests | `GET /api/engineering/repos/:owner/:repo/pulls?state=open` | On mount, per repo |
| Commits | `GET /api/engineering/repos/:owner/:repo/commits` | On mount |
| Deployments | `GET /api/engineering/repos/:owner/:repo/deployments` | On mount |
| Merge conflicts | `GET /api/collaboration/conflicts` | On mount + WS `MERGE_CONFLICT_DETECTED` |

**Concurrency:** Fetch repos first, then parallel fetch PRs + commits for the top 5 repos via `Promise.allSettled()`.

---

## Repo Selector

When multiple repos exist:
- Tab-style selector at the top, scrollable if > 5 repos
- First tab: "All repos" — aggregated view (default)
- Each tab: repo short name (e.g., `flow-backend`)
- Active tab: `background: var(--surface-1)`, bottom border `var(--accent)` 2px
- Max visible tabs: 5; overflow in a `[+N more ▾]` dropdown

---

## PR Card Layout

```
[risk badge: At Risk / On Track]  PR #447 — feat: add pgvector index
[author avatar]  Rahul Kumar · opened 3 days ago · main ← feature/pgvector

Merge Readiness: 34/100
[──────▓▓▓▓▓▓────────────] 34%

Reviews: 1 approved · 1 changes requested
Checks: 3 passing · 1 failing

[Review PR]   [Ask FLOW about this]
```

**Merge Readiness Score colors:**
- 0–49: `var(--status-critical)` — At Risk
- 50–79: `var(--status-warning)` — Needs attention
- 80–100: `var(--status-healthy)` — Ready to merge

---

## Merge Conflict Card Layout

Identical to `MergeConflictCard.jsx` component spec:

```
[⚠] Merge Conflict — auth.js, middleware.js
    Blocking 2 engineers · feat/oauth-flow ← main

    CONFLICTING FILES
    auth.js      3 conflicts
    middleware.js  1 conflict

    OWNERS
    Rahul Kumar (auth)  · Kishore Varma (middleware)

[Open Diff]  [Open PR]  [Message Owner]  [Create Meeting]
```

Actions:
- **Open Diff** → GitHub diff URL in new tab
- **Open PR** → GitHub PR in new tab  
- **Message Owner** → Opens email compose with pre-filled content
- **Create Meeting** → `POST /api/meetings/create` with attendees pre-filled

---

## AI Behavior

### ExecutiveHero
Text generated from workspace cache snapshot: `"2 PRs are At Risk. Release 2.5 blocked until PR #447 and PR #523 are resolved."`

### Merge Readiness AI Recommendation
Each PR card carries an AI `recommendation` field from `GitHubAdapter`:
- Merge-ready: `"PR #447 has 2 approvals and passing CI. Safe to merge."`
- Not ready: `"PR #523 has an unresolved review from Alice. Request clarification before merging."`

These are generated deterministically from the merge readiness score + review state. No Gemini call per PR — computed in the adapter.

### FLOW Brain via Command Center
Engineering-specific suggestions:
```
SUGGESTED:
  "What's blocking Release 2.5?"
  "Which PRs need my review?"
  "Summarize today's engineering activity"
  "Show me the riskiest deployment this week"
```

---

## Command Center Behavior

When a PR card is focused or the PR detail is open:
```
ACTIVE CONTEXT: PR #447 — feat: add pgvector index
SUGGESTED:
  "Should I merge this PR?"
  "Who should review this?"
  "What's the risk of merging to production now?"
  "Compare this branch to main"
```

---

## GitHub Not Connected State

When `GET /api/engineering/status` returns `connected: false`:

```
[PageHeader with "Demo mode" badge]

[ExecutiveHero — nominal — "Showing sample engineering data"]

[Sample PRs, commits, deployments — clearly marked demo]

Banner (top of content):
┌─────────────────────────────────────────────────────────────┐
│ Showing sample data — connect GitHub to see your real       │
│ engineering intelligence.           [Connect GitHub →]      │
└─────────────────────────────────────────────────────────────┘
```

The `[Connect GitHub →]` button:
1. Calls `POST /api/connectors/github/auth/initiate`
2. Shows a modal: "Enter your GitHub Personal Access Token" (PAT input, password field)
3. Submits to `POST /api/engineering/auth`
4. On success: full-page refresh to load real data

---

## PR Detail (DecisionSlideOver)

Opens when "Review PR" is clicked on a PR card.

```
[×] PR #447 — feat: add pgvector index    [At Risk]
─────────────────────────────────────────────────────
MERGE READINESS: 34/100
BRANCH: feature/pgvector → main
AUTHOR: Rahul Kumar  OPENED: 3 days ago

REVIEWS
  ✓ Alice Chen — Approved
  ✗ Marcus Wong — Changes requested
    "The index creation needs a migration guard."

CHECKS
  ✓ build (2m 14s)
  ✓ lint (45s)
  ✓ unit tests (1m 08s)
  ✗ integration tests (Failed: 2 tests)

AI RECOMMENDATION
[recommendation text]

▶ Related commits (3)
▶ Files changed (12)
─────────────────────────────────────────────────────
[Approve PR]  [Request changes]  [Open in GitHub]
```

---

## Loading State

Page skeleton:
```
[Header skeleton: ████████████]
[Hero skeleton: ████████████████████ ████]
[Repo tabs: 3 tab skeletons]
[2-column: PR card skeletons (2) + Conflict card skeleton (1)]
[Commits skeleton: 5 row stubs]
```

Skeletons use `SkeletonCard` variant `card`.

---

## Empty State

**GitHub connected, no PRs:**
```
[Engineering icon, 40px, var(--t4)]
No open pull requests.
Your team is up to date.

[Sync latest activity →]  [Ask FLOW about your repos]
```

**GitHub connected, no merge conflicts:**
The conflicts section renders a simple line: `"No active merge conflicts."` — no empty state component needed.

---

## Error State

**GitHub API rate limit hit:**
- Banner: `"GitHub API rate limit reached. Data may be stale. Resets in [N] minutes."`
- Last fetched data is shown with a `"[stale]"` badge on each card timestamp

**GitHub token expired:**
- Banner: `"GitHub token expired. Re-authenticate to restore engineering intelligence."`
- `[Re-authenticate →]` button → PAT input modal

---

## Navigation Paths

| From Engineering | To |
|---|---|
| `[Open in GitHub]` on PR | GitHub URL, new tab |
| `[Open Diff]` on conflict | GitHub diff URL, new tab |
| `[Create Meeting]` on conflict | Creates meeting via Calendar API |
| `[Message Owner]` on conflict | Opens email compose via Gmail API |
| AI suggestion click | StickyCommandCenter with pre-filled query |

---

## Keyboard Shortcuts

| Key | Action |
|---|---|
| `⌘E` | Go to Engineering (global) |
| `↓` / `↑` | Navigate between PR cards |
| `Enter` | Open DecisionSlideOver for focused PR |
| `A` | Approve focused PR |
| `G` | Open focused PR in GitHub (new tab) |
| `R` | Refresh data |
| `Escape` | Close DecisionSlideOver |
| `⌘/` | Focus StickyCommandCenter |

---

## Accessibility

- `<main>` landmark on content area
- `<section aria-label="Pull Requests at Risk">` and `<section aria-label="Merge Conflicts">`
- PR cards: `role="article"`, `aria-label="PR #{number}: {title}, merge readiness {score}%"`
- Merge readiness bar: `role="progressbar"`, `aria-valuenow="{score}"`, `aria-valuemin="0"`, `aria-valuemax="100"`, `aria-label="Merge readiness"`
- Review status: communicated as text, not color alone (`"Changes requested"`, not just a red dot)
- DecisionSlideOver: `role="dialog"`, `aria-modal="true"`, focus trap

---

## Responsive Behavior

| Viewport | Behavior |
|---|---|
| ≥1280px | 2-column PR/Conflict grid + LiveFeed |
| 1024px–1279px | 2-column grid, LiveFeed closed |
| 768px–1023px (tablet) | Single column; PRs and conflicts stack vertically |

---

## Telemetry Events

| Event | Trigger | Properties |
|---|---|---|
| `engineering.viewed` | Page mount | `{ connected, repoCount, prAtRiskCount, conflictCount }` |
| `engineering.pr.viewed` | PR detail opened | `{ prNumber, mergeReadiness, impact }` |
| `engineering.pr.approved` | Approve PR clicked | `{ prNumber, riskLevel }` |
| `engineering.conflict.action` | Conflict action clicked | `{ conflictId, action }` |
| `engineering.github.connected` | GitHub PAT submitted | `{}` |
| `engineering.demo.viewed` | Demo mode viewed | `{}` |
| `engineering.repo.switched` | Repo tab changed | `{ repo }` |

---

## Acceptance Criteria

- [ ] When GitHub is not connected, demo data renders with correct banner and Connect button.
- [ ] PRs with merge readiness < 50 are marked "At Risk" with `var(--status-critical)` badge.
- [ ] Merge readiness progress bar shows correct value with correct color.
- [ ] MergeConflictCard renders files, owners, and 4 action buttons.
- [ ] PR detail (DecisionSlideOver) shows reviews, checks, AI recommendation, and correct action buttons.
- [ ] Approve PR flows through governance (risk tier = HIGH, requires 1 ADMIN/OWNER).
- [ ] Repo selector tabs work; "All repos" aggregates across top 5 repos.
- [ ] GitHub token expiry shows the re-auth banner and opens PAT input on click.
- [ ] Commits and Deployments sections are collapsed by default; expand correctly.
- [ ] All keyboard shortcuts work.
- [ ] Demo mode badge visible when GitHub not connected; clears after connection.
- [ ] All telemetry events fire at correct triggers.
