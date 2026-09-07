# Performance Report — FLOW OS

> Phase 12 Milestone 3, Part 7. Measured latency and throughput for the engines
> and at scale. Single-process, local PostgreSQL (pgvector) + Redis on Apple
> Silicon — indicative of engine cost, not a tuned production cluster.

Harnesses: `scripts/benchmark-suite.js` (per-op + concurrency),
`scripts/loadtest-event-platform.js` (100k events),
`scripts/validate-replay-engine.js` (100k events),
`scripts/validate-demo-twin.js` (graph @ 4,420 nodes / 26,636 edges).

---

## 1. Per-operation latency

Workspace: 334 graph nodes / 605 edges, ~167 events. 20–30 iterations each.

| Operation | avg | p50 | p95 | max |
|-----------|----:|----:|----:|----:|
| Event Bus — publish (validate→correlate→store→route) | 3 ms | 3 | 5 | 7 |
| Event Platform — windowed query | 3 ms | 3 | 4 | 4 |
| Search — full-text | 1 ms | 1 | 2 | 3 |
| Graph — metrics (5 aggregates) | 24 ms | 24 | 29 | 32 |
| Graph — neighbors (1-hop) | 1 ms | 1 | 2 | 3 |
| Graph — 2-hop traverse | 2 ms | 2 | 3 | 5 |
| Graph — impact analysis (3-hop) | 2 ms | 2 | 3 | 3 |
| Memory — query all | 1 ms | 1 | 1 | 1 |
| Timeline — replay 30d | 3 ms | 3 | 3 | 3 |
| **Prediction — full run (~22 models)** | 345 ms | 349 | 356 | 361 |
| **Simulation — one scenario** | 11 ms | 12 | 13 | 13 |

**Reads are single-digit ms.** The two composite engines are heavier by design:
- *Prediction* runs ~22 deterministic models over a shared 60-day context and
  invokes the Simulation Engine for churn/departure — still ~350 ms for the whole
  suite (a single type via `predictOne` is a fraction of that).
- *Simulation* traverses the graph + replays history + wraps in the XAI envelope —
  ~11 ms per scenario.
- *Graph metrics* is 5 aggregate `COUNT/GROUP BY` queries; other graph reads are
  frontier-bounded and ~1–2 ms.

## 2. Throughput at scale (100k events)

| Scenario | Result |
|----------|--------|
| Event durable store (append, ON CONFLICT) | **~22,800 events/s** |
| Event full pipeline (validate→correlate→store→fan-out) | ~266 events/s |
| Replay — full 30-day replay of 100,000 events | **~2.1 s** |
| Replay — snapshot as-of-T (SQL aggregate) | **~120 ms** (flat vs history size) |
| Replay — Monday-vs-Friday diff | ~147 ms |
| Graph — 2/3-hop traversal @ 26,636 edges | ~30 ms |
| Graph — impact analysis @ 26,636 edges | ~35 ms |

Snapshots and diffs are aggregate queries → **flat cost as history grows**. The
full-pipeline rate (266/s) reflects per-event correlation (Redis) + fan-out to
subscribers; the durable write ceiling is ~22.8k/s.

## 3. Concurrency

Simultaneous graph `metrics()` calls (the **heaviest** read — 5 aggregate queries
each) against a pool of 20:

| Concurrent callers | Total | Throughput |
|--------------------|------:|-----------:|
| 100 | ~1.6 s | ~63 req/s (≈315 queries/s) |
| 1,000 | ~12.3 s | ~81 req/s (≈405 queries/s) |

### Finding: aggregate reads are pool-bound under extreme concurrency
1,000 concurrent `metrics()` = 5,000 aggregate queries against 20 connections →
serialized → ~12 s and the slow-query logger fired (correctly). This is a **known
limit**, not a regression:
- Typical reads (neighbors, event query, search) are single-query and ~1–3 ms, so
  they sustain **far higher** concurrency than this 5-query aggregate.
- `metrics()`/`/api/metrics` are monitoring endpoints — not called 1,000× at once
  in normal operation.

**Mitigations (recommended for high-scale deployments):**
1. Cache aggregate results (graph metrics, `/api/metrics`) for a few seconds.
2. Route aggregate/analytics reads to a **read replica**.
3. Raise `DB_POOL_MAX` per replica (with `replicas × max ≤ max_connections`).
4. Front the API with a gateway that caps concurrency per client.

The same pool-saturation dynamic was observed and documented for the unbounded
event burst (11.0) — correctness always holds; latency degrades gracefully.

## 4. Interpreting the "users" targets

- **100 users** (typical): all engine reads stay single-digit ms; predictions
  ~350 ms; comfortably served by one replica.
- **1,000 users**: fine for normal read/write mixes; concentrated aggregate reads
  need caching or a replica (above).
- **10,000 users / 100k events**: horizontal scaling (stateless API + Redis-
  coordinated workers) + the mitigations above. The 100k-event harnesses confirm
  the storage/replay/graph layers hold at that data volume.

## 5. Validation that observability caught it

During the 1,000-concurrent run, the M1 slow-query logger emitted
`🐢 Slow query 17440ms: SELECT count(*) … graph_nodes …` for the saturated
aggregates — the instrumentation surfaced the bottleneck automatically, exactly as
intended.

---

*Part of Phase 12 — Production Hardening (Milestone 3).*
