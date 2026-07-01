import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  LayoutGrid, Database, Copy, Globe, Shield, RefreshCw, Trash2, Archive,
  Plus, Sparkles, Sliders, Lock
} from "lucide-react";
import PageContainer from "../ui/PageContainer";
import Card from "../ui/Card";
import Button from "../ui/Button";
import Skeleton from "../ui/Skeleton";
import { useWebSocket } from "../../hooks/useWebSocket";

const WorkspaceManagement = () => {
  const navigate = useNavigate();
  const { token, isAuthLoading } = useWebSocket();
  const [workspaces, setWorkspaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCloneModal, setShowCloneModal] = useState(false);
  const [sourceWsId, setSourceWsId] = useState("");
  const [newWsName, setNewWsName] = useState("");
  const [cloning, setCloning] = useState(false);
  
  // Settings State
  const [retention, setRetention] = useState("1 Year");
  const [aiProvider, setAiProvider] = useState("gemini");
  const [modelName, setModelName] = useState("gemini-2.5-flash");
  const [briefingCadence, setBriefingCadence] = useState("daily");

  const fetchWorkspaces = async () => {
    if (!token) return;
    try {
      const res = await fetch("/api/org/workspaces", {
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });
      if (res.ok) {
        const body = await res.json();
        setWorkspaces(body || []);
      }
    } catch (err) {
      console.error("Failed to fetch workspaces:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isAuthLoading) {
      setTimeout(() => fetchWorkspaces(), 0);
    }
  }, [isAuthLoading, token]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreateWorkspace = () => {
    navigate("/platform/onboarding");
  };

  const handleCloneWorkspace = async () => {
    if (!token || !sourceWsId || !newWsName.trim()) return;
    setCloning(true);
    try {
      const res = await fetch(`/api/org/workspaces/${sourceWsId}/clone`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ name: newWsName })
      });
      if (res.ok) {
        await fetchWorkspaces();
        setShowCloneModal(false);
        setNewWsName("");
        setSourceWsId("");
      }
    } catch (err) {
      console.error("Cloning workspace failed:", err);
    } finally {
      setCloning(false);
    }
  };

  const handleArchiveWorkspace = async (extId) => {
    if (!token) return;
    try {
      const res = await fetch(`/api/org/workspaces/${extId}/archive`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });
      if (res.ok) {
        alert(`Workspace ${extId} successfully archived!`);
        await fetchWorkspaces();
      }
    } catch (err) {
      console.error("Archiving workspace failed:", err);
    }
  };

  const handleDeleteWorkspace = async (extId) => {
    if (!token || !confirm("Are you absolutely sure you want to delete this workspace and all its data? This action is irreversible.")) return;
    try {
      const res = await fetch(`/api/org/workspaces/${extId}`, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });
      if (res.ok) {
        await fetchWorkspaces();
      }
    } catch (err) {
      console.error("Deleting workspace failed:", err);
    }
  };

  if (loading) {
    return (
      <PageContainer className="space-y-6">
        <Skeleton className="h-16" />
        <Skeleton className="h-96" />
      </PageContainer>
    );
  }

  return (
    <PageContainer className="space-y-8 select-none text-left">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-ui-xl font-bold text-text-primary tracking-tight flex items-center space-x-3">
            <LayoutGrid className="w-8 h-8 text-flow-purple" />
            <span>Workspace Management</span>
          </h1>
          <p className="text-ui-sm text-text-secondary leading-relaxed max-w-2xl">
            Configure tenant isolation, database replication, metadata schema rules, and permissions settings.
          </p>
        </div>
        <div className="flex space-x-3">
          <Button variant="secondary" onClick={fetchWorkspaces} className="space-x-1.5">
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </Button>
          <Button variant="primary" onClick={handleCreateWorkspace} className="bg-flow-purple hover:bg-flow-purple/90">
            <Plus className="w-4 h-4 mr-2" />
            <span>Add Workspace</span>
          </Button>
        </div>
      </div>

      {/* Grid Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Workspace List */}
        <Card className="p-6 space-y-4 lg:col-span-2">
          <div className="flex items-center justify-between border-b border-border-flow/40 pb-2">
            <h2 className="text-ui-sm font-bold uppercase tracking-wider text-text-primary">Active Tenant Workspaces</h2>
          </div>
          
          <div className="space-y-3">
            {workspaces.map((ws) => (
              <div key={ws.id} className="p-4 bg-bg-secondary border border-border-flow rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <span className="text-ui-sm font-bold text-text-primary flex items-center space-x-2">
                    <Database className="w-4 h-4 text-flow-purple" />
                    <span>{ws.name}</span>
                  </span>
                  <div className="flex items-center space-x-3 text-[10px] font-bold text-text-muted uppercase tracking-widest">
                    <span className="font-mono text-[9px] text-flow-purple">{ws.externalId}</span>
                    <span>•</span>
                    <span className="flex items-center"><Globe className="w-3.5 h-3.5 mr-1" />us-east-1</span>
                    <span>•</span>
                    <span className="flex items-center"><Shield className="w-3.5 h-3.5 mr-1 text-success" />Dedicated DB</span>
                  </div>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Button 
                    variant="secondary" 
                    size="sm" 
                    onClick={() => {
                      setSourceWsId(ws.externalId);
                      setShowCloneModal(true);
                    }}
                    className="space-x-1.5"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span className="hidden md:inline">Clone</span>
                  </Button>
                  <Button 
                    variant="secondary" 
                    size="sm" 
                    onClick={() => handleArchiveWorkspace(ws.externalId)}
                    className="space-x-1.5 text-warning hover:bg-warning/10"
                  >
                    <Archive className="w-3.5 h-3.5" />
                    <span className="hidden md:inline">Archive</span>
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => handleDeleteWorkspace(ws.externalId)}
                    className="text-critical hover:bg-critical/10"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Global Settings / AI configs */}
        <div className="space-y-6">
          
          {/* AI Settings */}
          <Card className="p-6 space-y-4">
            <h2 className="text-ui-sm font-bold uppercase tracking-wider text-text-primary border-b border-border-flow/40 pb-2 flex items-center space-x-2">
              <Sparkles className="w-4 h-4 text-flow-purple" />
              <span>AI Configuration Settings</span>
            </h2>
            
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-[9px] font-bold text-text-muted uppercase tracking-widest">AI Provider</label>
                <select 
                  value={aiProvider}
                  onChange={(e) => setAiProvider(e.target.value)}
                  className="w-full bg-bg-secondary border border-border-flow text-text-primary rounded-lg px-3 py-2 text-ui-sm focus:outline-none"
                >
                  <option value="gemini">Google Gemini API</option>
                  <option value="openai">OpenAI GPT-4</option>
                  <option value="anthropic">Anthropic Claude</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-bold text-text-muted uppercase tracking-widest">Model Name</label>
                <select 
                  value={modelName}
                  onChange={(e) => setModelName(e.target.value)}
                  className="w-full bg-bg-secondary border border-border-flow text-text-primary rounded-lg px-3 py-2 text-ui-sm focus:outline-none"
                >
                  <option value="gemini-2.5-flash">gemini-2.5-flash (Default)</option>
                  <option value="gemini-2.5-pro">gemini-2.5-pro</option>
                  <option value="gpt-4o">gpt-4o</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-bold text-text-muted uppercase tracking-widest">Briefing Cadence</label>
                <select 
                  value={briefingCadence}
                  onChange={(e) => setBriefingCadence(e.target.value)}
                  className="w-full bg-bg-secondary border border-border-flow text-text-primary rounded-lg px-3 py-2 text-ui-sm focus:outline-none"
                >
                  <option value="daily">Every Morning (Daily)</option>
                  <option value="weekly">Weekly Rollup Summary</option>
                  <option value="custom">Real-time Continuous</option>
                </select>
              </div>
            </div>
          </Card>

          {/* Retention Settings */}
          <Card className="p-6 space-y-4">
            <h2 className="text-ui-sm font-bold uppercase tracking-wider text-text-primary border-b border-border-flow/40 pb-2 flex items-center space-x-2">
              <Sliders className="w-4 h-4 text-flow-purple" />
              <span>Retention Policies</span>
            </h2>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-[9px] font-bold text-text-muted uppercase tracking-widest">Data Retention Window</label>
                <select 
                  value={retention}
                  onChange={(e) => setRetention(e.target.value)}
                  className="w-full bg-bg-secondary border border-border-flow text-text-primary rounded-lg px-3 py-2 text-ui-sm focus:outline-none"
                >
                  <option value="90 Days">90 Days</option>
                  <option value="1 Year">1 Year</option>
                  <option value="7 Years">7 Years (Compliance Lock)</option>
                  <option value="indefinite">Indefinite</option>
                </select>
              </div>

              <div className="flex items-center justify-between border-t border-border-flow/40 pt-4 text-ui-xs">
                <div className="space-y-0.5">
                  <span className="font-bold text-text-primary block flex items-center"><Lock className="w-3.5 h-3.5 mr-1 text-flow-purple" /> Strict PII Scans</span>
                  <span className="text-[10px] text-text-muted">Hard drop salary/identity patterns immediately.</span>
                </div>
                <div className="w-10 h-5 bg-success rounded-full relative cursor-pointer shrink-0">
                  <div className="absolute right-1 top-0.5 w-4 h-4 bg-white rounded-full" />
                </div>
              </div>
            </div>
          </Card>

        </div>

      </div>

      {/* CLONE WORKSPACE MODAL */}
      {showCloneModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <Card className="max-w-md w-full p-6 space-y-4 text-left">
            <h3 className="text-ui-md font-bold text-text-primary flex items-center space-x-2">
              <Copy className="w-5 h-5 text-flow-purple" />
              <span>Clone Workspace</span>
            </h3>
            <p className="text-ui-xs text-text-secondary leading-relaxed">
              Generate a sandbox replica of workspace <span className="font-mono text-flow-purple">{sourceWsId}</span>, cloning all nodes, edges, memories, and integrations.
            </p>

            <div className="space-y-1">
              <label className="text-[9px] font-bold text-text-muted uppercase tracking-widest block">New Workspace Name</label>
              <input 
                type="text"
                value={newWsName}
                onChange={(e) => setNewWsName(e.target.value)}
                className="w-full bg-bg-secondary border border-border-flow/80 rounded-lg px-3 py-2 text-ui-sm text-text-primary focus:outline-none"
                placeholder="Sandbox Copy"
              />
            </div>

            <div className="flex justify-end space-x-2 pt-2">
              <Button variant="secondary" onClick={() => setShowCloneModal(false)}>Cancel</Button>
              <Button variant="primary" onClick={handleCloneWorkspace} disabled={cloning || !newWsName.trim()}>
                {cloning ? "Cloning..." : "Clone Workspace"}
              </Button>
            </div>
          </Card>
        </div>
      )}

    </PageContainer>
  );
};

export default WorkspaceManagement;
