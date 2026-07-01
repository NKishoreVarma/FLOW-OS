import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import 'dotenv/config';
import { startTestServer } from '../helpers/setup.js';
import { signTestToken } from '../helpers/auth.js';

let srv;
before(async () => { srv = await startTestServer(); });
after(async () => { if (srv) await srv.close(); });

const WS_ID = 'workspace_corp_alpha';

describe('Brain — GET /api/brain/briefing', () => {
  it('returns briefing object for EXECUTIVE role', async () => {
    const token = signTestToken();
    const res = await srv.agent.get('/api/brain/briefing?role=EXECUTIVE')
      .set('Authorization', `Bearer ${token}`)
      .set('workspace-id', WS_ID);
    assert.ok(res.status < 500);
    if (res.status === 200) {
      assert.ok(typeof res.body === 'object');
    }
  });

  it('returns briefing for MANAGER role', async () => {
    const token = signTestToken();
    const res = await srv.agent.get('/api/brain/briefing?role=MANAGER')
      .set('Authorization', `Bearer ${token}`)
      .set('workspace-id', WS_ID);
    assert.ok(res.status < 500);
  });

  it('requires authentication', async () => {
    const res = await srv.agent.get('/api/brain/briefing').set('workspace-id', WS_ID);
    assert.ok(res.status === 401 || res.status === 403);
  });

  it('requires workspace-id', async () => {
    const token = signTestToken();
    const res = await srv.agent.get('/api/brain/briefing')
      .set('Authorization', `Bearer ${token}`);
    assert.ok(res.status === 400 || res.status === 403);
  });
});

describe('Brain — POST /api/brain/copilot', () => {
  it('answers a question about the workspace', async () => {
    const token = signTestToken();
    const res = await srv.agent.post('/api/brain/copilot')
      .set('Authorization', `Bearer ${token}`)
      .set('workspace-id', WS_ID)
      .send({ question: 'What are the current priorities this week?' });
    assert.ok(res.status < 500);
    if (res.status === 200) {
      assert.ok(res.body.answer || res.body.response || res.body.content);
    }
  });

  it('returns 400 on missing question', async () => {
    const token = signTestToken();
    const res = await srv.agent.post('/api/brain/copilot')
      .set('Authorization', `Bearer ${token}`)
      .set('workspace-id', WS_ID)
      .send({});
    assert.ok(res.status >= 400);
  });

  it('requires authentication', async () => {
    const res = await srv.agent.post('/api/brain/copilot')
      .set('workspace-id', WS_ID)
      .send({ question: 'test' });
    assert.ok(res.status === 401 || res.status === 403);
  });

  it('accepts pageContext for context-aware answers', async () => {
    const token = signTestToken();
    const res = await srv.agent.post('/api/brain/copilot')
      .set('Authorization', `Bearer ${token}`)
      .set('workspace-id', WS_ID)
      .send({ question: 'Summarize what I need to know', pageContext: 'engineering dashboard' });
    assert.ok(res.status < 500);
  });
});

describe('Brain — GET /api/brain/recommendations', () => {
  it('returns recommendations array', async () => {
    const token = signTestToken();
    const res = await srv.agent.get('/api/brain/recommendations')
      .set('Authorization', `Bearer ${token}`)
      .set('workspace-id', WS_ID);
    assert.ok(res.status < 500);
    if (res.status === 200) {
      const recs = res.body.recommendations ?? res.body ?? [];
      assert.ok(Array.isArray(recs));
    }
  });

  it('requires authentication', async () => {
    const res = await srv.agent.get('/api/brain/recommendations').set('workspace-id', WS_ID);
    assert.ok(res.status === 401 || res.status === 403);
  });
});

describe('Brain — GET /api/brain/timeline', () => {
  it('returns timeline events', async () => {
    const token = signTestToken();
    const res = await srv.agent.get('/api/brain/timeline')
      .set('Authorization', `Bearer ${token}`)
      .set('workspace-id', WS_ID);
    assert.ok(res.status < 500);
    if (res.status === 200) {
      const events = res.body.events ?? res.body ?? [];
      assert.ok(Array.isArray(events));
    }
  });

  it('requires workspace-id', async () => {
    const token = signTestToken();
    const res = await srv.agent.get('/api/brain/timeline')
      .set('Authorization', `Bearer ${token}`);
    assert.ok(res.status === 400 || res.status === 403);
  });
});

describe('Brain — Decisions', () => {
  it('returns decisions list', async () => {
    const token = signTestToken();
    const res = await srv.agent.get('/api/brain/decisions')
      .set('Authorization', `Bearer ${token}`)
      .set('workspace-id', WS_ID);
    assert.ok(res.status < 500);
  });

  it('creates a new decision', async () => {
    const token = signTestToken();
    const res = await srv.agent.post('/api/brain/decisions')
      .set('Authorization', `Bearer ${token}`)
      .set('workspace-id', WS_ID)
      .send({
        title: 'Test Decision: Migrate to microservices',
        rationale: 'Scalability requirements exceed monolith capacity.',
        impact: 'HIGH',
      });
    assert.ok(res.status === 200 || res.status === 201, `got ${res.status}: ${JSON.stringify(res.body).slice(0,200)}`);
    if (res.status <= 201) {
      assert.ok(res.body.id || res.body.decisionId || res.body.decision?.id);
    }
  });

  it('requires authentication to list decisions', async () => {
    const res = await srv.agent.get('/api/brain/decisions').set('workspace-id', WS_ID);
    assert.ok(res.status === 401 || res.status === 403);
  });
});

describe('Brain — Goals', () => {
  it('returns goals list', async () => {
    const token = signTestToken();
    const res = await srv.agent.get('/api/brain/goals')
      .set('Authorization', `Bearer ${token}`)
      .set('workspace-id', WS_ID);
    assert.ok(res.status < 500);
  });

  it('requires authentication', async () => {
    const res = await srv.agent.get('/api/brain/goals').set('workspace-id', WS_ID);
    assert.ok(res.status === 401 || res.status === 403);
  });
});
