import { useState, useEffect } from "react";
import { Circle, Cpu, RefreshCw, Wifi, Zap } from "lucide-react";
import { useWebSocket } from "../../hooks/useWebSocket";

function timeSince(date) {
  const seconds = Math.floor((Date.now() - date) / 1000);
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}

export function GlobalStatusBar() {
  const { connectionStatus, workspaceId, token, events } = useWebSocket();
  const [connectorCount, setConnectorCount] = useState(null);
  const [lastEventTime, setLastEventTime] = useState(Date.now());
  const [, setTick] = useState(0);

  useEffect(() => {
    if (events && events.length > 0) setLastEventTime(Date.now());
  }, [events]);

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 30000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!token || !workspaceId) return;
    fetch('http://localhost:5001/api/connectors', {
      headers: {
        Authorization: `Bearer ${token}`,
        'workspace-id': workspaceId,
      },
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) {
          const list = data.connectors || data || [];
          setConnectorCount(Array.isArray(list) ? list.length : 11);
        }
      })
      .catch(() => setConnectorCount(11));
  }, [token, workspaceId]);

  const isOnline = connectionStatus === 'ONLINE';
  const wsDisplay = workspaceId
    ? workspaceId.replace('workspace_', '').replace(/_/g, '-').toUpperCase()
    : 'NO WORKSPACE';

  return (
    <div className="h-7 flex-shrink-0 border-t border-border-flow/60 bg-bg-secondary/80 backdrop-blur-sm flex items-center justify-between px-4 text-[10px] text-text-muted font-mono select-none z-20">
      <div className="flex items-center space-x-4 overflow-hidden">
        <span className="flex items-center space-x-1.5">
          <Circle className={`w-2 h-2 fill-current ${isOnline ? 'text-success' : 'text-critical'}`} />
          <span>{connectorCount !== null ? connectorCount : '—'} connectors</span>
        </span>
        <span className="text-border-flow">|</span>
        <span className="flex items-center space-x-1.5">
          <Cpu className="w-2.5 h-2.5 text-flow-purple" />
          <span className="text-flow-purple">AI {isOnline ? 'Active' : 'Offline'}</span>
        </span>
        <span className="text-border-flow">|</span>
        <span className="flex items-center space-x-1.5">
          <Zap className="w-2.5 h-2.5 text-warning" />
          <span>Queue {isOnline ? 'Ready' : 'Paused'}</span>
        </span>
        <span className="text-border-flow hidden sm:inline">|</span>
        <span className="hidden sm:flex items-center space-x-1.5">
          <RefreshCw className="w-2.5 h-2.5" />
          <span>Sync {timeSince(lastEventTime)}</span>
        </span>
        <span className="text-border-flow hidden md:inline">|</span>
        <span className="hidden md:flex items-center space-x-1.5">
          <Wifi className="w-2.5 h-2.5" />
          <span className="truncate max-w-[120px]">{wsDisplay}</span>
        </span>
      </div>
      <div className="flex items-center space-x-4 flex-shrink-0">
        <span className="hidden sm:inline">FLOW OS v2.0</span>
        <span className="text-border-flow hidden sm:inline">|</span>
        <span className="flex items-center space-x-1">
          <kbd className="px-1 py-0.5 rounded bg-bg-primary border border-border-flow text-[9px]">⌘K</kbd>
          <span>Search</span>
        </span>
      </div>
    </div>
  );
}

export default GlobalStatusBar;
