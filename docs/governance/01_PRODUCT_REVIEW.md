# FLOW OS — Product Review Process
**Document:** GOV-01  
**Status:** Mandatory  
**Applies to:** All features, design changes, navigation changes, and AI behavior changes  
**Last updated:** 2026-07-18

---

## Purpose

Every change to FLOW that a user will experience must pass Product Review before implementation begins. Product Review is not a bureaucratic gate — it is a forcing function to ensure we build the right thing before investing engineering time.

A feature rejected after two weeks of engineering is not a process failure. A feature that ships wrong is.

---

## When Product Review Is Required

| Change type | Review required | Approver |
|---|---|---|
| New page or route | Yes | Head of Product |
| New primary navigation item | Yes | Head of Product + CTO |
| Removing a page or nav item | Yes | Head of Product + CTO |
| New AI behavior or response pattern | Yes | Head of Product |
| New connector / integration | Yes | Head of Product |
| New governance policy or rule | Yes | CTO + Head of Product |
| New component or design pattern | Yes | Head of Design |
| Changing existing copy (non-trivial) | Yes | Head of Product |
| Bug fix (no visible behavior change) | No | Engineer |
| Performance improvement (no visible change) | No | Engineer |
| Security patch | No | CTO (post-merge review) |
| Documentation only | No | Reviewer |

---

## The Product Review Meeting

### Frequency
Weekly (Tuesdays, 60 minutes). Ad-hoc sessions allowed for P0 features (same-day, 30 minutes, CTO + Head of Product).

### Attendees
- Head of Product (required)
- CTO (required)
- Head of Design (required for UI changes)
- Proposing engineer or PM
- One customer-facing team member (optional, encouraged)

### Format
1. Feature proposal presented using the `11_FEATURE_PROPOSAL.md` template (10 min)
2. Questions from attendees (15 min)
3. Required questions answered (10 min)
4. Decision: Approved / Approved with changes / Deferred / Rejected (5 min)
5. Next steps documented (5 min)

---

## Required Questions

Every feature proposal must answer all six questions before Product Review. Incomplete proposals are returned to the proposer.

### Question 1: What question does this feature answer for the user?

Complete this sentence: "This feature allows a [persona] to answer the question: [question] in under [time]."

If the answer is longer than one sentence, the feature is solving too many problems at once.

### Question 2: Which persona(s) does this serve?

Reference the personas from `docs/bible/03_USER_EXPERIENCE.md`. If the feature does not serve at least one named persona's core daily workflow, explain why it should exist.

### Question 3: Does this feature fit the North Star?

> "A CTO opens FLOW at 7:45 AM. Without configuring anything, they see three things that matter. They handle all three by 8:10 AM."

Does this feature make that experience better, faster, or more reliable? If not, what strategic goal does it serve?

### Question 4: What is the primary action?

Every screen has one primary action (see `docs/bible/20_PRODUCT_RULES.md` Rule 1). What is it for this feature?

### Question 5: What already exists that this feature relates to?

List every existing FLOW feature, API, component, or page that this feature touches, reuses, or potentially duplicates. If it duplicates something, explain why a new feature is needed rather than improving the existing one.

### Question 6: What is the rollout plan and success metric?

How will this feature reach users? How will we measure whether it succeeded? What number proves it worked?

---

## Product Acceptance Criteria

A feature is accepted into Product Review when it has:

- [ ] A completed Feature Proposal (`11_FEATURE_PROPOSAL.md` template filled)
- [ ] Clear persona and workflow mapping
- [ ] A defined primary action per screen
- [ ] No duplication of existing functionality (or explicit justification)
- [ ] A success metric that can be measured
- [ ] Design sketches or wireframes (for UI features)
- [ ] Architecture notes (for backend features)

---

## Decision Making

### Approved
Feature proceeds to `writing-plans` phase. Implementation plan created before any code is written.

### Approved with Changes
Feature is approved conditionally. Changes must be documented and reviewed before implementation begins. No code is written until changes are acknowledged.

### Deferred
Feature is valid but not the right time. Placed in the product backlog with a revisit date and the criteria that would change the decision.

### Rejected
Feature does not meet product standards, conflicts with the Bible, duplicates existing functionality, or does not fit the North Star. Rejection is documented with the specific reason. The proposer may re-submit with changes.

### No Decision / More Information Needed
Product Review is paused. Proposer provides missing information within 5 business days. Feature does not proceed until the meeting reconvenes.

---

## Feature Approval Process — Step by Step

```
1. PROPOSAL SUBMITTED
   Engineer or PM fills out 11_FEATURE_PROPOSAL.md template
   Submitted to Head of Product 48h before Product Review meeting

2. INITIAL SCREEN (Head of Product)
   Does the proposal answer all 6 required questions?
   If no → returned to proposer (never enters Product Review meeting)
   If yes → added to meeting agenda

3. PRODUCT REVIEW MEETING
   Presented + questions + decision

4. IF APPROVED
   Implementation plan written (writing-plans skill)
   Engineering estimate provided
   Placed on sprint backlog

5. IMPLEMENTATION
   All code matches the approved spec
   Deviations from spec require a new Product Review for scope changes >20%

6. DEFINITION OF DONE CHECK (05_DEFINITION_OF_DONE.md)
   Feature checked against full DoD before PR is opened

7. RELEASE PROCESS (06_RELEASE_PROCESS.md)
   Feature follows the release pipeline
```

---

## What Product Review Is Not

**Product Review is not a design review.** Design quality is evaluated separately in Design Review (GOV-03). Product Review evaluates whether to build the feature.

**Product Review is not an engineering review.** Architecture and implementation choices are evaluated in Engineering Standards (GOV-02). Product Review evaluates what to build.

**Product Review is not a blocker for bug fixes.** Critical bugs are fixed immediately. Product Review applies to feature work.

**Product Review is not a veto power for the engineering team.** Engineers raise architectural concerns in the meeting. If an approved feature has an unworkable architectural implication, that is raised immediately — not after implementation begins.

---

## Historical Decisions and the Product Log

Every Product Review decision is logged in `docs/decisions/PRODUCT_LOG.md` with:
- Date
- Feature name
- Proposer
- Decision (Approved / Rejected / Deferred)
- Reason
- Success metric

This log is the canonical record of what FLOW has decided to build and why. It is never deleted.
