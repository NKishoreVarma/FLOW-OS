import { useState, useEffect } from "react";
import {
  Activity, CheckCircle2, RefreshCw, Network,
  Zap, Database
} from "lucide-react";
import PageContainer from "../ui/PageContainer";
import Card from "../ui/Card";
import Button from "../ui/Button";
import Skeleton from "../ui/Skeleton";
import { useWebSocket } from "../../hooks/useWebSocket";

const WorkspaceHealth = () => {
  const { token, workspaceId, isAuthLoading } = useWebSocket();
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchHealth = async () => {
    if (!token || !workspaceId) return;
    try {
      const res = await fetch(`/api/org/workspaces/${workspaceId}/health`, {
        headers: {
          "Authorization": `Bearer ${token}`,
          "workspace-id": workspaceId
        }
      });
      if (res.ok) {
        const body = await res.json();
        setHealth(body);
      }
    } catch (err) {
      console.error("Failed to fetch workspace health scorecard:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isAuthLoading) {
      setTimeout(() => fetchHealth(), 0);
    }
  }, [isAuthLoading, token, workspaceId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <PageContainer className="space-y-6">
        <Skeleton className="h-16" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer className="space-y-8 select-none text-left">
      
      {/* Title */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-ui-xl font-bold text-text-primary tracking-tight flex items-center space-x-3">
            <Activity className="w-8 h-8 text-flow-purple" />
            <span>Workspace Health Scorecard</span>
          </h1>
          <p className="text-ui-sm text-text-secondary leading-relaxed max-w-2xl">
            Real-time synchronization latency, database chunk indexing, operational graph completeness, and connector freshness ratios.
          </p>
        </div>
        <Button variant="secondary" onClick={fetchHealth} className="space-x-1.5">
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh health</span>
        </Button>
      </div>

      {/* Grid Dashboard */}
      {health && (
        <div className="space-y-6">
          
          {/* Top Cards row */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            
            {/* Status */}
            <Card className="p-6 space-y-2">
              <span className="text-[10px] font-bold text-text-muted uppercase tracking-widest block">Workspace Status</span>
              <span className="text-ui-lg font-bold text-text-primary flex items-center space-x-1.5">
                <CheckCircle2 className="w-5 h-5 text-success" />
                <span>{health.status}</span>
              </span>
            </Card>

            {/* Freshness */}
            <Card className="p-6 space-y-2">
              <span className="text-[10px] font-bold text-text-muted uppercase tracking-widest block">Connector Freshness</span>
              <span className="text-ui-lg font-bold text-text-primary flex items-center space-x-1.5">
                <Zap className="w-5 h-5 text-flow-purple" />
                <span>{health.connectorHealth.freshnessScore}%</span>
              </span>
            </Card>

            {/* Sync Latency */}
            <Card className="p-6 space-y-2">
              <span className="text-[10px] font-bold text-text-muted uppercase tracking-widest block">Sync Latency</span>
              <span className="text-ui-lg font-bold text-text-primary flex items-center space-x-1.5">
                <RefreshCw className="w-5 h-5 text-flow-purple animate-spin" />
                <span>{health.connectorHealth.syncLatencyMs} ms</span>
              </span>
            </Card>

            {/* Graph Completeness */}
            <Card className="p-6 space-y-2">
              <span className="text-[10px] font-bold text-text-muted uppercase tracking-widest block">Graph Completeness</span>
              <span className="text-ui-lg font-bold text-text-primary flex items-center space-x-1.5">
                <Network className="w-5 h-5 text-flow-purple" />
                <span>{health.graphCompleteness.score}%</span>
              </span>
            </Card>

          </div>

          {/* Details sections */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* Graph metrics */}
            <Card className="p-6 space-y-4">
              <h2 className="text-ui-sm font-bold uppercase tracking-wider text-text-primary border-b border-border-flow/40 pb-2 flex items-center space-x-2">
                <Network className="w-4 h-4 text-flow-purple" />
                <span>Durable Operational Graph</span>
              </h2>

              <div className="space-y-3 text-ui-sm text-text-secondary">
                <div className="flex justify-between">
                  <span>Graph Node elements:</span>
                  <span className="text-text-primary font-bold">{health.graphCompleteness.nodeCount}</span>
                </div>
                <div className="flex justify-between">
                  <span>Graph Edge relationships:</span>
                  <span className="text-text-primary font-bold">{health.graphCompleteness.edgeCount}</span>
                </div>
                <div className="flex justify-between">
                  <span>Relationship density:</span>
                  <span className="text-text-primary font-bold">
                    {(health.graphCompleteness.nodeCount > 0 
                      ? (health.graphCompleteness.edgeCount / health.graphCompleteness.nodeCount).toFixed(2)
                      : 0)} Edges / Node
                  </span>
                </div>
              </div>
            </Card>

            {/* Ingestion Freshness */}
            <Card className="p-6 space-y-4">
              <h2 className="text-ui-sm font-bold uppercase tracking-wider text-text-primary border-b border-border-flow/40 pb-2 flex items-center space-x-2">
                <Database className="w-4 h-4 text-flow-purple" />
                <span>Data Ingestion & Imports</span>
              </h2>

              <div className="space-y-3 text-ui-sm text-text-secondary">
                <div className="flex justify-between">
                  <span>Integrations configured:</span>
                  <span className="text-text-primary font-bold">{health.connectorHealth.total}</span>
                </div>
                <div className="flex justify-between">
                  <span>Total Memory Records:</span>
                  <span className="text-text-primary font-bold">{health.importHistoryStats.totalImports}</span>
                </div>
                <div className="flex justify-between">
                  <span>Last import timestamp:</span>
                  <span className="text-text-primary font-medium">{new Date(health.importHistoryStats.lastSuccessfulImport).toLocaleString()}</span>
                </div>
              </div>
            </Card>

          </div>

        </div>
      )}

    </PageContainer>
  );
};

export default WorkspaceHealth;
