# First-Time Setup (Phase 17 — M2)

> The premium first-run experience a CTO sees the moment they open FLOW. Full-screen,
> focused, one decision per step (Linear/Vercel style). Rendered as an overlay above the
> app shell — no sidebar, no clutter.

## The flow (`/welcome`)

```
Welcome → Discovery → Permissions → Build → Ready → Morning Brief
```

| Step | What the user sees | Backed by |
|------|--------------------|-----------|
| **Welcome** | "Welcome to FLOW. Let's connect your workspace." Two co-primary choices: **Connect your tools** and **Load Demo Company →**. A subtle "Skip for now". | — |
| **Discovery** | Progressive checklist — "✓ 42 employees found · 6 repositories in GitHub · 14 channels in Slack · 2 calendars…". Nothing imported yet. | `POST /api/onboarding/discover` (live = real provider discovery; demo = Acme catalog) |
| **Permissions** | Per connector, every discovered resource as a toggle (recommended pre-checked). "You're in control. FLOW only reads what you allow." | `POST /api/onboarding/permissions` — records intent; the Phase 13.1 deny-by-default gate enforces it |
| **Build** | Narrated stages — "Building operational graph… Learning engineering ownership… Preparing your Morning Brief…". **Never a blank spinner.** | Demo seeds the Living Workspace Simulator; `POST /api/onboarding/complete` flips the gate |
| **Ready** | "Your workspace is ready." → **Open my Morning Brief**. | routes to `/` (WIC + Adaptive Workday) |

## Components (`flow-os-frontend/src/components/onboarding/`)
- `FirstRunFlow.jsx` — full-screen orchestrator + progress rail + the five steps. `position:fixed; inset:0; z-index:4000` so it overlays the shell cleanly.
- `FirstRunGate.jsx` — on load, routes to `/welcome` when this workspace hasn't finished onboarding. **Fails open** — any error / an already-complete or dismissed flag leaves the user where they are; it never traps a session.
- `lib/onboardingApi.js` — client for `/api/onboarding/*`, `/api/success/*`, and the dev-only demo seed. Auth + workspace from localStorage (same convention as `brainApi`).

## First-run gate behavior
- `flow_onboarding_complete === 'true'` (localStorage) → never shown again.
- `flow_onboarding_dismissed === 'true'` (from "Skip for now") → never nags again.
- Otherwise, `GET /api/onboarding/state` decides: `completed:false` → `/welcome`.
- On the Build step's completion, the local flag + server `complete` are both set.

## Demo mode
Co-primary with real connect. "Load Demo Company" runs demo discovery, then the Build step
seeds the **Living Workspace Simulator** (Sprint 5) — a coherent 6-month Acme Technologies
company — so an investor is exploring a live-feeling workspace in under 30 seconds.

## Validation
Backend state machine verified end-to-end (reset → discover 6/34 → permissions → complete
→ persists) and covered by `scripts/validate-pilot-experience.js` **23/23**. Frontend
builds clean (2410 modules). Regression **66/74**.
