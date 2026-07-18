/**
 * FLOW OS — Notion Connector Adapter
 *
 * Knowledge Capability — first provider.
 * All returns use FLOW normalized types.
 */

import { BaseAdapter } from '../BaseAdapter.js';
import { Capability, ActionType, AuthStrategy } from '../capabilities.js';
import { createKnowledgeDocument, createSearchResult } from '../normalizedTypes.js';
import { getCredentials, storeApiKey } from '../authManager.js';
import { AppError, ValidationError } from '../../core/errors/index.js';
import { EntityTypes, registerEntity, linkEntities } from '../../services/knowledgeGraphService.js';

// --- Default Demo Data (Fallback when Notion credentials are not configured) ---
const MOCK_DOCUMENTS = [
  {
    id: 'doc-1',
    title: 'SOC2 Compliance Architecture',
    content: 'This document defines the key controls and architectures required to meet SOC2 Type II trust principles for security and confidentiality. We adopt AWS KMS for envelope encryption and maintain strict column-level encryption on the User and Org tables. Encryption algorithms must use AES-256-GCM. Decryption keys are isolated within a dedicated workspace VPC.',
    excerpt: 'Core security architecture specification outlining AWS KMS and AES-256-GCM tenant envelope encryption controls for SOC2 compliance.',
    author: 'Security Review Board',
    space: 'Security',
    url: 'https://notion.so/workspace/soc2-compliance-architecture',
    tags: ['compliance', 'security', 'aws', 'encryption'],
    aiIntelligence: {
      aiSummary: 'Core security architecture specification outlining AWS KMS and AES-256 tenant encryption controls.',
      decisions: [
        'Adopt AWS KMS as the primary key management service.',
        'Enforce AES-256-GCM envelope encryption on all User and Org tables.'
      ],
      actionItems: [
        'David O. to write Postgres rollback scripts (PROJ-824).',
        'Sarah Chen to coordinate third-party SOC2 compliance auditor scope.'
      ],
      risks: [
        'AWS KMS decryption rate-limits under high peak request loads could degrade latency.'
      ],
      owners: ['Security Review Board', 'James K. (CTO)'],
      relatedMeetings: ['Security Architecture Review', 'SSO Alignment Call'],
      relatedEmails: ['FWD: SOC2 Pre-Audit Readiness checklist', 'KMS Decryption limits approval'],
      relatedJiraIssues: ['PROJ-824: Prepare Postgres Rollback Scripts'],
      relatedGitHubPRs: ['PR #402: Add KMS encryption client'],
      suggestedFollowUp: 'Verify KMS API quota limit and alerting configurations for the production region.'
    },
    updatedAt: '2026-06-25T14:30:00Z',
    metadata: { wordCount: 420, public: false }
  },
  {
    id: 'doc-2',
    title: 'Enterprise Pricing Tier Strategy',
    content: 'To align product value with user growth, we are migrating from a per-seat pricing matrix to a hybrid flat-rate workspace tiered model. The individual flat rate is set at $19/mo, offering basic agent lookups and vector storage. The enterprise tier is calculated at $49/user/mo, including SSO, governance controls, and customized policy definitions. Top 20 accounts will transition in Q4.',
    excerpt: 'Detailed corporate pricing realignment strategy migrating from per-seat billing to workspace flat-rate structures.',
    author: 'Sales Leadership',
    space: 'Product & Finance',
    url: 'https://notion.so/workspace/enterprise-pricing-strategy',
    tags: ['pricing', 'revenue', 'growth', 'strategy'],
    aiIntelligence: {
      aiSummary: 'Corporate commercial strategy detailing Flat and Per-User pricing guidelines to minimize onboarding friction.',
      decisions: [
        'Transition pricing from per-seat billing to a flat workspace tier.',
        'Individual tier priced at $19/mo, Team/Enterprise set at $49/user/mo.'
      ],
      actionItems: [
        'Finance team to review Stripe webhook triggers for workspace registration.',
        'Sarah Chen to publish updated pricing matrix to the public website.'
      ],
      risks: [
        'Potential short-term revenue churn during the initial migration window for legacy accounts.'
      ],
      owners: ['Sales Leadership', 'CFO Office'],
      relatedMeetings: ['Q3 Pricing Alignment', 'Stripe Integration Walkthrough'],
      relatedEmails: ['Pricing revisions feedback', 'Stripe checkout webhooks update'],
      relatedJiraIssues: ['FLOW-103: Implement Workspace Admin Panel'],
      relatedGitHubPRs: ['PR #512: Create pricing billing-tiers router'],
      suggestedFollowUp: 'Run financial model simulations for the top 20 enterprise accounts to estimate transition churn.'
    },
    updatedAt: '2026-06-27T09:15:00Z',
    metadata: { wordCount: 380, public: true }
  },
  {
    id: 'doc-3',
    title: 'OAuth SSO Security Design',
    content: 'This technical document details the integration protocols for Google SSO, Microsoft Entra ID, and Okta within the multi-tenant architecture. All auth tokens are issued with a 12-hour expiration window. Device trust headers are required on all administrator login actions. CORS domains are restricted to flow-os.local subdomains.',
    excerpt: 'Technical design document specifying Google SSO, Microsoft Entra, and Okta multi-tenant authentication and token policies.',
    author: 'James K. (CTO)',
    space: 'Core Architecture',
    url: 'https://notion.so/workspace/oauth-sso-security-design',
    tags: ['auth', 'security', 'SSO', 'OAuth'],
    aiIntelligence: {
      aiSummary: 'Technical authentication spec defining token lifetimes, SSO brokers, and CORS domain access boundaries.',
      decisions: [
        'Adopt Google SSO as the default enterprise login broker.',
        'Restrict auth token lifetimes to a strict 12-hour window.'
      ],
      actionItems: [
        'Kishore Varma to fix login loop authentication bug (FLOW-102).',
        'Alex R. to store Okta client secrets securely in AWS Secrets Manager.'
      ],
      risks: [
        'Lack of automated monitoring for SAML certificate expiration.'
      ],
      owners: ['James K. (CTO)', 'Core Infra Team'],
      relatedMeetings: ['SSO Infrastructure Walkthrough', 'Architecture Sync'],
      relatedEmails: ['Okta integration token variables', 'OAuth Login loops troubleshooting'],
      relatedJiraIssues: ['FLOW-102: Fix auth login loop'],
      relatedGitHubPRs: ['PR #411: Add SAML Entra provider'],
      suggestedFollowUp: 'Establish automated email notifications and alerts for SAML certificate expiries.'
    },
    updatedAt: '2026-06-28T10:00:00Z',
    metadata: { wordCount: 510, public: false }
  }
];

class NotionAdapter extends BaseAdapter {
  constructor() {
    super({
      id: 'notion',
      name: 'Notion',
      capability: Capability.KNOWLEDGE,
      authStrategy: AuthStrategy.API_KEY,
      supportedActions: [
        ActionType.READ,
        ActionType.SEARCH,
        ActionType.CREATE,
        ActionType.UPDATE,
        ActionType.DELETE,
        ActionType.SYNC,
        ActionType.HEALTH
      ],
      version: '1.0.0'
    });

    // In-memory document storage for demo mode
    this.inMemoryDocs = [...MOCK_DOCUMENTS];
  }

  // ── Authentication ────────────────────────────────────────────────────────
  async authenticate(workspaceId, { apiKey } = {}) {
    if (!apiKey) throw new ValidationError('apiKey is required');
    storeApiKey(workspaceId, this.id, apiKey);
    return { authenticated: true };
  }

  async healthCheck(workspaceId) {
    const start = Date.now();
    const creds = getCredentials(workspaceId, this.id);
    
    if (!creds?.token) {
      return { status: 'HEALTHY', latencyMs: Date.now() - start, detail: 'Demo Mode Fallback Active' };
    }

    try {
      // Connect to real Notion API
      const res = await fetch('https://api.notion.com/v1/users/me', {
        headers: {
          'Authorization': `Bearer ${creds.token}`,
          'Notion-Version': '2022-06-28'
        }
      });

      if (!res.ok) {
        throw new Error(`Notion returned status: ${res.status}`);
      }

      const me = await res.json();
      return {
        status: 'HEALTHY',
        latencyMs: Date.now() - start,
        detail: `Connected as workspace workspaceName: "${me.workspace_name || 'Notion'}"`
      };
    } catch (err) {
      return { status: 'DEGRADED', detail: err.message };
    }
  }

  // ── Action Dispatcher ─────────────────────────────────────────────────────
  async execute(workspaceId, actionType, payload = {}) {
    switch (actionType) {
      case ActionType.READ:
        return this._read(workspaceId, payload);
      case ActionType.SEARCH:
        return this._search(workspaceId, payload.query || '', { limit: payload.limit });
      case ActionType.CREATE:
        return this._createDocument(workspaceId, payload);
      case ActionType.UPDATE:
        return this._updateDocument(workspaceId, payload.id, payload);
      case ActionType.DELETE:
        return this._deleteDocument(workspaceId, payload.id);
      case ActionType.SYNC:
        return this._sync(workspaceId, payload);
      default:
        throw new AppError(`NotionAdapter: unknown actionType "${actionType}"`, 400);
    }
  }

  // ── SearchOrchestrator Integration ────────────────────────────────────────
  async search(workspaceId, query, { limit = 10 } = {}) {
    const docs = this.inMemoryDocs.filter(d => 
      d.title.toLowerCase().includes(query.toLowerCase()) || 
      d.content.toLowerCase().includes(query.toLowerCase()) || 
      d.excerpt.toLowerCase().includes(query.toLowerCase())
    );

    return docs.slice(0, limit).map(d => createSearchResult({
      id: d.id,
      connector: this.id,
      capability: this.capability,
      type: 'knowledge_document',
      title: d.title,
      excerpt: d.excerpt,
      score: 0.85,
      timestamp: d.updatedAt,
      url: d.url,
      metadata: { author: d.author, space: d.space }
    }));
  }

  // ── Private REST & Mock Implementation Methods ────────────────────────────
  async _read(workspaceId, payload) {
    const { resourceType } = payload;
    const creds = getCredentials(workspaceId, this.id);

    if (creds?.token && resourceType === 'document' && payload.id) {
      // production Notion page fetch placeholder
      throw new AppError('Real Notion connection active but endpoint not fully implemented.', 501);
    }

    // --- Demo Fallback ---
    switch (resourceType) {
      case 'documents':
        return this.inMemoryDocs.map(createKnowledgeDocument);
      case 'document':
        const doc = this.inMemoryDocs.find(d => d.id === payload.id);
        if (!doc) throw new AppError(`Document not found: ${payload.id}`, 404);
        return createKnowledgeDocument(doc);
      default:
        throw new ValidationError(`Unknown resourceType: ${resourceType}`);
    }
  }

  async _createDocument(workspaceId, payload) {
    const { title, content, space, author, tags } = payload;
    if (!title) throw new ValidationError('title is required');

    const newDoc = {
      id: `doc-${Date.now()}`,
      title,
      content: content || '',
      excerpt: content ? content.slice(0, 100) + '...' : 'No content provided.',
      author: author || 'FLOW User',
      space: space || 'General',
      url: `https://notion.so/workspace/doc-${Date.now()}`,
      tags: tags || [],
      aiIntelligence: {
        aiSummary: 'Auto-generated strategic document drafted by FLOW.',
        decisions: ['Document created dynamically.'],
        actionItems: ['Review and refine page details.'],
        risks: [],
        owners: [author || 'FLOW User'],
        relatedMeetings: [],
        relatedEmails: [],
        relatedJiraIssues: [],
        relatedGitHubPRs: [],
        suggestedFollowUp: 'Draft project guidelines and link to parent sprint.'
      },
      updatedAt: new Date().toISOString(),
      metadata: { wordCount: content ? content.split(' ').length : 0, public: false }
    };

    this.inMemoryDocs.push(newDoc);

    // Sync to Knowledge Graph
    registerEntity(newDoc.id, EntityTypes.DOCUMENT, newDoc.title);
    if (newDoc.space) {
      registerEntity(newDoc.space, EntityTypes.DEPARTMENT, newDoc.space);
      linkEntities(newDoc.id, newDoc.space, 'BELONGS_TO');
    }
    if (newDoc.author) {
      registerEntity(newDoc.author, EntityTypes.USER, newDoc.author);
      linkEntities(newDoc.id, newDoc.author, 'AUTHORED_BY');
    }

    return createKnowledgeDocument(newDoc);
  }

  async _updateDocument(workspaceId, id, patch) {
    const idx = this.inMemoryDocs.findIndex(d => d.id === id);
    if (idx === -1) throw new AppError(`Document not found: ${id}`, 404);

    const updated = {
      ...this.inMemoryDocs[idx],
      ...patch,
      updatedAt: new Date().toISOString()
    };
    this.inMemoryDocs[idx] = updated;

    if (patch.title) {
      registerEntity(updated.id, EntityTypes.DOCUMENT, updated.title);
    }

    return createKnowledgeDocument(updated);
  }

  async _deleteDocument(workspaceId, id) {
    const idx = this.inMemoryDocs.findIndex(d => d.id === id);
    if (idx === -1) throw new AppError(`Document not found: ${id}`, 404);
    this.inMemoryDocs.splice(idx, 1);
    return { success: true };
  }

  async _sync(workspaceId, options = {}) { // eslint-disable-line no-unused-vars
    // Register all in-memory documents in Knowledge Graph
    for (const d of this.inMemoryDocs) {
      registerEntity(d.id, EntityTypes.DOCUMENT, d.title);
      
      if (d.space) {
        registerEntity(d.space, EntityTypes.DEPARTMENT, d.space);
        linkEntities(d.id, d.space, 'BELONGS_TO');
      }

      if (d.author) {
        registerEntity(d.author, EntityTypes.USER, d.author);
        linkEntities(d.id, d.author, 'AUTHORED_BY');
      }

      // Semantic Cross-Entity Graph Stitching (Sprint 5.8 Target)
      if (d.id === 'doc-1') {
        registerEntity('Kishore Varma', EntityTypes.USER, 'Kishore Varma');
        registerEntity('PROJ-824', EntityTypes.ISSUE, 'PROJ-824');
        linkEntities('doc-1', 'Kishore Varma', 'AUDITED_BY');
        linkEntities('doc-1', 'PROJ-824', 'CONTEXT_FOR');
      }
      if (d.id === 'doc-3') {
        registerEntity('FLOW-102', EntityTypes.ISSUE, 'FLOW-102');
        linkEntities('doc-3', 'FLOW-102', 'CONTEXT_FOR');
      }
    }

    return { synced: this.inMemoryDocs.length, errors: 0 };
  }
}

export default new NotionAdapter();
