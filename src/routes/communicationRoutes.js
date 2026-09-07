/**
 * FLOW OS — Communication Capability Routes
 *
 * REST API for the Communication Capability.
 * Gmail is the first provider; future providers share these routes via ?provider=.
 *
 * Every mutating action flows through executeAction() — governance, audit, timeline.
 * Read actions also flow through executeAction() for full audit coverage.
 *
 * Route map:
 *   GET  /api/communication/oauth/callback           — Google OAuth redirect handler
 *   GET  /api/communication/inbox                    — inbox listing
 *   GET  /api/communication/thread/:threadId         — full thread
 *   GET  /api/communication/message/:messageId       — single message (full body)
 *   GET  /api/communication/labels                   — list Gmail labels
 *   POST /api/communication/search                   — Gmail search
 *   POST /api/communication/send                     — send new email
 *   POST /api/communication/reply/:messageId         — reply to message
 *   POST /api/communication/reply-all/:messageId     — reply all to message
 *   POST /api/communication/forward/:messageId       — forward message
 *   POST /api/communication/draft                    — create draft
 *   PATCH /api/communication/label/:id               — modify labels on message/thread
 *   POST /api/communication/sync                     — sync inbox to ingestion pipeline
 */

import express from 'express';
import { executeAction } from '../connectors/executionEngine.js';
import { hasTokens, getTokenMeta } from '../services/google/GoogleTokenManager.js';
import { handleCallback } from '../services/google/GoogleOAuthService.js';
import { storeOAuthTokens } from '../connectors/authManager.js';
import { getConnector } from '../connectors/registry.js';
import { ValidationError } from '../core/errors/index.js';

const router = express.Router();

// ── Workspace-id guard ────────────────────────────────────────────────────────
router.use((req, res, next) => {
  // OAuth callback is exempt — workspaceId comes from state param
  if (req.path === '/oauth/callback') return next();

  const workspaceId = req.headers['workspace-id'] || req.tenantId;
  if (!workspaceId) {
    return res.status(400).json({
      error: { code: 'MISSING_WORKSPACE', message: 'workspace-id header is required' },
    });
  }
  req.workspaceId = workspaceId;
  next();
});

// ── Provider resolution helper ────────────────────────────────────────────────
function resolveProvider(req) {
  return req.query.provider || 'gmail';
}

// ── Shared executeAction wrapper for communication actions ────────────────────
async function runAction(req, res, next, { actionType, payload }) {
  try {
    const { result, timelineEvent } = await executeAction({
      workspaceId: req.workspaceId,
      connectorId: resolveProvider(req),
      actionType,
      payload,
      actor:       req.user,
      orgPlan:     req.govContext?.orgPlan ?? 'free',
    });
    // Live connector returned nothing but the workspace has ingested email data →
    // serve that with provenance (workspace-aware policy) instead of an empty inbox.
    if (String(actionType).toLowerCase() === 'read' && Array.isArray(result) && result.length === 0) {
      const ing = await _ingestedInboxFallback(req.workspaceId, payload);
      if (ing) return res.json({ success: true, result: ing, sourceMode: 'certification' });
    }
    res.json({ success: true, result, timelineEvent });
  } catch (err) {
    // Gmail not authenticated → check ingested data before surfacing "connect Gmail".
    // READs only; sends/replies still fail honestly.
    if (String(actionType).toLowerCase() === 'read') {
      try {
        const ing = await _ingestedInboxFallback(req.workspaceId, payload);
        if (ing) return res.json({ success: true, result: ing, sourceMode: 'certification' });
      } catch { /* fall through to the real error */ }
    }
    next(err);
  }
}

// Map a communication READ to ingested inbox data. Only the inbox listing has an
// ingested equivalent; thread/message/label reads fall through to the honest error.
async function _ingestedInboxFallback(workspaceId, payload) {
  const rt = payload?.resourceType;
  if (rt && rt !== 'messages' && rt !== 'inbox') return null;
  if (payload?.threadId || payload?.messageId) return null;
  const { ingestedInbox } = await import('../services/certification/ingestedReads.js');
  return await ingestedInbox(workspaceId, { limit: payload?.limit || 25 });
}

// ── GET /api/communication/oauth/callback ─────────────────────────────────────
// Google redirects here after the user grants consent.
// Exchanges the code for tokens, stores them, then redirects to the frontend.
router.get('/oauth/callback', async (req, res) => {
  const { code, state, error } = req.query;

  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

  // Google sends error=access_denied when the user is not a Test User (app in Testing
  // mode) or when the user explicitly cancels consent. Redirect to the setup page with
  // a structured error param — never expose raw Google error strings to the user.
  if (error) {
    const params = new URLSearchParams({ oauth_error: error, provider: 'gmail' });
    return res.redirect(`${frontendUrl}/setup?${params}`);
  }
  if (!code)  { return res.redirect(`${frontendUrl}/setup?oauth_error=no_code&provider=gmail`); }
  if (!state) { return res.redirect(`${frontendUrl}/setup?oauth_error=no_state&provider=gmail`); }

  try {
    // Must match exactly what was sent to Google during initiation.
    // Use GOOGLE_REDIRECT_BASE so the URI is stable even when Vite proxy rewrites Host.
    const base = process.env.GOOGLE_REDIRECT_BASE || `http://localhost:${process.env.PORT || 5001}`;
    const callbackUrl = `${base}/api/communication/oauth/callback`;

    console.log('[CommunicationRoutes/callback] [1] Exchanging authorization code for tokens');
    const { workspaceId } = await handleCallback(code, state, { redirectUri: callbackUrl });
    console.log('[CommunicationRoutes/callback] [2] Tokens stored in PostgreSQL for workspace:', workspaceId);

    // Bridge: register in in-memory credentialStore so listConnectedConnectors() reflects the
    // connection immediately. Both gmail and google-calendar share one Google OAuth token; both
    // connectors become available once Google OAuth completes for the workspace.
    storeOAuthTokens(workspaceId, 'gmail', { stored: true, provider: 'google' });
    storeOAuthTokens(workspaceId, 'google-calendar', { stored: true, provider: 'google' });
    console.log('[CommunicationRoutes/callback] [3] Registered gmail + google-calendar in connector store');

    return res.redirect(`${frontendUrl}/setup?gmailConnected=true`);
  } catch (err) {
    console.error('[CommunicationRoutes/callback] OAuth callback failed at token exchange:', err.message);
    const params = new URLSearchParams({ oauth_error: 'exchange_failed', provider: 'gmail' });
    return res.redirect(`${frontendUrl}/setup?${params}`);
  }
});

// ── GET /api/communication/inbox ──────────────────────────────────────────────
router.get('/inbox', (req, res, next) =>
  runAction(req, res, next, {
    actionType: 'read',
    payload: {
      folder:    req.query.folder    || 'INBOX',
      limit:     Number(req.query.limit)  || 20,
      pageToken: req.query.pageToken || undefined,
      q:         req.query.q         || undefined,
    },
  })
);

// ── GET /api/communication/thread/:threadId ───────────────────────────────────
router.get('/thread/:threadId', (req, res, next) =>
  runAction(req, res, next, {
    actionType: 'read',
    payload: { threadId: req.params.threadId },
  })
);

// ── GET /api/communication/message/:messageId ─────────────────────────────────
router.get('/message/:messageId', (req, res, next) =>
  runAction(req, res, next, {
    actionType: 'read',
    payload: { messageId: req.params.messageId },
  })
);

// ── GET /api/communication/labels ─────────────────────────────────────────────
router.get('/labels', (req, res, next) =>
  runAction(req, res, next, {
    actionType: 'read',
    payload: { action: 'list_labels' },
  })
);

// ── POST /api/communication/search ────────────────────────────────────────────
router.post('/search', async (req, res, next) => {
  const { query, limit } = req.body;
  if (!query?.trim()) return next(new ValidationError('query is required'));

  runAction(req, res, next, {
    actionType: 'search',
    payload: { query: query.trim(), limit: Number(limit) || 20 },
  });
});

// ── POST /api/communication/send ──────────────────────────────────────────────
router.post('/send', (req, res, next) => {
  const { to, subject } = req.body;
  if (!to)      return next(new ValidationError('to is required'));
  if (!subject) return next(new ValidationError('subject is required'));

  runAction(req, res, next, {
    actionType: 'send',
    payload: {
      to:       req.body.to,
      cc:       req.body.cc,
      bcc:      req.body.bcc,
      subject:  req.body.subject,
      body:     req.body.body,
      bodyHtml: req.body.bodyHtml,
    },
  });
});

// ── POST /api/communication/reply/:messageId ──────────────────────────────────
router.post('/reply/:messageId', (req, res, next) =>
  runAction(req, res, next, {
    actionType: 'send',
    payload: {
      inReplyTo: req.params.messageId,
      to:        req.body.to,
      subject:   req.body.subject,
      body:      req.body.body,
      bodyHtml:  req.body.bodyHtml,
      replyAll:  false,
    },
  })
);

// ── POST /api/communication/reply-all/:messageId ──────────────────────────────
router.post('/reply-all/:messageId', (req, res, next) =>
  runAction(req, res, next, {
    actionType: 'send',
    payload: {
      inReplyTo: req.params.messageId,
      to:        req.body.to,
      subject:   req.body.subject,
      body:      req.body.body,
      bodyHtml:  req.body.bodyHtml,
      replyAll:  true,
    },
  })
);

// ── POST /api/communication/forward/:messageId ────────────────────────────────
router.post('/forward/:messageId', (req, res, next) => {
  if (!req.body.to) return next(new ValidationError('to is required for forward'));

  runAction(req, res, next, {
    actionType: 'send',
    payload: {
      forward:          true,
      forwardMessageId: req.params.messageId,
      to:               req.body.to,
      cc:               req.body.cc,
      body:             req.body.body,
    },
  });
});

// ── POST /api/communication/draft ─────────────────────────────────────────────
router.post('/draft', (req, res, next) =>
  runAction(req, res, next, {
    actionType: 'create',
    payload: {
      to:       req.body.to,
      cc:       req.body.cc,
      subject:  req.body.subject,
      body:     req.body.body,
      bodyHtml: req.body.bodyHtml,
    },
  })
);

// ── PATCH /api/communication/label/:id ────────────────────────────────────────
// Body: { type: 'message'|'thread', addLabels: [], removeLabels: [], action: 'archive'|'markRead'|... }
router.patch('/label/:id', (req, res, next) => {
  const isThread  = req.body.type === 'thread';
  runAction(req, res, next, {
    actionType: 'update',
    payload: {
      messageId:    isThread ? undefined : req.params.id,
      threadId:     isThread ? req.params.id : undefined,
      addLabels:    req.body.addLabels    || [],
      removeLabels: req.body.removeLabels || [],
      action:       req.body.action,
    },
  });
});

// ── POST /api/communication/sync ──────────────────────────────────────────────
router.post('/sync', (req, res, next) =>
  runAction(req, res, next, {
    actionType: 'sync',
    payload: {
      limit:    Number(req.body.limit)  || 25,
      q:        req.body.q              || 'is:unread',
      markRead: req.body.markRead       ?? false,
    },
  })
);

// ── GET /api/communication/status ─────────────────────────────────────────────
// Quick connection status check — does NOT go through executeAction.
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

export default router;
