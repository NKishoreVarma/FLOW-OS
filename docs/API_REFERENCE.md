# FLOW OS // REST API Reference Manual

This document provides a detailed specification for the FLOW OS REST API endpoints, detailing authentication, multi-tenant isolation, request payloads, response payloads, and example usage.

---

## 👥 Authentication & Multi-Tenancy

FLOW OS enforces strict security and isolation boundaries across two distinct layers:

1. **Identity Authentication (JWT)**: Passed via the standard HTTP header:
   ```http
   Authorization: Bearer <JWT_TOKEN>
   ```
2. **Tenant Isolation (`workspace-id`)**: All tenant data operations require a tenant tracking header to isolate documents, embeddings, and telemetry:
   ```http
   workspace-id: <WORKSPACE_EXTERNAL_ID>
   ```

Public routes (e.g., `/api/health`, `/api/auth/login`, `/api/auth/signup`) do not require these headers. All other endpoints will reject requests returning `401 Unauthorized` or `400 Bad Request`.

---

## 🗂️ Endpoint Summary

### 🔐 1. Authentication Modules (`/api/auth`)

#### `POST /api/auth/signup`
Creates a new organization, workspace, and owner account.
* **Authentication**: None (Public)
* **Request Body**:
  ```json
  {
    "email": "owner@company.com",
    "password": "SecurePassword123!",
    "fullName": "Jane Doe",
    "orgName": "Acme Corp"
  }
  ```
* **Response (201 Created)**:
  ```json
  {
    "user": {
      "id": "cuid-user-123",
      "email": "owner@company.com",
      "fullName": "Jane Doe",
      "role": "OWNER"
    },
    "token": "eyJhbGciOi...",
    "workspace": {
      "id": "cuid-ws-123",
      "name": "Acme Corp Workspace",
      "externalId": "workspace_acme_corp"
    }
  }
  ```

#### `POST /api/auth/login`
Authenticates a user and returns a signed JWT.
* **Authentication**: None (Public)
* **Request Body**:
  ```json
  {
    "email": "owner@company.com",
    "password": "SecurePassword123!"
  }
  ```
* **Response (200 OK)**:
  ```json
  {
    "user": {
      "id": "cuid-user-123",
      "email": "owner@company.com",
      "fullName": "Jane Doe",
      "role": "OWNER",
      "orgId": "cuid-org-123"
    },
    "token": "eyJhbGciOi..."
  }
  ```

---

### 🏢 2. Organization Management (`/api/org`)

#### `GET /api/org`
Returns the metadata for the authenticated user's organization.
* **Authentication**: JWT Required
* **Response (200 OK)**:
  ```json
  {
    "id": "cuid-org-123",
    "name": "Acme Corp",
    "slug": "acme-corp",
    "plan": "free",
    "createdAt": "2026-06-26T22:00:00Z"
  }
  ```

#### `PATCH /api/org`
Updates organization metadata.
* **Authentication**: JWT (OWNER or ADMIN only)
* **Request Body**:
  ```json
  {
    "name": "Acme Global Corp"
  }
  ```
* **Response (200 OK)**:
  ```json
  {
    "id": "cuid-org-123",
    "name": "Acme Global Corp",
    "slug": "acme-corp",
    "plan": "free"
  }
  ```

#### `GET /api/org/workspaces`
Lists all workspaces under the organization.
* **Authentication**: JWT Required
* **Response (200 OK)**:
  ```json
  [
    {
      "id": "cuid-ws-123",
      "name": "Acme Corp Workspace",
      "externalId": "workspace_acme_corp",
      "orgId": "cuid-org-123"
    }
  ]
  ```

#### `POST /api/org/workspaces`
Spawns a new workspace under the organization.
* **Authentication**: JWT (OWNER or ADMIN only)
* **Request Body**:
  ```json
  {
    "name": "Engineering Workspace",
    "externalId": "workspace_acme_eng"
  }
  ```
* **Response (201 Created)**:
  ```json
  {
    "id": "cuid-ws-456",
    "name": "Engineering Workspace",
    "externalId": "workspace_acme_eng",
    "orgId": "cuid-org-123"
  }
  ```

---

### 👤 3. User Management (`/api/users`)

#### `GET /api/users`
Lists all users in the organization.
* **Authentication**: JWT Required
* **Response (200 OK)**:
  ```json
  [
    {
      "id": "cuid-user-123",
      "email": "owner@company.com",
      "fullName": "Jane Doe",
      "role": "OWNER",
      "isActive": true
    }
  ]
  ```

#### `POST /api/users/invite`
Invites a new member or admin to the organization.
* **Authentication**: JWT (OWNER or ADMIN only)
* **Request Body**:
  ```json
  {
    "email": "engineer@company.com",
    "password": "TemporaryPassword123!",
    "fullName": "Bob Builder",
    "role": "MEMBER"
  }
  ```
* **Response (201 Created)**:
  ```json
  {
    "id": "cuid-user-789",
    "email": "engineer@company.com",
    "fullName": "Bob Builder",
    "role": "MEMBER",
    "isActive": true
  }
  ```

---

### 📥 4. Ingest Webhooks (`/api/webhook`)

#### `POST /api/webhook/ingest`
Webhook ingest pipeline endpoint. Accepts lists of messages from communication platforms and queues them for cognitive processing.
* **Authentication**: JWT Required
* **Request Body**:
  ```json
  {
    "workspaceId": "workspace_corp_alpha",
    "platform": "slack",
    "channelId": "general",
    "messages": [
      {
        "text": "CRITICAL: database migration required immediately.",
        "sender": "CTO"
      }
    ]
  }
  ```
* **Response (202 Accepted)**:
  ```json
  {
    "success": true,
    "message": "1 message(s) staged in background queue.",
    "jobIds": [
      "8052"
    ]
  }
  ```

---

### 🔌 5. Composio Integrations (`/api/integrations`)

#### `POST /api/integrations/connect`
Generates a Composio connection link for authenticating tools (Slack, GitHub, Gmail) via cloud OAuth.
* **Authentication**: JWT Required, `workspace-id` Header Required
* **Request Body**:
  ```json
  {
    "appName": "slack"
  }
  ```
* **Response (200 OK)**:
  ```json
  {
    "success": true,
    "connectionStatus": "INITIATED",
    "redirectUrl": "https://dashboard.composio.dev/connection/..."
  }
  ```

#### `POST /api/integrations/gmail/sync`
Triggers an immediate dynamic sync of Gmail messages into the workspace pipeline.
* **Authentication**: JWT Required, `workspace-id` Header Required
* **Response (200 OK)**:
  ```json
  {
    "success": true,
    "syncMode": "DYNAMIC_INBOX_PULL",
    "messagesSynced": 5
  }
  ```

---

### 🔎 6. Context Queries & RAG (`/api/query`)

#### `POST /api/query`
Performs authority-weighted semantic vector retrieval and executes the Critic and Executive Synthesis agents to answer queries.
* **Authentication**: JWT Required, `workspace-id` Header Required
* **Request Body**:
  ```json
  {
    "queryText": "What are our database migration deadlines? priority:high"
  }
  ```
* **Response (200 OK)**:
  ```json
  {
    "query": "What are our database migration deadlines? priority:high",
    "workspaceId": "workspace_corp_alpha",
    "queryTraceId": "QRY-20260626-9z1k2",
    "totalResults": 1,
    "results": [
      {
        "rank": 1,
        "channel": "general",
        "platform": "slack",
        "title": "SLACK Chunk (general)",
        "authorityCoeff": 0.8,
        "score": 0.822,
        "content": "CRITICAL: database migration required immediately.",
        "source": "vector_db"
      }
    ],
    "synthesisBrief": "Based on the retrieved team communications, the CTO declared that the database migration must be executed immediately."
  }
  ```

---

### 🧠 7. Intelligence Rollups (`/api/intelligence`)

#### `GET /api/intelligence/health-score`
Computes operational health scores (based on decisions and incident frequencies) for the workspace.
* **Authentication**: JWT Required, `workspace-id` Header Required
* **Response (200 OK)**:
  ```json
  {
    "workspaceId": "workspace_corp_alpha",
    "healthScore": 92.5,
    "activeIncidentsCount": 1,
    "decisionsMadeCount": 5,
    "status": "GREEN"
  }
  ```

#### `POST /api/intelligence/rolling-summary`
Compiles an executive summary markdown document of workspace events for the specified hourly window.
* **Authentication**: JWT Required, `workspace-id` Header Required
* **Request Body**:
  ```json
  {
    "hours": 24
  }
  ```
* **Response (200 OK)**:
  ```json
  {
    "success": true,
    "filePath": "/vaults/workspace_workspace_corp_alpha/rolling_summary_24h.md",
    "chunkCount": 8,
    "summary": "# Executive Rolling Summary (Last 24 Hours)..."
  }
  ```

---

### 🕷️ 8. Crawler (`/api/crawler`)

#### `POST /api/crawler/scrape`
Securely crawls a webpage, sanitizes and strips HTML markup into clean markdown.
* **Authentication**: JWT Required, `workspace-id` Header Required
* **Request Body**:
  ```json
  {
    "url": "https://news.ycombinator.com",
    "maxBytes": 1048576
  }
  ```
* **Response (200 OK)**:
  ```json
  {
    "success": true,
    "workspaceId": "workspace_corp_alpha",
    "data": "## Hacker News\n..."
  }
  ```

---

### 🧪 9. Simulation (`/api/test/simulate`)

#### `POST /api/test/simulate`
Triggers an end-to-end cognitive run testing ingestion, privacy filtering, incident detection, memory brain, vector store, and WebSocket broadcasting.
* **Authentication**: JWT Required
* **Request Body**:
  ```json
  {
    "workspaceId": "workspace_corp_alpha",
    "channelName": "support"
  }
  ```
* **Response (200 OK)**:
  ```json
  {
    "workspaceId": "workspace_corp_alpha",
    "totalPayloads": 10,
    "passed": 10,
    "failed": 0,
    "allPassed": true
  }
  ```

---

### 🏥 10. Health Status (`/health` & `/api/health`)

#### `GET /health` or `GET /api/health`
Returns detailed system connection status and performance logs for system services.
* **Authentication**: None (Public)
* **Response (200 OK / 500 Internal Server Error)**:
  ```json
  {
    "status": "HEALTHY",
    "version": "1.0.0",
    "buildTime": "2026-06-26T17:07:32.412Z",
    "uptime": 125.8,
    "components": {
      "postgres": {
        "status": "CONNECTED",
        "latencyMs": 8
      },
      "redis": {
        "status": "CONNECTED"
      },
      "queue": {
        "status": "CONNECTED",
        "details": "Queue connection: ready"
      },
      "websocket": {
        "status": "CONNECTED",
        "activeWorkspaces": 1,
        "activeClients": 2
      },
      "embeddings": {
        "status": "CONNECTED",
        "provider": "Gemini",
        "model": "gemini-embedding-2"
      },
      "memory": {
        "status": "ACTIVE"
      },
      "vectorStore": {
        "status": "ACTIVE"
      }
    }
  }
  ```
