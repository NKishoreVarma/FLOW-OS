# FLOW OS // Core Agentic Integration Instructions

You are executing modifications inside the `flow-os-backend` core architecture repository. Always adhere to these structural alignment rules when writing or refactoring system logic.

## 👥 System Integration Directives
- This is a multi-tenant corporate intelligence platform. Every document, chat string, and database record MUST be isolated using a strict `workspace_id` header check.
- High-volume background ingestion events are driven via BullMQ and Redis (`src/workers/queue.js`).
- Clean text chunking, social data filtering, and formatting configurations live within `src/services/parserService.js`.

## 🧠 Upcoming Engineering Targets
1. **The Cognitive Privacy Gate (`src/services/cognitiveBrainService.js`)**:
   Classify text chunks into:
   - `OPERATIONAL_INTEL` -> Stitch, format to standard Markdown, generate embeddings, and upsert to pgvector.
   - `SOCIAL_COORDINATION` -> Route to short-lived temporary Redis cache loops.
   - `PRIVATE_PERSONAL` -> Execute a hard data drop instantly.
2. **The Obsidian Sync Layer (`src/services/vaultService.js`)**:
   Save filtered Markdown text files straight into local directory structures sandboxed by corporate workspace keys (`/vaults/workspace_{id}/`).
3. **The Composio SDK Hookup (`src/controllers/integrationController.js`)**:
   Integrate cloud-brokered OAuth tool handshakes for seamless one-click user token connections (Gmail, Slack, GitHub).
   ## 🚀 Advanced Cognitive Features (Adapted from OpenHuman)
- **Source Authority Indexing**: When calculating context weights for RAG, apply an authority matrix where verified files (Obsidian Vault, GitHub commits) carry a higher coefficient ($1.5$) than chat messaging strings ($0.8$).
- **Hierarchical Summary Tree Pipelines**: Every 24 hours, group individual operational chunks by `workspace_id` and channel to generate an updated rolling executive summary markdown file.
- **Contradiction Revision Checks**: Before completing lookups, verify temporal overrides. If a newer operational chunk explicitly contradicts past state flags, flag the old record's metadata state as `DEPRECATED` to prevent the agent from serving stale documentation.