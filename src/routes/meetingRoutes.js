/**
 * FLOW OS — Meeting Capability Routes
 *
 * Provider-agnostic REST API for the Meeting Capability.
 * Google Calendar is the first provider. Future providers (Outlook, Zoom, Teams)
 * use the same routes via ?provider= query param.
 *
 * CRUD and sync actions flow through executeAction() → governance → audit → timeline.
 * The /context endpoint runs the RAG pipeline internally for AI meeting prep.
 *
 * Route map:
 *   GET  /api/meetings/oauth/callback             — Google OAuth redirect (no workspace guard)
 *   GET  /api/meetings/status                     — connection status for workspace
 *   GET  /api/meetings/upcoming                   — upcoming events (next N days)
 *   GET  /api/meetings/past                       — past events (last N days)
 *   GET  /api/meetings/event/:eventId             — single event detail
 *   GET  /api/meetings/event/:eventId/context     — AI meeting prep context (RAG)
 *   POST /api/meetings/search                     — text search across events
 *   POST /api/meetings/create                     — create calendar event
 *   PATCH /api/meetings/event/:eventId            — update event (title, description, start, end)
 *   DELETE /api/meetings/event/:eventId           — delete event
 *   POST /api/meetings/event/:eventId/notes       — append meeting notes to event
 *   POST /api/meetings/event/:eventId/actions     — store action items on event
 *   POST /api/meetings/event/:eventId/summary     — store AI meeting summary on event
 *   POST /api/meetings/sync                       — sync upcoming events to ingestion pipeline
 */

import express from 'express';
import { executeAction }            from '../connectors/executionEngine.js';
import { hasTokens, getTokenMeta }  from '../services/google/GoogleTokenManager.js';
import { handleCallback }            from '../services/google/GoogleOAuthService.js';
import { storeOAuthTokens }         from '../connectors/authManager.js';
import { getConnector }             from '../connectors/registry.js';
import { ValidationError }          from '../core/errors/index.js';
import { retrieveContext }          from '../services/retrievalService.js';
import { evaluateContext }          from '../services/agents/CriticAgent.js';
import { synthesize }               from '../services/agents/ExecutiveSynthesisAgent.js';
import { routeQuery }               from '../services/agents/RouterAgent.js';
import { generateQueryTraceId }     from '../services/observabilityService.js';

const router = express.Router();

// ── Workspace-id guard ────────────────────────────────────────────────────────
router.use((req, res, next) => {
  if (req.path === '/oauth/callback') return next();  // OAuth redirect is exempt

  const workspaceId = req.headers['workspace-id'] || req.tenantId;
  if (!workspaceId) {
    return res.status(400).json({
      error: { code: 'MISSING_WORKSPACE', message: 'workspace-id header is required' },
    });
  }
  req.workspaceId = workspaceId;
  next();
});

// ── Provider resolution ───────────────────────────────────────────────────────
function resolveProvider(req) {
  return req.query.provider || 'google-calendar';
}

// ── executeAction wrapper ─────────────────────────────────────────────────────
async function runAction(req, res, next, { actionType, payload }) {
  const isRead = String(actionType).toLowerCase() === 'read';
  try {
    const { result, timelineEvent } = await executeAction({
      workspaceId: req.workspaceId,
      connectorId: resolveProvider(req),
      actionType,
      payload,
      actor:       req.user,
      orgPlan:     req.govContext?.orgPlan ?? 'free',
    });
    // Live calendar returned nothing but the workspace has ingested meeting data →
    // serve that with provenance (workspace-aware policy) instead of an empty list.
    if (isRead && Array.isArray(result) && result.length === 0) {
      const ing = await _ingestedMeetingsFallback(req.workspaceId, payload);
      if (ing) return res.json({ success: true, result: ing, sourceMode: 'certification' });
    }
    res.json({ success: true, result, timelineEvent });
  } catch (err) {
    // Calendar not authenticated → check ingested data before "connect Calendar".
    // READ list actions only; create/update/delete still fail honestly.
    if (isRead) {
      try {
        const ing = await _ingestedMeetingsFallback(req.workspaceId, payload);
        if (ing) return res.json({ success: true, result: ing, sourceMode: 'certification' });
      } catch { /* fall through to the real error */ }
    }
    next(err);
  }
}

// Map a meeting READ to ingested calendar data. Only list reads (upcoming/past) have
// an ingested equivalent; single-event / context reads fall through to the honest error.
async function _ingestedMeetingsFallback(workspaceId, payload) {
  if (payload?.eventId) return null;
  const { ingestedMeetings } = await import('../services/certification/ingestedReads.js');
  return await ingestedMeetings(workspaceId, { limit: payload?.limit || 25 });
}

// ── GET /api/meetings/oauth/callback ─────────────────────────────────────────
// Google redirects here after the user grants consent.
router.get('/oauth/callback', async (req, res) => {
  const { code, state, error } = req.query;
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

  if (error) {
    const params = new URLSearchParams({ oauth_error: error, provider: 'google-calendar' });
    return res.redirect(`${frontendUrl}/setup?${params}`);
  }
  if (!code)  { return res.redirect(`${frontendUrl}/setup?oauth_error=no_code&provider=google-calendar`); }
  if (!state) { return res.redirect(`${frontendUrl}/setup?oauth_error=no_state&provider=google-calendar`); }

  try {
    // Must match exactly what was sent to Google during initiation.
    // Use GOOGLE_REDIRECT_BASE so the URI is stable even when Vite proxy rewrites Host.
    const base = process.env.GOOGLE_REDIRECT_BASE || `http://localhost:${process.env.PORT || 5001}`;
    const callbackUrl = `${base}/api/meetings/oauth/callback`;

    console.log('[MeetingRoutes/callback] [1] Exchanging authorization code for tokens');
    const { workspaceId } = await handleCallback(code, state, { redirectUri: callbackUrl });
    console.log('[MeetingRoutes/callback] [2] Tokens stored in PostgreSQL for workspace:', workspaceId);

    // Bridge: register in in-memory credentialStore so listConnectedConnectors() reflects the
    // connection immediately. Both connectors share one Google OAuth token.
    storeOAuthTokens(workspaceId, 'gmail', { stored: true, provider: 'google' });
    storeOAuthTokens(workspaceId, 'google-calendar', { stored: true, provider: 'google' });
    console.log('[MeetingRoutes/callback] [3] Registered gmail + google-calendar in connector store');

    return res.redirect(`${frontendUrl}/setup?calendarConnected=true`);
  } catch (err) {
    console.error('[MeetingRoutes/callback] OAuth callback failed at token exchange:', err.message);
    const params = new URLSearchParams({ oauth_error: 'exchange_failed', provider: 'google-calendar' });
    return res.redirect(`${frontendUrl}/setup?${params}`);
  }
});

// ── GET /api/meetings/status ──────────────────────────────────────────────────
router.get('/status', async (req, res, next) => {
  try {
    const provider = resolveProvider(req);
    const meta     = await getTokenMeta(req.workspaceId);
    res.json({
      provider,
      connected:   !!meta,
      email:       meta?.email       || null,
      connectedAt: meta?.connectedAt || null,
    });
  } catch (err) { next(err); }
});

// ── GET /api/meetings/upcoming ────────────────────────────────────────────────
router.get('/upcoming', (req, res, next) =>
  runAction(req, res, next, {
    actionType: 'read',
    payload: {
      days:  Number(req.query.days)  || 7,
      limit: Number(req.query.limit) || 20,
    },
  })
);

// ── GET /api/meetings/past ────────────────────────────────────────────────────
router.get('/past', (req, res, next) =>
  runAction(req, res, next, {
    actionType: 'read',
    payload: {
      past:  true,
      days:  Number(req.query.days)  || 30,
      limit: Number(req.query.limit) || 20,
    },
  })
);

// ── GET /api/meetings/event/:eventId ─────────────────────────────────────────
router.get('/event/:eventId', (req, res, next) =>
  runAction(req, res, next, {
    actionType: 'read',
    payload: { eventId: req.params.eventId },
  })
);

// ── GET /api/meetings/event/:eventId/context ──────────────────────────────────
// AI meeting prep: fetches the event then runs the RAG pipeline against workspace
// memory to surface relevant decisions, risks, and context from prior meetings.
router.get('/event/:eventId/context', async (req, res, next) => {
  try {
    // 1. Fetch the calendar event via executeAction for governance compliance
    const { result: meeting } = await executeAction({
      workspaceId: req.workspaceId,
      connectorId: resolveProvider(req),
      actionType:  'read',
      payload:     { eventId: req.params.eventId },
      actor:       req.user,
      orgPlan:     req.govContext?.orgPlan ?? 'free',
    });

    // 2. Build a rich query from meeting metadata
    const attendeeNames = (meeting.participants || [])
      .map(p => p.name || p.email)
      .filter(Boolean)
      .slice(0, 5)
      .join(', ');

    const queryText = [
      meeting.title,
      attendeeNames ? `Attendees: ${attendeeNames}` : '',
      meeting.agenda ? meeting.agenda.slice(0, 200) : '',
    ].filter(Boolean).join('. ');

    const queryTraceId = generateQueryTraceId();

    // 3. RAG retrieval
    const rawResults = await retrieveContext(req.workspaceId, queryText, queryTraceId);
    const normalizedChunks = rawResults.map(r => ({
      ...r,
      text:   r.content || r.markdown || '',
      source: r.source  || r.platform || 'unknown',
    }));

    // 4. Critic + memory boost
    const { validatedChunks, criticSummary } = evaluateContext(normalizedChunks, queryText);
    const boostedChunks = validatedChunks.map(c => ({
      ...c,
      finalScore: (c.weightedScore || c.score || 0) + (c.authorityCoeff >= 1.5 ? 0.15 : 0),
    }));

    // 5. Executive synthesis for meeting prep brief
    const routerResult  = routeQuery(queryText);
    const synthesisResult = await synthesize(queryText, boostedChunks, routerResult, criticSummary);

    // 6. Build structured prep context
    const prepContext = {
      meeting,
      aiPrep: synthesisResult.answer,
      relatedChunks: boostedChunks.slice(0, 5).map(c => ({
        source:    c.source,
        excerpt:   (c.text || '').slice(0, 200),
        score:     c.finalScore,
        timestamp: c.timestamp,
      })),
      suggestedQuestions: _deriveQuestions(meeting, boostedChunks),
      queryTraceId,
    };

    res.json({ success: true, result: prepContext });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/meetings/search ─────────────────────────────────────────────────
router.post('/search', (req, res, next) => {
  const { query, limit } = req.body;
  if (!query?.trim()) return next(new ValidationError('query is required'));
  runAction(req, res, next, {
    actionType: 'search',
    payload:    { query: query.trim(), limit: Number(limit) || 20 },
  });
});

// ── POST /api/meetings/create ─────────────────────────────────────────────────
router.post('/create', (req, res, next) => {
  const { title, startTime, endTime } = req.body;
  if (!title)     return next(new ValidationError('title is required'));
  if (!startTime) return next(new ValidationError('startTime is required'));
  if (!endTime)   return next(new ValidationError('endTime is required'));
  runAction(req, res, next, {
    actionType: 'create',
    payload:    req.body,
  });
});

// ── PATCH /api/meetings/event/:eventId ────────────────────────────────────────
router.patch('/event/:eventId', (req, res, next) =>
  runAction(req, res, next, {
    actionType: 'update',
    payload:    { ...req.body, eventId: req.params.eventId },
  })
);

// ── DELETE /api/meetings/event/:eventId ───────────────────────────────────────
router.delete('/event/:eventId', (req, res, next) =>
  runAction(req, res, next, {
    actionType: 'delete',
    payload:    { eventId: req.params.eventId },
  })
);

// ── POST /api/meetings/event/:eventId/notes ───────────────────────────────────
router.post('/event/:eventId/notes', (req, res, next) => {
  if (!req.body.notes) return next(new ValidationError('notes is required'));
  runAction(req, res, next, {
    actionType: 'update',
    payload: { eventId: req.params.eventId, notes: req.body.notes },
  });
});

// ── POST /api/meetings/event/:eventId/actions ─────────────────────────────────
// Body: { actions: [{ text, owner, deadline }] }
router.post('/event/:eventId/actions', (req, res, next) => {
  if (!Array.isArray(req.body.actions)) return next(new ValidationError('actions must be an array'));
  runAction(req, res, next, {
    actionType: 'update',
    payload: { eventId: req.params.eventId, actions: req.body.actions },
  });
});

// ── POST /api/meetings/event/:eventId/summary ─────────────────────────────────
// Body: { summary, decisions?, actions? }
router.post('/event/:eventId/summary', (req, res, next) => {
  if (!req.body.summary) return next(new ValidationError('summary is required'));
  runAction(req, res, next, {
    actionType: 'update',
    payload: {
      eventId:        req.params.eventId,
      meetingSummary: req.body.summary,
      actions:        req.body.actions  || undefined,
      notes:          req.body.notes    || undefined,
    },
  });
});

// ── POST /api/meetings/sync ───────────────────────────────────────────────────
router.post('/sync', (req, res, next) =>
  runAction(req, res, next, {
    actionType: 'sync',
    payload: {
      days:  Number(req.body.days)  || 7,
      limit: Number(req.body.limit) || 50,
    },
  })
);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function _deriveQuestions(meeting, chunks) {
  const questions = [];

  // Agenda-driven questions
  if (meeting.agenda) {
    const lines = meeting.agenda.split(/[\n.!?]+/).filter(l => l.trim().length > 10);
    for (const line of lines.slice(0, 2)) {
      questions.push(`What is the current status of: ${line.trim()}?`);
    }
  }

  // Contradiction-driven questions
  const contradictions = chunks.filter(c => c.deprecated);
  if (contradictions.length) {
    questions.push('Have the previously recorded decisions on this topic been superseded?');
  }

  // Participant-driven
  if (meeting.participants?.length > 3) {
    questions.push('What are the open blockers from each team represented in this meeting?');
  }

  // Default fallback
  if (questions.length === 0) {
    questions.push(
      `What are the key risks related to "${meeting.title}"?`,
      'What decisions need to be made today?'
    );
  }

  return questions.slice(0, 4);
}

export default router;
