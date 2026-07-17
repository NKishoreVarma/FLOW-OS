# AGENTS.md

This file defines guidance for contributors and coding agents working in the FLOW-OS repository.

## Repository scope

- Backend: Node.js + Express service in `src/`
- Frontend: React/Vite app in `flow-os-frontend/`
- Data: Prisma schema/migrations in `prisma/`, SQL bootstrap in `database/`

## Core architectural guardrails

1. **Tenant isolation is mandatory**
   - Treat FLOW-OS as a strict multi-tenant platform.
   - Enforce `workspace_id` boundaries across API handlers, ingestion, retrieval, caching, and persistence.
   - Do not mix cross-workspace data in memory, Redis, vector storage, or filesystem writes.

2. **Ingestion and queue processing**
   - High-volume ingestion is queue-driven (BullMQ + Redis).
   - Keep queue/job changes aligned with worker and queue modules under `src/workers/` and related queue configuration.

3. **Privacy classification pipeline**
   - The cognitive privacy flow centers on `src/services/cognitiveBrainService.js`.
   - Respect classification outcomes:
     - `OPERATIONAL_INTEL`: normalize and persist to long-term intelligence stores.
     - `SOCIAL_COORDINATION`: route to short-lived cache paths.
     - `PRIVATE_PERSONAL`: hard drop; no persistent storage.

4. **Parsing and chunk formatting**
   - Keep text chunking/filtering logic consistent with `src/services/parserService.js`.
   - Preserve clean markdown-oriented output for downstream retrieval/synthesis.

5. **Vault synchronization**
   - `src/services/vaultService.js` should write workspace-scoped Markdown artifacts under vault paths segmented by workspace (for example, `/vaults/workspace_{id}/`).

6. **Integration/OAuth handling**
   - Integration orchestration belongs in `src/controllers/integrationController.js`.
   - Keep OAuth/tool-connection flows modular and provider-safe (Gmail, Slack, GitHub and future providers).

## Intelligence behavior constraints

- **Source authority weighting**: prioritize verified operational sources (vault/github artifacts) above chat/social text when ranking context.
- **Temporal correctness**: when newer operational intelligence contradicts older state, mark outdated records as deprecated to avoid stale synthesis.
- **Rolling summaries**: support periodic (24h) workspace-level synthesis for executive intelligence outputs.

## Change expectations

- Make focused, minimal changes tied to the requested task.
- Preserve existing module boundaries and naming style.
- Update related docs when behavior or contracts change.
- Validate changes with repository-supported scripts before finalizing.