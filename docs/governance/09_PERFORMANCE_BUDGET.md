# FLOW OS — Performance Budget
**Document:** GOV-09  
**Status:** Mandatory  
**Applies to:** All backend routes, frontend pages, and AI calls  
**Last updated:** 2026-07-18

---

## Philosophy

Performance budgets are constraints, not aspirations. If a feature cannot fit within the budget, the approach changes — not the budget.

The goal is an experience that feels **instant for data reads** and **responsive for AI**. Enterprise users tolerate a 3-second AI response. They do not tolerate a 3-second page load.

---

## API Latency Budgets

### Standard Data Endpoints (p95)

| Endpoint category | Budget | Notes |
|---|---|---|
| Health checks (`/health`, `/health/live`, `/health/ready`) | ≤ 50ms | Always fast |
| Workspace cache reads (`/api/workspace/*`) | ≤ 5ms (Redis hit) | Target; ≤ 150ms cold build |
| Connector status, connector list | ≤ 100ms | DB query only |
| Event feed, timeline reads | ≤ 150ms | Indexed SQL |
| Graph traversal (neighbors, k-hop) | ≤ 35ms | Bounded BFS, frontier 400 |
| Ingestion pipeline stages | ≤ 200ms per stage | Background job |
| General data reads (query + DB) | ≤ 200ms | Parameterized SQL, no joins > 3 tables |
| Connector action (non-AI, non-network) | ≤ 500ms | Includes governance eval + audit |
| Lifecycle / import operations | Background | WebSocket progress — never blocks HTTP |

**All budgets above exclude AI call time.** Routes that call Gemini or other AI services are subject to AI latency budgets below.

### AI Latency Budgets

AI calls have longer budgets because they provide proportionally more value. But they must not be unbounded.

| AI operation | Budget | Fallback threshold |
|---|---|---|
| Workspace Intelligence Cache build | ≤ 500ms | N/A — async rebuild |
| Embedding generation (single chunk) | ≤ 2s | Random vector fallback |
| Privacy gate classification | ≤ 3s | Keyword heuristic fallback |
| Brief executive summary (WIC) | ≤ 5s | Template-based Markdown fallback |
| Copilot / Brain response | ≤ 30s | Heuristic structured Markdown fallback |
| Briefing engine | ≤ 45s | Structured fallback brief |
| Simulation run | ≤ 30s | Heuristic impact report |
| Prediction run (~22 predictions) | ≤ 500ms | Lower confidence predictions with honest disclosure |
| Executive Council (6 agents parallel) | ≤ 120s | Timeout-isolated; agents that finish deliver, others gracefully omitted |
| Council synthesis | ≤ 30s | Deterministic structured fallback |

Streaming AI endpoints (Brain/copilot stream) must deliver the **first token within 3 seconds**. The stream may continue for up to the full budget.

---

## Frontend Performance Budgets

### Bundle Size

| Bundle | Budget | Notes |
|---|---|---|
| Initial JS bundle (gzipped) | ≤ 250 KB | What loads on first visit |
| Per-page lazy chunk | ≤ 80 KB | Each route lazy-loaded |
| CSS (all, gzipped) | ≤ 50 KB | Includes design tokens |
| Total initial transfer | ≤ 400 KB | JS + CSS + HTML |

Verify with `npm run build && ls -lh dist/assets/` in `flow-os-frontend/`.

### Core Web Vitals (Target)

| Metric | Target | Measurement |
|---|---|---|
| Largest Contentful Paint (LCP) | ≤ 1.5s | Fast network |
| First Input Delay (FID) | ≤ 50ms | |
| Cumulative Layout Shift (CLS) | ≤ 0.05 | No layout shift after load |
| Time to Interactive (TTI) | ≤ 2.0s | |

Layout shift prevention: all cards and list items must reserve their height before data loads (skeleton cards).

### Page Load Targets

| Page | Target from navigation |
|---|---|
| Home `/` | ≤ 1s visible content |
| Brain `/brain` | ≤ 1.5s (streaming hint UI shows first) |
| Chief of Staff `/chief` | ≤ 1.5s (WIC snapshot reads instantly) |
| Engineering `/projects` | ≤ 1.5s (demo fallback if GitHub slow) |
| Meetings `/meetings` | ≤ 1.5s (demo fallback if Calendar slow) |
| Trust Center `/integrations` | ≤ 1.5s |
| Executive Council `/council` | ≤ 2s skeleton (data is slow — acknowledged) |

No page should show a spinner for more than 8 seconds. After 8 seconds, the demo fallback renders.

---

## Database Performance Budgets

### Query Execution Time

| Query type | Budget | Action if exceeded |
|---|---|---|
| Primary key lookup | ≤ 5ms | Already fast; investigate infra |
| Workspace-filtered indexed query | ≤ 20ms | Check index on workspace_id |
| Vector ANN search (pgvector) | ≤ 100ms | Reduce LIMIT; check ivfflat probes |
| Graph BFS (bounded, frontier 400) | ≤ 35ms | Do not increase frontier cap |
| Aggregate query (metrics, counts) | ≤ 500ms | Cache result; do not run per-request |
| Full-text search (PostgreSQL) | ≤ 200ms | Requires GIN index on text column |

Slow queries are logged automatically when exceeding `SLOW_QUERY_MS` (default: 500ms). Check logs after any new query is deployed.

### Connection Pool

| Parameter | Value | Notes |
|---|---|---|
| Pool max connections | 20 | Default; configurable via env |
| Idle timeout | 30s | Connections returned to pool |
| Connection timeout | 10s | Fail fast on pool exhaustion |

Do not increase the pool max without understanding the PostgreSQL connection limit. At 1000+ concurrent users, move analytics queries to a read replica.

---

## Memory Budgets

### Backend Process

| Resource | Budget | Notes |
|---|---|---|
| Heap in steady state | ≤ 512 MB | Node.js heap |
| Heap after 24h continuous operation | ≤ 1 GB | In-memory stores grow over time (TD-01) |
| Redis memory usage | ≤ 256 MB | Primarily BullMQ jobs + WIC snapshots |

In-memory stores (`vectorDatabase[]`, `incidentDatabase[]`, `decisionDatabase[]`, `topicClusters[]`) are Tech Debt TD-01. They grow unbounded per process lifetime. The process is restarted periodically in production as a workaround until TD-01 is addressed.

### Frontend

| Resource | Budget | Notes |
|---|---|---|
| DOM node count | ≤ 1500 nodes | Per page (virtualize long lists) |
| React component re-renders per interaction | ≤ 10 | Memoize expensive subtrees |
| WebSocket event queue (in-memory) | ≤ 200 events | LiveFeedPanel cap |

---

## Animation Performance

All transitions must run on the GPU compositor thread (no layout or paint triggers). Only `transform` and `opacity` are animated.

| Animation | Frame budget | Notes |
|---|---|---|
| Slide-over open | 16ms/frame for 200ms | Uses `transform: translateX` |
| List item appear | 16ms/frame | Staggered, `opacity` + `transform` |
| Skeleton shimmer | 16ms/frame | `background-position` on gradient |
| Button press | 16ms/frame | `transform: scale(0.98)` |

No animation should cause `Layout` or `Paint` events in browser DevTools Performance panel.

---

## Measuring Performance

### Local Measurement

```bash
# API endpoint latency
time curl -s http://localhost:5001/api/workspace/snapshot \
  -H "Authorization: Bearer $JWT" \
  -H "workspace-id: workspace_corp_alpha" > /dev/null

# Bundle size
cd flow-os-frontend && npm run build && du -sh dist/

# Integration suite timing
time npm run test:integration
```

### Production Monitoring

`GET /api/metrics` (ADMIN JWT or `METRICS_TOKEN`):
- `db.poolStats` — pool utilization
- `queues` — BullMQ job counts
- `memory` — heap usage
- `engines` — prediction/simulation run counts

`GET /metrics/infra` (no auth — infrastructure only):
- pg pool idle/active/total
- Redis ready state
- Node uptime and memory

### Benchmark Suite

`scripts/benchmark-suite.js` runs the full performance benchmark and generates `docs/PERFORMANCE_REPORT.md`. Run after any change to the execution path, graph engine, or event platform.

---

## Budget Violations

A route that exceeds its budget is:
1. Flagged in code review.
2. Not merged until the root cause is identified.
3. Fixed by one of:
   - Adding a missing database index
   - Moving computation to a background job
   - Caching the result in Redis or the workspace cache
   - Reducing the query scope

If the only fix is to increase the budget, escalate to the CTO. Budgets are changed by engineering decision, not by individual PRs.
