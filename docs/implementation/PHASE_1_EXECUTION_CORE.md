# FLOW OS — Phase 1: Execution Core
# Principal Architect Specification

> **Status:** Design Complete — Ready for Implementation
> **Authors:** FLOW Principal Architecture Team
> **Version:** 1.0.0
> **Scope:** The execution backbone for every future FLOW capability

---

## Executive Summary

The Execution Core is the foundation on which every FLOW workflow, autonomous operation, and connector action runs. It is not a feature — it is infrastructure. Every capability in the FLOW Capability Matrix that carries a ⏳ status is blocked on this layer being right.

**The three invariants of the Execution Core that cannot be compromised:**

1. **No action executes without governance.** Every step calls `executeAction()` from the Phase 14 Connector Framework. The Execution Core does not bypass or wrap around governance — it feeds into it.
2. **Every execution is fully auditable.** Every state transition, every step result, every approval decision, every retry writes a durable record. There is no "fire and forget."
3. **Humans remain in control.** The state machine includes `WaitingApproval` as a first-class state. Execution halts cleanly, persists its position, and resumes or cancels based on the human's decision.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Folder Structure](#2-folder-structure)
3. [State Machine](#3-state-machine)
4. [Database Schema](#4-database-schema)
5. [Redis Design](#5-redis-design)
6. [BullMQ Queue Design](#6-bullmq-queue-design)
7. [TypeScript Interfaces](#7-typescript-interfaces)
8. [Core Module Design](#8-core-module-design)
9. [API Endpoints](#9-api-endpoints)
10. [WebSocket Events](#10-websocket-events)
11. [Live Progress Streaming](#11-live-progress-streaming)
12. [Retry Logic](#12-retry-logic)
13. [Rollback Engine](#13-rollback-engine)
14. [Human Approval Gate](#14-human-approval-gate)
15. [Timeout Handling](#15-timeout-handling)
16. [Parallel & Sequential Execution](#16-parallel--sequential-execution)
17. [Execution Metrics](#17-execution-metrics)
18. [Implementation Steps](#18-implementation-steps)
19. [Testing Strategy](#19-testing-strategy)
20. [Acceptance Criteria](#20-acceptance-criteria)
21. [Production Checklist](#21-production-checklist)

---

## 1. Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                         API / WebSocket Layer                         │
│   POST /api/workflows/execute     GET /api/workflows/executions/:id  │
│   POST /api/workflows/:id/cancel  GET /api/workflows/:id/stream      │
└────────────────────────────┬─────────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────────┐
│                         Workflow Engine                               │
│   WorkflowEngine.launch(definition, input, ctx)                      │
│   WorkflowEngine.cancel(executionId)                                 │
│   WorkflowEngine.resume(executionId, approvalDecision)               │
└────────────────────────────┬─────────────────────────────────────────┘
                             │
            ┌────────────────┼──────────────────┐
            ▼                ▼                  ▼
    ┌──────────────┐ ┌──────────────┐  ┌──────────────────┐
    │  BullMQ      │ │ State        │  │ Approval Gate    │
    │  Queue       │ │ Machine      │  │                  │
    │  (Async bg)  │ │ (Transitions)│  │ (Pause/Resume)   │
    └──────┬───────┘ └──────┬───────┘  └────────┬─────────┘
           │                │                    │
           ▼                ▼                    ▼
┌──────────────────────────────────────────────────────────────────────┐
│                         Workflow Runner                               │
│   Executes the step graph for one WorkflowExecution                  │
└────────────────────────────┬─────────────────────────────────────────┘
                             │
                    ┌────────┴────────┐
                    │                 │
                    ▼                 ▼
           ┌──────────────┐  ┌──────────────────┐
           │  Step Runner │  │ Rollback Engine  │
           │  (per step)  │  │ (reverse order)  │
           └──────┬───────┘  └──────────────────┘
                  │
                  ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    Phase 14 Connector Framework                       │
│   executeAction(workspaceId, connectorId, actionType, payload, ctx)  │
│   Governance → Audit → Timeline → Connector → WebSocket              │
└──────────────────────────────────────────────────────────────────────┘
                  │
       ┌──────────┼──────────┬──────────┐
       ▼          ▼          ▼          ▼
  ┌─────────┐ ┌────────┐ ┌────────┐ ┌────────┐
  │ GitHub  │ │ Gmail  │ │  Jira  │ │ Slack  │ ...
  └─────────┘ └────────┘ └────────┘ └────────┘

Persistence Layer:
  PostgreSQL → workflow_executions, workflow_step_executions,
                execution_timeline, execution_metrics
  Redis      → Live state, step locks, cancel signals, approval waits
  BullMQ     → Job queues backed by Redis
```

### Design Principles

**The Execution Core is a state machine backed by three stores.** At any point in time, the authoritative state is PostgreSQL. Redis is the cache. BullMQ is the job dispatcher.

| Store | Role | Source of Truth |
|-------|------|----------------|
| PostgreSQL | Durable execution state | Yes — authoritative |
| Redis | Live state for fast reads + streaming | No — cache |
| BullMQ | Job dispatch and retry scheduling | No — dispatcher |

**State transitions happen in PostgreSQL first.** The sequence is always: write PG → update Redis → broadcast WebSocket. Never the reverse.

---

## 2. Folder Structure

```
src/workflow/
│
├── engine/
│   ├── WorkflowEngine.js          # Public API: launch, cancel, resume, retry
│   ├── WorkflowRunner.js          # Runs one execution: plans and walks the step graph
│   ├── StepRunner.js              # Runs one step: invokes executeAction, handles result
│   ├── StateMachine.js            # All legal transitions; throws on illegal transition
│   ├── RetryPolicy.js             # Backoff calculation, max-retry guard
│   ├── RollbackEngine.js          # Reverse-order rollback of completed steps
│   └── TimeoutManager.js          # Per-step and per-workflow timeout enforcement
│
├── definition/
│   ├── WorkflowDefinition.js      # Definition schema: steps, edges, metadata
│   ├── StepDefinition.js          # Step schema: connector, action, retry, timeout, rollback
│   ├── ExecutionPlanner.js        # Resolves variables, builds ordered execution graph
│   └── DefinitionValidator.js     # Validates definition before persisting
│
├── state/
│   ├── ExecutionStore.js          # PostgreSQL: all CRUD for executions + steps + timeline
│   ├── RedisStateStore.js         # Redis: live state hash, locks, cancel signals
│   └── StateSync.js               # Writes PG first, then Redis; handles Redis miss
│
├── jobs/
│   ├── workflowQueue.js           # BullMQ queue definitions (5 queues)
│   ├── workflowWorker.js          # BullMQ consumer: picks up jobs, calls WorkflowRunner
│   ├── stepWorker.js              # BullMQ consumer for parallel step fan-out
│   └── jobScheduler.js            # Schedules delayed jobs (approval timeout, cleanup)
│
├── streaming/
│   ├── ProgressStreamer.js        # Emits WebSocket events per state transition
│   ├── SseStreamer.js             # SSE endpoint handler for /stream
│   └── eventPayloads.js           # Canonical event payload builders
│
├── approval/
│   ├── ApprovalGate.js            # Pauses execution: creates PendingApproval, sets Redis wait
│   └── ApprovalListener.js        # Subscribes to eventBus: APPROVAL_RESOLVED → resume
│
├── metrics/
│   ├── ExecutionMetrics.js        # Records timings, counts, connector call distribution
│   └── WorkspaceMetrics.js        # Aggregated metrics per workspace (daily/weekly)
│
├── routes/
│   └── workflowRoutes.js          # Express routes mounted at /api/workflows
│
└── index.js                       # Barrel: exports WorkflowEngine + types
```

### Integration Points (existing code — do not duplicate)

| What | Where | How Used |
|------|-------|----------|
| `executeAction()` | `src/connectors/executionEngine.js` | Every step calls this; governance lives here |
| `approvalStore` | `src/core/governance/approvalStore.js` | ApprovalGate creates approvals here |
| `eventBus` | `src/core/events/eventBus.js` | ApprovalListener subscribes to `APPROVAL_RESOLVED` |
| `socketService.broadcast()` | `src/services/socketService.js` | ProgressStreamer calls this |
| `redis` | `src/config/redis.js` | Shared ioredis connection |
| `db` (pg.Pool) | `src/config/db.js` | ExecutionStore parameterized queries |
| `logger` | `src/utils/logger.js` | All modules use the shared logger |

---

## 3. State Machine

### States

| State | Meaning |
|-------|---------|
| `PENDING` | Execution created, not yet picked up by worker |
| `PLANNING` | WorkflowRunner resolving variables, building execution graph |
| `RUNNING` | Actively executing steps |
| `WAITING_APPROVAL` | Paused at a step that requires human approval |
| `RETRYING` | A step failed; retry is scheduled |
| `COMPLETED` | All steps finished successfully |
| `FAILED` | A step exhausted retries without success; workflow cannot continue |
| `CANCELLED` | Explicitly cancelled by a user or approval rejection |
| `ROLLED_BACK` | Failure triggered rollback; all reversible steps have been undone |

### Legal Transitions

```
PENDING          → PLANNING          (worker picks up job)
PENDING          → CANCELLED         (cancelled before worker picks up)

PLANNING         → RUNNING           (plan built successfully)
PLANNING         → FAILED            (plan build failed: validation error)
PLANNING         → CANCELLED         (cancelled during planning)

RUNNING          → WAITING_APPROVAL  (step requires approval)
RUNNING          → RETRYING          (step failed, retries remain)
RUNNING          → COMPLETED         (all steps done)
RUNNING          → FAILED            (step exhausted retries)
RUNNING          → CANCELLED         (cancel signal received)

WAITING_APPROVAL → RUNNING           (approval granted)
WAITING_APPROVAL → CANCELLED         (approval rejected or timed out)

RETRYING         → RUNNING           (retry started)
RETRYING         → FAILED            (all retries exhausted)
RETRYING         → CANCELLED         (cancel during retry wait)

FAILED           → ROLLED_BACK       (rollback completed)
FAILED           → CANCELLED         (cancel while rolled back)

COMPLETED        → (terminal — no further transitions)
CANCELLED        → (terminal)
ROLLED_BACK      → (terminal)
```

### StateMachine.js

```js
// src/workflow/engine/StateMachine.js

const TRANSITIONS = {
  PENDING:          ['PLANNING', 'CANCELLED'],
  PLANNING:         ['RUNNING', 'FAILED', 'CANCELLED'],
  RUNNING:          ['WAITING_APPROVAL', 'RETRYING', 'COMPLETED', 'FAILED', 'CANCELLED'],
  WAITING_APPROVAL: ['RUNNING', 'CANCELLED'],
  RETRYING:         ['RUNNING', 'FAILED', 'CANCELLED'],
  FAILED:           ['ROLLED_BACK', 'CANCELLED'],
  COMPLETED:        [],
  CANCELLED:        [],
  ROLLED_BACK:      [],
};

export function transition(current, next) {
  const allowed = TRANSITIONS[current];
  if (!allowed) throw new Error(`Unknown state: ${current}`);
  if (!allowed.includes(next)) {
    throw new Error(`Illegal transition: ${current} → ${next}`);
  }
  return next;
}

export function isTerminal(state) {
  return ['COMPLETED', 'CANCELLED', 'ROLLED_BACK'].includes(state);
}

export function canCancel(state) {
  return ['PENDING', 'PLANNING', 'RUNNING', 'WAITING_APPROVAL', 'RETRYING'].includes(state);
}
```

### Step States

Each `workflow_step_execution` row has its own status:

| Step State | Meaning |
|------------|---------|
| `PENDING` | Not yet started |
| `RUNNING` | Executing |
| `COMPLETED` | Succeeded |
| `FAILED` | Failed (may retry) |
| `SKIPPED` | Skipped due to condition |
| `WAITING_APPROVAL` | Blocked on human approval |
| `ROLLED_BACK` | Was completed; rollback executed |
| `TIMED_OUT` | Exceeded step timeout |

---

## 4. Database Schema

> Apply via `scripts/migrate-execution-core-v1.sql`. Never use `prisma migrate dev` for raw SQL migrations.

```sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: Execution Core v1.0
-- Safe to re-run (idempotent via CREATE TABLE IF NOT EXISTS + DO $$ blocks)
-- ─────────────────────────────────────────────────────────────────────────────

-- Enum: execution status
DO $$ BEGIN
  CREATE TYPE workflow_status AS ENUM (
    'PENDING', 'PLANNING', 'RUNNING', 'WAITING_APPROVAL',
    'RETRYING', 'COMPLETED', 'FAILED', 'CANCELLED', 'ROLLED_BACK'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Enum: step status
DO $$ BEGIN
  CREATE TYPE step_status AS ENUM (
    'PENDING', 'RUNNING', 'COMPLETED', 'FAILED',
    'SKIPPED', 'WAITING_APPROVAL', 'ROLLED_BACK', 'TIMED_OUT'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- workflow_definitions
-- The reusable template for a workflow. Versioned. Immutable once used.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workflow_definitions (
  id             TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  workspace_id   TEXT        NOT NULL,
  name           TEXT        NOT NULL,
  description    TEXT,
  version        INTEGER     NOT NULL DEFAULT 1,
  definition     JSONB       NOT NULL,       -- step graph, edges, metadata
  tags           TEXT[]      DEFAULT '{}',
  is_active      BOOLEAN     DEFAULT true,
  created_by     TEXT        NOT NULL,
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wdef_workspace ON workflow_definitions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_wdef_active    ON workflow_definitions(workspace_id, is_active);

-- ─────────────────────────────────────────────────────────────────────────────
-- workflow_executions
-- One row per launched workflow. The execution's authoritative state lives here.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workflow_executions (
  id                  TEXT             PRIMARY KEY DEFAULT gen_random_uuid()::text,
  workspace_id        TEXT             NOT NULL,
  definition_id       TEXT             REFERENCES workflow_definitions(id),
  definition_snapshot JSONB            NOT NULL,   -- frozen copy of definition at launch
  status              workflow_status  NOT NULL DEFAULT 'PENDING',

  triggered_by        TEXT             NOT NULL,   -- userId or 'system'
  trigger_source      TEXT,                        -- 'api' | 'recommendation' | 'schedule' | 'event'
  trigger_context     JSONB,                       -- payload that triggered this (e.g. recommendation item)

  input               JSONB,                       -- runtime variables injected at launch
  output              JSONB,                       -- aggregated step outputs at completion
  error_message       TEXT,
  error_step_id       TEXT,

  current_step_id     TEXT,
  plan                JSONB,                       -- ordered execution graph built during PLANNING
  total_steps         INTEGER          DEFAULT 0,
  completed_steps     INTEGER          DEFAULT 0,

  bull_job_id         TEXT,                        -- BullMQ job ID for this execution
  retry_count         INTEGER          DEFAULT 0,

  started_at          TIMESTAMPTZ,
  planned_at          TIMESTAMPTZ,
  completed_at        TIMESTAMPTZ,
  failed_at           TIMESTAMPTZ,
  cancelled_at        TIMESTAMPTZ,
  rolled_back_at      TIMESTAMPTZ,

  approval_id         TEXT,                        -- current pending_approvals.id if WAITING_APPROVAL

  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wexec_workspace        ON workflow_executions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_wexec_status           ON workflow_executions(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_wexec_definition       ON workflow_executions(definition_id);
CREATE INDEX IF NOT EXISTS idx_wexec_triggered_by     ON workflow_executions(workspace_id, triggered_by);
CREATE INDEX IF NOT EXISTS idx_wexec_created_at       ON workflow_executions(workspace_id, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- workflow_step_executions
-- One row per step per workflow execution.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workflow_step_executions (
  id              TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  execution_id    TEXT        NOT NULL REFERENCES workflow_executions(id) ON DELETE CASCADE,
  workspace_id    TEXT        NOT NULL,

  step_key        TEXT        NOT NULL,     -- matches key in definition (e.g. 'assign_reviewer')
  step_index      INTEGER     NOT NULL,     -- position in execution plan
  step_label      TEXT,                    -- human-readable label from definition
  group_id        TEXT,                    -- for parallel groups: all steps share a group_id

  status          step_status NOT NULL DEFAULT 'PENDING',

  connector       TEXT,                    -- which connector this step uses
  action          TEXT,                    -- which action (e.g. 'GITHUB_MERGE_PR')
  input           JSONB,                   -- resolved input at execution time
  output          JSONB,                   -- connector action result
  error_message   TEXT,
  error_code      TEXT,

  retry_count     INTEGER     DEFAULT 0,
  max_retries     INTEGER     DEFAULT 3,
  next_retry_at   TIMESTAMPTZ,

  timeout_ms      INTEGER,                 -- per-step timeout in milliseconds
  timed_out_at    TIMESTAMPTZ,

  approval_id     TEXT        REFERENCES pending_approvals(id),
  approval_decision TEXT,                  -- 'approved' | 'rejected' (set when resolved)

  rollback_action JSONB,                   -- { connector, action, payload } to undo this step
  rollback_output JSONB,
  rolled_back_at  TIMESTAMPTZ,

  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,

  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wstep_execution  ON workflow_step_executions(execution_id);
CREATE INDEX IF NOT EXISTS idx_wstep_workspace  ON workflow_step_executions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_wstep_status     ON workflow_step_executions(execution_id, status);
CREATE INDEX IF NOT EXISTS idx_wstep_group      ON workflow_step_executions(execution_id, group_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- execution_timeline
-- Append-only event log for every state change and notable event.
-- Used for the /timeline endpoint and audit trail.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS execution_timeline (
  id            TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  execution_id  TEXT        NOT NULL REFERENCES workflow_executions(id) ON DELETE CASCADE,
  step_id       TEXT        REFERENCES workflow_step_executions(id),
  workspace_id  TEXT        NOT NULL,

  event_type    TEXT        NOT NULL,   -- 'STATUS_CHANGED' | 'STEP_STARTED' | 'APPROVAL_REQUIRED' | ...
  from_status   TEXT,
  to_status     TEXT,
  actor         TEXT,
  message       TEXT,
  payload       JSONB,

  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_etl_execution ON execution_timeline(execution_id, created_at);
CREATE INDEX IF NOT EXISTS idx_etl_workspace ON execution_timeline(workspace_id, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- execution_metrics
-- Per-execution performance and distribution metrics.
-- One row per execution, updated incrementally.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS execution_metrics (
  id                   TEXT    PRIMARY KEY DEFAULT gen_random_uuid()::text,
  execution_id         TEXT    NOT NULL UNIQUE REFERENCES workflow_executions(id) ON DELETE CASCADE,
  workspace_id         TEXT    NOT NULL,

  total_steps          INTEGER DEFAULT 0,
  completed_steps      INTEGER DEFAULT 0,
  failed_steps         INTEGER DEFAULT 0,
  skipped_steps        INTEGER DEFAULT 0,
  retried_steps        INTEGER DEFAULT 0,
  rolled_back_steps    INTEGER DEFAULT 0,

  -- Timings in milliseconds
  total_duration_ms    INTEGER,
  planning_duration_ms INTEGER,
  execution_duration_ms INTEGER,
  approval_wait_ms     INTEGER DEFAULT 0,   -- cumulative time spent waiting for approvals
  retry_wait_ms        INTEGER DEFAULT 0,   -- cumulative time in retry backoff

  -- Per-step durations: { stepKey: durationMs }
  step_durations       JSONB   DEFAULT '{}',

  -- Per-connector call counts: { connectorId: count }
  connector_calls      JSONB   DEFAULT '{}',

  -- Per-connector total duration: { connectorId: totalMs }
  connector_durations  JSONB   DEFAULT '{}',

  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_emetrics_workspace ON execution_metrics(workspace_id);
```

---

## 5. Redis Design

All Redis keys use the `flow:wf:` prefix to avoid collision with other FLOW services.

```
# ─────────────────────────────────────────────────────────────────
# Live execution state hash  (authoritative during active execution)
# TTL: 48 hours after last update
# ─────────────────────────────────────────────────────────────────
KEY:   flow:wf:exec:{executionId}
TYPE:  HASH
TTL:   172800 (48h)
FIELDS:
  status          STRING   current WorkflowStatus
  currentStepKey  STRING   step key being run
  progress        STRING   "3/7" (completed/total)
  workspaceId     STRING
  updatedAt       STRING   ISO timestamp

# ─────────────────────────────────────────────────────────────────
# Step execution lock  (prevents double-execution of same step)
# Released on step completion. TTL = step timeout + 10s buffer.
# ─────────────────────────────────────────────────────────────────
KEY:   flow:wf:step:lock:{executionId}:{stepKey}
TYPE:  STRING  ("locked")
TTL:   step.timeoutMs / 1000 + 10

# ─────────────────────────────────────────────────────────────────
# Approval wait index  (quick lookup: approvalId → executionId)
# Allows ApprovalListener to find which execution to resume.
# TTL: 50 hours (slightly longer than approval 48h TTL)
# ─────────────────────────────────────────────────────────────────
KEY:   flow:wf:approval:{approvalId}
TYPE:  STRING  (executionId)
TTL:   180000 (50h)

# ─────────────────────────────────────────────────────────────────
# Cancel signal  (checked by StepRunner before each step starts)
# Set by WorkflowEngine.cancel(). Worker polls this at step boundaries.
# TTL: 5 minutes (enough for the next step check)
# ─────────────────────────────────────────────────────────────────
KEY:   flow:wf:cancel:{executionId}
TYPE:  STRING  ("1")
TTL:   300 (5min)

# ─────────────────────────────────────────────────────────────────
# Workspace execution counters  (fast increment, read for metrics)
# ─────────────────────────────────────────────────────────────────
KEY:   flow:wf:metrics:{workspaceId}:launched   (COUNTER)
KEY:   flow:wf:metrics:{workspaceId}:completed  (COUNTER)
KEY:   flow:wf:metrics:{workspaceId}:failed     (COUNTER)
KEY:   flow:wf:metrics:{workspaceId}:cancelled  (COUNTER)
TTL:   None (rolling counters; reset via daily cleanup job)

# ─────────────────────────────────────────────────────────────────
# Rate limit: max concurrent executions per workspace
# ─────────────────────────────────────────────────────────────────
KEY:   flow:wf:ratelimit:{workspaceId}
TYPE:  Sliding window counter (via BullMQ rate limiter)
TTL:   60 (window of 1 minute)

# ─────────────────────────────────────────────────────────────────
# SSE subscriber registry  (which clients are streaming which execution)
# Set when client connects to /stream, deleted on disconnect.
# ─────────────────────────────────────────────────────────────────
KEY:   flow:wf:stream:{executionId}
TYPE:  SET  (connectionIds)
TTL:   3600 (1h — cleaned up on disconnect)
```

### Redis Operations Summary

| Operation | Key | Command | When |
|-----------|-----|---------|------|
| Set live state | `exec:{id}` | `HSET` + `EXPIRE` | Every state transition |
| Read live state | `exec:{id}` | `HGETALL` | GET /executions/:id (fast path) |
| Lock step | `step:lock:{id}:{key}` | `SET NX EX` | Before running a step |
| Release step lock | `step:lock:{id}:{key}` | `DEL` | After step completes/fails |
| Set approval wait | `approval:{approvalId}` | `SET EX` | When entering WAITING_APPROVAL |
| Look up execution for approval | `approval:{approvalId}` | `GET` | On approval resolution |
| Set cancel signal | `cancel:{id}` | `SET EX 300` | On cancel request |
| Check cancel signal | `cancel:{id}` | `EXISTS` | Before each step |
| Increment counters | `metrics:{ws}:launched` | `INCR` | On each status transition |

---

## 6. BullMQ Queue Design

Five queues. Each queue has a dedicated worker. Queues use the shared `ioredis` connection from `src/config/redis.js`.

```
┌────────────────────────────────────────────────────────────────────┐
│  Queue: workflow-execution                                          │
│  One job per workflow execution. The primary queue.                 │
│  Concurrency: 20 (configurable via WORKFLOW_CONCURRENCY env var)   │
│  Job data: { executionId, workspaceId }                            │
│  Processor: WorkflowRunner.run(executionId)                        │
└────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────┐
│  Queue: workflow-step                                               │
│  Fan-out queue for parallel step groups.                           │
│  Each job = one step within a parallel group.                       │
│  Concurrency: 50                                                    │
│  Job data: { executionId, stepId, workspaceId }                    │
│  Processor: StepRunner.runById(stepId)                             │
└────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────┐
│  Queue: workflow-retry                                              │
│  Delayed queue for scheduled retries.                               │
│  Delay is set per-job (exponential backoff).                       │
│  Job data: { executionId, stepId, retryCount, workspaceId }        │
│  Processor: StepRunner.retryById(stepId)                           │
└────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────┐
│  Queue: workflow-approval-timeout                                   │
│  One delayed job per approval. Fires when approval TTL expires.    │
│  Default delay: 48 hours (APPROVAL_TIMEOUT_MS env var)             │
│  Job data: { executionId, approvalId, workspaceId }                │
│  Processor: ApprovalGate.timeout(executionId, approvalId)          │
└────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────┐
│  Queue: workflow-cleanup                                            │
│  Cron job: daily at 2 AM. Archives stale executions.               │
│  Concurrency: 1 (sequential cleanup)                                │
│  Processor: CleanupJob.run()                                       │
└────────────────────────────────────────────────────────────────────┘
```

### Queue Configuration

```js
// src/workflow/jobs/workflowQueue.js

import { Queue, Worker, QueueScheduler } from 'bullmq';
import { redis } from '../../config/redis.js';

const connection = redis;

export const executionQueue = new Queue('workflow-execution', {
  connection,
  defaultJobOptions: {
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 500 },
    attempts: 1,          // Retry logic is handled in-process, not by BullMQ
    backoff: { type: 'fixed', delay: 1000 },
  },
});

export const stepQueue = new Queue('workflow-step', {
  connection,
  defaultJobOptions: {
    removeOnComplete: { count: 2000 },
    removeOnFail: { count: 200 },
    attempts: 1,
  },
});

export const retryQueue = new Queue('workflow-retry', {
  connection,
  defaultJobOptions: {
    removeOnComplete: { count: 200 },
    removeOnFail: { count: 200 },
  },
});

export const approvalTimeoutQueue = new Queue('workflow-approval-timeout', {
  connection,
  defaultJobOptions: {
    removeOnComplete: true,
    removeOnFail: { count: 100 },
  },
});

export const cleanupQueue = new Queue('workflow-cleanup', {
  connection,
  defaultJobOptions: { removeOnComplete: true },
});
```

### Job Data Schema

```js
// workflow-execution job
{ executionId: 'exec-abc123', workspaceId: 'ws-xyz', launchedAt: '2026-07-20T...' }

// workflow-step job (parallel fan-out)
{ executionId: 'exec-abc123', stepId: 'step-001', workspaceId: 'ws-xyz', groupId: 'group-A' }

// workflow-retry job
{ executionId: 'exec-abc123', stepId: 'step-001', workspaceId: 'ws-xyz',
  retryCount: 2, maxRetries: 3, originalError: 'Rate limit exceeded' }

// workflow-approval-timeout job
{ executionId: 'exec-abc123', approvalId: 'approval-789', workspaceId: 'ws-xyz' }
```

---

## 7. TypeScript Interfaces

> FLOW OS uses JavaScript (ESM). These interfaces serve as the authoritative type contract and will be implemented as JSDoc + runtime validation.

```typescript
// ──────────────────────────────────────────────────────────────
// Workflow Definition
// ──────────────────────────────────────────────────────────────

type WorkflowStatus =
  | 'PENDING' | 'PLANNING' | 'RUNNING' | 'WAITING_APPROVAL'
  | 'RETRYING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'ROLLED_BACK';

type StepStatus =
  | 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED'
  | 'SKIPPED' | 'WAITING_APPROVAL' | 'ROLLED_BACK' | 'TIMED_OUT';

type ExecutionMode = 'sequential' | 'parallel';

interface StepDefinition {
  key: string;                     // unique within the workflow
  label: string;                   // human-readable display name
  connector: string;               // e.g. 'github', 'gmail'
  action: string;                  // e.g. 'GITHUB_MERGE_PR'
  input: Record<string, unknown>;  // may reference $vars from workflow input
  mode?: ExecutionMode;            // default: 'sequential'
  groupId?: string;                // parallel steps share a groupId
  condition?: string;              // JS expression: "{{ $prev.output.approved === true }}"
  retry?: RetryConfig;
  timeout?: TimeoutConfig;
  rollback?: RollbackAction;       // how to undo this step if workflow fails
  onFailure?: 'fail' | 'skip' | 'rollback';  // default: 'fail'
}

interface RetryConfig {
  maxAttempts: number;             // default: 3
  backoff: 'exponential' | 'fixed' | 'linear';
  initialDelayMs: number;          // default: 1000
  maxDelayMs: number;              // default: 30000
  retryOn?: string[];              // error codes to retry on (default: all transient)
}

interface TimeoutConfig {
  stepTimeoutMs: number;           // per-step timeout
  workflowTimeoutMs?: number;      // total workflow timeout
}

interface RollbackAction {
  connector: string;
  action: string;
  input: Record<string, unknown>;  // may reference $step.output
}

interface WorkflowDefinition {
  name: string;
  description: string;
  version: number;
  tags?: string[];
  steps: StepDefinition[];
  onFailure?: 'rollback' | 'cancel' | 'notify';  // default: 'cancel'
  timeout?: TimeoutConfig;
  variables?: Record<string, unknown>;  // default values for input variables
}

// ──────────────────────────────────────────────────────────────
// Execution Records
// ──────────────────────────────────────────────────────────────

interface WorkflowExecution {
  id: string;
  workspaceId: string;
  definitionId?: string;
  definitionSnapshot: WorkflowDefinition;
  status: WorkflowStatus;
  triggeredBy: string;
  triggerSource: 'api' | 'recommendation' | 'schedule' | 'event' | 'manual';
  triggerContext?: Record<string, unknown>;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  errorMessage?: string;
  errorStepId?: string;
  currentStepId?: string;
  plan?: ExecutionPlan;
  totalSteps: number;
  completedSteps: number;
  bullJobId?: string;
  retryCount: number;
  startedAt?: string;
  plannedAt?: string;
  completedAt?: string;
  failedAt?: string;
  cancelledAt?: string;
  rolledBackAt?: string;
  approvalId?: string;
  createdAt: string;
  updatedAt: string;
}

interface WorkflowStepExecution {
  id: string;
  executionId: string;
  workspaceId: string;
  stepKey: string;
  stepIndex: number;
  stepLabel?: string;
  groupId?: string;
  status: StepStatus;
  connector?: string;
  action?: string;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  errorMessage?: string;
  errorCode?: string;
  retryCount: number;
  maxRetries: number;
  nextRetryAt?: string;
  timeoutMs?: number;
  timedOutAt?: string;
  approvalId?: string;
  approvalDecision?: 'approved' | 'rejected';
  rollbackAction?: RollbackAction;
  rollbackOutput?: Record<string, unknown>;
  rolledBackAt?: string;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
}

// ──────────────────────────────────────────────────────────────
// Execution Plan (built during PLANNING phase)
// ──────────────────────────────────────────────────────────────

interface ExecutionPlan {
  groups: ExecutionGroup[];        // ordered list of sequential groups
  totalSteps: number;
  estimatedDurationMs?: number;
}

interface ExecutionGroup {
  groupId: string;
  mode: ExecutionMode;             // all steps in group run in parallel or sequential
  steps: ResolvedStep[];
}

interface ResolvedStep {
  stepId: string;                  // workflow_step_executions.id (pre-created)
  stepKey: string;
  stepLabel: string;
  connector: string;
  action: string;
  resolvedInput: Record<string, unknown>;  // variables resolved from workflow input
  condition?: string;
  retry: RetryConfig;
  timeout: TimeoutConfig;
  rollback?: RollbackAction;
  onFailure: 'fail' | 'skip' | 'rollback';
}

// ──────────────────────────────────────────────────────────────
// Timeline Events
// ──────────────────────────────────────────────────────────────

type TimelineEventType =
  | 'EXECUTION_CREATED'
  | 'STATUS_CHANGED'
  | 'STEP_STARTED'
  | 'STEP_COMPLETED'
  | 'STEP_FAILED'
  | 'STEP_RETRYING'
  | 'STEP_SKIPPED'
  | 'STEP_TIMED_OUT'
  | 'STEP_ROLLED_BACK'
  | 'APPROVAL_REQUIRED'
  | 'APPROVAL_RESOLVED'
  | 'APPROVAL_TIMED_OUT'
  | 'CANCEL_REQUESTED'
  | 'ROLLBACK_STARTED'
  | 'ROLLBACK_COMPLETED'
  | 'ERROR';

interface TimelineEvent {
  id: string;
  executionId: string;
  stepId?: string;
  workspaceId: string;
  eventType: TimelineEventType;
  fromStatus?: string;
  toStatus?: string;
  actor?: string;
  message?: string;
  payload?: Record<string, unknown>;
  createdAt: string;
}

// ──────────────────────────────────────────────────────────────
// Metrics
// ──────────────────────────────────────────────────────────────

interface ExecutionMetrics {
  id: string;
  executionId: string;
  workspaceId: string;
  totalSteps: number;
  completedSteps: number;
  failedSteps: number;
  skippedSteps: number;
  retriedSteps: number;
  rolledBackSteps: number;
  totalDurationMs?: number;
  planningDurationMs?: number;
  executionDurationMs?: number;
  approvalWaitMs: number;
  retryWaitMs: number;
  stepDurations: Record<string, number>;
  connectorCalls: Record<string, number>;
  connectorDurations: Record<string, number>;
  createdAt: string;
  updatedAt: string;
}

// ──────────────────────────────────────────────────────────────
// API Request/Response
// ──────────────────────────────────────────────────────────────

interface LaunchExecutionRequest {
  definitionId?: string;           // run from a saved definition
  definition?: WorkflowDefinition; // or provide inline
  input?: Record<string, unknown>;
  triggerSource?: string;
  triggerContext?: Record<string, unknown>;
}

interface LaunchExecutionResponse {
  executionId: string;
  status: 'PENDING';
  bullJobId: string;
  estimatedSteps?: number;
  streamUrl: string;               // /api/workflows/executions/:id/stream
}

interface CancelExecutionResponse {
  executionId: string;
  previousStatus: WorkflowStatus;
  status: 'CANCELLED';
  cancelledAt: string;
}
```

---

## 8. Core Module Design

### 8.1 WorkflowEngine.js — Public API

```js
// src/workflow/engine/WorkflowEngine.js

import { executionQueue, approvalTimeoutQueue } from '../jobs/workflowQueue.js';
import { ExecutionStore } from '../state/ExecutionStore.js';
import { RedisStateStore } from '../state/RedisStateStore.js';
import { StateMachine, canCancel } from './StateMachine.js';
import { DefinitionValidator } from '../definition/DefinitionValidator.js';
import { ProgressStreamer } from '../streaming/ProgressStreamer.js';
import { logger } from '../../utils/logger.js';

export class WorkflowEngine {
  /**
   * Launch a new workflow execution.
   * Returns immediately; execution runs in background via BullMQ.
   */
  static async launch(definition, input, ctx) {
    const { workspaceId, userId } = ctx;

    // 1. Validate the definition
    DefinitionValidator.validate(definition);

    // 2. Persist the execution record in PENDING state
    const execution = await ExecutionStore.createExecution({
      workspaceId,
      definitionSnapshot: definition,
      triggeredBy: userId,
      triggerSource: ctx.triggerSource ?? 'api',
      triggerContext: ctx.triggerContext,
      input,
      status: 'PENDING',
    });

    // 3. Initialize live Redis state
    await RedisStateStore.setExecutionState(execution.id, {
      status: 'PENDING',
      workspaceId,
      progress: '0/0',
    });

    // 4. Enqueue background job
    const job = await executionQueue.add('run', {
      executionId: execution.id,
      workspaceId,
    });

    // 5. Persist job ID back to execution record
    await ExecutionStore.updateExecution(execution.id, { bullJobId: job.id });

    // 6. Broadcast initial event
    ProgressStreamer.emit(workspaceId, execution.id, 'WORKFLOW_CREATED', {
      executionId: execution.id,
      status: 'PENDING',
    });

    return {
      executionId: execution.id,
      status: 'PENDING',
      bullJobId: job.id,
      streamUrl: `/api/workflows/executions/${execution.id}/stream`,
    };
  }

  /**
   * Cancel a running or waiting execution.
   * Safe to call at any time — no-op if already terminal.
   */
  static async cancel(executionId, cancelledBy) {
    const execution = await ExecutionStore.getExecution(executionId);
    if (!execution) throw new AppError(404, 'Execution not found');
    if (!canCancel(execution.status)) {
      throw new AppError(409, `Cannot cancel execution in state: ${execution.status}`);
    }

    // 1. Set cancel signal in Redis (StepRunner checks this before each step)
    await RedisStateStore.setCancelSignal(executionId);

    // 2. Transition status in PostgreSQL
    const previous = execution.status;
    await ExecutionStore.transitionStatus(executionId, 'CANCELLED', {
      cancelledAt: new Date().toISOString(),
    });

    // 3. Update Redis state
    await RedisStateStore.setExecutionState(executionId, { status: 'CANCELLED' });

    // 4. Write timeline event
    await ExecutionStore.appendTimeline(executionId, {
      eventType: 'STATUS_CHANGED',
      fromStatus: previous,
      toStatus: 'CANCELLED',
      actor: cancelledBy,
    });

    // 5. Broadcast
    ProgressStreamer.emit(execution.workspaceId, executionId, 'WORKFLOW_CANCELLED', {
      executionId, cancelledBy, previousStatus: previous,
    });

    return { executionId, previousStatus: previous, status: 'CANCELLED' };
  }

  /**
   * Resume execution after approval is resolved.
   * Called by ApprovalListener on APPROVAL_RESOLVED event.
   */
  static async resume(executionId, approvalDecision, approvedBy) {
    const execution = await ExecutionStore.getExecution(executionId);
    if (execution.status !== 'WAITING_APPROVAL') {
      logger.warn(`resume called on non-waiting execution: ${executionId} (${execution.status})`);
      return;
    }

    if (approvalDecision === 'rejected') {
      return WorkflowEngine.cancel(executionId, approvedBy);
    }

    // Transition back to RUNNING and re-enqueue
    await ExecutionStore.transitionStatus(executionId, 'RUNNING');
    await RedisStateStore.setExecutionState(executionId, { status: 'RUNNING' });
    await ExecutionStore.appendTimeline(executionId, {
      eventType: 'APPROVAL_RESOLVED',
      fromStatus: 'WAITING_APPROVAL',
      toStatus: 'RUNNING',
      actor: approvedBy,
    });

    await executionQueue.add('resume', { executionId, workspaceId: execution.workspaceId });

    ProgressStreamer.emit(execution.workspaceId, executionId, 'WORKFLOW_RESUMED', {
      executionId, approvedBy,
    });
  }

  /**
   * Get execution with Redis fast-path for live state.
   */
  static async getExecution(executionId) {
    const liveState = await RedisStateStore.getExecutionState(executionId);
    if (liveState) {
      // Merge live state into PG record for real-time accuracy
      const record = await ExecutionStore.getExecution(executionId);
      return { ...record, ...liveState };
    }
    return ExecutionStore.getExecution(executionId);
  }
}
```

### 8.2 WorkflowRunner.js — Core Execution Loop

```js
// src/workflow/engine/WorkflowRunner.js

import { ExecutionPlanner } from '../definition/ExecutionPlanner.js';
import { StepRunner } from './StepRunner.js';
import { RollbackEngine } from './RollbackEngine.js';
import { StateMachine } from './StateMachine.js';
import { ExecutionStore } from '../state/ExecutionStore.js';
import { RedisStateStore } from '../state/RedisStateStore.js';
import { ProgressStreamer } from '../streaming/ProgressStreamer.js';
import { ExecutionMetrics } from '../metrics/ExecutionMetrics.js';

export class WorkflowRunner {
  /**
   * Main entry point called by workflowWorker.js.
   */
  static async run(executionId) {
    const execution = await ExecutionStore.getExecution(executionId);
    const startedAt = new Date();

    try {
      // ── PLANNING ────────────────────────────────────────────────────────
      await WorkflowRunner._transition(execution, 'PLANNING');

      const plan = await ExecutionPlanner.build(
        execution.definitionSnapshot,
        execution.input,
        execution.workspaceId,
      );

      await ExecutionStore.updateExecution(executionId, {
        plan,
        totalSteps: plan.totalSteps,
        plannedAt: new Date().toISOString(),
      });

      // ── RUNNING ─────────────────────────────────────────────────────────
      await WorkflowRunner._transition(execution, 'RUNNING', { startedAt: startedAt.toISOString() });

      // Initialize metrics row
      await ExecutionMetrics.init(executionId, execution.workspaceId, plan.totalSteps);

      // Walk the execution plan: groups are sequential; steps within a group may be parallel
      let aggregatedOutput = {};
      for (const group of plan.groups) {
        // Check cancel signal before each group
        if (await RedisStateStore.isCancelled(executionId)) break;

        const groupResults = await WorkflowRunner._runGroup(group, execution, aggregatedOutput);
        Object.assign(aggregatedOutput, groupResults);
      }

      // ── COMPLETED ───────────────────────────────────────────────────────
      const finalStatus = await RedisStateStore.isCancelled(executionId)
        ? 'CANCELLED'
        : 'COMPLETED';

      await ExecutionStore.transitionStatus(executionId, finalStatus, {
        completedAt: new Date().toISOString(),
        output: aggregatedOutput,
      });

      await ExecutionMetrics.finalize(executionId, startedAt);
      ProgressStreamer.emit(execution.workspaceId, executionId, `WORKFLOW_${finalStatus}`, {
        executionId, output: aggregatedOutput,
      });

    } catch (err) {
      await WorkflowRunner._handleFailure(execution, err);
    }
  }

  static async _runGroup(group, execution, previousOutput) {
    if (group.mode === 'parallel') {
      return WorkflowRunner._runParallel(group, execution, previousOutput);
    }
    return WorkflowRunner._runSequential(group, execution, previousOutput);
  }

  static async _runSequential(group, execution, previousOutput) {
    const groupOutput = {};
    for (const step of group.steps) {
      if (await RedisStateStore.isCancelled(execution.id)) break;
      const result = await StepRunner.run(step, execution, previousOutput);
      if (result) groupOutput[step.stepKey] = result;
    }
    return groupOutput;
  }

  static async _runParallel(group, execution, previousOutput) {
    const results = await Promise.allSettled(
      group.steps.map(step => StepRunner.run(step, execution, previousOutput)),
    );

    const groupOutput = {};
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (r.status === 'fulfilled' && r.value) {
        groupOutput[group.steps[i].stepKey] = r.value;
      } else if (r.status === 'rejected') {
        // Parallel step failure: propagate; other steps already ran
        throw r.reason;
      }
    }
    return groupOutput;
  }

  static async _handleFailure(execution, err) {
    await ExecutionStore.transitionStatus(execution.id, 'FAILED', {
      failedAt: new Date().toISOString(),
      errorMessage: err.message,
    });

    ProgressStreamer.emit(execution.workspaceId, execution.id, 'WORKFLOW_FAILED', {
      executionId: execution.id, error: err.message,
    });

    // Trigger rollback if definition specifies it
    if (execution.definitionSnapshot.onFailure === 'rollback') {
      await RollbackEngine.rollback(execution.id);
    }
  }

  static async _transition(execution, status, updates = {}) {
    StateMachine.transition(execution.status, status);
    execution.status = status;
    await ExecutionStore.transitionStatus(execution.id, status, updates);
    await RedisStateStore.setExecutionState(execution.id, { status });
    await ExecutionStore.appendTimeline(execution.id, {
      eventType: 'STATUS_CHANGED', fromStatus: execution.status, toStatus: status,
    });
    ProgressStreamer.emit(execution.workspaceId, execution.id, `WORKFLOW_${status}`, {
      executionId: execution.id, status,
    });
  }
}
```

### 8.3 StepRunner.js — Single Step Execution

```js
// src/workflow/engine/StepRunner.js

import { executeAction } from '../../connectors/executionEngine.js';
import { ApprovalGate } from '../approval/ApprovalGate.js';
import { RetryPolicy } from './RetryPolicy.js';
import { TimeoutManager } from './TimeoutManager.js';
import { ExecutionStore } from '../state/ExecutionStore.js';
import { RedisStateStore } from '../state/RedisStateStore.js';
import { ProgressStreamer } from '../streaming/ProgressStreamer.js';
import { ExecutionMetrics } from '../metrics/ExecutionMetrics.js';
import { resolveVariables } from '../definition/ExecutionPlanner.js';
import { logger } from '../../utils/logger.js';

export class StepRunner {
  static async run(resolvedStep, execution, previousOutput) {
    const { stepId, stepKey, connector, action, resolvedInput, retry, timeout, onFailure } = resolvedStep;
    const { id: executionId, workspaceId } = execution;

    // Check cancel signal
    if (await RedisStateStore.isCancelled(executionId)) return null;

    // Acquire step lock (prevent double-execution in parallel scenarios)
    const locked = await RedisStateStore.acquireStepLock(executionId, stepKey, timeout.stepTimeoutMs);
    if (!locked) {
      logger.warn(`Step ${stepKey} already locked for execution ${executionId} — skipping`);
      return null;
    }

    const startedAt = Date.now();

    try {
      await ExecutionStore.updateStep(stepId, {
        status: 'RUNNING',
        startedAt: new Date().toISOString(),
      });

      await ExecutionStore.appendTimeline(executionId, {
        stepId, eventType: 'STEP_STARTED', message: `Starting: ${stepKey}`,
      });

      ProgressStreamer.emit(workspaceId, executionId, 'WORKFLOW_STEP_STARTED', { stepId, stepKey });

      // Update live progress
      await RedisStateStore.updateProgress(executionId, stepKey);

      // Resolve late-binding variables (e.g., reference previous step output)
      const finalInput = resolveVariables(resolvedInput, { previousOutput, workspaceId });

      // Run with timeout wrapper
      const result = await TimeoutManager.withTimeout(
        () => StepRunner._executeStep(stepId, executionId, workspaceId, connector, action, finalInput),
        timeout.stepTimeoutMs,
        `Step ${stepKey} timed out after ${timeout.stepTimeoutMs}ms`,
      );

      // Step succeeded
      const durationMs = Date.now() - startedAt;
      await ExecutionStore.updateStep(stepId, {
        status: 'COMPLETED',
        output: result,
        completedAt: new Date().toISOString(),
      });

      await ExecutionStore.appendTimeline(executionId, {
        stepId, eventType: 'STEP_COMPLETED',
        payload: { durationMs, connector, action },
      });

      await ExecutionMetrics.recordStepComplete(executionId, stepKey, connector, durationMs);

      ProgressStreamer.emit(workspaceId, executionId, 'WORKFLOW_STEP_COMPLETED', {
        stepId, stepKey, durationMs, output: result,
      });

      return result;

    } catch (err) {
      const durationMs = Date.now() - startedAt;
      return StepRunner._handleStepFailure(
        { stepId, stepKey, connector, action, retry, onFailure, executionId, workspaceId },
        err, durationMs, execution,
      );
    } finally {
      await RedisStateStore.releaseStepLock(executionId, stepKey);
    }
  }

  static async _executeStep(stepId, executionId, workspaceId, connector, action, input) {
    try {
      const result = await executeAction(workspaceId, connector, action, input, {
        actorRole: 'MEMBER',          // Automation always runs as MEMBER (invariant from Phase 14)
        approvedBy: null,
        executionId,
        stepId,
      });

      // If governance returns APPROVAL_REQUIRED, pause the workflow
      if (result?.approvalRequired || result?.approvalId) {
        throw new ApprovalRequiredError(result.approvalId);
      }

      return result;
    } catch (err) {
      if (err instanceof ApprovalRequiredError) throw err;
      throw err;
    }
  }

  static async _handleStepFailure(ctx, err, durationMs, execution) {
    const { stepId, stepKey, connector, retry, onFailure, executionId, workspaceId } = ctx;

    // ── Approval pause ─────────────────────────────────────────────────────
    if (err instanceof ApprovalRequiredError) {
      await ApprovalGate.pause(execution, stepId, err.approvalId);
      // Execution is now WAITING_APPROVAL — WorkflowRunner breaks out; resume will re-enqueue
      throw err;
    }

    // ── Timeout ───────────────────────────────────────────────────────────
    if (err.isTimeout) {
      await ExecutionStore.updateStep(stepId, { status: 'TIMED_OUT', timedOutAt: new Date().toISOString() });
      await ExecutionStore.appendTimeline(executionId, { stepId, eventType: 'STEP_TIMED_OUT' });
      await ExecutionMetrics.recordStepFailed(executionId, stepKey, connector, durationMs);
      ProgressStreamer.emit(workspaceId, executionId, 'WORKFLOW_STEP_TIMED_OUT', { stepId, stepKey });
    }

    // ── Retry ─────────────────────────────────────────────────────────────
    const stepRecord = await ExecutionStore.getStep(stepId);
    if (RetryPolicy.shouldRetry(err, stepRecord, retry)) {
      const delayMs = RetryPolicy.nextDelay(stepRecord.retryCount, retry);
      await ExecutionStore.updateStep(stepId, {
        status: 'FAILED',
        retryCount: stepRecord.retryCount + 1,
        nextRetryAt: new Date(Date.now() + delayMs).toISOString(),
        errorMessage: err.message,
      });
      await ExecutionStore.appendTimeline(executionId, {
        stepId, eventType: 'STEP_RETRYING',
        payload: { attempt: stepRecord.retryCount + 1, maxAttempts: retry.maxAttempts, delayMs },
      });
      ProgressStreamer.emit(workspaceId, executionId, 'WORKFLOW_STEP_RETRYING', {
        stepId, stepKey, attempt: stepRecord.retryCount + 1, delayMs,
      });

      // Schedule retry via BullMQ with delay
      const { retryQueue } = await import('../jobs/workflowQueue.js');
      await retryQueue.add('retry', {
        executionId, stepId, workspaceId, retryCount: stepRecord.retryCount + 1,
      }, { delay: delayMs });

      // Pause the current run loop; retry worker will call StepRunner.retryById
      throw new RetryScheduledError(stepId, delayMs);
    }

    // ── No more retries — step failed ─────────────────────────────────────
    await ExecutionStore.updateStep(stepId, {
      status: 'FAILED', errorMessage: err.message, completedAt: new Date().toISOString(),
    });
    await ExecutionStore.appendTimeline(executionId, {
      stepId, eventType: 'STEP_FAILED', payload: { error: err.message },
    });
    await ExecutionMetrics.recordStepFailed(executionId, stepKey, connector, durationMs);
    ProgressStreamer.emit(workspaceId, executionId, 'WORKFLOW_STEP_FAILED', {
      stepId, stepKey, error: err.message,
    });

    if (onFailure === 'skip') return null;  // step is optional
    throw err;
  }
}

class ApprovalRequiredError extends Error {
  constructor(approvalId) {
    super('Approval required');
    this.approvalId = approvalId;
  }
}

class RetryScheduledError extends Error {
  constructor(stepId, delayMs) {
    super(`Retry scheduled for step ${stepId} in ${delayMs}ms`);
    this.retryScheduled = true;
  }
}
```

### 8.4 RetryPolicy.js

```js
// src/workflow/engine/RetryPolicy.js

const TRANSIENT_ERROR_CODES = [
  'RATE_LIMIT', 'ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED',
  'SERVICE_UNAVAILABLE', '429', '503', '504',
];

export class RetryPolicy {
  static shouldRetry(err, stepRecord, retryConfig) {
    if (!retryConfig) return false;
    if (stepRecord.retryCount >= retryConfig.maxAttempts) return false;

    // If retryOn is specified, only retry on those codes
    if (retryConfig.retryOn?.length) {
      const code = err.code ?? String(err.statusCode ?? '');
      return retryConfig.retryOn.some(c => code.includes(c));
    }

    // Default: retry on transient errors only
    const isTransient = TRANSIENT_ERROR_CODES.some(code =>
      err.message?.includes(code) || String(err.statusCode)?.includes(code.replace(/\D/g, '')),
    );
    return isTransient;
  }

  static nextDelay(retryCount, retryConfig) {
    const { backoff, initialDelayMs, maxDelayMs } = retryConfig;
    let delay;

    switch (backoff) {
      case 'exponential':
        delay = Math.min(initialDelayMs * Math.pow(2, retryCount), maxDelayMs);
        break;
      case 'linear':
        delay = Math.min(initialDelayMs * (retryCount + 1), maxDelayMs);
        break;
      case 'fixed':
      default:
        delay = initialDelayMs;
    }

    // Add ±10% jitter to prevent thundering herd
    const jitter = delay * 0.1 * (Math.random() * 2 - 1);
    return Math.round(delay + jitter);
  }
}
```

### 8.5 RollbackEngine.js

```js
// src/workflow/engine/RollbackEngine.js

import { executeAction } from '../../connectors/executionEngine.js';
import { ExecutionStore } from '../state/ExecutionStore.js';
import { ProgressStreamer } from '../streaming/ProgressStreamer.js';

export class RollbackEngine {
  /**
   * Execute rollback in reverse order: last completed step rolled back first.
   */
  static async rollback(executionId) {
    const execution = await ExecutionStore.getExecution(executionId);
    const steps = await ExecutionStore.getStepsByExecution(executionId);

    // Only roll back COMPLETED steps that have a rollback action
    const rollbackable = steps
      .filter(s => s.status === 'COMPLETED' && s.rollbackAction)
      .sort((a, b) => b.stepIndex - a.stepIndex);   // reverse order

    ProgressStreamer.emit(execution.workspaceId, executionId, 'WORKFLOW_ROLLBACK_STARTED', {
      executionId, stepsToRollback: rollbackable.length,
    });

    await ExecutionStore.appendTimeline(executionId, {
      eventType: 'ROLLBACK_STARTED',
      payload: { stepsToRollback: rollbackable.length },
    });

    for (const step of rollbackable) {
      try {
        const { connector, action, input } = step.rollbackAction;

        // Resolve rollback input: may reference step's original output
        const resolvedInput = {
          ...input,
          ...(input?.$stepOutput ? step.output : {}),
        };

        await executeAction(execution.workspaceId, connector, action, resolvedInput, {
          actorRole: 'MEMBER',
          executionId,
          stepId: step.id,
          isRollback: true,
        });

        await ExecutionStore.updateStep(step.id, {
          status: 'ROLLED_BACK',
          rolledBackAt: new Date().toISOString(),
        });

        await ExecutionStore.appendTimeline(executionId, {
          stepId: step.id, eventType: 'STEP_ROLLED_BACK',
          message: `Rolled back: ${step.stepKey}`,
        });

        ProgressStreamer.emit(execution.workspaceId, executionId, 'WORKFLOW_STEP_ROLLED_BACK', {
          stepId: step.id, stepKey: step.stepKey,
        });

      } catch (rollbackErr) {
        // Rollback failure: log but continue rolling back remaining steps
        await ExecutionStore.appendTimeline(executionId, {
          stepId: step.id, eventType: 'ERROR',
          message: `Rollback failed for step ${step.stepKey}: ${rollbackErr.message}`,
        });
      }
    }

    await ExecutionStore.transitionStatus(executionId, 'ROLLED_BACK', {
      rolledBackAt: new Date().toISOString(),
    });

    ProgressStreamer.emit(execution.workspaceId, executionId, 'WORKFLOW_ROLLED_BACK', { executionId });

    await ExecutionStore.appendTimeline(executionId, {
      eventType: 'ROLLBACK_COMPLETED',
    });
  }
}
```

### 8.6 ApprovalGate.js

```js
// src/workflow/approval/ApprovalGate.js

import { approvalStore } from '../../core/governance/approvalStore.js';
import { ExecutionStore } from '../state/ExecutionStore.js';
import { RedisStateStore } from '../state/RedisStateStore.js';
import { ProgressStreamer } from '../streaming/ProgressStreamer.js';
import { approvalTimeoutQueue } from '../jobs/workflowQueue.js';

export class ApprovalGate {
  /**
   * Pause execution at a step waiting for human approval.
   * Transitions execution to WAITING_APPROVAL.
   * Sets Redis lookup so ApprovalListener can find this execution.
   * Schedules approval timeout job.
   */
  static async pause(execution, stepId, approvalId) {
    const { id: executionId, workspaceId } = execution;

    // 1. Transition workflow to WAITING_APPROVAL
    await ExecutionStore.transitionStatus(executionId, 'WAITING_APPROVAL', { approvalId });
    await RedisStateStore.setExecutionState(executionId, { status: 'WAITING_APPROVAL' });

    // 2. Update step status
    await ExecutionStore.updateStep(stepId, {
      status: 'WAITING_APPROVAL',
      approvalId,
    });

    // 3. Set Redis lookup: approvalId → executionId
    const timeoutMs = parseInt(process.env.APPROVAL_TIMEOUT_MS ?? '172800000', 10);
    await RedisStateStore.setApprovalWait(approvalId, executionId, timeoutMs / 1000);

    // 4. Schedule timeout job
    await approvalTimeoutQueue.add('timeout', { executionId, approvalId, workspaceId }, {
      delay: timeoutMs,
      jobId: `approval-timeout-${approvalId}`,   // deduplicated
    });

    // 5. Record timeline
    await ExecutionStore.appendTimeline(executionId, {
      stepId, eventType: 'APPROVAL_REQUIRED',
      payload: { approvalId },
    });

    // 6. Broadcast
    ProgressStreamer.emit(workspaceId, executionId, 'WORKFLOW_APPROVAL_REQUIRED', {
      executionId, stepId, approvalId,
    });
  }

  /**
   * Called when approval TTL expires without a decision.
   * Cancels the execution.
   */
  static async timeout(executionId, approvalId) {
    const execution = await ExecutionStore.getExecution(executionId);
    if (execution.status !== 'WAITING_APPROVAL') return;

    await approvalStore.expire(approvalId);

    await ExecutionStore.appendTimeline(executionId, {
      eventType: 'APPROVAL_TIMED_OUT',
      payload: { approvalId },
    });

    const { WorkflowEngine } = await import('../engine/WorkflowEngine.js');
    await WorkflowEngine.cancel(executionId, 'system:approval-timeout');
  }
}
```

---

## 9. API Endpoints

All endpoints require JWT authentication and `workspace-id` header. Mounted at `/api/workflows`.

```
POST   /api/workflows/definitions
GET    /api/workflows/definitions
GET    /api/workflows/definitions/:id
PUT    /api/workflows/definitions/:id
DELETE /api/workflows/definitions/:id

POST   /api/workflows/execute
GET    /api/workflows/executions
GET    /api/workflows/executions/:id
POST   /api/workflows/executions/:id/cancel
POST   /api/workflows/executions/:id/retry
GET    /api/workflows/executions/:id/timeline
GET    /api/workflows/executions/:id/metrics
GET    /api/workflows/executions/:id/stream

GET    /api/workflows/metrics
GET    /api/workflows/health
```

### Route Contracts

```js
// POST /api/workflows/execute
// Body: LaunchExecutionRequest
// Response 202: LaunchExecutionResponse
// Governance: LOW risk (launch itself); steps governed individually

// GET /api/workflows/executions
// Query: ?status=RUNNING&limit=20&offset=0&triggeredBy=userId
// Response 200: { executions: WorkflowExecution[], total: number }

// GET /api/workflows/executions/:id
// Response 200: WorkflowExecution + steps + latest timeline events
// Uses Redis fast-path for live status if RUNNING/WAITING_APPROVAL

// POST /api/workflows/executions/:id/cancel
// Body: { reason?: string }
// Response 200: CancelExecutionResponse
// Auth: must be triggeredBy user OR ADMIN

// POST /api/workflows/executions/:id/retry
// Body: { fromStepKey?: string }  (retry from specific step, default: from failure point)
// Response 202: LaunchExecutionResponse (new executionId)
// Auth: same user or ADMIN

// GET /api/workflows/executions/:id/timeline
// Query: ?limit=100&before=timestamp
// Response 200: { events: TimelineEvent[], hasMore: boolean }

// GET /api/workflows/executions/:id/metrics
// Response 200: ExecutionMetrics

// GET /api/workflows/executions/:id/stream
// Response: text/event-stream (SSE)
// Sends WORKFLOW_* events as they occur. Closes on terminal state.

// GET /api/workflows/metrics
// Query: ?period=7d
// Response 200: { launched, completed, failed, cancelled, avgDurationMs,
//                 byConnector: { connector: count }, byStatus: { status: count } }
```

---

## 10. WebSocket Events

All events broadcast via `socketService.broadcast(workspaceId, event)`. Client subscribes to workspace channel and filters on `event.type.startsWith('WORKFLOW_')`.

| Event Type | Payload | When |
|-----------|---------|------|
| `WORKFLOW_CREATED` | `{ executionId, status, triggeredBy }` | On launch |
| `WORKFLOW_PLANNING` | `{ executionId, totalSteps }` | Plan built |
| `WORKFLOW_RUNNING` | `{ executionId, startedAt }` | Execution starts |
| `WORKFLOW_STEP_STARTED` | `{ executionId, stepId, stepKey, stepLabel, connector, progress }` | Step begins |
| `WORKFLOW_STEP_COMPLETED` | `{ executionId, stepId, stepKey, durationMs, output }` | Step succeeds |
| `WORKFLOW_STEP_FAILED` | `{ executionId, stepId, stepKey, error, retryCount }` | Step fails |
| `WORKFLOW_STEP_RETRYING` | `{ executionId, stepId, stepKey, attempt, maxAttempts, delayMs }` | Retry scheduled |
| `WORKFLOW_STEP_TIMED_OUT` | `{ executionId, stepId, stepKey, timeoutMs }` | Step timed out |
| `WORKFLOW_STEP_ROLLED_BACK` | `{ executionId, stepId, stepKey }` | Step undone |
| `WORKFLOW_STEP_SKIPPED` | `{ executionId, stepId, stepKey, reason }` | Condition false |
| `WORKFLOW_APPROVAL_REQUIRED` | `{ executionId, stepId, approvalId, connector, action }` | Awaiting human |
| `WORKFLOW_APPROVAL_RESOLVED` | `{ executionId, stepId, approvalId, decision, approvedBy }` | Approval given |
| `WORKFLOW_APPROVAL_TIMED_OUT` | `{ executionId, approvalId }` | TTL expired |
| `WORKFLOW_COMPLETED` | `{ executionId, completedAt, totalSteps, durationMs, output }` | All done |
| `WORKFLOW_FAILED` | `{ executionId, failedAt, errorStep, error }` | Unrecoverable fail |
| `WORKFLOW_CANCELLED` | `{ executionId, cancelledAt, cancelledBy, previousStatus }` | Cancelled |
| `WORKFLOW_ROLLBACK_STARTED` | `{ executionId, stepsToRollback }` | Rollback begins |
| `WORKFLOW_ROLLED_BACK` | `{ executionId, rolledBackAt }` | Rollback complete |
| `WORKFLOW_PROGRESS_UPDATE` | `{ executionId, progress, currentStep, percentComplete }` | Heartbeat |

### Progress Event Shape

```json
{
  "type": "WORKFLOW_PROGRESS_UPDATE",
  "workspaceId": "ws-abc123",
  "timestamp": "2026-07-20T10:14:33Z",
  "payload": {
    "executionId": "exec-xyz789",
    "status": "RUNNING",
    "currentStep": "merge_pull_request",
    "currentStepLabel": "Merge PR #847",
    "progress": "3/7",
    "percentComplete": 43,
    "elapsedMs": 4210,
    "completedSteps": [
      { "key": "assign_reviewer", "durationMs": 312 },
      { "key": "request_review", "durationMs": 189 },
      { "key": "wait_for_approval", "durationMs": 3209 }
    ],
    "remainingSteps": [
      { "key": "merge_pull_request" },
      { "key": "update_jira_ticket" },
      { "key": "notify_slack" },
      { "key": "create_deployment" }
    ]
  }
}
```

---

## 11. Live Progress Streaming

### Server-Sent Events (SSE) Endpoint

```js
// src/workflow/routes/workflowRoutes.js (SSE handler)

router.get('/executions/:id/stream', authenticate, tenantIsolation, async (req, res) => {
  const { id: executionId } = req.params;
  const { workspaceId } = req;

  // Validate access
  const execution = await ExecutionStore.getExecution(executionId);
  if (!execution || execution.workspaceId !== workspaceId) {
    return res.status(404).json({ error: 'Execution not found' });
  }

  // SSE headers
  res.writeHead(200, {
    'Content-Type':  'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection':    'keep-alive',
    'X-Accel-Buffering': 'no',     // disable nginx buffering
  });

  // Send current state immediately
  const liveState = await RedisStateStore.getExecutionState(executionId);
  SseStreamer.send(res, 'WORKFLOW_CURRENT_STATE', liveState ?? execution);

  // Subscribe to workspace WebSocket events and pipe to SSE
  const unsub = SseStreamer.subscribe(workspaceId, executionId, (event) => {
    SseStreamer.send(res, event.type, event.payload);

    // Close stream on terminal state
    if (['WORKFLOW_COMPLETED', 'WORKFLOW_FAILED', 'WORKFLOW_CANCELLED', 'WORKFLOW_ROLLED_BACK']
        .includes(event.type)) {
      res.end();
      unsub();
    }
  });

  // Heartbeat every 15 seconds to keep connection alive
  const heartbeat = setInterval(() => {
    if (!res.writableEnded) res.write(': heartbeat\n\n');
  }, 15000);

  req.on('close', () => {
    clearInterval(heartbeat);
    unsub();
  });
});
```

### SseStreamer.js

```js
// src/workflow/streaming/SseStreamer.js

import { eventBus } from '../../core/events/eventBus.js';

export class SseStreamer {
  static send(res, event, data) {
    if (res.writableEnded) return;
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n`);
    res.write(`id: ${Date.now()}\n\n`);
  }

  static subscribe(workspaceId, executionId, handler) {
    const listener = (event) => {
      if (event.workspaceId === workspaceId && event.payload?.executionId === executionId) {
        handler(event);
      }
    };
    eventBus.on('workflow:event', listener);
    return () => eventBus.off('workflow:event', listener);
  }
}
```

---

## 12. Retry Logic

### Retry Defaults

| Setting | Default | Override |
|---------|---------|---------|
| `maxAttempts` | 3 | Per step in definition |
| `backoff` | `exponential` | Per step |
| `initialDelayMs` | 1,000ms | Per step |
| `maxDelayMs` | 30,000ms | Per step |
| `jitter` | ±10% | Fixed |
| `retryOn` | All transient errors | Per step |

### Backoff Schedule (exponential, default)

| Attempt | Delay (before jitter) |
|---------|----------------------|
| 1 → 2 | 1,000ms |
| 2 → 3 | 2,000ms |
| 3 → 4 | 4,000ms |
| 4 → 5 | 8,000ms |
| 5 → 6 | 16,000ms |
| 6+ | 30,000ms (capped) |

### Errors That Trigger Retry

```js
const RETRYABLE = [
  'RATE_LIMIT',           // 429 from any connector
  'ECONNRESET',           // TCP connection reset
  'ETIMEDOUT',            // DNS / TCP timeout
  'ECONNREFUSED',         // port not listening
  'SERVICE_UNAVAILABLE',  // 503
  'GATEWAY_TIMEOUT',      // 504
];

const NOT_RETRYABLE = [
  'PERMISSION_DENIED',    // 403 — governance will keep denying
  'NOT_FOUND',            // 404 — resource doesn't exist
  'VALIDATION_ERROR',     // 400 — bad input won't self-heal
  'APPROVAL_REQUIRED',    // handled by ApprovalGate, not retry
];
```

---

## 13. Rollback Engine

### Rollback Action Definition

Every step that can be reversed declares its rollback action in the definition:

```json
{
  "key": "merge_pull_request",
  "connector": "github",
  "action": "GITHUB_MERGE_PR",
  "input": { "owner": "{{ $input.owner }}", "repo": "{{ $input.repo }}", "pull_number": "{{ $input.prNumber }}" },
  "rollback": {
    "connector": "github",
    "action": "GITHUB_REVERT_MERGE",
    "input": {
      "owner": "{{ $input.owner }}",
      "repo": "{{ $input.repo }}",
      "mergeCommitSha": "{{ $step.output.mergeCommitSha }}"
    }
  }
}
```

### Rollback Order

Given steps A → B → C → D where D failed:
```
Rollback: C.rollback() → B.rollback() → A.rollback()
```

Steps D and any FAILED/SKIPPED/PENDING steps are not rolled back.

### Rollback Governance

Rollback actions also flow through `executeAction()`. This means:
- Rollback can also trigger an approval gate (treated as a new approval)
- Rollback actions are audited identically to forward actions
- `isRollback: true` is passed in context for audit attribution

---

## 14. Human Approval Gate

### Lifecycle

```
Step needs approval
      │
      ▼
executeAction() returns { approvalRequired: true, approvalId: 'apr-xyz' }
      │
      ▼
ApprovalGate.pause(execution, stepId, approvalId)
  ├── Transitions execution → WAITING_APPROVAL (PG + Redis)
  ├── Sets Redis lookup: approval:{approvalId} → executionId
  ├── Schedules BullMQ approval timeout job (48h)
  └── Broadcasts WORKFLOW_APPROVAL_REQUIRED
      │
      ▼
Human reviews at /approvals in the UI
      │
      ▼
POST /api/approvals/:approvalId/approve  OR  /reject
      │
      ▼
approvalStore resolves the approval
      │
      ▼
eventBus emits: APPROVAL_RESOLVED { approvalId, decision, approvedBy }
      │
      ▼
ApprovalListener.onApprovalResolved()
  ├── Looks up executionId via Redis: GET flow:wf:approval:{approvalId}
  └── Calls WorkflowEngine.resume(executionId, decision, approvedBy)
      │
      ▼
WorkflowEngine.resume()
  ├── If approved:  transitions → RUNNING, re-enqueues execution job
  └── If rejected:  calls WorkflowEngine.cancel(executionId)
```

### ApprovalListener.js

```js
// src/workflow/approval/ApprovalListener.js

import { eventBus } from '../../core/events/eventBus.js';
import { RedisStateStore } from '../state/RedisStateStore.js';
import { WorkflowEngine } from '../engine/WorkflowEngine.js';
import { logger } from '../../utils/logger.js';

export function registerApprovalListener() {
  eventBus.on('APPROVAL_RESOLVED', async ({ approvalId, decision, approvedBy }) => {
    try {
      const executionId = await RedisStateStore.getApprovalWait(approvalId);
      if (!executionId) return;  // not a workflow approval

      await WorkflowEngine.resume(executionId, decision, approvedBy);

      // Clean up Redis lookup
      await RedisStateStore.clearApprovalWait(approvalId);
    } catch (err) {
      logger.error({ err, approvalId }, 'ApprovalListener failed to resume execution');
    }
  });
}
```

---

## 15. Timeout Handling

### Two Timeout Levels

**Step timeout:** Enforces maximum time for a single step (connector call).
**Workflow timeout:** Enforces maximum total time for the entire workflow.

### TimeoutManager.js

```js
// src/workflow/engine/TimeoutManager.js

export class TimeoutManager {
  /**
   * Wraps an async function with a hard timeout.
   * Throws a timeout-flavored error on expiry.
   */
  static async withTimeout(fn, timeoutMs, message) {
    if (!timeoutMs || timeoutMs <= 0) return fn();

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const err = new Error(message ?? `Timed out after ${timeoutMs}ms`);
        err.isTimeout = true;
        err.code = 'ETIMEDOUT';
        reject(err);
      }, timeoutMs);

      fn()
        .then(result => { clearTimeout(timer); resolve(result); })
        .catch(err => { clearTimeout(timer); reject(err); });
    });
  }

  /**
   * Check if a workflow has exceeded its total timeout.
   * Called at each step boundary.
   */
  static isWorkflowTimedOut(execution) {
    const workflowTimeoutMs = execution.definitionSnapshot.timeout?.workflowTimeoutMs;
    if (!workflowTimeoutMs) return false;
    const elapsed = Date.now() - new Date(execution.startedAt).getTime();
    return elapsed > workflowTimeoutMs;
  }
}
```

### Default Timeouts

| Level | Default | Override |
|-------|---------|---------|
| Step timeout | 60,000ms (1 min) | `step.timeout.stepTimeoutMs` |
| Workflow timeout | 3,600,000ms (1 hour) | `definition.timeout.workflowTimeoutMs` |
| Approval timeout | 172,800,000ms (48h) | `APPROVAL_TIMEOUT_MS` env var |

---

## 16. Parallel & Sequential Execution

### Definition Examples

**Sequential workflow (default)**
```json
{
  "name": "Customer Renewal Workflow",
  "steps": [
    { "key": "check_health",       "connector": "internal", "action": "GET_CUSTOMER_HEALTH" },
    { "key": "draft_email",        "connector": "gmail",    "action": "GMAIL_CREATE_DRAFT" },
    { "key": "request_approval",   "connector": "internal", "action": "REQUEST_APPROVAL" },
    { "key": "send_email",         "connector": "gmail",    "action": "GMAIL_SEND" },
    { "key": "update_crm",         "connector": "hubspot",  "action": "HUBSPOT_UPDATE_DEAL" }
  ]
}
```

**Parallel fan-out (steps with same `groupId` run simultaneously)**
```json
{
  "name": "Incident Response Workflow",
  "steps": [
    { "key": "create_incident",   "connector": "jira",  "action": "JIRA_CREATE_ISSUE" },
    {
      "key": "notify_oncall",    "connector": "slack",    "action": "SLACK_SEND_DM",
      "groupId": "notifications", "mode": "parallel"
    },
    {
      "key": "notify_cto",       "connector": "gmail",    "action": "GMAIL_SEND",
      "groupId": "notifications", "mode": "parallel"
    },
    {
      "key": "notify_slack_channel", "connector": "slack", "action": "SLACK_SEND_MESSAGE",
      "groupId": "notifications", "mode": "parallel"
    },
    { "key": "create_runbook",   "connector": "notion", "action": "NOTION_CREATE_PAGE" }
  ]
}
```

**Execution plan built from above:**
```
Group 1 [sequential]: create_incident
Group 2 [parallel]:   notify_oncall  ║  notify_cto  ║  notify_slack_channel
Group 3 [sequential]: create_runbook
```

### Parallel Group Result Handling

- All parallel steps must complete before the next sequential group starts
- If any parallel step fails and `onFailure: 'fail'` — the whole group fails
- If `onFailure: 'skip'` — failed step is skipped; group continues

---

## 17. Execution Metrics

### ExecutionMetrics.js

```js
// src/workflow/metrics/ExecutionMetrics.js

import { db } from '../../config/db.js';

export class ExecutionMetrics {
  static async init(executionId, workspaceId, totalSteps) {
    await db.query(
      `INSERT INTO execution_metrics (id, execution_id, workspace_id, total_steps)
       VALUES (gen_random_uuid()::text, $1, $2, $3)
       ON CONFLICT (execution_id) DO NOTHING`,
      [executionId, workspaceId, totalSteps],
    );
  }

  static async recordStepComplete(executionId, stepKey, connector, durationMs) {
    await db.query(
      `UPDATE execution_metrics SET
         completed_steps    = completed_steps + 1,
         step_durations     = jsonb_set(step_durations, $2::text[], $3::jsonb, true),
         connector_calls    = jsonb_set(connector_calls, $4::text[],
                               (COALESCE((connector_calls->$5)::int, 0) + 1)::text::jsonb, true),
         connector_durations = jsonb_set(connector_durations, $4::text[],
                               (COALESCE((connector_durations->$5)::int, 0) + $6)::text::jsonb, true),
         updated_at         = now()
       WHERE execution_id = $1`,
      [executionId, `{${stepKey}}`, durationMs, `{${connector}}`, connector, durationMs],
    );
  }

  static async recordStepFailed(executionId, stepKey, connector, durationMs) {
    await db.query(
      `UPDATE execution_metrics SET
         failed_steps   = failed_steps + 1,
         step_durations = jsonb_set(step_durations, $2::text[], $3::jsonb, true),
         updated_at     = now()
       WHERE execution_id = $1`,
      [executionId, `{${stepKey}}`, durationMs],
    );
  }

  static async recordRetry(executionId) {
    await db.query(
      `UPDATE execution_metrics SET retried_steps = retried_steps + 1 WHERE execution_id = $1`,
      [executionId],
    );
  }

  static async recordApprovalWait(executionId, waitMs) {
    await db.query(
      `UPDATE execution_metrics SET approval_wait_ms = approval_wait_ms + $2 WHERE execution_id = $1`,
      [executionId, waitMs],
    );
  }

  static async finalize(executionId, startedAt) {
    const totalDurationMs = Date.now() - startedAt.getTime();
    await db.query(
      `UPDATE execution_metrics SET
         total_duration_ms = $2,
         updated_at        = now()
       WHERE execution_id = $1`,
      [executionId, totalDurationMs],
    );
  }

  static async getWorkspaceMetrics(workspaceId, periodDays = 7) {
    const { rows } = await db.query(
      `SELECT
         COUNT(*)                                          AS launched,
         COUNT(*) FILTER (WHERE e.status = 'COMPLETED')   AS completed,
         COUNT(*) FILTER (WHERE e.status = 'FAILED')      AS failed,
         COUNT(*) FILTER (WHERE e.status = 'CANCELLED')   AS cancelled,
         AVG(m.total_duration_ms)::int                    AS avg_duration_ms,
         SUM(m.connector_calls)::jsonb                    AS connector_totals
       FROM workflow_executions e
       LEFT JOIN execution_metrics m ON m.execution_id = e.id
       WHERE e.workspace_id = $1
         AND e.created_at > now() - ($2 || ' days')::interval`,
      [workspaceId, periodDays],
    );
    return rows[0];
  }
}
```

---

## 18. Implementation Steps

Execute in this exact order. Each step has clear entry/exit criteria.

### Step 1 — Database Migration (Day 1)
- [ ] Write `scripts/migrate-execution-core-v1.sql` using schema from §4
- [ ] Test migration on development DB: `psql -f scripts/migrate-execution-core-v1.sql`
- [ ] Run `npx prisma generate` (adds new tables to Prisma client if using raw pool)
- [ ] Verify all 5 tables created: `\dt workflow_*; \dt execution_*`
- **Exit:** All tables exist with correct columns and indexes

### Step 2 — Redis State Store (Day 1)
- [ ] Implement `src/workflow/state/RedisStateStore.js`
- [ ] Implement all 8 operations from §5
- [ ] Write unit tests: `tests/workflow/RedisStateStore.test.js`
- **Exit:** All 8 operations tested and passing

### Step 3 — PostgreSQL Execution Store (Day 1-2)
- [ ] Implement `src/workflow/state/ExecutionStore.js`
- [ ] Implement: `createExecution`, `getExecution`, `updateExecution`, `transitionStatus`
- [ ] Implement: `createStep`, `getStep`, `updateStep`, `getStepsByExecution`
- [ ] Implement: `appendTimeline`, `getTimeline`
- [ ] Parameterized queries only — no string concatenation
- **Exit:** All CRUD operations tested against a local test DB

### Step 4 — State Machine (Day 2)
- [ ] Implement `src/workflow/engine/StateMachine.js`
- [ ] Unit test every legal and illegal transition
- [ ] 100% coverage on `transition()`, `isTerminal()`, `canCancel()`
- **Exit:** 27 transition tests pass (9 states × avg 3 transitions each)

### Step 5 — BullMQ Queues (Day 2)
- [ ] Implement `src/workflow/jobs/workflowQueue.js` (5 queues)
- [ ] Implement `src/workflow/jobs/workflowWorker.js` (calls `WorkflowRunner.run`)
- [ ] Implement `src/workflow/jobs/stepWorker.js` (parallel step fan-out)
- [ ] Test: enqueue a dummy job, verify worker processes it
- **Exit:** Worker picks up job, logs output, marks complete

### Step 6 — Definition & Planner (Day 2-3)
- [ ] Implement `src/workflow/definition/WorkflowDefinition.js`
- [ ] Implement `src/workflow/definition/DefinitionValidator.js`
- [ ] Implement `src/workflow/definition/ExecutionPlanner.js`
- [ ] Test: plan a 7-step mixed sequential/parallel definition
- [ ] Test: variable resolution `{{ $input.owner }}`
- **Exit:** Planner produces correct ExecutionPlan for sequential + parallel definitions

### Step 7 — StepRunner (Day 3)
- [ ] Implement `src/workflow/engine/StepRunner.js`
- [ ] Wire to `executeAction()` from Phase 14
- [ ] Implement step lock acquire/release via RedisStateStore
- [ ] Test with mock connector: step completes, step fails, step returns approval required
- **Exit:** All 3 step outcomes produce correct DB state + timeline events

### Step 8 — RetryPolicy (Day 3)
- [ ] Implement `src/workflow/engine/RetryPolicy.js`
- [ ] Implement `src/workflow/jobs/retryQueue` consumer
- [ ] Test: 3 failures → retry scheduled → eventual success
- [ ] Test: non-retryable error → immediate fail
- **Exit:** Exponential backoff produces correct delays; max retries enforced

### Step 9 — WorkflowRunner (Day 3-4)
- [ ] Implement `src/workflow/engine/WorkflowRunner.js`
- [ ] Implement sequential group execution
- [ ] Implement parallel group execution via `Promise.allSettled`
- [ ] Implement cancel signal check at group boundaries
- [ ] Test: complete sequential workflow end-to-end
- [ ] Test: parallel group with one failure (skip mode)
- **Exit:** End-to-end workflow with 5 steps completes; metrics row populated

### Step 10 — ApprovalGate + Listener (Day 4)
- [ ] Implement `src/workflow/approval/ApprovalGate.js`
- [ ] Implement `src/workflow/approval/ApprovalListener.js`
- [ ] Register listener in server boot
- [ ] Test: step returns approvalRequired → execution pauses → human approves → execution resumes
- [ ] Test: approval times out → execution cancels
- **Exit:** Full pause/resume cycle tested

### Step 11 — RollbackEngine (Day 4)
- [ ] Implement `src/workflow/engine/RollbackEngine.js`
- [ ] Test: 3-step workflow where step 3 fails → step 2 and 1 rolled back in order
- [ ] Test: rollback action itself fails → logged, remaining rollbacks continue
- **Exit:** Rollback produces ROLLED_BACK state; timeline shows reverse sequence

### Step 12 — TimeoutManager (Day 5)
- [ ] Implement `src/workflow/engine/TimeoutManager.js`
- [ ] Test: step that takes 100ms with 50ms timeout → TIMED_OUT
- [ ] Test: workflow-level timeout check
- **Exit:** Timeout fires within ±5% of specified duration

### Step 13 — ProgressStreamer + WebSocket (Day 5)
- [ ] Implement `src/workflow/streaming/ProgressStreamer.js`
- [ ] Wire to `socketService.broadcast()`
- [ ] Test: each state transition produces a broadcast event
- **Exit:** WebSocket client receives all 18 event types at correct lifecycle points

### Step 14 — SSE Streaming Endpoint (Day 5)
- [ ] Implement `SseStreamer.js`
- [ ] Implement `/executions/:id/stream` route handler
- [ ] Test: client connects, receives current state, receives live updates, stream closes on completion
- **Exit:** `curl` with `Accept: text/event-stream` receives events in real time

### Step 15 — ExecutionMetrics (Day 5-6)
- [ ] Implement `src/workflow/metrics/ExecutionMetrics.js`
- [ ] Test: 7-step workflow populates all metric columns correctly
- **Exit:** `execution_metrics` row has correct counts, durations, connector distributions

### Step 16 — API Routes (Day 6)
- [ ] Implement `src/workflow/routes/workflowRoutes.js`
- [ ] Mount at `/api/workflows` in `server.js`
- [ ] Test all 13 endpoints with authentication
- **Exit:** All endpoints return correct status codes and payloads

### Step 17 — WorkflowEngine Public API (Day 6)
- [ ] Implement `src/workflow/engine/WorkflowEngine.js`
- [ ] Wire launch, cancel, resume into route handlers
- [ ] Implement `index.js` barrel export
- **Exit:** POST /execute → launch → background job → completion cycle works

### Step 18 — Integration Test Suite (Day 7)
- [ ] Write `scripts/validate-execution-core.js`
- [ ] Cover: launch, cancel, retry, rollback, approval pause/resume, parallel execution
- [ ] Target: 30/30 assertions
- **Exit:** `node scripts/validate-execution-core.js` prints `30/30 PASS`

---

## 19. Testing Strategy

### Unit Tests (`tests/workflow/`)

```
StateMachine.test.js          — All transitions (legal + illegal)
RetryPolicy.test.js           — shouldRetry, nextDelay with all backoff types
TimeoutManager.test.js        — Timeout fires, success within timeout, no-timeout pass-through
RedisStateStore.test.js       — All 8 Redis operations (use ioredis-mock)
DefinitionValidator.test.js   — Valid/invalid definitions
ExecutionPlanner.test.js      — Sequential + parallel plan building, variable resolution
```

### Integration Tests (`scripts/validate-execution-core.js`)

```
Lifecycle scenarios:
  [01] Launch workflow → PENDING → PLANNING → RUNNING → COMPLETED
  [02] Cancel workflow in PENDING state
  [03] Cancel workflow in RUNNING state (step boundary check)
  [04] Cancel workflow in WAITING_APPROVAL state
  [05] Workflow with sequential steps: correct order enforced
  [06] Workflow with parallel steps: all steps start simultaneously
  [07] Parallel step fails (skip mode): workflow continues
  [08] Parallel step fails (fail mode): workflow fails
  [09] Step fails with retryable error: retry scheduled
  [10] Step retries 3 times, then fails: workflow FAILED
  [11] Step fails with non-retryable error: immediate FAILED (no retry)
  [12] Step timeout: TIMED_OUT status, workflow FAILED
  [13] Workflow timeout: cancelled mid-execution
  [14] Step requires approval: execution WAITING_APPROVAL
  [15] Approval granted: execution resumes from paused step
  [16] Approval rejected: execution CANCELLED
  [17] Approval times out: execution CANCELLED
  [18] Workflow fails → rollback triggered → steps reversed
  [19] Rollback step itself fails: logged, remaining rollbacks continue
  [20] Rollback completes → status ROLLED_BACK
  [21] Timeline has correct events in correct order
  [22] Metrics row populated with correct step count
  [23] Metrics: connector_calls reflects which connector each step used
  [24] Metrics: approval_wait_ms accumulates correctly
  [25] WebSocket receives WORKFLOW_STEP_STARTED for each step
  [26] SSE stream closes on COMPLETED
  [27] GET /executions/:id returns Redis fast-path for RUNNING execution
  [28] GET /executions/:id/timeline returns events in chronological order
  [29] Concurrent launch of 5 workflows on same workspace: all complete
  [30] Step lock prevents double-execution of same step in parallel group
```

### Load Test (`scripts/loadtest-execution-core.js`)

```
Target: 100 concurrent workflow executions
Each workflow: 5 sequential steps, each step ~10ms mock connector
Expected: all 100 complete within 10 seconds
Verify: no deadlocks, no duplicate step execution, no Redis key collisions
```

---

## 20. Acceptance Criteria

A workflow execution is considered complete and production-ready when ALL of the following are true:

### State Machine
- [ ] Every state transition writes to PostgreSQL before updating Redis
- [ ] Illegal transitions throw a typed error and do not mutate state
- [ ] Terminal states (COMPLETED, CANCELLED, ROLLED_BACK) cannot be re-entered

### Governance
- [ ] Every step calls `executeAction()` — no direct connector calls bypass this
- [ ] Automation actor role is fixed at `MEMBER` — definition cannot elevate it
- [ ] Rollback actions also flow through `executeAction()` and are audited

### Approval Gate
- [ ] Execution halts cleanly in WAITING_APPROVAL — no steps execute while waiting
- [ ] Resume re-starts from the exact step that triggered the approval, not from the beginning
- [ ] Approval timeout automatically cancels the execution

### Retry
- [ ] Only transient errors trigger retry — validation/permission errors fail immediately
- [ ] Retry count is tracked per step; maxAttempts is respected exactly
- [ ] Exponential backoff jitter is applied (±10%)

### Rollback
- [ ] Completed steps roll back in reverse order (D → C → B → A)
- [ ] Skipped and failed steps are not rolled back
- [ ] Rollback failure on step N does not prevent rollback of steps N-1, N-2...

### Persistence
- [ ] `execution_timeline` has at least one event per state transition
- [ ] `execution_metrics` is fully populated on COMPLETED or FAILED
- [ ] Cancel during WAITING_APPROVAL deletes the Redis approval lookup

### Streaming
- [ ] WebSocket client receives WORKFLOW_STEP_STARTED for every step that runs
- [ ] SSE stream delivers all 18 event types at the correct lifecycle moments
- [ ] SSE stream closes automatically on terminal state

### Performance
- [ ] Single 5-step sequential workflow: median < 500ms overhead (excluding connector time)
- [ ] 20 concurrent executions: no deadlocks or race conditions in step locking
- [ ] Redis key TTLs: no orphaned keys persist beyond 48 hours

---

## 21. Production Checklist

Complete all items before deploying to production.

### Environment Variables
- [ ] `WORKFLOW_CONCURRENCY=20` (or tuned to your Redis/PG capacity)
- [ ] `APPROVAL_TIMEOUT_MS=172800000` (48 hours)
- [ ] `WORKFLOW_STEP_TIMEOUT_MS=60000` (1 minute default)
- [ ] `WORKFLOW_TIMEOUT_MS=3600000` (1 hour default)

### Database
- [ ] Migration `migrate-execution-core-v1.sql` applied to production DB
- [ ] All indexes created and analyzed: `ANALYZE workflow_executions;`
- [ ] Verify parameterized queries: grep codebase for `${}` inside SQL strings — must be zero
- [ ] PostgreSQL connection pool sized correctly (add 5 connections per 20 workflow concurrency)

### Redis
- [ ] Redis memory policy confirmed: `maxmemory-policy allkeys-lru` (not `noeviction`)
- [ ] Redis persistence confirmed: AOF enabled so approval wait keys survive restart
- [ ] Key expiry monitoring: alert if `flow:wf:*` key count exceeds 100K

### BullMQ
- [ ] All 5 queues created and workers running before routes serve traffic
- [ ] Bull Board or equivalent dashboard wired to monitor job failures
- [ ] Dead letter queue review process: failed jobs visible and actionable
- [ ] `workflow-cleanup` cron running: verify it archives executions older than 90 days

### Governance Invariants (do not regress)
- [ ] Grep for `executeAction` in `src/workflow/` — every connector call must go through it
- [ ] Grep for `actorRole: 'MEMBER'` — must be present in every `executeAction` call from workflow
- [ ] Verify approval gate fires correctly: test MEDIUM and HIGH risk steps in staging

### Observability
- [ ] `execution_timeline` is indexed and queryable in < 100ms for any executionId
- [ ] Metrics endpoint `/api/workflows/metrics` returns data without timeouts
- [ ] WebSocket events appear in the Monitoring Dashboard

### Rollout
- [ ] Deploy to staging first: run `scripts/validate-execution-core.js` against staging
- [ ] Load test in staging: `scripts/loadtest-execution-core.js` (100 concurrent)
- [ ] Monitor Redis memory and PostgreSQL connection pool during load test
- [ ] Deploy to production with feature flag: `WORKFLOW_ENGINE_ENABLED=true`
- [ ] Enable for internal workspaces first (dogfood for 48 hours)
- [ ] Enable for all workspaces after zero incidents in dogfood period

---

*FLOW OS — Phase 1 Execution Core*
*Specification Version 1.0.0 — Ready for Implementation*
*Next: Phase 2 — Workflow Template Library (50 pre-built enterprise workflows)*
