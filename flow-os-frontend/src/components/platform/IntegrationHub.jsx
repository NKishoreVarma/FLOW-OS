import { useState, useEffect, useCallback } from "react";
import { Link2, CheckCircle2, AlertTriangle, RefreshCw, HelpCircle, X } from "lucide-react";
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

  // Primary integrations state
  const [integrationStatus, setIntegrationStatus] = useState({});
  const [connectingId, setConnectingId] = useState(null);
  const [formValues, setFormValues] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  const PRIMARY_INTEGRATIONS = [
    {
      id: 'gmail',
      name: 'Gmail',
      description: 'Sync inbox, send replies, AI-powered email intelligence',
      icon: '📧',
      authType: 'oauth',
      statusEndpoint: '/api/communication/status',
      initiateEndpoint: '/api/connectors/gmail/auth/initiate',
      callbackUrl: `${origin}/api/communication/oauth/callback`,
      capability: 'Communication',
    },
    {
      id: 'google-calendar',
      name: 'Google Calendar',
      description: 'Meeting intelligence, AI prep context, action item tracking',
      icon: '📅',
      authType: 'oauth',
      statusEndpoint: '/api/meetings/status',
      initiateEndpoint: '/api/connectors/google-calendar/auth/initiate',
      callbackUrl: `${origin}/api/meetings/oauth/callback`,
      capability: 'Meetings',
    },
    {
      id: 'github',
      name: 'GitHub',
      description: 'PR intelligence, deployment risk scores, code search',
      icon: '⚙️',
      authType: 'pat',
      statusEndpoint: '/api/engineering/status',
      authEndpoint: '/api/engineering/auth',
      fields: [
        { key: 'token', label: 'Personal Access Token', placeholder: 'ghp_...', type: 'password' },
      ],
      capability: 'Engineering',
    },
    {
      id: 'jira',
      name: 'Jira',
      description: 'Issue tracking, sprint intelligence, workflow automation',
      icon: '🎯',
      authType: 'apikey',
      statusEndpoint: '/api/work/status',
      authEndpoint: '/api/work/auth',
      fields: [
        { key: 'email', label: 'Jira Email', placeholder: 'you@company.com', type: 'email' },
        { key: 'apiKey', label: 'API Token', placeholder: 'ATATT...', type: 'password' },
      ],
      capability: 'Work Management',
    },
    {
      id: 'notion',
      name: 'Notion',
      description: 'Knowledge base sync, document intelligence, graph enrichment',
      icon: '📝',
      authType: 'apikey',
      statusEndpoint: '/api/knowledge/status',
      authEndpoint: '/api/knowledge/auth',
      fields: [
        { key: 'apiKey', label: 'Integration Token', placeholder: 'secret_...', type: 'password' },
      ],
      capability: 'Knowledge',
    },
  ];

  const headers = token ? {
    Authorization: `Bearer ${token}`,
    'workspace-id': workspaceId || 'workspace_corp_alpha',
    'Content-Type': 'application/json',
  } : {};

  const fetchStatus = useCallback(async () => {
    if (!token || !workspaceId) { setLoading(false); return; }
    try {
      const [connectorsRes, healthRes] = await Promise.allSettled([
        fetch("/api/connectors", { headers }),
        fetch("/api/connectors/health", { headers }),
      ]);
      if (connectorsRes.status === 'fulfilled' && connectorsRes.value.ok) {
        const body = await connectorsRes.value.json();
        setConnectors(body.connectors || []);
      }
      if (healthRes.status === 'fulfilled' && healthRes.value.ok) {
        const body = await healthRes.value.json();
        setHealthMap(body || {});
      }
    } catch (err) {
      console.error("Failed to fetch connector status/health:", err);
    } finally {
      setLoading(false);
    }
  }, [token, workspaceId]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchIntegrationStatuses = useCallback(async () => {
    if (!token || !workspaceId) return;
    const results = await Promise.allSettled(
      PRIMARY_INTEGRATIONS.map(async (intg) => {
        try {
          const res = await fetch(intg.statusEndpoint, { headers });
          if (!res.ok) return [intg.id, { authenticated: false }];
          const data = await res.json();
          return [intg.id, { authenticated: data.authenticated ?? data.connected ?? false, detail: data }];
        } catch {
          return [intg.id, { authenticated: false }];
        }
      })
    );
    const map = {};
    results.forEach(r => {
      if (r.status === 'fulfilled') {
        const [id, status] = r.value;
        map[id] = status;
      }
    });
    setIntegrationStatus(map);
  }, [token, workspaceId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isAuthLoading) {
      setTimeout(() => {
        fetchStatus();
        fetchIntegrationStatuses();
      }, 0);
    }
  }, [isAuthLoading, token, workspaceId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleConnect = async (intg) => {
    if (intg.authType === 'oauth') {
      if (!token) return;
      try {
        const res = await fetch(intg.initiateEndpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify({ callbackUrl: intg.callbackUrl }),
        });
        if (res.ok) {
          const data = await res.json();
          const authUrl = data.authUrl || data.result?.authUrl;
          if (authUrl) window.open(authUrl, '_blank', 'noopener,noreferrer');
        }
      } catch (err) {
        console.error(`OAuth initiation failed for ${intg.id}:`, err);
      }
    } else {
      setConnectingId(prev => prev === intg.id ? null : intg.id);
      setFormValues({});
      setSubmitError(null);
    }
  };

  const handleFormSubmit = async (intg) => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(intg.authEndpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(formValues),
      });
      if (res.ok) {
        setConnectingId(null);
        setFormValues({});
        await fetchIntegrationStatuses();
      } else {
        const data = await res.json().catch(() => ({}));
        setSubmitError(data.message || `Failed to connect (HTTP ${res.status})`);
      }
    } catch {
      setSubmitError('Connection failed. Check your credentials and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDisconnect = async (intgId) => {
    try {
      await fetch(`/api/connectors/${intgId}/auth/revoke`, {
        method: 'POST',
        headers,
      });
      await Promise.allSettled([fetchIntegrationStatuses(), fetchStatus()]);
    } catch (err) {
      console.error(`Disconnect failed for ${intgId}:`, err);
    }
  };

  const triggerSync = async (connectorId) => {
    if (!token || !workspaceId) return;
    setSyncingId(connectorId);
    try {
      const res = await fetch("/api/connectors/execute", {
        method: "POST",
        headers,
        body: JSON.stringify({ connectorId, actionType: "SYNC", payload: {} }),
      });
      if (res.ok) await fetchStatus();
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
            Connect your tools, monitor sync health, and manage OAuth credentials for all capabilities.
          </p>
        </div>
        <Button variant="secondary" onClick={() => { fetchStatus(); fetchIntegrationStatuses(); }} className="space-x-1.5">
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh</span>
        </Button>
      </div>

      {/* Primary Integrations */}
      <div className="space-y-4">
        <h2 className="text-ui-sm font-bold uppercase tracking-wider text-text-muted border-b border-border-flow/40 pb-2">
          Primary Integrations
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {PRIMARY_INTEGRATIONS.map(intg => {
            const status = integrationStatus[intg.id] || { authenticated: false };
            const isConnected = status.authenticated;
            const isExpanded = connectingId === intg.id;

            return (
              <Card key={intg.id} className={`p-5 space-y-3 flex flex-col ${isConnected ? 'border-success/30' : ''}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{intg.icon}</span>
                    <div>
                      <h3 className="text-ui-sm font-bold text-text-primary">{intg.name}</h3>
                      <p className="text-[9px] font-bold text-text-muted uppercase tracking-widest">{intg.capability}</p>
                    </div>
                  </div>
                  {isConnected ? (
                    <span className="text-[9px] text-success font-bold uppercase tracking-widest flex items-center gap-1 bg-success/10 px-2 py-0.5 rounded border border-success/20 shrink-0">
                      <CheckCircle2 className="w-3 h-3" /> Connected
                    </span>
                  ) : (
                    <span className="text-[9px] text-text-muted font-bold uppercase tracking-widest flex items-center gap-1 bg-bg-secondary px-2 py-0.5 rounded border border-border-flow shrink-0">
                      <HelpCircle className="w-3 h-3" /> Not connected
                    </span>
                  )}
                </div>

                <p className="text-[11px] text-text-secondary leading-relaxed">{intg.description}</p>

                {/* Inline form for PAT/API key */}
                {isExpanded && (
                  <div className="space-y-2 pt-1 border-t border-border-flow/40">
                    {intg.fields?.map(field => (
                      <div key={field.key} className="space-y-1">
                        <label className="text-[9px] font-bold text-text-muted uppercase tracking-widest block">
                          {field.label}
                        </label>
                        <input
                          type={field.type}
                          placeholder={field.placeholder}
                          value={formValues[field.key] || ''}
                          onChange={e => setFormValues(prev => ({ ...prev, [field.key]: e.target.value }))}
                          className="w-full bg-bg-secondary border border-border-flow rounded-lg px-3 py-1.5 text-[11px] text-text-primary placeholder:text-text-muted focus:outline-none focus:border-flow-purple/50 focus:ring-1 focus:ring-flow-purple/20"
                        />
                      </div>
                    ))}
                    {submitError && (
                      <p className="text-[10px] text-destructive">{submitError}</p>
                    )}
                    <div className="flex gap-2 pt-1">
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => handleFormSubmit(intg)}
                        disabled={submitting}
                        className="flex-1 justify-center text-[11px]"
                      >
                        {submitting ? 'Connecting…' : 'Connect'}
                      </Button>
                      <button
                        onClick={() => { setConnectingId(null); setSubmitError(null); }}
                        className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-white/5"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}

                {/* Action buttons */}
                {!isExpanded && (
                  <div className="flex gap-2 pt-1 border-t border-border-flow/30">
                    {isConnected ? (
                      <>
                        <Button variant="secondary" size="sm" className="flex-1 justify-center text-[11px]" disabled>
                          Manage
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-[11px] text-text-muted hover:text-destructive"
                          onClick={() => handleDisconnect(intg.id)}
                        >
                          Disconnect
                        </Button>
                      </>
                    ) : (
                      <Button
                        variant="primary"
                        size="sm"
                        className="flex-1 justify-center text-[11px]"
                        onClick={() => handleConnect(intg)}
                      >
                        Connect
                      </Button>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      </div>

      {/* All Connectors (registry) */}
      {connectors.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-ui-sm font-bold uppercase tracking-wider text-text-muted border-b border-border-flow/40 pb-2">
            All Connectors
          </h2>
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
                      className="text-[11px] text-text-muted hover:text-destructive"
                      disabled={isDisconnected}
                      onClick={() => handleDisconnect(conn.id)}
                    >
                      Disconnect
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {connectors.length === 0 && !loading && (
        <div className="text-center text-text-muted text-ui-sm py-12 border border-dashed border-border-flow rounded-xl">
          No connectors registered. Connect a primary integration above to get started.
        </div>
      )}
    </PageContainer>
  );
};

export default IntegrationHub;
