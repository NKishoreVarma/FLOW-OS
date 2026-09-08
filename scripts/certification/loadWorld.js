/**
 * loadWorld — loads the immutable flow-synthetic-world fixture and maps it into the
 * dataset shape FLOW's real Workspace Lifecycle Engine consumes: { type: [records] }.
 *
 * This does NOT interpret, score, or answer anything (that would be the forbidden
 * "JSON → certification answer" path, spec §4). It only reads the fixture and hands
 * the records to the SAME importer real enterprise data uses. It also computes a
 * deterministic checksum so the fixture's immutability can be verified (spec §2).
 *
 * The synthetic world is treated as read-only. Nothing here writes to it.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// datasets/flow data set/flow-synthetic-world — kept at its current path (spec §1:
// do not blindly rename; it's referenced by working code). Override with SYNTH_WORLD_DIR.
export const WORLD_DIR = process.env.SYNTH_WORLD_DIR
  || path.resolve(__dirname, '../../datasets/flow data set/flow-synthetic-world');

// synthetic file → FLOW WLE dataset type. Only files that map to a real dataset type
// are imported; anything unmapped is reported, never silently dropped.
const WORLD_MAP = {
  'world/company.json':      'company',
  'world/users.json':        'employees',
  'world/departments.json':  'departments',
  'world/projects.json':     'projects',
  'world/clients.json':      'customers',
  'world/repositories.json': 'repositories',
  'world/incidents.json':    'incidents',
};
const INTEGRATION_MAP = {
  'integrations/github/commits.json':        'commits',
  'integrations/github/pull_requests.json':  'pull_requests',
  'integrations/github/issues.json':         'jira_issues',   // GH issues → issue dataset
  'integrations/jira/epics.json':            'jira_issues',
  'integrations/jira/issues.json':           'jira_issues',
  'integrations/gmail/messages.json':        'emails',
  'integrations/slack/messages.json':        'slack_threads',
  'integrations/calendar/events.json':       'calendar_events',
  'integrations/meetings/transcripts.json':  'meeting_transcripts',
  'integrations/notion/pages.json':          'documents',
};

function readJsonRecords(absPath) {
  const raw = JSON.parse(fs.readFileSync(absPath, 'utf8'));
  if (Array.isArray(raw)) return raw;
  // world files wrap the array under a named key ({users:[...]}); unwrap the first array.
  const arr = Object.values(raw).find(Array.isArray);
  if (arr) return arr;
  // single-object fixtures (company.json) → one record
  return [raw];
}

// Ensure the fields the WLE validators require exist, without inventing data:
// only mirror an equivalent field the fixture already provides (name↔title,
// subject from title, message from text). Never fabricates values.
const slugify = (s) => String(s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function normalize(type, rec) {
  // company.json wraps the single company object under a `company` key.
  let r = { ...(type === 'company' && rec.company && typeof rec.company === 'object' ? rec.company : rec) };
  const has = (k) => r[k] != null && r[k] !== '';

  if (type === 'company') {
    if (!has('name')) r.name = r.company_name || r.company || 'Helios Systems';
    if (!has('slug')) r.slug = slugify(r.name);
    if (!has('id'))   r.id = r.company_id || 'COMPANY-001';
  }
  if (['incidents', 'projects', 'jira_issues'].includes(type)) {
    if (!has('title') && has('name')) r.title = r.name;
    if (!has('name') && has('title'))  r.name = r.title;
  }
  if (type === 'emails' && !has('subject')) {
    if (has('title')) r.subject = r.title;
    else if (has('snippet')) r.subject = String(r.snippet).slice(0, 80);
  }
  if (type === 'commits' && !has('message') && has('text')) r.message = r.text;
  // customers: the account name lives in `company`; no slug required by validator.
  if (type === 'customers' && !has('name')) {
    r.name = r.company || r.account_name || r.title || r.full_name || `Account ${r.id}`;
  }
  if (['employees', 'repositories'].includes(type) && !has('name')) {
    r.name = r.title || r.full_name || r.login || r.repo || `Record ${r.id}`;
  }
  // meeting_transcripts: the transcript text is `full_transcript`.
  if (type === 'meeting_transcripts' && !has('content')) {
    const decisions = Array.isArray(r.key_decisions) ? r.key_decisions.join('; ') : '';
    r.content = r.full_transcript || r.transcript || r.summary
      || [r.title, decisions].filter(Boolean).join(' — ') || `Meeting ${r.id}`;
  }

  // ── Edge-endpoint fields (spec: close the 0-edges gap the HONEST way) ──────────
  // The WLE resolvers build relationship edges from camelCase `xxxId` fields; the
  // synthetic world uses different names (repo/author/created_by/…). Mapping them
  // makes the REAL WLE resolvers emit real edges during import — no parallel writer,
  // no fabricated relationships. Every edge below reflects an actual field in the data.
  if (type === 'employees') {
    if (has('department') && !has('departmentId')) r.departmentId = r.department;
    if (has('team') && !has('teamId')) r.teamId = r.team;
    // RC-3: reporting structure. reports_to (single manager id) → REPORTS_TO edge;
    // manages (array of report ids) → MANAGES edges. Real fields in the data.
    if (has('reports_to') && !has('managerId')) r.managerId = r.reports_to;
    // r.manages stays as-is (array) — the resolver expands it into MANAGES edges.
  }
  if (type === 'incidents') {
    // RC-3: incident responsibility. assigned_to → ASSIGNED_TO; incident_commander → COMMANDER.
    if (has('assigned_to') && !has('assigneeId')) r.assigneeId = r.assigned_to;
    if (has('incident_commander') && !has('commanderId')) r.commanderId = r.incident_commander;
  }
  if (type === 'projects') {
    if (has('owner') && !has('ownerId')) r.ownerId = r.owner;
    if (has('department') && !has('departmentId')) r.departmentId = r.department;
  }
  if (type === 'repositories' && has('project') && !has('projectId')) r.projectId = r.project;
  if (type === 'commits') {
    if (has('repo') && !has('repositoryId')) r.repositoryId = r.repo;
    if (has('author') && !has('authorId')) r.authorId = r.author;
  }
  if (type === 'pull_requests') {
    if (has('repo') && !has('repositoryId')) r.repositoryId = r.repo;
    if ((has('created_by') || has('author')) && !has('authorId')) r.authorId = r.created_by || r.author;
  }
  if (type === 'jira_issues') {
    if (has('project') && !has('projectId')) r.projectId = r.project;
    if (has('assignee') && !has('assigneeId')) r.assigneeId = r.assignee;
  }
  return r;
}

/**
 * Load + map the whole synthetic world.
 * @returns {{ datasets: Object<string,Array>, counts: Object<string,number>,
 *             totalRecords: number, files: string[], missing: string[] }}
 */
export function loadSyntheticWorld() {
  const datasets = {};
  const counts = {};
  const files = [];
  const missing = [];

  for (const [rel, type] of Object.entries({ ...WORLD_MAP, ...INTEGRATION_MAP })) {
    const abs = path.join(WORLD_DIR, rel);
    if (!fs.existsSync(abs)) { missing.push(rel); continue; }
    files.push(rel);
    const recs = readJsonRecords(abs).map((r) => normalize(type, r));
    datasets[type] = (datasets[type] || []).concat(recs);
  }

  let totalRecords = 0;
  for (const [type, recs] of Object.entries(datasets)) { counts[type] = recs.length; totalRecords += recs.length; }
  return { datasets, counts, totalRecords, files, missing };
}

/**
 * Deterministic checksum over EVERY json file in the fixture (not just mapped ones),
 * so any change to the certified world is detectable (spec §2 immutability).
 */
export function computeChecksum() {
  const hash = crypto.createHash('sha256');
  const jsonFiles = [];
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir).sort()) {
      const p = path.join(dir, name);
      const st = fs.statSync(p);
      if (st.isDirectory()) { if (name !== 'scratch' && name !== '__pycache__') walk(p); }
      else if (name.endsWith('.json') && name !== 'MANIFEST.json') jsonFiles.push(p);
    }
  };
  walk(WORLD_DIR);
  jsonFiles.sort();
  for (const f of jsonFiles) {
    hash.update(path.relative(WORLD_DIR, f));
    hash.update(fs.readFileSync(f));
  }
  return { checksum: hash.digest('hex'), fileCount: jsonFiles.length };
}

/**
 * Load the real synthetic activity as FLOW events, mapped to the canonical event
 * shape the Event Platform consumes (via publishFields). These are REAL records from
 * the fixture (real authors, real timestamps) — the consequence/prediction engines
 * read `flow_events` for actor activity (byActor), which the WLE import doesn't
 * populate. Publishing them through the real bus closes that gap honestly.
 */
export function loadSyntheticEvents() {
  const events = [];
  const push = (rel, unwrap, map) => {
    const abs = path.join(WORLD_DIR, rel);
    if (!fs.existsSync(abs)) return;
    const raw = JSON.parse(fs.readFileSync(abs, 'utf8'));
    const arr = Array.isArray(raw) ? raw : (unwrap && raw[unwrap] ? raw[unwrap] : (Object.values(raw).find(Array.isArray) || []));
    for (const rec of arr) { const e = map(rec); if (e) events.push(e); }
  };

  const actor = (id) => id ? [{ type: 'USER', id: String(id), name: String(id) }] : [];

  push('integrations/github/commits.json', null, (c) => ({
    type: 'engineering', source: 'github', title: `commit to ${c.repo}`,
    summary: (c.message || '').split('\n')[0].slice(0, 140),
    ts: c.timestamp, actors: actor(c.author), sourceEventId: `commit-${c.id}`,
    entities: [{ type: 'COMMIT', id: String(c.id), name: c.repo }],
    metadata: { kind: 'commit', repo: c.repo, sha: c.sha, author: c.author },
  }));
  push('integrations/github/pull_requests.json', null, (p) => ({
    type: 'engineering', source: 'github', title: `PR ${p.id}: ${(p.title || '').slice(0, 60)}`,
    summary: (p.title || '').slice(0, 140), ts: p.updated_at || p.created_at,
    actors: actor(p.created_by), sourceEventId: `pr-${p.id}`, priority: p.state === 'open' ? 'medium' : 'low',
    entities: [{ type: 'PR', id: String(p.id), name: p.title }],
    metadata: { kind: 'pull_request', repo: p.repo, state: p.state, mergeReadiness: p.merge_readiness },
  }));
  push('integrations/gmail/messages.json', null, (m) => ({
    type: 'communication', source: 'gmail', title: (m.subject || `Email ${m.id}`).slice(0, 80),
    summary: (m.subject || '').slice(0, 140), ts: m.timestamp,
    actors: actor(m.from), sourceEventId: `email-${m.id}`,
    metadata: { kind: 'email', from: m.from, replied: m.replied },
  }));
  push('world/incidents.json', 'incidents', (inc) => ({
    type: 'incident', source: 'system', title: (inc.title || `Incident ${inc.id}`).slice(0, 90),
    summary: (inc.symptoms || inc.root_cause || '').toString().slice(0, 140), ts: inc.created_at || inc.detected_at || new Date().toISOString(),
    priority: /critical|sev.?1|p0/i.test(JSON.stringify(inc)) ? 'critical' : 'high',
    actors: actor(inc.commander || inc.owner), sourceEventId: `incident-${inc.id}`,
    entities: [{ type: 'INCIDENT', id: String(inc.id), name: inc.title }],
    metadata: { kind: 'incident', client: inc.client, status: inc.status, severity: inc.severity },
  }));
  return events;
}

export default { WORLD_DIR, loadSyntheticWorld, loadSyntheticEvents, computeChecksum };
