# FLOW OS — Release Process
**Document:** GOV-06  
**Status:** Mandatory  
**Applies to:** All deployments to staging and production  
**Last updated:** 2026-07-18

---

## Overview

FLOW releases follow a linear pipeline. A change does not skip stages. A change that fails at any stage returns to the previous stage for remediation before progressing.

```
Development → Code Review → QA → Staging → Pilot → Production
```

Each stage has a gate. Gates are not optional for production releases. For bug fixes and patches, the pipeline may be accelerated (see Hotfix section below), but no stage is skipped entirely.

---

## Stage 1: Development

**Owned by:** Implementing engineer  
**Exit criteria:** Definition of Done checklist complete (`05_DEFINITION_OF_DONE.md`)

### What happens here
- Feature implemented against the approved Product Review spec
- All DoD items checked by the engineer
- Integration suite run locally (`npm run test:integration` — 66/74 baseline)
- Relevant validation script run (`scripts/validate-*.js`)
- PR opened with DoD checklist in description

### Branch naming
```
feature/{ticket-id}-{short-description}
fix/{ticket-id}-{short-description}
docs/{description}
infra/{description}
```

### What blocks exit
- DoD checklist incomplete
- New integration test failures beyond the 8 known pre-existing
- Build fails (`npm run build` in `flow-os-frontend/`)

---

## Stage 2: Code Review

**Owned by:** Peer engineer + Head of Engineering (for architectural changes)  
**Exit criteria:** At least one approval; all review comments resolved

### Review scope

**Reviewer checks:**
1. Code implements the approved spec (not a different feature)
2. Governance invariants preserved (no bypassed executeAction, no skipped tenantIsolation)
3. No inline hex colors (only CSS tokens)
4. No banned phrases in UI strings
5. SQL uses parameterized queries
6. No `console.log()` in service files
7. All new routes documented in CLAUDE.md
8. Navigation updated if new page was added
9. LLM calls have fallbacks
10. ESM only — no `require()`

**Architectural changes** (new folder, new engine, new top-level module, changes to the execution pipeline, changes to the event bus) require Head of Engineering review.

**Design changes** (new page, new component, navigation change) require a design review sign-off (GOV-03) before Code Review begins.

### What blocks exit
- Failed design review
- Governance bypass detected
- Unapproved architectural change
- Broken integration baseline
- Security issues (SQL injection, XSS, missing tenant isolation)

---

## Stage 3: QA

**Owned by:** QA engineer (or engineer + peer review for small teams)  
**Exit criteria:** QA checklist passed (`07_QA_CHECKLIST.md`)

### What happens here
- Feature deployed to a local or shared QA environment (not staging)
- Full QA checklist run
- Accessibility check
- Performance spot-check (load time, response time)
- Edge cases tested (empty state, error state, slow network, demo fallback)

### What blocks exit
- Any Severity-1 or Severity-2 bug
- Accessibility failure (keyboard navigation broken, focus trap missing)
- Security finding (PII in response, missing auth check)
- Broken demo fallback

---

## Stage 4: Staging

**Owned by:** Release engineer  
**Exit criteria:** Smoke tests pass; integration suite passes on staging environment

### What happens here
- Feature merged to `main` branch
- Deployed to staging environment
- Smoke tests run (all primary routes load, all API health checks pass)
- Integration suite run against staging (`npm run test:integration` pointed at staging URL)
- Performance sampled for new endpoints

### Staging environment
- Identical infrastructure to production
- Real database (separate from production — no production data)
- Real Redis
- No `NODE_ENV=development` shortcuts
- `WS_AUTH_REQUIRED=true`

### What blocks exit
- Smoke tests fail (any primary route returns 5xx or crashes)
- Integration suite regresses below 66/74
- Performance budget exceeded (see `09_PERFORMANCE_BUDGET.md`)
- New 5xx errors in server logs

---

## Stage 5: Pilot

**Owned by:** Head of Product  
**Exit criteria:** Pilot user(s) have used the feature without encountering critical issues; success metric baseline established

### What happens here
- Feature enabled for pilot workspace (Rahul's CTO workspace or designated pilot org)
- Pilot users exercise the feature in normal workflow
- Feedback collected (adoption, confusion points, missing functionality)
- No regressions observed in existing pilot workflows

### Pilot criteria
- Feature is fully functional without manual workarounds
- Demo fallback is clearly labeled (users never mistake demo for live)
- Empty states guide users to the next action
- Notifications work correctly (right people, right timing, right content)

### What blocks exit
- Critical bug reported by pilot user
- Feature unusable without onboarding intervention
- Unexpected data exposure or permission issue

---

## Stage 6: Production

**Owned by:** CTO  
**Exit criteria:** CTO approves production deployment; release checklist complete (`13_RELEASE_CHECKLIST.md`)

### What happens here
- Release checklist verified (`13_RELEASE_CHECKLIST.md`)
- Production deployment executed
- Post-deployment smoke test (primary routes + new feature route)
- Monitoring dashboard checked for anomalies (`/monitoring`)
- WebSocket connections verified healthy

### Rollback readiness
Before every production deployment, confirm:
- The previous release tag is identified
- The rollback command is prepared (Docker image tag, git revert SHA)
- The database migration (if any) is reversible or the pre-migration snapshot is taken

---

## Hotfix Process

A hotfix is a critical bug fix that cannot wait for the full pipeline.

**Severity threshold for hotfix:** P0 — production is broken, data is at risk, or security vulnerability is confirmed.

```
Hotfix process:
1. CTO authorizes hotfix
2. Engineer fixes on hotfix branch from production tag
3. CTO reviews the diff (no other reviewer required for P0)
4. Deploy directly to staging → smoke test → production
5. Integration suite run post-deploy
6. Root cause and fix documented in INCIDENT_LOG.md
7. Retroactive QA run within 24h
```

A hotfix does not skip the staging stage. It does skip QA checklist (retroactive), pilot stage, and standard code review turnaround time.

---

## Database Migrations

Database migrations are the highest-risk operation in a release. They follow an additional protocol:

1. **Write the migration as hand-crafted SQL** — never `prisma migrate dev` on production schema. Hand-crafted SQL in `scripts/migrate-*.sql`.
2. **Make it idempotent** — use `IF NOT EXISTS`, `ON CONFLICT DO NOTHING`, enum guards. The migration must be safe to run twice.
3. **Do not touch `workspace_intel_chunks`** in the same migration as identity table changes.
4. **Additive only** in production — add columns, add tables, add enum values. Do not drop columns or remove enum values without a two-phase migration (first add new, then migrate data, then remove old in a later release).
5. **Run `npx prisma generate` after every schema change** that affects Prisma-managed tables.
6. **Take a database snapshot before running** any migration on staging or production.
7. **Document the migration** in the commit message: which tables changed, what was added/modified.

---

## Release Cadence

| Type | Cadence |
|---|---|
| Feature releases | 1–2 per sprint (biweekly) |
| Bug fix releases | As needed; staging within 24h of fix |
| Security patches | Hotfix process; same-day staging, <48h production |
| Infrastructure changes | Biweekly with feature releases or standalone if urgent |

---

## Version Tagging

Every production release is tagged in git:
```
v{major}.{minor}.{patch}
v1.19.0 ← Phase 19 complete
v1.19.1 ← Bug fix on Phase 19
```

Major version increments for breaking API changes. Minor for new features. Patch for bug fixes.
