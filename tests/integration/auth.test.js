import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import 'dotenv/config';
import { startTestServer } from '../helpers/setup.js';
import { signTestToken, TEST_ORG_ID } from '../helpers/auth.js';

let srv;
before(async () => { srv = await startTestServer(); });
after(async () => { if (srv) await srv.close(); });

describe('Auth — POST /api/auth/signup', () => {
  const unique = Date.now();

  it('rejects signup with missing fields', async () => {
    const res = await srv.agent.post('/api/auth/signup').send({});
    assert.ok(res.status >= 400);
  });

  it('rejects signup with invalid email', async () => {
    const res = await srv.agent.post('/api/auth/signup')
      .send({ name: 'Test', email: 'notanemail', password: 'password123', orgName: 'Test Corp' });
    assert.ok(res.status >= 400);
  });

  it('returns 201 with JWT on valid signup', async () => {
    const res = await srv.agent.post('/api/auth/signup').send({
      name: 'Test User',
      email: `test+${unique}@example.com`,
      password: 'SecurePass123!',
      orgName: `Test Org ${unique}`,
    });
    assert.ok(res.status === 200 || res.status === 201, `got ${res.status}: ${JSON.stringify(res.body)}`);
    assert.ok(res.body.token || res.body.jwt || res.body.accessToken);
  });

  it('rejects signup with duplicate email', async () => {
    const email = `dup+${unique}@example.com`;
    await srv.agent.post('/api/auth/signup').send({
      name: 'First User',
      email,
      password: 'SecurePass123!',
      orgName: `Dup Org ${unique}`,
    });
    const res = await srv.agent.post('/api/auth/signup').send({
      name: 'Second User',
      email,
      password: 'SecurePass123!',
      orgName: `Dup Org 2 ${unique}`,
    });
    assert.ok(res.status >= 400);
  });

  it('rejects signup with short password', async () => {
    const res = await srv.agent.post('/api/auth/signup').send({
      name: 'Test User',
      email: `short+${unique}@example.com`,
      password: '123',
      orgName: `Short Org ${unique}`,
    });
    assert.ok(res.status >= 400);
  });
});

describe('Auth — POST /api/auth/login', () => {
  it('rejects login with wrong password', async () => {
    const res = await srv.agent.post('/api/auth/login')
      .send({ email: 'nonexistent@example.com', password: 'wrongpass' });
    assert.ok(res.status >= 400);
  });

  it('returns 400 on missing credentials', async () => {
    const res = await srv.agent.post('/api/auth/login').send({});
    assert.ok(res.status >= 400);
  });

  it('returns 400 on missing password', async () => {
    const res = await srv.agent.post('/api/auth/login').send({ email: 'test@example.com' });
    assert.ok(res.status >= 400);
  });
});

describe('JWT middleware', () => {
  it('returns 401 on protected route with no token', async () => {
    const res = await srv.agent.get('/api/orgs').set('workspace-id', 'ws-test');
    assert.ok(res.status === 401 || res.status === 403);
  });

  it('returns 401 on malformed Bearer token', async () => {
    const res = await srv.agent.get('/api/orgs')
      .set('Authorization', 'Bearer invalid.token.here')
      .set('workspace-id', 'ws-test');
    assert.ok(res.status === 401 || res.status === 403);
  });

  it('returns 401 on expired token', async () => {
    const jwt = (await import('jsonwebtoken')).default;
    const expired = jwt.sign({ userId: 'u1', orgId: 'o1', role: 'OWNER' }, process.env.JWT_SECRET, { expiresIn: '-1s' });
    const res = await srv.agent.get('/api/orgs')
      .set('Authorization', `Bearer ${expired}`)
      .set('workspace-id', 'ws-test');
    assert.ok(res.status === 401 || res.status === 403);
  });

  it('returns 401 when Authorization header is missing Bearer prefix', async () => {
    const token = signTestToken();
    const res = await srv.agent.get('/api/orgs')
      .set('Authorization', token)
      .set('workspace-id', 'ws-test');
    assert.ok(res.status === 401 || res.status === 403);
  });
});

describe('Tenant isolation — workspace-id header', () => {
  it('returns 400 when workspace-id header is absent', async () => {
    const token = signTestToken();
    const res = await srv.agent.post('/api/query')
      .set('Authorization', `Bearer ${token}`)
      .send({ queryText: 'test' });
    assert.ok(res.status === 400 || res.status === 403, `expected 400/403, got ${res.status}`);
  });

  it('returns 403 when workspace does not belong to org', async () => {
    const token = signTestToken('user-1', 'org-A');
    const res = await srv.agent.get('/api/intelligence/health-score')
      .set('Authorization', `Bearer ${token}`)
      .set('workspace-id', 'workspace_belonging_to_org_B');
    assert.ok(res.status === 403 || res.status === 404, `expected 403/404, got ${res.status}`);
  });

  it('protected intelligence route requires workspace-id header', async () => {
    const token = signTestToken();
    const res = await srv.agent.get('/api/intelligence/daily-feed')
      .set('Authorization', `Bearer ${token}`);
    assert.ok(res.status === 400 || res.status === 403, `expected 400/403, got ${res.status}`);
  });
});
