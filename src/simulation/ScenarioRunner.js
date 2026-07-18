/**
 * ScenarioRunner — executes a scenario plan against REAL data. This is where the
 * simulation stops being hypothetical: it traverses the Operational Graph for
 * cascading impact, replays relevant historical events as evidence, and pulls
 * memory analogues. No mocked outputs — every finding is sourced.
 */

import {
  analyzeImpact, analyzeDependencies, findOrphans, neighbors, whoKnows,
} from '../graph/index.js';
import { replay } from '../replay/index.js';
import { queryAllMemory } from '../services/orgMemoryService.js';
import { logger } from '../utils/logger.js';

const safe = async (fn, fallback = null) => { try { return await fn(); } catch (err) { logger.rag(`[sim] analysis failed: ${err.message}`); return fallback; } };

export async function run(workspaceId, scenario, plan) {
  const findings = { target: scenario.target, requested: plan.graph };
  const nodeId = scenario.target?.id;

  // ── Graph analyses ──────────────────────────────────────────────────────────
  if (nodeId && plan.graph.includes('impact')) {
    findings.impact = await safe(() => analyzeImpact(workspaceId, nodeId, 3));
  }
  if (nodeId && plan.graph.includes('dependencies')) {
    findings.dependencies = await safe(() => analyzeDependencies(workspaceId, nodeId, 3));
  }
  if (nodeId && plan.graph.includes('neighbors')) {
    findings.neighbors = await safe(() => neighbors(workspaceId, nodeId), []);
  }

  // Employee-specific: owned assets, orphan risk, backup candidates (bus factor).
  if (nodeId && (plan.graph.includes('orphans') || plan.graph.includes('whoKnows'))) {
    const nbrs = findings.neighbors || await safe(() => neighbors(workspaceId, nodeId), []);
    const ownedAssets = nbrs.filter(n => ['REPOSITORY', 'PROJECT', 'PULL_REQUEST'].includes(n.node.type)
      && ['OWNS', 'CREATED', 'ASSIGNED_TO'].includes(n.relation)).slice(0, 8);

    const orphanRisk = [];
    const backupPool = new Map();
    for (const asset of ownedAssets) {
      const an = await safe(() => neighbors(workspaceId, asset.node.id), []);
      const otherOwners = an.filter(x => x.node.type === 'EMPLOYEE' && x.node.id !== nodeId
        && ['OWNS', 'CREATED', 'REVIEWED', 'ASSIGNED_TO'].includes(x.relation));
      if (otherOwners.length === 0) orphanRisk.push({ id: asset.node.id, name: asset.node.name, type: asset.node.type });
      for (const o of otherOwners) backupPool.set(o.node.id, { id: o.node.id, name: o.node.name, sharedAssets: (backupPool.get(o.node.id)?.sharedAssets || 0) + 1 });
    }
    findings.ownedAssets = ownedAssets.map(a => ({ id: a.node.id, name: a.node.name, type: a.node.type }));
    findings.orphanRisk = orphanRisk;
    findings.backupCandidates = [...backupPool.values()].sort((a, b) => b.sharedAssets - a.sharedAssets).slice(0, 5);
  }

  if (scenario.type === 'PROJECT_CANCEL' && plan.graph.includes('orphans')) {
    findings.orphanRepos = await safe(() => findOrphans(workspaceId, 'REPOSITORY'), []);
  }
  if (scenario.target?.name && plan.graph.includes('whoKnows') && !findings.backupCandidates?.length) {
    findings.expertise = await safe(() => whoKnows(workspaceId, scenario.target.name), []);
  }

  // ── Historical events (evidence via replay) ──────────────────────────────────
  if (plan.events) {
    const scope = { range: '90d', limit: 500 };
    if (plan.events.focusActor && nodeId) scope.actorId = nodeId.split(':').pop();
    if (plan.events.focusConnector && scenario.target?.name) scope.connector = scenario.target.name.toLowerCase();
    if (plan.events.mode === 'CUSTOMER_JOURNEY' && scenario.target?.name) scope.customer = scenario.target.name;
    findings.history = await safe(() => replay(workspaceId, { mode: plan.events.mode, scope }));
  }

  // ── Memory analogues (reuse past incidents / recommendations / simulations) ──
  if (plan.memory) {
    const mem = await safe(() => queryAllMemory(workspaceId, { hours: 24 * 180, limit: 100 }), []);
    findings.memoryAnalogues = (mem || []).filter(m => _relevantMemory(m, scenario)).slice(0, 10);
  }

  return findings;
}

function _relevantMemory(m, scenario) {
  const hay = `${m.type} ${m.title || ''} ${(m.tags || []).join(' ')}`.toLowerCase();
  const map = {
    EMPLOYEE_DEPARTURE: ['offboard', 'departure', 'attrition', 'knowledge'],
    SERVICE_OUTAGE: ['incident', 'outage', 'downtime'],
    REPOSITORY_LOSS: ['incident', 'repo'],
    CUSTOMER_CHURN: ['customer', 'churn', 'renewal'],
    RELEASE_SLIP: ['release', 'delay', 'slip', 'deadline'],
    DEPLOYMENT_POSTPONE: ['deploy', 'release'],
    PROJECT_CANCEL: ['project', 'cancel'],
    INTEGRATION_OUTAGE: ['integration', 'incident'],
  };
  const kws = map[scenario.type] || [];
  return kws.some(k => hay.includes(k)) || m.type === 'INCIDENT' || m.type === 'SIMULATION';
}
