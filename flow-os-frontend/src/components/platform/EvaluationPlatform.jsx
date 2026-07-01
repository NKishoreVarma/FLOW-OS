import { useState, useEffect } from "react";
import {
  BarChart3, RefreshCw, Cpu, Brain, Network, CheckCircle2,
  DollarSign, Clock, ListCollapse, ShieldCheck
} from "lucide-react";
import PageContainer from "../ui/PageContainer";
import Card from "../ui/Card";
import Button from "../ui/Button";
import Skeleton from "../ui/Skeleton";
import { useWebSocket } from "../../hooks/useWebSocket";

const EvaluationPlatform = () => {
  const { token, workspaceId, isAuthLoading } = useWebSocket();
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [recommendations, setRecommendations] = useState([]);
  const [selectedRecId, setSelectedRecId] = useState("");
  const [explainability, setExplainability] = useState(null);
  const [explainabilityLoading, setExplainabilityLoading] = useState(false);

  const fetchMetrics = async () => {
    if (!token || !workspaceId) return;
    try {
      const res = await fetch("/api/evaluation/metrics", {
        headers: {
          "Authorization": `Bearer ${token}`,
          "workspace-id": workspaceId
        }
      });
      if (res.ok) {
        const body = await res.json();
        setMetrics(body);
      }
    } catch (err) {
      console.error("Failed to fetch evaluation metrics:", err);
    }
  };

  const fetchRecommendations = async () => {
    if (!token || !workspaceId) return;
    try {
      const res = await fetch("/api/intelligence/explainable-recommendations", {
        headers: {
          "Authorization": `Bearer ${token}`,
          "workspace-id": workspaceId
        }
      });
      if (res.ok) {
        const body = await res.json();
        setRecommendations(body || []);
        if (body.length > 0 && !selectedRecId) {
          setSelectedRecId(body[0].id);
        }
      }
    } catch (err) {
      console.error("Failed to fetch recommendations:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchExplainability = async (recId) => {
    if (!token || !recId) return;
    setExplainabilityLoading(true);
    try {
      const res = await fetch(`/api/evaluation/explainability/${recId}`, {
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });
      if (res.ok) {
        const body = await res.json();
        setExplainability(body);
      }
    } catch (err) {
      console.error("Failed to fetch explainability details:", err);
    } finally {
      setExplainabilityLoading(false);
    }
  };

  const handleFeedback = async (recId, outcome) => {
    if (!token) return;
    try {
      const res = await fetch(`/api/evaluation/feedback/${recId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ feedback: outcome })
      });
      if (res.ok) {
        // Refresh metrics and explainability
        await fetchMetrics();
        await fetchRecommendations();
        if (recId === selectedRecId) {
          await fetchExplainability(recId);
        }
      }
    } catch (err) {
      console.error("Failed to submit feedback:", err);
    }
  };

  useEffect(() => {
    if (!isAuthLoading) {
      setTimeout(() => { fetchMetrics(); fetchRecommendations(); }, 0);
    }
  }, [isAuthLoading, token, workspaceId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (selectedRecId) {
      setTimeout(() => fetchExplainability(selectedRecId), 0);
    }
  }, [selectedRecId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <PageContainer className="space-y-6">
        <Skeleton className="h-16" />
        <Skeleton className="h-[400px]" />
      </PageContainer>
    );
  }

  return (
    <PageContainer className="space-y-8 select-none text-left">
      
      {/* Title */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-ui-xl font-bold text-text-primary tracking-tight flex items-center space-x-3">
            <BarChart3 className="w-8 h-8 text-flow-purple" />
            <span>AI Evaluation & Explainability</span>
          </h1>
          <p className="text-ui-sm text-text-secondary leading-relaxed max-w-2xl">
            Audit evidence graphs, query reasoning lineages, authority weights, and user-action learning loops.
          </p>
        </div>
        <Button variant="secondary" onClick={() => { fetchMetrics(); fetchRecommendations(); }} className="space-x-1.5">
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh Analytics</span>
        </Button>
      </div>

      {metrics && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Acceptance */}
          <Card className="p-6 space-y-2">
            <span className="text-[10px] font-bold text-text-muted uppercase tracking-widest block">Acceptance Rate</span>
            <span className="text-ui-lg font-bold text-text-primary flex items-center space-x-2">
              <CheckCircle2 className="w-5 h-5 text-success" />
              <span>{metrics.recommendations.rates.acceptanceRate}%</span>
            </span>
          </Card>

          {/* Time Saved */}
          <Card className="p-6 space-y-2">
            <span className="text-[10px] font-bold text-text-muted uppercase tracking-widest block">Productivity Saved</span>
            <span className="text-ui-lg font-bold text-text-primary flex items-center space-x-2">
              <Clock className="w-5 h-5 text-flow-purple" />
              <span>{metrics.recommendations.productivity.timeSavedHours} hrs</span>
            </span>
          </Card>

          {/* Value Saved */}
          <Card className="p-6 space-y-2">
            <span className="text-[10px] font-bold text-text-muted uppercase tracking-widest block">Estimated Cost Saved</span>
            <span className="text-ui-lg font-bold text-text-primary flex items-center space-x-2">
              <DollarSign className="w-5 h-5 text-flow-purple" />
              <span>${metrics.recommendations.productivity.estimatedSavingsUSD}</span>
            </span>
          </Card>

          {/* Copilot latency */}
          <Card className="p-6 space-y-2">
            <span className="text-[10px] font-bold text-text-muted uppercase tracking-widest block">Reasoning Latency</span>
            <span className="text-ui-lg font-bold text-text-primary flex items-center space-x-2">
              <Cpu className="w-5 h-5 text-flow-purple animate-spin" />
              <span>{metrics.copilot.averageLatencyMs} ms</span>
            </span>
          </Card>
        </div>
      )}

      {/* Grid Dashboard */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Recommendations selector list */}
        <Card className="p-6 space-y-4">
          <h2 className="text-ui-sm font-bold uppercase tracking-wider text-text-primary border-b border-border-flow/40 pb-2">
            Briefing Recommendations
          </h2>

          {recommendations.length > 0 ? (
            <div className="space-y-2 overflow-y-auto max-h-[500px] pr-1">
              {recommendations.map((rec) => {
                const isActive = selectedRecId === rec.id;
                return (
                  <div
                    key={rec.id}
                    onClick={() => setSelectedRecId(rec.id)}
                    className={`p-4 rounded-xl border text-left cursor-pointer transition-apple ${
                      isActive 
                        ? "bg-flow-purple/10 border-flow-purple text-white" 
                        : "bg-bg-secondary border-border-flow/40 text-text-secondary hover:border-border-flow"
                    }`}
                  >
                    <span className="text-ui-xs font-bold block mb-1">{rec.title}</span>
                    <div className="flex justify-between items-center text-[10px] font-bold text-text-muted uppercase tracking-widest">
                      <span>Conf: {rec.confidence}%</span>
                      <span className={`px-1.5 py-0.5 rounded ${
                        rec.status === 'ACCEPTED' ? 'bg-success/15 text-success' :
                        rec.status === 'REJECTED' ? 'bg-critical/15 text-critical' :
                        'bg-bg-primary text-text-muted'
                      }`}>{rec.status}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-ui-xs text-text-muted text-center py-12">No recent recommendations generated.</p>
          )}
        </Card>

        {/* Right Column: Explainability trace */}
        <Card className="p-6 space-y-6 lg:col-span-2">
          <h2 className="text-ui-sm font-bold uppercase tracking-wider text-text-primary border-b border-border-flow/40 pb-2 flex items-center justify-between">
            <span>Explainability trace</span>
            {explainability && (
              <span className="text-[10px] font-bold text-text-muted bg-flow-purple/10 px-2.5 py-1 rounded-full border border-flow-purple/20 flex items-center">
                <Brain className="w-3 h-3 mr-1 text-flow-purple" /> Confidence: {explainability.confidence}%
              </span>
            )}
          </h2>

          {explainabilityLoading ? (
            <div className="space-y-4 py-12">
              <Skeleton className="h-8" />
              <Skeleton className="h-24" />
              <Skeleton className="h-32" />
            </div>
          ) : explainability ? (
            <div className="space-y-6">
              
              {/* Evidence nodes */}
              <div className="space-y-3">
                <span className="text-[10px] font-bold text-text-muted uppercase tracking-widest block flex items-center"><Network className="w-3.5 h-3.5 mr-1 text-flow-purple" /> Evidence Graph References</span>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {explainability.graph.nodes.filter(n => n.type !== 'RECOMMENDATION').map((node) => (
                    <div key={node.id} className="p-3 bg-bg-secondary border border-border-flow rounded-xl flex items-center justify-between">
                      <div className="space-y-0.5">
                        <span className="text-ui-xs font-bold text-text-primary block">{node.label}</span>
                        <span className="text-[9px] font-bold text-text-muted uppercase tracking-wider">{node.type}</span>
                      </div>
                      <span className="text-[9px] font-bold text-flow-purple bg-flow-purple/10 px-1.5 py-0.5 rounded border border-flow-purple/25">Authority: {node.authority || 1.0}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Reasoning Chain */}
              <div className="space-y-3 border-t border-border-flow/35 pt-4">
                <span className="text-[10px] font-bold text-text-muted uppercase tracking-widest block flex items-center"><ListCollapse className="w-3.5 h-3.5 mr-1 text-flow-purple" /> Reasoning Chain Lineage</span>
                <div className="space-y-3">
                  {explainability.reasoningChain.map((step) => (
                    <div key={step.step} className="flex space-x-3 text-ui-xs">
                      <div className="w-5 h-5 rounded-full bg-flow-purple/10 border border-flow-purple/35 text-flow-purple flex items-center justify-center font-mono font-bold shrink-0">
                        {step.step}
                      </div>
                      <div className="space-y-0.5">
                        <span className="font-bold text-text-primary block">{step.title}</span>
                        <span className="text-text-secondary leading-relaxed">{step.desc}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end space-x-2 border-t border-border-flow/30 pt-4">
                <Button 
                  variant="secondary" 
                  size="sm" 
                  onClick={() => handleFeedback(explainability.recommendationId, "reject")}
                  className="text-critical hover:bg-critical/10"
                >
                  Reject Recommendation
                </Button>
                <Button 
                  variant="primary" 
                  size="sm" 
                  onClick={() => handleFeedback(explainability.recommendationId, "accept")}
                  className="bg-success hover:bg-success/90"
                >
                  Accept & Execute
                </Button>
              </div>

            </div>
          ) : (
            <p className="text-ui-xs text-text-muted text-center py-12">Select a recommendation to inspect reasoning.</p>
          )}
        </Card>

      </div>

      {/* Learning loop weights */}
      {metrics && metrics.recommendations.rankingWeights && Object.keys(metrics.recommendations.rankingWeights).length > 0 && (
        <Card className="p-6 space-y-4">
          <h2 className="text-ui-sm font-bold uppercase tracking-wider text-text-primary border-b border-border-flow/40 pb-2 flex items-center space-x-2">
            <ShieldCheck className="w-4 h-4 text-flow-purple" />
            <span>Learning Loop Adaptive Ranking Weights</span>
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-ui-xs text-text-secondary">
            {Object.entries(metrics.recommendations.rankingWeights).map(([tag, w]) => (
              <div key={tag} className="p-3 bg-bg-secondary border border-border-flow rounded-xl flex justify-between items-center">
                <span className="font-bold">{tag}</span>
                <span className="font-mono text-flow-purple font-bold">x{parseFloat(w).toFixed(2)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

    </PageContainer>
  );
};

export default EvaluationPlatform;
