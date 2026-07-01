import { useState, useEffect } from "react";
import { Link2, CheckCircle2, AlertTriangle, RefreshCw, HelpCircle } from "lucide-react";
import PageContainer from "../ui/PageContainer";
import Card from "../ui/Card";
import Button from "../ui/Button";
import Skeleton from "../ui/Skeleton";
import { useWebSocket } from "../../hooks/useWebSocket";

const IntegrationHub = () => {
  const { token, workspaceId, isAuthLoading } = useWebSocket();
  const [connectors, setConnectors] = useState([]);
  const [healthMap, setHealthMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [syncingId, setSyncingId] = useState(null);

  const fetchStatus = async () => {
    if (!token || !workspaceId) return;
    try {
      // 1. Fetch all registered connectors with auth details
      const connectorsRes = await fetch("/api/connectors", {
        headers: {
          "Authorization": `Bearer ${token}`,
          "workspace-id": workspaceId
        }
      });
      if (connectorsRes.ok) {
        const body = await connectorsRes.json();
        setConnectors(body.connectors || []);
      }

      // 2. Fetch real-time health checks
      const healthRes = await fetch("/api/connectors/health", {
        headers: {
          "Authorization": `Bearer ${token}`,
          "workspace-id": workspaceId
        }
      });
      if (healthRes.ok) {
        const body = await healthRes.json();
        setHealthMap(body || {});
      }
    } catch (err) {
      console.error("Failed to fetch connector status/health:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isAuthLoading) {
      setTimeout(() => fetchStatus(), 0);
    }
  }, [isAuthLoading, token, workspaceId]); // eslint-disable-line react-hooks/exhaustive-deps

  const triggerSync = async (connectorId) => {
    if (!token || !workspaceId) return;
    setSyncingId(connectorId);
    try {
      // Dispatch sync command to connector adapter
      const res = await fetch("/api/connectors/execute", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
          "workspace-id": workspaceId
        },
        body: JSON.stringify({
          connectorId,
          actionType: "SYNC",
          payload: {}
        })
      });
      if (res.ok) {
        await fetchStatus();
      }
    } catch (err) {
      console.error(`Failed to trigger sync for ${connectorId}:`, err);
    } finally {
      setSyncingId(null);
    }
  };

  if (loading) {
    return (
      <PageContainer className="space-y-6">
        <Skeleton className="h-16" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer className="space-y-8 select-none text-left">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-ui-xl font-bold text-text-primary tracking-tight flex items-center space-x-3">
            <Link2 className="w-8 h-8 text-flow-purple" />
            <span>Integration Hub</span>
          </h1>
          <p className="text-ui-sm text-text-secondary leading-relaxed max-w-2xl">
            Real-time status monitoring, credential mapping, sync schedules, and API rate limit analytics.
          </p>
        </div>
        <Button variant="secondary" onClick={fetchStatus} className="space-x-1.5">
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh health</span>
        </Button>
      </div>

      {/* Grid List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {connectors.map(conn => {
          const health = healthMap[conn.id] || { status: "DISCONNECTED", detail: "Authentication pending" };
          const isHealthy = health.status === "HEALTHY" || health.status === "ACTIVE";
          const isWarning = health.status === "DEGRADED" || health.status === "DOWN";
          const isDisconnected = health.status === "DISCONNECTED";

          return (
            <Card key={conn.id} className={`p-6 space-y-4 flex flex-col justify-between ${isWarning ? 'border-warning/50' : ''}`}>
              <div className="space-y-3">
                <div className="flex justify-between items-start">
                  <div className="flex items-center space-x-3">
                    <div className="p-2 bg-bg-secondary border border-border-flow rounded-lg flex items-center justify-center font-bold text-text-primary uppercase w-10 h-10">
                      {conn.id.substring(0, 2)}
                    </div>
                    <div>
                      <h3 className="text-ui-md font-bold text-text-primary capitalize">{conn.id}</h3>
                      <p className="text-[9px] text-text-muted font-bold uppercase tracking-widest">{conn.capability}</p>
                    </div>
                  </div>

                  {isHealthy && (
                    <span className="text-[9px] text-success font-bold uppercase tracking-widest flex items-center bg-success/10 px-2 py-0.5 rounded border border-success/20">
                      <CheckCircle2 className="w-3 h-3 mr-1" /> Active
                    </span>
                  )}
                  {isWarning && (
                    <span className="text-[9px] text-warning font-bold uppercase tracking-widest flex items-center bg-warning/10 px-2 py-0.5 rounded border border-warning/20">
                      <AlertTriangle className="w-3 h-3 mr-1" /> Warning
                    </span>
                  )}
                  {isDisconnected && (
                    <span className="text-[9px] text-text-muted font-bold uppercase tracking-widest flex items-center bg-bg-secondary px-2 py-0.5 rounded border border-border-flow">
                      <HelpCircle className="w-3 h-3 mr-1" /> Inactive
                    </span>
                  )}
                </div>

                <div className="space-y-2 text-ui-xs text-text-secondary border-t border-border-flow/40 pt-4">
                  <div className="flex justify-between">
                    <span>Sync Health:</span>
                    <span className={`font-semibold ${isHealthy ? 'text-success' : isWarning ? 'text-warning' : 'text-text-muted'}`}>{health.status}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Credentials:</span>
                    <span className="text-text-primary capitalize font-medium">{conn.auth?.method || "None"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Capabilities:</span>
                    <span className="text-flow-purple font-mono">{(conn.supportedActions || []).join(", ")}</span>
                  </div>
                  {health.detail && (
                    <div className="bg-bg-secondary p-2.5 rounded border border-border-flow/40 text-[10px] select-text italic text-text-muted mt-2">
                      {health.detail}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex space-x-2 pt-2 border-t border-border-flow/30">
                <Button 
                  variant="secondary" 
                  size="sm" 
                  className="flex-1 justify-center space-x-1.5"
                  onClick={() => triggerSync(conn.id)}
                  disabled={syncingId === conn.id || isDisconnected}
                >
                  <RefreshCw className={`w-3 h-3 ${syncingId === conn.id ? 'animate-spin' : ''}`} />
                  <span>{syncingId === conn.id ? "Syncing..." : "Sync Now"}</span>
                </Button>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="text-[11px] text-text-muted hover:text-critical"
                  disabled={isDisconnected}
                >
                  Disconnect
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
    </PageContainer>
  );
};

export default IntegrationHub;
