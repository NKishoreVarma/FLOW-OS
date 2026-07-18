# Blueprint: Loading States — All Pages
**Document:** BP-16  
**Last updated:** 2026-07-18  
**Status:** Authoritative

---

## Design Principles

1. **Show structure immediately.** Skeletons take the shape of the real content.
2. **Never show a spinner alone** unless an action is executing (see action execution state).
3. **8-second rule.** If data has not arrived within 8 seconds, show the demo fallback with a banner.
4. **Instant navigation.** Navigation between pages should feel instant — skeletons replace content immediately, never a blank white screen.
5. **Stagger intelligently.** Above-the-fold content loads first; below-the-fold deferred.
6. **No "Loading..." text** unless inside an action button or explicit progress step.

---

## Skeleton Component Variants

All skeletons use `var(--skeleton-base)` and `var(--skeleton-highlight)` CSS vars with shimmer animation:

```css
--skeleton-base: rgba(31, 27, 22, 0.06);
--skeleton-highlight: rgba(31, 27, 22, 0.10);
animation: skeleton-shimmer 1.5s ease-in-out infinite;
```

| Variant | Dimensions | Usage |
|---|---|---|
| `card` | auto height, full width | ActionCard, CustomerCard |
| `row` | 60px height, full width | Entity rows, member rows |
| `hero` | 120px height, full width | ExecutiveHero blocks |
| `text-line` | 14px height, variable width | Text lines within a card |
| `avatar` | 32px × 32px circle | Person avatars |
| `chart` | 100px height, full width | Graphs, charts |
| `dot` | 8px × 8px circle | Status dots |
| `badge` | 20px height, 60px width | Status badges |

---

## Page: Home (`/`)

```
[Hero skeleton: 120px, full width]
═════════════════════════════════════════════════

[Section label: NOW — text, 11px, 150ms delayed]
[Card skeleton: 140px] ← appears at 0ms
[Card skeleton: 120px] ← appears at 50ms
[Card skeleton: 120px] ← appears at 100ms

[Section label: NEXT — 150ms delayed]
[Collapsed section label skeleton]

LiveFeed:
[Event row skeleton × 4]
```

Timeline: data expected ≤ 2s from WIC cache. At 8s: demo fallback.

---

## Page: Inbox (`/inbox`)

```
[FilterBar: visible immediately, no skeleton]

[ActionCard skeleton: 140px]
[ActionCard skeleton: 120px]
[ActionCard skeleton: 120px]
[ActionCard skeleton: 100px]

(Right panel empty until item selected)
```

Data: parallel fetch from approvals + notifications + predictions. Uses `Promise.allSettled()` — partial data renders as it arrives.

---

## Page: Engineering (`/projects`)

```
[RepoSelector tabs: visible with "Loading..." if no repos yet]

[2-column grid:]
[PRCard skeleton: 200px]          [MergeConflictCard skeleton: 160px]
[PRCard skeleton: 180px]          [MergeConflictCard skeleton: 160px]

[CommitList skeleton: 5 rows × 60px]
```

GitHub connection status known immediately (`GET /api/engineering/status`). If not connected: skip skeleton, show empty state.

---

## Page: Meetings (`/meetings`)

```
[2-column meeting grid:]
[MeetingCard skeleton × 3]        [MeetingCard skeleton × 2]
                                  (past column)

[UpcomingList skeleton: 4 rows × 80px]
```

Sub-page `/prep` (`MeetingPreparation`):
```
[EventTitle skeleton: text-line, 200px]
[Attendee row skeleton × 3]
[AI brief skeleton: card, 280px]
[Agenda skeleton: 4 text-lines]
```

Sub-page `/live`:
```
[Timer: renders immediately]
[Notes area: renders immediately — no skeleton needed]
```

---

## Page: Knowledge (`/knowledge`)

```
[Search bar: visible immediately]
[Filter tabs: visible immediately]

EntityStream:
[Entity row skeleton × 5]

GraphPanel (right):
"Select an entity to explore its connections." ← immediately, no skeleton
```

Entity data loads ≤ 500ms. Entity search results load ≤ 300ms (debounced).

---

## Page: Chief of Staff (`/chief`)

```
[Greeting skeleton: 80px block]
[Divider]

[Section label: NOW]
[ActionCard skeleton: 140px]
[ActionCard skeleton: 120px]
[ActionCard skeleton: 120px]
```

Data: `GET /api/autonomous/chief-of-staff`. Expected ≤ 1s (deterministic, no Gemini call).  
At 8s: demo cards from the last successful response (localStorage cache, TTL 10 min).

---

## Page: People (`/people`)

```
[Hero skeleton: 80px]

[2-column:]
[WorkloadPanel skeleton: 4 rows × 60px]    [KnowledgeRisk skeleton: 2 rows × 80px]

[PeopleList skeleton: 5 rows × 60px]
```

People data: from knowledge graph (`GET /api/graph/search?type=PERSON`). At 8s: show whatever graph data is available with a partial data notice.

---

## Page: Customers (`/customers`)

```
[Hero skeleton: 80px]

[CustomerCard skeleton: 200px]
[CustomerCard skeleton: 180px]

[HealthGrid skeleton: 4 rows × 60px]

[RenewalTimeline skeleton: line (4px height) + 3 dot skeletons]
```

At 8s: demo customer data with `"Showing sample data — connect CRM to go live"` banner.

---

## Page: Executive Council (`/council`)

```
[6 AgentHealthCard skeletons in 3×2 grid]
[AskCouncilInput: visible immediately — no skeleton]
```

Health dashboard: `GET /api/council/dashboard` (cached 10 min). Expected ≤ 5s.  
AskCouncilInput is always ready — no skeleton. User can type while health loads.

---

## Page: Activity (`/activity`)

```
[FilterBar: visible immediately]

[Date group label skeleton: text-line, 100px]
[Event row skeleton × 5: 60px each]
[Date group label skeleton]
[Event row skeleton × 3]
```

Data: `GET /api/events/feed` (most recent 100). Expected ≤ 500ms.

---

## Settings Sub-Pages

| Sub-page | Loading |
|---|---|
| IAM | 3 member row skeletons |
| Governance | 3 policy card skeletons |
| Audit | 5 row skeletons |
| Security | 4 key-value row skeletons |
| Health | 6 status indicator skeletons (dot + text) |
| Billing | 2 text block skeletons |

---

## Trust Center (`/integrations`)

```
[TrustBar skeleton]

[ConnectorPanel skeleton × 6:]
  [header: connector icon placeholder + title skeleton]
  [resource row skeleton × 3]
```

Data: `GET /api/integration-permissions?workspaceId={ws}`. Expected ≤ 500ms.

---

## Action Execution Loading (All Pages)

When the user clicks a primary action button on an ActionCard:

```
[Primary action button]
Before: [Approve PR →]
During: [● Executing...] ← spinner inside button, button disabled
After:  [✓ Done] ← green, auto-dismisses after 3s
```

Other buttons on the card: disabled during execution. The card itself remains interactive (e.g., evidence panel can still be toggled).

---

## Panel Loading States

**EventDetailPanel (opens on event click):**
```
[Header: entity name skeleton]
[4 key-value row skeletons]
[Connected entities skeleton: 3 pill skeletons]
```
Data loads ≤ 300ms from event ID lookup.

**CustomerDetailPanel (opens on customer click):**
```
[Header skeleton]
[3 health signal skeletons]
[Recent activity: 3 row skeletons]
[AI Summary skeleton: 2 text-lines]
```

**PersonDetailPanel (opens on person click):**
```
[Header: name + role skeleton]
[Activity stats: 3 number skeletons]
[Knowledge panel: 2 row skeletons]
[AI context: 1 text-line skeleton]
```

---

## Streaming States (Brain / Council)

When the StickyCommandCenter or Council is generating a response:

```
[Question text — immediate]
──────────────────────────────────────────
[Streaming cursor ▌ — appears after 200ms]
[Response text streams in token by token]
```

Streaming via SSE (`/api/brain/copilot/stream`). Fallback (no SSE): full response rendered at once after ≤ 30s.

Streaming tokens render with no delay between tokens — no artificial chunking.

---

## Onboarding Build Step (Step 4)

Build step uses named stages with a progress bar per stage — never a bare spinner:

```
[ ✓ ] Validating workspace
[ ✓ ] Importing people
[  ●  ] Building knowledge graph     ████████████████░░  80%
[   ] Generating embeddings           ░░░░░░░░░░░░░░░░░░  0%
```

Progress: driven by `LIFECYCLE_STAGE_COMPLETED` WebSocket events. If WebSocket is not connected, polls `GET /api/lifecycle/history?workspaceId={ws}` every 3s.

---

## 8-Second Timeout Rule

**Definition:** If the primary data request for a page has not resolved in 8 seconds, switch to demo fallback mode.

**Implementation:**
```js
useEffect(() => {
  const timeout = setTimeout(() => {
    if (!data) setUseDemoData(true);
  }, 8000);
  return () => clearTimeout(timeout);
}, [data]);
```

**When triggered:** Show demo data WITH an honest banner:
```
"Showing sample data — {reason why real data isn't available}."
[Retry real data]
```

**Exceptions:**
- Council (`/council`): 120s timeout (Brain is slow by design)
- Onboarding Build step: no timeout — wait as long as it takes
- AI streaming responses: no timeout for the stream itself (only the initial connection: 5s)

---

## Acceptance Criteria

- [ ] Every page shows correct skeleton structure immediately on navigation.
- [ ] No page shows a blank white screen during loading.
- [ ] No page shows "Loading..." text as the sole loading state.
- [ ] 8-second timeout triggers demo fallback with banner on all pages (except exemptions).
- [ ] Action execution: spinner inside button, other buttons disabled; success/failure after.
- [ ] Streaming responses begin within 200ms of the first token from SSE.
- [ ] Panel loading states (EventDetail, Customer, Person) load within 300ms.
- [ ] Onboarding Build step shows named stages, never a spinner.
