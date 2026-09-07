# FLOW OS Development System
**Version:** 1.0  
**Date:** 2026-07-18  
**Status:** Mandatory — every contributor and every PR must comply.

---

## What This Is

The FLOW Development System is the internal operating system used by the engineering team. It defines how features are proposed, reviewed, built, tested, secured, and shipped.

Every future PR must comply with these documents.

---

## Documents

| # | Document | What it governs |
|---|---|---|
| 01 | [Product Review](01_PRODUCT_REVIEW.md) | How features are proposed and approved before implementation |
| 02 | [Engineering Standards](02_ENGINEERING_STANDARDS.md) | Folder structure, naming, layering, API standards, SQL rules, AI calls, logging |
| 03 | [Design Review](03_DESIGN_REVIEW.md) | UI quality checklist, accessibility, motion, enterprise UX standards |
| 04 | [AI Development Rules](04_AI_DEVELOPMENT.md) | Rules for AI coding tools: what to read first, what to never do |
| 05 | [Definition of Done](05_DEFINITION_OF_DONE.md) | What "done" means — all states, tests, docs, navigation, security, telemetry |
| 06 | [Release Process](06_RELEASE_PROCESS.md) | Development → Code Review → QA → Staging → Pilot → Production pipeline |
| 07 | [QA Checklist](07_QA_CHECKLIST.md) | Functional, UX, accessibility, performance, security, AI, integration, regression QA |
| 08 | [Security Standard](08_SECURITY_STANDARD.md) | Auth, tenant isolation, secrets, SQL injection, XSS, SSRF, privacy gate, audit |
| 09 | [Performance Budget](09_PERFORMANCE_BUDGET.md) | Latency targets for API routes, AI calls, DB queries, frontend, animations |
| 10 | [Architecture Decisions](10_ARCHITECTURE_DECISIONS.md) | ADR template, decision log, migration process, breaking changes, deprecation |
| 11 | [Feature Proposal Template](11_FEATURE_PROPOSAL.md) | Fill-in template for every Product Review submission |
| 12 | [Product Metrics](12_PRODUCT_METRICS.md) | North Star, activation, retention, engagement, trust, execution, AI, pilot, enterprise |
| 13 | [Release Checklist](13_RELEASE_CHECKLIST.md) | Everything verified before a production deployment is issued |
| 14 | [Operating Principles](14_OPERATING_PRINCIPLES.md) | 8 engineering principles with examples for resolving conflicts and making decisions |

---

## How to Use This

**Starting a new feature:**  
Read GOV-01 (Product Review). Submit a proposal using GOV-11 template. Wait for approval.

**Before writing code:**  
Read GOV-04 (AI Development Rules) if using an AI coding tool. Read GOV-02 (Engineering Standards) for all backend code. Read GOV-03 (Design Review) for all UI code.

**Before opening a PR:**  
Complete the GOV-05 (Definition of Done) checklist. Run the integration suite (66/74 baseline).

**Before merging:**  
Verify the PR description includes the DoD checklist. Ensure design approval exists for UI changes.

**Before deploying:**  
Complete the GOV-13 (Release Checklist). Have the CTO sign off.

**When in doubt:**  
Apply the principle from GOV-14 that best fits the conflict. If the principles conflict, the earlier one takes precedence. If still unclear, ask before proceeding.

---

## Relationship to the Bible

The **FLOW OS Bible** (`docs/bible/`) defines *what* FLOW is — its vision, user experience, design system, components, AI behavior, architecture, and product rules.

The **FLOW Development System** (`docs/governance/`) defines *how* the engineering team builds FLOW — the processes, standards, checklists, and principles that govern every contribution.

Both are authoritative. The Bible defines the destination. The Development System defines how we get there safely.
