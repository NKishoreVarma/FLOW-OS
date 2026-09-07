/**
 * ingestedReads — workspace-aware fallback that serves a capability READ from the
 * workspace's ALREADY-INGESTED data (graph + events) when no live connector is
 * authenticated. This is NOT a mock and NOT dataset re-reading: it reads FLOW's real
 * stores (the same graph the Brain reasons over), and every record carries explicit
 * provenance so nothing pretends to be a live provider response.
 *
 * Used by the capability REST routes (engineering, communication, meetings) exactly
 * like the Brain's CapabilityDispatcher event-store fallback: live connector first,
 * ingested data second, honest empty last. The only difference is the data source.
 */

import { prisma } from '../../core/config/prisma.js';
import { CERTIFICATION_WORKSPACE } from '../../config/flowEnv.js';

const PROV = (workspaceId, provider) => ({
  _sourceMode: 'certification',
  _provider:   provider,
  _source:     'flow-synthetic-world',
  _workspaceId: workspaceId,
});

// The ingested fallback is for the CERTIFICATION world only. A development workspace
// with an expired/absent live connector must show the honest connection state — NOT
// silently serve stale ingested data (spec §4: "do not substitute … in development").
// This is the single gate that keeps the two worlds from mixing.
function ingestionAllowed(workspaceId) {
  return String(workspaceId) === CERTIFICATION_WORKSPACE;
}

/** Does this workspace hold ingested graph data for the given node types? */
export async function hasIngested(workspaceId, nodeTypes) {
  if (!ingestionAllowed(workspaceId)) return false;
  const n = await prisma.graphNode.count({ where: { workspaceId: String(workspaceId), type: { in: nodeTypes } } }).catch(() => 0);
  return n > 0;
}

// ── Engineering: repositories from SYSTEM nodes, enriched with commit/PR counts ──
export async function ingestedRepos(workspaceId, { limit = 30 } = {}) {
  const ws = String(workspaceId);
  if (!ingestionAllowed(ws)) return null;
  const repos = await prisma.graphNode.findMany({
    where: { workspaceId: ws, type: 'SYSTEM' },
    take: limit, orderBy: { createdAt: 'desc' },
    select: { id: true, name: true, metadata: true, createdAt: true },
  });
  if (!repos.length) return null;
  return repos.map(r => ({
    id:        r.metadata?.id || r.name,
    type:      'pipeline',
    title:     r.name,
    name:      r.name,
    owner:     r.metadata?.owner || 'helios',
    repo:      r.name,
    fullName:  r.name,
    status:    'active',
    branch:    r.metadata?.default_branch || 'main',
    timestamp: r.createdAt,
    metadata:  { ...(r.metadata || {}), language: r.metadata?.language || null },
    ...PROV(ws, 'github'),
  }));
}

// ── Communication: inbox from EMAIL nodes ───────────────────────────────────────
export async function ingestedInbox(workspaceId, { limit = 25 } = {}) {
  const ws = String(workspaceId);
  if (!ingestionAllowed(ws)) return null;
  const emails = await prisma.graphNode.findMany({
    where: { workspaceId: ws, type: 'EMAIL' },
    take: limit, orderBy: { createdAt: 'desc' },
    select: { id: true, name: true, metadata: true, createdAt: true },
  });
  if (!emails.length) return null;
  return emails.map(e => ({
    id:        e.metadata?.id || e.id,
    subject:   e.name,
    from:      e.metadata?.from || 'unknown',
    snippet:   e.metadata?.snippet || e.name,
    timestamp: e.metadata?.timestamp || e.createdAt,
    read:      e.metadata?.read ?? false,
    metadata:  e.metadata || {},
    ...PROV(ws, 'gmail'),
  }));
}

// ── Meetings: events from MEETING nodes ─────────────────────────────────────────
export async function ingestedMeetings(workspaceId, { limit = 25 } = {}) {
  const ws = String(workspaceId);
  if (!ingestionAllowed(ws)) return null;
  const meetings = await prisma.graphNode.findMany({
    where: { workspaceId: ws, type: 'MEETING' },
    take: limit, orderBy: { createdAt: 'desc' },
    select: { id: true, name: true, metadata: true, createdAt: true },
  });
  if (!meetings.length) return null;
  return meetings.map(m => ({
    id:          m.metadata?.id || m.id,
    title:       m.name,
    summary:     m.metadata?.summary || '',
    startTime:   m.metadata?.start_time || m.metadata?.start || m.createdAt,
    endTime:     m.metadata?.end_time || null,
    attendees:   m.metadata?.attendees || [],
    metadata:    m.metadata || {},
    ...PROV(ws, 'google-calendar'),
  }));
}

// ── Customers: accounts from CUSTOMER nodes (HubSpot preview provider) ──────────
export async function ingestedCustomers(workspaceId, { limit = 50 } = {}) {
  const ws = String(workspaceId);
  if (!ingestionAllowed(ws)) return null;
  const nodes = await prisma.graphNode.findMany({
    where: { workspaceId: ws, type: 'CUSTOMER' },
    take: limit, orderBy: { createdAt: 'desc' },
    select: { id: true, name: true, metadata: true, createdAt: true },
  });
  if (!nodes.length) return null;
  return nodes.map(n => ({
    id:            n.metadata?.id || n.id,
    name:          n.name,
    company:       n.name,
    health:        n.metadata?.health || null,
    healthScore:   n.metadata?.health_score ?? null,
    churnRisk:     n.metadata?.churn_risk ?? null,
    renewalDate:   n.metadata?.renewal_date || null,
    contractValue: n.metadata?.contract_value_annual ?? null,
    accountOwner:  n.metadata?.account_owner || null,
    metadata:      n.metadata || {},
    ...PROV(ws, 'hubspot'),
  }));
}

// ── People: employees from USER nodes (Workday preview provider) ────────────────
export async function ingestedEmployees(workspaceId, { limit = 60 } = {}) {
  const ws = String(workspaceId);
  if (!ingestionAllowed(ws)) return null;
  const nodes = await prisma.graphNode.findMany({
    where: { workspaceId: ws, type: 'USER' },
    take: limit, orderBy: { createdAt: 'desc' },
    select: { id: true, name: true, metadata: true, createdAt: true },
  });
  if (!nodes.length) return null;
  return nodes.map(n => ({
    id:         n.metadata?.id || n.id,
    name:       n.name,
    email:      n.metadata?.email || null,
    role:       n.metadata?.role || null,
    department: n.metadata?.department || null,
    team:       n.metadata?.team || null,
    manager:    n.metadata?.reports_to || null,
    location:   n.metadata?.location || null,
    metadata:   n.metadata || {},
    ...PROV(ws, 'workday'),
  }));
}

// ── Work: LIST reads for issues / projects from ISSUE & PROJECT nodes (Jira preview) ─
// Only the two list resources have an ingested equivalent. Single-item reads (issue/
// project by key), sprints, and write resources return null → the preview provider
// (labeled sample data) handles them, and writes stay governed.
export async function ingestedWork(workspaceId, { resource = 'issues', limit = 60 } = {}) {
  const ws = String(workspaceId);
  if (!ingestionAllowed(ws)) return null;
  if (resource !== 'issues' && resource !== 'projects') return null;
  const type = resource === 'projects' ? 'PROJECT' : 'ISSUE';
  const nodes = await prisma.graphNode.findMany({
    where: { workspaceId: ws, type },
    take: limit, orderBy: { createdAt: 'desc' },
    select: { id: true, name: true, metadata: true, createdAt: true },
  });
  if (!nodes.length) return null;
  return nodes.map(n => ({
    id:       n.metadata?.id || n.id,
    key:      n.metadata?.key || n.metadata?.id || n.id,
    title:    n.name,
    name:     n.name,
    status:   n.metadata?.status || null,
    priority: n.metadata?.priority || null,
    assignee: n.metadata?.assignee || null,
    project:  n.metadata?.project || null,
    metadata: n.metadata || {},
    ...PROV(ws, 'jira'),
  }));
}

// ── Engineering: open pull requests from PR nodes (GitHub) ──────────────────────
// Normalized to the exact shape GitHubAdapter._readPulls() produces, so the PR-review
// workflow (PRReviewPlanner + PRSafetyEvaluator) iterates ingested PRs unchanged.
// Fields absent from the synthetic data (draft/mergeable/reviewStatus) are left
// undefined — the evaluator treats their absence conservatively (no false "safe").
export async function ingestedPulls(workspaceId, { state = 'open', limit = 50 } = {}) {
  const ws = String(workspaceId);
  if (!ingestionAllowed(ws)) return null;
  const nodes = await prisma.graphNode.findMany({
    where: { workspaceId: ws, type: 'PR' },
    take: 200, orderBy: { createdAt: 'desc' },
    select: { id: true, name: true, metadata: true, createdAt: true },
  });
  if (!nodes.length) return null;
  const wantOpen = String(state).toLowerCase() === 'open';
  const rows = nodes
    .filter(n => {
      const st = String(n.metadata?.state || '').toLowerCase();
      return wantOpen ? (st === 'open' || st === '') : true;
    })
    .slice(0, limit)
    .map(n => {
      const m = n.metadata || {};
      const num = Number(String(m.id || n.id).replace(/\D/g, '')) || null;
      return {
        title:  n.name,
        url:    m.url || null,
        author: m.created_by || m.author || null,
        state:  String(m.state || 'open').toLowerCase(),
        metadata: {
          number:              num,
          mergeReadinessScore: m.merge_readiness ?? m.mergeReadinessScore ?? 0,
          // absent in synthetic data → undefined (evaluator: undefined ≠ false/'changes_requested')
          draft:               m.draft,
          mergeable:           m.mergeable,
          reviewStatus:        m.reviewStatus,
          reviewersRequested:  m.reviewers_requested || [],
          repo:                m.repo || null,
          rawId:               m.id || n.id,
        },
        ...PROV(ws, 'github'),
      };
    });
  return rows;
}

export default { hasIngested, ingestedRepos, ingestedInbox, ingestedMeetings, ingestedCustomers, ingestedEmployees, ingestedWork, ingestedPulls };
