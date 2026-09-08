/**
 * Documents generator — real content for RFCs, runbooks, post-mortems, specs.
 * No lorem ipsum. All document content is standalone English text FLOW can embed.
 */
import faker from '../faker.js';
import { PRODUCTS } from '../company.js';
import { EMP, INC, JIRA, PROJ } from '../scenarios.js';

const DOC_TYPES = [
  {weight:0.2,value:'runbook'},{weight:0.15,value:'architecture'},
  {weight:0.15,value:'api-spec'},{weight:0.15,value:'post-mortem'},
  {weight:0.1,value:'rfc'},{weight:0.15,value:'onboarding'},{weight:0.1,value:'policy'},
];

// ── Real document content pools ───────────────────────────────────────────────

const RUNBOOK_CONTENT = [
  `# On-Call Runbook: Platform API

## Symptoms
- Error rate >1% on /api/v3/workflows
- P99 latency >500ms for more than 2 consecutive minutes
- Memory usage >70% on any Platform API pod

## Immediate Actions (first 5 minutes)
1. Check Grafana dashboard: [platform-api-health]
2. \`kubectl top pods -n platform\` — check memory and CPU
3. Check recent deployments: \`kubectl rollout history deploy/platform-api\`
4. If memory >90%: rolling restart: \`kubectl rollout restart deploy/platform-api\`
5. Page SRE team via PagerDuty

## Common Root Causes
### Memory leak (WorkflowCache)
- Symptom: Memory grows >35% and keeps climbing
- Fix: Rolling restart buys time. Permanent fix: check WorkflowCache has LRU eviction enabled
- Config: WORKFLOW_CACHE_MAX_ENTRIES (default: 5000), WORKFLOW_CACHE_TTL_SECONDS (default: 900)

### High latency (DB query)
- Symptom: p99 >500ms but memory normal
- Check: \`pg_stat_activity\` for long-running queries
- Common cause: missing index on workflow_executions.tenant_id+created_at
- Fix: run the index creation script (non-blocking): /scripts/infra/add_workflow_index.sql

### Auth service timeout
- Symptom: 401 errors, platform API healthy otherwise
- Check: auth-service pod health \`kubectl get pods -n auth\`
- If auth-service down: circuit breaker should activate (Platform API degrades gracefully)
- Escalate to auth team if circuit breaker not activating

## Post-Incident
1. Write incident timeline in #incidents Slack channel
2. Create post-mortem Jira ticket: HPLT-XXX
3. Post-mortem meeting within 72 hours for P0/P1, 2 weeks for P2
4. Update this runbook with any new failure modes discovered`,

  `# Database Failover Runbook

## When to use this runbook
Primary PostgreSQL database has failed and read replicas are not automatically promoting.

## Prerequisites
- Access to AWS Console with RDS permissions
- PagerDuty incident declared
- Engineering lead on the call

## Steps
1. **Verify the outage**: Check RDS console. Primary should show "Failing over" or "Failed"
2. **Check Route 53 health checks**: If failover didn't trigger automatically, check health check port (must be 5432, not 5433)
3. **Manual failover via RDS console**:
   - Navigate to RDS → Databases → helios-prod-primary
   - Actions → Failover
   - Confirm: this promotes the standby replica to primary
4. **Monitor**: Replica promotion takes 60-90 seconds. Watch for "Available" status.
5. **Verify application recovery**: Check Grafana dashboard for write success rate. Should recover within 2 minutes of failover completion.
6. **DNS**: Route 53 health check will auto-update the CNAME to the new primary. Verify with \`dig helios-db.internal\`
7. **Notify**: Send customer status page update if outage >5 minutes.

## Post-failover
- The new primary is the former standby. We now have only 1 server (no standby).
- Immediately create a new read replica (takes 15-30 minutes): RDS → Create read replica
- Monitor replication lag for 30 minutes before declaring incident resolved
- Root cause: was Route 53 health check misconfigured? Update health check port to 5432.

## History
- INC-001 (October 2024): Route 53 health check on port 5433 instead of 5432. Manual failover required. MTTR: 25 minutes.`,

  `# SSL Certificate Renewal SOP

## Certificates managed by cert-manager (automatic renewal)
All platform-api.heliossoftware.com, analytics.heliossoftware.com, connect.heliossoftware.com, and guard.heliossoftware.com certificates are managed by cert-manager in Kubernetes. They renew automatically 30 days before expiration.

## Verify cert-manager health
\`\`\`bash
kubectl get certificates -A
kubectl get certificaterequests -A
kubectl describe certificate platform-api-tls -n platform
\`\`\`

## Certificates NOT managed by cert-manager (manual renewal required)
- *.heliossoftware.com wildcard cert (issued via DigiCert, 1-year)
- VPN endpoint cert (OpenVPN, 2-year)
- Code signing certificate (issued via Apple for macOS app, renewed annually)

## Manual renewal process (DigiCert wildcard)
1. Generate CSR: \`openssl req -new -key helios-wildcard.key -out helios-wildcard.csr\`
2. Submit to DigiCert via the admin portal (credentials in 1Password: "DigiCert Admin")
3. Validate domain ownership via DNS TXT record
4. Download cert chain and install in: nginx/certs/ and update Kubernetes secret helios-wildcard-tls
5. Rolling restart of ingress-nginx to pick up new cert

## Alert: Certificate expiring within 30 days
If you receive this alert, check if cert-manager can handle it automatically. If not, follow the manual renewal process above.`,
];

const POSTMORTEM_CONTENT = [
  `# Post-Mortem: INC-076 — Platform API Memory Pool Exhaustion

**Date**: December 14, 2025
**Severity**: P1
**Duration**: 47 minutes (02:47 AM – 03:34 AM PST)
**Status**: Resolved
**Author**: Priya Nair (SRE)
**Reviewed by**: David Park, Elena Torres, Sarah Chen

## Executive Summary
Platform API worker processes for all customers experienced memory pool exhaustion simultaneously, causing 503 errors on the /api/v3/workflows endpoint for 47 minutes. Root cause: WorkflowCache.populate() introduced in v3.1.9 (deployed Dec 13, 6:30 PM) had no eviction policy. For Acme Corp (12,400 workflow templates), the cache grew to consume all available heap memory within 8 hours of pod restart. The fix (LRU eviction with 5K entry max, 15-min TTL) was deployed as v3.1.9-p1 at 3:31 AM.

## Impact
- **Duration**: 47 minutes
- **Customers affected**: Acme Corp (847 failed workflow executions, highest impact), Meridian Health (123 failed executions), GlobalTech Solutions (67 failed executions)
- **Total failed requests**: ~2,400 across all tenants
- **Revenue impact**: No SLA breach. Below the 99.9% monthly uptime threshold.

## Timeline
| Time | Event |
|------|-------|
| Dec 13, 6:30 PM | v3.1.9 deployed to production |
| Dec 14, 2:47 AM | PagerDuty alert: Platform API memory 94% on all pods |
| 2:49 AM | Priya Nair acknowledged, began investigation |
| 2:52 AM | kubectl shows all pods at 95%+ memory, imminent OOMKill |
| 2:55 AM | David Park joined as secondary responder |
| 3:10 AM | Root cause identified: WorkflowCache no eviction policy |
| 3:12 AM | Mitigation: rolling restart to clear memory |
| 3:15 AM | Error rate dropping: 100% → 78% → 42% → 8% |
| 3:20 AM | PR #894 opened (fix: LRU eviction) |
| 3:28 AM | PR #894 approved (Elena Torres) and merged |
| 3:31 AM | v3.1.9-p1 deployed |
| 3:34 AM | All pods healthy. Error rate 0%. Incident resolved. |

## Root Cause
WorkflowCache.populate() in workflow_engine.go caches all workflow templates for a workspace in memory for fast access. In v3.1.8 and earlier, this cache had a maximum of 1,000 entries enforced by a configuration flag. During a performance optimization PR (#836, November 15), the configuration flag was removed and the max size check was not ported to the new caching implementation. For workspaces with many templates (Acme Corp: 12,400), the cache grows unbounded, filling the entire heap over 8 hours.

The timing: v3.1.9 deployed at 6:30 PM, fresh pod starts with empty caches. Acme Corp's 12,400 templates filled all pods' caches by 2:47 AM (8 hours later).

## Why didn't we catch this earlier?
1. Our load test dataset has 500 workflow templates (not 12,400). We don't test with Acme-scale data.
2. The staging environment processes much smaller workloads than production.
3. Memory usage metrics showed gradual growth but no alert was configured until >85% usage.
4. The configuration flag removal in PR #836 was not flagged in code review as a behavioral change.

## Action Items
| Item | Owner | Due | Status |
|------|-------|-----|--------|
| Add load test with 15,000 template dataset | SRE (Kenji) | Dec 20 | In progress |
| Add memory usage alert at 70% (was 85%) | SRE (Elena) | Dec 15 | Done |
| Add cache configuration documentation to runbook | David Park | Dec 18 | TODO |
| PR review checklist: flag removal of safety limits | CTO (Sarah) | Dec 16 | TODO |
| Investigate other unbounded caches in codebase | David Park | Dec 21 | TODO |

## Lessons Learned
1. **Test with customer-realistic data sizes**: 12,400 templates is real-world usage. Our tests should cover it.
2. **Removing safety limits requires explicit review**: The max_entries removal in PR #836 should have triggered a "why is this limit being removed?" comment.
3. **Memory alerts at 70% not 85%**: 15% buffer allows time to act before OOMKill.`,

  `# Post-Mortem: INC-001 — P0 Database Primary Failover

**Date**: October 14, 2024
**Severity**: P0
**Duration**: 25 minutes
**Status**: Resolved
**Author**: Elena Torres (SRE Lead)

## Summary
PostgreSQL primary database failover was not triggered automatically when the primary instance failed because the Route 53 health check was monitoring port 5433 instead of 5432. Manual failover via RDS console restored service in 25 minutes. All 210 customers affected.

## Root Cause
During a infrastructure audit in September 2024, a Route 53 health check was updated to monitor the new analytics port (5433) for the analytics replica. The change accidentally updated the health check for the primary database endpoint instead of creating a new one. The misconfiguration was not caught in the change review because the health check name was ambiguous.

## Action Items (completed)
- Health check names now include the resource they monitor (e.g., "rds-primary-5432", not "rds-health-check-1")
- Health check configurations are now validated in CI using a Terraform plan review
- All RDS health checks verified post-change in a post-deployment checklist
- Database failover test added to quarterly DR drills`,
];

const RFC_CONTENT = [
  `# RFC-0041: Adopt CQRS + Event Sourcing for Helios Platform Workflow Engine

**Status**: Accepted
**Author**: David Park (Staff Engineer)
**Date**: July 2, 2025
**Decision**: Implement CQRS with event sourcing for the new Platform API workflow engine (Project Atlas)

## Summary
This RFC proposes adopting Command Query Responsibility Segregation (CQRS) and event sourcing for the workflow execution engine rewrite in Project Atlas. This architectural change enables: (1) complete immutable audit trail for compliance customers, (2) temporal queries (what was the workflow state at time T?), (3) independent scaling of read and write paths, and (4) enables replay-based debugging for complex workflow failures.

## Background
The current workflow engine uses a CRUD model with a mutable state table. This causes several problems:
- Audit log is bolted on: we store a separate audit_events table that can get out of sync with actual state
- No temporal queries: customers can't ask "why did this workflow fail in January?"
- Write amplification: every workflow execution update hits the same rows, causing lock contention

## Proposal
### Command side (writes)
- All state changes expressed as immutable events: WorkflowStarted, StepCompleted, StepFailed, WorkflowCompleted, etc.
- Events stored in an append-only event store (PostgreSQL with ULID ordering)
- Commands validated against current aggregate state before appending events

### Query side (reads)
- Read models (projections) built from the event stream
- Current workflow state projected in real-time using Postgres logical replication
- Historical queries possible by replaying events up to a given point in time

## Decision
Accepted after review. Implementation starts with Project Atlas Sprint 2. The existing CRUD model will run in parallel during transition.`,

  `# RFC-0038: Migrate from Kong to Custom API Gateway (Project Ares)

**Status**: In Review
**Author**: Marcus Reid (Senior Engineering Manager)
**Date**: December 5, 2025

## Summary
Kong API Gateway (current) adds 8-12ms of overhead per request and requires JVM-based plugins that are difficult to maintain. This RFC proposes replacing Kong with a custom Go-based API gateway (Project Ares) targeting <1ms overhead, per-tenant rate limiting, and native Helios authentication.

## Current State
- Kong gateway version: 3.4.2
- Per-request overhead: 8ms (measured via X-Kong-Upstream-Latency header)
- Pain points: (1) Custom plugin development requires Lua, (2) Rate limiting is global, not per-tenant, (3) No native integration with Helios auth service
- License cost: $84,000/year for Enterprise Kong

## Proposed Custom Gateway (Go)
- Written in Go (same as auth-service)
- Target overhead: <1ms
- Features: Per-tenant rate limiting, JWT validation (native), request tracing, circuit breakers, API versioning, usage analytics
- Estimated build time: 6 months (Project Ares, starting Q1 2026)
- Savings: $84,000/year Kong license

## Open Questions
1. Should we use an existing OSS Go gateway (e.g., Traefik, Envoy) as a foundation, or build from scratch?
2. How do we handle the Kong plugin ecosystem migration?
3. What's the rollback plan if the custom gateway has reliability issues?

## Decision Pending
This RFC is awaiting review from the platform team and CTO before Project Ares is formally scoped.`,
];

const ARCHITECTURE_CONTENT = [
  `# Platform Microservices Architecture — Project Atlas

**Version**: 1.2
**Last updated**: November 15, 2025
**Author**: David Park, Sarah Chen

## Overview
Project Atlas decomposes the Helios Platform monolith into 7 independently deployable microservices communicating via gRPC (internal) and REST (external). This enables independent scaling, deployment, and team ownership.

## Service Map
| Service | Language | Owner | Responsibility |
|---------|----------|-------|----------------|
| api-gateway | Go | SRE | Edge: auth, rate limiting, routing |
| auth-service | Go | Platform | JWT issuance, session management, OAuth |
| workflow-engine | Go | Platform | Workflow execution, scheduling, state |
| connector-hub | Go | Connect | Third-party integrations, webhooks |
| analytics-pipeline | Python | Analytics | Event streaming, metric aggregation |
| notification-service | Go | Platform | Alerts, webhooks, email delivery |
| admin-api | Go | Platform | Workspace management, billing, user CRUD |

## Communication Patterns
- **Synchronous**: gRPC with protobuf for service-to-service calls (auth, workflow state reads)
- **Asynchronous**: Kafka for event streaming (workflow events, audit log, analytics)
- **External**: REST over HTTPS for all customer-facing API calls

## Data Ownership
Each service owns its data. No direct database access across service boundaries. Cross-service reads go through the owning service's API.

## Current Status (December 2025)
- auth-service: In extraction (PR #847 pending). Target: Dec 31.
- workflow-engine: Design phase. Target: Jan 31.
- All other services: Not yet started (Q1-Q2 2026).`,

  `# Data Pipeline Architecture — Helios Analytics

**Version**: 2.0
**Last updated**: October 1, 2025

## Overview
Helios Analytics processes ~200M events per day from workflow executions across all customer tenants. The pipeline has two paths: real-time (Kafka → Flink → ClickHouse, <5s latency) and batch (PostgreSQL → dbt → Snowflake, daily refresh).

## Real-time Path
1. **Ingestion**: Workflow events published to Kafka topic per workspace
2. **Processing**: Flink jobs aggregate events (count, sum, percentiles) in 1-minute windows
3. **Storage**: ClickHouse (columnar) for real-time query serving
4. **Query**: Helios Analytics API reads from ClickHouse, p99 <100ms

## Batch Path (for historical and cross-workspace analytics)
1. **Export**: Daily pg_dump of workflow_executions to S3
2. **Transform**: dbt models in Snowflake (star schema)
3. **Serve**: Snowflake for ad-hoc analytics, executive reports, and billing

## Project Kronos (in progress)
Replacing the ClickHouse real-time path with a custom columnar engine (Apache Arrow format) targeting 10ms p99 for 1-year lookback. Current ClickHouse struggles with Acme Corp\'s data volume (45-second dashboard loads). Target completion: April 2026.`,
];

const ONBOARDING_CONTENT = [
  `# Engineering Onboarding Guide — Helios Software

## Welcome
Welcome to Helios Engineering! This guide covers everything you need to be productive in your first 30 days.

## Week 1: Foundation
- [ ] Set up local development environment (see dev-setup.md)
- [ ] Get access to all required systems (GitHub, Jira, PagerDuty, AWS, Datadog)
- [ ] Read the Platform Architecture overview (docs/architecture/)
- [ ] Complete the security training (mandatory, takes 2 hours)
- [ ] Shadow an on-call engineer (schedule with Elena Torres)
- [ ] 1:1 with your manager and with the team lead

## Development Environment
1. Clone the main repos: platform-api, auth-service, helios-frontend
2. Install dependencies: Go 1.23+, Node 20+, Docker Desktop
3. Run the local stack: \`make dev\` (starts postgres, redis, kafka via docker-compose)
4. Run tests: \`make test\` (should pass on a fresh checkout)
5. Access local UI: http://localhost:3000

## Key Systems
- **Code**: GitHub (github.com/heliossoftware)
- **Issues**: Jira (helios.atlassian.net) — use HPLT for Platform issues
- **Docs**: Notion + this docs/ directory
- **Monitoring**: Grafana (grafana.heliossoftware.internal)
- **Incidents**: PagerDuty (heliossoftware.pagerduty.com)
- **Deployments**: ArgoCD (argocd.heliossoftware.internal)
- **Secrets**: 1Password (Engineering vault)

## First PR
All engineers make a small change in their first week. Pick any "good first issue" label in Jira and submit a PR. This validates your dev environment and introduces you to our code review process.`,

  `# Customer Success Onboarding — How to Manage Enterprise Accounts

## Your First 30 Days
As a new CSM at Helios, your first month is about learning our customers and our platform deeply. Don't worry about hitting metrics yet — focus on understanding.

## The Helios Customer Portfolio
- **Enterprise**: 40 accounts, avg ARR $220K, 1 dedicated CSM per account
- **Mid-market**: 120 accounts, avg ARR $45K, pooled CSM model (1:20 ratio)
- **SMB**: 50 accounts, avg ARR $14K, tech-touch + community-led

## Key Metrics We Track
1. **Health Score** (0-100): Combines usage, support tickets, NPS, and engagement. Below 60 = at-risk.
2. **MAU**: Monthly active users. Declining MAU is an early churn signal.
3. **Expansion Revenue**: Upsells and cross-sells. Enterprise tier has highest expansion potential.
4. **NPS**: We survey quarterly. Enterprise benchmark: 47.

## High-Risk Accounts (December 2025)
- **Acme Corp** (health: 42, renewal Dec 28): 2 open P1 tickets, CTO escalation. CRITICAL.
- **Pinnacle Logistics** (health: 59, renewal Dec 31): Low MAU, champion left company.
- **Meridian Health** (health: 67): Security disclosure needed for HGRD-234.

## Weekly Cadence
- Monday: Review health scores. Flag any drops >10 points.
- Tuesday: Customer calls (QBRs, check-ins, escalations)
- Thursday: Internal sync with Product and Engineering on customer issues
- Friday: Update account plans in Salesforce`,
];

const POLICY_CONTENT = [
  `# Data Retention Policy

**Version**: 2.1
**Last updated**: September 15, 2025
**Owner**: Legal / Security (Elena Vasquez, CISO)
**Effective**: January 1, 2024

## Retention Schedule

| Data Type | Retention Period | Location | Notes |
|-----------|-----------------|----------|-------|
| Workflow execution logs | 90 days (standard), 1 year (enterprise) | PostgreSQL / Snowflake | Customer-configurable with Enterprise tier |
| Audit logs | 3 years | Snowflake | Regulatory compliance (SOC 2, HIPAA) |
| Customer PII | Duration of contract + 30 days | PostgreSQL | GDPR right-to-erasure within 30 days of contract end |
| Payment records | 7 years | Stripe + Snowflake | Tax compliance |
| Application logs (platform) | 30 days | S3 (cold) | Security investigations |
| Security incident logs | 5 years | S3 + Snowflake | SOC 2 requirement |
| Employee records | 7 years post-termination | BambooHR | Employment law compliance |

## GDPR Compliance
- All EU customer data is stored in the eu-west-1 AWS region (data residency)
- Right-to-erasure requests must be processed within 30 days
- Data subject access requests (DSAR): submit via security@heliossoftware.com

## HIPAA Compliance (Healthcare Customers)
Meridian Health and Nexigen Pharma are covered entities. Their workflow data may contain PHI. Additional controls apply:
- Audit logs retained 6 years (HIPAA minimum)
- BAA signed before any data is processed
- Data encryption at rest and in transit (AES-256, TLS 1.3)`,

  `# Code Review Standards

**Version**: 1.3
**Owner**: Engineering Leadership (Sarah Chen, CTO)

## Review Requirements
- All PRs require at least 1 approving review before merge (main branch)
- Security-sensitive files (auth/, guard/, crypto/) require 2 approving reviews
- PRs open >48 hours with no review should be escalated to the team lead
- Self-merging is never permitted

## What to Check in Every Review
1. **Correctness**: Does the code do what the PR description says?
2. **Tests**: Are there tests? Do they cover edge cases?
3. **Security**: Does this change introduce SQL injection, SSRF, auth bypasses, or data leakage?
4. **Performance**: Will this cause N+1 queries, unnecessary allocations, or blocking I/O?
5. **Observability**: Are errors logged? Are new metrics/traces added for significant changes?
6. **Documentation**: Is the runbook updated if operational behavior changes?

## Review SLOs
- P1/critical tickets: review within 4 hours
- Standard PRs: review within 48 hours (24h target)
- Large PRs (>500 lines): can request 72h review window with prior notice

## PR Review Latency (December 2025)
Current average: 31 hours (target: 24 hours). Elevated due to David Park on-call and INC-076 response. Sarah Chen has approved pulling David from on-call rotation to focus on PR reviews and Project Atlas.`,
];

// ── Named scenario documents ───────────────────────────────────────────────────
const NAMED_DOCS = [
  // Post-mortem for INC-076
  {
    id: 'doc-pm-inc-076',
    title: 'Post-Mortem: INC-076 — Platform API Memory Pool Exhaustion (December 14, 2025)',
    content: POSTMORTEM_CONTENT[0],
    type: 'post-mortem',
    productId: 'prod-platform',
    author: EMP.StaffEng2,
    tags: ['incident', 'platform', 'memory', 'sre'],
    createdAt: '2025-12-14T10:00:00Z',
    updatedAt: '2025-12-14T16:00:00Z',
  },
  // Post-mortem for INC-001
  {
    id: 'doc-pm-inc-001',
    title: 'Post-Mortem: INC-001 — P0 Database Primary Failover (October 14, 2024)',
    content: POSTMORTEM_CONTENT[1],
    type: 'post-mortem',
    productId: 'prod-platform',
    author: EMP.DevOpsLead,
    tags: ['incident', 'database', 'p0', 'sre'],
    createdAt: '2024-10-16T10:00:00Z',
    updatedAt: '2024-10-16T18:00:00Z',
  },
  // RFC for Project Atlas CQRS
  {
    id: 'doc-rfc-0041',
    title: 'RFC-0041: Adopt CQRS + Event Sourcing for Helios Platform Workflow Engine',
    content: RFC_CONTENT[0],
    type: 'rfc',
    productId: 'prod-platform',
    author: EMP.StaffEng1,
    tags: ['atlas', 'architecture', 'engineering'],
    createdAt: '2025-07-02T09:00:00Z',
    updatedAt: '2025-07-15T11:00:00Z',
  },
  // RFC for Project Ares (API Gateway)
  {
    id: 'doc-rfc-0038',
    title: 'RFC-0038: Migrate from Kong to Custom API Gateway (Project Ares)',
    content: RFC_CONTENT[1],
    type: 'rfc',
    productId: 'prod-platform',
    author: EMP.VPEng,
    tags: ['ares', 'architecture', 'gateway', 'performance'],
    createdAt: '2025-12-05T09:00:00Z',
    updatedAt: '2025-12-10T14:00:00Z',
  },
  // Platform microservices architecture
  {
    id: 'doc-arch-microservices',
    title: 'Platform Microservices Architecture — Project Atlas',
    content: ARCHITECTURE_CONTENT[0],
    type: 'architecture',
    productId: 'prod-platform',
    author: EMP.StaffEng1,
    tags: ['atlas', 'architecture', 'engineering'],
    createdAt: '2025-06-15T09:00:00Z',
    updatedAt: '2025-11-15T16:00:00Z',
  },
  // Data pipeline architecture
  {
    id: 'doc-arch-pipeline',
    title: 'Data Pipeline Architecture — Helios Analytics',
    content: ARCHITECTURE_CONTENT[1],
    type: 'architecture',
    productId: 'prod-analytics',
    author: 'emp-094',
    tags: ['analytics', 'architecture', 'data'],
    createdAt: '2025-10-01T09:00:00Z',
    updatedAt: '2025-10-01T09:00:00Z',
  },
  // On-call runbook
  {
    id: 'doc-runbook-platform',
    title: 'On-Call Runbook: Platform API',
    content: RUNBOOK_CONTENT[0],
    type: 'runbook',
    productId: 'prod-platform',
    author: EMP.DevOpsLead,
    tags: ['sre', 'oncall', 'platform'],
    createdAt: '2025-03-01T09:00:00Z',
    updatedAt: '2025-12-14T09:00:00Z',
  },
  // Database failover runbook
  {
    id: 'doc-runbook-db',
    title: 'Database Failover Runbook',
    content: RUNBOOK_CONTENT[1],
    type: 'runbook',
    productId: 'prod-platform',
    author: EMP.DevOpsLead,
    tags: ['sre', 'database', 'runbook'],
    createdAt: '2024-10-16T14:00:00Z',
    updatedAt: '2025-09-01T10:00:00Z',
  },
  // SSL certificate renewal
  {
    id: 'doc-runbook-ssl',
    title: 'SSL Certificate Renewal SOP',
    content: RUNBOOK_CONTENT[2],
    type: 'runbook',
    productId: null,
    author: EMP.SRE1,
    tags: ['sre', 'security', 'ssl'],
    createdAt: '2025-01-15T09:00:00Z',
    updatedAt: '2025-08-01T10:00:00Z',
  },
  // Engineering onboarding
  {
    id: 'doc-onboarding-eng',
    title: 'Engineering Onboarding Guide',
    content: ONBOARDING_CONTENT[0],
    type: 'onboarding',
    productId: null,
    author: EMP.VPEng,
    tags: ['onboarding', 'engineering', 'getting-started'],
    createdAt: '2024-09-01T09:00:00Z',
    updatedAt: '2025-11-01T10:00:00Z',
  },
  // CS onboarding
  {
    id: 'doc-onboarding-cs',
    title: 'Customer Success Onboarding — Enterprise Account Management',
    content: ONBOARDING_CONTENT[1],
    type: 'onboarding',
    productId: null,
    author: EMP.VPSuccess,
    tags: ['onboarding', 'customer-success', 'enterprise'],
    createdAt: '2025-01-10T09:00:00Z',
    updatedAt: '2025-12-01T14:00:00Z',
  },
  // Data retention policy
  {
    id: 'doc-policy-data-retention',
    title: 'Data Retention Policy v2.1',
    content: POLICY_CONTENT[0],
    type: 'policy',
    productId: null,
    author: EMP.CISO,
    tags: ['policy', 'compliance', 'gdpr', 'hipaa'],
    createdAt: '2024-01-01T09:00:00Z',
    updatedAt: '2025-09-15T12:00:00Z',
  },
  // Code review standards
  {
    id: 'doc-policy-code-review',
    title: 'Code Review Standards',
    content: POLICY_CONTENT[1],
    type: 'policy',
    productId: null,
    author: EMP.CTO,
    tags: ['policy', 'engineering', 'code-review'],
    createdAt: '2024-06-01T09:00:00Z',
    updatedAt: '2025-12-10T16:00:00Z',
  },
];

// Filler document content templates (no lorem ipsum)
const FILLER_CONTENT = {
  runbook: [
    'Runbook for handling elevated error rates in the service. Symptoms: error rate >2% for >5 minutes. Steps: (1) Check Grafana dashboard for recent spikes, (2) Review recent deployments via ArgoCD, (3) Check database connection pool health, (4) If caused by deployment: rollback via kubectl rollout undo, (5) If caused by external dependency: enable circuit breaker feature flag. Post-incident: open Jira ticket and update this runbook with any new failure modes.',
    'Runbook for handling load balancer health check failures. Symptoms: ALB target shows unhealthy, traffic not routing to new pods. Check: (1) Pod readiness probes are passing, (2) Target group health check path returns 200, (3) Security group allows health check traffic from ALB. Fix: restart pods or update health check configuration.',
  ],
  'api-spec': [
    'API Reference for the Helios Platform REST API v3. Authentication: Bearer JWT (obtain from POST /api/v1/auth/token). Rate limits: 1,000 requests/minute per API key (Enterprise: configurable). Pagination: all list endpoints use cursor-based pagination with limit (max 100) and cursor parameters. Errors: standard HTTP status codes with JSON body { error: string, code: string, details: object }.',
    'Webhook Event Reference for Helios Connect. Events are delivered via HTTP POST to your registered endpoint. Payload format: { event: string, timestamp: ISO8601, workspace_id: string, data: object }. Events: workflow.started, workflow.completed, workflow.failed, step.completed, step.failed. Retry policy: exponential backoff, 5 attempts over 24 hours. Signature validation: HMAC-SHA256 using your webhook secret in the X-Helios-Signature header.',
  ],
  architecture: [
    'Architecture overview for the Connect Hub service. Connect Hub manages all third-party integrations via a plugin architecture. Plugins (connectors) are isolated Go plugins with a standard interface: Connect(), Disconnect(), Execute(action, params), Subscribe(event, callback). Each plugin runs in a sandboxed goroutine with resource limits. Plugin state is stored in PostgreSQL (per-workspace, per-connector). OAuth tokens stored encrypted using AES-256-GCM.',
    'Architecture for the Notification Service. Notifications are delivered via: (1) WebSocket to connected clients (sub-100ms), (2) PagerDuty/OpsGenie for on-call alerts, (3) Email via SendGrid, (4) Slack via Slack API, (5) Webhook to customer endpoints. Priority queue: P0 incidents bypass all rate limits. Standard notifications: debounced 5 minutes to prevent spam. Delivery guaranteed via at-least-once semantics with idempotency keys.',
  ],
  'post-mortem': [
    'Blameless Post-Mortem: Analytics pipeline stalled for 4 hours. Root cause: PostgreSQL VACUUM ANALYZE held lock during peak hours, blocking all write transactions. Fix: moved VACUUM to 2-4 AM off-peak window. Auto-vacuum thresholds tuned to run more frequently at lower table bloat percentages. Monitoring: added alert for lock wait time >30 seconds.',
    'Post-Mortem: Webhook delivery failure. Root cause: BullMQ worker concurrency set to 1 (should be 20) after a merge conflict resolution incorrectly accepted the old value. 6,200 webhooks permanently lost. Fix: concurrency restored, queue flushed, workers redeployed. Mitigation: webhook delivery dashboard now shows queue depth with alert if >10,000 items.',
  ],
  rfc: [
    'RFC: Adopt OpenTelemetry for distributed tracing across all Helios services. Currently each service uses a different tracing library (Jaeger, Zipkin, custom). Proposal: standardize on OTel SDK with Jaeger backend. Benefits: (1) Unified trace view across services, (2) Automatic instrumentation for gRPC and HTTP, (3) Sampling control. Implementation: 2-week rollout starting with platform-api, then all other services.',
    'RFC: Implement per-tenant database connection pooling. Currently all tenants share a single PostgreSQL connection pool. A noisy tenant (Acme Corp during batch exports) can exhaust the pool for all other tenants. Proposal: PgBouncer with per-tenant pool configuration. Enterprise tier: 20 connections. Mid-market: 5. SMB: 2.',
  ],
  onboarding: [
    'Sales Onboarding Playbook. Your first 90 days: (1) Learn the product deeply — complete the Helios certification course, (2) Shadow 5 customer calls with senior AEs, (3) Run 2 discovery calls with guidance, (4) Own your first close in month 3. Key messaging: Helios is not another Zapier. We\'re the enterprise workflow OS for operations teams. Lead with outcomes: customers using Helios save 6-10 hours per person per week on manual workflow coordination.',
    'IT Administrator Guide for Helios Platform. As an IT admin at a Helios customer account, you control: (1) User provisioning (manual or via SCIM from your IdP), (2) SSO configuration (SAML 2.0 or OIDC — requires Project Titan, available Q1 2026), (3) Permission management via Guard policies, (4) API key management, (5) Audit log access. Contact your CSM to enable admin features or request a security review.',
  ],
  policy: [
    'Release Management Policy. All production deployments follow blue/green deployment strategy. Code freeze: 48 hours before planned release. Release gate checklist: (1) All P0/P1 bugs closed, (2) QA regression suite 100% passing, (3) Performance benchmarks within 10% of baseline, (4) Security scan shows no critical/high CVEs, (5) CTO sign-off, (6) Rollback plan documented. Emergency hotfixes: can bypass code freeze with VP Engineering + CTO approval.',
    'Security Incident Response Policy. Definition of incident severity: P0 = service down for all customers, P1 = service degraded or security incident affecting customers, P2 = service degraded for subset, P3 = non-production impact. Required response times: P0: 15 minutes. P1: 30 minutes. P2: 2 hours. P3: 1 business day. Security incidents: must be reported to security@heliossoftware.com and CISO within 1 hour of discovery. Customer notification: within 72 hours per GDPR Article 33.',
  ],
};

export function generateDocuments(employees) {
  const namedDocs = NAMED_DOCS.map(d => ({ ...d }));
  const namedDocCount = namedDocs.length;

  const fillerDocs = Array.from({ length: 400 - namedDocCount }, (_, idx) => {
    const i = idx + namedDocCount + 1;
    const type = faker.helpers.weightedArrayElement(DOC_TYPES);
    const product = faker.datatype.boolean(0.7) ? faker.helpers.arrayElement(PRODUCTS) : null;
    const author  = faker.helpers.arrayElement(employees);
    const createdAt = faker.date.between({from:'2024-06-01',to:'2025-12-01'}).toISOString();

    // Titles by type (no lorem ipsum)
    const titles = {
      runbook: ['On-Call Runbook: Connect Hub', 'On-Call Runbook: Analytics Pipeline', 'Deployment Rollback Procedure', 'Incident Response Playbook', 'SSL Certificate Renewal SOP', 'Redis Failover Runbook', 'Kafka Consumer Lag Runbook', 'Load Balancer Health Check Troubleshooting'],
      architecture: ['Connect Hub Plugin Architecture', 'Notification Service Architecture', 'Authentication Service Design', 'Event Streaming Architecture', 'Multi-Region Deployment Design', 'Secret Management Architecture', 'API Gateway Architecture'],
      'api-spec': ['Platform API v3 Reference', 'Connect Adapter Interface Spec', 'Analytics Query API Reference', 'Authentication API Reference', 'Guard Policy API Reference', 'Webhook Event Reference', 'Admin API Reference'],
      'post-mortem': ['Post-Mortem: Analytics Pipeline Stall', 'Post-Mortem: Webhook Delivery Failure', 'Post-Mortem: SSL Certificate Expiration', 'Post-Mortem: Redis Connection Pool Exhaustion', 'Blameless Post-Mortem: API Gateway Latency Spike'],
      rfc: ['RFC: Adopt OpenTelemetry for Distributed Tracing', 'RFC: Per-Tenant Database Connection Pooling', 'RFC: Migrate Secret Storage to HashiCorp Vault', 'RFC: Implement Feature Flag System (LaunchDarkly)', 'RFC: GraphQL API for Platform v4'],
      onboarding: ['Engineering Onboarding Guide', 'Sales Onboarding Playbook', 'Customer Success Onboarding', 'IT Administrator Guide', 'Security Onboarding for New Hires'],
      policy: ['Data Retention Policy', 'Security Incident Response Policy', 'Remote Work Policy', 'Code Review Standards', 'Release Management Policy', 'Acceptable Use Policy', 'Vendor Security Assessment Policy'],
    };

    const titlePool = titles[type] || ['Internal Document'];
    const contentPool = FILLER_CONTENT[type] || FILLER_CONTENT.runbook;

    return {
      id: `doc-${String(i).padStart(3, '0')}`,
      title: faker.helpers.arrayElement(titlePool) + (i > titlePool.length ? ` v${faker.number.int({min:2,max:5})}` : ''),
      content: faker.helpers.arrayElement(contentPool),
      type,
      productId: product?.id || null,
      author: author.id,
      tags: faker.helpers.arrayElements(['engineering','product','operations','security','onboarding','release','sre','compliance'], faker.number.int({min:1,max:3})),
      createdAt,
      updatedAt: faker.date.between({from:createdAt,to:'2025-12-14'}).toISOString(),
    };
  });

  return [...namedDocs, ...fillerDocs];
}
