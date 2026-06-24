<p align="center">
  <img src="./docs/assets/flow-os-banner.png" alt="FLOW OS Banner" width="100%" />
</p>

<h1 align="center">FLOW OS</h1>

<h3 align="center">The AI Operating System for Modern Companies</h3>

<p align="center">
  <strong>Connect.</strong> · <strong>Understand.</strong> · <strong>Coordinate.</strong> · <strong>Execute.</strong>
</p>

<p align="center">
  <a href="#-architecture"><img src="https://img.shields.io/badge/Architecture-Multi--Agent-blueviolet?style=for-the-badge" /></a>
  <a href="#-technology-stack"><img src="https://img.shields.io/badge/Stack-Node.js%20%7C%20React%20%7C%20pgvector-00b4a8?style=for-the-badge" /></a>
  <a href="#-getting-started"><img src="https://img.shields.io/badge/Status-Active%20Development-brightgreen?style=for-the-badge" /></a>
  <a href="#-license"><img src="https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge" /></a>
</p>

---

## 🧠 What is FLOW OS?

**FLOW OS** transforms fragmented company knowledge across **Gmail, Slack, Jira, Notion, Calendar, GitHub, and Meetings** into a unified operational intelligence layer that thinks, remembers, and acts.

Unlike traditional knowledge bases or chatbots, FLOW OS is built around four foundational pillars:

| Pillar | Description |
|---|---|
| 🔐 **Permission-Aware Memory Engine** | Every byte of data passes through a Cognitive Privacy Gate before storage. PII is hard-dropped. Social chatter is cached temporarily. Only operational intelligence reaches permanent memory. |
| 🕸️ **Organizational Knowledge Graph** | Entities (people, systems, events, decisions) are mapped with typed relationships and traversed up to 2 hops deep to enrich every query with structural context. |
| 🤖 **Multi-Agent Reasoning System** | A three-stage pipeline — **Router → Critic → Synthesis** — classifies intent, detects contradictions, deprecates stale data, and produces executive-grade answers. |
| 📋 **Proactive Daily Workfeed** | Every 24 hours, FLOW generates a rolling executive summary of incidents, decisions, and high-urgency signals — delivered before you even ask. |

> **Think of FLOW OS as the Chief of Staff your company never had — one that reads every message, remembers every decision, and never sleeps.**

---

## 🏗️ Architecture

<p align="center">
  <img src="./docs/assets/flow-architecture.png" alt="FLOW OS Architecture" width="85%" />
</p>

### The Intelligence Pipeline

Every piece of information that enters FLOW OS passes through a rigorous multi-stage pipeline before it can influence decisions:

```
Data Sources (Gmail, Slack, GitHub, Calendar, ...)
        │
        ▼
┌─────────────────────────────────────┐
│  🔐 Privacy Gatekeeper             │  Classifies: OPERATIONAL / SOCIAL / PRIVATE
│     LLM + Heuristic Classifier     │  Private data → hard purge (zero persistence)
└─────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────┐
│  ⭐ Importance Scoring Engine       │  Computes: importance × authority × urgency
│     Memory Brain Module             │  Maps to retention: PERMANENT → DISCARD
└─────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────┐
│  🧠 Organizational Memory          │  Dual storage: pgvector DB + Local Vault (.md)
│     Vector Store + Obsidian Sync    │  Synapse Engine: auto-clusters by topic
└─────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────┐
│  🕸️ Knowledge Graph                │  Entity nodes: USER, SYSTEM, INCIDENT, DECISION
│     2-Hop Relational Traversal     │  Enriches retrieval with structural context
└─────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────┐
│  🤖 Multi-Agent Brain              │  Router → Critic → Executive Synthesis
│     Gemini 2.5 Flash Powered       │  Contradiction detection + authority weighting
└─────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────┐
│  📋 Daily Workfeed  │  🔍 Search  │  🚨 Alerts  │  ✅ Tasks  │
└─────────────────────────────────────┘
```

---

## 🧬 FLOW Brain — Multi-Agent Reasoning

<p align="center">
  <img src="./docs/assets/flow-brain-pipeline.png" alt="FLOW Brain Pipeline" width="60%" />
</p>

The FLOW Brain is a **9-stage cognitive pipeline** that processes every query through specialized agents:

| Stage | Agent | Purpose |
|---|---|---|
| 1 | **Ingestion** | Raw data enters the pipeline from webhooks, pollers, or manual triggers |
| 2 | **Privacy Gate** | LLM-powered classifier (Gemini 2.5 Flash) with heuristic fallback — blocks PII |
| 3 | **Importance Scorer** | Keyword density analysis across high/medium/low tiers |
| 4 | **Memory Manager** | Composite scoring: `(importance × 0.45) + (authority × 0.35) + (urgency × 0.20)` |
| 5 | **Router Agent** | Classifies query domain (engineering, security, product, finance, ops, people) |
| 6 | **Reranker** | Reciprocal Rank Fusion (RRF) merges vector DB + vault filesystem results |
| 7 | **Critic Agent** | Detects temporal contradictions and authority conflicts across context nodes |
| 8 | **Synthesis Agent** | Produces polished Markdown executive brief via Gemini 2.5 Flash |
| 9 | **Executive Answer** | Final answer delivered via API + broadcast to dashboard via WebSocket |

### Authority Weight Matrix

Verified sources carry more weight than chat messages:

```
Source Authority Coefficients:
  GitHub, Obsidian, Vault, Git  →  1.5× (High Authority)
  Slack, Gmail, Chat, Discord   →  0.8× (Standard Authority)
  Unknown sources               →  1.0× (Default)
```

### Contradiction Detection

The **Critic Agent** scans context nodes for semantic contradictions across 5 topic clusters:

- `project_timeline` — "on track" vs "delayed"
- `system_health` — "stable" vs "outage"
- `infrastructure_migration` — "migrated" vs "rollback"
- `feature_availability` — "live" vs "rolled back"
- `security_posture` — "patched" vs "vulnerable"

When a contradiction is found, the lower-authority or older chunk is flagged as `DEPRECATED` and excluded from synthesis.

---

## 📦 Technology Stack

### Frontend Layer
```
React 19          →  Component architecture
Vite 6            →  Build tooling & dev server
CSS3              →  Glassmorphism dark-theme UI
WebSocket Client  →  Real-time event stream
```

### Backend Layer
```
Node.js 22        →  Runtime engine
Express 5         →  HTTP API framework
BullMQ            →  Background job queue
Redis             →  Cache + queue broker
WebSocket (ws)    →  Bi-directional live events
JWT + bcrypt      →  Authentication & hashing
```

### Intelligence Layer
```
Gemini 2.5 Flash  →  Classification + Synthesis
text-embedding-004 →  Vector embeddings (768-dim)
Composio SDK      →  OAuth integration broker
Google APIs       →  Gmail + Calendar polling
```

### Data Layer
```
PostgreSQL        →  Relational data store
Prisma 7          →  ORM with pg adapter
pgvector          →  Cosine similarity search (HNSW)
Local Vault       →  Obsidian-compatible .md files
In-Memory Store   →  Fast vector search + topic clusters
```

---

## 🔌 Integrations

| Platform | Status | Capabilities |
|---|---|---|
| 📧 **Gmail** | ✅ Live | OAuth2 read access, unread email polling, auto-draft responses |
| 📅 **Google Calendar** | ✅ Live | Event sync, attendee linking, Knowledge Graph injection |
| 💬 **Slack** | ✅ Webhook | Inbound message processing via Composio webhooks |
| 🐙 **GitHub** | 🔜 Planned | Commit/PR ingestion, code context extraction |
| 📋 **Jira** | 🔜 Planned | Ticket sync, sprint context, blocker detection |
| 📝 **Notion** | 🔜 Planned | Page sync, document ingestion |
| 🎮 **Discord** | 🔜 Planned | Server message ingestion |

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** ≥ 18
- **PostgreSQL** ≥ 15 (with `pgvector` extension)
- **Redis** ≥ 7

### 1. Clone the Repository

```bash
git clone https://github.com/NKishoreVarma/FLOW-OS.git
cd FLOW-OS
```

### 2. Install Dependencies

```bash
# Backend
npm install

# Frontend
cd flow-os-frontend
npm install
cd ..
```

### 3. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```env
PORT=5001
NODE_ENV=development

# LLM Engine
GEMINI_API_KEY=your_gemini_api_key
GEMINI_BASE_URL=https://generativelanguage.googleapis.com

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/flow_os_production

# Cache
REDIS_URL=redis://127.0.0.1:6379
```

### 4. Initialize the Database

```bash
# Create the pgvector schema
psql -U postgres -f database/init.sql

# Run Prisma migrations
npx prisma migrate dev
```

### 5. Start the Platform

```bash
# Terminal 1 — Backend
npm start

# Terminal 2 — Frontend
cd flow-os-frontend
npm run dev
```

The backend will be available at `http://localhost:5001` and the dashboard at `http://localhost:5173`.

---

## 📡 API Reference

### Core Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | System health check |
| `POST` | `/api/auth/signup` | Register user + create org |
| `POST` | `/api/auth/login` | Authenticate and receive JWT |
| `POST` | `/api/webhook/ingest` | Inbound communication webhook |
| `POST` | `/api/integrations/query` | Cognitive synthesis query |
| `POST` | `/api/query` | RAG context retrieval |
| `GET` | `/api/intelligence/health-score` | Workspace health metrics |
| `GET` | `/api/intelligence/daily-feed` | Daily operational feed |
| `POST` | `/api/test/simulate` | E2E pipeline simulation |

### WebSocket Events

Connect via: `ws://localhost:5001?workspaceId=your_workspace_id`

| Event | Direction | Description |
|---|---|---|
| `CONNECTION_ACK` | Server → Client | Handshake confirmation |
| `INGESTION_START` | Server → Client | Pipeline processing begun |
| `INTEL_STORED` | Server → Client | Chunk indexed in vector store |
| `PRIVACY_SHIELD_TRIGGERED` | Server → Client | PII detected and purged |
| `MEMORY_RETAINED` | Server → Client | Chunk accepted to long-term memory |
| `MEMORY_DISCARDED` | Server → Client | Chunk evaluated and dropped |
| `MEMORY_ESCALATED` | Server → Client | High-urgency signal detected |
| `INCIDENT_CREATED` | Server → Client | Automated incident detection |
| `DECISION_RECORDED` | Server → Client | Architectural decision extracted |
| `AGENT_ROUTING_STARTED` | Server → Client | Router Agent processing |
| `EXECUTIVE_SYNTHESIS_READY` | Server → Client | Final answer synthesized |
| `HEALTH_SCORE_UPDATED` | Server → Client | Workspace health recalculated |
| `ACTION_EXECUTED` | Server → Client | Automated action triggered |

### Multi-Tenant Isolation

All protected endpoints require the `workspace-id` header:

```bash
curl -X POST http://localhost:5001/api/query \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <jwt_token>" \
  -H "workspace-id: workspace_corp_alpha" \
  -d '{"queryText": "What is the current deployment status?"}'
```

---

## 🧪 Testing

The project includes comprehensive test scripts for every subsystem:

```bash
# Test the Multi-Agent pipeline (Router → Critic → Synthesis)
node testAgent.js

# Test the Action Orchestrator recipes
node testActionOrchestrator.js

# Test Knowledge Graph entity linking
node testKnowledgeGraph.js

# Test operational scoring engine
node testOperationalIntel.js

# Test vector search and embeddings
node testVector.js

# Test workspace health calculations
node testHealthScore.js

# Full E2E simulation (Privacy Gate → Vector Store → Synthesis)
curl -X POST http://localhost:5001/api/test/simulate \
  -H "Content-Type: application/json" \
  -H "workspace-id: workspace_corp_alpha" \
  -d '{"workspaceId": "workspace_corp_alpha"}'
```

---

## 📂 Project Structure

```
flow-os-backend/
│
├── 📁 database/                    # SQL schema initializers
│   └── init.sql                    # pgvector + HNSW index setup
│
├── 📁 prisma/                      # Prisma ORM configuration
│   ├── schema.prisma               # Multi-tenant data models
│   └── migrations/                 # Schema migration history
│
├── 📁 src/
│   ├── 📁 config/                  # Database, Redis, Queue configs
│   ├── 📁 core/                    # Middleware, errors, event bus
│   │   ├── middleware/             # JWT auth, rate limiter, tenant isolation
│   │   ├── errors/                 # Standardized error classes
│   │   └── events/                 # Centralized event bus
│   │
│   ├── 📁 controllers/            # Express request handlers
│   ├── 📁 routes/                  # API route definitions
│   ├── 📁 modules/                 # Modular feature packages
│   │   ├── auth/                   # Registration & login
│   │   ├── organizations/          # Org & workspace management
│   │   └── users/                  # User CRUD operations
│   │
│   ├── 📁 services/               # Core business logic
│   │   ├── 📁 agents/             # Multi-Agent reasoning pipeline
│   │   │   ├── RouterAgent.js      # Domain classification & intent detection
│   │   │   ├── CriticAgent.js      # Contradiction detection & deprecation
│   │   │   └── ExecutiveSynthesisAgent.js  # Gemini-powered executive briefs
│   │   │
│   │   ├── cognitiveBrainService.js    # Privacy Gate + Ingestion Stream
│   │   ├── memoryBrain.js              # Multi-dimensional retention scoring
│   │   ├── retrievalService.js         # Hybrid RAG (pgvector + vault fallback)
│   │   ├── vectorStoreService.js       # In-memory vector DB + Synapse Engine
│   │   ├── knowledgeGraphService.js    # Entity graph with 2-hop traversal
│   │   ├── incidentEngine.js           # Automated incident/risk detection
│   │   ├── decisionMemoryService.js    # NLP decision extraction
│   │   ├── healthScoreService.js       # Sector-level health scoring
│   │   ├── dailyIntelligenceService.js # 24hr executive briefings
│   │   ├── actionOrchestrator.js       # Event-driven automation recipes
│   │   ├── gmailInboundService.js      # Gmail OAuth + email polling
│   │   ├── calendarIntegration.js      # Calendar sync + KG linking
│   │   ├── socketService.js            # WebSocket event broadcaster
│   │   └── vaultService.js             # Obsidian-compatible vault writer
│   │
│   ├── 📁 workers/                # Background job processors
│   │   └── ingestionWorker.js      # BullMQ queue consumer
│   │
│   └── server.js                   # Application entry point
│
├── 📁 flow-os-frontend/           # React + Vite dashboard
│   └── src/
│       ├── App.jsx                 # Main dashboard shell
│       └── App.css                 # Glassmorphism dark theme
│
├── 📁 docs/                       # Documentation & assets
│   └── assets/                    # Architecture diagrams
│
└── test*.js                       # Integration test scripts
```

---

## 🔮 Roadmap

- [x] Cognitive Privacy Gate (LLM + Heuristic)
- [x] Multi-Agent Reasoning Pipeline (Router → Critic → Synthesis)
- [x] pgvector Embeddings + HNSW Cosine Similarity
- [x] Obsidian-Compatible Local Vault Sync
- [x] Gmail OAuth + Calendar Integration
- [x] Real-Time WebSocket Dashboard
- [x] Incident Detection Engine
- [x] Decision Memory Extraction
- [x] Daily Intelligence Feed
- [x] Knowledge Graph with 2-Hop Traversal
- [x] Automated Action Orchestrator
- [x] Authority-Weighted RAG Retrieval
- [ ] Apache AGE Graph Database Migration
- [ ] Hierarchical Summary Tree Pipelines (24hr rollups)
- [ ] Slack Bot Direct Integration
- [ ] Jira + Notion Connectors
- [ ] Enterprise SSO (SAML/OIDC)
- [ ] Docker Compose Production Deployment
- [ ] Multi-LLM Provider Switching (Claude, GPT-4, Gemini)

---

## 🤝 Contributing

Contributions are welcome! Please read the following guidelines:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m "feat: add amazing feature"`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

---

## 📜 License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

---

<p align="center">
  <strong>Built with ❤️ by <a href="https://github.com/NKishoreVarma">N Kishore Varma</a></strong>
</p>

<p align="center">
  <sub>FLOW OS — Because your company's knowledge deserves better than scattered chat threads.</sub>
</p>
