# Adaptive Workday Engine (Sprint 2.2)

The intelligence layer that continuously answers one question:
**"What is the single most valuable thing this person should do right now?"**

> **Not a new AI engine.** No new reasoning, prediction, graph, execution, or
> notification system. It is a deterministic scoring/ranking layer that *re-frames*
> signals FLOW already collects, and returns an ordered work queue — not a notification
> list. Slack/GitHub/Gmail show everything; FLOW shows only what matters.

## Modules (`src/workday/`)

| File | Responsibility |
|------|----------------|
| `signalCollector.js` | Gathers candidate WorkItems from fast existing sources: pending approvals (Governance), the Notification Engine's already-permission-filtered signals (merge conflicts, incidents, execution-done…), and Prediction Engine risks. Meetings/others can be injected. |
| `prioritizer.js` | `score(item, ctx)` → 0–100 + tier + **reasons[]**, from a transparent weighted sum. Pure/deterministic — no keywords, no LLM. |
| `workQueue.js` | Buckets scored items into **NOW / NEXT / LATER / FYI**, dedupes, and collapses the rest into `ignoredCount`. |
| `workdayEngine.js` | `getWorkQueue(ws, user)` / `getNext(...)` — recomputed on every read, so it is inherently adaptive. |

## The question for every event

Not *"did something happen?"* but **"should Rahul care?"**

```
Merge conflict → does Rahul own these files? → YES → NOW
Customer replied → does Rahul own the account? → YES → NEXT
PR merged, Rahul not involved → dampen → FYI/ignore
General Slack discussion → noise → ignore
```

## Scoring dimensions (deterministic, weighted)

| Dimension | Weight | Signal |
|-----------|--------|--------|
| ownership | 0.22 | user identity ∈ owners/assignee/participants/requester |
| blocking | 0.20 | how many people are blocked (`min(1, n/3)`) |
| timeSensitivity | 0.18 | due/start soon (imminent = 1, overdue = 1) |
| risk | 0.14 | `riskScore/100` |
| businessImpact | 0.12 | critical/high/medium/low |
| department | 0.08 | engineering 1.0 · security 0.9 · sales 0.8 · … |
| predictionConfidence | 0.06 | prediction confidence |

A **noise penalty** collapses generic, un-owned, low-impact, non-blocking notifications
to *ignore*. Owned + blocking work jumps to **NOW** even at a moderate base score.

## Output — Today's Work Queue

```
NOW    Approve PR #421 — Blocking 2 people. You own this.
NEXT   Reply to TechCorp VP — renewal risk.
LATER  Prepare engineering standup — Starts in 18 min.
FYI    Deployment completed.
       FLOW handled the rest — you can safely ignore 18 other events.
```

Each card carries `title · reasons · score · actionRoute` (where the click takes the
user to finish the work in FLOW).

## Adaptive

Recomputed on every read from current state — no cache to invalidate. The moment Rahul
approves the PR, it leaves the approvals set; the next read promotes the standup prep and
moves the customer email down. The workday continuously reorders itself.

## API (`/api/workday/*`, JWT + workspace-id)

| Method | Path | Returns |
|--------|------|---------|
| GET | `/queue` | `{ now, next, later, fyi, ignoredCount, total, generatedAt }` |
| GET | `/next` | `{ next: <the single most important thing> }` |

## Consumers

- **Home — Today's Focus** *is* the queue (NOW/NEXT/LATER, each click → its action),
  with "you can safely ignore N events."
- **Operational Inbox** is priority-ordered (not time-ordered).
- **Brain** — "What should I work on?" is answered **instantly** from the queue, not
  generic reasoning.

## Validation

`node scripts/validate-workday-engine.js` — **17/17** (deterministic): correct
prioritization, ownership filtering, blocking/dependency awareness, meeting awareness,
priority recalculation after completion, no duplicate work, no notification spam (FYI
collapse). Integration regression steady at **66/74**.

> Note: the queue is only as full as the workspace's real signals — an empty workspace
> yields an empty queue ("you're all clear"). It populates from real approvals /
> notifications / conflicts / predictions on a connected workspace.

## Success metric

Not notifications sent or events processed — **the correct next action shown**, time to
first important decision, and work completed inside FLOW.
