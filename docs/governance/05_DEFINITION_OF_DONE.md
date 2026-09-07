# FLOW OS — Definition of Done
**Document:** GOV-05  
**Status:** Mandatory  
**Applies to:** Every feature, change, and bug fix before a PR is opened  
**Last updated:** 2026-07-18

---

## What "Done" Means

A task is **not done** when the primary case works. A task is done when every state it can be in works correctly, every invariant it touches is preserved, and every document it affects is updated.

The Definition of Done (DoD) is verified by the implementing engineer before opening a PR, and verified again by the reviewer before approving. Both parties sign off.

---

## The Checklist

### 1. The Feature Works

- [ ] The primary use case works end-to-end.
- [ ] The feature works without `GEMINI_API_KEY` (deterministic fallback path verified).
- [ ] The feature works when the relevant connector is not authenticated (demo fallback renders).
- [ ] The feature works when the API is down or times out (graceful degradation, not a crash).

### 2. All States Are Handled

- [ ] **Loading state:** Skeleton placeholders shown while data is fetching. No blank space.
- [ ] **Empty state:** Explicit message with a guidance action. Not null, not a blank div.
- [ ] **Error state:** Honest error message with recovery action. Not "Something went wrong."
- [ ] **Populated state:** The designed experience with real data.
- [ ] **Demo/fallback state:** If the source API is unavailable, demo data renders with `"Showing sample data — connect X to go live."` label.

For backend jobs and workers, equivalent states:
- [ ] Job runs successfully on first try.
- [ ] Job is idempotent (running it twice produces the same result).
- [ ] Job fails gracefully and does not corrupt state on error.
- [ ] Job can be retried after failure.

### 3. Tests Pass

- [ ] `npm run test:integration` — **66/74** baseline or better. No new failures beyond the 8 known pre-existing.
- [ ] If a validation script exists for the affected system, run it and confirm it passes (e.g., `scripts/validate-graph-engine.js`, `scripts/validate-execution-engine.js`).
- [ ] If a new validation script was written as part of the task, it is committed and passes.

### 4. Tenant Isolation

- [ ] Every new route handler that reads or writes workspace data validates the `workspace-id` header.
- [ ] Every SQL query that touches workspace-scoped data includes `WHERE workspace_id = $N`.
- [ ] A request from workspace A cannot retrieve or modify data from workspace B.

### 5. Governance Invariants (for execution-related changes)

- [ ] No new action bypasses `executeAction()`.
- [ ] No new code skips `evaluateWithPolicies()`.
- [ ] Automation rules run at fixed `MEMBER` role (no escalation path).
- [ ] CRITICAL actions require two distinct approvers (no self-approval).

### 6. Privacy Gate

- [ ] Content classified as `PRIVATE_PERSONAL` is discarded at the pipeline level with no DB write.
- [ ] No PII appears in any log line.
- [ ] The privacy gate cannot be disabled by any configuration in the new code.

### 7. Documentation Updated

- [ ] If a new route was added: it is documented in `CLAUDE.md` §5.7 (Route Map).
- [ ] If a new environment variable was added: it is documented in `CLAUDE.md` §11 and `.env.example`.
- [ ] If a new major system or module was added: `CLAUDE.md` is updated with the folder reference.
- [ ] If the Bible is affected (new page, new nav item, new component, new AI behavior): the relevant Bible document is updated.
- [ ] If a new connector capability was added: `docs/bible/13_CONNECTORS.md` is updated.
- [ ] If the data model changed: `docs/bible/12_ENTERPRISE.md` or `docs/bible/15_KNOWLEDGE_GRAPH.md` is updated.

### 8. Navigation Updated

- [ ] If a new page was added: a sidebar entry exists in `Sidebar.jsx` in the correct group.
- [ ] If a new page was added: `CommandPalette.jsx` `NAV_COMMANDS` includes the route.
- [ ] If a page was removed: its entry was removed from the sidebar and `NAV_COMMANDS`.
- [ ] No `ComingSoon` component used as a page destination for a named sidebar item.
- [ ] No dead routes in `NAV_COMMANDS`.

### 9. Performance

- [ ] New routes return in ≤200ms p95 (excluding AI calls). Verify locally with `time curl`.
- [ ] No synchronous file I/O in request paths.
- [ ] No `process.exit()` calls in service code (only in `gracefulShutdown.js`).
- [ ] No N+1 database queries in a request path (one round-trip is fine; a loop of round-trips is not).

### 10. Security

- [ ] No raw SQL string concatenation (all parameterized).
- [ ] No new CORS origin added without written approval.
- [ ] No JWT secret, API key, or credential logged or returned in API response.
- [ ] No `eval()`, `new Function()`, or `childProcess.exec` with user-supplied input.
- [ ] SSRF: any outbound URL fetch goes through `crawlerService.js`, not raw `fetch(userInput)`.

### 11. Design Compliance (UI changes only)

- [ ] All colors reference CSS custom properties (no raw hex).
- [ ] Design Review checklist (`docs/governance/03_DESIGN_REVIEW.md`) passed.
- [ ] Copywriting reviewed against banned phrases list.
- [ ] AI responses (if any) do not show confidence scores or retrieval metadata.
- [ ] Demo mode label present where live data is unavailable.

### 12. Telemetry and Observability

- [ ] Key operations use `logger.*()` with a meaningful channel and structured payload.
- [ ] No `console.log()` in service files.
- [ ] New backend systems expose health data to `/api/metrics` if they maintain state (e.g., queue depth, node count, cache hit rate).
- [ ] Slow operations log via the slow-query logger (`SLOW_QUERY_MS` threshold).

### 13. Analytics (if applicable)

- [ ] If the feature generates user actions (approvals, executions, sync events), those events flow through the Unified Event Platform (`src/events/`).
- [ ] If the feature has a pilot metric (time saved, context switches reduced, actions executed), it is tracked in `src/onboarding/adoptionMetrics.js` or the relevant metrics service.

---

## PR Checklist

A PR may not be opened until all items above are checked. The PR description must include:

```markdown
## Summary
[What this PR does — 1–3 bullets]

## Definition of Done
- [ ] All states handled (loading, empty, error, populated, fallback)
- [ ] Tests pass (npm run test:integration baseline maintained)
- [ ] Tenant isolation verified
- [ ] Documentation updated (CLAUDE.md, Bible sections)
- [ ] Navigation updated (sidebar + CommandPalette if new page)
- [ ] Design Review checklist passed (for UI changes)
- [ ] Governance invariants preserved (for execution changes)
```

---

## What Is NOT in the Definition of Done

These are intentional exclusions:

**"The code is clean."** Code quality is a continuous concern, not a release gate. Refactors are separate PRs.

**"Documentation is perfect."** The document must be accurate. It does not need to be complete. Future increments improve it.

**"The reviewer approved it."** Approval follows DoD verification. Approval is not a substitute for the author doing the DoD checklist.

**"It works on my machine."** The standard is: it works against the integration suite on a clean environment.
