# FLOW OS — Product Definition

## What It Is

FLOW OS is a multi-tenant enterprise intelligence operating system. It continuously ingests communication streams from corporate platforms (Slack, Gmail, GitHub, Jira, Calendar), classifies every message through a privacy gate, vectorizes operational intelligence into a semantic memory store, and surfaces the right information to the right person at the right moment through a real-time dashboard.

## Who Uses It

**Primary persona**: Knowledge workers (engineers, managers, executives) at B2B companies who live across 5+ tools and lose critical context switching between them.

**Secondary persona**: Operations leads who need a single dashboard to monitor workspace health, detect incidents, and track decisions in real time.

## Core Value Proposition

"If I have the next 20 minutes, what should I do first?" — FLOW OS answers that question with ranked, confidence-scored recommendations drawn from live operational data across every connected integration.

## Key Features

1. **Intelligent Workfeed** — Live ranked feed of actions, incidents, approvals, and meetings from all integrations. Hero section surfaces the single most impactful next action.
2. **Recommendation Engine** — Client-side urgency scoring that ranks pending work by business impact, derives health gain estimates, and explains reasoning with real data.
3. **Universal Action Center** — Connector-agnostic execution surface: one panel renders any action from any source (GitHub PR, Gmail approval, Jira ticket, Slack incident). AI drafts pre-populated.
4. **Executive Synthesis** — Multi-agent RAG pipeline (Router → Critic → Synthesis) answers natural-language workspace queries with Gemini-powered executive briefs.
5. **Real-Time Telemetry** — WebSocket pipeline pushes every ingestion stage, incident detection, and memory decision to the dashboard as it happens.
6. **Privacy Gate** — Every message is classified before storage; private personal communications are silently discarded, never logged.
7. **Knowledge Explorer** — Semantic search across all stored operational intelligence using pgvector ANN search.

## Product Principles

- **One workspace to rule them all** — FLOW is the single operational surface, not an aggregator that redirects elsewhere.
- **AI assists, humans approve** — Every AI-generated action has an approval step. Nothing executes without intent.
- **Intelligence over noise** — Surface what matters, discard what doesn't. Privacy and relevance are first-class.
- **Connector-agnostic** — The execution surface is generic; integrations plug in without changing core UI.

## Current Stage

Post-MVP. Full ingestion pipeline, RAG, WebSocket telemetry, auth, and frontend routing are production-ready. Several admin/platform pages are stubs. Test suite is empty.

## Tech Stack Summary

React 18 + Vite frontend (port 3000) backed by Node.js/Express server (port 5001) with PostgreSQL+pgvector, Redis/BullMQ, Google Gemini API, and WebSocket real-time layer.
