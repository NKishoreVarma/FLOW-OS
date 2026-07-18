/**
 * Google OAuth Routes — unified entry point for all Google integrations.
 *
 * Mounted at /api/google in server.js.
 *
 * Route map:
 *   GET  /api/google/status       — connection status (JWT + workspace-id)
 *   GET  /api/google/auth         — generate OAuth consent URL (JWT + workspace-id)
 *   GET  /api/google/callback     — OAuth redirect handler (no auth — Google redirects here)
 *   POST /api/google/disconnect   — revoke + delete tokens (JWT + workspace-id)
 *   POST /api/google/reconnect    — clear + re-auth (JWT + workspace-id)
 *   GET  /api/google/services     — list which services are accessible (JWT + workspace-id)
 *   GET  /api/google/health       — connectivity test via People API (JWT + workspace-id)
 */

import express          from 'express';
import { getAuthUrl, handleCallback, getStatus, disconnect, reconnect, validateCredentials } from '../services/google/GoogleOAuthService.js';
import { healthCheck }  from '../services/google/GoogleServiceLayer.js';
import { hasTokens }    from '../services/google/GoogleTokenManager.js';
import { AppError }     from '../core/errors/index.js';

const router = express.Router();

// ── Workspace guard (all routes except /callback) ─────────────────────────────
router.use((req, res, next) => {
  if (req.path === '/callback') return next();

  const workspaceId = req.headers['workspace-id'] || req.tenantId;
  if (!workspaceId) {
    return res.status(400).json({
      error: { code: 'MISSING_WORKSPACE', message: 'workspace-id header is required' },
    });
  }
  req.workspaceId = workspaceId;
  next();
});

// ── GET /api/google/status ────────────────────────────────────────────────────
router.get('/status', async (req, res, next) => {
  try {
    const status = await getStatus(req.workspaceId);
    res.json({ success: true, ...status });
  } catch (err) { next(err); }
});

// ── GET /api/google/auth ──────────────────────────────────────────────────────
// Returns a consent URL. The client should redirect (or open a popup) to authUrl.
router.get('/auth', (req, res, next) => {
  try {
    const redirectUri = req.query.redirectUri || process.env.GOOGLE_REDIRECT_URI;
    const { authUrl } = getAuthUrl(req.workspaceId, { redirectUri });
    res.json({ success: true, authUrl });
  } catch (err) { next(err); }
});

// ── GET /api/google/callback ──────────────────────────────────────────────────
// Google redirects here with ?code=...&state=...
// No JWT required — this is a public redirect endpoint.
router.get('/callback', async (req, res) => {
  const { code, state, error } = req.query;

  if (error) {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    return res.redirect(`${frontendUrl}/platform/integrations?error=${encodeURIComponent(error)}`);
  }

  if (!code || !state) {
    return res.status(400).send('Missing code or state parameter');
  }

  try {
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || `http://localhost:5001/api/google/callback`;
    const { workspaceId, email } = await handleCallback(code, state, { redirectUri });

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const dest = `${frontendUrl}/platform/integrations?googleConnected=true&email=${encodeURIComponent(email || '')}`;
    return res.redirect(dest);
  } catch (err) {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    return res.redirect(`${frontendUrl}/platform/integrations?error=${encodeURIComponent(err.message)}`);
  }
});

// ── POST /api/google/disconnect ───────────────────────────────────────────────
router.post('/disconnect', async (req, res, next) => {
  try {
    const result = await disconnect(req.workspaceId);
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
});

// ── POST /api/google/reconnect ────────────────────────────────────────────────
// Clears stored tokens, revokes them on Google's side, returns a new consent URL.
router.post('/reconnect', async (req, res, next) => {
  try {
    const redirectUri  = req.query.redirectUri || process.env.GOOGLE_REDIRECT_URI;
    const { authUrl }  = await reconnect(req.workspaceId, { redirectUri });
    res.json({ success: true, authUrl });
  } catch (err) { next(err); }
});

// ── GET /api/google/validate ──────────────────────────────────────────────────
// Probe the token against the userinfo endpoint; persist health status.
router.get('/validate', async (req, res, next) => {
  try {
    const result = await validateCredentials(req.workspaceId);
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
});

// ── GET /api/google/services ──────────────────────────────────────────────────
// Returns which Google services are available (all share one OAuth token).
router.get('/services', async (req, res, next) => {
  try {
    const connected = await hasTokens(req.workspaceId);
    res.json({
      success: true,
      connected,
      services: connected
        ? ['gmail', 'calendar', 'drive', 'docs', 'sheets', 'people']
        : [],
    });
  } catch (err) { next(err); }
});

// ── GET /api/google/health ────────────────────────────────────────────────────
router.get('/health', async (req, res, next) => {
  try {
    const result = await healthCheck(req.workspaceId);
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
});

export default router;
