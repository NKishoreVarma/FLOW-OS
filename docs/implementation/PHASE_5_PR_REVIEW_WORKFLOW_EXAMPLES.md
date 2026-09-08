# PR Review Workflow — Example Requests & Responses

The PR Review Workflow is the first end-to-end production workflow in FLOW. It:
1. Lists all open pull requests from a GitHub repository
2. Evaluates each PR for merge safety (draft, conflicts, review state, readiness score)
3. Approves safe PRs through `executeAction()` → governance → GitHubAdapter
4. Merges approved PRs through `executeAction()` → governance → GitHubAdapter
5. Sends a Slack summary to the engineering channel

All write actions flow through `executeAction()` — governance, audit, timeline, and WebSocket broadcast are applied automatically.

---

## 1. Dry Run — inspect the plan without executing

Useful before triggering any real approvals or merges.

### Request

```bash
curl -X POST http://localhost:5001/api/workflows/pr-review \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $JWT" \
  -H "workspace-id: workspace_corp_alpha" \
  -d '{
    "owner":          "acme-corp",
    "repo":           "backend",
    "slackChannelId": "C04XYZ789",
    "dryRun":         true
  }'
```

### Response `200 OK`

```json
{
  "dryRun": true,
  "plan": {
    "summary": {
      "totalPRs":    4,
      "safePRs":     2,
      "unsafePRs":   2,
      "repoOwner":   "acme-corp",
      "repoName":    "backend",
      "mergeMethod": "squash",
      "minMergeReadinessScore": 70
    },
    "steps": [
      {
        "id":   "approve_pr_847",
        "name": "Approve PR #847: Fix auth mutex deadlock",
        "type": "approve_pr",
        "pr":   { "number": 847, "title": "Fix auth mutex deadlock", "url": "https://github.com/acme-corp/backend/pull/847" }
      },
      {
        "id":   "merge_pr_847",
        "name": "Merge PR #847: Fix auth mutex deadlock",
        "type": "merge_pr",
        "pr":   { "number": 847, "title": "Fix auth mutex deadlock", "url": "https://github.com/acme-corp/backend/pull/847" }
      },
      {
        "id":   "approve_pr_851",
        "name": "Approve PR #851: Add Redis connection pooling",
        "type": "approve_pr",
        "pr":   { "number": 851, "title": "Add Redis connection pooling", "url": "https://github.com/acme-corp/backend/pull/851" }
      },
      {
        "id":   "merge_pr_851",
        "name": "Merge PR #851: Add Redis connection pooling",
        "type": "merge_pr",
        "pr":   { "number": 851, "title": "Add Redis connection pooling", "url": "https://github.com/acme-corp/backend/pull/851" }
      },
      {
        "id":   "skip_pr_843",
        "name": "Skip PR #843: WIP: Refactor auth module",
        "type": "skip_pr",
        "pr":   { "number": 843, "title": "WIP: Refactor auth module", "url": "https://github.com/acme-corp/backend/pull/843" }
      },
      {
        "id":   "skip_pr_849",
        "name": "Skip PR #849: Upgrade Prisma to 8.x",
        "type": "skip_pr",
        "pr":   { "number": 849, "title": "Upgrade Prisma to 8.x", "url": "https://github.com/acme-corp/backend/pull/849" }
      },
      {
        "id":   "notify_slack",
        "name": "Notify #engineering on Slack",
        "type": "notify_slack",
        "pr":   null
      }
    ]
  }
}
```

---

## 2. Launch — execute the workflow

Returns 202 immediately. Execution runs in the background. Track progress via WebSocket or the SSE stream endpoint.

### Request

```bash
curl -X POST http://localhost:5001/api/workflows/pr-review \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $JWT" \
  -H "workspace-id: workspace_corp_alpha" \
  -d '{
    "owner":                  "acme-corp",
    "repo":                   "backend",
    "slackChannelId":         "C04XYZ789",
    "mergeMethod":            "squash",
    "minMergeReadinessScore": 70
  }'
```

### Response `202 Accepted`

```json
{
  "executionId": "wf_01HZ7K9QR3XAVBP5MT2N8CYDE6",
  "status": "PLANNING",
  "plan": {
    "summary": {
      "totalPRs":    4,
      "safePRs":     2,
      "unsafePRs":   2,
      "repoOwner":   "acme-corp",
      "repoName":    "backend",
      "mergeMethod": "squash",
      "minMergeReadinessScore": 70
    },
    "steps": [
      { "id": "approve_pr_847", "name": "Approve PR #847: Fix auth mutex deadlock",    "type": "approve_pr", "pr": { "number": 847, "title": "Fix auth mutex deadlock" } },
      { "id": "merge_pr_847",   "name": "Merge PR #847: Fix auth mutex deadlock",      "type": "merge_pr",   "pr": { "number": 847, "title": "Fix auth mutex deadlock" } },
      { "id": "approve_pr_851", "name": "Approve PR #851: Add Redis connection pooling","type": "approve_pr", "pr": { "number": 851, "title": "Add Redis connection pooling" } },
      { "id": "merge_pr_851",   "name": "Merge PR #851: Add Redis connection pooling", "type": "merge_pr",   "pr": { "number": 851, "title": "Add Redis connection pooling" } },
      { "id": "skip_pr_843",    "name": "Skip PR #843: WIP: Refactor auth module",     "type": "skip_pr",    "pr": { "number": 843, "title": "WIP: Refactor auth module" } },
      { "id": "skip_pr_849",    "name": "Skip PR #849: Upgrade Prisma to 8.x",         "type": "skip_pr",    "pr": { "number": 849, "title": "Upgrade Prisma to 8.x" } },
      { "id": "notify_slack",   "name": "Notify #engineering on Slack",                "type": "notify_slack", "pr": null }
    ]
  },
  "_links": {
    "self":   "/api/workflows/wf_01HZ7K9QR3XAVBP5MT2N8CYDE6",
    "stream": "/api/workflows/wf_01HZ7K9QR3XAVBP5MT2N8CYDE6/stream"
  }
}
```

---

## 3. Poll execution status

### Request

```bash
curl http://localhost:5001/api/workflows/wf_01HZ7K9QR3XAVBP5MT2N8CYDE6 \
  -H "Authorization: Bearer $JWT" \
  -H "workspace-id: workspace_corp_alpha"
```

### Response — in progress `200 OK`

```json
{
  "execution": {
    "id":           "wf_01HZ7K9QR3XAVBP5MT2N8CYDE6",
    "workspaceId":  "workspace_corp_alpha",
    "workflowId":   "pr-review",
    "workflowName": "PR Review & Merge",
    "status":       "RUNNING",
    "startedBy":    "rahul@acme.com",
    "startedAt":    "2026-07-20T09:14:32.000Z",
    "completedAt":  null,
    "error":        null,
    "results":      null
  }
}
```

### Response — completed `200 OK`

```json
{
  "execution": {
    "id":           "wf_01HZ7K9QR3XAVBP5MT2N8CYDE6",
    "workspaceId":  "workspace_corp_alpha",
    "workflowId":   "pr-review",
    "workflowName": "PR Review & Merge",
    "status":       "COMPLETED",
    "startedBy":    "rahul@acme.com",
    "startedAt":    "2026-07-20T09:14:32.000Z",
    "completedAt":  "2026-07-20T09:14:47.000Z",
    "error":        null,
    "results": {
      "merged": [
        { "number": 847, "title": "Fix auth mutex deadlock",    "url": "https://github.com/acme-corp/backend/pull/847", "sha": "a3f8c1d" },
        { "number": 851, "title": "Add Redis connection pooling","url": "https://github.com/acme-corp/backend/pull/851", "sha": "b92e4f0" }
      ],
      "skipped": [
        { "number": 843, "title": "WIP: Refactor auth module",  "reasons": ["PR is a draft — skipping until marked ready for review"] },
        { "number": 849, "title": "Upgrade Prisma to 8.x",     "reasons": ["Merge readiness score (45) is below the threshold (70)"] }
      ],
      "failed": [],
      "notified": true,
      "summary": {
        "totalPRs":    4,
        "mergedCount": 2,
        "skippedCount": 2,
        "failedCount": 0
      }
    }
  }
}
```

### Response — waiting for approval `200 OK`

Triggered when governance returns `REQUIRE_APPROVAL` for an approve or merge action.

```json
{
  "execution": {
    "id":         "wf_01HZ7K9QR3XAVBP5MT2N8CYDE6",
    "status":     "WAITING_APPROVAL",
    "approvalId": "appr_02HABCDEF1234567890GHIJKL",
    "startedAt":  "2026-07-20T09:14:32.000Z",
    "completedAt": null,
    "error":      null
  }
}
```

Resolve via the approval API:

```bash
# Approve
curl -X POST http://localhost:5001/api/approvals/appr_02HABCDEF1234567890GHIJKL/approve \
  -H "Authorization: Bearer $JWT" \
  -H "workspace-id: workspace_corp_alpha" \
  -H "Content-Type: application/json" \
  -d '{ "comment": "Looks good — merging" }'

# Reject
curl -X POST http://localhost:5001/api/approvals/appr_02HABCDEF1234567890GHIJKL/reject \
  -H "Authorization: Bearer $JWT" \
  -H "workspace-id: workspace_corp_alpha" \
  -H "Content-Type: application/json" \
  -d '{ "comment": "Holding this batch until the security review is complete" }'
```

---

## 4. List workflow executions

### Request

```bash
curl "http://localhost:5001/api/workflows?limit=10&offset=0" \
  -H "Authorization: Bearer $JWT" \
  -H "workspace-id: workspace_corp_alpha"
```

### Response `200 OK`

```json
{
  "executions": [
    {
      "id":           "wf_01HZ7K9QR3XAVBP5MT2N8CYDE6",
      "workspaceId":  "workspace_corp_alpha",
      "workflowId":   "pr-review",
      "workflowName": "PR Review & Merge",
      "status":       "COMPLETED",
      "startedBy":    "rahul@acme.com",
      "startedAt":    "2026-07-20T09:14:32.000Z",
      "completedAt":  "2026-07-20T09:14:47.000Z"
    },
    {
      "id":           "wf_01HZ6AAMNV3RQKF7XP4WCBHD5",
      "workspaceId":  "workspace_corp_alpha",
      "workflowId":   "pr-review",
      "workflowName": "PR Review & Merge",
      "status":       "FAILED",
      "startedBy":    "kishore@acme.com",
      "startedAt":    "2026-07-19T14:22:18.000Z",
      "completedAt":  "2026-07-19T14:22:25.000Z"
    }
  ],
  "total":  2,
  "limit":  10,
  "offset": 0
}
```

---

## 5. SSE stream — for environments without WebSocket

### Request

```bash
curl -N "http://localhost:5001/api/workflows/wf_01HZ7K9QR3XAVBP5MT2N8CYDE6/stream" \
  -H "Authorization: Bearer $JWT" \
  -H "workspace-id: workspace_corp_alpha" \
  -H "Accept: text/event-stream"
```

### Response — SSE stream

The connection opens immediately with a `connected` handshake, then streams events as they happen. Each event has the same name as the corresponding WebSocket event.

```
event: connected
data: {"executionId":"wf_01HZ7K9QR3XAVBP5MT2N8CYDE6","status":"RUNNING"}

event: WORKFLOW_STEP_STARTED
data: {"executionId":"wf_01HZ7K9QR3XAVBP5MT2N8CYDE6","stepId":"approve_pr_847","stepName":"Approve PR #847: Fix auth mutex deadlock","pr":{"number":847,"title":"Fix auth mutex deadlock"}}

event: WORKFLOW_STEP_COMPLETED
data: {"executionId":"wf_01HZ7K9QR3XAVBP5MT2N8CYDE6","stepId":"approve_pr_847","stepName":"Approve PR #847: Fix auth mutex deadlock","pr":{"number":847},"durationMs":312}

event: WORKFLOW_STEP_STARTED
data: {"executionId":"wf_01HZ7K9QR3XAVBP5MT2N8CYDE6","stepId":"merge_pr_847","stepName":"Merge PR #847: Fix auth mutex deadlock","pr":{"number":847}}

event: WORKFLOW_STEP_COMPLETED
data: {"executionId":"wf_01HZ7K9QR3XAVBP5MT2N8CYDE6","stepId":"merge_pr_847","stepName":"Merge PR #847: Fix auth mutex deadlock","pr":{"number":847},"output":{"merged":true,"sha":"a3f8c1d","message":"Fix auth mutex deadlock (#847)"},"durationMs":891}

event: WORKFLOW_STEP_SKIPPED
data: {"executionId":"wf_01HZ7K9QR3XAVBP5MT2N8CYDE6","stepId":"skip_pr_843","stepName":"Skip PR #843: WIP: Refactor auth module","pr":{"number":843},"reasons":["PR is a draft — skipping until marked ready for review"]}

event: WORKFLOW_COMPLETED
data: {"executionId":"wf_01HZ7K9QR3XAVBP5MT2N8CYDE6","results":{"merged":[{"number":847,"title":"Fix auth mutex deadlock","sha":"a3f8c1d"},{"number":851,"title":"Add Redis connection pooling","sha":"b92e4f0"}],"skipped":[{"number":843},{"number":849}],"failed":[],"notified":true,"summary":{"totalPRs":4,"mergedCount":2,"skippedCount":2,"failedCount":0}}}

event: close
data: {"executionId":"wf_01HZ7K9QR3XAVBP5MT2N8CYDE6"}
```

---

## 6. Validation errors

### Missing required field

```bash
curl -X POST http://localhost:5001/api/workflows/pr-review \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $JWT" \
  -H "workspace-id: workspace_corp_alpha" \
  -d '{ "repo": "backend", "slackChannelId": "C04XYZ789" }'
```

```json
{
  "error": {
    "code":    "VALIDATION_ERROR",
    "message": "owner is required"
  }
}
```

### Missing workspace-id header

```bash
curl -X POST http://localhost:5001/api/workflows/pr-review \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $JWT" \
  -d '{ "owner": "acme-corp", "repo": "backend", "slackChannelId": "C04XYZ789" }'
```

```json
{
  "error": {
    "code":    "MISSING_WORKSPACE",
    "message": "workspace-id header is required"
  }
}
```

### Execution not found

```bash
curl http://localhost:5001/api/workflows/wf_doesnotexist \
  -H "Authorization: Bearer $JWT" \
  -H "workspace-id: workspace_corp_alpha"
```

```json
{
  "error": {
    "code":    "NOT_FOUND",
    "message": "Workflow execution not found"
  }
}
```

---

## 7. WebSocket events (all events)

Connect via `ws://localhost:5001?workspaceId=workspace_corp_alpha&token=$JWT` to receive all workflow events for the workspace.

| Event | When |
|---|---|
| `WORKFLOW_STARTED` | `launchWorkflow` begins `_runWorkflow`; includes `summary` |
| `WORKFLOW_STEP_STARTED` | Before each approve/merge/notify step |
| `WORKFLOW_STEP_COMPLETED` | After successful step; includes `output`, `durationMs` |
| `WORKFLOW_STEP_FAILED` | After all retries exhausted; includes `error`, `durationMs` |
| `WORKFLOW_STEP_SKIPPED` | For each unsafe PR; includes `reasons` array |
| `WORKFLOW_STEP_RETRYING` | On transient error before retry; includes `attempt` |
| `WORKFLOW_APPROVAL_REQUIRED` | Governance returned REQUIRE_APPROVAL; includes `approvalId` |
| `WORKFLOW_COMPLETED` | All steps done; includes full `results` object |
| `WORKFLOW_FAILED` | Unhandled error; includes `error` string |

---

## 8. Running the tests

**Unit tests only (no server required):**

```bash
node --test src/workflows/__tests__/prReviewWorkflow.test.js
```

**Integration tests (requires live server + GitHub + Slack credentials):**

```bash
export TEST_JWT="eyJhbGciOiJIUzI1NiJ9..."
export TEST_WORKSPACE_ID="workspace_corp_alpha"
export TEST_GITHUB_OWNER="acme-corp"
export TEST_GITHUB_REPO="backend"
export TEST_SLACK_CHANNEL_ID="C04XYZ789"

# Start the server first
PORT=5001 node src/server.js &

node --test src/workflows/__tests__/prReviewWorkflow.test.js
```

Integration tests skip automatically when the env vars are absent.

**Running the database migration:**

```bash
psql $DATABASE_URL -f scripts/migrate-workflows-v5.sql
```
