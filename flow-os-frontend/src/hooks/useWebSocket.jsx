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

  // Silent Auto-Auth Flow
  useEffect(() => {
    async function performAuth() {
      const storedToken = localStorage.getItem('flow_os_token');
      const storedWorkspaceId = localStorage.getItem('flow_os_workspace_id');

      if (storedToken && storedWorkspaceId) {
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
              const match = data.find(w => w.externalId === storedWorkspaceId);
              const activeId = match ? match.externalId : data[0].externalId;
              localStorage.setItem('flow_os_workspace_id', activeId);
              setToken(storedToken);
              setWorkspaceId(activeId);
              setIsAuthLoading(false);
              return;
            }
          }
        } catch (err) {
          console.warn('Stored token verification failed, re-authenticating...', err);
        }
      }

      const credentials = {
        email: 'dev@flow-os.local',
        password: 'FlowOSDev123!'
      };

      try {
        let authData;
        const loginRes = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(credentials)
        });

        if (loginRes.ok) {
          authData = await loginRes.json();
        } else {
          const signupRes = await fetch('/api/auth/signup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...credentials,
              fullName: 'Kishore Varma',
              orgName: 'Corp Alpha'
            })
          });

          if (signupRes.ok) {
            authData = await signupRes.json();
          } else {
            throw new Error(`Auth failed: login status ${loginRes.status}, signup status ${signupRes.status}`);
          }
        }

        const jwtToken = authData.token;
        localStorage.setItem('flow_os_token', jwtToken);
        setToken(jwtToken);

        const workspacesRes = await fetch('/api/org/workspaces', {
          headers: {
            'Authorization': `Bearer ${jwtToken}`,
            'workspace-id': 'temp_initialization'
          }
        });

        if (workspacesRes.ok) {
          const wsList = await workspacesRes.json();
          if (Array.isArray(wsList) && wsList.length > 0) {
            setWorkspaces(wsList);
            const storedId = localStorage.getItem('flow_os_workspace_id');
            const match = wsList.find(w => w.externalId === storedId);
            const activeWorkspaceId = match ? match.externalId : wsList[0].externalId;
            localStorage.setItem('flow_os_workspace_id', activeWorkspaceId);
            setWorkspaceId(activeWorkspaceId);
          } else {
            const fallbackWorkspaceId = 'workspace_corp_alpha';
            localStorage.setItem('flow_os_workspace_id', fallbackWorkspaceId);
            setWorkspaceId(fallbackWorkspaceId);
          }
        } else {
          const fallbackWorkspaceId = 'workspace_corp_alpha';
          localStorage.setItem('flow_os_workspace_id', fallbackWorkspaceId);
          setWorkspaceId(fallbackWorkspaceId);
        }
      } catch (err) {
        console.error('Silent auto-auth critical error:', err);
        setConnectionStatus('ERROR');
      } finally {
        setIsAuthLoading(false);
      }
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

          setEvents((prev) => {
            const entry = {
              id: Date.now() + Math.random(),
              type: eventName,
              payload: msg.payload || msg,
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
