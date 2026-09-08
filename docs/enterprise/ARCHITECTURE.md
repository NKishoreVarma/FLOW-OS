# FLOW OS Enterprise Architecture

## Overview

FLOW OS is a multi-tenant enterprise intelligence operating system deployed as a horizontally-scalable Node.js cluster backed by PostgreSQL (pgvector), Redis, and BullMQ. The architecture follows a strict single-writer event bus pattern with layered, governed execution.

## Core Layers

```
┌─────────────────────────────────────────────────────────────────┐
│  React Frontend (Vite, React Router v6, Tailwind)               │
├─────────────────────────────────────────────────────────────────┤
│  API Layer (Express 5 + WebSocket)                               │
│  JWT Auth → Tenant Isolation → Governance → Rate Limiting        │
├─────────────────────────────────────────────────────────────────┤
│  Intelligence Layer                                              │
│  Multi-Agent Cognitive Brain │ Executive Council │ Predictions   │
│  Simulation │ XAI │ Replay │ Workspace Cache                     │
├─────────────────────────────────────────────────────────────────┤
│  Execution Layer                                                  │
│  Workflow Runtime │ Action Registry │ Connector SDK │ Governance  │
├─────────────────────────────────────────────────────────────────┤
│  Data Layer                                                      │
│  PostgreSQL + pgvector │ Redis │ BullMQ │ Vault (Filesystem)     │
└─────────────────────────────────────────────────────────────────┘
```

## High Availability

- **Leader Election**: Redis SETNX (30s TTL, 10s renewal). One leader per Redis partition.
- **Worker Failover**: Heartbeat registration every 10s; stale detection after 45s; SCAN-based (never KEYS).
- **Health Probes**: `/health/live` (liveness), `/health/ready` (readiness: pg + redis, 503 during drain).
- **Graceful Shutdown**: SIGTERM → HTTP drain → BullMQ drain → pg pool close → Redis close (15s hard limit).

## Multi-Region

- Primary writes to PostgreSQL primary. Read replicas handle analytics queries.
- `GeoRouter` routes reads to nearest read replica; writes always go primary.
- `ReplicationManager` fans out connector timeline events to secondary regions.
- `RegionConfig` reads `SECONDARY_REGIONS` and `READ_REPLICAS` env vars (JSON arrays).

## Data Flows

### Ingestion Pipeline (9 stages)
`Ingest API → BullMQ → Worker → Parser → Scorer → Privacy Gate → Incident Engine → Decision Engine → Memory Brain → Entity Extractor → Knowledge Graph → Cognitive Brain → pgvector + Vault`

### RAG Query Pipeline (6 stages)
`POST /api/query → RouterAgent → retrieveContext (pgvector ANN + vault + RRF) → CriticAgent → Memory Boost → ExecutiveSynthesisAgent → WebSocket broadcast`

### Autonomous Operations
`AutonomyEngine (cycle timer) → ContinuousPlanner → DecisionEngine → startExecutionWithPlan → WorkflowRuntime → Action Registry → Connector → Governance → Audit`

## Security Architecture

- JWT (RS256 or HS256, min 32-char secret) on every protected route
- WebSocket: token in query param, verified before channel join
- Tenant isolation: `workspace-id` header validated against `req.user.orgId` in DB
- Governance: DENY wins, REQUIRE_APPROVAL creates `pending_approvals` row
- Enterprise: SSO (SAML 2.0 / OIDC), MFA (TOTP RFC 6238), IP Allowlist, Custom RBAC
- Secret redaction in all log output (regex on token/password/secret/apikey/jwt)

## Scaling Model

- Horizontal: BullMQ jobs sharded by `workspaceId` across N queues (`QUEUE_SHARDS`)
- Per-workspace rate limiting: 600 req/min API, 20 concurrent executions, 50 events/sec
- `HorizontalScaler` emits advisory scale recommendations; K8s HPA or operator acts
- Cache: L1 (in-process Map) + L2 (Redis). Graph cache 30s/5min, planner 30s/2min

## Storage

| Store | Technology | Data |
|-------|-----------|------|
| `workspace_intel_chunks` | PostgreSQL + pgvector | 768-dim embeddings |
| Prisma tables | PostgreSQL | Org, Workspace, User, Policy, Approval, Audit |
| Phase 7-19 tables | PostgreSQL | Goals, Automations, Events, Graph, Executions |
| Phase 15 tables | PostgreSQL | SSO, MFA, Sessions, IP Allowlist, Roles, Compliance |
| In-memory stores | Process | Traces, incidents, decisions, KG (ephemeral) |
| Redis | Persistent | BullMQ, social cache, leader election, workspace cache |
| Vault | Filesystem | Markdown intel reports, daily summaries |
