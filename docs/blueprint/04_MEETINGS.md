# Blueprint: Meetings — `/meetings`
**Document:** BP-04  
**Last updated:** 2026-07-18  
**Status:** Authoritative

---

## Purpose

Answer one question: **"Am I prepared for today's meetings?"**

Meetings surfaces upcoming calendar events with AI-generated preparation context — attendees, relevant FLOW intelligence, suggested agenda items, and action items from previous sessions. Its primary action is preparing for the next meeting.

---

## Target User

**Primary:** CTO, Manager/VP, Senior Engineer  
**Secondary:** Anyone with calendar events  
**Frequency:** Morning and between meetings

---

## Entry Points

| Source | How |
|---|---|
| Sidebar | "Meetings" item (PRIMARY group, position 4) |
| `⌘K` → "Go to Meetings" | CommandPalette |
| `⌘M` shortcut | Global |
| Home card | Meeting preparation card in NOW |
| Notification | Calendar reminder → `/meetings/event/:id/prep` |
| Direct URL | `/meetings`, `/meetings/event/:id/*` |

---

## Layout Hierarchy

```
┌─────────────────────────────────────────────────────────────────┐
│ Sidebar (220px)                                                 │
├──────────────────────────────────────────────┬──────────────────┤
│                                              │                  │
│  MeetingPageHeader (60px)                    │  LiveFeed        │
│  Meetings  [Demo mode badge]  [Refresh]      │  (260px)         │
│  ──────────────────────────────────────────  │                  │
│  ExecutiveHero                               │                  │
│  "3 meetings today · next in 40 minutes"     │                  │
│  [Prepare for next meeting]                  │                  │
│  ──────────────────────────────────────────  │                  │
│  DateNav: [← Today →]  [date tabs: Mon–Fri] │                  │
│  ──────────────────────────────────────────  │                  │
│  UpcomingList (cards, chronological)         │                  │
│  ├── MeetingCard (next — highlighted)        │                  │
│  ├── MeetingCard                             │                  │
│  └── MeetingCard                             │                  │
│  ──────────────────────────────────────────  │                  │
│  [Past Meetings — collapsed section]         │                  │
│                                              │                  │
│  [StickyCommandCenter]                       │                  │
└──────────────────────────────────────────────┴──────────────────┘
```

---

## Sub-Pages

| Route | Component | Purpose |
|---|---|---|
| `/meetings` | MeetingDashboard | Calendar overview |
| `/meetings/event/:id/prep` | MeetingPreparation | AI prep context for one event |
| `/meetings/event/:id/live` | LiveMeeting | Live notes + timer |
| `/meetings/event/:id/summary` | MeetingSummary | Post-meeting actions/decisions |

---

## Information Hierarchy

```
Level 1  ExecutiveHero — count and next meeting time
Level 2  Next meeting card (highlighted, expanded prep preview)
Level 3  Remaining today cards (compact)
Level 4  Past meetings (collapsed)
Level 5  StickyCommandCenter
```

---

## Components

| Component | File | Notes |
|---|---|---|
| `MeetingDashboard` | `components/meetings/MeetingDashboard.jsx` | Page orchestrator |
| `MeetingCard` | Inline in MeetingDashboard | Calendar event card |
| `MeetingPreparation` | `components/meetings/MeetingPreparation.jsx` | `/prep` sub-page |
| `LiveMeeting` | `components/meetings/LiveMeeting.jsx` | `/live` sub-page |
| `MeetingSummary` | `components/meetings/MeetingSummary.jsx` | `/summary` sub-page |
| `ExecutiveHero` | `components/decisions/ExecutiveHero.jsx` | |
| `SkeletonCard` | `components/ui/Skeleton.jsx` | Loading |

---

## Data Sources

| Data | Source | Refresh |
|---|---|---|
| Connection status | `GET /api/meetings/status` | On mount |
| Upcoming events | `GET /api/meetings/upcoming?days=7&limit=20` | On mount |
| Past events | `GET /api/meetings/past?days=7&limit=10` | On expand |
| Event detail | `GET /api/meetings/event/:id` | On event card click |
| AI prep context | `GET /api/meetings/event/:id/context` | On prep page load |

---

## Meeting Card Layout

```
[time badge: "In 40 min"]  Q3 Planning — Product + Engineering
                           10:30 AM → 11:30 AM  ·  Google Meet
                           Attendees: Rahul Kumar, Alice Chen, +3

[FLOW context snippet: "Last discussed: pgvector migration timeline"]

[Prepare →]  [Join Meet]  [Ask FLOW about this]
```

**Next meeting card** (expanded variant):
- Additional height (expanded to ~140px from 80px)
- Background `var(--surface-1)`, left border 3px `var(--accent)`
- Shows the FLOW context snippet
- `[Prepare →]` is rendered as a filled primary button (not ghost)

**Other cards** (compact variant):
- 72px height
- No context snippet
- `[Prepare →]` is ghost button

**`[Join Meet]` button:**  
Visible only when `event.videoUrl` is present. Opens the Meet link in a new tab.  
If no videoUrl: button is hidden (not disabled, not greyed out — hidden).

---

## Meeting Preparation Page (`/meetings/event/:id/prep`)

```
┌─────────────────────────────────────────────────────────────────┐
│ ← Meetings    Q3 Planning                                       │
│               Product + Engineering · 10:30 AM · 1h · Meet     │
│               Attendees: Rahul, Alice, Marcus, Sarah, Jordan    │
├─────────────────────────────────────────────────────────────────┤
│  AI PREP BRIEF                                                  │
│  ─────────────────────────────────────────────                  │
│  [AI-generated brief: 3–5 bullet context points]                │
│  Source: workspace memory (cited inline)                        │
│                                                                 │
│  ▶ Evidence (collapsed)                                         │
│  ─────────────────────────────────────────────                  │
│  SUGGESTED AGENDA                                               │
│  1. pgvector migration status (4 open questions)                │
│  2. Release 2.5 timeline (2 blockers)                           │
│  3. Q3 OKR review                                               │
│  ─────────────────────────────────────────────                  │
│  PREVIOUS ACTION ITEMS (from last Q3 sync)                      │
│  ✓ Completed: Deploy staging branch (Alice)                     │
│  ⚠ Open: Document migration runbook (Marcus) — overdue 2 days   │
│  ─────────────────────────────────────────────                  │
│  ATTENDEE CONTEXT                                               │
│  Rahul Kumar — Last PR: #447 (under review)                     │
│  Alice Chen — Last commit: yesterday                            │
│  ─────────────────────────────────────────────                  │
│  [Start Meeting →]  [Add to notes]  [Ask FLOW anything about this meeting]
└─────────────────────────────────────────────────────────────────┘
```

**AI Prep Brief** generation:
- Calls `GET /api/meetings/event/:id/context`
- Backend runs RAG pipeline: retrieve → critic → synthesis using `"{event.title} {attendees.join(' ')}"` as query
- Returns `{ brief, relatedChunks, suggestedQuestions }`
- Brief rendered as Markdown bullet list
- If AI context not available (Gemini failure/no data): shows `"Not enough information available to generate a brief for this meeting."` — does not crash

---

## Live Meeting Page (`/meetings/event/:id/live`)

```
┌──────────────────────────────────────────────────────────┐
│ Q3 Planning · 10:30 AM                                   │
│ [● 00:23:14]   [Pause timer]   [Join Meet]               │
│ ──────────────────────────────────────────────           │
│ LIVE NOTES                                               │
│ [multiline text area — free-form]                        │
│                                                          │
│ ──────────────────────────────────────────────           │
│ ACTION ITEMS                                             │
│ [+ Add action item]                                      │
│ ○ Review migration runbook — Owner: [dropdown] — [date]  │
│                                                          │
│ ──────────────────────────────────────────────           │
│ DECISIONS                                                │
│ [+ Add decision]                                         │
│ ○ Postpone Release 2.5 by 1 week                         │
│                                                          │
│ ──────────────────────────────────────────────           │
│ [End Meeting & Summarize →]                              │
└──────────────────────────────────────────────────────────┘
```

**Timer:** Starts on page load. Shows elapsed time from `event.startTime`. Green ≤ scheduled duration; yellow > 10 min overrun; red > 30 min overrun.

**Notes persistence:** Auto-saved every 30 seconds to `POST /api/meetings/event/:id/notes`. No explicit save button.

**Action items:** Stored locally until `[End Meeting]` is clicked.

**`[End Meeting & Summarize]`:**
1. Posts all action items: `POST /api/meetings/event/:id/actions`
2. Posts notes: `POST /api/meetings/event/:id/notes`
3. Navigates to `/meetings/event/:id/summary`

---

## Meeting Summary Page (`/meetings/event/:id/summary`)

```
┌──────────────────────────────────────────────────────────┐
│ ← Meetings    Q3 Planning — Summary                      │
│               Wed Jul 18 · 1h 03m                        │
├──────────────────────────────────────────────────────────┤
│  AI SUMMARY                                              │
│  [2–3 sentence AI-generated summary]                     │
│  [Generate summary] ← if not yet generated               │
│                                                          │
│  ACTION ITEMS (N)                                        │
│  ○ Review migration runbook — Marcus — Due: Jul 21       │
│  ○ Update Q3 OKR slide — Rahul — Due: Jul 22             │
│  [+ Add]  [Create Jira issues →]                         │
│                                                          │
│  DECISIONS (N)                                           │
│  ○ Postpone Release 2.5 by 1 week                        │
│                                                          │
│  [Save & Close]                                          │
└──────────────────────────────────────────────────────────┘
```

**`[Generate summary]`:** Calls `POST /api/meetings/event/:id/summary` which stores to calendar event `extendedProperties`.

**`[Create Jira issues →]`:** Executes a Jira connector action for each action item (risk: MEDIUM, requires user confirmation per item).

---

## AI Behavior

### Meeting prep context
Full RAG pipeline behind `GET /api/meetings/event/:id/context`. Response structure:
```js
{
  brief: string,          // Markdown
  suggestedQuestions: string[],
  relatedChunks: [{source, text, relevance}],
  attendeeContext: [{name, lastActivity}]
}
```

### Meeting summary
Called on-demand (`[Generate summary]`). Gemini + fallback template.

### Command Center on Prep page
```
ACTIVE CONTEXT: Q3 Planning · 10:30 AM today
SUGGESTED:
  "What should I bring up about the pgvector migration?"
  "What did we decide last time about Release 2.5?"
  "Who has open action items from Alice?"
```

---

## Google Calendar Not Connected State

```
[PageHeader: "Meetings" + "Demo mode" badge]

Banner:
"Showing sample data — connect Google Calendar to see your real schedule."
[Connect Google Calendar →]

[Sample meetings rendered below]
```

`[Connect Google Calendar →]`:
1. `POST /api/connectors/google-calendar/auth/initiate`
2. Redirect to Google OAuth consent
3. Callback: `GET /api/meetings/oauth/callback`
4. Return to `/meetings` with real data

---

## Loading State

```
[Hero skeleton]
[DateNav: 5 tab stubs]
[Card 1: expanded skeleton, 140px]
[Card 2: compact skeleton, 72px]
[Card 3: compact skeleton, 72px]
```

---

## Empty State

**Today has no meetings:**
```
[Calendar icon, 40px, var(--t4)]
No meetings scheduled for today.
Tomorrow: 2 meetings.

[View this week]  [Create a meeting]  [Ask FLOW]
```

**No upcoming meetings (next 7 days):**
```
Your calendar is clear this week.
No meetings in the next 7 days.
```

---

## Error State

**Calendar API error:**
- Banner: `"Unable to load calendar. Showing last known schedule."`
- Cached/demo data renders with a `"[stale]"` badge

**Prep context unavailable:**
- Prep page shows: `"Not enough context available for this meeting."` in the brief section
- Other sections (previous actions, attendees) still render

---

## Keyboard Shortcuts

| Key | Action |
|---|---|
| `⌘M` | Go to Meetings (global) |
| `P` | Prepare for next meeting (from /meetings) |
| `J` | Join Meet for next meeting with videoUrl |
| `←` / `→` | Navigate date tabs |
| `↓` / `↑` | Navigate meeting cards |
| `Enter` | Open prep page for focused meeting |
| `Escape` | Close any open panel |

---

## Accessibility

- Date navigation: `role="tablist"`, tabs `role="tab"`, `aria-selected`
- Meeting cards: `role="article"`, `aria-label="{title} at {time}"`
- Timer: `aria-live="off"` (not announced every second — only on state change)
- Actions in live page: `aria-label` on owner dropdowns and date inputs
- LiveMeeting notes textarea: `aria-label="Meeting notes"`, autofocus on page load

---

## Responsive Behavior

| Viewport | Behavior |
|---|---|
| ≥1280px | 2-column: content + LiveFeed |
| 1024px–1279px | Single column; LiveFeed closed |
| 768px–1023px (tablet) | Single column; expanded card collapses to compact |

---

## Telemetry Events

| Event | Trigger | Properties |
|---|---|---|
| `meetings.viewed` | Page mount | `{ connected, meetingCount, nextMeetingIn }` |
| `meetings.event.prep.viewed` | Prep page mount | `{ eventId, hasContext }` |
| `meetings.event.live.started` | Live page mount | `{ eventId }` |
| `meetings.event.summary.saved` | Save & Close | `{ eventId, actionCount, decisionCount }` |
| `meetings.join.clicked` | Join Meet button | `{ eventId }` |
| `meetings.jira.created` | Create Jira issues | `{ eventId, issueCount }` |
| `meetings.calendar.connected` | OAuth success | `{}` |

---

## Acceptance Criteria

- [ ] Upcoming meetings load chronologically; next meeting card is expanded and highlighted.
- [ ] `[Join Meet]` button visible only when `event.videoUrl` is present.
- [ ] Prep page renders AI brief from RAG pipeline; shows honest "not enough context" when insufficient data.
- [ ] Evidence panel on prep page is collapsed by default.
- [ ] Live meeting timer starts from `event.startTime`; color changes at +10m and +30m overrun.
- [ ] Notes auto-save every 30 seconds; no explicit save button required.
- [ ] `[End Meeting]` posts actions + notes then navigates to summary page.
- [ ] Summary page `[Create Jira issues]` executes with MEDIUM risk governance.
- [ ] Google Calendar not connected → demo data with banner and OAuth button.
- [ ] Date tabs navigate correctly; browser back restores the selected tab.
- [ ] All keyboard shortcuts work on the main meetings page.
- [ ] All telemetry events fire at correct triggers.
