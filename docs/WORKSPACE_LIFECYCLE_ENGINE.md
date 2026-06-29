# Workspace Lifecycle Engine

The Workspace Lifecycle Engine is a manifest-driven, plugin-extensible pipeline that bootstraps, imports, synchronizes, and refreshes FLOW OS workspaces. It replaces the earlier demo-specific import logic with a universal, operation-aware stage runner that persists durable records in PostgreSQL and streams progress events over WebSocket.

Every operation runs the same underlying pipeline — the only difference is which stages execute. Dataset types are a registry of plugins; the engine itself is dataset-agnostic.

---

## 1. Overview

| Property | Value |
|----------|-------|
| Engine version | `2.0` |
| Schema version floor | `1.0` |
| Dataset types (built-in) | 23 |
| Operations | CREATE, IMPORT, SYNC, REFRESH, VALIDATE |
| Pipeline stages | 10 |
| Persistence | `import_records` table (PostgreSQL via Prisma) |
| Progress delivery | WebSocket broadcast to workspace channel |
| Entry point | `src/core/workspaceLifecycle/lifecycleEngine.js` |
| Route namespace | `/api/lifecycle/*` (7 routes) |

---

## 2. Manifest Contract

Every CREATE, IMPORT, SYNC, and VALIDATE request must include a manifest. REFRESH does not require one.

### Schema

```json
{
  "schemaVersion": "1.0",
  "engineVersion": "2.0",
  "organization": {
    "name": "Acme Corp",
    "slug": "acme-corp",
    "industry": "SaaS",
    "size": "200-500"
  },
  "datasets": [
    { "type": "employees", "file": "employees.json" },
    { "type": "projects" },
    { "type": "incidents" }
  ]
}
```

### Required fields

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `schemaVersion` | string | Yes | Must be `>= 1.0`. Requests below the floor are rejected. |
| `organization.name` | string | Yes | Display name for the org. |
| `organization.slug` | string | Yes | Unique identifier; used for `Organization.upsert`. |
| `organization.industry` | string | No | Stored but not validated. |
| `organization.size` | string | No | Stored but not validated. |
| `organization.plan` | string | No | Defaults to `"free"` when absent. |
| `engineVersion` | string | No | Informational only; not validated by the engine. |
| `datasets` | array | Yes | Non-empty array of `{ type, file? }` entries. |
| `datasets[].type` | string | Yes | Must match a registered dataset type. Unknown types emit a warning and are skipped — they do not block the operation. |
| `datasets[].file` | string | No | Informational metadata; the engine reads dataset records from the request body, not from disk. |

### Compatibility check

`manifestParser.getCompatibilityStatus(schemaVersion)` returns `"COMPATIBLE"` or `"INCOMPATIBLE"`. A manifest with an incompatible version is rejected before any stage runs.

---

## 3. Dataset Type Registry

### How it works

The registry is a `Map` backed by `src/core/workspaceLifecycle/datasetRegistry.js`. Dataset types are registered at startup as a side effect of importing `src/core/workspaceLifecycle/datasets/index.js`.

### API

```js
import {
  registerDatasetType,
  getDatasetHandler,
  getSupportedTypes,
  hasDatasetType,
} from './src/core/workspaceLifecycle/datasetRegistry.js';
```

| Function | Returns | Description |
|----------|---------|-------------|
| `registerDatasetType({ type, validator, normalizer, resolver, vectorizer, graphBuilder })` | void | Registers a new dataset type. Overwrites existing registration for the same type. |
| `getDatasetHandler(type)` | `handler \| null` | Retrieves the full handler object for a type. |
| `getSupportedTypes()` | `string[]` | Returns all registered type names. Served by `GET /api/lifecycle/schema`. |
| `hasDatasetType(type)` | `boolean` | Existence check used by `manifestParser`. |

### Handler interface

```js
registerDatasetType({
  type: 'my_type',

  // validator(records) → { valid: boolean, errors: string[], warnings: string[] }
  // Called in stageValidate. Return valid:false to abort the operation.
  validator: makeValidator(['id', 'name']),

  // normalizer(records) → records
  // Called in stageNormalize. Transform raw records to the shape your resolver/vectorizer expect.
  normalizer: identity,

  // resolver(records, globalIdMap) → { nodes: Node[], edges: Edge[] }
  // Called in stageResolveRelationships to build the cross-dataset entity map.
  resolver: makeResolver('MY_TYPE', [
    rec => rec.ownerId ? { sourceId: String(rec.id), targetId: String(rec.ownerId), type: 'OWNED_BY' } : null,
  ]),

  // vectorizer(records) → { text, channel, metadata }[]
  // Called in stageVectorize. Return [] to skip vectorization for this type.
  vectorizer: makeVectorizer('my_type', ['name', 'description']),

  // graphBuilder(records, globalIdMap) → { nodes: Node[], edges: Edge[] }
  // Called in stageGenerateGraphs to write nodes/edges to PostgreSQL and in-memory KG.
  graphBuilder: myResolver,
});
```

The factory helpers `makeValidator`, `makeVectorizer`, `makeResolver`, `identity`, `noGraph`, and `noVector` are exported from `src/core/workspaceLifecycle/datasets/builtinTypes.js` for convenience when adding new types.

### 23 built-in dataset types

| Type | Required fields | Graph node type | Vectorized fields | Edge types |
|------|----------------|-----------------|-------------------|------------|
| `summary` | `id` | — | `content`, `description` | — |
| `company` | `name`, `slug` | — | `description` | — |
| `employees` | `id`, `name` | USER | — | MEMBER_OF (dept, team) |
| `departments` | `id`, `name` | DEPARTMENT | — | — |
| `projects` | `id`, `name` | PROJECT | `name`, `description`, `status` | OWNED_BY, BELONGS_TO |
| `customers` | `id`, `name` | CUSTOMER | `name`, `description`, `industry` | — |
| `vendors` | `id`, `name` | VENDOR | — | — |
| `repositories` | `id`, `name` | SYSTEM | — | PART_OF (project) |
| `commits` | `id`, `message` | COMMIT | `message` | PART_OF (repo), AUTHORED_BY |
| `pull_requests` | `id`, `title` | PR | `title`, `description`, `body` | PART_OF (repo), AUTHORED_BY |
| `jira_issues` | `id`, `title` | ISSUE | `title`, `description` | PART_OF (project), ASSIGNED_TO |
| `emails` | `id`, `subject` | EMAIL | `subject`, `body`, `snippet` | — |
| `slack_threads` | `id` | COMMUNICATION | `messages[].text` | — |
| `calendar_events` | `id`, `title` | MEETING | — | — |
| `meetings` | `id`, `title` | MEETING | `title`, `notes`, `summary` | RELATES_TO (project) |
| `meeting_transcripts` | `id`, `content` | TRANSCRIPT | `content` | TRANSCRIPT_OF (meeting) |
| `incidents` | `id`, `title` | INCIDENT | `title`, `description`, `resolution` | AFFECTS (repo, project) |
| `documents` | `id`, `title`, `content` | DOCUMENT | `title`, `content` | — |
| `timeline` | `id`, `type`, `title` | EVENT | `title`, `description` | RELATES_TO (entity) |
| `memory` | `id`, `type` | — | `content`, `title` | — |
| `executive_reports` | `id`, `title` | DOCUMENT | `title`, `content`, `summary` | — |
| `knowledgeGraph` | — | passthrough | — | passthrough |
| `permissions` | — | — | — | — |

**Notes:**
- `knowledgeGraph`: the record at index 0 is expected to have `{ nodes: [], edges: [] }` arrays that are written directly to the graph.
- `permissions`: pure metadata — no graph nodes, no vector chunks.
- `employees`: in `stageBootstrapWorkspace`, employee records are also used to upsert `User` and `WorkspaceMember` rows. Default password is `changeme` (force-rotate on first login).
- `memory` and `timeline` records carry their own `type` field; the engine maps it to the closest valid `OrgMemoryRecord` type (`DECISION`, `INCIDENT`, `PROJECT_EVENT`, `CUSTOMER_EVENT`, `KNOWLEDGE_UPDATE`). Unknown types fall back to `PROJECT_EVENT`.

---

## 4. Pipeline Architecture

The engine runs a fixed sequence of async stage functions. Each stage emits WebSocket events before and after execution.

### The 10 stages

| # | Stage function | What it does |
|---|---------------|-------------|
| 1 | `stageValidate` | Runs each dataset type's `validator()` against the provided records. Returns per-type error lists. Raises `ValidationError` and aborts on any validation failure. **Fatal** — engine halts if this stage throws. |
| 2 | `stageNormalize` | Runs each dataset type's `normalizer()` on raw records. Normalized records are stored in `ctx.normalized`. Unknown types are skipped with a warning. |
| 3 | `stageResolveRelationships` | Calls each type's `resolver()` to build `ctx.globalIdMap` (id → `{ type, name }`) and `ctx.resolvedEdges`. This map is the authority for edge validation in later stages. |
| 4 | `stageBootstrapWorkspace` | Upserts `Organization`, `Workspace`, `User`, and `WorkspaceMember` rows via Prisma. Derives org from `manifest.organization`. Employee records are used to provision user accounts. **Fatal** — engine halts if this stage throws. |
| 5 | `stageGenerateGraphs` | Calls each type's `graphBuilder()` and writes all nodes/edges to the PostgreSQL operational graph (`upsertNode`, `upsertEdge`) and the in-memory Knowledge Graph (`registerEntity`, `linkEntities`). Edges whose endpoints are not in `globalIdMap` are skipped (logged as `skippedEdges`). |
| 6 | `stageIngestMemory` | Persists `incidents`, `documents`, `projects`, `timeline`, `memory`, `executive_reports`, and `customers` records to `OrgMemoryRecord` (PostgreSQL) via `saveMemory()`. |
| 7 | `stageVectorize` | Calls each type's `vectorizer()` and writes each non-empty text chunk to pgvector via `upsertVector()`. Increments `ctx.vectorCount`. |
| 8 | `stageRefreshRecommendations` | Fires `generateExplainableRecommendations()` synchronously. Non-fatal — stale recommendations are preferred over a blocked import. |
| 9 | `stageRefreshBriefings` | Fire-and-forgets `generateBriefing(workspaceId, orgId, 'EXECUTIVE')`. LLM latency must not block the import response. Non-fatal. |
| 10 | `stageWarmCopilot` | Fire-and-forgets a single copilot warmup question to seed the context cache for new workspace sessions. Non-fatal. |

### Fatal vs. non-fatal stages

Stages are non-fatal by default — an error is recorded in `stageErrors` and the pipeline continues. Two stages are **fatal**: `stageValidate` and `stageBootstrapWorkspace`. If either throws, the pipeline halts immediately and all subsequent stages are skipped. The `ImportRecord` is still persisted with `status: "FAILED"`.

### Execution context (`ctx`)

Every stage receives a shared context object:

```js
{
  workspaceId: string,
  orgId: string | null,        // set by stageBootstrapWorkspace
  manifest: ParsedManifest,
  datasets: Record<string, any[]>,
  normalized: Record<string, any[]>,  // filled by stageNormalize
  globalIdMap: Map<string, { type, name }>,  // filled by stageResolveRelationships
  resolvedEdges: Edge[],
  workspace: PrismaWorkspace | null,  // set by stageBootstrapWorkspace
  graphMetrics: { nodes: number, edges: number },
  memoryCount: number,
  vectorCount: number,
  operation: string,
  importId: string,
  emit(stage, status, message, data?): void,  // broadcasts WS event
}
```

---

## 5. Operations

### Operation → stage mapping

| Operation | Stages | Stage count |
|-----------|--------|-------------|
| CREATE | stageValidate → stageNormalize → stageResolveRelationships → stageBootstrapWorkspace → stageGenerateGraphs → stageIngestMemory → stageVectorize → stageRefreshRecommendations → stageRefreshBriefings → stageWarmCopilot | 10 |
| IMPORT | stageValidate → stageNormalize → stageResolveRelationships → stageBootstrapWorkspace → stageGenerateGraphs → stageIngestMemory → stageVectorize → stageRefreshRecommendations → stageRefreshBriefings | 9 |
| SYNC | stageValidate → stageNormalize → stageResolveRelationships → stageGenerateGraphs → stageIngestMemory → stageVectorize → stageRefreshRecommendations | 7 |
| REFRESH | stageGenerateGraphs → stageRefreshRecommendations → stageRefreshBriefings → stageWarmCopilot | 4 |
| VALIDATE | stageValidate | 1 |

### Operation semantics

**CREATE** — Full workspace bootstrap. Use when provisioning a new workspace from scratch. Upserts org + workspace + user accounts, builds full graph, indexes all vectors, warms the copilot. All 10 stages.

**IMPORT** — Same as CREATE but skips copilot warmup. Use when re-importing into an existing workspace or when copilot warmup should be deferred.

**SYNC** — Incremental update. Skips workspace bootstrap (assumes the workspace already exists). Use when pushing updated datasets (new employees, new issues, updated documents) without reprovisioning identity. Does not regenerate briefings.

**REFRESH** — Re-derives intelligence from existing data. No manifest required. Rebuilds graphs from normalized data already in the workspace, regenerates recommendations, briefings, and warms the copilot. Use after schema changes or intelligence model updates.

**VALIDATE** — Dry run. Calls `validateOnly()` which parses the manifest, validates each dataset type, checks for broken cross-dataset references, and returns a detailed per-type result. No database writes.

### ImportRecord lifecycle

Every operation except VALIDATE creates an `ImportRecord` before any stage runs:

```
status: RUNNING  → persisted before stage 1
status: COMPLETED | FAILED  → updated after last stage
```

The record stores:
- `importId` — human-readable `IMP-<8 char UUID fragment>` (e.g. `IMP-3F2A1B9C`)
- `operation` — one of CREATE / IMPORT / SYNC / REFRESH / VALIDATE
- `schemaVersion` — from manifest
- `engineVersion` — always `"2.0"`
- `statistics` — `{ datasets: [{ type, count }], memoryRecords, vectorChunks }`
- `graphMetrics` — `{ nodes, edges }`
- `errors` — array of `{ stage, error }` objects for failed stages
- `warnings` — manifest parser warnings (unknown types, etc.)

---

## 6. API Reference

All routes require:
- `Authorization: Bearer <jwt>` header
- `workspace-id` header (or `x-workspace-id`)

The workspace-id is enforced by a router-level middleware — missing header returns `400 ValidationError`.

---

### POST /api/lifecycle/create

Bootstrap a new workspace end-to-end.

**Request body**
```json
{
  "manifest": { ... },
  "datasets": {
    "employees": [{ "id": "e1", "name": "Alice", "email": "alice@acme.com", "role": "ADMIN" }],
    "departments": [{ "id": "d1", "name": "Engineering" }],
    "projects": [{ "id": "p1", "name": "Platform Rewrite", "ownerId": "e1", "departmentId": "d1" }]
  }
}
```

**Response** `200`
```json
{
  "success": true,
  "importId": "IMP-3F2A1B9C",
  "workspaceId": "workspace_corp_alpha",
  "operation": "CREATE",
  "status": "COMPLETED",
  "statistics": {
    "datasets": [
      { "type": "employees", "count": 1 },
      { "type": "departments", "count": 1 },
      { "type": "projects", "count": 1 }
    ],
    "memoryRecords": 1,
    "vectorChunks": 1
  },
  "graphMetrics": { "nodes": 3, "edges": 2 },
  "errors": null,
  "warnings": [],
  "startedAt": "2026-06-28T10:00:00.000Z",
  "completedAt": "2026-06-28T10:00:02.341Z"
}
```

**Error** `400` — manifest validation failure or missing workspace-id header.
**Error** `500` — fatal stage failure (stageBootstrapWorkspace); record persisted with `status: "FAILED"`.

---

### POST /api/lifecycle/import

Import datasets into an existing or new workspace. Identical to CREATE except `stageWarmCopilot` is skipped.

**Request body** — same shape as `/create`.

**Response** — same shape as `/create` with `"operation": "IMPORT"`.

---

### POST /api/lifecycle/sync

Incremental update. Skips workspace bootstrap and briefing refresh.

**Request body** — same shape as `/create`. Manifest and datasets required.

**Response** — same shape as `/create` with `"operation": "SYNC"`.

---

### POST /api/lifecycle/refresh

Re-derive intelligence from existing data. No manifest or datasets required.

**Request body** — empty `{}` or omit body entirely.

**Response**
```json
{
  "success": true,
  "importId": "IMP-A9C3E1F2",
  "operation": "REFRESH",
  "status": "COMPLETED",
  "graphMetrics": { "nodes": 0, "edges": 0 },
  "statistics": { "datasets": [], "memoryRecords": 0, "vectorChunks": 0 }
}
```

---

### POST /api/lifecycle/validate

Dry-run manifest and dataset validation. No database writes. Does not create an `ImportRecord`.

**Request body**
```json
{
  "manifest": { ... },
  "datasets": { ... }
}
```

**Response** `200` — validation passed
```json
{
  "success": true,
  "valid": true,
  "manifestErrors": [],
  "perType": {
    "employees": { "valid": true, "errors": [], "warnings": [] },
    "projects": { "valid": true, "errors": [], "warnings": [] }
  },
  "brokenReferences": [],
  "warnings": []
}
```

**Response** `200` — validation failed (HTTP 200, but `valid: false`)
```json
{
  "success": true,
  "valid": false,
  "manifestErrors": ["manifest.organization.slug is required"],
  "perType": {
    "employees": {
      "valid": false,
      "errors": ["[0] missing required field \"name\""],
      "warnings": []
    }
  },
  "brokenReferences": ["Broken ref: sourceId \"missing-user-id\""],
  "warnings": ["datasets[2] type \"custom_type\" is unknown — will be skipped during import"]
}
```

The `brokenReferences` check scans a `datasets.relationships` array (if present) for `sourceId`/`targetId` values that do not appear in any other dataset record's `id` field.

---

### GET /api/lifecycle/history

Returns the last 50 import records for the workspace, ordered most-recent first.

**Response** `200`
```json
{
  "success": true,
  "history": [
    {
      "id": "clx...",
      "importId": "IMP-3F2A1B9C",
      "workspaceId": "workspace_corp_alpha",
      "operation": "CREATE",
      "status": "COMPLETED",
      "schemaVersion": "1.0",
      "engineVersion": "2.0",
      "statistics": { ... },
      "graphMetrics": { "nodes": 42, "edges": 87 },
      "errors": null,
      "warnings": [],
      "startedAt": "2026-06-28T10:00:00.000Z",
      "completedAt": "2026-06-28T10:00:02.341Z",
      "createdAt": "2026-06-28T10:00:00.000Z"
    }
  ]
}
```

---

### GET /api/lifecycle/schema

Returns engine metadata and the list of all registered dataset types. Requires JWT auth and a `workspace-id` header (same as all other lifecycle endpoints).

**Response** `200`
```json
{
  "success": true,
  "supportedTypes": [
    "summary", "company", "employees", "departments", "projects",
    "customers", "vendors", "repositories", "commits", "pull_requests",
    "jira_issues", "emails", "slack_threads", "calendar_events", "meetings",
    "meeting_transcripts", "incidents", "documents", "timeline", "memory",
    "executive_reports", "knowledgeGraph", "permissions"
  ],
  "engineVersion": "2.0",
  "schemaVersionFloor": "1.0",
  "operations": ["CREATE", "IMPORT", "SYNC", "REFRESH", "VALIDATE"]
}
```

---

## 7. Progress Events

Every stage emits WebSocket events to the workspace channel via `broadcastToWorkspace`. Subscribe to the WebSocket at `ws://host:port?workspaceId=<id>`.

### Event types

| Event | When emitted |
|-------|-------------|
| `LIFECYCLE_STARTED` | Immediately after the `ImportRecord` is created, before stage 1 |
| `LIFECYCLE_STAGE_STARTED` | When a stage function begins |
| `LIFECYCLE_STAGE_COMPLETED` | When a stage function completes successfully |
| `LIFECYCLE_STAGE_FAILED` | When a stage function throws |
| `LIFECYCLE_COMPLETED` | After all stages finish with no errors |
| `LIFECYCLE_FAILED` | After stages finish with one or more errors |

### Payload shapes

**LIFECYCLE_STARTED**
```json
{ "importId": "IMP-3F2A1B9C", "operation": "CREATE" }
```

**LIFECYCLE_STAGE_STARTED / LIFECYCLE_STAGE_COMPLETED / LIFECYCLE_STAGE_FAILED**
```json
{
  "stage": "stageGenerateGraphs",
  "status": "completed",
  "message": "Graph generation complete",
  "importId": "IMP-3F2A1B9C",
  "nodes": 42,
  "edges": 87,
  "skippedEdges": 2
}
```

Additional fields in `data` vary by stage:
- `stageValidate` completed: `validatedTypes[]`, `unknownTypes[]`
- `stageNormalize` completed: `normalizedTypes[]`, `skipped[]`
- `stageResolveRelationships` completed: `totalEntities`, `totalEdges`
- `stageBootstrapWorkspace` completed: `orgId`, `workspaceDbId`, `usersUpserted`
- `stageGenerateGraphs` completed: `nodes`, `edges`, `skippedEdges`
- `stageIngestMemory` completed: `memoryCount`
- `stageVectorize` completed: `vectorCount`

**LIFECYCLE_COMPLETED**
```json
{
  "importId": "IMP-3F2A1B9C",
  "operation": "CREATE",
  "status": "COMPLETED",
  "graphMetrics": { "nodes": 42, "edges": 87 },
  "statistics": { "datasets": [...], "memoryRecords": 18, "vectorChunks": 34 },
  "errors": []
}
```

**LIFECYCLE_FAILED**
```json
{
  "importId": "IMP-3F2A1B9C",
  "operation": "IMPORT",
  "status": "FAILED",
  "graphMetrics": { "nodes": 0, "edges": 0 },
  "statistics": { "datasets": [], "memoryRecords": 0, "vectorChunks": 0 },
  "errors": [
    { "stage": "stageBootstrapWorkspace", "error": "Unique constraint failed on email" }
  ]
}
```

---

## 8. Idempotency

The engine is designed to be safe to re-run:

- **Organization and Workspace**: Upserted by `slug` and `externalId` respectively. Re-running CREATE/IMPORT with the same manifest updates `name` and `plan` but never creates duplicates.
- **Users**: Upserted by `email`. Re-running updates `fullName` and `role`.
- **WorkspaceMembers**: Upserted by `(userId, workspaceId)`. Re-running updates `role`.
- **Graph nodes/edges**: Both `upsertNode` and `upsertEdge` are idempotent writes.
- **Vector chunks**: `upsertVector` writes to pgvector. Repeated runs may create duplicate chunks for the same text if the source records change. Run a SYNC rather than repeated CREATEs to avoid chunk inflation.
- **ImportRecord**: A new record is created for every run. History is additive, not overwritten.
- **REFRESH**: Always safe to run; it only triggers in-memory re-scoring and fire-and-forget LLM calls.

---

## 9. Versioning

### Engine version

`ENGINE_VERSION = '2.0'` is exported from `src/core/workspaceLifecycle/manifestParser.js`. This value is stamped on every `ImportRecord`. Engine version changes indicate breaking pipeline changes.

### Schema version floor

`SCHEMA_VERSION_FLOOR = '1.0'`. Any manifest with `schemaVersion` below this floor is rejected by `parseManifest`. The floor exists to prevent legacy bundles from silently misfiring as the engine evolves.

### Compatibility check

```js
import { getCompatibilityStatus } from './src/core/workspaceLifecycle/manifestParser.js';

getCompatibilityStatus('1.0')  // → 'COMPATIBLE'
getCompatibilityStatus('2.0')  // → 'COMPATIBLE'
getCompatibilityStatus('0.9')  // → 'INCOMPATIBLE'
getCompatibilityStatus(null)   // → 'INCOMPATIBLE'
```

The check is a numeric version comparison: `major > floorMajor || (major === floorMajor && minor >= floorMinor)`.

---

## 10. Adding a New Dataset Type

Adding a type requires one file change and no engine changes.

**Step 1**: Open `src/core/workspaceLifecycle/datasets/builtinTypes.js`.

**Step 2**: Import the factory helpers (already available at the top of the file).

**Step 3**: Call `registerDatasetType` with your type definition:

```js
// Step 3 — register the type
const contractsResolver = makeResolver('CONTRACT', [
  rec => rec.customerId ? { sourceId: String(rec.id), targetId: String(rec.customerId), type: 'BELONGS_TO' } : null,
]);

registerDatasetType({
  type: 'contracts',
  validator: makeValidator(['id', 'title', 'value']),
  normalizer: identity,
  resolver: contractsResolver,
  vectorizer: makeVectorizer('contracts', ['title', 'description', 'terms']),
  graphBuilder: contractsResolver,
});
```

**Step 4**: Verify via `GET /api/lifecycle/schema` — `supportedTypes` should include `"contracts"`.

No other files need to change. The engine's stage functions iterate over the registry dynamically.

### Custom factory helpers

If `makeValidator`, `makeVectorizer`, or `makeResolver` don't cover your use case, implement the interface directly:

```js
registerDatasetType({
  type: 'custom_type',

  validator(records) {
    const errors = [];
    // your logic
    return { valid: errors.length === 0, errors, warnings: [] };
  },

  normalizer(records) {
    return records.map(r => ({ ...r, normalized: true }));
  },

  resolver(records, globalIdMap) {
    return { nodes: [], edges: [] };
  },

  vectorizer(records) {
    return records.flatMap(r => r.body ? [{ text: r.body, channel: 'custom_type', metadata: { id: r.id } }] : []);
  },

  graphBuilder(records, globalIdMap) {
    return { nodes: [], edges: [] };
  },
});
```

---

## 11. Adding a New Producer (Connector or External System)

A "producer" is any system that generates a workspace bundle and calls the lifecycle API. The engine is completely producer-agnostic — it only cares about the manifest + dataset shape.

**What the producer must do:**

1. Construct a manifest with `schemaVersion: "1.0"`, a valid `organization`, and a `datasets` array listing the types it provides.
2. Populate a `datasets` object keyed by type name, where each value is an array of records conforming to that type's required fields.
3. Call `POST /api/lifecycle/create` (first run) or `POST /api/lifecycle/sync` (updates).
4. Optionally subscribe to the workspace WebSocket to stream per-stage progress to the user.

**Example: a CSV-to-lifecycle producer**

```js
const manifest = {
  schemaVersion: '1.0',
  organization: { name: 'Acme Corp', slug: 'acme-corp' },
  datasets: [
    { type: 'employees', file: 'employees.csv' },
    { type: 'departments', file: 'departments.csv' },
  ],
};

const datasets = {
  employees: parsedEmployeesCsv,
  departments: parsedDepartmentsCsv,
};

await fetch('/api/lifecycle/create', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${jwt}`,
    'workspace-id': workspaceId,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ manifest, datasets }),
});
```

**What the producer does NOT need to do:**

- Know which stages run for which operation — the engine handles that.
- Write to the graph, memory, or vector store directly — all writes are handled by pipeline stages.
- Register dataset types — built-in types are already registered at startup.
- Change any engine code — adding a new producer requires zero engine changes.
