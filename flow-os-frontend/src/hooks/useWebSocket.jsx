/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect, useRef } from 'react';

const WebSocketContext = createContext({
  connectionStatus: 'CONNECTING',
  token: null,
  workspaceId: null,
  workspaces: [],
  switchWorkspace: () => {},
  events: [],
  isAuthLoading: true,
  currentView: 'workfeed',
  setCurrentView: () => {},
});

export const WebSocketProvider = ({ children }) => {
  const [connectionStatus, setConnectionStatus] = useState('CONNECTING');
  const [token, setToken] = useState(null);
  const [workspaceId, setWorkspaceId] = useState(null);
  const [workspaces, setWorkspaces] = useState([]);
  const [events, setEvents] = useState([]);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [currentView, setCurrentView] = useState('workfeed');

  const wsRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  // Persistent per-session dedup of live-feed items by stable business id (SHA / PR /
  // message id). Survives window eviction and reconnects, so nothing shows twice.
  const broadcastHistoryRef = useRef(new Set());

  // Silent Auto-Auth Flow
  useEffect(() => {
    async function performAuth() {
      // ── Dev-only certification entry (inert unless both env vars are set) ──────
      // When VITE_CERT_TOKEN + VITE_CERT_WORKSPACE are present (flow-os-frontend/.env.local,
      // git-ignored, never in a production build), use that real minted JWT + workspace and
      // skip the default corp-alpha silent auth entirely. Tenant isolation still applies on
      // the backend — this only chooses which legitimate identity the dev session uses.
      const certToken     = import.meta.env.VITE_CERT_TOKEN;
      const certWorkspace = import.meta.env.VITE_CERT_WORKSPACE;
      if (certToken && certWorkspace) {
        // Validate cert token before accepting — it may have expired between sessions.
        try {
          const certRes = await fetch('/api/org/workspaces', {
            headers: { 'Authorization': `Bearer ${certToken}`, 'workspace-id': 'verify' },
          });
          if (certRes.ok) {
            localStorage.setItem('flow_os_token', certToken);
            localStorage.setItem('flow_os_workspace_id', certWorkspace);
            setToken(certToken);
            setWorkspaceId(certWorkspace);
            setIsAuthLoading(false);
            return;
          }
          // Cert token expired — fall through to stored-token / login redirect
          console.warn('[auth] VITE_CERT_TOKEN expired, falling through to stored token / login');
        } catch {
          console.warn('[auth] VITE_CERT_TOKEN verification failed, falling through');
        }
      }

      const storedToken = localStorage.getItem('flow_os_token');
      const storedWorkspaceId = localStorage.getItem('flow_os_workspace_id');

      // Already on the login page — do not redirect, just signal not loading
      if (window.location.pathname === '/login') {
        setIsAuthLoading(false);
        return;
      }

      if (storedToken) {
        try {
          const res = await fetch('/api/org/workspaces', {
            headers: {
              'Authorization': `Bearer ${storedToken}`,
              'workspace-id': 'temp_verification'
            }
          });
          if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data) && data.length > 0) {
              setWorkspaces(data);
              const match = storedWorkspaceId ? data.find(w => w.externalId === storedWorkspaceId) : null;
              const activeId = match ? match.externalId : data[0].externalId;
              localStorage.setItem('flow_os_workspace_id', activeId);
              setToken(storedToken);
              setWorkspaceId(activeId);
              setIsAuthLoading(false);
              return;
            }
          }
          // Token is invalid / expired — redirect to login
          localStorage.removeItem('flow_os_token');
          localStorage.removeItem('flow_os_workspace_id');
          window.location.href = '/login';
          return;
        } catch (err) {
          console.warn('Stored token verification failed:', err);
          localStorage.removeItem('flow_os_token');
          localStorage.removeItem('flow_os_workspace_id');
          window.location.href = '/login';
          return;
        }
      }

      // No stored token — redirect to login page
      window.location.href = '/login';
    }

    performAuth();
  }, []);

  // WebSocket Connection Lifecycle
  useEffect(() => {
    if (isAuthLoading || !workspaceId) {
      if (!isAuthLoading) {
        setTimeout(() => setConnectionStatus('OFFLINE'), 0);
      }
      return;
    }

    function connect() {
      if (wsRef.current) {
        try { 
          wsRef.current.close(); 
        } catch (err) {
          console.warn('Failed to close previous WebSocket connection:', err.message);
        }
      }

      setConnectionStatus('CONNECTING');
      // Derive the WS endpoint from the page origin (works behind the Vite `/ws`
      // proxy in dev and on the deployed origin in prod), and authenticate with the
      // same JWT the REST client uses — the backend requires it when
      // WS_AUTH_REQUIRED / production is set (Phase 12 WS hardening).
      const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const jwt = localStorage.getItem('flow_os_token') || '';
      const wsUrl = `${wsProto}//${window.location.host}/ws?workspaceId=${encodeURIComponent(workspaceId)}${jwt ? `&token=${encodeURIComponent(jwt)}` : ''}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnectionStatus('ONLINE');
      };

      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);
          const eventName = msg.eventType || msg.type || msg.event || 'EVENT';
          const payload = msg.payload || msg;

          // Dedup: the poller re-fetches the same commits/PRs/emails every cycle, so
          // the SAME underlying item arrives repeatedly. We fingerprint by its stable
          // business id (SHA / PR number / message id / sourceEventId) and keep a
          // persistent broadcastHistory Set for the whole session — so an item that
          // scrolled out of the visible window can never reappear as a "new" event.
          const bizId = payload?.sourceEventId
            || payload?.metadata?.sha || payload?.metadata?.number || payload?.metadata?.messageId
            || payload?.text || payload?.id;
          const fp = `${eventName}:${payload?.source || ''}:${bizId || ''}`;

          if (bizId && broadcastHistoryRef.current.has(fp)) return; // already surfaced this session
          if (bizId) {
            broadcastHistoryRef.current.add(fp);
            // Bound the set so a long-lived session can't grow it without limit.
            if (broadcastHistoryRef.current.size > 2000) {
              broadcastHistoryRef.current = new Set([...broadcastHistoryRef.current].slice(-1000));
            }
          }

          setEvents((prev) => {
            // Real source time (commit author date, calendar start, etc.) drives the
            // panel's ordering; the receipt time is only a last-resort fallback.
            const realTs = payload?.ts || payload?.timestamp || null;
            const entry = {
              id: Date.now() + Math.random(),
              _fp: fp,
              type: eventName,
              payload,
              realTs,
              timestamp: new Date().toLocaleTimeString(),
            };
            return [entry, ...prev].slice(0, 40);
          });
        } catch (err) {
          console.warn('Received non-JSON frame from WebSocket:', err.message);
        }
      };

      ws.onclose = (evt) => {
        if (evt.code === 1008) {
          console.error('WebSocket connection rejected by policy:', evt.reason);
          setConnectionStatus('ERROR');
          return;
        }

        setConnectionStatus('RECONNECTING');
        reconnectTimerRef.current = setTimeout(connect, 3000);
      };

      ws.onerror = () => {
        setConnectionStatus('ERROR');
        ws.close();
      };
    }

    connect();

    return () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [workspaceId, isAuthLoading]);

  const switchWorkspace = (externalId) => {
    if (!externalId || externalId === workspaceId) return;
    localStorage.setItem('flow_os_workspace_id', externalId);
    setWorkspaceId(externalId);
    setEvents([]);
  };

  return (
    <WebSocketContext.Provider value={{
      connectionStatus,
      token,
      workspaceId,
      workspaces,
      switchWorkspace,
      events,
      isAuthLoading,
      currentView,
      setCurrentView
    }}>
      {children}
    </WebSocketContext.Provider>
  );
};

export const useWebSocket = () => useContext(WebSocketContext);
export default useWebSocket;
