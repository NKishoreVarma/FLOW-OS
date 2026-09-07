# FLOW OS — API Reference
**Architecture Version:** 1.0  
**Status:** FROZEN

All protected endpoints require:
- `Authorization: Bearer <jwt>` header
- `workspace-id: <externalId>` header (where noted)

---

## Authentication

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/signup` | None | Register org + workspace + user. Body: `{fullName, email, password, orgName}` |
| POST | `/api/auth/login` | None | Authenticate. Body: `{email, password}`. Returns `{token, user}` |

---

## Health & Infrastructure

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | None | Basic alive check |
| GET | `/api/health` | None | Extended health (pg + redis + queue counts) |
| GET | `/health/live` | None | Liveness probe (200 = alive) |
| GET | `/health/ready` | None | Readiness probe (503 during graceful shutdown or unhealthy dependencies) |
| GET | `/metrics/infra` | None | Infrastructure metrics (pool, redis, queues, memory) |

---

## AI Platform (`/api/ai/*`)

JWT required. No workspace-id required (except `/api/ai/rate-limits`).

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/ai/providers` | All provider health + routing config |
| GET | `/api/ai/providers/:name` | Single provider health |
| POST | `/api/ai/chat` | Direct chat (bypasses layers 2/3/6/7). Body: `{prompt, taskType?, provider?, maxTokens?, temperature?}` |
| POST | `/api/ai/embed` | Embedding. Body: `{text}` |
| POST | `/api/ai/stream` | SSE stream. Body: `{prompt, taskType?}` |
| GET | `/api/ai/metrics` | Rolling provider metrics. Query: `?minutes=60` |
| GET | `/api/ai/metrics/:provider` | Single-provider metrics |
| POST | `/api/ai/evaluate` | Multi-provider evaluation. Body: `{prompt, taskType?, providers?, temperature?}` |
| POST | `/api/ai/evaluate/ab` | A/B prompt test. Body: `{promptA, promptB, provider?, taskType?, runs?}` |
| GET | `/api/ai/prompts` | List prompt names |
| GET | `/api/ai/prompts/:name` | List versions for a named prompt |
| POST | `/api/ai/prompts/:name/render` | Render active prompt. Body: `{variables?}` |
| POST | `/api/ai/prompts/:name/versions` | Create version. Body: `{content, description?, tags?, abWeight?}` |
| PATCH | `/api/ai/prompts/:name/versions/:v/activate` | Activate version. Query: `?exclusive=true` |
| PATCH | `/api/ai/prompts/:name/versions/:v/deactivate` | Deactivate version |
| POST | `/api/ai/prompts/:name/rollback` | Rollback to prior version |
| POST | `/api/ai/request` | Full 9-layer platform request. Body: `{prompt, taskType, workspaceId, userId, ...}` |
| GET | `/api/ai/traces` | Last 200 completed request traces |
| GET | `/api/ai/traces/active` | In-flight requests |
| GET | `/api/ai/rate-limits` | Rate limit usage for workspace-id |
| GET | `/api/ai/tools` | All registered tools |

---

## Connectors (`/api/connectors/*`)

JWT + `workspace-id` required.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/connectors` | JWT+ws | List registered connectors + auth status |
| GET | `/api/connectors/capabilities` | JWT+ws | Capability → connector map |
| GET | `/api/connectors/health` | JWT+ws | Health check all connectors |
| GET | `/api/connectors/timeline` | JWT+ws | Workspace action timeline (200-event ring) |
| GET | `/api/connectors/audit` | JWT+ws | Workspace audit log (PostgreSQL, durable) |
| POST | `/api/connectors/execute` | JWT+ws | Execute a connector action |
| POST | `/api/connectors/search` | JWT+ws | Universal cross-connector search |
| POST | `/api/connectors/:id/auth/initiate` | JWT+ws | Start auth flow |
| POST | `/api/connectors/:id/auth/callback` | JWT+ws | OAuth code exchange |
| POST | `/api/connectors/:id/auth/revoke` | JWT+ws | Revoke credentials |

---

## Governance (`/api/approvals/*`, `/api/policies/*`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/approvals` | JWT+ws+ADMIN+ | List pending approvals |
| GET | `/api/approvals/history` | JWT+ws+ADMIN+ | All approvals (any status) |
| GET | `/api/approvals/:id` | JWT+ws | Single approval detail |
| POST | `/api/approvals/:id/approve` | JWT+ws+ADMIN+ | Approve + re-execute action |
| POST | `/api/approvals/:id/reject` | JWT+ws+ADMIN+ | Reject approval |
| GET | `/api/policies` | JWT+ws+ADMIN+ | List governance policies |
| POST | `/api/policies` | JWT+OWNER | Create policy |
| GET | `/api/policies/:id` | JWT+ADMIN+ | Get policy detail |
| PUT | `/api/policies/:id` | JWT+OWNER | Update policy |
| PATCH | `/api/policies/:id/toggle` | JWT+OWNER | Enable/disable policy |
| DELETE | `/api/policies/:id` | JWT+OWNER | Delete policy |

---

## Integration Permissions (`/api/integration-permissions/*`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/integration-permissions` | JWT+ws | All connectors + allowed/hidden counts |
| GET | `/api/integration-permissions/:connector` | JWT+ws | Resource catalog (query: `q, status, type`) |
| POST | `/api/integration-permissions/:connector/discover` | JWT+ADMIN+ | Real provider API → catalog |
| PUT | `/api/integration-permissions/:connector/resources` | JWT+ADMIN+ | Bulk allow/hide |
| POST | `/api/integration-permissions/:connector/bulk` | JWT+ADMIN+ | Allow all / hide all |
| PATCH | `/api/integration-permissions/:connector/settings` | JWT+ADMIN+ | `autoAllowNew`, `dmPolicy` |
| GET | `/api/integration-permissions/:connector/audit` | JWT+ADMIN+ | Permission-change history |

---

## Brain (`/api/brain/*`)

JWT + `workspace-id` required.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/brain/briefing` | Generate role-aware morning briefing. Query: `?role=CTO` |
| POST | `/api/brain/copilot` | Copilot Q&A. Body: `{question, pageContext?, entityId?}` |
| POST | `/api/brain/copilot/stream` | SSE streaming copilot |
| POST | `/api/brain/reason` | 9-stage COO reasoning. Body: `{question, domain?}`. Query: `?explain=true` |
| GET | `/api/brain/recommendations` | Current recommendations for workspace |
| POST | `/api/brain/recommendations/:id/execute` | Execute a recommendation |
| GET | `/api/brain/decisions` | List decisions |
| POST | `/api/brain/decisions` | Create decision |
| GET | `/api/brain/decisions/:id` | Single decision |
| PUT | `/api/brain/decisions/:id` | Update decision |
| GET | `/api/brain/automations` | List automation rules |
| POST | `/api/brain/automations` | Create rule (ADMIN+) |
| PATCH | `/api/brain/automations/:id/toggle` | Enable/disable rule (ADMIN+) |
| DELETE | `/api/brain/automations/:id` | Delete rule (ADMIN+) |
| GET | `/api/brain/goals` | List OKR goals |
| POST | `/api/brain/goals` | Create goal |
| GET | `/api/brain/goals/:id` | Goal detail |
| POST | `/api/brain/goals/:id/milestones` | Add milestone |
| GET | `/api/brain/goals/:id/evaluate` | AI risk evaluation for goal |
| GET | `/api/brain/timeline` | Operational timeline |
| GET | `/api/brain/context/:entityId` | Entity context (graph + timeline) |
| GET | `/api/brain/memory` | Organization memory records |
| GET | `/api/brain/graph` | Knowledge graph query |

---

## Executive Council (`/api/council/*`)

JWT + `workspace-id` required. Requests use extended timeout (`COUNCIL_REQUEST_TIMEOUT_MS=120000`).

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/council/ask` | Ask the full council. Body: `{question}` |
| GET | `/api/council/dashboard` | 6 agent health cards (~10min cache) |
| GET | `/api/council/agents` | List all agents and their domains |
| POST | `/api/council/agent/:id` | Ask a single agent. Body: `{question}` |

---

## Workspace Cache & Autonomous (`/api/workspace/*`, `/api/autonomous/*`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/workspace/snapshot` | JWT+ws | Instant workspace snapshot (~5ms warm). Query: `?force=true` |
| GET | `/api/workspace/health` | JWT+ws | Domain health scores |
| GET | `/api/workspace/summary` | JWT+ws | Overall workspace summary |
| GET | `/api/workspace/actions` | JWT+ws | Top recommended actions |
| GET | `/api/autonomous/chief-of-staff` | JWT+ws | Top-5 NOW items + greeting |
| GET | `/api/autonomous/weekly-review` | JWT+ws | Engineering velocity + execution success |
| GET | `/api/autonomous/templates` | JWT+ws | Available workflow templates |
| GET | `/api/autonomous/efficiency` | JWT+ws | FLOW efficiency metrics |

---

## Execution (`/api/execution/*`)

JWT + `workspace-id` required.

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/execution/plan` | Generate execution plan (dry-run). Body: `{action, params}` |
| POST | `/api/execution/run` | Execute governed action. Body: `{action, params}` |
| GET | `/api/execution/history` | Execution record history |
| GET | `/api/execution/history/:id` | Single execution record |

---

## Collaboration (`/api/collaboration/*`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/collaboration/conflicts` | Detected merge conflicts |
| GET | `/api/collaboration/ownership/:prId` | File owners for a PR |
| GET | `/api/collaboration/issues` | Active collaboration issues (blocked, stale, large PRs) |

---

## Notifications (`/api/notifications/*`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/notifications` | Notifications for authenticated user |
| PATCH | `/api/notifications/:id/read` | Mark as read |
| POST | `/api/notifications/mark-all-read` | Mark all read |

---

## Communication / Gmail (`/api/communication/*`)

JWT + `workspace-id` required. Query: `?provider=gmail` (default).

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/communication/status` | Gmail connection status |
| GET | `/api/communication/oauth/callback` | OAuth code exchange (Google redirect, no auth) |
| GET | `/api/communication/inbox` | List inbox. Query: `?limit=10&q=is:unread` |
| GET | `/api/communication/thread/:threadId` | Full thread |
| GET | `/api/communication/message/:messageId` | Single message |
| GET | `/api/communication/labels` | List labels |
| POST | `/api/communication/search` | Search. Body: `{q, limit?}` |
| POST | `/api/communication/send` | Send. Body: `{to, subject, body}` |
| POST | `/api/communication/reply/:messageId` | Reply. Body: `{body}` |
| POST | `/api/communication/reply-all/:messageId` | Reply all |
| POST | `/api/communication/forward/:messageId` | Forward. Body: `{to, body?}` |
| POST | `/api/communication/draft` | Create draft |
| PATCH | `/api/communication/label/:id` | Modify labels. Body: `{action: 'archive'|'star'|'trash'|...}` |
| POST | `/api/communication/sync` | Sync inbox to ingestion. Body: `{limit?, q?}` |

---

## Meetings / Calendar (`/api/meetings/*`)

JWT + `workspace-id` required. Query: `?provider=google-calendar` (default).

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/meetings/status` | Calendar connection status |
| GET | `/api/meetings/oauth/callback` | OAuth code exchange (no auth) |
| GET | `/api/meetings/upcoming` | Upcoming events. Query: `?days=7&limit=20` |
| GET | `/api/meetings/past` | Past events. Query: `?days=30` |
| GET | `/api/meetings/event/:eventId` | Single event detail |
| GET | `/api/meetings/event/:eventId/context` | AI meeting prep (RAG pipeline) |
| POST | `/api/meetings/search` | Search events. Body: `{q, days?}` |
| POST | `/api/meetings/create` | Create event |
| PATCH | `/api/meetings/event/:eventId` | Update event |
| DELETE | `/api/meetings/event/:eventId` | Delete event |
| POST | `/api/meetings/event/:eventId/notes` | Append notes |
| POST | `/api/meetings/event/:eventId/actions` | Store action items |
| POST | `/api/meetings/event/:eventId/summary` | Store AI summary |
| POST | `/api/meetings/sync` | Sync to ingestion. Body: `{days?}` |

---

## Engineering / GitHub (`/api/engineering/*`)

JWT + `workspace-id` required. Query: `?provider=github` (default).

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/engineering/status` | GitHub connection status |
| POST | `/api/engineering/auth` | Store PAT. Body: `{token}` |
| GET | `/api/engineering/repos` | List repos |
| GET | `/api/engineering/repos/:owner/:repo` | Repo metadata |
| GET | `/api/engineering/repos/:owner/:repo/contributors` | Top contributors |
| GET | `/api/engineering/repos/:owner/:repo/branches` | List branches |
| GET | `/api/engineering/repos/:owner/:repo/compare` | Compare refs. Query: `?base=main&head=feature` |
| GET | `/api/engineering/repos/:owner/:repo/commits` | Commit history |
| GET | `/api/engineering/repos/:owner/:repo/commits/:sha` | Single commit with diffs |
| GET | `/api/engineering/repos/:owner/:repo/pulls` | List PRs. Query: `?state=open` |
| GET | `/api/engineering/repos/:owner/:repo/pulls/:number` | PR with merge readiness score |
| GET | `/api/engineering/repos/:owner/:repo/pulls/:number/reviews` | Reviews + reviewer workload |
| GET | `/api/engineering/repos/:owner/:repo/deployments` | Deployments. Query: `?environment=production` |
| GET | `/api/engineering/repos/:owner/:repo/deployments/:id` | Single deployment with risk score |
| POST | `/api/engineering/repos/:owner/:repo/branches` | Create branch |
| POST | `/api/engineering/repos/:owner/:repo/pulls` | Create PR |
| PATCH | `/api/engineering/repos/:owner/:repo/pulls/:number` | Update PR |
| POST | `/api/engineering/repos/:owner/:repo/pulls/:number/approve` | Review PR |
| POST | `/api/engineering/repos/:owner/:repo/pulls/:number/merge` | Merge PR. Body: `{mergeMethod?}` |
| POST | `/api/engineering/search` | Search. Body: `{q, type?, repo?}` |
| POST | `/api/engineering/sync` | Sync PRs + commits to ingestion. Body: `{owner, repo, limit?}` |

---

## Intelligence (`/api/intelligence/*`)

JWT + `workspace-id` required.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/intelligence/health-score` | Workspace health score |
| GET | `/api/intelligence/daily-feed` | Daily intel feed |
| POST | `/api/intelligence/rolling-summary` | Compile rolling summary |

---

## Event Platform (`/api/events/*`)

JWT + `workspace-id` required. Admin paths require ADMIN+.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/events/feed` | Intelligence feed |
| GET | `/api/events/timeline` | Event timeline |
| GET | `/api/events/stats` | Event platform statistics |
| GET | `/api/events/metrics` | Delivery metrics |
| POST | `/api/events/search` | Search events |
| GET | `/api/events/:id` | Single event |
| POST | `/api/events/replay` | Re-deliver past events to subscribers (ADMIN+) |
| POST | `/api/events/ingest` | Manually ingest a FLOW event |

---

## Graph (`/api/graph/*`)

JWT + `workspace-id` required.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/graph/nodes` | Search nodes |
| GET | `/api/graph/nodes/:id` | Single node |
| GET | `/api/graph/nodes/:id/neighbors` | Direct neighbors |
| GET | `/api/graph/nodes/:id/impact` | Impact (blast radius) |
| GET | `/api/graph/nodes/:id/dependencies` | Dependency chain |
| GET | `/api/graph/path` | Shortest path. Query: `?from=id1&to=id2` |
| GET | `/api/graph/metrics` | Graph statistics |

---

## Explainability (`/api/explain/*`)

JWT + `workspace-id` required.

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/explain` | Explain an AI output or question. Body: `{output?, reason?, question?}` |
| POST | `/api/explain/followup` | Follow-up on an explanation. Body: `{explanationId, type}` |
| GET | `/api/explain/types` | Available follow-up types |

---

## Replay (`/api/replay/*`)

JWT + `workspace-id` required. Admin pages (dev-only).

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/replay/modes` | Available replay modes |
| POST | `/api/replay` | Replay events. Body: `{mode, filters, startDate, endDate}` |
| POST | `/api/replay/snapshot` | State snapshot at a point in time. Body: `{at}` |
| POST | `/api/replay/compare` | Compare two snapshots. Body: `{t1, t2}` |
| POST | `/api/replay/export` | Export replay as JSON or Markdown. Body: `{mode, format}` |

---

## Simulation (`/api/simulation/*`)

JWT + `workspace-id` required. Admin pages (dev-only).

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/simulation/types` | Available scenario types |
| POST | `/api/simulation/run` | Run simulation. Body: `{type?, question?, targetEntityId?, targetName?, params?}` |
| POST | `/api/simulation/compare` | Compare two simulations. Body: `{scenarioA, scenarioB}` |

---

## Predictions (`/api/predictions/*`)

JWT + `workspace-id` required.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/predictions/types` | Available prediction types |
| POST | `/api/predictions/run` | Run predictions. Body: `{domain?, types?}` |
| GET | `/api/predictions/history` | Prediction run history |
| GET | `/api/predictions/:type` | Single prediction type |

---

## Workspace Lifecycle (`/api/lifecycle/*`)

JWT + `workspace-id` required.

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/lifecycle/create` | Full workspace bootstrap (10 stages) |
| POST | `/api/lifecycle/import` | Import into workspace (9 stages) |
| POST | `/api/lifecycle/sync` | Incremental sync (7 stages) |
| POST | `/api/lifecycle/refresh` | Re-derive intelligence (4 stages) |
| POST | `/api/lifecycle/validate` | Dry-run validation |
| GET | `/api/lifecycle/history` | Last 50 ImportRecords |
| GET | `/api/lifecycle/schema` | Supported dataset types + engine version |

---

## Onboarding & Success (`/api/onboarding/*`, `/api/success/*`)

JWT + `workspace-id` required.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/onboarding/state` | Current onboarding step |
| POST | `/api/onboarding/discover` | Discovery (live or demo) |
| POST | `/api/onboarding/permissions` | Save permission decisions |
| POST | `/api/onboarding/build` | Build workspace (real or demo seed) |
| POST | `/api/onboarding/complete` | Mark onboarding complete |
| POST | `/api/onboarding/reset` | Reset onboarding state |
| GET | `/api/onboarding/metrics` | Adoption metrics (time-to-value, work-in-FLOW) |
| GET | `/api/success/summary` | Hybrid ROI metrics |
| GET | `/api/success/model` | ROI model configuration + assumptions |

---

## Query (`/api/query`)

JWT + `workspace-id` required.

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/query` | RAG pipeline query. Body: `{queryText}` |

---

## Ingestion

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/webhook/ingest` | JWT | Push message to ingestion queue. Body: `{workspaceId, platform, sender, channel, text}` |

---

## Observability & Metrics

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/metrics` | ADMIN JWT or METRICS_TOKEN | Full system metrics |
| GET | `/api/metrics/alerts` | ADMIN JWT or METRICS_TOKEN | Active alerts |

---

## Dev-Only Endpoints (404 in production)

| Path | Description |
|------|-------------|
| `GET /dev-dashboard` | Engineering cockpit HTML shell |
| `GET/POST /api/dev/*` | Engineering cockpit API (OWNER/ADMIN JWT required) |
| `GET /monitoring` | Metrics dashboard UI |
| `GET /event-inspector` | Event Platform inspector |
| `GET /graph-explorer` | Graph Digital Twin explorer |
| `GET /replay-player` | Workspace Replay player |
| `GET /simulation-workspace` | What-If Simulation workspace |
| `GET /prediction-workspace` | Predictive Intelligence workspace |
| `GET/POST /api/simulator/*` | Living Workspace Simulator control |

---

## Standard Error Response

```json
{
  "error": "Human-readable error message",
  "code": "ERROR_CODE",
  "statusCode": 400
}
```

| Status | Meaning |
|--------|---------|
| 400 | Missing required field or invalid input |
| 401 | Missing or invalid JWT |
| 403 | Workspace not owned / policy DENY / APPROVAL_REQUIRED |
| 404 | Resource not found (or dev endpoint blocked in production) |
| 429 | Rate limit exceeded |
| 500 | Internal server error (see logs) |
| 503 | Service unavailable (readiness probe: pg or redis unhealthy) |
