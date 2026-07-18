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
import { hasTokens } from '../services/google/GoogleTokenManager.js';
import { handleCallback } from '../services/google/GoogleOAuthService.js';
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
    res.json({ success: true, result, timelineEvent });
  } catch (err) {
    next(err);
  }
}

// ── GET /api/communication/oauth/callback ─────────────────────────────────────
// Google redirects here after the user grants consent.
// Exchanges the code for tokens, stores them, then redirects to the frontend.
router.get('/oauth/callback', async (req, res) => {
  const { code, state, error } = req.query;

  if (error) return res.status(400).send(`OAuth denied: ${error}`);
  if (!code)  return res.status(400).send('Missing OAuth code');
  if (!state) return res.status(400).send('Missing OAuth state');

  try {
    const callbackUrl = `${req.protocol}://${req.get('host')}/api/communication/oauth/callback`;
    await handleCallback(code, state, { redirectUri: callbackUrl });

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    return res.redirect(`${frontendUrl}/platform/integrations?gmailConnected=true`);
  } catch (err) {
    console.error('[CommunicationRoutes] OAuth callback failed:', err.message);
    return res.status(500).send(`OAuth exchange failed: ${err.message}`);
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
