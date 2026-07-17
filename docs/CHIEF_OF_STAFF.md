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

## Response shape

```json
{
  "greeting": "Good morning, Rahul. You have 3 critical items.",
  "topItems": [ ...ActionCard[] ],
  "summary": "1 PR merge pending, 2 approvals needed, 1 incident open.",
  "preferences": { "preferredReviewers": [], "recentlyBlockedConnectors": [] },
  "generatedAt": "2026-07-17T08:00:00.000Z"
}
```

## No new reasoning

The Chief of Staff does NOT call the Executive Council or Operational Brain.
It reuses the Workday Engine's deterministic prioritizer. The Council remains
available for deep questions at `/council`.

## Adding to the panel

Add new signal sources to `src/workday/signalCollector.js`. The Chief of Staff
panel will reflect them automatically on the next request.

## Demo fallback

If the API is unavailable, `ChiefOfStaff.jsx` renders a deterministic demo
briefing so the page is never blank during development.
