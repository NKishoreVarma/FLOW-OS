/**
 * FLOW OS — Jira Connector Adapter
 *
 * Work Management Capability — first provider.
 * All returns use FLOW normalized types.
 */

import { BaseAdapter } from '../BaseAdapter.js';
import { Capability, ActionType, AuthStrategy } from '../capabilities.js';
import { createWorkItem, createSearchResult } from '../normalizedTypes.js';
import { getCredentials, storeApiKey } from '../authManager.js';
import { AppError, ValidationError } from '../../core/errors/index.js';
import { EntityTypes, registerEntity, linkEntities } from '../../services/knowledgeGraphService.js';

// --- Default Demo Data (Fallback when Jira credentials are not configured) ---
const MOCK_PROJECTS = [
  {
    id: 'proj-1',
    key: 'PROJ',
    name: 'PostgreSQL Migration',
    boards: [{ id: 101, name: 'Migration Kanban' }],
    components: ['Database', 'Vector Store', 'Ingestion'],
    labels: ['relational', 'migration', 'pgvector'],
    versions: ['v1.0.0-rc1', 'v1.0.0-rc2'],
  },
  {
    id: 'proj-2',
    key: 'FLOW',
    name: 'FLOW Interface Rewrite',
    boards: [{ id: 102, name: 'UI Development Scrum' }],
    components: ['Components', 'Sidebar', 'Dashboard'],
    labels: ['design-system', 'jsx', 'frontend'],
    versions: ['v2.1.0', 'v2.2.0'],
  }
];

const MOCK_SPRINTS = [
  {
    id: 21,
    name: 'Sprint 21',
    status: 'closed',
    startDate: '2026-06-06T09:00:00Z',
    endDate: '2026-06-20T17:00:00Z',
    velocity: 45,
    burndown: {
      plannedPoints: 45,
      completedPoints: 45,
      days: [45, 40, 38, 30, 25, 20, 15, 10, 5, 0]
    }
  },
  {
    id: 22,
    name: 'Sprint 22',
    status: 'active',
    startDate: '2026-06-20T09:00:00Z',
    endDate: '2026-07-04T17:00:00Z',
    velocity: null,
    burndown: {
      plannedPoints: 50,
      completedPoints: 28,
      days: [50, 48, 45, 42, 35, 28] // currently in progress
    }
  },
  {
    id: 23,
    name: 'Sprint 23',
    status: 'future',
    startDate: '2026-07-04T09:00:00Z',
    endDate: '2026-07-18T17:00:00Z',
    velocity: null,
    burndown: null
  }
];

const MOCK_ISSUES = [
  {
    id: 'issue-101',
    key: 'PROJ-824',
    title: 'Prepare Postgres Rollback Scripts',
    description: 'Create SQL scripts to downgrade DB state in case of cutover failure.',
    status: 'Blocked',
    priority: 'P0',
    assignee: 'David O.',
    reporter: 'CTO Office',
    projectKey: 'PROJ',
    projectName: 'PostgreSQL Migration',
    labels: ['relational', 'migration-critical'],
    components: ['Database'],
    versions: ['v1.0.0-rc2'],
    parent: null,
    children: [],
    links: ['PROJ-711'],
    sprintId: 22,
    sprintName: 'Sprint 22',
    aiIntelligence: {
      aiSummary: 'Critical blocker for Postgres dry run migration.',
      businessImpact: 'High risk of migration failure and extended downtime if cutover fails.',
      technicalImpact: 'Requires review of rollback script transaction lock limits.',
      riskScore: 88,
      priorityScore: 95,
      blockers: ['Missing IAM permissions for David O.'],
      dependencies: ['PROJ-711'],
      suggestedAssignee: 'David O.',
      suggestedNextAction: 'Approve AWS IAM console access policies immediately.'
    }
  },
  {
    id: 'issue-102',
    key: 'PROJ-711',
    title: 'Build Project Intelligence UI',
    description: 'Implement frontend dashboard widgets displaying sprint metrics, risks, and active tickets.',
    status: 'In Progress',
    priority: 'P2',
    assignee: 'Kishore Varma',
    reporter: 'Sarah Chen',
    projectKey: 'PROJ',
    projectName: 'PostgreSQL Migration',
    labels: ['frontend', 'UI'],
    components: ['Dashboard'],
    versions: ['v1.0.0-rc1'],
    parent: null,
    children: [],
    links: ['PROJ-824'],
    sprintId: 22,
    sprintName: 'Sprint 22',
    aiIntelligence: {
      aiSummary: 'Standard visual widget reporting panel.',
      businessImpact: 'Improves developer observability metrics visibility.',
      technicalImpact: 'Loads mock engineering payload data into standard templates.',
      riskScore: 20,
      priorityScore: 65,
      blockers: [],
      dependencies: [],
      suggestedAssignee: 'Kishore Varma',
      suggestedNextAction: 'Complete standard React components verification.'
    }
  },
  {
    id: 'issue-103',
    key: 'FLOW-102',
    title: 'Fix auth login loop',
    description: 'Resolve local auto-auth infinite refresh loop returning 403 Forbidden under certain setups.',
    status: 'Done',
    priority: 'P1',
    assignee: 'Sarah Chen',
    reporter: 'Kishore Varma',
    projectKey: 'FLOW',
    projectName: 'FLOW Interface Rewrite',
    labels: ['auth', 'bug'],
    components: ['Components'],
    versions: ['v2.1.0'],
    parent: null,
    children: [],
    links: [],
    sprintId: 22,
    sprintName: 'Sprint 22',
    aiIntelligence: {
      aiSummary: 'Critical login stabilization bugfix.',
      businessImpact: 'Prevents developers from getting locked out of the dashboard.',
      technicalImpact: 'Ensures correct routing paths bypass authentication check.',
      riskScore: 5,
      priorityScore: 85,
      blockers: [],
      dependencies: [],
      suggestedAssignee: 'Sarah Chen',
      suggestedNextAction: 'Verify CORS wildcard and cookies status.'
    }
  },
  {
    id: 'issue-104',
    key: 'FLOW-103',
    title: 'Implement Workspace Admin Panel',
    description: 'Build enterprise administration routes and views under /platform route.',
    status: 'Review',
    priority: 'P2',
    assignee: 'Kishore Varma',
    reporter: 'Sarah Chen',
    projectKey: 'FLOW',
    projectName: 'FLOW Interface Rewrite',
    labels: ['platform', 'feature'],
    components: ['Sidebar'],
    versions: ['v2.2.0'],
    parent: null,
    children: [],
    links: [],
    sprintId: 22,
    sprintName: 'Sprint 22',
    aiIntelligence: {
      aiSummary: 'Admin panel interface creation.',
      businessImpact: 'Gives compliance teams visual dashboard oversight.',
      technicalImpact: 'Leverages lazy loaded chunks inside the layout component.',
      riskScore: 35,
      priorityScore: 70,
      blockers: [],
      dependencies: [],
      suggestedAssignee: 'Kishore Varma',
      suggestedNextAction: 'Refactor ESLint unused imports.'
    }
  }
];

class JiraAdapter extends BaseAdapter {
  constructor() {
    super({
      id: 'jira',
      name: 'Jira',
      capability: Capability.WORK_MANAGEMENT,
      authStrategy: AuthStrategy.API_KEY,
      supportedActions: [
        ActionType.READ,
        ActionType.SEARCH,
        ActionType.CREATE,
        ActionType.UPDATE,
        ActionType.DELETE,
        ActionType.SYNC,
        ActionType.EXECUTE,
        ActionType.HEALTH
      ],
      version: '1.0.0'
    });

    // In-memory array to simulate DB changes during demo mode.
    this.inMemoryIssues = [...MOCK_ISSUES];
  }

  // ── Authentication ────────────────────────────────────────────────────────
  async authenticate(workspaceId, { token, email } = {}) {
    if (!token) throw new ValidationError('token is required');
    if (!email) throw new ValidationError('email is required');

    // Simulate validation
    storeApiKey(workspaceId, this.id, `${email}:${token}`, { email });
    return { authenticated: true, email };
  }

  async healthCheck(workspaceId) {
    const start = Date.now();
    const creds = getCredentials(workspaceId, this.id);
    
    if (!creds?.token) {
      // In Demo mode, we are always healthy
      return { status: 'HEALTHY', latencyMs: Date.now() - start, detail: 'Demo Mode Fallback Active' };
    }

    try {
      const [email, token] = creds.token.split(':');
      const url = `https://api.atlassian.com/ex/jira/myself`;
      
      const res = await fetch(url, {
        headers: {
          'Authorization': `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}`,
          'Accept': 'application/json'
        }
      });

      if (!res.ok) {
        throw new Error(`Jira returned status: ${res.status}`);
      }

      return {
        status: 'HEALTHY',
        latencyMs: Date.now() - start,
        detail: `Connected as ${email}`
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
        return this._createIssue(workspaceId, payload);
      case ActionType.UPDATE:
        return this._updateIssue(workspaceId, payload.id || payload.key, payload);
      case ActionType.DELETE:
        return this._deleteIssue(workspaceId, payload.id || payload.key);
      case ActionType.SYNC:
        return this._sync(workspaceId, payload);
      case ActionType.EXECUTE:
        if (payload.resourceType === 'workflow') {
          return this._transitionWorkflow(workspaceId, payload.key, payload.status);
        }
        if (payload.resourceType === 'link') {
          return this._linkIssues(workspaceId, payload.sourceKey, payload.targetKey);
        }
        throw new AppError(`JiraAdapter: execute action not supported for ${payload.resourceType}`, 400);
      default:
        throw new AppError(`JiraAdapter: unknown actionType "${actionType}"`, 400);
    }
  }

  // ── SearchOrchestrator Integration ────────────────────────────────────────
  async search(workspaceId, query, { limit = 10 } = {}) {
    const issues = this.inMemoryIssues.filter(iss => 
      iss.title.toLowerCase().includes(query.toLowerCase()) || 
      iss.description.toLowerCase().includes(query.toLowerCase()) || 
      iss.key.toLowerCase().includes(query.toLowerCase())
    );

    return issues.slice(0, limit).map(iss => createSearchResult({
      id: iss.id,
      connector: this.id,
      capability: this.capability,
      type: 'work_item',
      title: `${iss.key}: ${iss.title}`,
      excerpt: iss.description,
      score: 0.8,
      timestamp: iss.timestamp,
      url: null,
      metadata: { status: iss.status, assignee: iss.assignee }
    }));
  }

  // ── Private REST & Mock Implementation Methods ────────────────────────────
  async _read(workspaceId, payload) {
    const { resourceType } = payload;
    const creds = getCredentials(workspaceId, this.id);

    if (creds?.token) {
      // Direct REST calls to real Jira instance (scaffolded)
      const [email, token] = creds.token.split(':');
      const authHeader = `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}`;
      
      // If client requests specific issue
      if (resourceType === 'issue' && payload.key) {
        return this._fetchJiraIssue(payload.key, authHeader);
      }
      // If client requests projects
      if (resourceType === 'projects') {
        return this._fetchJiraProjects(authHeader);
      }
    }

    // --- Demo Fallback ---
    switch (resourceType) {
      case 'projects':
        return MOCK_PROJECTS;
      case 'project':
        return MOCK_PROJECTS.find(p => p.key === payload.key) || MOCK_PROJECTS[0];
      case 'issues':
        if (payload.projectKey) {
          return this.inMemoryIssues.filter(i => i.projectKey === payload.projectKey).map(createWorkItem);
        }
        return this.inMemoryIssues.map(createWorkItem);
      case 'issue':
        const issue = this.inMemoryIssues.find(i => i.key === payload.key || i.id === payload.id);
        if (!issue) throw new AppError(`Issue not found: ${payload.key || payload.id}`, 404);
        return createWorkItem(issue);
      case 'sprints':
        return MOCK_SPRINTS;
      default:
        throw new ValidationError(`Unknown resourceType: ${resourceType}`);
    }
  }

  async _createIssue(workspaceId, payload) {
    const { projectKey, title, description, status, priority, assignee, parent } = payload;
    if (!projectKey) throw new ValidationError('projectKey is required');
    if (!title) throw new ValidationError('title is required');

    const key = `${projectKey}-${Math.floor(100 + Math.random() * 900)}`;
    const newIssue = {
      id: `issue-${Date.now()}`,
      key,
      title,
      description: description || '',
      status: status || 'To Do',
      priority: priority || 'P2',
      assignee: assignee || null,
      reporter: 'FLOW Agent',
      projectKey,
      projectName: MOCK_PROJECTS.find(p => p.key === projectKey)?.name || 'Default Project',
      labels: [],
      components: [],
      versions: [],
      parent: parent || null,
      children: [],
      links: [],
      sprintId: 22,
      sprintName: 'Sprint 22',
      aiIntelligence: {
        aiSummary: 'Auto-generated work ticket created by FLOW.',
        businessImpact: 'Under evaluation.',
        technicalImpact: 'Requires implementation of defined spec.',
        riskScore: 10,
        priorityScore: 50,
        blockers: [],
        dependencies: [],
        suggestedAssignee: assignee || 'Kishore Varma',
        suggestedNextAction: 'Review requirement parameters and assign task.'
      },
      timestamp: new Date().toISOString()
    };

    this.inMemoryIssues.push(newIssue);

    // Sync Node to Knowledge Graph
    registerEntity(key, EntityTypes.ISSUE, key);
    registerEntity(newIssue.projectName, EntityTypes.PROJECT, newIssue.projectName);
    linkEntities(key, newIssue.projectName, 'BELONGS_TO');
    if (newIssue.assignee) {
      registerEntity(newIssue.assignee, EntityTypes.USER, newIssue.assignee);
      linkEntities(key, newIssue.assignee, 'ASSIGNED_TO');
    }

    return createWorkItem(newIssue);
  }

  async _updateIssue(workspaceId, key, patch) {
    const idx = this.inMemoryIssues.findIndex(i => i.key === key || i.id === key);
    if (idx === -1) throw new AppError(`Issue not found: ${key}`, 404);

    const updated = {
      ...this.inMemoryIssues[idx],
      ...patch,
      timestamp: new Date().toISOString()
    };
    this.inMemoryIssues[idx] = updated;

    if (patch.assignee) {
      registerEntity(patch.assignee, EntityTypes.USER, patch.assignee);
      linkEntities(updated.key, patch.assignee, 'ASSIGNED_TO');
    }

    return createWorkItem(updated);
  }

  async _deleteIssue(workspaceId, key) {
    const idx = this.inMemoryIssues.findIndex(i => i.key === key || i.id === key);
    if (idx === -1) throw new AppError(`Issue not found: ${key}`, 404);
    this.inMemoryIssues.splice(idx, 1);
    return { success: true };
  }

  async _transitionWorkflow(workspaceId, key, status) {
    const idx = this.inMemoryIssues.findIndex(i => i.key === key || i.id === key);
    if (idx === -1) throw new AppError(`Issue not found: ${key}`, 404);

    this.inMemoryIssues[idx].status = status;
    return createWorkItem(this.inMemoryIssues[idx]);
  }

  async _linkIssues(workspaceId, sourceKey, targetKey) {
    const src = this.inMemoryIssues.find(i => i.key === sourceKey);
    const dst = this.inMemoryIssues.find(i => i.key === targetKey);
    if (!src || !dst) throw new AppError('One or both issues not found', 404);

    if (!src.links.includes(targetKey)) src.links.push(targetKey);
    if (!dst.links.includes(sourceKey)) dst.links.push(sourceKey);

    // Sync Knowledge Graph directed links
    registerEntity(sourceKey, EntityTypes.ISSUE, sourceKey);
    registerEntity(targetKey, EntityTypes.ISSUE, targetKey);
    linkEntities(sourceKey, targetKey, 'BLOCKS');

    return { success: true };
  }

  async _sync(workspaceId, options = {}) { // eslint-disable-line no-unused-vars
    // Register all in-memory issues/projects to Knowledge Graph
    for (const iss of this.inMemoryIssues) {
      registerEntity(iss.key, EntityTypes.ISSUE, iss.key);
      registerEntity(iss.projectName, EntityTypes.PROJECT, iss.projectName);
      linkEntities(iss.key, iss.projectName, 'BELONGS_TO');

      if (iss.assignee) {
        registerEntity(iss.assignee, EntityTypes.USER, iss.assignee);
        linkEntities(iss.key, iss.assignee, 'ASSIGNED_TO');
      }

      // Link to mock Repository/PR if references present
      if (iss.key === 'PROJ-824') {
        registerEntity('PostgreSQL Migration', EntityTypes.PROJECT, 'PostgreSQL Migration');
        registerEntity('Kishore Varma', EntityTypes.USER, 'Kishore Varma');
        linkEntities('PROJ-824', 'Kishore Varma', 'CREATED_BY');
      }
    }

    return { synced: this.inMemoryIssues.length, errors: 0 };
  }

  // --- Scaffolded real API integrations ---
  async _fetchJiraIssue(key, authHeader) {
    // In production, this calls GET https://your-domain.atlassian.net/rest/api/3/issue/{key}
    throw new AppError('Real Jira connection active but endpoint not fully implemented.', 501);
  }

  async _fetchJiraProjects(authHeader) {
    // In production, this calls GET https://your-domain.atlassian.net/rest/api/3/project
    throw new AppError('Real Jira connection active but endpoint not fully implemented.', 501);
  }
}

export default new JiraAdapter();
