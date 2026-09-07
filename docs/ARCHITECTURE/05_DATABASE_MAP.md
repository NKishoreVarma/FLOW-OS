# FLOW OS — Database Map
**Architecture Version:** 1.0  
**Status:** FROZEN

---

## Overview

FLOW uses two database clients in parallel:
- **Prisma 7.x** — identity, governance, intelligence, and operational tables (schema-managed)
- **`pg.Pool` (raw SQL)** — vector store (`workspace_intel_chunks`) and event platform (`flow_events`)

Both connect to the same PostgreSQL 16 instance with the `pgvector` extension.

---

## Group 1: Identity & Organization (Prisma)

### `organizations`
| Column | Type | Notes |
|--------|------|-------|
| id | CUID | PK |
| name | TEXT | |
| plan | ENUM (free/pro/enterprise) | |
| createdAt | TIMESTAMP | |
| updatedAt | TIMESTAMP | |

### `workspaces`
| Column | Type | Notes |
|--------|------|-------|
| id | CUID | PK |
| externalId | TEXT | UNIQUE — used as `workspace-id` header value |
| name | TEXT | |
| orgId | FK → organizations | |
| createdAt | TIMESTAMP | |

### `workspace_members`
| Column | Type | Notes |
|--------|------|-------|
| id | CUID | PK |
| workspaceId | FK → workspaces | |
| userId | FK → users | |
| role | ENUM (OWNER/ADMIN/MEMBER/VIEWER) | Workspace-scoped role |
| UNIQUE | (workspaceId, userId) | One record per user per workspace |

### `users`
| Column | Type | Notes |
|--------|------|-------|
| id | CUID | PK |
| email | TEXT | UNIQUE |
| fullName | TEXT | |
| hashedPassword | TEXT | bcrypt |
| orgId | FK → organizations | |
| role | ENUM (OWNER/ADMIN/MEMBER/VIEWER) | Org-level role (workspace-level in workspace_members) |
| createdAt | TIMESTAMP | |

### `api_keys`
| Column | Type | Notes |
|--------|------|-------|
| id | CUID | PK |
| orgId | FK → organizations | |
| hashedKey | TEXT | SHA-256 hash |
| name | TEXT | |
| expiresAt | TIMESTAMP | nullable |
| lastUsedAt | TIMESTAMP | |

**Ownership:** `src/modules/auth/`, `src/modules/users/`, `src/modules/organizations/`  
**Migration:** Prisma managed (`npx prisma migrate dev`)

---

## Group 2: Integration & Connector (Prisma)

### `integrations`
| Column | Type | Notes |
|--------|------|-------|
| id | CUID | PK |
| workspaceId | FK → workspaces | |
| provider | TEXT | 'gmail', 'google-calendar', 'github', etc. |
| credentials | JSON | OAuth tokens, API keys (encrypted at rest recommended) |
| status | TEXT | 'connected', 'disconnected', 'error' |
| lastSyncAt | TIMESTAMP | |

### `agents`
| Column | Type | Notes |
|--------|------|-------|
| id | CUID | PK |
| workspaceId | FK → workspaces | |
| name | TEXT | |
| config | JSON | Agent configuration |

### `audit_logs`
| Column | Type | Notes |
|--------|------|-------|
| id | CUID | PK |
| orgId | FK → organizations | indexed |
| workspaceId | TEXT | indexed |
| userId | FK → users | nullable |
| action | TEXT | 'connector.send', 'user.login' |
| resource | TEXT | 'connector:gmail' |
| metadata | JSON | sanitized payload |
| approvalId | FK → pending_approvals | nullable, indexed |
| policyId | FK → policies | nullable, indexed |
| ip | TEXT | |
| createdAt | TIMESTAMP | indexed |

**Ownership:** `src/connectors/`, `src/core/governance/auditPersistence.js`

---

## Group 3: Governance (Prisma)

### `policies`
| Column | Type | Notes |
|--------|------|-------|
| id | CUID | PK |
| orgId | FK → organizations | |
| workspaceId | TEXT | nullable (org-wide if null) |
| connectorId | TEXT | nullable |
| capability | TEXT | nullable |
| actionType | TEXT | nullable |
| subjectRole | TEXT | nullable |
| subjectUserId | TEXT | nullable |
| effect | ENUM (ALLOW/DENY/REQUIRE_APPROVAL) | |
| conditions | JSON | requireApproval, planTiers, timeWindow |
| priority | INT | higher = evaluated first |
| enabled | BOOL | |
| createdAt | TIMESTAMP | |

### `pending_approvals`
| Column | Type | Notes |
|--------|------|-------|
| id | CUID | PK |
| workspaceId | TEXT | indexed |
| requesterId | FK → users | |
| action | TEXT | |
| params | JSON | Action parameters |
| status | ENUM (PENDING/APPROVED/EXECUTED/REJECTED/EXPIRED) | |
| riskLevel | ENUM (LOW/MEDIUM/HIGH/CRITICAL) | Phase 14 |
| requiredApprovals | INT | Phase 14 (1 or 2) |
| approvalVotes | JSON | [{ userId, decision, timestamp }] |
| approvedBy | FK → users | nullable |
| approvalId | TEXT | reference to this record |
| expiresAt | TIMESTAMP | default +48h |
| createdAt | TIMESTAMP | |

**Ownership:** `src/core/governance/`, `src/execution/approvalEngine.js`  
**Migration:** `scripts/migrate-governance-5-3-b.sql` (idempotent SQL)

---

## Group 4: Integration Permissions (Prisma)

### `connector_credentials`
| Column | Type | Notes |
|--------|------|-------|
| id | CUID | PK |
| workspaceId | TEXT | indexed |
| connector | TEXT | |
| auth_strategy | TEXT | |
| credentials | JSON | |
| health_status | TEXT | HEALTHY/DEGRADED/DOWN |
| legacy_grandfathered | BOOL | Pre-13.1 connectors |

### `resource_permissions`
| Column | Type | Notes |
|--------|------|-------|
| id | CUID | PK |
| workspaceId | TEXT | indexed |
| connector | TEXT | indexed |
| resourceId | TEXT | |
| resourceType | TEXT | |
| resourceName | TEXT | |
| allowed | BOOL | |
| discoveredAt | TIMESTAMP | |
| updatedAt | TIMESTAMP | |
| UNIQUE | (workspaceId, connector, resourceId) | |

**Ownership:** `src/core/governance/integrationPermissions/`  
**Migration:** `scripts/migrate-integration-permissions-v13.sql`

---

## Group 5: Operational Brain (Prisma)

### `org_memory_records`
| Column | Type | Notes |
|--------|------|-------|
| id | CUID | PK |
| workspaceId | TEXT | indexed |
| orgId | TEXT | indexed |
| type | ENUM (DECISION/INCIDENT/BRIEFING/AUTOMATION/PREDICTION/SIMULATION) | |
| title | TEXT | |
| summary | TEXT | |
| data | JSON | Full structured data |
| source | TEXT | |
| actorId | TEXT | |
| importance | FLOAT | |
| createdAt | TIMESTAMP | |
| expiresAt | TIMESTAMP | nullable |

### `graph_nodes`
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT | `${workspaceId}:type:connector:key` |
| workspaceId | TEXT | indexed |
| type | TEXT | 21 node types |
| connector | TEXT | |
| externalId | TEXT | |
| name | TEXT | |
| metadata | JSON | |
| last_observed_at | TIMESTAMP | Phase 11.1 |
| createdAt | TIMESTAMP | |

### `graph_edges`
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT | `gen_random_uuid()::text` |
| workspaceId | TEXT | indexed |
| sourceId | FK → graph_nodes | indexed |
| targetId | FK → graph_nodes | indexed |
| type | TEXT | 19 edge types |
| weight | FLOAT | |
| observation_count | INT | Phase 11.1 |
| last_observed_at | TIMESTAMP | Phase 11.1 |
| metadata | JSON | |

### `goals`
| Column | Type | Notes |
|--------|------|-------|
| id | CUID | PK |
| workspaceId | TEXT | |
| title | TEXT | |
| description | TEXT | |
| targetDate | TIMESTAMP | |
| status | ENUM | |
| progress | FLOAT | |

### `goal_milestones`
| Column | Type | Notes |
|--------|------|-------|
| id | CUID | PK |
| goalId | FK → goals | |
| title | TEXT | |
| dueDate | TIMESTAMP | |
| completed | BOOL | |

### `automation_rules`
| Column | Type | Notes |
|--------|------|-------|
| id | CUID | PK |
| workspaceId | TEXT | |
| name | TEXT | |
| trigger | JSON | |
| steps | JSON | |
| enabled | BOOL | |
| createdBy | FK → users | |

### `automation_runs`
| Column | Type | Notes |
|--------|------|-------|
| id | CUID | PK |
| ruleId | FK → automation_rules | |
| status | TEXT | |
| startedAt | TIMESTAMP | |
| completedAt | TIMESTAMP | |
| stepResults | JSON | |

### `briefings`
| Column | Type | Notes |
|--------|------|-------|
| id | CUID | PK |
| workspaceId | TEXT | |
| orgId | TEXT | |
| role | TEXT | |
| content | TEXT | Markdown |
| generatedAt | TIMESTAMP | |

### `briefing_recommendations`
| Column | Type | Notes |
|--------|------|-------|
| id | CUID | PK |
| briefingId | FK → briefings | |
| title | TEXT | |
| description | TEXT | |
| priority | INT | |
| executed | BOOL | |

### `copilot_conversations`
| Column | Type | Notes |
|--------|------|-------|
| id | CUID | PK |
| workspaceId | TEXT | |
| userId | FK → users | |
| startedAt | TIMESTAMP | |

### `copilot_messages`
| Column | Type | Notes |
|--------|------|-------|
| id | CUID | PK |
| conversationId | FK → copilot_conversations | |
| role | TEXT | 'user'|'assistant' |
| content | TEXT | |
| createdAt | TIMESTAMP | |

**Ownership:** `src/services/` (Phase 7 services), `src/graph/`  
**Migration:** `prisma/migrations/20260628*_phase7_brain*` (apply with `psql -f`, NOT `prisma migrate dev`)

---

## Group 6: Event Platform (raw `pg.Pool`)

### `flow_events`
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| workspace_id | TEXT | indexed |
| type | TEXT | canonical FLOW event type |
| connector | TEXT | source connector |
| source_event_id | TEXT | provider's own ID |
| actor | JSON | {id, type, name, connector} |
| entity | JSON | primary entity |
| metadata | JSON | connector-specific data |
| importance | FLOAT | |
| correlation_id | UUID | groups related events |
| timestamp | TIMESTAMP | |
| created_at | TIMESTAMP | |
| UNIQUE | (workspace_id, connector, source_event_id) | dedup key |

### `flow_event_deliveries`
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| event_id | FK → flow_events | |
| subscriber_name | TEXT | |
| status | TEXT | 'delivered'|'failed'|'dead_letter' |
| attempt_count | INT | |
| last_attempt_at | TIMESTAMP | |
| error | TEXT | nullable |

**Ownership:** `src/events/`  
**Migration:** `scripts/migrate-event-platform-v11-0.sql`

---

## Group 7: Intelligence (raw `pg.Pool`)

### `workspace_intel_chunks`
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| workspace_id | TEXT | indexed |
| content | TEXT | normalized intel text |
| channel | TEXT | source channel |
| source | TEXT | platform name |
| sender | TEXT | |
| authority_coeff | FLOAT | 0.8–1.5 |
| embedding | VECTOR(768) | pgvector |
| created_at | TIMESTAMP | |

**Index:** `USING ivfflat (embedding vector_cosine_ops) WITH (lists=100)`

**Ownership:** `src/services/vectorStoreService.js`, `src/services/retrievalService.js`  
**Migration:** `prisma/schema.prisma` (initial), or direct SQL for extensions

---

## Group 8: Execution & Notifications (Prisma/raw)

### `execution_records`
| Column | Type | Notes |
|--------|------|-------|
| id | CUID | PK |
| workspaceId | TEXT | indexed |
| userId | FK → users | |
| action | TEXT | |
| status | ENUM (PENDING/EXECUTED/FAILED/ROLLED_BACK) | |
| risk_level | TEXT | |
| rollbackAvailable | BOOL | honest |
| result | JSON | |
| executedAt | TIMESTAMP | |

### `notifications`
| Column | Type | Notes |
|--------|------|-------|
| id | CUID | PK |
| workspaceId | TEXT | indexed |
| userId | FK → users | indexed |
| type | TEXT | |
| title | TEXT | |
| body | TEXT | |
| entityId | TEXT | nullable |
| read | BOOL | |
| createdAt | TIMESTAMP | |

**Migration:** `scripts/migrate-execution-engine-v14.sql`

---

## Group 9: AI Platform (raw `pg.Pool`)

### `prompt_versions`
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| name | TEXT | logical prompt name |
| version | INT | |
| content | TEXT | prompt template with {{variables}} |
| active | BOOL | |
| ab_weight | NUMERIC | for weighted A/B selection |
| tags | TEXT[] | |
| created_by | TEXT | userId |
| UNIQUE | (name, version) | |

### `model_requests`
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| provider | TEXT | |
| model | TEXT | |
| task_type | TEXT | |
| workspace_id | TEXT | indexed |
| latency_ms | INT | |
| input_tokens | INT | |
| output_tokens | INT | |
| cost_usd | NUMERIC | |
| status | TEXT | 'success'|'error'|'cached'|'blocked' |
| cached | BOOL | |
| fallback_from | TEXT | nullable |
| prompt_id | FK → prompt_versions | nullable |
| created_at | TIMESTAMP | indexed |

### `model_requests_hourly` (VIEW)
Hourly aggregation by provider: cost, request count, avg latency, error count, cache hit count.

**Migration:** `scripts/migrate-orchestrator.sql`

---

## Group 10: Onboarding (Redis, no SQL table)

### Redis key: `onboarding:state:{workspaceId}`
```json
{
  "step": "welcome|discover|permissions|build|ready",
  "completed": false,
  "startedAt": "ISO8601",
  "completedAt": "ISO8601",
  "discoveries": {},
  "permissions": {}
}
```
TTL: none (persistent until reset). No migration needed.

---

## In-Memory Stores (Process-Lifetime Only)

| Store | Variable | Location | Loss on restart |
|-------|----------|----------|-----------------|
| vectorDatabase[] | module-level array | vectorStoreService.js | YES — TD-01 |
| incidentDatabase[] | module-level array | incidentEngine.js | YES |
| decisionDatabase[] | module-level array | decisionMemoryService.js | YES |
| topicClusters[] | module-level array | vectorStoreService.js | YES |
| KG nodes/edges | Map | knowledgeGraphService.js | YES |
| ingestionTraces | Map[200] | observabilityService.js | YES |
| queryTraces[] | Array[100] | retrievalService.js | YES |
| WIC snapshot | Map | workspaceCache/snapshotStore.js | Rebuilt from Redis |
| AI traces | Array[200] | requestTracer.js | YES |
| Connector timeline | Array[200] | executionEngine.js | YES |

**TD-01:** These stores are a known technical debt item — loss on restart means no operational continuity.

---

## Migration Rules

1. **Prisma-managed tables:** run `npx prisma migrate dev` (dev) or `npx prisma migrate deploy` (prod) after schema changes
2. **Phase 7 tables:** apply SQL directly with `psql -f migrations/file.sql`, then `npx prisma generate` (NOT `prisma migrate dev`)
3. **Raw SQL migrations:** idempotent (guarded on `IF NOT EXISTS`, `ON CONFLICT DO NOTHING`); safe to re-run
4. **Adding graph edges in raw SQL:** use `gen_random_uuid()::text` for id — Prisma's `cuid()` is app-side only
5. **Never drop `workspace_intel_chunks`** — pgvector data is not replicated elsewhere
