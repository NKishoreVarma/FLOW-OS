# FLOW OS — Product Rules
**Document:** 20 of 20  
**Status:** Authoritative  
**Last updated:** 2026-07-18

---

## The Golden Rules

These rules are not guidelines. They are invariants. A feature that violates a rule is not shipped until the violation is resolved.

---

### Rule 1: Every page answers one question with one primary action.

Before any page ships, the team must be able to complete this sentence:

> "This page answers the question: _______, and the primary action the user takes is: _______."

If the sentence cannot be completed in one clear answer each, the page is not ready to ship.

```
✓  Home: "What do I need to do today?" → Act on the highest-urgency decision
✓  Inbox: "What is waiting for me?" → Process the highest-priority item
✓  Engineering: "What is blocking the release?" → Review or approve the highest-risk PR

✗  "This page shows lots of useful information" ← not a question
✗  "Users can do many things here" ← not one primary action
```

---

### Rule 2: Never build a screen without an action path.

A screen that shows information but provides no executable action is not a FLOW screen. It is a dashboard. FLOW does not build dashboards.

Every view must end with a button, a recommended action, or at minimum a "Ask FLOW about this" entry point that routes to the brain with context pre-loaded.

Charts, metrics, and timelines are allowed only as supporting context for a recommendation. They are never the primary content of a page.

---

### Rule 3: Never show AI confidence scores in user-facing UI.

Confidence scores (87%, 0.84 similarity, "highly likely") are never shown to users. They are internal signals used in ranking and evaluation. Showing them to users:
- Suggests FLOW might be wrong (destroys trust)
- Invites users to debate the score instead of acting
- Communicates nothing about what to do

If FLOW is not confident enough to make a statement, it declares insufficient evidence. If it is confident enough, it makes the statement. There is no middle state that requires showing a percentage.

**Banned from UI:**
- "Confidence: X%"
- "X% likely"
- "I am fairly confident..."
- "Low confidence prediction"

**Allowed:**
- "This is a prediction based on [N] signals."
- "There isn't enough evidence to answer this with confidence."
- "Note: conflicting information exists — [source A] says X, [source B] says Y."

---

### Rule 4: Never show retrieval metadata.

Users do not care how the answer was derived. They care whether it is right.

**Banned from UI:**
- "Found in 14 document chunks"
- "Based on my analysis of 23 relevant records"
- "Vector similarity: 0.84"
- "Searched your knowledge base"
- "Retrieving context..."

**Allowed:**
- Named sources in the collapsed Evidence panel: "Source: GitHub PR #447"
- Author attribution: "Per Rahul's comment on Tuesday"
- Time attribution: "Based on data from last 30 days"

---

### Rule 5: Never hide enterprise functionality.

If a feature exists and works, it has a sidebar entry. The sidebar is not a design element — it is the product's feature inventory.

Burying a feature in Settings to avoid sidebar clutter is product failure, not product design. Settings is for administrative functions. Everything else is in the primary or intelligence navigation.

**Features that must be reachable in ≤ 2 sidebar clicks:**
- Chief of Staff
- Weekly Review
- Trust Center / Integration Permissions
- AI Governance
- Audit Logs
- Security Center
- People Intelligence
- Customer Intelligence
- Success Dashboard

---

### Rule 6: Trust must be explicit before intelligence.

FLOW does not read a resource it has not been explicitly permitted to read. This rule cannot be bypassed by any configuration, feature flag, or user preference.

When a connector is first connected, all resources default to EXCLUDED. The Trust Center is the mechanism for making explicit inclusion decisions.

If the Trust Center feature is not yet built for a connector, that connector is listed as "coming soon" in the Trust Center. It is not silently ingested with implied permission.

---

### Rule 7: Execution is never automatic.

No action executes without a human in the loop. The minimum human involvement is clicking a primary action button. There is no "set it and forget it" mode that executes actions without any human confirmation.

Automation rules (Phase 7) may initiate actions, but they flow through the execution pipeline at fixed MEMBER role. They cannot initiate CRITICAL actions. The human is still in the loop for high-risk outcomes.

---

### Rule 8: Governance cannot be bypassed.

Every action — regardless of source (UI, automation, API, brain, command center) — flows through:

1. Risk classification
2. Governance evaluation (ALLOW/DENY/REQUIRE_APPROVAL)
3. executeAction() with full audit

There are no "trusted callers" that skip governance. There are no "admin shortcuts" that bypass DENY policies. The governance layer is the execution layer. They are the same pipeline.

---

### Rule 9: Failed features fail gracefully, not loudly.

When an API call fails:
- The page shows its last known data (cached or demo)
- An honest label is shown: "Showing sample data — connect X to go live"
- No full-page error screens
- No unhandled exceptions visible to the user

When FLOW's AI fails:
- The deterministic fallback kicks in
- The user gets a response, even if it came from a local heuristic
- No "AI is unavailable" screens

When a connector is down:
- The page renders with demo data labeled clearly
- The Trust Center shows the connector as DEGRADED or DOWN
- Other features continue to work

---

### Rule 10: The conversation persists.

Conversations with FLOW Brain are never lost. A user who asks "what's the status of the Postgres migration?" on Tuesday and logs in on Wednesday must be able to see and continue that conversation.

Conversation history is stored in PostgreSQL (`CopilotConversation`, `CopilotMessage`). SessionStorage is only used for same-session performance optimization, not as the primary store.

Building any feature that relies on sessionStorage or localStorage as the only conversation persistence mechanism violates this rule.

---

### Rule 11: Actions name what they do.

Button labels are verbs followed by specifics. Never generic verbs alone.

```
✓  "Merge via squash"
✓  "Approve PR #447"
✓  "Request review from Alice"
✓  "Send to Rahul"
✓  "Create standup Jira issue"

✗  "Submit"
✗  "Confirm"
✗  "OK"
✗  "Do it"
```

---

### Rule 12: Risk is communicated before action.

Every action button that carries HIGH or CRITICAL risk must show a risk badge before the user commits. The badge is visible in the default card state, not only after clicking.

```
[Merge to production]  HIGH ←-- visible on the button
```

The confirmation step for HIGH risk does not ask "Are you sure?" — it restates what will happen:

```
"This will merge PR #523 directly to the production branch.
All 2 ADMIN approvals have been received."
[Proceed with merge]   [Cancel]
```

---

### Rule 13: The privacy gate cannot be configured away.

The privacy gate (classifying content as PRIVATE_PERSONAL before storage) is not behind a feature flag, a workspace setting, or a policy. It is a core architectural invariant.

Content classified as PRIVATE_PERSONAL is discarded at the pipeline level. No database write. No log entry of the content. Only the `PRIVACY_SHIELD_TRIGGERED` WebSocket event (with no payload text) is emitted.

A feature request to "disable the privacy gate for testing" must be declined. Testing uses non-personal synthetic data.

---

### Rule 14: Never regress the integration suite.

The test suite at `npm run test:integration` runs against a live server on `:5001`. Before any commit that changes backend routes, middleware, or connector adapters: start the server and run the integration suite.

Baseline as of Phase 19: **66/74 pass, 8 pre-existing failures** (signup `name` vs `fullName` mismatch, legacy lifecycle-schema assertions). If a commit causes new failures beyond these 8, it is not merged.

---

### Rule 15: Document the why, not the what.

Code comments explain constraints and non-obvious invariants. They do not explain what the code does.

**Allowed:**
```js
// privacy gate cannot be disabled; see Rule 13 in docs/bible/20_PRODUCT_RULES.md
// edge IDs must use gen_random_uuid() — Prisma cuid() is app-side only, breaks raw SQL
// frontier cap 400: prevents runaway BFS on dense hubs (38s → 30ms without cap)
```

**Not allowed:**
```js
// loop through all items
// check if user is authenticated  
// return the result
```

---

## Anti-Pattern Reference

The following patterns have appeared in FLOW's history and must not recur.

### The Navigation Burial
**What happened:** A working feature (Chief of Staff, Weekly Review) ships but is not added to the sidebar. The next redesign replaces the sidebar without porting the entry points.  
**Result:** Features exist in the codebase but are unreachable without knowing the URL.  
**Prevention:** Rule 5. Every feature with a route has a sidebar entry. Sidebar changes require auditing all existing routes.

### The ChatGPT Opening
**What happened:** BrainHome auto-sends a greeting message before the user types anything.  
**Result:** FLOW behaves like a chatbot, not a Chief of Staff. Users feel they have to respond to a greeting before doing work.  
**Prevention:** Rule (07_AI_BEHAVIOR.md §Proactive Intelligence). Brain never auto-sends. It shows context and waits.

### The Demo Data Drift
**What happened:** KnowledgeExplorer.jsx renders entirely hardcoded demo nodes and edges. Phase 11.1 built a real graph engine with `/api/graph/*` endpoints. The frontend was never updated.  
**Result:** A major system (the Digital Twin) is invisible to users despite being fully built.  
**Prevention:** When a backend system is built, the corresponding frontend must be updated in the same sprint or the next. Features are not "done" until they are connected end-to-end.

### The Confidence Theater
**What happened:** BrainMessage shows ConversationMeta with confidence percentages and retrieval counts.  
**Result:** Users see "Confidence: 87%" and either distrust the other 13%, or simply don't know what to do with the number.  
**Prevention:** Rule 3. Confidence scores never appear in user-facing UI.

### The Disappearing Enterprise
**What happened:** Multiple redesign sprints deleted company intelligence routes (`/company/*` redirects to home, `ExecutiveDashboard.jsx` deleted from codebase) to simplify the sidebar.  
**Result:** Team Dashboard, Decision Board, Team Memory, Collaboration Hub, Company Memory, Department Intelligence, Executive Advisor — all shipped, all lost.  
**Prevention:** Rule 5. Features are never removed from navigation to achieve visual simplicity. If navigation is too complex, the structure is reorganized (groups, expandable sections). Features are not deleted.

### The Dead Route
**What happened:** CommandPalette NAV_COMMANDS includes `/dashboard`, `/briefing`, `/timeline`, `/company` — all of which redirect to home.  
**Result:** User searches for "Executive Dashboard" in ⌘K, clicks it, lands on the homepage confused.  
**Prevention:** NavCommands must only reference live routes. Deprecated routes must be removed from CommandPalette when they are deprecated.

---

## Decision Framework

When making a product decision, apply this framework in order:

1. **Does it answer "what should I do next?" faster?** If yes, proceed. If no, stop.
2. **Does it fit the Chief of Staff mental model?** Would a real Chief of Staff do this? If yes, proceed. If no, question it.
3. **Does it require a governance path?** If it involves any action on behalf of the user, yes.
4. **Is it discoverable from the sidebar?** If not, it will not be used.
5. **Can it fail gracefully?** If the API is down, does the UI still work? If not, add a fallback.
6. **Does it fit in the session?** A feature that requires a 3-step tutorial to use is not ready for enterprise users.

If all six answers are satisfactory, the feature is ready to design. If any answer is no, the feature is revised before design begins.
