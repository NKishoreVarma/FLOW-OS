import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { HELIOS_SNAPSHOT } from '../helpers/fixtures.js';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEMO_PATH = join(__dirname, '../../demo-company/exports/datasets');

function load(name) {
  const fp = join(DEMO_PATH, name);
  return existsSync(fp) ? JSON.parse(readFileSync(fp, 'utf8')) : null;
}

const employees = load('employees.json');
const customers = load('customers.json');
const repos = load('repositories.json');
const jiraIssues = load('jira_issues.json');
const commits = load('commits.json');
const prs = load('pull_requests.json');
const incidents = load('incidents.json');
const documents = load('documents.json');
const timeline = load('timeline.json');

describe('Helios dataset invariants', () => {
  it('employees.json exists and has exactly 450 records', () => {
    assert.ok(employees, 'employees.json must exist — run: cd demo-company && npm run generate');
    assert.equal(employees.length, 450);
  });

  it('all employee IDs follow emp-NNN format', () => {
    for (const emp of employees) {
      assert.match(emp.id, /^emp-\d{3}$/, `bad ID: ${emp.id}`);
    }
  });

  it('employee IDs are unique', () => {
    const ids = new Set(employees.map(e => e.id));
    assert.equal(ids.size, 450);
  });

  it('all employees have required fields', () => {
    for (const emp of employees) {
      assert.ok(emp.id, `missing id`);
      assert.ok(emp.name, `${emp.id} missing name`);
      assert.ok(emp.email, `${emp.id} missing email`);
      assert.ok(emp.department, `${emp.id} missing department`);
      assert.ok(['OWNER', 'ADMIN', 'MEMBER'].includes(emp.role), `${emp.id} bad role: ${emp.role}`);
    }
  });

  it('emp-001 exists and has role ADMIN', () => {
    const firstEmp = employees.find(e => e.id === 'emp-001');
    assert.ok(firstEmp, 'emp-001 must exist');
    assert.equal(firstEmp.role, 'ADMIN', `expected role ADMIN, got ${firstEmp.role}`);
  });

  it('customers.json has exactly 210 records', () => {
    assert.ok(customers, 'customers.json must exist');
    assert.equal(customers.length, 210);
  });

  it('all customer IDs start with cust-', () => {
    for (const c of customers) {
      assert.ok(c.id.startsWith('cust-'), `bad customer ID: ${c.id}`);
    }
  });

  it('repositories.json has exactly 16 records', () => {
    assert.ok(repos, 'repositories.json must exist');
    assert.equal(repos.length, 16);
  });

  it('all repo IDs follow repo-{product}-{name} format', () => {
    for (const r of repos) {
      assert.match(r.id, /^repo-[a-z]+-[a-z]+/, `bad repo ID: ${r.id}`);
    }
  });

  it('jira_issues.json has exactly 1200 records (300 per product)', () => {
    assert.ok(jiraIssues, 'jira_issues.json must exist');
    assert.equal(jiraIssues.length, 1200);
  });

  it('Jira IDs follow {KEY}-{n} format', () => {
    const KEYS = ['HPLT', 'HANA', 'HCON', 'HGRD'];
    for (const issue of jiraIssues.slice(0, 100)) {
      const key = issue.id.split('-')[0];
      assert.ok(KEYS.includes(key), `bad Jira key: ${issue.id}`);
    }
  });

  it('commits.json has 1200+ records', () => {
    assert.ok(commits, 'commits.json must exist');
    assert.ok(commits.length >= 1200, `expected >= 1200, got ${commits.length}`);
  });

  it('commit IDs follow commit-{repoId}-NNNN format', () => {
    for (const c of commits.slice(0, 50)) {
      assert.match(c.id, /^commit-repo-/, `bad commit ID: ${c.id}`);
    }
  });

  it('all commits reference existing repo IDs', () => {
    const repoIds = new Set(repos.map(r => r.id));
    for (const c of commits.slice(0, 200)) {
      assert.ok(repoIds.has(c.repoId), `commit ${c.id} references non-existent repo ${c.repoId}`);
    }
  });

  it('pull_requests.json has 280+ records', () => {
    assert.ok(prs, 'pull_requests.json must exist');
    assert.ok(prs.length >= 280, `expected >= 280, got ${prs.length}`);
  });

  it('PR IDs follow pr-{repoId}-NNN format', () => {
    for (const pr of prs.slice(0, 50)) {
      assert.match(pr.id, /^pr-repo-/, `bad PR ID: ${pr.id}`);
    }
  });

  it('incidents.json has exactly 80 records', () => {
    assert.ok(incidents, 'incidents.json must exist');
    assert.equal(incidents.length, 80);
  });

  it('all incidents have valid severity', () => {
    const SEVERITIES = new Set(['P0', 'P1', 'P2', 'P3']);
    for (const inc of incidents) {
      assert.ok(SEVERITIES.has(inc.severity), `${inc.id} bad severity: ${inc.severity}`);
    }
  });

  it('documents.json has exactly 400 records', () => {
    assert.ok(documents, 'documents.json must exist');
    assert.equal(documents.length, 400);
  });

  it('timeline.json has exactly 500 records', () => {
    assert.ok(timeline, 'timeline.json must exist');
    assert.equal(timeline.length, 500);
  });

  it('manifest.json organization slug is helios', () => {
    const manifestPath = join(DEMO_PATH, '..', 'manifest.json');
    assert.ok(existsSync(manifestPath), 'manifest.json must exist');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    assert.equal(manifest.organization?.slug, 'helios', `bad org slug: ${manifest.organization?.slug}`);
  });

  it('manifest.json references only existing dataset files', () => {
    const manifestPath = join(DEMO_PATH, '..', 'manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    for (const ds of manifest.datasets) {
      const fp = join(DEMO_PATH, '..', ds.file);
      assert.ok(existsSync(fp), `manifest references non-existent file: ${ds.file}`);
    }
  });

  it('faker seed 12345 produces deterministic output (emp-001 name is a non-empty string)', () => {
    const firstEmp = employees.find(e => e.id === 'emp-001');
    assert.ok(firstEmp, 'emp-001 must exist');
    assert.ok(firstEmp.name, 'emp-001 must have a name');
    assert.equal(typeof firstEmp.name, 'string');
    assert.ok(firstEmp.name.length > 0, 'emp-001 name must not be empty');
  });

  it('HELIOS_SNAPSHOT fixture has non-empty employees slice', () => {
    assert.ok(Array.isArray(HELIOS_SNAPSHOT.employees), 'HELIOS_SNAPSHOT.employees must be an array');
    assert.ok(HELIOS_SNAPSHOT.employees.length > 0, 'HELIOS_SNAPSHOT.employees must not be empty');
    assert.ok(HELIOS_SNAPSHOT.employees.length <= 450, 'HELIOS_SNAPSHOT.employees slice must not exceed full dataset');
  });

  it('HELIOS_SNAPSHOT manifest has correct schemaVersion', () => {
    assert.equal(HELIOS_SNAPSHOT.manifest.schemaVersion, '1.0');
    assert.equal(HELIOS_SNAPSHOT.manifest.organization.slug, 'helios');
  });

  it('all PR IDs reference existing repo IDs', () => {
    const repoIds = new Set(repos.map(r => r.id));
    for (const pr of prs.slice(0, 100)) {
      assert.ok(repoIds.has(pr.repoId), `PR ${pr.id} references non-existent repo ${pr.repoId}`);
    }
  });

  it('all incidents have an id and title', () => {
    for (const inc of incidents) {
      assert.ok(inc.id, 'incident missing id');
      assert.ok(inc.title, `incident ${inc.id} missing title`);
    }
  });
});
