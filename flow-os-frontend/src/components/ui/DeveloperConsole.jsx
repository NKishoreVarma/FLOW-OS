import { useState, useEffect, useRef } from 'react';
import { useWebSocket } from '../../hooks/useWebSocket';
import { Terminal } from 'lucide-react';
import PageContainer from './PageContainer';

const API_URL = '/api';

export const DeveloperConsole = () => {
  const { token, workspaceId, events: liveEvents } = useWebSocket();
  const [queryText, setQueryText] = useState('');
  const [isQuerying, setIsQuerying] = useState(false);
  const [synthesis, setSynthesis] = useState(null);
  const [synthesisAnswer, setSynthesisAnswer] = useState("");
  const [chunks, setChunks] = useState([]);

  const eventFeedRef = useRef(null);
  const inputRef = useRef(null);

  // Stats computation
  const latestIntelStored = liveEvents.find(
    (e) => e.type === 'INTEL_STORED' && (e.payload?.status === 'SUCCESS' || e.status === 'SUCCESS')
  );
  const latestQuerySynthesis = liveEvents.find(
    (e) => e.type === 'QUERY_SYNTHESIS_COMPLETE'
  );

  const stats = {
    chunksIndexed: latestIntelStored?.payload?.chunksIndexed || latestIntelStored?.chunksIndexed || 0,
    totalNodes: latestQuerySynthesis?.payload?.resultCount || latestIntelStored?.payload?.totalNodes || latestIntelStored?.totalNodes || 0,
    ingestionCycles: latestIntelStored?.payload?.ingestionCycles || latestIntelStored?.ingestionCycles || 0,
  };

  // Auto scroll events
  useEffect(() => {
    if (eventFeedRef.current) {
      eventFeedRef.current.scrollTop = 0;
    }
  }, [liveEvents]);

  const handleQuery = async (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const localQueryText = queryText.trim();
    if (!localQueryText || isQuerying || !token || !workspaceId) return;

    setIsQuerying(true);
    try {
      const res = await fetch(`${API_URL}/integrations/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'workspace-id': workspaceId
        },
        body: JSON.stringify({ query: localQueryText, workspaceId: workspaceId })
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();
      if (data.answer || (data.chunks && data.chunks.length > 0)) {
        setSynthesis(data);
        if (data.chunks) setChunks(data.chunks);
        setSynthesisAnswer(data.answer || data.chunks.map(r => r.text || '').join("\n\n"));
      } else {
        setSynthesisAnswer("Error: Payload format unrecognized.");
      }
    } catch (err) {
      setSynthesisAnswer(`Network Error: ${err.message}`);
    } finally {
      setIsQuerying(false);
      inputRef.current?.focus();
    }
  };

  const handleSeedData = async () => {
    if (!token || !workspaceId) return;
    try {
      await fetch(`${API_URL}/integrations/test-trigger`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'workspace-id': workspaceId
        }
      });
    } catch (err) {
      console.error('Failed to trigger seed event:', err);
    }
  };

  const eventTypeColor = (type = '') => {
    if (type.includes('EXECUTIVE_SYNTHESIS_READY')) return '#ffd700';
    if (type.includes('AGENT_ROUTING_STARTED')) return '#f59e0b';
    if (type.includes('CRITIC_EVALUATION_FAILED')) return '#fb7185';
    if (type.includes('QUERY_SYNTHESIS_COMPLETE')) return '#00e5ff';
    if (type.includes('INTEL_STORED')) return '#00ffaa';
    if (type.includes('INGESTION')) return '#38bdf8';
    if (type.includes('PRIVACY')) return '#f97316';
    if (type.includes('DROPPED')) return '#ef4444';
    if (type.includes('MEMORY')) return '#a78bfa';
    if (type.includes('CONNECTION')) return '#00b4a8';
    return '#7c8ca0';
  };

  return (
    <PageContainer className="p-0 max-w-none space-y-0 h-[calc(100vh-4rem)] flex flex-col md:flex-row overflow-hidden divide-y md:divide-y-0 md:divide-x divide-border-flow/80">
      
      {/* ── LEFT COLUMN ── */}
      <div className="flex-1 flex flex-col overflow-y-auto p-6 space-y-6">
        
        {/* Stat Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-bg-card border border-border-flow rounded-xl p-4">
            <span className="block text-[10px] font-bold text-text-muted uppercase tracking-wider">Chunks Indexed</span>
            <span className="block text-xl font-bold text-text-primary mt-1">{stats.chunksIndexed.toLocaleString()}</span>
          </div>
          <div className="bg-bg-card border border-border-flow rounded-xl p-4">
            <span className="block text-[10px] font-bold text-text-muted uppercase tracking-wider">Total Nodes</span>
            <span className="block text-xl font-bold text-text-primary mt-1">{stats.totalNodes.toLocaleString()}</span>
          </div>
          <div className="bg-bg-card border border-border-flow rounded-xl p-4">
            <span className="block text-[10px] font-bold text-text-muted uppercase tracking-wider">Ingestion Cycles</span>
            <span className="block text-xl font-bold text-text-primary mt-1">{stats.ingestionCycles.toLocaleString()}</span>
          </div>
          <div className="bg-bg-card border border-border-flow rounded-xl p-4 flex items-center justify-between">
            <div>
              <span className="block text-[10px] font-bold text-text-muted uppercase tracking-wider">Synapse Engine</span>
              <span className="block text-sm font-bold text-success mt-1">ACTIVE</span>
            </div>
            <div className="w-2.5 h-2.5 rounded-full bg-success animate-ping" />
          </div>
        </div>

        {/* Synthesis Dashboard */}
        <div className="flex-1 min-h-[300px] bg-bg-card border border-border-flow rounded-xl overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-border-flow bg-bg-secondary/40 flex items-center space-x-2">
            <Terminal className="w-4 h-4 text-flow-purple" />
            <span className="text-ui-sm font-semibold text-text-primary uppercase tracking-wider">Cognitive Engine Synthesis</span>
          </div>

          {synthesis && (
            <div className="px-4 py-2 border-b border-border-flow bg-bg-secondary/20 flex flex-wrap gap-x-4 gap-y-1 text-ui-xs text-text-secondary select-none">
              <span>QUERY: <strong className="text-text-primary">{synthesis.query}</strong></span>
              <span>•</span>
              <span>{synthesis.chunks?.length || 0} NODES RETRIEVED</span>
            </div>
          )}

          <div className="flex-1 p-4 overflow-y-auto">
            <pre className="text-ui-sm text-text-primary font-mono whitespace-pre-wrap leading-relaxed select-text">
              {synthesisAnswer || "Awaiting query dispatch matrix..."}
            </pre>
          </div>

          {synthesis?.chunks && (
            <details className="border-t border-border-flow/80 group">
              <summary className="px-4 py-2 text-ui-xs font-bold text-text-secondary hover:text-text-primary bg-bg-secondary/30 cursor-pointer select-none outline-none">
                VIEW RAW INTEL CHUNKS
              </summary>
              <div className="p-4 space-y-4 max-h-60 overflow-y-auto border-t border-border-flow/60 bg-bg-primary/20">
                {synthesis.chunks.map((chunk, idx) => (
                  <div key={idx} className="p-3 bg-bg-secondary border border-border-flow rounded-lg space-y-2">
                    <div className="flex flex-wrap gap-x-4 text-[10px] text-text-muted font-mono">
                      <span>SCORE: {(chunk.score || 0).toFixed(4)}</span>
                      <span>SOURCE: {chunk.source || 'UNKNOWN'}</span>
                      <span>TOPIC: {chunk.topicId || 'UNCLASSIFIED'}</span>
                    </div>
                    <p className="text-ui-xs text-text-secondary font-sans leading-relaxed select-text">{chunk.text}</p>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>

        {/* Query Input form */}
        <div className="bg-bg-card border border-border-flow rounded-xl p-4 space-y-4">
          <span className="block text-[10px] font-bold text-text-secondary uppercase tracking-wider">
            Cognitive Search Query Dispatch
          </span>

          {chunks && chunks.length > 0 && (
            <div className="max-h-28 overflow-y-auto bg-success/5 border border-success/20 p-3 rounded-lg space-y-2">
              {chunks.map((chunk, idx) => (
                <div key={idx} className="text-ui-xs text-success border-l border-success pl-2">
                  {chunk.text}
                </div>
              ))}
            </div>
          )}

          <form onSubmit={handleQuery} className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              className="flex-1 bg-bg-primary hover:bg-bg-primary/80 focus:bg-bg-primary border border-border-flow focus:border-flow-purple/60 rounded-lg px-3 py-2 text-ui-base text-text-primary placeholder:text-text-muted transition-apple focus:outline-none focus:ring-1 focus:ring-flow-purple/35"
              placeholder="Type a RAG query and press Enter..."
              value={queryText || ''}
              onChange={(e) => setQueryText(e.target.value)}
              disabled={isQuerying}
            />
            <button
              type="submit"
              className="px-4 py-2 bg-flow-purple hover:bg-flow-purple/90 text-white border border-flow-purple/30 rounded-lg text-ui-sm font-semibold transition-apple select-none cursor-pointer flex items-center"
              disabled={isQuerying}
            >
              {isQuerying ? "SYNTHESIZING..." : "QUERY ↵"}
            </button>
          </form>
        </div>

        {/* Seed trigger action */}
        <div className="flex items-center justify-between p-4 bg-bg-card/45 border border-border-flow rounded-xl">
          <div className="flex flex-col">
            <span className="text-ui-xs font-semibold text-text-primary">Seed Developer Test Intel</span>
            <span className="text-[10px] text-text-muted">Injects safe test engineering documents via RAG integrations.</span>
          </div>
          <button
            onClick={handleSeedData}
            className="px-3 py-1.5 bg-bg-hover text-text-primary hover:text-white border border-border-flow rounded-lg text-[10px] font-bold tracking-wider uppercase cursor-pointer transition-apple"
          >
            ↯ SEED TEST INTEL
          </button>
        </div>

      </div>

      {/* ── RIGHT COLUMN: LIVE EVENT STREAM ── */}
      <aside className="w-full md:w-80 flex flex-col h-1/3 md:h-full flex-shrink-0 bg-bg-secondary/10">
        <div className="px-4 py-3 border-b border-border-flow bg-bg-secondary/40 flex items-center justify-between">
          <span className="text-ui-xs font-bold text-text-secondary uppercase tracking-wider flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-flow-purple animate-pulse" />
            Live Intel Stream
          </span>
          <span className="text-[10px] font-bold text-text-muted bg-bg-secondary border border-border-flow px-1.5 py-0.5 rounded">
            {liveEvents.length} EVENTS
          </span>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4" ref={eventFeedRef}>
          {liveEvents.length === 0 ? (
            <div className="h-full flex items-center justify-center text-ui-sm text-text-muted">
              Awaiting WebSocket frames...
            </div>
          ) : (
            liveEvents.map((ev) => (
              <div key={ev.id} className="p-3 bg-bg-card border border-border-flow rounded-lg space-y-2 select-text">
                <div className="flex items-center justify-between text-[9px] font-bold">
                  <span style={{ color: eventTypeColor(ev.type) }}>{ev.type}</span>
                  <span className="text-text-muted">{ev.timestamp}</span>
                </div>
                <pre className="text-[10px] font-mono text-text-secondary overflow-x-auto max-h-32 p-2 bg-bg-primary/40 rounded border border-border-flow/40">
                  {JSON.stringify(ev.payload || ev, null, 2)}
                </pre>
              </div>
            ))
          )}
        </div>
      </aside>

    </PageContainer>
  );
};

export default DeveloperConsole;
