import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import 'dotenv/config';
import { startTestServer } from '../helpers/setup.js';
import { signTestToken } from '../helpers/auth.js';
import { HELIOS_SNAPSHOT } from '../helpers/fixtures.js';

let srv;
before(async () => { srv = await startTestServer(); });
after(async () => { if (srv) await srv.close(); });

const WS_ID = 'workspace_corp_alpha';

describe('Lifecycle — GET /api/lifecycle/schema', () => {
  it('requires authentication', async () => {
    const res = await srv.agent.get('/api/lifecycle/schema').set('workspace-id', WS_ID);
    assert.ok(res.status === 401 || res.status === 403);
  });

  it('returns 23+ supported types', async () => {
    const token = signTestToken();
    const res = await srv.agent.get('/api/lifecycle/schema')
      .set('Authorization', `Bearer ${token}`)
      .set('workspace-id', WS_ID);
    assert.ok(res.status === 200, `got ${res.status}`);
    const types = res.body.supportedTypes ?? res.body.types ?? [];
    assert.ok(Array.isArray(types));
    assert.ok(types.length >= 23, `expected >= 23, got ${types.length}`);
  });

  it('schema includes engineVersion', async () => {
    const token = signTestToken();
    const res = await srv.agent.get('/api/lifecycle/schema')
      .set('Authorization', `Bearer ${token}`)
      .set('workspace-id', WS_ID);
    assert.ok(res.body.engineVersion || res.body.version);
  });

  it('schema includes operations list', async () => {
    const token = signTestToken();
    const res = await srv.agent.get('/api/lifecycle/schema')
      .set('Authorization', `Bearer ${token}`)
      .set('workspace-id', WS_ID);
    assert.ok(res.status === 200, `got ${res.status}`);
    assert.ok(res.body.operations || res.body.supportedOperations);
  });
});

describe('Lifecycle — POST /api/lifecycle/validate', () => {
  it('dry-run validate returns valid=true for Helios snapshot', async () => {
    const token = signTestToken();
    const res = await srv.agent.post('/api/lifecycle/validate')
      .set('Authorization', `Bearer ${token}`)
      .set('workspace-id', WS_ID)
      .send({ manifest: HELIOS_SNAPSHOT.manifest, datasets: {
        departments: HELIOS_SNAPSHOT.departments,
        employees: HELIOS_SNAPSHOT.employees,
        customers: HELIOS_SNAPSHOT.customers,
      }});
    assert.ok(res.status === 200 || res.status === 201, `got ${res.status}: ${JSON.stringify(res.body).slice(0,200)}`);
    assert.ok(res.body.valid === true || res.body.status === 'valid', `validation failed: ${JSON.stringify(res.body)}`);
  });

  it('validate rejects empty manifest', async () => {
    const token = signTestToken();
    const res = await srv.agent.post('/api/lifecycle/validate')
      .set('Authorization', `Bearer ${token}`)
      .set('workspace-id', WS_ID)
      .send({ manifest: {}, datasets: {} });
    assert.ok(res.status >= 400);
  });

  it('validate requires OWNER or ADMIN role', async () => {
    const memberToken = signTestToken('user-member', 'org-test', 'MEMBER');
    const res = await srv.agent.post('/api/lifecycle/validate')
      .set('Authorization', `Bearer ${memberToken}`)
      .set('workspace-id', WS_ID)
      .send({ manifest: HELIOS_SNAPSHOT.manifest, datasets: {} });
    assert.ok(res.status === 403, `expected 403, got ${res.status}`);
  });

  it('validate requires authentication', async () => {
    const res = await srv.agent.post('/api/lifecycle/validate')
      .set('workspace-id', WS_ID)
      .send({ manifest: HELIOS_SNAPSHOT.manifest, datasets: {} });
    assert.ok(res.status === 401 || res.status === 403);
  });
});

describe('Lifecycle — GET /api/lifecycle/history', () => {
  it('returns array (may be empty)', async () => {
    const token = signTestToken();
    const res = await srv.agent.get('/api/lifecycle/history')
      .set('Authorization', `Bearer ${token}`)
      .set('workspace-id', WS_ID);
    assert.ok(res.status === 200, `got ${res.status}`);
    const records = res.body.records ?? res.body ?? [];
    assert.ok(Array.isArray(records));
  });

  it('requires workspace-id header', async () => {
    const token = signTestToken();
    const res = await srv.agent.get('/api/lifecycle/history')
      .set('Authorization', `Bearer ${token}`);
    assert.ok(res.status === 400 || res.status === 403);
  });

  it('requires authentication', async () => {
    const res = await srv.agent.get('/api/lifecycle/history').set('workspace-id', WS_ID);
    assert.ok(res.status === 401 || res.status === 403);
  });
});
