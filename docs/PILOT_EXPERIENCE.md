# Pilot Experience Platform (Phase 17)

> **Stop building platforms — build a product.** Phase 17 turns FLOW from "a powerful
> engineering project" into "software a CTO can install, understand, trust, and buy."
> Everything here improves the experience of the first paying customer (Rahul, CTO of a
> 35-person startup). **Reuse everything** — no new AI/DB/event/reasoning/graph/execution
> layers.

The three moments this phase exists to create:
1. Install → *"This already understands my company."*
2. Five minutes → *"It found something I didn't know."*
3. Ten minutes → *"It already saved me time."*

## Tracks → reuse map

| Track | What it is | Built on |
|-------|-----------|----------|
| 1 First-time experience | Welcome + beautiful workspace discovery | `discoveryOrchestrator` → Integration-Permissions discovery / demo catalog |
| 2 Governance in setup | Admin decides what FLOW may understand, before import | Integration Permissions deny-by-default (13.1) |
| 3 Workspace build | Narrated progress, never a spinner | Workspace Lifecycle Engine (10 stages + WS events) |
| 4 First wow | Landing = Morning Brief, not a dashboard | WIC snapshot + Adaptive Workday + MorningBriefing |
| 5 Success dashboard | Personal ROI (business value, not system metrics) | `successMetrics` over real records (hybrid) |
| 6 Team invitation | Collaborative adoption | User CRUD |
| 7 Demo mode | "Load Demo Company" in one click | Living Workspace Simulator (Sprint 5) |
| 8 Trust | Sources, permissions, evidence, last sync, health | Connectors status/health + permissions |
| 9 Polish | Linear/Raycast/Vercel-grade consistency | Frontend audit |
| 10 Measure success | Outcomes, not features | Success metrics + onboarding timings |

## Milestones

- **M1 — Onboarding backend (DONE).** `src/onboarding/` (Redis state machine + discovery
  orchestrator) and `src/success/` (hybrid value aggregator). Routes `/api/onboarding/*`
  and `/api/success/*`. Validation **23/23**, regression **66/74**. See
  `ONBOARDING_ARCHITECTURE.md` + `SUCCESS_METRICS.md`.
- **M2 — First-run flow (frontend).** Welcome → Discovery → Permissions → Build → Morning
  Brief, with the first-run gate. Premium progress UI. → `FIRST_TIME_SETUP.md`.
- **M3 — Value + Trust + Team (DONE).** `SuccessDashboard.jsx` (`/success`, sidebar "Value")
  reads `/api/success/summary` — headline + detail ROI cards, each with a measured/estimated
  **basis badge**, plus a "How Time Saved is estimated" disclosure. Reusable `TrustBar.jsx`
  (connected systems + health + permissions link, honest empty state). Standalone **Load
  Demo Company** entry (seeds the Simulator). `TeamInvite.jsx` (`/settings/team`) reuses
  `POST /api/users/invite` with per-role why/what-they-gain + a surfaced temp password
  (no email infra). Frontend build clean (2414 modules); regression **66/74**.
- **M4 — Polish + measure-success + validation (DONE).** Track 9 polish: removed a dead
  `ComingSoon` import, normalized "Demo mode" banners to honest "Showing sample data —
  connect X to go live", verified token discipline (no raw hex in pilot surfaces). Track 10:
  `adoptionMetrics.js` → `GET /api/onboarding/metrics` (time-to-value, work-in-FLOW). Full
  harness **28/28**; regression **66/74**.

**Phase 17 COMPLETE (M1–M4).**

## Backend surfaces

`/api/onboarding/{state,discover,permissions,complete,reset,metrics}` ·
`/api/success/{summary,model}` — all JWT + workspace-id, tenant-scoped, read-mostly.

## Success measurement (Track 10)
Time to first value · onboarding completion · connectors connected · permissions configured
· work completed inside FLOW · time saved — all from `GET /api/onboarding/metrics` (onboarding
state timestamps + success aggregator). No separate analytics platform.

## Validation
`node scripts/validate-pilot-experience.js` — **28/28** (onboarding state machine + gate,
demo discovery, hybrid + honest-empty success, adoption metrics). Frontend builds clean.
Regression **66/74**.
