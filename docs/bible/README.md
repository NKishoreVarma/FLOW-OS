# FLOW OS Bible
**Version:** 1.0  
**Date:** 2026-07-18  
**Status:** Authoritative — every future implementation references this document set.

---

## What This Is

The FLOW OS Bible is the single source of truth for every design and engineering decision in FLOW. It documents what FLOW is, how it thinks, how it looks, how it behaves, and what rules it never breaks.

Nothing should be implemented without matching this specification.

---

## Documents

| # | Document | What it covers |
|---|---|---|
| 01 | [VISION](01_VISION.md) | Mission, vision, north star, product principles, success metrics |
| 02 | [PRODUCT PHILOSOPHY](02_PRODUCT_PHILOSOPHY.md) | How FLOW thinks, decision-first, AI-first, enterprise-first, trust-first, anti-patterns |
| 03 | [USER EXPERIENCE](03_USER_EXPERIENCE.md) | Personas (CTO, Manager, Engineer, CEO, Sales, HR), daily routines, experience standards |
| 04 | [INFORMATION ARCHITECTURE](04_INFORMATION_ARCHITECTURE.md) | Complete site map, every page, every API, feature grouping rationale |
| 05 | [NAVIGATION](05_NAVIGATION.md) | Sidebar structure, Command Center, keyboard shortcuts, deep links, navigation rules |
| 06 | [DESIGN SYSTEM](06_DESIGN_SYSTEM.md) | Colors, typography, spacing, animation, components, accessibility, enterprise language |
| 07 | [AI BEHAVIOR](07_AI_BEHAVIOR.md) | Personality, message structure, tone rules, reasoning pipeline, memory, fallbacks |
| 08 | [COMMAND CENTER](08_COMMAND_CENTER.md) | StickyCommandCenter (all states), CommandPalette, slash commands, context awareness |
| 09 | [CHIEF OF STAFF](09_CHIEF_OF_STAFF.md) | ActionCard spec, NOW/NEXT/LATER agenda, Weekly Review, Recommendation Engine scoring |
| 10 | [TRUST CENTER](10_TRUST_CENTER.md) | Deny-by-default, enforcement points, ConnectorPanel, per-connector resources, audit |
| 11 | [EXECUTION ENGINE](11_EXECUTION_ENGINE.md) | Full pipeline, risk tiers, approval flows, two-person rule, rollback, audit log |
| 12 | [ENTERPRISE](12_ENTERPRISE.md) | Data model, roles, multi-workspace, tenant isolation, auth, governance policies, billing |
| 13 | [CONNECTORS](13_CONNECTORS.md) | Framework architecture, all adapters (Tier 1/2/3), adding a connector, health, search |
| 14 | [MEMORY](14_MEMORY.md) | 4 memory layers, retention policy, RAG retrieval, conversation persistence, privacy gate |
| 15 | [KNOWLEDGE GRAPH](15_KNOWLEDGE_GRAPH.md) | 21 node types, 19 edge types, traversal, analysis (impact/dependency/relationship) |
| 16 | [WORKFLOWS](16_WORKFLOWS.md) | 10 end-to-end workflows (Morning Brief, Engineering, PR Review, Incident, etc.) |
| 17 | [PAGES](17_PAGES.md) | Every page: purpose, primary action, AI role, components, states, data sources |
| 18 | [COMPONENT LIBRARY](18_COMPONENT_LIBRARY.md) | Every reusable component, props, states, deprecation schedule |
| 19 | [COPYWRITING](19_COPYWRITING.md) | Voice, tone, labels, button copy, notifications, errors, empty states, banned phrases |
| 20 | [PRODUCT RULES](20_PRODUCT_RULES.md) | 15 golden rules, anti-pattern reference, decision framework |

---

## How to Use This

**Before designing a new feature:**  
Read 01 (Vision), 02 (Philosophy), 04 (IA), and 20 (Rules). Confirm the feature fits the north star before sketching anything.

**Before implementing a UI component:**  
Read 06 (Design System), 18 (Component Library), and 19 (Copywriting). Use existing components before creating new ones.

**Before writing backend code:**  
Read 11 (Execution Engine), 12 (Enterprise), and 13 (Connectors). Every action routes through the governed execution pipeline. No exceptions.

**Before changing navigation:**  
Read 04 (IA), 05 (Navigation), and Rule 5 in 20 (Product Rules). Never remove an existing feature from navigation without a replacement entry point.

**Before writing AI copy or responses:**  
Read 07 (AI Behavior) and 19 (Copywriting). Check the banned phrases list. Apply the message structure (Summary → Insights → Actions → Evidence).

---

## The North Star (memorize this)

> A CTO opens FLOW at 7:45 AM. Without configuring anything, they see three things that matter. They handle all three by 8:10 AM. The rest of their day is better because of it.

Every decision — navigation, AI behavior, design, API design, engineering rule — is measured against this moment.
