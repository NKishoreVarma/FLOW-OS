/**
 * TrustCenterDashboard — /settings/trust
 *
 * 8-tab transparency platform: Overview, Decisions, Evidence, Policies,
 * Approvals, AI Models, Workflows, Knowledge.
 * All reads from /api/trust/*. Never modifies data.
 */
import { useState, useEffect, useCallback } from 'react';

const API_BASE = '/api/trust';

function authHeaders() {
  const token = localStorage.getItem('flow_token');
  const ws    = localStorage.getItem('flow_workspace_id');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(ws    ? { 'workspace-id': ws } : {}),
  };
}

async function apiFetch(path, opts = {}) {
  const res = await fetch(`${API_BASE}${path}`, { headers: authHeaders(), ...opts });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

const TABS = [
  { id: 'overview',   label: 'Overview' },
  { id: 'decisions',  label: 'Decisions' },
  { id: 'evidence',   label: 'Evidence' },
  { id: 'policies',   label: 'Policies' },
  { id: 'approvals',  label: 'Approvals' },
  { id: 'model',      label: 'AI Models' },
  { id: 'workflow',   label: 'Workflows' },
  { id: 'knowledge',  label: 'Knowledge' },
];

export default function TrustCenterDashboard() {
  const [tab, setTab] = useState('overview');

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '600', color: 'var(--color-ink)', marginBottom: '4px' }}>
          Trust Center
        </h1>
        <p style={{ color: 'var(--color-ink-muted)', fontSize: '14px' }}>
          Complete transparency into every FLOW decision, policy, AI model call, and knowledge source.
        </p>
      </div>

      <div style={{ display: 'flex', gap: '4px', borderBottom: '1px solid var(--color-border)', marginBottom: '24px', overflowX: 'auto' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '8px 16px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px',
            fontWeight: tab === t.id ? '600' : '400', whiteSpace: 'nowrap',
            color: tab === t.id ? 'var(--color-accent, #e8672b)' : 'var(--color-ink-muted, #6b7280)',
            borderBottom: tab === t.id ? '2px solid var(--color-accent, #e8672b)' : '2px solid transparent',
            marginBottom: '-1px', transition: 'color 0.15s',
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview'   && <OverviewTab />}
      {tab === 'decisions'  && <DecisionsTab />}
      {tab === 'evidence'   && <EvidenceTab />}
      {tab === 'policies'   && <PoliciesTab />}
      {tab === 'approvals'  && <ApprovalsTab />}
      {tab === 'model'      && <ModelTab />}
      {tab === 'workflow'   && <WorkflowTab />}
      {tab === 'knowledge'  && <KnowledgeTab />}
    </div>
  );
}

// ─── Overview ─────────────────────────────────────────────────────────────────

function OverviewTab() {
  const [data, setData]   = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.allSettled([
      apiFetch('/decisions?limit=10'),
      apiFetch('/approvals/stats?days=30'),
      apiFetch('/model?days=30'),
      apiFetch('/evidence?days=7'),
    ]).then(([dec, appr, model, evid]) => {
      setData({
        decisions: dec.status   === 'fulfilled' ? dec.value.total    : 0,
        approvals: appr.status  === 'fulfilled' ? appr.value         : null,
        models:    model.status === 'fulfilled' ? model.value.usage  : [],
        evidence:  evid.status  === 'fulfilled' ? evid.value.sources : [],
      });
      setLoading(false);
    });
  }, []);

  if (loading) return <Spinner />;

  const totalCalls  = (data.models ?? []).reduce((s, m) => s + m.calls, 0);
  const totalCost   = (data.models ?? []).reduce((s, m) => s + m.estimatedCostUsd, 0);

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '28px' }}>
        <Stat label="Recent Decisions"  value={data.decisions} sub="last 50" />
        <Stat label="Pending Approvals" value={data.approvals?.byStatus?.PENDING ?? 0} sub="awaiting review" accent />
        <Stat label="AI Calls (30d)"    value={totalCalls.toLocaleString()} sub="model invocations" />
        <Stat label="Est. AI Cost (30d)" value={`$${totalCost.toFixed(4)}`} sub="USD estimate" />
        <Stat label="Knowledge Sources" value={data.evidence.length} sub="active connectors (7d)" />
        <Stat label="Avg Approval Time" value={data.approvals?.avgResolutionMins != null ? `${data.approvals.avgResolutionMins}m` : '—'} sub="30-day average" />
      </div>
      {data.models.length > 0 && (
        <Section title="Model Usage Breakdown">
          <DataTable
            cols={['Model', 'Calls', 'Input Tokens', 'Output Tokens', 'Est. Cost (USD)', 'Avg Latency']}
            rows={data.models.map(m => [
              m.model,
              m.calls.toLocaleString(),
              (m.inputTokens ?? 0).toLocaleString(),
              (m.outputTokens ?? 0).toLocaleString(),
              `$${m.estimatedCostUsd.toFixed(6)}`,
              m.avgLatencyMs ? `${m.avgLatencyMs}ms` : '—',
            ])}
          />
        </Section>
      )}
      {data.evidence.length > 0 && (
        <Section title="Knowledge Sources (Last 7 Days)">
          <DataTable
            cols={['Source', 'Chunks', 'Avg Authority', 'Latest']}
            rows={data.evidence.map(s => [s.source, s.totalChunks.toLocaleString(), s.avgAuthority ?? '—', s.latestAt ? new Date(s.latestAt).toLocaleDateString() : '—'])}
          />
        </Section>
      )}
    </div>
  );
}

// ─── Decisions ────────────────────────────────────────────────────────────────

function DecisionsTab() {
  const [decisions, setDecisions] = useState([]);
  const [selected,  setSelected]  = useState(null);
  const [detail,    setDetail]    = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [filter,    setFilter]    = useState('');

  useEffect(() => {
    const q = filter ? `?type=${filter}&limit=50` : '?limit=50';
    setLoading(true);
    apiFetch(`/decisions${q}`).then(r => { setDecisions(r.decisions ?? []); setLoading(false); }).catch(() => setLoading(false));
  }, [filter]);

  const select = useCallback(async id => {
    setSelected(id);
    try { setDetail(await apiFetch(`/explain/${id}`)); } catch { setDetail(null); }
  }, []);

  return (
    <SplitPanel
      left={
        <>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '12px' }}>
            {['', 'BRIEFING', 'EXECUTION', 'APPROVAL', 'AUTONOMY_RUN'].map(t => (
              <Chip key={t} label={t || 'All'} active={filter === t} onClick={() => setFilter(t)} />
            ))}
          </div>
          {loading ? <Spinner /> : decisions.length === 0 ? <Empty text="No decisions found" /> : (
            decisions.map(d => (
              <ListRow key={d.id} active={selected === d.id} onClick={() => select(d.id)}>
                <div style={{ fontWeight: '500', fontSize: '13px' }}>{d.title}</div>
                <div style={{ fontSize: '12px', color: 'var(--color-ink-muted)', marginTop: '2px' }}>
                  <TypeBadge type={d.type} /> {d.status && <>&nbsp;<StatusBadge status={d.status} /></>} &nbsp;{d.createdAt ? new Date(d.createdAt).toLocaleDateString() : ''}
                </div>
              </ListRow>
            ))
          )}
        </>
      }
      right={!detail ? <Placeholder text="Select a decision" /> : <DecisionDetail d={detail} />}
    />
  );
}

function DecisionDetail({ d }) {
  return (
    <div>
      <h3 style={{ fontWeight: '600', fontSize: '15px', marginBottom: '8px' }}>{d.title}</h3>
      <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <TypeBadge type={d.type} />
        {d.status && <StatusBadge status={d.status} />}
        {d.riskLevel && <Badge bg="#fef3c7" fg="#92400e">{d.riskLevel}</Badge>}
        {d.confidence != null && <Badge bg="#f0fdf4" fg="#166534">confidence: {d.confidence}%</Badge>}
      </div>
      <Field label="Reason">{d.reason}</Field>
      {d.model && <Field label="Model">{d.model}{d.promptVersion ? ` · v${d.promptVersion}` : ''}</Field>}
      {d.evidenceSources?.length > 0 && (
        <Field label={`Evidence (${d.evidenceSources.length})`}>
          {d.evidenceSources.slice(0, 5).map((e, i) => <EvidenceChip key={i} e={e} />)}
        </Field>
      )}
      {d.knowledgeEntities?.length > 0 && (
        <Field label={`Entities (${d.knowledgeEntities.length})`}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {d.knowledgeEntities.map((e, i) => <Badge key={i} bg="var(--color-surface-2, #f3f4f6)" fg="var(--color-ink)">{e.label ?? e.id}</Badge>)}
          </div>
        </Field>
      )}
      {d.alternativesConsidered?.length > 0 && (
        <Field label="Alternatives Considered">
          <ul style={{ margin: 0, paddingLeft: '16px' }}>
            {d.alternativesConsidered.map((a, i) => <li key={i} style={{ fontSize: '13px', color: 'var(--color-ink-muted)', marginBottom: '4px' }}>{typeof a === 'string' ? a : JSON.stringify(a)}</li>)}
          </ul>
          {d.whyAlternativesRejected && <p style={{ fontSize: '12px', fontStyle: 'italic', color: 'var(--color-ink-muted)', marginTop: '6px' }}>Why rejected: {d.whyAlternativesRejected}</p>}
        </Field>
      )}
    </div>
  );
}

// ─── Evidence ─────────────────────────────────────────────────────────────────

function EvidenceTab() {
  const [summary, setSummary] = useState([]);
  const [ctxId, setCtxId]     = useState('');
  const [result, setResult]   = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch('/evidence?days=7').then(r => { setSummary(r.sources ?? []); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const search = async () => {
    if (!ctxId.trim()) return;
    try { setResult(await apiFetch(`/evidence/${ctxId.trim()}`)); } catch { setResult({ sources: [], totalCount: 0 }); }
  };

  return (
    <div>
      <Section title="Look Up Evidence by Context ID">
        <SearchBar value={ctxId} onChange={setCtxId} onSubmit={search} placeholder="Decision / briefing / query ID…" buttonLabel="Find Evidence" />
        {result && (
          <div style={{ marginTop: '16px' }}>
            <p style={{ fontSize: '13px', color: 'var(--color-ink-muted)', marginBottom: '8px' }}>{result.totalCount} source(s) {result.filtered > 0 ? `(${result.filtered} filtered by permissions)` : ''}</p>
            {result.sources?.length === 0 ? <Empty text="No evidence found for this context" /> : result.sources.map((s, i) => <EvidenceChip key={i} e={s} expanded />)}
          </div>
        )}
      </Section>
      <Section title="Knowledge Sources (Last 7 Days)">
        {loading ? <Spinner /> : summary.length === 0 ? <Empty text="No sources" /> : (
          <DataTable cols={['Source', 'Chunks', 'Avg Authority', 'Latest']} rows={summary.map(s => [s.source, s.totalChunks.toLocaleString(), s.avgAuthority ?? '—', s.latestAt ? new Date(s.latestAt).toLocaleDateString() : '—'])} />
        )}
      </Section>
    </div>
  );
}

// ─── Policies ─────────────────────────────────────────────────────────────────

function PoliciesTab() {
  const [policies, setPolicies] = useState([]);
  const [form, setForm]         = useState({ connector: '', actionType: '', role: 'MEMBER' });
  const [preview, setPreview]   = useState(null);
  const [loading, setLoading]   = useState(true);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    apiFetch('/policies').then(r => { setPolicies(r.policies ?? []); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const runPreview = async () => {
    if (!form.connector || !form.actionType) return;
    try { setPreview(await apiFetch('/policy/preview', { method: 'POST', body: JSON.stringify(form) })); } catch { setPreview(null); }
  };

  return (
    <div>
      <Section title="Policy Simulator">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: '8px', alignItems: 'end' }}>
          {[['connector', 'Connector'], ['actionType', 'Action Type'], ['role', 'Role']].map(([f, lbl]) => (
            <div key={f}>
              <label style={{ display: 'block', fontSize: '12px', color: 'var(--color-ink-muted)', marginBottom: '4px' }}>{lbl}</label>
              <input value={form[f]} onChange={e => setForm(p => ({ ...p, [f]: e.target.value }))} placeholder={lbl}
                style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--color-border)', fontSize: '13px', boxSizing: 'border-box' }} />
            </div>
          ))}
          <button onClick={runPreview} style={{ padding: '8px 14px', background: 'var(--color-accent, #e8672b)', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}>
            Preview
          </button>
        </div>
        {preview && (
          <div style={{ marginTop: '16px', padding: '14px', background: 'var(--color-surface-2, #f9fafb)', borderRadius: '8px' }}>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
              <strong style={{ fontSize: '13px' }}>Effect:</strong>
              <EffectBadge effect={preview.effect} />
            </div>
            {preview.triggeringPolicy && <p style={{ fontSize: '13px', color: 'var(--color-ink-muted)', margin: '4px 0' }}>Policy: <strong>{preview.triggeringPolicy.name}</strong></p>}
            {preview.whatYouCanDo?.length > 0 && (
              <ul style={{ margin: '8px 0 0', paddingLeft: '16px' }}>
                {preview.whatYouCanDo.map((s, i) => <li key={i} style={{ fontSize: '13px', color: 'var(--color-ink)' }}>{s}</li>)}
              </ul>
            )}
          </div>
        )}
      </Section>

      <Section title={`Active Policies (${policies.length})`}>
        {loading ? <Spinner /> : policies.length === 0 ? <Empty text="No policies configured" /> : (
          <DataTable
            cols={['Name', 'Effect', 'Connector', 'Action', 'Enabled']}
            rows={policies.map(p => [p.name, <EffectBadge key={p.id} effect={p.effect} />, p.connectorId ?? 'all', p.actionType ?? 'all', p.enabled ? '✓' : '—'])}
            onRowClick={i => setSelected(selected === i ? null : i)}
          />
        )}
        {selected != null && policies[selected] && (
          <div style={{ marginTop: '12px', padding: '14px', background: 'var(--color-surface-2, #f9fafb)', borderRadius: '8px' }}>
            <h4 style={{ fontWeight: '600', fontSize: '14px', marginBottom: '6px' }}>{policies[selected].name}</h4>
            <p style={{ fontSize: '13px', color: 'var(--color-ink-muted)' }}>{policies[selected].description}</p>
            {Object.keys(policies[selected].conditions ?? {}).length > 0 && (
              <pre style={{ fontSize: '12px', background: 'var(--color-surface)', padding: '8px', borderRadius: '4px', overflow: 'auto', marginTop: '8px' }}>
                {JSON.stringify(policies[selected].conditions, null, 2)}
              </pre>
            )}
          </div>
        )}
      </Section>
    </div>
  );
}

// ─── Approvals ────────────────────────────────────────────────────────────────

function ApprovalsTab() {
  const [approvals, setApprovals] = useState([]);
  const [stats, setStats]         = useState(null);
  const [selected, setSelected]   = useState(null);
  const [detail, setDetail]       = useState(null);
  const [filter, setFilter]       = useState('');
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    const q = filter ? `?status=${filter}&limit=100` : '?limit=100';
    setLoading(true);
    Promise.all([apiFetch(`/approvals${q}`), apiFetch('/approvals/stats?days=30')])
      .then(([a, s]) => { setApprovals(a.approvals ?? []); setStats(s); setLoading(false); })
      .catch(() => setLoading(false));
  }, [filter]);

  const select = async id => {
    setSelected(id);
    try { setDetail(await apiFetch(`/approvals/${id}`)); } catch { setDetail(null); }
  };

  return (
    <div>
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px', marginBottom: '20px' }}>
          {Object.entries(stats.byStatus).map(([s, count]) => <Stat key={s} label={s} value={count} sub="" />)}
          {stats.avgResolutionMins != null && <Stat label="Avg Resolution" value={`${stats.avgResolutionMins}m`} sub="30 days" />}
        </div>
      )}
      <SplitPanel
        left={
          <>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '12px' }}>
              {['', 'PENDING', 'APPROVED', 'REJECTED', 'EXECUTED', 'EXPIRED'].map(s => <Chip key={s} label={s || 'All'} active={filter === s} onClick={() => setFilter(s)} />)}
            </div>
            {loading ? <Spinner /> : approvals.length === 0 ? <Empty text="No approvals" /> : (
              approvals.map(a => (
                <ListRow key={a.approvalId} active={selected === a.approvalId} onClick={() => select(a.approvalId)}>
                  <div style={{ fontWeight: '500', fontSize: '13px' }}>{a.action} — {a.connector}</div>
                  <div style={{ fontSize: '12px', color: 'var(--color-ink-muted)', marginTop: '2px' }}>
                    <StatusBadge status={a.status} /> &nbsp;{a.riskLevel} &nbsp;{new Date(a.createdAt).toLocaleDateString()}
                  </div>
                </ListRow>
              ))
            )}
          </>
        }
        right={!detail ? <Placeholder text="Select an approval to see its timeline" /> : <ApprovalTimelineView d={detail} />}
      />
    </div>
  );
}

function ApprovalTimelineView({ d }) {
  return (
    <div>
      <h3 style={{ fontWeight: '600', fontSize: '15px', marginBottom: '6px' }}>{d.action} — {d.connector}</h3>
      <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <StatusBadge status={d.status} />
        {d.riskLevel && <Badge bg="#fef3c7" fg="#92400e">{d.riskLevel}</Badge>}
      </div>
      {d.steps?.map((s, i) => (
        <div key={i} style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
          <div style={{ width: '22px', height: '22px', borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '700', color: '#fff', background: s.status === 'complete' ? '#10b981' : s.status === 'pending' ? '#f59e0b' : '#d1d5db' }}>
            {s.step}
          </div>
          <div>
            <div style={{ fontSize: '13px', fontWeight: '500' }}>{s.label}</div>
            {s.detail && <div style={{ fontSize: '12px', color: 'var(--color-ink-muted)', marginTop: '2px' }}>{s.detail}</div>}
            {s.at && <div style={{ fontSize: '11px', color: 'var(--color-ink-muted)', marginTop: '2px' }}>{new Date(s.at).toLocaleString()}</div>}
          </div>
        </div>
      ))}
      {d.durationMs && <p style={{ fontSize: '12px', color: 'var(--color-ink-muted)', marginTop: '12px' }}>Total duration: {Math.round(d.durationMs / 60000)}m</p>}
    </div>
  );
}

// ─── AI Models ────────────────────────────────────────────────────────────────

function ModelTab() {
  const [usage, setUsage]     = useState([]);
  const [traceId, setTraceId] = useState('');
  const [trace, setTrace]     = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch('/model?days=30').then(r => { setUsage(r.usage ?? []); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const lookupTrace = async () => {
    if (!traceId.trim()) return;
    try { setTrace(await apiFetch(`/model/${traceId.trim()}`)); } catch { setTrace(null); }
  };

  return (
    <div>
      <Section title="Model Usage (Last 30 Days)">
        {loading ? <Spinner /> : usage.length === 0 ? <Empty text="No model usage recorded" /> : (
          <DataTable
            cols={['Model', 'Calls', 'Input Tokens', 'Output Tokens', 'Est. Cost (USD)', 'Avg Latency']}
            rows={usage.map(m => [m.model, m.calls.toLocaleString(), (m.inputTokens ?? 0).toLocaleString(), (m.outputTokens ?? 0).toLocaleString(), `$${m.estimatedCostUsd.toFixed(6)}`, m.avgLatencyMs ? `${m.avgLatencyMs}ms` : '—'])}
          />
        )}
      </Section>
      <Section title="Trace an AI Call">
        <SearchBar value={traceId} onChange={setTraceId} onSubmit={lookupTrace} placeholder="Briefing / message / execution ID…" buttonLabel="Trace" />
        {trace && (
          <div style={{ marginTop: '14px', padding: '14px', background: 'var(--color-surface-2, #f9fafb)', borderRadius: '8px' }}>
            <dl style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '8px 12px', fontSize: '13px' }}>
              {[
                ['Model',         trace.model ?? '—'],
                ['Provider',      trace.provider ?? '—'],
                ['Prompt Version', trace.promptVersion ?? '—'],
                ['Latency',       trace.latencyMs ? `${trace.latencyMs}ms` : '—'],
                ['Input Tokens',  trace.inputTokens?.toLocaleString() ?? '—'],
                ['Output Tokens', trace.outputTokens?.toLocaleString() ?? '—'],
                ['Est. Cost',     trace.estimatedCostUsd != null ? `$${trace.estimatedCostUsd}` : '—'],
                ['Cache Hit',     trace.cacheHit ? 'Yes' : 'No'],
                ['Fallback Used', trace.fallbackUsed ? 'Yes' : 'No'],
              ].map(([k, v]) => (
                <div key={k} style={{ display: 'contents' }}>
                  <dt style={{ color: 'var(--color-ink-muted)', fontWeight: '500' }}>{k}</dt>
                  <dd style={{ margin: 0 }}>{v}</dd>
                </div>
              ))}
            </dl>
            {trace.fallbackChain?.length > 0 && (
              <div style={{ marginTop: '10px' }}>
                <strong style={{ fontSize: '12px', color: 'var(--color-ink-muted)' }}>Fallback Chain</strong>
                {trace.fallbackChain.map((f, i) => (
                  <div key={i} style={{ fontSize: '12px', marginTop: '4px' }}>
                    {f.step}. {f.model} — <span style={{ color: f.status === 'used' ? '#10b981' : '#9ca3af' }}>{f.status}</span>
                    {f.reason ? ` (${f.reason})` : ''}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Section>
    </div>
  );
}

// ─── Workflows ────────────────────────────────────────────────────────────────

function WorkflowTab() {
  const [runs, setRuns]       = useState([]);
  const [selected, setSel]    = useState(null);
  const [detail, setDetail]   = useState(null);
  const [filter, setFilter]   = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = filter ? `?status=${filter}&limit=50` : '?limit=50';
    setLoading(true);
    apiFetch(`/workflow${q}`).then(r => { setRuns(r.runs ?? []); setLoading(false); }).catch(() => setLoading(false));
  }, [filter]);

  const select = async id => {
    setSel(id);
    try { setDetail(await apiFetch(`/workflow/${id}`)); } catch { setDetail(null); }
  };

  return (
    <SplitPanel
      left={
        <>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '12px' }}>
            {['', 'completed', 'failed', 'running'].map(s => <Chip key={s} label={s || 'All'} active={filter === s} onClick={() => setFilter(s)} />)}
          </div>
          {loading ? <Spinner /> : runs.length === 0 ? <Empty text="No workflow runs found" /> : (
            runs.map(r => (
              <ListRow key={r.id} active={selected === r.id} onClick={() => select(r.id)}>
                <div style={{ fontWeight: '500', fontSize: '13px' }}>{r.title ?? r.type}</div>
                <div style={{ fontSize: '12px', color: 'var(--color-ink-muted)', marginTop: '2px' }}>
                  <StatusBadge status={r.status} /> &nbsp;{r.startedAt ? new Date(r.startedAt).toLocaleDateString() : ''}
                </div>
              </ListRow>
            ))
          )}
        </>
      }
      right={!detail ? <Placeholder text="Select a workflow run to see its trace" /> : <WorkflowTraceView d={detail} />}
    />
  );
}

function WorkflowTraceView({ d }) {
  return (
    <div>
      <h3 style={{ fontWeight: '600', fontSize: '15px', marginBottom: '6px' }}>{d.title}</h3>
      <div style={{ display: 'flex', gap: '6px', marginBottom: '12px', flexWrap: 'wrap' }}>
        <StatusBadge status={d.status} /> <TypeBadge type={d.type} />
        {d.durationMs && <span style={{ fontSize: '12px', color: 'var(--color-ink-muted)' }}>{Math.round(d.durationMs / 1000)}s</span>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '16px' }}>
        <Stat label="Steps" value={d.summary?.totalSteps ?? 0} sub="" />
        <Stat label="Succeeded" value={d.summary?.succeeded ?? 0} sub="" />
        <Stat label="Failed" value={d.summary?.failed ?? 0} sub="" />
      </div>
      <Section title="Execution Nodes">
        {d.nodes?.map((n, i) => (
          <div key={i} style={{ display: 'flex', gap: '8px', marginBottom: '8px', padding: '8px', background: 'var(--color-surface-2, #f9fafb)', borderRadius: '6px' }}>
            <StatusDot status={n.status} />
            <div>
              <div style={{ fontSize: '13px', fontWeight: '500' }}>{n.label}</div>
              <div style={{ fontSize: '11px', color: 'var(--color-ink-muted)' }}>{n.type}{n.durationMs ? ` · ${n.durationMs}ms` : ''}{n.retryCount ? ` · ${n.retryCount} retries` : ''}</div>
              {n.detail && <div style={{ fontSize: '12px', color: 'var(--color-ink-muted)', marginTop: '2px' }}>{n.detail}</div>}
            </div>
          </div>
        ))}
      </Section>
    </div>
  );
}

// ─── Knowledge ────────────────────────────────────────────────────────────────

function KnowledgeTab() {
  const [map, setMap]         = useState(null);
  const [ctxId, setCtxId]     = useState('');
  const [trace, setTrace]     = useState(null);
  const [nodeId, setNodeId]   = useState('');
  const [entity, setEntity]   = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch('/graph?days=7').then(r => { setMap(r); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const lookupTrace = async () => {
    if (!ctxId.trim()) return;
    try { setTrace(await apiFetch(`/graph/${ctxId.trim()}`)); } catch { setTrace(null); }
  };

  const lookupEntity = async () => {
    if (!nodeId.trim()) return;
    try { setEntity(await apiFetch(`/graph/entity/${nodeId.trim()}`)); } catch { setEntity(null); }
  };

  return (
    <div>
      {!loading && map && (
        <Section title="Knowledge Map (Last 7 Days)">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            {map.nodesByType?.length > 0 && (
              <div>
                <h4 style={{ fontSize: '13px', fontWeight: '600', marginBottom: '8px', color: 'var(--color-ink-muted)' }}>Graph Nodes by Type</h4>
                <DataTable cols={['Type', 'Count', 'Latest']} rows={map.nodesByType.map(n => [n.type, n.count.toLocaleString(), n.latest ? new Date(n.latest).toLocaleDateString() : '—'])} />
              </div>
            )}
            {map.chunksBySource?.length > 0 && (
              <div>
                <h4 style={{ fontSize: '13px', fontWeight: '600', marginBottom: '8px', color: 'var(--color-ink-muted)' }}>Intel Chunks by Source</h4>
                <DataTable cols={['Source', 'Chunks', 'Latest']} rows={map.chunksBySource.map(s => [s.source, s.count.toLocaleString(), s.latest ? new Date(s.latest).toLocaleDateString() : '—'])} />
              </div>
            )}
          </div>
        </Section>
      )}
      <Section title="Trace Knowledge for a Context">
        <SearchBar value={ctxId} onChange={setCtxId} onSubmit={lookupTrace} placeholder="Conversation / briefing / query ID…" buttonLabel="Trace" />
        {trace && (
          <div style={{ marginTop: '12px' }}>
            <p style={{ fontSize: '13px', color: 'var(--color-ink)', marginBottom: '10px' }}>{trace.explanation}</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
              <Stat label="Nodes"      value={trace.summary?.totalNodes ?? 0}     sub="" />
              <Stat label="Edges"      value={trace.summary?.totalEdges ?? 0}     sub="" />
              <Stat label="Chunks"     value={trace.summary?.totalChunks ?? 0}    sub="" />
              <Stat label="Documents"  value={trace.summary?.totalDocuments ?? 0} sub="" />
            </div>
          </div>
        )}
      </Section>
      <Section title="Entity Context Lookup">
        <SearchBar value={nodeId} onChange={setNodeId} onSubmit={lookupEntity} placeholder="Graph node ID…" buttonLabel="Look Up" />
        {entity && (
          <div style={{ marginTop: '12px' }}>
            <h4 style={{ fontWeight: '600', fontSize: '14px', marginBottom: '8px' }}>{entity.node.label} <span style={{ fontWeight: '400', color: 'var(--color-ink-muted)', fontSize: '12px' }}>({entity.node.type})</span></h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '12px' }}>
              <Stat label="Edges"     value={entity.totalEdges}     sub="" />
              <Stat label="Neighbors" value={entity.totalNeighbors} sub="" />
              <Stat label="Chunks"    value={entity.totalChunks}    sub="" />
            </div>
            {entity.neighbors.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {entity.neighbors.map(n => <Badge key={n.id} bg="var(--color-surface-2, #f3f4f6)" fg="var(--color-ink)">{n.label ?? n.id} ({n.type})</Badge>)}
              </div>
            )}
          </div>
        )}
      </Section>
    </div>
  );
}

// ─── Primitive components ──────────────────────────────────────────────────────

function Stat({ label, value, sub, accent }) {
  return (
    <div style={{ padding: '14px 16px', background: accent ? 'var(--color-accent, #e8672b)' : 'var(--color-surface-2, #f9fafb)', borderRadius: '8px' }}>
      <div style={{ fontSize: '22px', fontWeight: '700', color: accent ? '#fff' : 'var(--color-ink)', marginBottom: '2px' }}>{value}</div>
      <div style={{ fontSize: '12px', color: accent ? 'rgba(255,255,255,.8)' : 'var(--color-ink-muted)' }}>{label}</div>
      {sub && <div style={{ fontSize: '11px', color: accent ? 'rgba(255,255,255,.6)' : 'var(--color-ink-muted)', marginTop: '1px' }}>{sub}</div>}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: '24px' }}>
      <h3 style={{ fontSize: '12px', fontWeight: '600', color: 'var(--color-ink-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' }}>{title}</h3>
      {children}
    </div>
  );
}

function DataTable({ cols, rows, onRowClick }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
      <thead>
        <tr>{cols.map(c => <th key={c} style={{ textAlign: 'left', padding: '6px 10px', fontWeight: '600', color: 'var(--color-ink-muted)', borderBottom: '1px solid var(--color-border)', whiteSpace: 'nowrap' }}>{c}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i} onClick={() => onRowClick?.(i)} style={{ cursor: onRowClick ? 'pointer' : 'default', background: i % 2 === 1 ? 'var(--color-surface-2, #f9fafb)' : 'transparent' }}>
            {row.map((cell, j) => <td key={j} style={{ padding: '7px 10px', borderBottom: '1px solid var(--color-border)' }}>{cell}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function SplitPanel({ left, right }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: '20px', minHeight: '440px' }}>
      <div style={{ overflowY: 'auto', maxHeight: '560px' }}>{left}</div>
      <div style={{ padding: '14px', background: 'var(--color-surface-2, #f9fafb)', borderRadius: '8px', overflowY: 'auto', maxHeight: '560px' }}>{right}</div>
    </div>
  );
}

function ListRow({ active, onClick, children }) {
  return (
    <div onClick={onClick} style={{ padding: '9px 11px', cursor: 'pointer', borderRadius: '6px', marginBottom: '4px', background: active ? 'rgba(232,103,43,0.1)' : 'transparent', border: `1px solid ${active ? 'var(--color-accent, #e8672b)' : 'transparent'}` }}>
      {children}
    </div>
  );
}

function SearchBar({ value, onChange, onSubmit, placeholder, buttonLabel }) {
  return (
    <div style={{ display: 'flex', gap: '8px' }}>
      <input value={value} onChange={e => onChange(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && onSubmit()}
        placeholder={placeholder}
        style={{ flex: 1, padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--color-border)', fontSize: '13px' }}
      />
      <button onClick={onSubmit} style={{ padding: '8px 14px', background: 'var(--color-accent, #e8672b)', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', whiteSpace: 'nowrap' }}>
        {buttonLabel}
      </button>
    </div>
  );
}

function Chip({ label, active, onClick }) {
  return (
    <button onClick={onClick} style={{ padding: '3px 10px', borderRadius: '12px', border: '1px solid var(--color-border)', cursor: 'pointer', fontSize: '12px', background: active ? 'var(--color-accent, #e8672b)' : 'transparent', color: active ? '#fff' : 'var(--color-ink-muted)' }}>
      {label}
    </button>
  );
}

function Badge({ bg, fg, children }) {
  return <span style={{ fontSize: '11px', padding: '2px 7px', borderRadius: '4px', background: bg, color: fg }}>{children}</span>;
}

function TypeBadge({ type }) {
  const bg = { BRIEFING: '#dbeafe', EXECUTION: '#d1fae5', APPROVAL: '#fef3c7', AUTONOMY_RUN: '#f3e8ff', RECOMMENDATION: '#dcfce7' };
  return <Badge bg={bg[type] ?? '#f3f4f6'} fg="#374151">{type}</Badge>;
}

function StatusBadge({ status }) {
  const bg = { PENDING: '#fef3c7', APPROVED: '#d1fae5', REJECTED: '#fee2e2', EXECUTED: '#d1fae5', EXPIRED: '#f3f4f6', completed: '#d1fae5', failed: '#fee2e2', success: '#d1fae5', error: '#fee2e2', running: '#dbeafe' };
  const fg = { PENDING: '#92400e', APPROVED: '#065f46', REJECTED: '#991b1b', EXECUTED: '#065f46', EXPIRED: '#6b7280', completed: '#065f46', failed: '#991b1b', success: '#065f46', error: '#991b1b', running: '#1e40af' };
  return <Badge bg={bg[status] ?? '#f3f4f6'} fg={fg[status] ?? '#374151'}>{status}</Badge>;
}

function EffectBadge({ effect }) {
  const bg = { ALLOW: '#d1fae5', DENY: '#fee2e2', REQUIRE_APPROVAL: '#fef3c7' };
  const fg = { ALLOW: '#065f46', DENY: '#991b1b', REQUIRE_APPROVAL: '#92400e' };
  return <Badge bg={bg[effect] ?? '#f3f4f6'} fg={fg[effect] ?? '#374151'}>{effect}</Badge>;
}

function StatusDot({ status }) {
  const color = { success: '#10b981', error: '#ef4444', pending: '#f59e0b', waiting: '#d1d5db' };
  return <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: color[status] ?? '#d1d5db', flexShrink: 0, marginTop: '5px' }} />;
}

function EvidenceChip({ e, expanded }) {
  return (
    <div style={{ padding: '7px 10px', background: 'var(--color-surface-2, #f9fafb)', borderRadius: '6px', marginBottom: '6px' }}>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <span style={{ fontSize: '12px', fontWeight: '500' }}>{e.connector ?? e.source ?? e.sourceType ?? '—'}</span>
        {e.channel && <span style={{ fontSize: '11px', color: 'var(--color-ink-muted)' }}>#{e.channel}</span>}
        {e.authorityScore != null && <span style={{ fontSize: '11px', color: 'var(--color-ink-muted)', marginLeft: 'auto' }}>auth: {parseFloat(e.authorityScore).toFixed(2)}</span>}
      </div>
      {expanded && e.previewText && <p style={{ fontSize: '12px', color: 'var(--color-ink-muted)', margin: '4px 0 0' }}>{e.previewText}</p>}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: '14px' }}>
      <div style={{ fontSize: '11px', fontWeight: '600', color: 'var(--color-ink-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '5px' }}>{label}</div>
      <div style={{ fontSize: '13px', color: 'var(--color-ink)', lineHeight: '1.5' }}>{children}</div>
    </div>
  );
}

function Spinner() {
  return <div style={{ padding: '28px', textAlign: 'center', color: 'var(--color-ink-muted)', fontSize: '13px' }}>Loading…</div>;
}

function Empty({ text }) {
  return <div style={{ padding: '28px', textAlign: 'center', color: 'var(--color-ink-muted)', fontSize: '13px' }}>{text}</div>;
}

function Placeholder({ text }) {
  return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: '200px', color: 'var(--color-ink-muted)', fontSize: '13px', textAlign: 'center' }}>{text}</div>;
}
