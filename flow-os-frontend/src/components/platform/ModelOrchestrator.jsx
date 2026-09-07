import { useState, useEffect, useCallback } from 'react';
import { Cpu, Zap, DollarSign, Activity, TestTube2, FileText, RotateCcw, ChevronDown, ChevronRight, Play, Check, X, RefreshCw, AlertCircle } from 'lucide-react';

const API = '/api/ai';
const token = () => localStorage.getItem('flow_token') || localStorage.getItem('token') || '';
const headers = () => ({ 'Content-Type': 'application/json', 'Authorization': `Bearer ${token()}` });

async function apiFetch(path, opts = {}) {
  const r = await fetch(`${API}${path}`, { headers: headers(), ...opts });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

// ── Tiny design-token–safe primitives ─────────────────────────────────────────
const Card = ({ children, style = {} }) => (
  <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, ...style }}>
    {children}
  </div>
);

const Badge = ({ children, color = 'var(--t3)' }) => (
  <span style={{ background: color + '18', color, borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600, letterSpacing: '0.04em' }}>
    {children}
  </span>
);

const StatusDot = ({ status }) => {
  const c = status === 'healthy' ? 'var(--ok)' : status === 'degraded' ? 'var(--warn)' : 'var(--crit)';
  return <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: c, marginRight: 6 }} />;
};

const MetricCell = ({ label, value, sub }) => (
  <div>
    <div style={{ fontSize: 11, color: 'var(--t4)', marginBottom: 2 }}>{label}</div>
    <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--t1)' }}>{value ?? '—'}</div>
    {sub && <div style={{ fontSize: 11, color: 'var(--t5)' }}>{sub}</div>}
  </div>
);

// ── Provider Health Cards ──────────────────────────────────────────────────────
function ProviderCard({ p, metrics }) {
  const m   = metrics?.find(m => m.provider === p.provider) ?? {};
  const lat = m.latency?.avg;

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <StatusDot status={p.status} />
        <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--t1)', textTransform: 'capitalize' }}>{p.provider}</span>
        {p.isDefault  && <Badge color="var(--brand)">Default</Badge>}
        {p.isFallback && <Badge color="var(--t4)">Fallback</Badge>}
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--t4)' }}>{p.latencyMs}ms ping</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        <MetricCell label="Avg Latency"  value={lat ? `${lat}ms` : '—'} />
        <MetricCell label="Error Rate"   value={m.errorRate != null ? `${m.errorRate}%` : '—'} />
        <MetricCell label="Cache Hit"    value={m.cacheHitRate != null ? `${m.cacheHitRate}%` : '—'} />
      </div>
      <div style={{ marginTop: 12, fontSize: 11, color: 'var(--t5)' }}>
        Models: {p.models?.slice(0, 3).join(', ') || '—'}
      </div>
    </Card>
  );
}

// ── Evaluation Panel ──────────────────────────────────────────────────────────
function EvalPanel() {
  const [prompt,   setPrompt]   = useState('');
  const [taskType, setTaskType] = useState('chat');
  const [result,   setResult]   = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState(null);
  const [expanded, setExpanded] = useState(null);

  async function runEval() {
    if (!prompt.trim()) return;
    setLoading(true); setError(null); setResult(null);
    try {
      const data = await apiFetch('/evaluate', {
        method: 'POST', body: JSON.stringify({ prompt, taskType }),
      });
      setResult(data);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 10 }}>
        <select
          value={taskType}
          onChange={e => setTaskType(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--t1)', fontSize: 13 }}
        >
          {['chat','summarize','classify','reason','plan','extract_entities'].map(t => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <textarea
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          placeholder="Enter a prompt to run through all providers…"
          rows={2}
          style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--t1)', fontSize: 13, resize: 'vertical' }}
        />
        <button
          onClick={runEval}
          disabled={loading || !prompt.trim()}
          style={{ padding: '8px 20px', borderRadius: 8, background: 'var(--brand)', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600, opacity: loading ? 0.6 : 1 }}
        >
          {loading ? 'Running…' : 'Run'}
        </button>
      </div>

      {error && <div style={{ color: 'var(--crit)', fontSize: 13 }}>{error}</div>}

      {result && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
            <MetricCell label="Providers queried" value={result.summary?.providersQueried} />
            <MetricCell label="Succeeded"         value={result.summary?.providersSucceeded} />
            <MetricCell label="Fastest"           value={result.summary?.fastestProvider || '—'} />
            <MetricCell label="Agreement"         value={result.summary?.agreement != null ? `${result.summary.agreement}%` : '—'} />
          </div>
          {result.responses?.map(r => (
            <Card key={r.provider} style={{ padding: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontWeight: 700, textTransform: 'capitalize', color: 'var(--t1)' }}>{r.provider}</span>
                <Badge color={r.status === 'success' ? 'var(--ok)' : 'var(--crit)'}>{r.status}</Badge>
                {r.latencyMs && <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--t4)' }}>{r.latencyMs}ms</span>}
                {r.costUsd   && <span style={{ fontSize: 12, color: 'var(--t4)' }}>${r.costUsd.toFixed(6)}</span>}
                <button
                  onClick={() => setExpanded(expanded === r.provider ? null : r.provider)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t4)', padding: 0 }}
                >
                  {expanded === r.provider ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
              </div>
              {expanded === r.provider && (
                <pre style={{ fontSize: 12, color: 'var(--t2)', whiteSpace: 'pre-wrap', margin: 0, maxHeight: 200, overflow: 'auto' }}>
                  {r.text || r.error}
                </pre>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Prompt Manager ────────────────────────────────────────────────────────────
function PromptManager() {
  const [prompts,   setPrompts]   = useState([]);
  const [selected,  setSelected]  = useState(null);
  const [versions,  setVersions]  = useState([]);
  const [newContent, setNew]      = useState('');
  const [newDesc,    setNewDesc]  = useState('');
  const [loading,   setLoading]   = useState(false);

  useEffect(() => {
    apiFetch('/prompts').then(d => setPrompts(d.prompts ?? [])).catch(() => {});
  }, []);

  async function loadVersions(name) {
    setSelected(name);
    const d = await apiFetch(`/prompts/${name}`);
    setVersions(d.versions ?? []);
  }

  async function createNew() {
    if (!selected || !newContent.trim()) return;
    setLoading(true);
    try {
      await apiFetch(`/prompts/${selected}/versions`, { method: 'POST', body: JSON.stringify({ content: newContent, description: newDesc }) });
      await loadVersions(selected);
      setNew(''); setNewDesc('');
    } finally { setLoading(false); }
  }

  async function toggleActivate(v) {
    const action = v.active ? 'deactivate' : 'activate';
    await apiFetch(`/prompts/${selected}/versions/${v.version}/${action}`, { method: 'PATCH' });
    await loadVersions(selected);
  }

  async function doRollback() {
    await apiFetch(`/prompts/${selected}/rollback`, { method: 'POST' });
    await loadVersions(selected);
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 16 }}>
      {/* Prompt list */}
      <Card style={{ padding: 12 }}>
        <div style={{ fontSize: 11, color: 'var(--t4)', fontWeight: 600, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Prompts</div>
        {prompts.length === 0 && <div style={{ fontSize: 13, color: 'var(--t5)' }}>None yet</div>}
        {prompts.map(p => (
          <div
            key={p.name}
            onClick={() => loadVersions(p.name)}
            style={{ padding: '8px 10px', borderRadius: 8, cursor: 'pointer', marginBottom: 4,
              background: selected === p.name ? 'var(--brand)18' : 'transparent',
              color: selected === p.name ? 'var(--brand)' : 'var(--t2)', fontSize: 13, fontWeight: 500 }}
          >
            {p.name}
            <span style={{ float: 'right', fontSize: 11, color: 'var(--t5)' }}>v{p.latest_version}</span>
          </div>
        ))}
      </Card>

      {/* Version editor */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {selected ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontWeight: 700, fontSize: 16, color: 'var(--t1)' }}>{selected}</span>
              <button onClick={doRollback} style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'none', color: 'var(--t3)', cursor: 'pointer', fontSize: 12 }}>
                <RotateCcw size={12} /> Rollback
              </button>
            </div>
            {versions.map(v => (
              <Card key={v.version} style={{ padding: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <Badge color={v.active ? 'var(--ok)' : 'var(--t4)'}>{v.active ? 'Active' : 'Inactive'}</Badge>
                  <span style={{ fontSize: 13, color: 'var(--t2)', fontWeight: 600 }}>v{v.version}</span>
                  {v.description && <span style={{ fontSize: 12, color: 'var(--t4)' }}>{v.description}</span>}
                  <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--t5)' }}>weight {v.ab_weight}</span>
                  <button
                    onClick={() => toggleActivate(v)}
                    style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'none', color: v.active ? 'var(--crit)' : 'var(--ok)', cursor: 'pointer', fontSize: 12 }}
                  >
                    {v.active ? <X size={12} /> : <Check size={12} />}
                  </button>
                </div>
                <pre style={{ fontSize: 12, color: 'var(--t3)', whiteSpace: 'pre-wrap', margin: 0, maxHeight: 120, overflow: 'auto' }}>
                  {v.content}
                </pre>
              </Card>
            ))}
            <Card style={{ padding: 14 }}>
              <div style={{ fontSize: 12, color: 'var(--t4)', marginBottom: 8, fontWeight: 600 }}>New version</div>
              <input
                value={newDesc}
                onChange={e => setNewDesc(e.target.value)}
                placeholder="Description (optional)"
                style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--t1)', fontSize: 12, marginBottom: 8, boxSizing: 'border-box' }}
              />
              <textarea
                value={newContent}
                onChange={e => setNew(e.target.value)}
                placeholder="Prompt content… use {{variable}} for interpolation"
                rows={4}
                style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--t1)', fontSize: 12, resize: 'vertical', boxSizing: 'border-box' }}
              />
              <button
                onClick={createNew}
                disabled={loading || !newContent.trim()}
                style={{ marginTop: 8, padding: '7px 18px', borderRadius: 8, background: 'var(--brand)', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13, opacity: loading ? 0.6 : 1 }}
              >
                Create version
              </button>
            </Card>
          </>
        ) : (
          <div style={{ color: 'var(--t5)', fontSize: 13, paddingTop: 20 }}>Select a prompt to manage its versions</div>
        )}
      </div>
    </div>
  );
}

// ── Cost trend bar chart ──────────────────────────────────────────────────────
function CostTrend({ trend }) {
  if (!trend?.length) return <div style={{ color: 'var(--t5)', fontSize: 13 }}>No cost data yet</div>;

  const max = Math.max(...trend.map(t => Number(t.cost_usd ?? 0)));
  const byProvider = trend.reduce((acc, row) => {
    if (!acc[row.provider]) acc[row.provider] = [];
    acc[row.provider].push(row);
    return acc;
  }, {});

  const colors = { gemini: 'var(--ok)', openai: 'var(--brand)', anthropic: 'var(--warn)', ollama: 'var(--t4)' };

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
        {Object.keys(byProvider).map(p => (
          <span key={p} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--t3)' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: colors[p] ?? 'var(--t4)', display: 'inline-block' }} />{p}
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 80 }}>
        {trend.slice(-24).map((row, i) => (
          <div
            key={i}
            title={`${row.provider} — $${Number(row.cost_usd ?? 0).toFixed(6)} (${row.requests} req)`}
            style={{ flex: 1, height: max > 0 ? `${(Number(row.cost_usd ?? 0) / max) * 100}%` : 4,
              minHeight: 4, borderRadius: 3, background: colors[row.provider] ?? 'var(--t4)', opacity: 0.8 }}
          />
        ))}
      </div>
      <div style={{ fontSize: 11, color: 'var(--t5)', marginTop: 6 }}>24h cost by provider (hourly bars)</div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
const TABS = ['Providers', 'Metrics', 'Evaluate', 'Prompts'];

export default function ModelOrchestrator() {
  const [tab,      setTab]      = useState('Providers');
  const [data,     setData]     = useState(null);
  const [metrics,  setMetrics]  = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [provData, metData] = await Promise.all([
        apiFetch('/providers'),
        apiFetch('/metrics'),
      ]);
      setData(provData);
      setMetrics(metData);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div style={{ padding: 32, maxWidth: 1100, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 28 }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--brand)18', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Cpu size={22} style={{ color: 'var(--brand)' }} />
        </div>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--t1)', margin: 0 }}>Model Orchestrator</h1>
          <p style={{ margin: '4px 0 0', fontSize: 14, color: 'var(--t4)' }}>
            Provider health, routing strategy, cost telemetry, prompt management, and multi-provider evaluation
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'none', color: 'var(--t3)', cursor: 'pointer', fontSize: 13 }}
        >
          <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} /> Refresh
        </button>
      </div>

      {/* Config strip */}
      {data && (
        <Card style={{ marginBottom: 20, padding: 14 }}>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            <div><span style={{ fontSize: 11, color: 'var(--t5)' }}>Strategy </span><Badge color="var(--brand)">{data.routingStrategy?.toUpperCase()}</Badge></div>
            <div><span style={{ fontSize: 11, color: 'var(--t5)' }}>Default </span><Badge color="var(--ok)">{data.defaultProvider}</Badge></div>
            <div><span style={{ fontSize: 11, color: 'var(--t5)' }}>Fallback </span><Badge color="var(--warn)">{data.fallback}</Badge></div>
            <div style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--t5)' }}>Set <code>AI_ROUTING_STRATEGY</code> env to change</div>
          </div>
        </Card>
      )}

      {error && (
        <Card style={{ marginBottom: 20, padding: 14, borderColor: 'var(--crit)' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--crit)', fontSize: 13 }}>
            <AlertCircle size={14} /> {error}
          </div>
        </Card>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{ padding: '8px 18px', borderRadius: '8px 8px 0 0', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
              background: tab === t ? 'var(--bg-card)' : 'transparent',
              color: tab === t ? 'var(--t1)' : 'var(--t4)',
              borderBottom: tab === t ? '2px solid var(--brand)' : '2px solid transparent' }}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Tab bodies */}
      {tab === 'Providers' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {loading && <div style={{ color: 'var(--t4)', fontSize: 14 }}>Loading providers…</div>}
          {data?.providers?.map(p => (
            <ProviderCard key={p.provider} p={p} metrics={metrics?.providers} />
          ))}
          {data?.providers?.length === 0 && !loading && (
            <div style={{ color: 'var(--t5)', fontSize: 13 }}>No providers configured</div>
          )}
        </div>
      )}

      {tab === 'Metrics' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {loading && <div style={{ color: 'var(--t4)', fontSize: 14 }}>Loading metrics…</div>}
          {metrics && (
            <>
              <Card>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)', marginBottom: 14 }}>24h Cost Trend</div>
                <CostTrend trend={metrics.costTrend} />
              </Card>
              {metrics.providers?.map(m => (
                <Card key={m.provider}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <span style={{ fontWeight: 700, textTransform: 'capitalize', color: 'var(--t1)' }}>{m.provider}</span>
                    <span style={{ fontSize: 12, color: 'var(--t5)' }}>{m.windowMinutes}min window</span>
                    <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--t4)' }}>{m.requestCount} requests</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 14 }}>
                    <MetricCell label="p50 Latency"  value={m.latency?.p50 ? `${m.latency.p50}ms` : '—'} />
                    <MetricCell label="p95 Latency"  value={m.latency?.p95 ? `${m.latency.p95}ms` : '—'} />
                    <MetricCell label="Error Rate"   value={`${m.errorRate ?? 0}%`} />
                    <MetricCell label="Cache Hit"    value={`${m.cacheHitRate ?? 0}%`} />
                    <MetricCell label="Cost (window)" value={`$${m.estimatedCostUsd ?? 0}`} />
                  </div>
                  {m.taskBreakdown && Object.keys(m.taskBreakdown).length > 0 && (
                    <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {Object.entries(m.taskBreakdown).map(([k, v]) => (
                        <Badge key={k} color="var(--t4)">{k}: {v}</Badge>
                      ))}
                    </div>
                  )}
                </Card>
              ))}
            </>
          )}
        </div>
      )}

      {tab === 'Evaluate' && (
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <TestTube2 size={16} style={{ color: 'var(--brand)' }} />
            <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--t1)' }}>Multi-Provider Evaluation</span>
          </div>
          <p style={{ fontSize: 13, color: 'var(--t4)', marginBottom: 16, marginTop: 0 }}>
            Run the same prompt through all configured providers simultaneously. Compare quality, latency, and cost.
          </p>
          <EvalPanel />
        </Card>
      )}

      {tab === 'Prompts' && (
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <FileText size={16} style={{ color: 'var(--brand)' }} />
            <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--t1)' }}>Prompt Version Manager</span>
          </div>
          <p style={{ fontSize: 13, color: 'var(--t4)', marginBottom: 16, marginTop: 0 }}>
            Create and activate versioned prompts. Multiple active versions split traffic by A/B weight.
            Use <code style={{ fontSize: 12 }}>{'{{variable}}'}</code> syntax for dynamic interpolation.
          </p>
          <PromptManager />
        </Card>
      )}
    </div>
  );
}
