import { useState, useEffect, useRef } from 'react'
import './App.css'

const WS_URL  = 'ws://localhost:5001'
const API_URL = 'http://localhost:5001/api'

function App() {
  const [queryText, setQueryText]   = useState('')
  const [isQuerying, setIsQuerying] = useState(false)
  const [synthesis, setSynthesis]   = useState(null)   // { answer, chunks, resultCount }
  const [synthesisAnswer, setSynthesisAnswer] = useState("");
  const [chunks, setChunks]         = useState([]);
  const [liveEvents, setLiveEvents] = useState([])
  const [wsStatus, setWsStatus]     = useState('CONNECTING')
  const [stats, setStats]           = useState({
    chunksIndexed: 0,
    totalNodes: 0,
    ingestionCycles: 0,
  })

  const wsRef        = useRef(null)
  const eventFeedRef = useRef(null)
  const inputRef     = useRef(null)

  // ── WebSocket live feed ────────────────────────────────────────────────────
  useEffect(() => {
    let reconnectTimer = null

    function connect() {
      const ws = new WebSocket(WS_URL)
      wsRef.current = ws

      ws.onopen = () => {
        setWsStatus('ONLINE')
        // Register as workspace_corp_alpha tenant
        ws.send(JSON.stringify({ type: 'REGISTER', workspaceId: 'workspace_corp_alpha' }))
      }

      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data)

          // broadcastToWorkspace frames use `eventType`; direct messages use `type`
          const eventName = msg.eventType || msg.type || msg.event || 'EVENT'

          // Update live event feed
          setLiveEvents(prev => {
            const entry = {
              id:        Date.now() + Math.random(),
              type:      eventName,
              payload:   msg.payload || msg,
              timestamp: new Date().toLocaleTimeString(),
            }
            return [entry, ...prev].slice(0, 40)  // cap at 40 entries
          })

          // Mirror dashboard stats on INTEL_STORED events
          if (eventName === 'INTEL_STORED' && (msg.payload?.status === 'SUCCESS' || msg.status === 'SUCCESS')) {
            const p = msg.payload || msg
            setStats(prev => ({
              chunksIndexed:   p.chunksIndexed   || prev.chunksIndexed || 1,
              totalNodes:      p.totalNodes       || prev.totalNodes || 1,
              ingestionCycles: p.ingestionCycles  || prev.ingestionCycles || 1,
            }))
          }

          // Update node count on QUERY_SYNTHESIS_COMPLETE
          if (eventName === 'QUERY_SYNTHESIS_COMPLETE') {
            const p = msg.payload || msg
            if (p.resultCount > 0) {
              setStats(prev => ({
                ...prev,
                totalNodes: p.resultCount,
              }))
            }
          }
        } catch {
          return
        }
      }

      ws.onclose = () => {
        setWsStatus('RECONNECTING')
        reconnectTimer = setTimeout(connect, 3000)
      }

      ws.onerror = () => {
        setWsStatus('ERROR')
        ws.close()
      }
    }

    connect()
    return () => {
      clearTimeout(reconnectTimer)
      wsRef.current?.close()
    }
  }, [])

  // Auto-scroll event feed to top on new events
  useEffect(() => {
    if (eventFeedRef.current) eventFeedRef.current.scrollTop = 0
  }, [liveEvents])

  // ── Query submission → Cognitive Synthesis ──────────────────────────────
  const handleQuery = async (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const localQueryText = queryText.trim();
    console.log("⌨️ [FRONTEND] Form Submit Event captured. Text:", localQueryText);

    if (!localQueryText) {
      console.warn("⚠️ [FRONTEND] Empty query attempt blocked.");
      return;
    }
    if (isQuerying) {
      console.warn("⏳ [FRONTEND] Concurrency block: synthesis already in progress.");
      return;
    }

    setIsQuerying(true);

    try {
      const res = await fetch(`${API_URL}/integrations/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: localQueryText })
      });

      console.log("📡 [FRONTEND] Network response status received:", res.status);
      const data = await res.json();
      console.log("📦 [FRONTEND] Full raw payload received from backend:", data);

      if (data.answer || (data.chunks && data.chunks.length > 0)) {
        console.log("🎯 Setting synthesis state with full data payload.");
        setSynthesis(data);
        if (data.chunks) setChunks(data.chunks);
        
        if (data.answer) {
          setSynthesisAnswer(data.answer);
        } else {
          const fallbackText = data.chunks.map(r => r.text || '').join("\n\n");
          setSynthesisAnswer(fallbackText);
        }
      } else {
        console.log("❌ Error: Payload structure unknown or missing keys.", data);
        setSynthesisAnswer("Error: Payload format unrecognized.");
      }
    } catch (err) {
      console.error("💥 Fatal error during frontend query processing:", err);
      setSynthesisAnswer(`Network Error: ${err.message}`);
    } finally {
      setIsQuerying(false);
      inputRef.current?.focus();
    }
  };

  // ── Seed test data via test-trigger ────────────────────────────────────
  async function handleSeedData() {
    try {
      await fetch(`${API_URL}/integrations/test-trigger`)
    } catch (error) {
      console.error('Seed trigger failed:', error)
    }
  }

  useEffect(() => {
    const forceQueryDispatch = async (forcedText) => {
      console.log("💥 [FORCE PROTOCOL] Intercepted text directly from window:", forcedText);
      try {
        const res = await fetch(`${API_URL}/integrations/query`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: forcedText })
        });
        const data = await res.json();
        console.log("📦 [FORCE PROTOCOL] Raw JSON arrived:", data);
        
        if (data.chunks) {
          const textDump = data.chunks.map(r => r.text || '').join("\n\n");
          alert("🎯 PIPELINE CONNECTED!\n\n" + textDump);
        }
      } catch(e) {
        console.error(e);
      }
    };

    window.forceQueryDispatch = forceQueryDispatch
    return () => {
      delete window.forceQueryDispatch
    }
  }, [])

  // ── Helpers ──────────────────────────────────────────────────────────────
  function wsStatusBadge() {
    const map = {
      ONLINE:       { label: 'ONLINE',       cls: 'badge--green'  },
      CONNECTING:   { label: 'CONNECTING',   cls: 'badge--yellow' },
      RECONNECTING: { label: 'RECONNECTING', cls: 'badge--yellow' },
      ERROR:        { label: 'ERROR',        cls: 'badge--red'    },
    }
    const { label, cls } = map[wsStatus] || map.ERROR
    return <span className={`ws-badge ${cls}`}><span className="ws-dot" />{label}</span>
  }

  function eventTypeColor(type = '') {
    if (type.includes('EXECUTIVE_SYNTHESIS_READY'))  return '#ffd700'  // gold           · final answer ready
    if (type.includes('AGENT_ROUTING_STARTED'))       return '#f59e0b'  // --accent-amber · routing stage
    if (type.includes('CRITIC_EVALUATION_FAILED'))    return '#fb7185'  // rose           · critic found issues
    if (type.includes('QUERY_SYNTHESIS_COMPLETE'))    return '#00e5ff'  // --accent-cyan  · query results
    if (type.includes('INTEL_STORED'))                return '#00ffaa'  // --accent-green · new intel saved
    if (type.includes('INGESTION'))                   return '#38bdf8'  // sky-blue       · pipeline running
    if (type.includes('PRIVACY'))                     return '#f97316'  // --accent-orange· privacy gate
    if (type.includes('DROPPED'))                     return '#ef4444'  // --accent-red   · data dropped
    if (type.includes('MEMORY'))                      return '#a78bfa'  // violet         · memory brain
    if (type.includes('CONNECTION'))                  return '#00b4a8'  // --accent-teal  · ws handshake
    return '#7c8ca0'                                                     // dim-grey       · unknown events
  }

  return (
    <div className="os-shell">

      {/* ── Top navigation bar ─────────────────────────────────────── */}
      <header className="os-topbar">
        <div className="os-topbar__brand">
          <span className="os-topbar__sigil">◈</span>
          <span className="os-topbar__name">FLOW<span className="accent">OS</span></span>
          <span className="os-topbar__version">v2.1.0 // COGNITIVE MESH</span>
        </div>
        <div className="os-topbar__right">
          <span className="os-topbar__workspace">WORKSPACE: <b>CORP_ALPHA</b></span>
          {wsStatusBadge()}
        </div>
      </header>

      {/* ── Main layout: left panel + right feed ───────────────────── */}
      <main className="os-main">

        {/* ── LEFT COLUMN ──────────────────────────────────────────── */}
        <div className="os-left">

          {/* Stat grid */}
          <div className="stat-grid">
            <div className="stat-card">
              <div className="stat-card__label">CHUNKS INDEXED</div>
              <div className="stat-card__value">{stats.chunksIndexed.toLocaleString()}</div>
            </div>
            <div className="stat-card">
              <div className="stat-card__label">TOTAL NODES</div>
              <div className="stat-card__value">{stats.totalNodes.toLocaleString()}</div>
            </div>
            <div className="stat-card">
              <div className="stat-card__label">INGESTION CYCLES</div>
              <div className="stat-card__value">{stats.ingestionCycles.toLocaleString()}</div>
            </div>
            <div className="stat-card">
              <div className="stat-card__label">SYNAPSE ENGINE</div>
              <div className="stat-card__value stat-card__value--active">ACTIVE</div>
            </div>
          </div>

          <div className="synthesis-card">
            <div className="synthesis-card__header">
              <div className="synthesis-card__pulse" />
              <div className="synthesis-card__title">CENTRAL INTELLECT SYNTHESIS // ACTIVE</div>
            </div>

            {synthesis && (
              <div className="synthesis-card__meta">
                <span className="synthesis-card__query-label">QUERY:</span>
                <span className="synthesis-card__query-text">{synthesis.query}</span>
                <span className="synthesis-card__nodes">{synthesis.chunks?.length || 0} NODES RETRIEVED</span>
              </div>
            )}

            <div style={{ padding: '16px', overflowY: 'auto', flex: 1 }}>
              <div className="synthesis-card__answer">
                {synthesisAnswer || "Awaiting query dispatch matrix..."}
              </div>
            </div>

            {synthesis?.chunks && (
              <details className="synthesis-card__chunks-toggle">
                <summary>VIEW RAW INTEL CHUNKS</summary>
                <div className="synthesis-card__chunks">
                  {synthesis.chunks.map((chunk, idx) => (
                    <div key={idx} className="chunk-node">
                      <div className="chunk-node__meta">
                        <span className="chunk-node__score">SCORE: {(chunk.score || 0).toFixed(4)}</span>
                        <span className="chunk-node__source">SOURCE: {chunk.source || 'UNKNOWN'}</span>
                        <span className="chunk-node__topic">TOPIC: {chunk.topicId || 'UNCLASSIFIED'}</span>
                      </div>
                      <p className="chunk-node__text">{chunk.text}</p>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>

          {/* ── Query input bar ───────────────────────────────────────── */}
          <div className="query-bar">
            <div className="query-bar__label">COGNITIVE SEARCH QUERY DISPATCH</div>

            {chunks && chunks.length > 0 && (
              <div className="instant-results-feed" style={{ 
                maxHeight: '200px', 
                overflowY: 'auto', 
                background: 'rgba(0, 255, 170, 0.03)', 
                border: '1px solid var(--border-dim)', 
                padding: '12px', 
                marginBottom: '12px',
                borderRadius: '4px'
              }}>
                {chunks.map((chunk, idx) => (
                  <div key={idx} style={{ 
                    color: 'var(--accent-green)', 
                    fontSize: '12px', 
                    marginBottom: '8px', 
                    paddingLeft: '10px', 
                    borderLeft: '2px solid var(--accent-teal)' 
                  }}>
                    {chunk.text}
                  </div>
                ))}
              </div>
            )}

            <form onSubmit={handleQuery} className="query-bar__row">
              <input 
                ref={inputRef}
                type="text"
                className="query-bar__input"
                placeholder="Type a RAG query and press Enter..."
                value={queryText || ''}
                onChange={(e) => setQueryText(e.target.value)}
                disabled={isQuerying}
              />
              <button 
                type="submit"
                className={`query-bar__btn ${isQuerying ? 'query-bar__btn--loading' : ''}`}
                disabled={isQuerying}
              >
                {isQuerying ? (
                  <>
                    <div className="spinner" style={{ marginRight: '8px' }} />
                    SYNTHESIZING...
                  </>
                ) : (
                  'QUERY ↵'
                )}
              </button>
            </form>
          </div>

          {/* Seed button */}
          <div className="seed-row">
            <button
              id="seed-data-btn"
              className="seed-btn"
              type="button"
              onClick={handleSeedData}
            >
              ↯ SEED TEST INTEL
            </button>
            <span className="seed-hint">Injects safe engineering payload via /test-trigger</span>
          </div>
        </div>

        {/* ── RIGHT COLUMN: live event feed ─────────────────────────── */}
        <aside className="os-right">
          <div className="feed-header">
            <span className="feed-header__title">◎ LIVE INTEL STREAM</span>
            <span className="feed-header__count">{liveEvents.length} EVENTS</span>
          </div>
          <div className="event-feed" ref={eventFeedRef}>
            {liveEvents.length === 0 ? (
              <div className="event-feed__empty">
                Awaiting WebSocket frames…
              </div>
            ) : (
              liveEvents.map(ev => (
                <div key={ev.id} className="event-item">
                  <div className="event-item__header">
                    <span
                      className="event-item__type"
                      style={{ color: eventTypeColor(ev.type) }}
                    >
                      {ev.type}
                    </span>
                    <span className="event-item__time">{ev.timestamp}</span>
                  </div>
                  <pre className="event-item__payload">
                    {JSON.stringify(ev.payload, null, 2)}
                  </pre>
                </div>
              ))
            )}
          </div>
        </aside>
      </main>
    </div>
  )
}

export default App
