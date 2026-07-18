# FLOW OS — AI-Assisted Development Rules
**Document:** GOV-04  
**Status:** Mandatory  
**Applies to:** All contributors using AI coding tools (Claude Code, GitHub Copilot, Cursor, GPT-4, etc.)  
**Last updated:** 2026-07-18

---

## Purpose

AI coding assistants are first-class contributors to FLOW. They are productive, fast, and dangerous when given incomplete context. This document defines the rules that AI tools must follow when working in the FLOW codebase.

These rules exist because AI tools have previously:
- Removed features from the sidebar while "simplifying" navigation
- Created duplicate components that shadow existing ones
- Invented navigation routes that do not match the Information Architecture
- Added inline hex colors instead of design tokens
- Written code that bypasses governance middleware
- Generated placeholder AI responses without deterministic fallbacks

This document prevents recurrence.

---

## Before Writing Any Code

An AI tool starting a new task must complete all of the following before writing a single line of code:

### Step 1: Read the Bible
Read the relevant `docs/bible/` documents for the task domain:

| Task type | Required reading |
|---|---|
| New UI page | `04_INFORMATION_ARCHITECTURE.md`, `05_NAVIGATION.md`, `17_PAGES.md`, `20_PRODUCT_RULES.md` |
| New component | `06_DESIGN_SYSTEM.md`, `18_COMPONENT_LIBRARY.md`, `19_COPYWRITING.md` |
| AI behavior change | `07_AI_BEHAVIOR.md`, `08_COMMAND_CENTER.md`, `19_COPYWRITING.md` |
| New backend route | `11_EXECUTION_ENGINE.md`, `12_ENTERPRISE.md`, `13_CONNECTORS.md` |
| New connector/adapter | `13_CONNECTORS.md`, `11_EXECUTION_ENGINE.md`, `10_TRUST_CENTER.md` |
| Navigation change | `04_INFORMATION_ARCHITECTURE.md`, `05_NAVIGATION.md`, `20_PRODUCT_RULES.md` Rule 5 |

### Step 2: Read CLAUDE.md
The `CLAUDE.md` in the project root is the engineering reference document. Read the relevant sections before touching any system:
- Section 3: Coding Conventions
- Section 4: Engineering Rules
- Section 5: Backend Architecture
- Section 10: Current Sprint

### Step 3: Read the Governance documents
Read `docs/governance/02_ENGINEERING_STANDARDS.md` and any governance documents relevant to the task domain.

### Step 4: Explore the existing codebase
Before implementing anything:
- Identify every existing file that the task touches.
- Identify every API that already exists for the task domain.
- Confirm the feature does not already exist in a different form.
- If similar code already exists: extend it, do not duplicate it.

---

## Absolute Rules — Never Violate

These rules are not context-dependent. They apply in every situation.

### Rule A: Never remove an existing capability

Existing features, routes, and API endpoints must not be removed unless the Product Review process has explicitly approved their removal. Refactoring is not a license to delete.

**Examples of forbidden actions:**
- Removing a sidebar navigation item to "simplify" the sidebar
- Deleting a route because it "seems unused"
- Replacing a component with a "simpler version" that lacks its original capabilities
- Removing a fallback path because it "adds complexity"

If code appears unused, verify with a git search before deleting. If it is definitively unused after verification, remove it and note the removal in the commit message.

### Rule B: Never create a duplicate feature

Before implementing any new component, service, or route, search the codebase for existing implementations that serve the same purpose.

- A second "action card" component is not created while `ExecutableActionCard.jsx` exists.
- A second "governance check" is not implemented while `evaluateWithPolicies()` exists.
- A second "notification engine" is not built while `src/notifications/` exists.
- A second "slide-over panel" is not created while `DecisionSlideOver.jsx` exists.

If the existing implementation is insufficient, extend it. Do not shadow it with a new file.

### Rule C: Never bypass governance

Every action that modifies external state must flow through:
1. `riskClassifier` → risk level
2. `evaluateWithPolicies()` → ALLOW/DENY/REQUIRE_APPROVAL
3. `executeAction()` → full pipeline with audit

There are no shortcuts. There are no "trusted callers" that skip governance. There are no "admin modes" that bypass policy evaluation.

### Rule D: Never invent navigation

Routes, sidebar items, and CommandPalette entries must exist in `docs/bible/04_INFORMATION_ARCHITECTURE.md` and `docs/bible/05_NAVIGATION.md`. If a route is not in those documents, it must go through Product Review before being added to navigation.

Do not add a sidebar item "temporarily". Do not add a ⌘K command "as a placeholder". Navigation is the product's feature inventory — it must be accurate at all times.

### Rule E: Never use raw hex colors

All colors must reference CSS custom properties from `docs/bible/06_DESIGN_SYSTEM.md`.

```jsx
// Forbidden
style={{ color: '#E8672B', background: '#F7F2E9' }}
className="text-orange-500 bg-stone-50"

// Correct
style={{ color: 'var(--accent)', background: 'var(--surface-0)' }}
className applied through token-aware CSS classes only
```

### Rule F: Never show confidence scores or retrieval metadata in UI

Banned from any user-facing string, React prop, or displayed text:
- Confidence percentages ("87% confident")
- Vector similarity scores ("0.84 similarity")
- Retrieval counts ("found in 14 chunks")
- AI model references ("According to Gemini...")
- Uncertainty hedges ("I believe...", "It seems...")
- Self-references ("As an AI...")

When an AI tool generates response copy, run it through `docs/bible/19_COPYWRITING.md` banned phrases list before placing it in UI.

### Rule G: Never implement without a fallback

Every Gemini/LLM call has a deterministic fallback that returns useful output without an API key. The pattern is:

```js
if (!process.env.GEMINI_API_KEY) {
  return localFallback(params);
}
try {
  return await geminiCall(params);
} catch {
  return localFallback(params);
}
```

An AI call without a fallback is not done. It is a half-implementation.

### Rule H: Never write implementation without a plan approval

Per `CLAUDE.md` Engineering Rule 10: **Ask for approval before any feature implementation. Present a plan and wait for sign-off.**

For AI-tool-assisted development, this means: before implementing a feature, present the approach (files to create/modify, key decisions, architectural choices) and wait for the human engineer to confirm before proceeding.

An AI tool that begins a large implementation autonomously without presenting a plan is violating this rule.

---

## Code Quality Rules for AI-Generated Code

### Comments
Write no comments by default. The only acceptable comments explain WHY (non-obvious constraints, security invariants, workarounds for specific bugs). Comments explaining WHAT the code does are forbidden.

```js
// Acceptable:
// frontier cap prevents runaway BFS on dense hubs (38s → 30ms without it)
// edge IDs must use gen_random_uuid()::text — Prisma cuid() is app-side only

// Forbidden:
// loop through each item
// return the result
// check if user is authenticated
```

### No Unused Variables
Remove all unused variables. Do not prefix with `_` to suppress warnings. If a variable is not used, it does not exist.

### Async
All new code is async/await. Never callbacks in new code. Never `.then()` chains in new code (except where chaining is genuinely cleaner, which is rare).

### No Feature Scope Creep
The implementation does exactly what the approved plan specifies. It does not add "helpful" utilities, "future-proof" abstractions, or "while I'm here" cleanups beyond the task scope. If cleanup is needed, it is a separate PR.

---

## Frontend-Specific Rules

### Component Files
- `.jsx` only. Never create new `.tsx` files. TypeScript is not configured in this project.
- One component per file.
- Components do not make API calls unless they are page-level orchestrators. Child components receive data via props.
- All routes lazy-loaded with `React.lazy` + `Suspense`.

### CSS
- No Tailwind arbitrary values (`w-[427px]`).
- No inline styles except where dynamically computed.
- No CSS `!important`.
- Animation: use the keyframes from `src/styles/animations.css`. Never define new keyframes inline.

### State Management
- No global state management library. Data flows via props and context where needed.
- `useWebSocket` hook for WebSocket state.
- API calls use `useState` + `useEffect` pattern at the page level.

---

## Backend-Specific Rules

### ESM
Every file: `import`/`export`. No `require()`.

### Tenant Isolation
Every handler touching workspace data validates `workspace-id` header. No exceptions.

### SQL
- Parameterized queries only. `$1`, `$2`, never string interpolation.
- `WHERE workspace_id = $N` on every query that touches workspace-scoped data.
- `pg.Pool` for intelligence tables. Prisma for identity tables.

### BullMQ Jobs
- Idempotent. The same job can run twice safely.
- Failed jobs leave no side effects. DB writes are rolled back or idempotent.

---

## What to Do When Unsure

If an AI tool is unsure whether an action is allowed by these rules:

1. **Stop.** Do not proceed with the uncertain action.
2. **State the uncertainty** to the human engineer: "I'm not sure whether X is correct given rule Y."
3. **Wait for guidance** before continuing.

Proceeding with uncertain architectural decisions "to be helpful" has historically caused more work than waiting for guidance. Uncertainty is information. Share it.
