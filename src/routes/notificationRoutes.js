/**
 * FLOW OS — Workspace Notification Routes (Phase 14 M3)
 *
 * JWT + workspace-id. Notifications are permission-filtered: a user only sees
 * notifications they are a recipient of (or workspace broadcasts).
 *
 *   GET  /api/notifications              list (priority-ranked, deduped, permission-filtered)
 *   GET  /api/notifications/unread-count unread count for the current user
 *   POST /api/notifications/:id/read     mark one read
 */

import express from 'express';
import { listNotifications, unreadCount, markRead } from '../notifications/notificationEngine.js';

const router = express.Router();

router.use((req, res, next) => {
  if (!req.tenantId) {
    return res.status(400).json({ error: { code: 'MISSING_WORKSPACE', message: 'workspace-id header is required' } });
  }
  next();
});

function userOf(req) {
  const email = req.user?.email;
  return { id: req.user?.id, email, login: email ? String(email).split('@')[0] : undefined };
}

router.get('/', async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const unreadOnly = req.query.unread === 'true';
    const notifications = await listNotifications(req.tenantId, userOf(req), { limit, unreadOnly });
    res.json({ notifications, total: notifications.length });
  } catch (err) { next(err); }
});

router.get('/unread-count', async (req, res, next) => {
  try {
    res.json({ count: await unreadCount(req.tenantId, userOf(req)) });
  } catch (err) { next(err); }
});

router.post('/:id/read', async (req, res, next) => {
  try {
    const updated = await markRead(req.params.id, req.tenantId, req.user?.id);
    if (!updated) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Notification not found' } });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
