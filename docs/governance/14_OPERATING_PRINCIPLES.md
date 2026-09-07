# FLOW OS — Engineering Operating Principles
**Document:** GOV-14  
**Status:** Mandatory  
**Applies to:** Every engineer, designer, and contributor  
**Last updated:** 2026-07-18

---

## What Principles Are

Principles are not values on a poster. They are rules for resolving conflict.

When two good options exist, a principle tells you which one to choose. When a shortcut seems reasonable, a principle tells you whether to take it. When a deadline pressures you to skip a step, a principle tells you which steps cannot be skipped.

These principles are ordered. When two principles conflict, the earlier one takes precedence.

---

## Principle 1: Quality Over Speed

**Definition:** A feature that ships correctly in three weeks is better than a feature that ships broken in one.

**What this means:**
- A bug found in code review prevents a feature regression in production. Spend the time.
- A Definition of Done checklist that takes 30 minutes to complete prevents a 3-day incident. Do it.
- The integration suite exists to catch regressions. If it fails, stop and fix it — never merge past failures.

**What this does not mean:**
- Quality does not mean perfection. A working feature with one known non-critical rough edge ships. A perfect feature that never ships is useless.
- Quality does not mean unlimited time. If a feature is taking 3x longer than estimated, that is a signal that the scope was wrong or the approach needs to change — not that more time is the answer.

**In practice:**
```
✓ "I found two issues in QA. I'm fixing them before merging."
✓ "This approach is correct but takes 4 days. The shortcut takes 1 day and creates tech debt."
    → The shortcut is acceptable only if the tech debt is logged and scheduled.
✗ "I'll merge this now and fix the edge case in the next sprint."
    → The edge case will never be fixed. It will become a bug report.
```

---

## Principle 2: Trust Over Intelligence

**Definition:** A user who trusts FLOW uses it. A user who does not trust FLOW ignores it regardless of how intelligent it is.

**What this means:**
- Trust Center (deny-by-default permissions) ships before AI quality improvements.
- Governance and audit logs ship before additional AI agents.
- The privacy gate is never disabled or worked around, even "just for this case."
- When FLOW doesn't have enough evidence to answer confidently, it says so instead of guessing.

**What this does not mean:**
- We do not sacrifice all AI functionality to pursue theoretical trust improvements.
- A well-functioning feature that users rely on already has trust. Do not break it in the name of a new trust mechanism.

**In practice:**
```
✓ "The Executive Council is faster now, but it sometimes fabricates sources.
    Let's fix source attribution before releasing it to the pilot."
✓ "The user wants to disable the privacy gate for this test.
    We won't do that. Test with synthetic data."
✗ "The integration permissions are not built yet, but let's connect Gmail 
    and ingest everything — we can add permissions later."
    → This destroys trust on day one.
```

---

## Principle 3: Execution Over Analytics

**Definition:** A user who takes an action in FLOW got value. A user who read a dashboard did not.

**What this means:**
- Every new feature must answer: "What action does this enable?"
- Charts, metrics, and timelines are context for a recommendation — never the primary purpose of a page.
- If a feature delivers information but no action path, it is not ready. Add the action before shipping.
- The North Star metric (time to decisions handled) is more important than page views, session time, or feature adoption counts.

**What this does not mean:**
- Analytics are not forbidden. The Success Dashboard, Audit Logs, and Workspace Health pages all display information. But each of them has a primary action (Load Demo Company, Export, Investigate — respectively).
- Passive features (live feed, notifications) have value as context, but they must connect to action cards.

**In practice:**
```
✓ "The predictions page shows 22 predictions. Let's add an action card
    for the top 3 so users can act on them."
✓ "The Weekly Review shows engineering velocity trends.
    The primary action is 'Ask FLOW what to do about this.'"
✗ "Let's add a real-time graph of API latency for the workspace.
    Users will find it useful."
    → What action does it enable? None → not ready to ship.
```

---

## Principle 4: Simplicity Over Clutter

**Definition:** Every element in the UI must earn its place. If it cannot, remove it.

**What this means:**
- One primary action per page. Not two. Not three with "primary" and "secondary" labels.
- One primary AI insight per card. The rest is collapsed evidence.
- Sidebar items are features that work. Not "coming soon" stubs. Not rarely-used administrative tabs.
- Navigation changes require explicit approval — it is easier to add items than to remove them once users form habits.

**What this does not mean:**
- Minimalism at the expense of capability. A feature that exists and works must be navigable. Hiding it "to simplify" is product failure.
- Whitespace at the expense of information density. Enterprise users need density. They do not need empty space for aesthetic reasons.

**In practice:**
```
✓ "We have 14 items in the Intelligence section. Let's audit which ones
    users actually use and remove the ones that are not active."
✗ "Let's move Chief of Staff to a sub-menu to reduce sidebar clutter."
    → Chief of Staff is a primary surface. It stays at the top level.
✗ "Let's add a fourth button to this card for 'dismiss with feedback'."
    → One primary action. Secondary in a menu.
```

---

## Principle 5: Enterprise Over Consumer

**Definition:** FLOW is built for a CTO managing 50 engineers, not a consumer browsing content.

**What this means:**
- Information density. Enterprise users manage 50+ items in a session. Pagination, infinite scroll, and compressed cards are expected and appropriate.
- No celebration animations or confetti. Success is a one-line confirmation.
- Error messages are specific and actionable. "Something went wrong" is unacceptable to an enterprise administrator.
- Language is precise and professional. No emojis in production UI. No casual copy.
- Security and compliance features are first-class UI — they are not buried in admin settings.

**What this does not mean:**
- Enterprise means ugly. FLOW's Hermès Light palette is premium and warm. Functionality does not require visual austerity.
- Enterprise means complex. The Chief of Staff page should be usable by a new user in 30 seconds.

**In practice:**
```
✓ "The action card shows risk level, blocking count, and recommended action
    in 3 lines. That's the right density."
✗ "Let's add a congratulations animation when the user merges their first PR."
    → Enterprise software does not celebrate routine operations.
✗ "Let's use friendly emoji icons in the sidebar to make it feel approachable."
    → Monochrome SVG icons only.
```

---

## Principle 6: Consistency Over Novelty

**Definition:** A user who knows how DecisionCard works knows how it works everywhere. A user who has to re-learn every page is frustrated.

**What this means:**
- Use existing components. Before creating a new component, spend 15 minutes searching for an existing one that already does the job or can be extended.
- Patterns repeat. If the Chief of Staff page uses NOW/NEXT/LATER ordering, and the Inbox page surfaces urgent items, the Inbox should use the same ordering scheme.
- Labels are the same everywhere. The navigation label in the sidebar matches the H1 on the page. The `⌘K` command label matches the sidebar label.
- Colors mean the same thing everywhere. `--status-critical` is always red-adjacent. `--accent` is always the burnt-orange call-to-action.

**What this does not mean:**
- Every page is identical. Pages have different purposes and different layouts. Consistency in interaction patterns, not visual uniformity.
- Never innovate. New interaction patterns are introduced when existing ones genuinely cannot serve the purpose.

**In practice:**
```
✓ "The merge conflict card uses the same ActionBar component as the approval card.
    The pattern is consistent."
✗ "Let's build a custom inline action panel for the meeting page.
    It'll look cooler."
    → Use DecisionSlideOver. Extend it if needed. Don't build a parallel system.
```

---

## Principle 7: Architecture Over Hacks

**Definition:** A solution that respects the architecture is better than a solution that works today but creates a trap tomorrow.

**What this means:**
- New connector = new adapter. Do not add Gmail-specific logic to a route handler when a GmailAdapter.js is the right place.
- New action type = extension of the execution pipeline. Do not bypass executeAction() because "this action is simple."
- New page = new route file, new lazy component, new sidebar entry. Do not stuff a new page into an existing component "just to ship faster."
- Technical debt is logged in CLAUDE.md §9 when it is introduced. Not acknowledged silently. Not ignored.

**What this does not mean:**
- Architecture is more important than shipping. A perfectly architected feature that does not exist helps no one.
- Every task requires a full architecture review. A small bug fix does not need an ADR.

**In practice:**
```
✓ "This new action needs to go through executeAction() and the approval engine.
    It adds 2 hours to the task. That's the right choice."
✗ "I'll call the Jira API directly from the route handler this time.
    The JiraAdapter can come later."
    → It never comes later. The direct call becomes the permanent path.
```

---

## Principle 8: Documentation Before Implementation

**Definition:** If you cannot explain what you are building before you build it, you do not understand it well enough to build it correctly.

**What this means:**
- The Feature Proposal (GOV-11) is written before the first line of code.
- The implementation plan is reviewed before the first commit.
- CLAUDE.md is updated in the same PR that introduces the change — not "in a follow-up."
- ADRs are written for architectural decisions before the decisions are implemented.

**What this does not mean:**
- Documentation for its own sake. The Feature Proposal exists to clarify thinking, not to create paperwork. A one-paragraph proposal is fine for a small feature.
- No code without a finished document. "I'll refine the proposal as I implement" is acceptable for small changes where the scope is clear. It is not acceptable for new systems.

**In practice:**
```
✓ "Let me update CLAUDE.md with the new routes before I open the PR."
✓ "The ADR captures why we chose bounded BFS over recursive CTEs.
    Future engineers won't need to rediscover the 38-second failure mode."
✗ "The code is self-documenting. I don't need to update the API reference."
    → Documentation serves future contributors who cannot read your mind.
```

---

## The Meta-Principle

**When in doubt, ask.**

The cost of asking is one message and one reply. The cost of assuming is a refactor, a regression, or a security incident.

An AI tool, an engineer, or a designer who is unsure which principle applies stops and asks. The product review meeting exists precisely for this purpose. The architecture decision record process exists for this purpose.

FLOW has accumulated 19 phases of deliberate decisions. Respecting those decisions — while being willing to improve them through the right channels — is what turns FLOW from a collection of features into a coherent product.
