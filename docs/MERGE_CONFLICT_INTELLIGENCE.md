# Merge Conflict Intelligence + Smart Collaboration (Phase 14 M2)

The flagship of the Operational Execution Engine: when GitHub blocks a pull request,
FLOW turns it into an operational finding, works out **who is actually involved**, and
notifies **only** those people with the right next action — never the whole team.

## Detection (poll-on-sync + on-view)

`src/collaboration/mergeConflictDetector.js` reads the signals GitHub already returns
on the normalized PR (`mergeable` / `mergeable_state` / review state / merge-readiness /
checks) and classifies:

| Finding | Trigger |
|---------|---------|
| `MERGE_CONFLICT` | `mergeable === false` or `mergeable_state === 'dirty'` |
| `CI_FAILED` | checks not passed / `mergeable_state` unstable or blocked |
| `CHANGES_REQUESTED` | a reviewer requested changes |
| `PR_BLOCKED` | low merge readiness (< 50) with no other finding |

`analyzePR(pr)` is pure. `detectFromPRs(workspaceId, prs)` emits a FLOW event
(`MERGE_CONFLICT` / `CI_FAILED` / …) per blocked PR onto the Unified Event Platform, so
the timeline, graph, and (M3) notification engine react. Detection runs during the
existing GitHub sync and whenever a PR is opened in FLOW — no webhook required.

## Ownership analysis — the relevant people only

`src/collaboration/ownershipAnalyzer.js → analyzeOwnership({ pr, files, otherContributions })`
computes, deterministically:

- **owners** — the PR author + everyone else who recently changed the same files,
- **introducedBy** — the *other* people whose overlapping work collides,
- **overlappingFiles** — the exact files changed by more than one person,
- repo / branch / base branch,
- **suggestedActions** — Open Diff · Open PR · Message `<each owner>` · Create Meeting.

> Rahul changed `auth.js`, Kishore changed `auth.js` → owners `[rahul, kishore]`,
> overlapping `auth.js`, "coordinate before merging". An unrelated dev who only touched
> `README.md` is **never** included.

`conflictMessage(analysis)` renders the flagship notification body:

```
⚠️ Merge conflict detected in flow-backend.

Files affected:
• auth.js
• loginService.js

Primary owners:
rahul
kishore

Suggested next step:
Coordinate before merging — the same files were changed by more than one person.
```

## Smart Collaboration signals

`src/collaboration/collaborationDetector.js → detectSignals(prs)` surfaces friction,
each with a suggested action, sorted high-severity first:

| Signal | Meaning |
|--------|---------|
| `BLOCKED_PR` | conflict / CI fail / changes-requested / low readiness |
| `WAITING_TOO_LONG` | open > 48h without progress |
| `STALE_BRANCH` | no update in > 14 days |
| `CHANGES_REQUESTED` | author action needed |
| `LARGE_RISKY_PR` | > 20 files or > 500 lines changed |
| `REPEATED_COLLISION` | the same two people collide on ≥ 2 PRs → divide ownership |

## REST (`/api/collaboration/*`, JWT + workspace-id)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/signals` | Smart-collab signals over open PRs (live GitHub, else labelled demo) |
| GET | `/conflicts` | Blocked PRs + ownership + `notify` targets + repeat-collision detection |
| POST | `/analyze` | Analyze provided `{ prs }` or `{ pr, files, otherContributions }` |

When GitHub is connected, open PRs are read through the governed connector READ path;
otherwise a clearly-labelled demo set (Rahul + Kishore on `auth.js`) is returned so the
capability is fully demonstrable.

## Validation

`node scripts/validate-collaboration.js` — **23/23**: conflict classification,
ownership targeting (only rahul + kishore; dana excluded), the rendered message,
smart-collab signals, and repeated-collision detection. Integration regression unaffected.

See also: [`EXECUTION_ENGINE.md`](EXECUTION_ENGINE.md), [`NOTIFICATION_ENGINE.md`](NOTIFICATION_ENGINE.md).
