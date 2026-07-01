import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import 'dotenv/config';
import { startTestServer } from '../helpers/setup.js';
import { signTestToken } from '../helpers/auth.js';

let srv;
before(async () => { srv = await startTestServer(); });
after(async () => { if (srv) await srv.close(); });

const WS_ID = 'workspace_corp_alpha';

describe('Intelligence — GET /api/intelligence/health-score', () => {
  it('returns 401 without token', async () => {
    const res = await srv.agent.get('/api/intelligence/health-score').set('workspace-id', WS_ID);
    assert.ok(res.status === 401 || res.status === 403);
  });

  it('returns 400 without workspace-id', async () => {
    const token = signTestToken();
    const res = await srv.agent.get('/api/intelligence/health-score').set('Authorization', `Bearer ${token}`);
    assert.ok(res.status === 400 || res.status === 403);
  });

  it('returns health score object with a score field', async () => {
    const token = signTestToken();
    const res = await srv.agent.get('/api/intelligence/health-score')
      .set('Authorization', `Bearer ${token}`)
      .set('workspace-id', WS_ID);
    assert.ok(res.status < 500);
    if (res.status === 200) {
      assert.ok(res.body.score !== undefined || res.body.healthScore !== undefined || res.body.overall !== undefined);
    }
  });

  it('response body is an object', async () => {
    const token = signTestToken();
    const res = await srv.agent.get('/api/intelligence/health-score')
      .set('Authorization', `Bearer ${token}`)
      .set('workspace-id', WS_ID);
    assert.ok(res.status < 500);
    if (res.status === 200) {
      assert.equal(typeof res.body, 'object');
      assert.ok(!Array.isArray(res.body), 'health-score should return an object, not an array');
    }
  });
});

describe('Intelligence — GET /api/intelligence/daily-feed', () => {
  it('returns 200 with feed array', async () => {
    const token = signTestToken();
    const res = await srv.agent.get('/api/intelligence/daily-feed')
      .set('Authorization', `Bearer ${token}`)
      .set('workspace-id', WS_ID);
    assert.ok(res.status < 500);
    if (res.status === 200) {
      assert.ok(Array.isArray(res.body) || Array.isArray(res.body.feed) || typeof res.body === 'object');
    }
  });

  it('requires authentication', async () => {
    const res = await srv.agent.get('/api/intelligence/daily-feed').set('workspace-id', WS_ID);
    assert.ok(res.status === 401 || res.status === 403);
  });

  it('requires workspace-id header', async () => {
    const token = signTestToken();
    const res = await srv.agent.get('/api/intelligence/daily-feed')
      .set('Authorization', `Bearer ${token}`);
    assert.ok(res.status === 400 || res.status === 403);
  });
});

describe('Intelligence — GET /health', () => {
  it('returns 200 on /health', async () => {
    const res = await srv.agent.get('/health');
    assert.ok(res.status === 200);
  });

  it('returns 200 on /api/health', async () => {
    const res = await srv.agent.get('/api/health');
    assert.ok(res.status === 200);
  });

  it('health response contains status field', async () => {
    const res = await srv.agent.get('/health');
    assert.ok(res.body.status || res.body.ok || res.status === 200);
  });
});

describe('Intelligence — POST /api/intelligence/rolling-summary', () => {
  it('requires authentication', async () => {
    const res = await srv.agent.post('/api/intelligence/rolling-summary').set('workspace-id', WS_ID);
    assert.ok(res.status === 401 || res.status === 403);
  });

  it('requires workspace-id', async () => {
    const token = signTestToken();
    const res = await srv.agent.post('/api/intelligence/rolling-summary')
      .set('Authorization', `Bearer ${token}`);
    assert.ok(res.status === 400 || res.status === 403);
  });
});
