/**
 * FLOW OS — Workspace-Isolated WebSocket Event Service
 *
 * Written as CommonJS so it can be require()'d by the CJS ingestion worker
 * AND imported as an ESM default from the ESM cognitive brain service,
 * without creating duplicate socket server instances.
 *
 * Architecture:
 *   Map<workspaceId (string), Set<WebSocket>> workspaceClients
 *
 * Public API:
 *   initSocketServer(httpServer)  — called once at server boot
 *   broadcastToWorkspace(workspaceId, eventType, dataPayload)
 */

'use strict';

import { WebSocketServer, WebSocket } from 'ws';
import { parse as parseUrl } from 'url';
import jwt from 'jsonwebtoken';
import { evaluateActionTriggers } from './actionOrchestrator.js';

// Verify a WebSocket upgrade: the caller must present a JWT (query ?token= or
// Authorization: Bearer) whose org owns the requested workspace. Enforced in
// production (or WS_AUTH_REQUIRED=true); dev allows unauthenticated with a warning
// so local/frontend clients keep working until they pass a token.
async function authenticateSocket(request, workspaceId) {
  const enforce = process.env.WS_AUTH_REQUIRED === 'true' || process.env.NODE_ENV === 'production';
  const { query } = parseUrl(request.url, true);
  const bearer = request.headers?.authorization?.startsWith('Bearer ') ? request.headers.authorization.slice(7) : null;
  const token = query.token || bearer;

  if (!token) return enforce ? { ok: false, reason: 'missing token' } : { ok: true, user: null, unauthenticated: true };

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const { prisma } = await import('../core/config/prisma.js');
    const ws = await prisma.workspace.findFirst({ where: { externalId: String(workspaceId) }, select: { orgId: true } }).catch(() => null);
    if (ws && ws.orgId !== decoded.orgId) return { ok: false, reason: 'workspace not in token org' };
    if (!ws && enforce) return { ok: false, reason: 'unknown workspace' };
    return { ok: true, user: { id: decoded.userId, orgId: decoded.orgId, role: decoded.role } };
  } catch {
    return { ok: false, reason: 'invalid token' };
  }
}

// ── Workspace-isolated client registry ────────────────────────────────────────
// Key  : workspaceId (always stored as string for consistent lookup)
// Value: Set of live WebSocket instances for that workspace
const workspaceClients = new Map();

/** @type {WebSocketServer|null} */
let wss = null;

// ── Helper: safely remove a socket from its workspace slot ────────────────────
function evictSocket(workspaceId, socket) {
  const slot = workspaceClients.get(workspaceId);
  if (!slot) return;
  slot.delete(socket);
  if (slot.size === 0) {
    workspaceClients.delete(workspaceId);
  }
}

// ── initSocketServer ──────────────────────────────────────────────────────────
/**
 * Wraps the existing Express HTTP server with a WebSocket server.
 * Must be called exactly once at application boot, after app.listen().
 *
 * @param {import('http').Server} httpServer — the return value of app.listen()
 */
function initSocketServer(httpServer) {
  if (wss) {
    console.warn('[Socket Service] initSocketServer called more than once — skipping duplicate init.');
    return;
  }

  wss = new WebSocketServer({ server: httpServer });

  wss.on('connection', async (socket, request) => {
    // Parse workspaceId from the connection URL query string
    // e.g.  ws://localhost:5000?workspaceId=123&token=<jwt>
    const { query } = parseUrl(request.url, true);
    const workspaceId = query.workspaceId ? String(query.workspaceId) : null;

    if (!workspaceId) {
      socket.close(1008, 'Missing workspaceId — connection rejected.');
      return;
    }

    // Authenticate: the JWT's org must own this workspace (prevents any client
    // from subscribing to another tenant's real-time stream).
    const auth = await authenticateSocket(request, workspaceId);
    if (!auth.ok) {
      console.warn(`🔒 [Socket] Rejected connection to Workspace ${workspaceId}: ${auth.reason}`);
      socket.close(1008, `Unauthorized: ${auth.reason}`);
      return;
    }
    if (auth.unauthenticated) {
      console.warn(`⚠️  [Socket] UNAUTHENTICATED connection to Workspace ${workspaceId} — allowed in dev only. Set WS_AUTH_REQUIRED=true to enforce.`);
    }

    // Register socket in the workspace slot
    if (!workspaceClients.has(workspaceId)) {
      workspaceClients.set(workspaceId, new Set());
    }
    workspaceClients.get(workspaceId).add(socket);

    const slotSize = workspaceClients.get(workspaceId).size;
    console.log(`🟢 [Socket] Client joined Workspace ${workspaceId} (active connections: ${slotSize})`);

    // Send acknowledgement event on successful connect
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({
        eventType: 'CONNECTION_ACK',
        payload: {
          workspaceId,
          message: 'FLOW OS real-time stream active.'
        },
        timestamp: new Date().toISOString()
      }));
    }

    // ── Cleanup on disconnect ────────────────────────────────────────────────
    socket.on('close', () => {
      evictSocket(workspaceId, socket);
      console.log(`🔴 [Socket] Client left Workspace ${workspaceId}`);
    });

    socket.on('error', (err) => {
      console.error(`⚠️ [Socket] Error on Workspace ${workspaceId} socket:`, err.message);
      evictSocket(workspaceId, socket);
    });
  });

  wss.on('error', (err) => {
    console.error('❌ [Socket Service] WebSocket server error:', err);
  });

  console.log('🌐 [Socket Service] WebSocket server initialized and bound to HTTP server.');
}

// ── broadcastToWorkspace ──────────────────────────────────────────────────────
/**
 * Pushes a structured event to all open connections on the given workspace.
 * Silently skips if no clients are connected (fire-and-forget; never throws).
 *
 * @param {string|number} workspaceId  — corporate tenant key
 * @param {string}        eventType    — e.g. 'INTEL_STORED', 'INGESTION_START'
 * @param {Object}        dataPayload  — arbitrary serialisable event payload
 */
function broadcastToWorkspace(workspaceId, eventType, dataPayload) {
  const wsId = String(workspaceId);
  const slot = workspaceClients.get(wsId);

  if (!slot || slot.size === 0) return; // No connected clients — nothing to do

  const frame = JSON.stringify({
    eventType,
    payload: dataPayload,
    timestamp: new Date().toISOString()
  });

  let dispatched = 0;
  for (const socket of slot) {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(frame);
      dispatched++;
    }
  }

  if (dispatched > 0) {
    console.log(`📡 [Socket] '${eventType}' → Workspace ${wsId} (${dispatched} client(s))`);
  }

  // Hook into Automated Action Orchestrator (after emitting)
  // Ensure we don't trigger recursive loops on actions we just emitted
  if (eventType !== 'ACTION_EXECUTED') {
    // Fire and forget, passing an emit callback so orchestrator can broadcast results
    evaluateActionTriggers(workspaceId, eventType, dataPayload, (actionPayload) => {
      broadcastToWorkspace(workspaceId, 'ACTION_EXECUTED', actionPayload);
    }).catch(err => console.error("Action Orchestrator Error:", err));
  }
}

function getSocketStatus() {
  let clientCount = 0;
  for (const set of workspaceClients.values()) {
    clientCount += set.size;
  }
  return {
    active: wss !== null,
    workspaces: workspaceClients.size,
    clients: clientCount
  };
}

export { initSocketServer, broadcastToWorkspace, getSocketStatus };
