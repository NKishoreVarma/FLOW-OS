# FLOW OS — Feature Proposal Template
**Document:** GOV-11  
**Status:** Mandatory  
**Applies to:** All features submitted to Product Review  
**Last updated:** 2026-07-18

---

## How to Use This Template

Copy this template for each new feature proposal. Fill in every section completely. Incomplete proposals are returned without entering Product Review. Submit to the Head of Product 48 hours before the Product Review meeting.

Save proposals at `docs/proposals/YYYY-MM-DD-{feature-name}.md`.

---

## PROPOSAL TEMPLATE — COPY BELOW THIS LINE

---

# Feature Proposal: {Feature Name}

**Date:** YYYY-MM-DD  
**Proposer:** {Name / Role}  
**Estimated scope:** {Small (<1 week) / Medium (1–2 weeks) / Large (>2 weeks)}  
**Product Review date:** {Scheduled date}  
**Status:** Draft | Under Review | Approved | Rejected | Deferred

---

## 1. Problem

> What is the problem this feature solves? Who experiences it? How frequently?

**Problem statement (1–3 sentences):**
{State the problem from the user's perspective, not the engineering perspective.}

**Who is affected:**
{Reference personas from `docs/bible/03_USER_EXPERIENCE.md`.}

**Frequency and severity:**
{How often does this problem occur? What happens if it is not solved?}

**Evidence:**
{Pilot feedback, user interview notes, support tickets, observed behavior. Do not invent evidence.}

---

## 2. User

**Primary persona:**
{Which of the 6 FLOW personas is the primary user? CTO, Manager/VP, Senior Engineer, CEO/Executive, Sales Leader, HR Lead}

**User goal:**
{Complete this sentence: "As a [persona], I need to [action] so that [outcome]."}

**Existing workflow (without this feature):**
{How does the user accomplish this today? What are the steps? What is painful?}

**Desired workflow (with this feature):**
{Walk through the user's experience step by step after the feature ships.}

---

## 3. North Star Fit

> "A CTO opens FLOW at 7:45 AM. Without configuring anything, they see three things that matter. They handle all three by 8:10 AM."

**How does this feature support the North Star?**
{Be direct. Does it make the 7:45 AM experience better? Does it enable a new category of "things that matter"? Does it reduce friction in handling them?}

**If this feature does not directly support the North Star, what strategic goal does it serve?**
{Only features that cannot directly map to the North Star need this section. Every feature should try to map first.}

---

## 4. Scope

### What is IN scope

{Bullet list of explicit capabilities this feature includes.}

### What is OUT of scope

{Bullet list of things this feature explicitly does not do, even if they seem related. Be specific. This prevents scope creep during implementation.}

### Dependencies

{What existing FLOW systems does this feature use?}
- {System or component} — {how it is used}
- {System or component} — {how it is used}

{Does this feature require any new dependencies (npm packages, external APIs)?}

---

## 5. Workflow and Screens

### Happy path (step by step)

```
Step 1: User {action} at {location}
Step 2: FLOW {response}
Step 3: User sees {what} and takes {action}
Step 4: {Outcome}
```

### Page by page

For each affected or new page, describe:

**{Page name} (`{route}`):**
- **Purpose:** What question does this page answer?
- **Primary action:** What is the one primary action?
- **AI role:** Does AI contribute to this page? How?
- **States:** Loading / Empty / Error / Populated / Demo fallback

{Repeat for each page}

### Where does this feature live in navigation?

{Which sidebar group? Is it a new sidebar item? Does it require a CommandPalette entry?}

---

## 6. Architecture

### Backend

**New routes required:**
| Method | Path | Description |
|---|---|---|
| {METHOD} | {/api/path} | {What it does} |

**Services touched or created:**
- {service file} — {what changes}
- {new service file} — {what it does}

**Database changes:**
{Describe any new tables, columns, or indexes. If a migration is required, note it. Follow ADR-003: hand-crafted SQL only, additive changes only.}

**Does this feature require a new external dependency?**
{If yes, justify it. Do not add a dependency if an existing FLOW module can serve the purpose.}

### Frontend

**New components:**
- {ComponentName} — {purpose}

**Modified components:**
- {ComponentName} — {what changes}

**Does this feature require changes to the Sidebar, CommandPalette, or routing?**
{Yes/No — describe}

### Governance

**Does this feature execute actions on behalf of the user?**
{If yes: which connector, which action type, what risk tier (LOW/MEDIUM/HIGH/CRITICAL)?}

**Does this feature require new governance policies?**
{If yes: describe the policy, the effect (ALLOW/DENY/REQUIRE_APPROVAL), and which roles it applies to.}

---

## 7. Risks

### Technical risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| {Risk description} | Low/Med/High | Low/Med/High | {What prevents or limits this} |

### Product risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Users do not find the feature | Low/Med/High | Low/Med/High | {Navigation, onboarding, empty state} |
| Feature is misused or misunderstood | Low/Med/High | Low/Med/High | {Copy, constraints, confirmation steps} |
| Performance degrades at scale | Low/Med/High | Low/Med/High | {Budget check, async processing} |

### What happens if this feature ships with a bug?

{Describe the fallback. Does the page degrade gracefully? Is there a demo fallback? Does governance block the bad path?}

---

## 8. Success Metrics

### Primary metric (the number that proves success)

{One metric. Specific. Measurable. Has a baseline and a target.}

Example format:
- **Metric:** {Name}
- **Baseline:** {Current state}
- **Target:** {After 30 days of pilot}
- **Measurement:** {How it is tracked — which API, which event, which database field}

### Secondary metrics (optional, max 3)

{If there are meaningful secondary signals, list them. Each must be measurable.}

---

## 9. Rollout Plan

### Stage 1: Development + Code Review + QA

{What gates must be passed before staging?}

### Stage 2: Pilot

{Which workspace(s) get access first? Who are the pilot users?}
{What pilot feedback will confirm success before full rollout?}
{What will trigger early rollout if the pilot is successful?}

### Stage 3: Production

{Any gradual rollout (percentage, flag-based)? Or full release?}
{What monitoring will be done on launch day?}

### Rollback

{If the feature causes an incident in production, what is the rollback plan?}
- {If a database migration was run: is it reversible?}
- {If the feature is flag-gated: disable the flag and redeploy}
- {If not flag-gated: what is the revert process?}

---

## 10. Open Questions

{List any unresolved questions that the Product Review meeting should address.}

1. {Question}
2. {Question}

---

## Reviewer Notes

*(Filled in during and after Product Review)*

**Decision:** Approved / Approved with changes / Deferred / Rejected  
**Date:** {Date of decision}  
**Approver(s):** {Names}  
**Conditions (if any):** {Changes required before implementation begins}  
**Notes:** {Key points from the discussion}
