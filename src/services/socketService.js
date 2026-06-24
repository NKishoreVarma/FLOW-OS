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
import { evaluateActionTriggers } from './actionOrchestrator.js';

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

  wss.on('connection', (socket, request) => {
    // Parse workspaceId from the connection URL query string
    // e.g.  ws://localhost:5000?workspaceId=123
    const { query } = parseUrl(request.url, true);
    const workspaceId = query.workspaceId ? String(query.workspaceId) : null;

    if (!workspaceId) {
      socket.close(1008, 'Missing workspaceId — connection rejected.');
      return;
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

export { initSocketServer, broadcastToWorkspace };
