/**
 * FLOW OS — HubSpot Connector Adapter
 *
 * Customer Intelligence Capability (CRM) — first provider.
 * All returns use FLOW CRM normalized types.
 */

import { BaseAdapter } from '../BaseAdapter.js';
import { Capability, ActionType, AuthStrategy } from '../capabilities.js';
import { createCrmAccount, createCrmContact, createCrmOpportunity, createCrmActivity, createSearchResult } from '../normalizedTypes.js';
import { getCredentials, storeApiKey } from '../authManager.js';
import { AppError, ValidationError } from '../../core/errors/index.js';
import { EntityTypes, registerEntity, linkEntities } from '../../services/knowledgeGraphService.js';

// --- Default Demo Data (Fallback when HubSpot credentials are not configured) ---
const MOCK_ACCOUNTS = [
  {
    id: 'acc-1',
    name: 'Acme Corp',
    domain: 'acme.com',
    industry: 'Software & Technology',
    annualRevenue: 1200000,
    stage: 'Customer',
    owner: 'Sarah Chen',
    healthScore: 45, // Critical Latency incident
    aiIntelligence: {
      healthScore: 45,
      churnRisk: 'HIGH',
      expansionOpportunity: 'MEDIUM',
      communicationSummary: 'Acme is highly dissatisfied due to a recent Sev-1 latency spike (500ms) on their core API endpoints. Slack communications indicate repeated escalations by their Director of Engineering John Jones.',
      outstandingCommitments: [
        'Eng Leads to provide PostgreSQL rollback dry-run timeline (PROJ-824).',
        'Sarah Chen to schedules a follow-up latency post-mortem review.'
      ],
      suggestedNextActions: 'Coordinate with James K. to deliver the latency remediation plan and dry-run checklist.'
    },
    updatedAt: '2026-06-28T10:00:00Z',
    metadata: { tier: 'Platinum', employeeCount: 1500 }
  },
  {
    id: 'acc-2',
    name: 'Globex Corp',
    domain: 'globex.com',
    industry: 'Cybersecurity',
    annualRevenue: 4500000,
    stage: 'Customer',
    owner: 'Kishore Varma',
    healthScore: 92,
    aiIntelligence: {
      healthScore: 92,
      churnRisk: 'LOW',
      expansionOpportunity: 'HIGH',
      communicationSummary: 'Excellent account health. Term sheet signed for Globex workspace expansion. Main contacts are highly engaged in SSO integration planning.',
      outstandingCommitments: [
        'Finance team to complete Stripe checkout webhook validation.',
        'Deliver finalized SSO multi-tenant security architecture spec.'
      ],
      suggestedNextActions: 'Send Stripe payment links for the expanded seat counts.'
    },
    updatedAt: '2026-06-27T15:30:00Z',
    metadata: { tier: 'Diamond', employeeCount: 8500 }
  },
  {
    id: 'acc-3',
    name: 'Initech',
    domain: 'initech.com',
    industry: 'Financial Services',
    annualRevenue: 450000,
    stage: 'Prospect',
    owner: 'Sarah Chen',
    healthScore: 70,
    aiIntelligence: {
      healthScore: 70,
      churnRisk: 'MEDIUM',
      expansionOpportunity: 'LOW',
      communicationSummary: 'Early stage prospect. Showing interest in Google SSO, MS Entra, and Okta integration policies. Technical team has highlighted concerns regarding login loop loops.',
      outstandingCommitments: [
        'Sarah Chen to deliver technical SSO security blueprint design.',
        'Eng team to resolve auth loop issue (FLOW-102).'
      ],
      suggestedNextActions: 'Schedule a joint call with Kishore Varma to walk Initech engineers through the login authentication architecture.'
    },
    updatedAt: '2026-06-28T09:00:00Z',
    metadata: { tier: 'Gold', employeeCount: 450 }
  }
];

const MOCK_CONTACTS = [
  {
    id: 'con-1',
    firstName: 'John',
    lastName: 'Jones',
    email: 'john@acme.com',
    phone: '+1-555-0192',
    accountId: 'acc-1',
    title: 'Director of Engineering',
    owner: 'Sarah Chen',
    lastContactedAt: '2026-06-26T14:00:00Z',
    updatedAt: '2026-06-28T10:00:00Z',
    metadata: { mainContact: true }
  },
  {
    id: 'con-2',
    firstName: 'Alice',
    lastName: 'Smith',
    email: 'alice@globex.com',
    phone: '+1-555-0341',
    accountId: 'acc-2',
    title: 'Chief Information Security Officer (CISO)',
    owner: 'Kishore Varma',
    lastContactedAt: '2026-06-27T11:00:00Z',
    updatedAt: '2026-06-27T15:30:00Z',
    metadata: { mainContact: true }
  },
  {
    id: 'con-3',
    firstName: 'Peter',
    lastName: 'Gibbons',
    email: 'peter@initech.com',
    phone: '+1-555-0452',
    accountId: 'acc-3',
    title: 'VP of Architecture',
    owner: 'Sarah Chen',
    lastContactedAt: '2026-06-28T08:00:00Z',
    updatedAt: '2026-06-28T09:00:00Z',
    metadata: { mainContact: true }
  }
];

const MOCK_OPPORTUNITIES = [
  {
    id: 'opp-1',
    name: 'Globex Enterprise Seat Expansion',
    accountId: 'acc-2',
    stage: 'Negotiation',
    amount: 140000,
    closeDate: '2026-07-15T17:00:00Z',
    probability: 90,
    owner: 'Kishore Varma',
    aiIntelligence: {
      riskLevel: 'LOW',
      risks: ['Stripe payment webhook verification pending.'],
      recommendation: 'Coordinate Stripe webhook setup immediately to finalize onboarding.'
    },
    updatedAt: '2026-06-27T15:30:00Z',
    metadata: { forecastCategory: 'Commit' }
  },
  {
    id: 'opp-2',
    name: 'Initech Core SSO Licensing',
    accountId: 'acc-3',
    stage: 'Proposal',
    amount: 50000,
    closeDate: '2026-08-01T17:00:00Z',
    probability: 60,
    owner: 'Sarah Chen',
    aiIntelligence: {
      riskLevel: 'MEDIUM',
      risks: ['Blocked by login loop authentication loop loop concerns.'],
      recommendation: 'Demonstrate login loop fix and provide SSO security blueprint spec.'
    },
    updatedAt: '2026-06-28T09:00:00Z',
    metadata: { forecastCategory: 'Best Case' }
  }
];

const MOCK_ACTIVITIES = [
  {
    id: 'act-1',
    type: 'meeting',
    subject: 'Emergency Latency Post-Mortem',
    description: 'Reviewed 500ms latency spike reported by Acme Corp. Promised rollback script review by Friday.',
    accountId: 'acc-1',
    contactId: 'con-1',
    owner: 'Sarah Chen',
    activityDate: '2026-06-26T15:00:00Z'
  },
  {
    id: 'act-2',
    type: 'email',
    subject: 'SSO Spec Walkthrough Follow-up',
    description: 'Shared Google SSO and Microsoft Entra design documentation. Scheduled call for Tuesday.',
    accountId: 'acc-3',
    contactId: 'con-3',
    owner: 'Sarah Chen',
    activityDate: '2026-06-28T08:30:00Z'
  },
  {
    id: 'act-3',
    type: 'note',
    subject: 'Globex Contract Signed Notes',
    description: 'Closed expansion deal at $140k ARR. Staged setup in stripe dev account.',
    accountId: 'acc-2',
    contactId: 'con-2',
    owner: 'Kishore Varma',
    activityDate: '2026-06-27T14:00:00Z'
  }
];

class HubSpotAdapter extends BaseAdapter {
  constructor() {
    super({
      id: 'hubspot',
      name: 'HubSpot',
      capability: Capability.CRM,
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

    // PREVIEW adapter — in-memory, not the real HubSpot API. The Execution Engine
    // refuses side-effectful writes on simulated connectors so FLOW never reports a
    // fabricated success. Remove when a live HubSpot integration is wired.
    this.simulated = true;

    this.inMemoryAccounts = [...MOCK_ACCOUNTS];
    this.inMemoryContacts = [...MOCK_CONTACTS];
    this.inMemoryOpps = [...MOCK_OPPORTUNITIES];
    this.inMemoryActivities = [...MOCK_ACTIVITIES];
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
      const res = await fetch('https://api.hubapi.com/crm/v3/objects/companies?limit=1', {
        headers: {
          'Authorization': `Bearer ${creds.token}`,
          'Accept': 'application/json'
        }
      });

      if (!res.ok) {
        throw new Error(`HubSpot returned status: ${res.status}`);
      }

      return {
        status: 'HEALTHY',
        latencyMs: Date.now() - start,
        detail: 'Connected to HubSpot API'
      };
    } catch (err) {
      return { status: 'DEGRADED', detail: err.message };
    }
  }

  // ── Execution Dispatch ────────────────────────────────────────────────────
  async execute(workspaceId, actionType, payload = {}) {
    switch (actionType) {
      case ActionType.READ:
        return this._read(workspaceId, payload);
      case ActionType.SEARCH:
        return this._search(workspaceId, payload.query || '', { limit: payload.limit });
      case ActionType.CREATE:
        return this._createAccount(workspaceId, payload);
      case ActionType.UPDATE:
        return this._updateAccount(workspaceId, payload.id, payload);
      case ActionType.DELETE:
        return this._deleteAccount(workspaceId, payload.id);
      case ActionType.SYNC:
        return this._sync(workspaceId, payload);
      default:
        throw new AppError(`HubSpotAdapter: unknown actionType "${actionType}"`, 400);
    }
  }

  // ── SearchOrchestrator Integration ────────────────────────────────────────
  async search(workspaceId, query, { limit = 10 } = {}) {
    const accs = this.inMemoryAccounts.filter(a => 
      a.name.toLowerCase().includes(query.toLowerCase()) || 
      a.domain.toLowerCase().includes(query.toLowerCase()) || 
      a.industry.toLowerCase().includes(query.toLowerCase())
    );

    return accs.slice(0, limit).map(a => createSearchResult({
      id: a.id,
      connector: this.id,
      capability: this.capability,
      type: 'crm_account',
      title: a.name,
      excerpt: `${a.industry} · Revenue: $${a.annualRevenue?.toLocaleString()}`,
      score: 0.88,
      timestamp: a.updatedAt,
      url: `https://app.hubspot.com/contacts/companies/${a.id}`,
      metadata: { stage: a.stage, healthScore: a.healthScore }
    }));
  }

  // ── Private REST & Mock Implementation Methods ────────────────────────────
  async _read(workspaceId, payload) {
    const { resourceType } = payload;
    const creds = getCredentials(workspaceId, this.id);

    if (creds?.token) {
      // Production REST API fetch placeholders
      throw new AppError('Real HubSpot connection active but endpoint not fully implemented.', 501);
    }

    // --- Demo Fallback ---
    switch (resourceType) {
      case 'accounts':
        return this.inMemoryAccounts.map(createCrmAccount);
      case 'account':
        const acc = this.inMemoryAccounts.find(a => a.id === payload.id);
        if (!acc) throw new AppError(`Account not found: ${payload.id}`, 404);
        
        // Enrich with related arrays
        const contacts = this.inMemoryContacts.filter(c => c.accountId === acc.id).map(createCrmContact);
        const opportunities = this.inMemoryOpps.filter(o => o.accountId === acc.id).map(createCrmOpportunity);
        const activities = this.inMemoryActivities.filter(a => a.accountId === acc.id).map(createCrmActivity);
        
        return {
          ...createCrmAccount(acc),
          contacts,
          opportunities,
          activities
        };
      case 'contacts':
        return this.inMemoryContacts.map(createCrmContact);
      case 'opportunities':
        return this.inMemoryOpps.map(createCrmOpportunity);
      case 'activities':
        return this.inMemoryActivities.map(createCrmActivity);
      default:
        throw new ValidationError(`Unknown resourceType: ${resourceType}`);
    }
  }

  async _createAccount(workspaceId, payload) {
    const { name, domain, industry, annualRevenue, stage, owner } = payload;
    if (!name) throw new ValidationError('name is required');

    const newAcc = {
      id: `acc-${Date.now()}`,
      name,
      domain: domain || '',
      industry: industry || '',
      annualRevenue: annualRevenue || null,
      stage: stage || 'Prospect',
      owner: owner || 'Sarah Chen',
      healthScore: 100,
      aiIntelligence: {
        healthScore: 100,
        churnRisk: 'LOW',
        expansionOpportunity: 'LOW',
        communicationSummary: 'Account created dynamically.',
        outstandingCommitments: [],
        suggestedNextActions: 'Establish core contact mapping.'
      },
      updatedAt: new Date().toISOString(),
      metadata: {}
    };

    this.inMemoryAccounts.push(newAcc);

    // Sync Knowledge Graph
    registerEntity(newAcc.id, EntityTypes.CUSTOMER, newAcc.name);

    return createCrmAccount(newAcc);
  }

  async _updateAccount(workspaceId, id, patch) {
    const idx = this.inMemoryAccounts.findIndex(a => a.id === id);
    if (idx === -1) throw new AppError(`Account not found: ${id}`, 404);

    const updated = {
      ...this.inMemoryAccounts[idx],
      ...patch,
      updatedAt: new Date().toISOString()
    };
    this.inMemoryAccounts[idx] = updated;

    registerEntity(updated.id, EntityTypes.CUSTOMER, updated.name);

    return createCrmAccount(updated);
  }

  async _deleteAccount(workspaceId, id) {
    const idx = this.inMemoryAccounts.findIndex(a => a.id === id);
    if (idx === -1) throw new AppError(`Account not found: ${id}`, 404);
    this.inMemoryAccounts.splice(idx, 1);
    return { success: true };
  }

  async _sync(workspaceId, options = {}) { // eslint-disable-line no-unused-vars
    // Register all in-memory accounts/deals/contacts in Knowledge Graph
    for (const a of this.inMemoryAccounts) {
      registerEntity(a.id, EntityTypes.CUSTOMER, a.name);

      if (a.owner) {
        registerEntity(a.owner, EntityTypes.USER, a.owner);
        linkEntities(a.id, a.owner, 'OWNED_BY');
      }

      // Semantic Cross-platform Graph Stitching (Sprint 5.9 Target)
      if (a.id === 'acc-1') {
        registerEntity('INC-A3F2 Outage', EntityTypes.INCIDENT, 'INC-A3F2 Outage');
        registerEntity('PROJ-824', EntityTypes.ISSUE, 'PROJ-824');
        linkEntities('acc-1', 'INC-A3F2 Outage', 'AFFECTED_BY');
        linkEntities('acc-1', 'PROJ-824', 'WAITING_ON');
      }
      if (a.id === 'acc-2') {
        registerEntity('Globex terms signed', EntityTypes.DECISION, 'Globex terms signed');
        linkEntities('acc-2', 'Globex terms signed', 'DECIDED_BY');
      }
      if (a.id === 'acc-3') {
        registerEntity('FLOW-102', EntityTypes.ISSUE, 'FLOW-102');
        linkEntities('acc-3', 'FLOW-102', 'WAITING_ON');
      }
    }

    for (const c of this.inMemoryContacts) {
      registerEntity(c.email, EntityTypes.USER, `${c.firstName} ${c.lastName}`);
      linkEntities(c.email, c.accountId, 'WORKS_AT');
    }

    for (const o of this.inMemoryOpps) {
      registerEntity(o.id, EntityTypes.OPPORTUNITY, o.name);
      linkEntities(o.id, o.accountId, 'BELONGS_TO');

      if (o.owner) {
        registerEntity(o.owner, EntityTypes.USER, o.owner);
        linkEntities(o.id, o.owner, 'OWNED_BY');
      }
    }

    return { 
      syncedAccounts: this.inMemoryAccounts.length, 
      syncedContacts: this.inMemoryContacts.length, 
      syncedOpps: this.inMemoryOpps.length,
      errors: 0 
    };
  }
}

export default new HubSpotAdapter();
