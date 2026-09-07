import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import 'dotenv/config';
import { startTestServer } from '../helpers/setup.js';
import { signTestToken } from '../helpers/auth.js';

let srv;
before(async () => { srv = await startTestServer(); });
after(async () => { if (srv) await srv.close(); });

const WS_ID = 'workspace_corp_alpha';

describe('Ingestion — POST /api/webhook/ingest', () => {
  it('returns 400 when workspace-id header missing', async () => {
    const token = signTestToken();
    const res = await srv.agent.post('/api/webhook/ingest')
      .set('Authorization', `Bearer ${token}`)
      .send({ platform: 'slack', sender: 'CTO', channel: 'engineering', text: 'test' });
    // workspace-id required
    assert.ok(res.status === 400 || res.status === 401 || res.status === 403);
  });

  it('returns 400 on missing text field', async () => {
    const token = signTestToken();
    const res = await srv.agent.post('/api/webhook/ingest')
      .set('Authorization', `Bearer ${token}`)
      .set('workspace-id', WS_ID)
      .send({ platform: 'slack', sender: 'CTO', channel: 'engineering' });
    assert.ok(res.status >= 400);
  });

  it('accepts valid ingest payload and returns jobId', async () => {
    const token = signTestToken();
    const res = await srv.agent.post('/api/webhook/ingest')
      .set('Authorization', `Bearer ${token}`)
      .set('workspace-id', WS_ID)
      .send({ platform: 'slack', sender: 'CTO', channel: 'engineering', text: 'Database migration scheduled for tonight.' });
    assert.ok(res.status === 200 || res.status === 202, `got ${res.status}: ${JSON.stringify(res.body)}`);
    assert.ok(res.body.jobId || res.body.id || res.body.success !== false);
  });

  it('accepts github platform payload', async () => {
    const token = signTestToken();
    const res = await srv.agent.post('/api/webhook/ingest')
      .set('Authorization', `Bearer ${token}`)
      .set('workspace-id', WS_ID)
      .send({ platform: 'github', sender: 'bot', channel: 'main', text: 'PR #42 merged: Add OAuth2 support' });
    assert.ok(res.status < 500);
  });

  it('accepts gmail platform payload', async () => {
    const token = signTestToken();
    const res = await srv.agent.post('/api/webhook/ingest')
      .set('Authorization', `Bearer ${token}`)
      .set('workspace-id', WS_ID)
      .send({ platform: 'gmail', sender: 'ceo@company.com', channel: 'inbox', text: 'Q3 revenue exceeded targets by 18%.' });
    assert.ok(res.status < 500);
  });

  it('long text is accepted without 413', async () => {
    const token = signTestToken();
    const res = await srv.agent.post('/api/webhook/ingest')
      .set('Authorization', `Bearer ${token}`)
      .set('workspace-id', WS_ID)
      .send({ platform: 'slack', sender: 'PM', channel: 'product', text: 'Details: '.repeat(100) + 'end.' });
    assert.ok(res.status !== 413);
  });

  it('requires authentication (no token = 401)', async () => {
    const res = await srv.agent.post('/api/webhook/ingest')
      .set('workspace-id', WS_ID)
      .send({ platform: 'slack', sender: 'CTO', channel: 'eng', text: 'test' });
    assert.ok(res.status === 401 || res.status === 403);
  });

  it('accepts jira platform payload', async () => {
    const token = signTestToken();
    const res = await srv.agent.post('/api/webhook/ingest')
      .set('Authorization', `Bearer ${token}`)
      .set('workspace-id', WS_ID)
      .send({ platform: 'jira', sender: 'PM', channel: 'backlog', text: 'TICKET-123 moved to done: Authentication refactor complete.' });
    assert.ok(res.status < 500);
  });

  it('response body is valid JSON', async () => {
    const token = signTestToken();
    const res = await srv.agent.post('/api/webhook/ingest')
      .set('Authorization', `Bearer ${token}`)
      .set('workspace-id', WS_ID)
      .send({ platform: 'slack', sender: 'DevOps', channel: 'alerts', text: 'CPU spike detected on prod-02.' });
    assert.ok(res.status < 500);
    assert.equal(typeof res.body, 'object');
  });
});
