/**
 * useWorkspaceState — single source of truth for workspace readiness.
 *
 * Four phases drive the entire home experience:
 *   UNINITIALIZED → show SetupWizard (no tools, never set up)
 *   CONNECTING    → show SetupWizard (tools in progress, required ones not done)
 *   INDEXING      → show IndexingProgress (sync running, AI not yet ready)
 *   READY         → show Morning Brief (full experience)
 *
 * Polls every 5 s when INDEXING so the UI advances to READY automatically.
 */

import { useState, useEffect, useRef } from 'react';

const CACHE_KEY  = 'flow_ws_state_v2';
const CACHE_TTL  = 20 * 1000;   // 20 s — frequent re-check so new connections surface quickly
const POLL_MS    = 10000;        // poll every 10 s whenever NOT READY

export function invalidateWorkspaceState() {
  try { sessionStorage.removeItem(CACHE_KEY); } catch {}
}

function authHdrs() {
  const token = localStorage.getItem('flow_os_token') || localStorage.getItem('flow_token') || '';
  const wsId  = localStorage.getItem('flow_os_workspace_id') || '';
  return { Authorization: `Bearer ${token}`, 'workspace-id': wsId };
}

function loadCache() {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL) { sessionStorage.removeItem(CACHE_KEY); return null; }
    return data;
  } catch { return null; }
}

function saveCache(data) {
  try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ data, ts: Date.now() })); } catch {}
}

const DEFAULT = {
  workspaceMode:         'real',
  workspacePhase:        'UNINITIALIZED',
  connectedCount:        0,
  connectedConnectors:   [],
  isFirstRun:            true,
  onboardingComplete:    false,
  role:                  null,
  step:                  'welcome',
  buildImportId:         null,
  syncStartedAt:         null,
  readinessPercent:      0,
  minConnectorsRequired: 3,
  loading:               true,
};

export function useWorkspaceState() {
  const [state, setState] = useState(DEFAULT);
  const pollRef           = useRef(null);

  async function fetch_() {
    try {
      const r = await fetch('/api/onboarding/workspace-state', { headers: authHdrs() });
      if (!r.ok) throw new Error(String(r.status));
      const data = await r.json();
      saveCache(data);
      setState({ ...data, loading: false });
      return data;
    } catch {
      // Fallback: check integrations-hub for connector count
      try {
        const r2 = await fetch('/api/integrations-hub/status', { headers: authHdrs() });
        if (r2.ok) {
          const s = await r2.json();
          const connected = s.integrations
            ? Object.entries(s.integrations).filter(([, v]) => v?.connected).map(([k]) => k)
            : [];
          const fallback = {
            ...DEFAULT,
            workspaceMode:       'real',
            workspacePhase:      connected.length > 0 ? 'CONNECTING' : 'UNINITIALIZED',
            connectedCount:      connected.length,
            connectedConnectors: connected,
            onboardingComplete:  false,
            readinessPercent:    Math.min(100, Math.round((connected.length / 3) * 100)),
            loading:             false,
          };
          setState(fallback);
          return fallback;
        }
      } catch {}
      // Complete fallback — fail open, never block
      setState(prev => ({ ...prev, loading: false }));
      return null;
    }
  }

  function stopPolling() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }

  function startPolling() {
    stopPolling();
    pollRef.current = setInterval(async () => {
      invalidateWorkspaceState();
      const data = await fetch_();
      if (data?.workspacePhase === 'READY') stopPolling();
    }, POLL_MS);
  }

  useEffect(() => {
    // Always trust the server — no localStorage fast-path bypasses.
    // Dev-only certification mode: never use the (workspace-agnostic) session cache,
    // which can hold a stale corp-alpha phase and wrongly force /setup. Always fetch
    // the real Helios workspace-state. Inert unless VITE_CERT_WORKSPACE is set.
    const certMode = !!import.meta.env.VITE_CERT_WORKSPACE;
    if (certMode) {
      try { sessionStorage.removeItem(CACHE_KEY); } catch { /* ignore */ }
    }

    const cached = certMode ? null : loadCache();
    if (cached) {
      setState({ ...cached, loading: false });
      if (cached.workspacePhase !== 'READY') startPolling();
      return;
    }

    fetch_().then(data => {
      if (data && data.workspacePhase !== 'READY') startPolling();
    });

    return () => stopPolling();
  }, []); // eslint-disable-line

  return state;
}
