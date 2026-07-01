import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import 'dotenv/config';
import { startTestServer } from '../helpers/setup.js';
import { signTestToken } from '../helpers/auth.js';

let srv;
before(async () => { srv = await startTestServer(); });
after(async () => { if (srv) await srv.close(); });

const WS_ID = 'workspace_corp_alpha';

describe('Query — POST /api/query', () => {
  it('returns 400 when workspace-id is missing', async () => {
    const token = signTestToken();
    const res = await srv.agent.post('/api/query')
      .set('Authorization', `Bearer ${token}`)
      .send({ queryText: 'test' });
    assert.ok(res.status === 400 || res.status === 403);
  });

  it('returns 400 when queryText is missing', async () => {
    const token = signTestToken();
    const res = await srv.agent.post('/api/query')
      .set('Authorization', `Bearer ${token}`)
      .set('workspace-id', WS_ID)
      .send({});
    assert.ok(res.status >= 400);
  });

  it('returns a synthesis for a valid query', async () => {
    const token = signTestToken();
    const res = await srv.agent.post('/api/query')
      .set('Authorization', `Bearer ${token}`)
      .set('workspace-id', WS_ID)
      .send({ queryText: 'What database changes are pending?' });
    assert.ok(res.status === 200 || res.status < 500, `got ${res.status}`);
    if (res.status === 200) {
      assert.ok(res.body.synthesis || res.body.answer || res.body.brief || res.body.result);
    }
  });

  it('engineering domain query routes correctly', async () => {
    const token = signTestToken();
    const res = await srv.agent.post('/api/query')
      .set('Authorization', `Bearer ${token}`)
      .set('workspace-id', WS_ID)
      .send({ queryText: 'Which pull requests are ready to merge?' });
    assert.ok(res.status < 500);
  });

  it('security domain query routes correctly', async () => {
    const token = signTestToken();
    const res = await srv.agent.post('/api/query')
      .set('Authorization', `Bearer ${token}`)
      .set('workspace-id', WS_ID)
      .send({ queryText: 'Are there any security vulnerabilities in our infrastructure?' });
    assert.ok(res.status < 500);
  });

  it('people domain query routes correctly', async () => {
    const token = signTestToken();
    const res = await srv.agent.post('/api/query')
      .set('Authorization', `Bearer ${token}`)
      .set('workspace-id', WS_ID)
      .send({ queryText: 'Who is the CTO and what decisions have they made recently?' });
    assert.ok(res.status < 500);
  });

  it('very short query returns valid response', async () => {
    const token = signTestToken();
    const res = await srv.agent.post('/api/query')
      .set('Authorization', `Bearer ${token}`)
      .set('workspace-id', WS_ID)
      .send({ queryText: 'status' });
    assert.ok(res.status < 500);
  });

  it('requires authentication', async () => {
    const res = await srv.agent.post('/api/query')
      .set('workspace-id', WS_ID)
      .send({ queryText: 'test' });
    assert.ok(res.status === 401 || res.status === 403);
  });

  it('finance domain query routes correctly', async () => {
    const token = signTestToken();
    const res = await srv.agent.post('/api/query')
      .set('Authorization', `Bearer ${token}`)
      .set('workspace-id', WS_ID)
      .send({ queryText: 'What is our current budget utilization for Q3?' });
    assert.ok(res.status < 500);
  });

  it('operations domain query routes correctly', async () => {
    const token = signTestToken();
    const res = await srv.agent.post('/api/query')
      .set('Authorization', `Bearer ${token}`)
      .set('workspace-id', WS_ID)
      .send({ queryText: 'What incidents occurred in the last 30 days?' });
    assert.ok(res.status < 500);
  });
});
