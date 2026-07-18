import { registerDatasetType } from '../datasetRegistry.js';

export function makeValidator(requiredFields) {
  return function validate(records) {
    const errors = [];
    const warnings = [];
    const ids = new Set();
    for (const [i, rec] of (records ?? []).entries()) {
      for (const f of requiredFields) {
        if (rec[f] == null || rec[f] === '') errors.push(`[${i}] missing required field "${f}"`);
      }
      const id = rec.id ?? rec.slug ?? null;
      if (id) {
        if (ids.has(String(id))) warnings.push(`Duplicate id "${id}" at index ${i}`);
        ids.add(String(id));
      }
    }
    return { valid: errors.length === 0, errors, warnings };
  };
}

export function identity(records) { return records ?? []; }
export function noGraph(_records, _globalIdMap) { return { nodes: [], edges: [] }; }
export function noVector(_records) { return []; }

export function makeVectorizer(type, vectorFields) {
  return function vectorize(records) {
    return (records ?? []).flatMap(rec => {
      const text = vectorFields.map(f => rec[f] ?? '').filter(Boolean).join(' — ');
      if (!text.trim()) return [];
      return [{ text, channel: type, metadata: { id: rec.id, type } }];
    });
  };
}

export function makeResolver(entityType, edgeBuilders) {
  return function resolve(records, _globalIdMap) {
    const nodes = [];
    const edges = [];
    for (const rec of (records ?? [])) {
      nodes.push({
        id: String(rec.id),
        type: entityType,
        name: rec.name ?? rec.title ?? rec.subject ?? String(rec.id),
        metadata: { id: rec.id },
      });
      for (const buildEdge of edgeBuilders) {
        const edge = buildEdge(rec);
        if (edge) edges.push(edge);
      }
    }
    return { nodes, edges };
  };
}

// summary
registerDatasetType({
  type: 'summary',
  validator: makeValidator(['id']),
  normalizer: identity,
  resolver: noGraph,
  vectorizer: makeVectorizer('summary', ['content', 'description']),
  graphBuilder: noGraph,
});

// company
registerDatasetType({
  type: 'company',
  validator: makeValidator(['name', 'slug']),
  normalizer: identity,
  resolver: noGraph,
  vectorizer: makeVectorizer('company', ['description']),
  graphBuilder: noGraph,
});

// employees
const employeesResolver = makeResolver('USER', [
  rec => rec.departmentId ? { sourceId: String(rec.id), targetId: String(rec.departmentId), type: 'MEMBER_OF' } : null,
  rec => rec.teamId ? { sourceId: String(rec.id), targetId: String(rec.teamId), type: 'MEMBER_OF' } : null,
]);
registerDatasetType({
  type: 'employees',
  validator: makeValidator(['id', 'name']),
  normalizer: identity,
  resolver: employeesResolver,
  vectorizer: noVector,
  graphBuilder: employeesResolver,
});

// departments
const departmentsResolver = makeResolver('DEPARTMENT', []);
registerDatasetType({
  type: 'departments',
  validator: makeValidator(['id', 'name']),
  normalizer: identity,
  resolver: departmentsResolver,
  vectorizer: noVector,
  graphBuilder: departmentsResolver,
});

// projects
const projectsResolver = makeResolver('PROJECT', [
  rec => rec.ownerId ? { sourceId: String(rec.id), targetId: String(rec.ownerId), type: 'OWNED_BY' } : null,
  rec => rec.departmentId ? { sourceId: String(rec.id), targetId: String(rec.departmentId), type: 'BELONGS_TO' } : null,
]);
registerDatasetType({
  type: 'projects',
  validator: makeValidator(['id', 'name']),
  normalizer: identity,
  resolver: projectsResolver,
  vectorizer: makeVectorizer('projects', ['name', 'description', 'status']),
  graphBuilder: projectsResolver,
  memoryMapper: (rec) => ({ memoryType: 'PROJECT_EVENT', content: rec.description || rec.name || String(rec.id) }),
});

// customers
const customersResolver = makeResolver('CUSTOMER', []);
registerDatasetType({
  type: 'customers',
  validator: makeValidator(['id', 'name']),
  normalizer: identity,
  resolver: customersResolver,
  vectorizer: (records) => (records ?? []).flatMap(rec => {
    const parts = [
      rec.name,
      rec.industry,
      rec.tier ? `tier:${rec.tier}` : null,
      rec.health ? `health:${rec.health}` : null,
      rec.arr ? `arr:$${rec.arr}` : null,
      rec.description,
    ].filter(Boolean);
    const text = `Customer: ${parts.join(' — ')}`;
    return [{ text, channel: 'customers', metadata: { id: rec.id, type: 'customers' } }];
  }),
  graphBuilder: customersResolver,
  memoryMapper: (rec) => ({ memoryType: 'PROJECT_EVENT', content: rec.description || rec.name || String(rec.id) }),
});

// vendors
const vendorsResolver = makeResolver('VENDOR', []);
registerDatasetType({
  type: 'vendors',
  validator: makeValidator(['id', 'name']),
  normalizer: identity,
  resolver: vendorsResolver,
  vectorizer: noVector,
  graphBuilder: vendorsResolver,
});

// repositories
const repositoriesResolver = makeResolver('SYSTEM', [
  rec => rec.projectId ? { sourceId: String(rec.id), targetId: String(rec.projectId), type: 'PART_OF' } : null,
]);
registerDatasetType({
  type: 'repositories',
  validator: makeValidator(['id', 'name']),
  normalizer: identity,
  resolver: repositoriesResolver,
  vectorizer: noVector,
  graphBuilder: repositoriesResolver,
});

// commits
const commitsResolver = makeResolver('COMMIT', [
  rec => rec.repositoryId ? { sourceId: String(rec.id), targetId: String(rec.repositoryId), type: 'PART_OF' } : null,
  rec => rec.authorId ? { sourceId: String(rec.id), targetId: String(rec.authorId), type: 'AUTHORED_BY' } : null,
]);
registerDatasetType({
  type: 'commits',
  validator: makeValidator(['id', 'message']),
  normalizer: identity,
  resolver: commitsResolver,
  vectorizer: (records) => (records ?? []).flatMap(rec => {
    const parts = [rec.message, rec.author, rec.repository].filter(Boolean);
    const text = `Commit: ${parts.join(' — ')}`;
    return [{ text, channel: 'commits', metadata: { id: rec.id, type: 'commits' } }];
  }),
  graphBuilder: commitsResolver,
});

// pull_requests
function pullRequestsResolve(records, _globalIdMap) {
  const nodes = [];
  const edges = [];
  for (const rec of (records ?? [])) {
    nodes.push({
      id: String(rec.id),
      type: 'PR',
      name: rec.title ?? String(rec.id),
      metadata: { id: rec.id },
    });
    if (rec.repositoryId) edges.push({ sourceId: String(rec.id), targetId: String(rec.repositoryId), type: 'PART_OF' });
    if (rec.authorId) edges.push({ sourceId: String(rec.id), targetId: String(rec.authorId), type: 'AUTHORED_BY' });
  }
  return { nodes, edges };
}
registerDatasetType({
  type: 'pull_requests',
  validator: makeValidator(['id', 'title']),
  normalizer: identity,
  resolver: pullRequestsResolve,
  vectorizer: makeVectorizer('pull_requests', ['title', 'description', 'body']),
  graphBuilder: pullRequestsResolve,
});

// jira_issues
function jiraIssuesResolve(records, _globalIdMap) {
  const nodes = [];
  const edges = [];
  for (const rec of (records ?? [])) {
    nodes.push({
      id: String(rec.id),
      type: 'ISSUE',
      name: rec.title ?? String(rec.id),
      metadata: { id: rec.id },
    });
    if (rec.projectId) edges.push({ sourceId: String(rec.id), targetId: String(rec.projectId), type: 'PART_OF' });
    if (rec.assigneeId) edges.push({ sourceId: String(rec.id), targetId: String(rec.assigneeId), type: 'ASSIGNED_TO' });
  }
  return { nodes, edges };
}
registerDatasetType({
  type: 'jira_issues',
  validator: makeValidator(['id', 'title']),
  normalizer: identity,
  resolver: jiraIssuesResolve,
  vectorizer: makeVectorizer('jira_issues', ['title', 'description']),
  graphBuilder: jiraIssuesResolve,
});

// emails
function emailsResolve(records, _globalIdMap) {
  const nodes = [];
  const edges = [];
  for (const rec of (records ?? [])) {
    nodes.push({
      id: String(rec.id),
      type: 'EMAIL',
      name: rec.subject ?? String(rec.id),
      metadata: { id: rec.id },
    });
  }
  return { nodes, edges };
}
registerDatasetType({
  type: 'emails',
  validator: makeValidator(['id', 'subject']),
  normalizer: identity,
  resolver: emailsResolve,
  vectorizer: makeVectorizer('emails', ['subject', 'body', 'snippet']),
  graphBuilder: emailsResolve,
});

// slack_threads
function slackThreadsResolve(records, _globalIdMap) {
  const nodes = [];
  const edges = [];
  for (const rec of (records ?? [])) {
    nodes.push({
      id: String(rec.id),
      type: 'COMMUNICATION',
      name: rec.channel ?? String(rec.id),
      metadata: { id: rec.id },
    });
  }
  return { nodes, edges };
}
function slackThreadsVectorize(records) {
  return (records ?? []).flatMap(rec => {
    const text = (rec.messages ?? []).map(m => m.text ?? m.content ?? '').filter(Boolean).join('\n');
    if (!text.trim()) return [];
    return [{ text, channel: 'slack_threads', metadata: { id: rec.id, type: 'slack_threads' } }];
  });
}
registerDatasetType({
  type: 'slack_threads',
  validator: makeValidator(['id']),
  normalizer: identity,
  resolver: slackThreadsResolve,
  vectorizer: slackThreadsVectorize,
  graphBuilder: slackThreadsResolve,
});

// calendar_events
const calendarEventsResolver = makeResolver('MEETING', []);
registerDatasetType({
  type: 'calendar_events',
  validator: makeValidator(['id', 'title']),
  normalizer: identity,
  resolver: calendarEventsResolver,
  vectorizer: noVector,
  graphBuilder: calendarEventsResolver,
});

// meetings
function meetingsResolve(records, _globalIdMap) {
  const nodes = [];
  const edges = [];
  for (const rec of (records ?? [])) {
    nodes.push({
      id: String(rec.id),
      type: 'MEETING',
      name: rec.title ?? String(rec.id),
      metadata: { id: rec.id },
    });
    if (rec.projectId) edges.push({ sourceId: String(rec.id), targetId: String(rec.projectId), type: 'RELATES_TO' });
  }
  return { nodes, edges };
}
registerDatasetType({
  type: 'meetings',
  validator: makeValidator(['id', 'title']),
  normalizer: identity,
  resolver: meetingsResolve,
  vectorizer: makeVectorizer('meetings', ['title', 'notes', 'summary']),
  graphBuilder: meetingsResolve,
  memoryMapper: (rec) => ({ memoryType: 'KNOWLEDGE_UPDATE', content: rec.summary || rec.title || String(rec.id) }),
});

// meeting_transcripts
function meetingTranscriptsResolve(records, _globalIdMap) {
  const nodes = [];
  const edges = [];
  for (const rec of (records ?? [])) {
    nodes.push({
      id: String(rec.id),
      type: 'TRANSCRIPT',
      name: rec.title ?? String(rec.id),
      metadata: { id: rec.id },
    });
    if (rec.meetingId) edges.push({ sourceId: String(rec.id), targetId: String(rec.meetingId), type: 'TRANSCRIPT_OF' });
  }
  return { nodes, edges };
}
registerDatasetType({
  type: 'meeting_transcripts',
  validator: makeValidator(['id', 'content']),
  normalizer: identity,
  resolver: meetingTranscriptsResolve,
  vectorizer: makeVectorizer('meeting_transcripts', ['content']),
  graphBuilder: meetingTranscriptsResolve,
  memoryMapper: (rec) => ({ memoryType: 'KNOWLEDGE_UPDATE', content: rec.transcript || rec.summary || String(rec.id) }),
});

// incidents
function incidentsResolve(records, _globalIdMap) {
  const nodes = [];
  const edges = [];
  for (const rec of (records ?? [])) {
    nodes.push({
      id: String(rec.id),
      type: 'INCIDENT',
      name: rec.title ?? String(rec.id),
      metadata: { id: rec.id },
    });
    if (rec.repositoryId) edges.push({ sourceId: String(rec.id), targetId: String(rec.repositoryId), type: 'AFFECTS' });
    if (rec.projectId) edges.push({ sourceId: String(rec.id), targetId: String(rec.projectId), type: 'AFFECTS' });
  }
  return { nodes, edges };
}
registerDatasetType({
  type: 'incidents',
  validator: makeValidator(['id', 'title']),
  normalizer: identity,
  resolver: incidentsResolve,
  vectorizer: makeVectorizer('incidents', ['title', 'description', 'resolution']),
  graphBuilder: incidentsResolve,
  memoryMapper: (rec) => ({ memoryType: 'INCIDENT', content: rec.description || rec.title || String(rec.id) }),
});

// documents
function documentsResolve(records, _globalIdMap) {
  const nodes = [];
  const edges = [];
  for (const rec of (records ?? [])) {
    nodes.push({
      id: String(rec.id),
      type: 'DOCUMENT',
      name: rec.title ?? String(rec.id),
      metadata: { id: rec.id },
    });
  }
  return { nodes, edges };
}
registerDatasetType({
  type: 'documents',
  validator: makeValidator(['id', 'title', 'content']),
  normalizer: identity,
  resolver: documentsResolve,
  vectorizer: makeVectorizer('documents', ['title', 'content']),
  graphBuilder: documentsResolve,
  memoryMapper: (rec) => ({ memoryType: 'KNOWLEDGE_UPDATE', content: rec.content || rec.title || String(rec.id) }),
});

// timeline
function timelineResolve(records, _globalIdMap) {
  const nodes = [];
  const edges = [];
  for (const rec of (records ?? [])) {
    nodes.push({
      id: String(rec.id),
      type: 'EVENT',
      name: rec.title ?? String(rec.id),
      metadata: { id: rec.id },
    });
    if (rec.entityId) edges.push({ sourceId: String(rec.id), targetId: String(rec.entityId), type: 'RELATES_TO' });
  }
  return { nodes, edges };
}
registerDatasetType({
  type: 'timeline',
  validator: makeValidator(['id', 'type', 'title']),
  normalizer: identity,
  resolver: timelineResolve,
  vectorizer: makeVectorizer('timeline', ['title', 'description']),
  graphBuilder: timelineResolve,
});

// memory
registerDatasetType({
  type: 'memory',
  validator: makeValidator(['id', 'type']),
  normalizer: identity,
  resolver: noGraph,
  vectorizer: makeVectorizer('memory', ['content', 'title']),
  graphBuilder: noGraph,
});

// executive_reports
function executiveReportsResolve(records, _globalIdMap) {
  const nodes = [];
  const edges = [];
  for (const rec of (records ?? [])) {
    nodes.push({
      id: String(rec.id),
      type: 'DOCUMENT',
      name: rec.title ?? String(rec.id),
      metadata: { id: rec.id },
    });
  }
  return { nodes, edges };
}
registerDatasetType({
  type: 'executive_reports',
  validator: makeValidator(['id', 'title']),
  normalizer: identity,
  resolver: executiveReportsResolve,
  vectorizer: makeVectorizer('executive_reports', ['title', 'content', 'summary']),
  graphBuilder: executiveReportsResolve,
  memoryMapper: (rec) => ({ memoryType: 'KNOWLEDGE_UPDATE', content: rec.content || rec.summary || rec.title || String(rec.id) }),
});

// knowledgeGraph — dataset IS the graph; records[0] contains nodes + edges arrays
function knowledgeGraphResolve(records, _globalIdMap) {
  const source = records?.[0] ?? {};
  const nodes = (source.nodes ?? []).map(n => ({ id: String(n.id), type: n.type ?? 'NODE', name: n.name ?? String(n.id) }));
  const edges = source.edges ?? [];
  return { nodes, edges };
}
registerDatasetType({
  type: 'knowledgeGraph',
  validator: makeValidator([]),
  normalizer: identity,
  resolver: knowledgeGraphResolve,
  vectorizer: noVector,
  graphBuilder: knowledgeGraphResolve,
});

// permissions — pure metadata; no graph, no vectors
registerDatasetType({
  type: 'permissions',
  validator: makeValidator([]),
  normalizer: identity,
  resolver: noGraph,
  vectorizer: noVector,
  graphBuilder: noGraph,
});
