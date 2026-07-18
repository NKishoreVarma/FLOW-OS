/**
 * FLOW OS — Workday Connector Adapter
 *
 * Workforce Intelligence Capability (HR) — first provider.
 * All returns use FLOW HR normalized types.
 */

import { BaseAdapter } from '../BaseAdapter.js';
import { Capability, ActionType, AuthStrategy } from '../capabilities.js';
import { createHrEmployee, createHrTeam, createHrSkill, createHrAvailability, createSearchResult } from '../normalizedTypes.js';
import { getCredentials, storeApiKey } from '../authManager.js';
import { AppError, ValidationError } from '../../core/errors/index.js';
import { EntityTypes, registerEntity, linkEntities } from '../../services/knowledgeGraphService.js';

// --- Default Demo Data (Fallback when Workday credentials are not configured) ---
const MOCK_EMPLOYEES = [
  {
    id: 'emp-1',
    name: 'James K.',
    email: 'james@flow.os',
    role: 'Chief Technology Officer (CTO)',
    department: 'Engineering & Product',
    status: 'Active',
    managerId: null,
    skills: ['Architecture Strategy', 'Team Scaling', 'Budgeting', 'Executive Leadership'],
    timezone: 'US/Pacific',
    availability: { status: 'Available', timeoff: [] },
    workload: {
      activeProjects: ['FLOW Rewrite', 'Postgres Migration'],
      jiraTasksCount: 0,
      meetingLoadHrs: 18,
      contextSwitchScore: 35
    },
    aiIntelligence: {
      burnoutRisk: 'LOW',
      contextSwitchScore: 35,
      collaborationScore: 78,
      reviewBottlenecks: 'None',
      knowledgeConcentrationRisk: 'HIGH (only node that understands system cost scaling models)',
      suggestedDelegates: ['Kishore Varma (Lead Eng)'],
      suggestedReviewers: [],
      recommendedMeetings: ['Weekly Board Sync', 'Q3 Architecture Alignment']
    },
    updatedAt: '2026-06-28T10:00:00Z',
    metadata: { tenureYears: 4 }
  },
  {
    id: 'emp-2',
    name: 'Kishore Varma',
    email: 'kishore@flow.os',
    role: 'Lead Engineering Architect',
    department: 'Engineering',
    status: 'Active',
    managerId: 'emp-1',
    skills: ['React', 'NodeJS', 'PostgreSQL', 'pgvector', 'RAG pipelines', 'BullMQ'],
    timezone: 'Asia/Kolkata',
    availability: { status: 'Available', timeoff: [] },
    workload: {
      activeProjects: ['FLOW Rewrite', 'Postgres Migration'],
      jiraTasksCount: 2,
      meetingLoadHrs: 8,
      contextSwitchScore: 85
    },
    aiIntelligence: {
      burnoutRisk: 'LOW',
      contextSwitchScore: 85,
      collaborationScore: 94,
      reviewBottlenecks: 'Medium (waiting on 3 pricing tier PR approvals)',
      knowledgeConcentrationRisk: 'MEDIUM (primary owner of pgvector search orchestrator)',
      suggestedDelegates: ['Alex R. (Infra Eng)'],
      suggestedReviewers: ['Alex R. (Redis details)', 'David O. (IAM security roles)'],
      recommendedMeetings: ['Postgres Migration Standup']
    },
    updatedAt: '2026-06-28T11:00:00Z',
    metadata: { tenureYears: 2 }
  },
  {
    id: 'emp-3',
    name: 'Sarah Chen',
    email: 'sarah@flow.os',
    role: 'Principal Product Manager',
    department: 'Product',
    status: 'Active',
    managerId: 'emp-1',
    skills: ['Product Strategy', 'Agile Roadmapping', 'Stripe Checkout', 'Customer Discovery'],
    timezone: 'US/Pacific',
    availability: { status: 'Available', timeoff: [] },
    workload: {
      activeProjects: ['FLOW Rewrite', 'Enterprise Pricing'],
      jiraTasksCount: 4,
      meetingLoadHrs: 24, // VERY HIGH meeting load
      contextSwitchScore: 95  // Severe context switching
    },
    aiIntelligence: {
      burnoutRisk: 'HIGH',
      contextSwitchScore: 95,
      collaborationScore: 82,
      reviewBottlenecks: 'HIGH (stuck in meetings, causing decision block on 4 linear/jira roadmap items)',
      knowledgeConcentrationRisk: 'HIGH (sole owner of Stripe onboarding flows)',
      suggestedDelegates: ['Kishore Varma (Technical product specs)'],
      suggestedReviewers: [],
      recommendedMeetings: ['Stripe billing review (reduce meetings by 4 hrs)']
    },
    updatedAt: '2026-06-28T09:30:00Z',
    metadata: { tenureYears: 3 }
  },
  {
    id: 'emp-4',
    name: 'David O.',
    email: 'david@flow.os',
    role: 'Senior Infrastructure Security Engineer',
    department: 'Security',
    status: 'Active',
    managerId: 'emp-1',
    skills: ['AWS KMS', 'IAM Policies', 'SOC2 Compliance', 'PenTesting', 'Postgres Security'],
    timezone: 'Europe/London',
    availability: { status: 'Available', timeoff: [] },
    workload: {
      activeProjects: ['Postgres Migration'],
      jiraTasksCount: 1,
      meetingLoadHrs: 6,
      contextSwitchScore: 40
    },
    aiIntelligence: {
      burnoutRisk: 'LOW',
      contextSwitchScore: 40,
      collaborationScore: 88,
      reviewBottlenecks: 'None',
      knowledgeConcentrationRisk: 'CRITICAL (only security engineer certified to rotation KMS secrets)',
      suggestedDelegates: ['Alex R.'],
      suggestedReviewers: ['Kishore Varma'],
      recommendedMeetings: ['KMS Security Architecture Review']
    },
    updatedAt: '2026-06-28T08:00:00Z',
    metadata: { tenureYears: 1.5 }
  },
  {
    id: 'emp-5',
    name: 'Alex R.',
    email: 'alex@flow.os',
    role: 'Senior Platform Engineer',
    department: 'Engineering',
    status: 'Active',
    managerId: 'emp-1',
    skills: ['Redis Cluster', 'BullMQ', 'Docker', 'AWS ECS', 'Kubernetes'],
    timezone: 'Europe/Paris',
    availability: { status: 'On Leave (PTO)', timeoff: [{ type: 'PTO', start: '2026-06-29', end: '2026-07-03' }] },
    workload: {
      activeProjects: ['Redis Migration'],
      jiraTasksCount: 1,
      meetingLoadHrs: 12,
      contextSwitchScore: 60
    },
    aiIntelligence: {
      burnoutRisk: 'LOW',
      contextSwitchScore: 60,
      collaborationScore: 90,
      reviewBottlenecks: 'None',
      knowledgeConcentrationRisk: 'HIGH (owns BullMQ worker scheduler scaling configurations)',
      suggestedDelegates: ['Kishore Varma'],
      suggestedReviewers: ['Kishore Varma'],
      recommendedMeetings: ['Weekly platform standup']
    },
    updatedAt: '2026-06-27T17:00:00Z',
    metadata: { tenureYears: 1 }
  }
];

const MOCK_TEAMS = [
  { id: 'team-1', name: 'Core Platform Engineering', department: 'Engineering', leadId: 'emp-2', memberIds: ['emp-2', 'emp-5'] },
  { id: 'team-2', name: 'Enterprise Billing & PM', department: 'Product', leadId: 'emp-3', memberIds: ['emp-3', 'emp-2'] }
];

const MOCK_SKILLS = [
  { id: 'skill-1', name: 'React', category: 'Frontend', expertIds: ['emp-2'] },
  { id: 'skill-2', name: 'PostgreSQL & pgvector', category: 'Database', expertIds: ['emp-2'] },
  { id: 'skill-3', name: 'AWS KMS', category: 'Security', expertIds: ['emp-4'] },
  { id: 'skill-4', name: 'Redis Cluster', category: 'DevOps', expertIds: ['emp-5'] },
  { id: 'skill-5', name: 'Stripe Integration', category: 'Domain', expertIds: ['emp-3'] }
];

const MOCK_AVAILABILITY = [
  { id: 'avail-1', employeeId: 'emp-5', type: 'PTO', startDate: '2026-06-29', endDate: '2026-07-03', status: 'Approved' }
];

class WorkdayAdapter extends BaseAdapter {
  constructor() {
    super({
      id: 'workday',
      name: 'Workday',
      capability: Capability.HR,
      authStrategy: AuthStrategy.API_KEY,
      supportedActions: [
        ActionType.READ,
        ActionType.SEARCH,
        ActionType.CREATE,
        ActionType.UPDATE,
        ActionType.SYNC,
        ActionType.HEALTH
      ],
      version: '1.0.0'
    });

    this.inMemoryEmployees = [...MOCK_EMPLOYEES];
    this.inMemoryTeams = [...MOCK_TEAMS];
    this.inMemorySkills = [...MOCK_SKILLS];
    this.inMemoryAvailabilities = [...MOCK_AVAILABILITY];
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
      return { status: 'HEALTHY', latencyMs: Date.now() - start, detail: 'Demo Mode Fallback Active (Workday)' };
    }

    try {
      const res = await fetch('https://api.workday.com/v1/workers?limit=1', {
        headers: {
          'Authorization': `Bearer ${creds.token}`,
          'Accept': 'application/json'
        }
      });

      if (!res.ok) {
        throw new Error(`Workday returned status: ${res.status}`);
      }

      return {
        status: 'HEALTHY',
        latencyMs: Date.now() - start,
        detail: 'Connected to Workday REST endpoint'
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
        return this._createEmployee(workspaceId, payload);
      case ActionType.UPDATE:
        return this._updateEmployee(workspaceId, payload.id, payload);
      case ActionType.SYNC:
        return this._sync(workspaceId, payload);
      default:
        throw new AppError(`WorkdayAdapter: unknown actionType "${actionType}"`, 400);
    }
  }

  // ── SearchOrchestrator Integration ────────────────────────────────────────
  async search(workspaceId, query, { limit = 10 } = {}) {
    const emps = this.inMemoryEmployees.filter(e => 
      e.name.toLowerCase().includes(query.toLowerCase()) || 
      e.role.toLowerCase().includes(query.toLowerCase()) || 
      e.department.toLowerCase().includes(query.toLowerCase())
    );

    return emps.slice(0, limit).map(e => createSearchResult({
      id: e.id,
      connector: this.id,
      capability: this.capability,
      type: 'employee',
      title: e.name,
      excerpt: `${e.role} · Department: ${e.department}`,
      score: 0.95,
      timestamp: e.updatedAt,
      url: `https://workday.flow.os/workers/${e.id}`,
      metadata: { department: e.department, status: e.status }
    }));
  }

  // ── Private REST & Mock Implementation Methods ────────────────────────────
  async _read(workspaceId, payload) {
    const { resourceType } = payload;
    const creds = getCredentials(workspaceId, this.id);

    if (creds?.token) {
      throw new AppError('Real Workday connection active but endpoint not fully implemented.', 501);
    }

    // --- Demo Fallback ---
    switch (resourceType) {
      case 'employees':
        return this.inMemoryEmployees.map(createHrEmployee);
      case 'employee':
        const emp = this.inMemoryEmployees.find(e => e.id === payload.id);
        if (!emp) throw new AppError(`Employee not found: ${payload.id}`, 404);
        
        // Enrich with reports
        const directReports = this.inMemoryEmployees.filter(e => e.managerId === emp.id).map(createHrEmployee);
        const manager = this.inMemoryEmployees.find(e => e.id === emp.managerId);
        
        return {
          ...createHrEmployee(emp),
          directReports,
          manager: manager ? createHrEmployee(manager) : null
        };
      case 'teams':
        return this.inMemoryTeams.map(createHrTeam);
      case 'skills':
        return this.inMemorySkills.map(createHrSkill);
      case 'availability':
        return this.inMemoryAvailabilities.map(createHrAvailability);
      default:
        throw new ValidationError(`Unknown resourceType: ${resourceType}`);
    }
  }

  async _createEmployee(workspaceId, payload) {
    const { name, email, role, department, managerId } = payload;
    if (!name || !email) throw new ValidationError('name and email are required');

    const newEmp = {
      id: `emp-${Date.now()}`,
      name,
      email,
      role: role || 'Software Engineer',
      department: department || 'Engineering',
      status: 'Active',
      managerId: managerId || null,
      skills: [],
      timezone: 'UTC',
      availability: { status: 'Available', timeoff: [] },
      workload: { activeProjects: [], jiraTasksCount: 0, meetingLoadHrs: 0, contextSwitchScore: 0 },
      aiIntelligence: {
        burnoutRisk: 'LOW',
        contextSwitchScore: 0,
        collaborationScore: 50,
        reviewBottlenecks: 'None',
        knowledgeConcentrationRisk: 'LOW',
        suggestedDelegates: [],
        suggestedReviewers: [],
        recommendedMeetings: []
      },
      updatedAt: new Date().toISOString(),
      metadata: {}
    };

    this.inMemoryEmployees.push(newEmp);

    // Sync Knowledge Graph
    registerEntity(newEmp.email, EntityTypes.USER, newEmp.name);
    return createHrEmployee(newEmp);
  }

  async _updateEmployee(workspaceId, id, patch) {
    const idx = this.inMemoryEmployees.findIndex(e => e.id === id);
    if (idx === -1) throw new AppError(`Employee not found: ${id}`, 404);

    const updated = {
      ...this.inMemoryEmployees[idx],
      ...patch,
      updatedAt: new Date().toISOString()
    };
    this.inMemoryEmployees[idx] = updated;

    registerEntity(updated.email, EntityTypes.USER, updated.name);
    return createHrEmployee(updated);
  }

  async _sync(workspaceId, options = {}) { // eslint-disable-line no-unused-vars
    // Register employees and managers in Knowledge Graph
    for (const e of this.inMemoryEmployees) {
      registerEntity(e.email, EntityTypes.USER, e.name);

      if (e.managerId) {
        const mgr = this.inMemoryEmployees.find(m => m.id === e.managerId);
        if (mgr) {
          registerEntity(mgr.email, EntityTypes.USER, mgr.name);
          linkEntities(e.email, mgr.email, 'REPORTS_TO');
        }
      }

      // Link workspace departments
      registerEntity(e.department, EntityTypes.DEPARTMENT, e.department);
      linkEntities(e.email, e.department, 'WORKS_IN');

      // Sync active workloads & skills
      for (const proj of e.workload.activeProjects) {
        registerEntity(proj, EntityTypes.PROJECT, proj);
        linkEntities(e.email, proj, 'WORKS_ON');
      }

      for (const skill of e.skills) {
        registerEntity(skill, EntityTypes.SYSTEM, skill); // map skills to system nodes
        linkEntities(e.email, skill, 'OWNS');
      }

      // Cross-platform Graph Stitching (Phase 6.0 Target)
      if (e.id === 'emp-2') {
        registerEntity('PROJ-824', EntityTypes.ISSUE, 'PROJ-824');
        registerEntity('Weekly board review', EntityTypes.EVENT, 'Weekly board review');
        linkEntities('kishore@flow.os', 'PROJ-824', 'ASSIGNED_TO');
        linkEntities('kishore@flow.os', 'Weekly board review', 'ATTENDS');
      }
      if (e.id === 'emp-3') {
        registerEntity('Acme Corp', EntityTypes.CUSTOMER, 'Acme Corp');
        linkEntities('sarah@flow.os', 'Acme Corp', 'SUPPORTS');
      }
    }

    return { 
      syncedEmployees: this.inMemoryEmployees.length, 
      syncedTeams: this.inMemoryTeams.length, 
      syncedSkills: this.inMemorySkills.length,
      errors: 0 
    };
  }
}

export default new WorkdayAdapter();
