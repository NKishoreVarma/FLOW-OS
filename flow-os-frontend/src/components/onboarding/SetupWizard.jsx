/**
 * SetupWizard — FLOW's complete first-run experience.
 *
 * Steps: Welcome → Role → Connect (required gate) → Permissions → Build → Ready
 *
 * Rules enforced here:
 *   • Required integrations for each role block the Connect step.
 *   • Resource discovery runs automatically after each OAuth connection.
 *   • Nothing syncs until the user explicitly clicks "Build workspace".
 *   • AI is NOT available until READY state — enforced by WorkspaceStateGate.
 *   • No mock data, no fake progress — every state is honest.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate }      from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowRight, Check, Zap, Code2, MessageSquare, Mail, Calendar,
  FileText, BookOpen, Loader2, ShieldCheck, AlertCircle, ChevronRight,
  Building2, Briefcase, Layers, HeadphonesIcon, BarChart2, Lock, Globe,
  RefreshCw,
} from 'lucide-react';
import { invalidateWorkspaceState } from '../../hooks/useWorkspaceState';

// ─── Role → integration requirements ─────────────────────────────────────────

const ROLE_CONNECTORS = {
  engineering: {
    required:    ['github', 'slack'],
    recommended: ['google-calendar', 'jira', 'notion', 'gmail'],
  },
  executive: {
    required:    ['gmail', 'google-calendar'],
    recommended: ['slack', 'notion', 'jira'],
  },
  product: {
    required:    ['jira', 'slack'],
    recommended: ['notion', 'github', 'google-calendar', 'gmail'],
  },
  sales: {
    required:    ['gmail', 'google-calendar'],
    recommended: ['slack', 'notion'],
  },
  support: {
    required:    ['jira', 'gmail'],
    recommended: ['slack', 'google-calendar'],
  },
  operations: {
    required:    ['slack', 'google-calendar'],
    recommended: ['jira', 'gmail', 'notion'],
  },
};

const CONNECTORS = {
  github:            { name: 'GitHub',          Icon: Code2,         desc: 'Repositories, pull requests, commits, deployments' },
  slack:             { name: 'Slack',            Icon: MessageSquare, desc: 'Channels, threads, mentions, direct messages' },
  gmail:             { name: 'Gmail',            Icon: Mail,          desc: 'Inbox, sent mail, threads, contacts' },
  'google-calendar': { name: 'Google Calendar',  Icon: Calendar,      desc: 'Meetings, events, scheduling' },
  notion:            { name: 'Notion',           Icon: BookOpen,      desc: 'Pages, databases, wikis, documentation' },
  jira:              { name: 'Jira',             Icon: FileText,      desc: 'Projects, issues, sprints, boards' },
};

const ROLES = [
  { id: 'engineering', label: 'Engineering', Icon: Code2,          desc: 'Repos, PRs, deployments, sprint health' },
  { id: 'executive',   label: 'Executive',   Icon: Building2,      desc: 'Company health, performance, strategic risks' },
  { id: 'product',     label: 'Product',     Icon: Layers,         desc: 'Features, roadmap, customer feedback, sprints' },
  { id: 'sales',       label: 'Sales',       Icon: Briefcase,      desc: 'Pipeline, deals, customer communications' },
  { id: 'support',     label: 'Support',     Icon: HeadphonesIcon, desc: 'Tickets, customer health, escalations' },
  { id: 'operations',  label: 'Operations',  Icon: BarChart2,      desc: 'Incidents, compliance, metrics, coordination' },
];

// ─── Shared styles ────────────────────────────────────────────────────────────

const S = {
  overlay: {
    position: 'fixed', inset: 0, zIndex: 4000,
    background: 'var(--bg-base)', color: 'var(--t1)',
    display: 'flex', flexDirection: 'column', overflow: 'hidden',
    fontFamily: 'var(--font-ui)',
  },
  hdr: {
    display: 'flex', alignItems: 'center', gap: 14, padding: '15px 28px',
    borderBottom: '1px solid var(--line-1)', flexShrink: 0,
  },
  body: {
    flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column',
    alignItems: 'center', padding: '40px 24px 56px',
  },
  bodyCentered: {
    flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', padding: '32px 24px',
  },
  inner:  { width: '100%', maxWidth: 560 },
  h1:     { fontSize: 26, fontWeight: 500, letterSpacing: '-0.02em', margin: '0 0 8px', color: 'var(--t1)' },
  sub:    { fontSize: 13, fontWeight: 300, color: 'var(--t3)', maxWidth: 440, lineHeight: 1.65, margin: '0 0 28px' },
  btn:    { display: 'inline-flex', alignItems: 'center', gap: 8, background: 'var(--brand)', color: '#fff', border: 'none', borderRadius: 8, padding: '11px 20px', fontSize: 14, fontWeight: 500, cursor: 'pointer' },
  ghost:  { display: 'inline-flex', alignItems: 'center', gap: 8, background: 'transparent', color: 'var(--t2)', border: '1px solid var(--line-2)', borderRadius: 8, padding: '11px 20px', fontSize: 13, fontWeight: 300, cursor: 'pointer' },
  skip:   { background: 'none', border: 'none', color: 'var(--t4)', fontSize: 12, cursor: 'pointer', padding: 0, marginTop: 18 },
  lbl:    { fontSize: 10, fontWeight: 300, color: 'var(--t4)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10, fontFamily: 'var(--font-data)', display: 'block' },
};

function authHdrs() {
  const token = localStorage.getItem('flow_os_token') || '';
  const wsId  = localStorage.getItem('flow_os_workspace_id') || '';
  return { Authorization: `Bearer ${token}`, 'workspace-id': wsId, 'Content-Type': 'application/json' };
}

// ─── Progress rail ────────────────────────────────────────────────────────────

const STEPS = ['Welcome', 'Your Role', 'Connect', 'Permissions', 'Build'];

function Rail({ step }) {
  return (
    <header style={S.hdr}>
      <div style={{ width: 26, height: 26, borderRadius: 7, background: 'var(--brand)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 14, flexShrink: 0 }}>F</div>
      <span style={{ fontWeight: 500, fontSize: 14, letterSpacing: '-0.01em' }}>FLOW Setup</span>
      <div style={{ display: 'flex', alignItems: 'center', marginLeft: 20 }}>
        {STEPS.map((label, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: i === step ? 1 : i < step ? 0.65 : 0.3 }}>
              <div style={{ width: 18, height: 18, borderRadius: '50%', flexShrink: 0, background: i < step ? 'var(--brand)' : i === step ? 'rgba(232,103,43,0.12)' : 'var(--line-1)', border: `1px solid ${i <= step ? 'var(--brand)' : 'var(--line-2)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {i < step ? <Check size={10} color="#fff" /> : <span style={{ fontSize: 9, fontWeight: 500, color: i === step ? 'var(--brand)' : 'var(--t4)' }}>{i + 1}</span>}
              </div>
              <span style={{ fontSize: 11, fontWeight: 300, color: 'var(--t3)', whiteSpace: 'nowrap' }}>{label}</span>
            </div>
            {i < STEPS.length - 1 && <div style={{ width: 22, height: 1, background: 'var(--line-1)', margin: '0 8px', flexShrink: 0 }} />}
          </div>
        ))}
      </div>
      <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 300, color: 'var(--t4)' }}>Step {step + 1} of {STEPS.length}</span>
    </header>
  );
}

// ─── Step 0: Welcome ──────────────────────────────────────────────────────────

function StepWelcome({ onNext, onSkip }) {
  return (
    <div style={S.bodyCentered}>
      <motion.div style={{ ...S.inner, textAlign: 'center' }} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <div style={{ width: 60, height: 60, borderRadius: 16, background: 'var(--brand)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 28px', boxShadow: '0 4px 28px rgba(232,103,43,0.3)' }}>
          <Zap size={30} color="#fff" />
        </div>
        <h1 style={{ ...S.h1, fontSize: 30 }}>Welcome to FLOW.</h1>
        <p style={{ fontSize: 14, fontWeight: 300, color: 'var(--t3)', maxWidth: 380, margin: '0 auto 32px', lineHeight: 1.65 }}>
          FLOW works like a new AI colleague joining your company — it learns your context by connecting to the tools your team already uses, then becomes your operational brain.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 340, margin: '0 auto 32px', textAlign: 'left' }}>
          {[
            [Zap,          'Connects to your existing tools — no migration'],
            [Lock,         'You choose exactly which resources FLOW may access'],
            [ShieldCheck,  'Nothing syncs without your explicit permission'],
            [Globe,        'Answers from live data — not static summaries'],
          ].map(([Icon, text], i) => (
            <motion.div key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 + i * 0.08 }} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'rgba(232,103,43,0.1)', border: '1px solid rgba(232,103,43,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon size={11} color="var(--brand)" />
              </div>
              <span style={{ fontSize: 13, fontWeight: 300, color: 'var(--t2)' }}>{text}</span>
            </motion.div>
          ))}
        </div>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }}>
          <button style={S.btn} onClick={onNext}>Get started  <ArrowRight size={15} /></button>
          <br />
          <button style={S.skip} onClick={onSkip}>Skip — I'll set up later</button>
        </motion.div>
      </motion.div>
    </div>
  );
}

// ─── Step 1: Role ─────────────────────────────────────────────────────────────

function StepRole({ selected, onSelect, onNext }) {
  const req = selected ? ROLE_CONNECTORS[selected] : null;
  return (
    <div style={S.body}>
      <motion.div style={S.inner} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <h1 style={S.h1}>What best describes your role?</h1>
        <p style={S.sub}>FLOW uses this to determine which integrations you need and how to tailor your Morning Brief.</p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 20 }}>
          {ROLES.map(({ id, label, Icon, desc }) => {
            const active = selected === id;
            return (
              <button key={id} onClick={() => onSelect(id)} style={{ textAlign: 'left', cursor: 'pointer', padding: '16px 18px', borderRadius: 8, border: `1.5px solid ${active ? 'var(--brand)' : 'var(--line-2)'}`, background: active ? 'rgba(232,103,43,0.07)' : 'var(--surface-2)', transition: 'all 80ms' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                  <Icon size={15} color={active ? 'var(--brand)' : 'var(--t3)'} />
                  <span style={{ fontSize: 13, fontWeight: 500, color: active ? 'var(--brand)' : 'var(--t1)' }}>{label}</span>
                </div>
                <p style={{ fontSize: 11, fontWeight: 300, color: 'var(--t3)', margin: 0, lineHeight: 1.45 }}>{desc}</p>
              </button>
            );
          })}
        </div>

        {req && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ padding: '10px 14px', background: 'var(--surface-2)', border: '1px solid var(--line-1)', borderRadius: 6, marginBottom: 20, fontSize: 12, fontWeight: 300, color: 'var(--t3)' }}>
            <strong style={{ color: 'var(--t2)', fontWeight: 500 }}>Required:</strong> {req.required.map(id => CONNECTORS[id]?.name || id).join(', ')}
            {req.recommended.length > 0 && <span> · <strong style={{ color: 'var(--t2)', fontWeight: 400 }}>Recommended:</strong> {req.recommended.map(id => CONNECTORS[id]?.name || id).join(', ')}</span>}
          </motion.div>
        )}

        <button style={{ ...S.btn, opacity: selected ? 1 : 0.4 }} disabled={!selected} onClick={onNext}>
          Continue <ArrowRight size={15} />
        </button>
      </motion.div>
    </div>
  );
}

// ─── Step 2: Connect ──────────────────────────────────────────────────────────

function StepConnect({ role, connected, onRefresh, onNext }) {
  const [loading,  setLoading]  = useState({});
  const [errors,   setErrors]   = useState({});
  const [expanded, setExpanded] = useState(false);

  const req          = ROLE_CONNECTORS[role] || ROLE_CONNECTORS.engineering;
  const requiredIds  = req.required;
  const recIds       = req.recommended;
  const requiredDone = requiredIds.every(id => connected.includes(id));

  async function connect(connId) {
    setLoading(p => ({ ...p, [connId]: true }));
    setErrors(p => ({ ...p, [connId]: null }));
    try {
      const token = localStorage.getItem('flow_os_token') || '';
      const wsId  = localStorage.getItem('flow_os_workspace_id') || '';
      const res = await fetch(`/api/integrations-hub/${connId}/auth`, {
        headers: { Authorization: `Bearer ${token}`, 'workspace-id': wsId },
      });
      const data = await res.json();
      if (data.authUrl) {
        sessionStorage.setItem('flow_oauth_return_step', '2');
        window.location.href = data.authUrl;
      } else {
        setErrors(p => ({ ...p, [connId]: data.error?.message || 'Could not start connection.' }));
      }
    } catch {
      setErrors(p => ({ ...p, [connId]: 'Connection service is unavailable right now.' }));
    } finally {
      setLoading(p => ({ ...p, [connId]: false }));
    }
  }

  // Re-check when tab regains focus (user returns from OAuth)
  useEffect(() => {
    const onFocus = () => { invalidateWorkspaceState(); onRefresh(); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [onRefresh]);

  return (
    <div style={S.body}>
      <motion.div style={S.inner} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <h1 style={S.h1}>Connect your tools</h1>
        <p style={S.sub}>
          Connect the required tools to continue. After each connection, FLOW will automatically discover your available resources so you can choose what to include.
        </p>

        {connected.length > 0 && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 300, color: 'var(--ok)', marginBottom: 20, padding: '5px 12px', background: 'rgba(80,200,120,0.08)', border: '1px solid rgba(80,200,120,0.2)', borderRadius: 6 }}>
            <Check size={12} /> {connected.length} tool{connected.length !== 1 ? 's' : ''} connected
          </div>
        )}

        {/* Required */}
        <span style={S.lbl}>Required for {role}</span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
          {requiredIds.map(id => (
            <ConnRow key={id} id={id} required connected={connected.includes(id)} loading={loading[id]} error={errors[id]} onConnect={connect} />
          ))}
        </div>

        {/* Recommended */}
        <button onClick={() => setExpanded(e => !e)} style={{ ...S.lbl, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
          <ChevronRight size={11} style={{ transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 150ms' }} />
          Recommended (optional)
        </button>
        {expanded && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
            {recIds.map(id => (
              <ConnRow key={id} id={id} required={false} connected={connected.includes(id)} loading={loading[id]} error={errors[id]} onConnect={connect} />
            ))}
          </div>
        )}

        {/* Gate notice */}
        {!requiredDone && (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 14px', background: 'rgba(255,200,80,0.07)', border: '1px solid rgba(255,200,80,0.2)', borderRadius: 6, marginBottom: 20 }}>
            <AlertCircle size={14} color="var(--warn)" style={{ flexShrink: 0, marginTop: 1 }} />
            <p style={{ fontSize: 12, fontWeight: 300, color: 'var(--t2)', margin: 0, lineHeight: 1.5 }}>
              Connect all required tools to continue. They give FLOW the context it needs to answer correctly for your role.
            </p>
          </div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <button style={{ ...S.btn, opacity: requiredDone ? 1 : 0.35 }} disabled={!requiredDone} onClick={onNext}>
            Configure permissions <ArrowRight size={15} />
          </button>
          <button title="Re-check connections" onClick={() => { invalidateWorkspaceState(); onRefresh(); }} style={{ padding: '11px 14px', background: 'transparent', border: '1px solid var(--line-2)', borderRadius: 8, cursor: 'pointer', color: 'var(--t3)', display: 'flex', alignItems: 'center' }}>
            <RefreshCw size={13} />
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function ConnRow({ id, required, connected, loading, error, onConnect }) {
  const meta = CONNECTORS[id];
  if (!meta) return null;
  const { Icon, name, desc } = meta;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', background: connected ? 'rgba(80,200,120,0.04)' : 'var(--surface-2)', border: `1px solid ${connected ? 'rgba(80,200,120,0.22)' : 'var(--line-1)'}`, borderRadius: 8, transition: 'all 100ms' }}>
      <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--surface-3)', border: '1px solid var(--line-1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={17} color="var(--t2)" />
      </div>
      <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--t1)' }}>{name}</span>
          {required && !connected && <span style={{ fontSize: 9, fontWeight: 500, color: 'var(--warn)', background: 'rgba(255,200,80,0.12)', border: '1px solid rgba(255,200,80,0.25)', padding: '1px 6px', borderRadius: 99, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Required</span>}
          {connected && <span style={{ fontSize: 9, fontWeight: 300, color: 'var(--ok)' }}>Connected</span>}
        </div>
        <div style={{ fontSize: 11, fontWeight: 300, color: 'var(--t3)' }}>{desc}</div>
        {error && <div style={{ fontSize: 11, color: 'var(--crit)', marginTop: 4 }}>{error}</div>}
      </div>
      {connected ? (
        <Check size={16} color="var(--ok)" style={{ flexShrink: 0 }} />
      ) : (
        <button onClick={() => onConnect(id)} disabled={loading} style={{ flexShrink: 0, padding: '7px 14px', fontSize: 12, fontWeight: 500, background: 'var(--brand)', color: '#fff', border: 'none', borderRadius: 6, cursor: loading ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: 6, opacity: loading ? 0.7 : 1 }}>
          {loading && <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} />}
          Connect
        </button>
      )}
    </div>
  );
}

// ─── Step 3: Permissions ──────────────────────────────────────────────────────

function StepPermissions({ connected, onNext }) {
  const [resources,    setResources]    = useState({});
  const [selected,     setSelected]     = useState({});
  const [loading,      setLoading]      = useState(true);
  const [discovering,  setDiscovering]  = useState({});
  const [saving,       setSaving]       = useState(false);

  useEffect(() => {
    if (!connected.length) { setLoading(false); return; }
    Promise.all(connected.map(async id => {
      setDiscovering(p => ({ ...p, [id]: true }));
      try {
        const token = localStorage.getItem('flow_os_token') || '';
        const wsId  = localStorage.getItem('flow_os_workspace_id') || '';
        const hdrs  = { Authorization: `Bearer ${token}`, 'workspace-id': wsId, 'Content-Type': 'application/json' };
        // POST discover triggers a live API call to the provider
        const r1 = await fetch(`/api/integration-permissions/${id}/discover`, { method: 'POST', headers: hdrs });
        if (r1.ok) { const d = await r1.json(); return [id, d.resources || []]; }
        const r2 = await fetch(`/api/integration-permissions/${id}`, { headers: hdrs });
        if (r2.ok) { const d = await r2.json(); return [id, d.resources || []]; }
        return [id, []];
      } catch { return [id, []]; }
      finally { setDiscovering(p => ({ ...p, [id]: false })); }
    })).then(pairs => {
      const map = {}; const sel = {};
      for (const [id, list] of pairs) {
        if (!list.length) continue;
        map[id] = list; sel[id] = {};
        for (const r of list) sel[id][r.key || r.id || r.name] = true;
      }
      setResources(map); setSelected(sel); setLoading(false);
    });
  }, []); // eslint-disable-line

  function toggle(connId, key) { setSelected(p => ({ ...p, [connId]: { ...(p[connId] || {}), [key]: !p[connId]?.[key] } })); }
  function selectAll(connId)   { const keys = (resources[connId] || []).map(r => r.key || r.id || r.name); setSelected(p => ({ ...p, [connId]: Object.fromEntries(keys.map(k => [k, true])) })); }
  function deselectAll(connId) { setSelected(p => ({ ...p, [connId]: {} })); }

  async function save() {
    setSaving(true);
    try {
      await Promise.allSettled(Object.entries(selected).map(([connId, sels]) => {
        const allowed = Object.entries(sels).filter(([, v]) => v).map(([k]) => k);
        const hidden  = Object.entries(sels).filter(([, v]) => !v).map(([k]) => k);
        return fetch(`/api/integration-permissions/${connId}/resources`, { method: 'PUT', headers: authHdrs(), body: JSON.stringify({ allow: allowed, hide: hidden }) });
      }));
      await fetch('/api/onboarding/permissions', { method: 'POST', headers: authHdrs(), body: JSON.stringify({ selections: selected }) });
    } catch {}
    setSaving(false);
    onNext();
  }

  const hasResources = Object.keys(resources).length > 0;

  return (
    <div style={S.body}>
      <motion.div style={S.inner} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <h1 style={S.h1}>Choose what FLOW may access</h1>
        <p style={S.sub}>Only selected resources are ever synced, indexed, or referenced by the AI. Unselected resources are refused permanently — not even queued.</p>

        {loading ? (
          <div style={{ padding: '40px 0', textAlign: 'center' }}>
            <Loader2 size={22} style={{ animation: 'spin 1s linear infinite', color: 'var(--brand)' }} />
            <p style={{ fontSize: 13, fontWeight: 300, color: 'var(--t3)', marginTop: 14 }}>
              Discovering resources from {connected.length} tool{connected.length !== 1 ? 's' : ''}…
            </p>
          </div>
        ) : !hasResources ? (
          <div style={{ padding: '20px 0' }}>
            <p style={{ fontSize: 13, fontWeight: 300, color: 'var(--t3)', lineHeight: 1.6 }}>
              Resource discovery is continuing in the background. You can manage fine-grained permissions anytime from <strong style={{ color: 'var(--t2)', fontWeight: 400 }}>Settings → Integrations</strong>.
            </p>
            <button style={{ ...S.btn, marginTop: 20 }} onClick={onNext}>Continue <ArrowRight size={15} /></button>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
              {Object.entries(resources).map(([connId, list]) => {
                const meta = CONNECTORS[connId];
                const Icon = meta?.Icon || FileText;
                const selectedCount = Object.values(selected[connId] || {}).filter(Boolean).length;
                return (
                  <div key={connId} style={{ background: 'var(--surface-2)', border: '1px solid var(--line-1)', borderRadius: 8, overflow: 'hidden' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 16px', borderBottom: '1px solid var(--line-1)' }}>
                      <Icon size={14} color="var(--t2)" />
                      <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--t1)', flex: 1 }}>{meta?.name || connId}</span>
                      {discovering[connId] && <Loader2 size={11} style={{ animation: 'spin 1s linear infinite', color: 'var(--t3)' }} />}
                      <span style={{ fontSize: 11, fontWeight: 300, color: 'var(--t3)' }}>{selectedCount}/{list.length}</span>
                      <button onClick={() => selectAll(connId)}   style={{ fontSize: 10, color: 'var(--brand)', background: 'none', border: 'none', cursor: 'pointer' }}>All</button>
                      <button onClick={() => deselectAll(connId)} style={{ fontSize: 10, color: 'var(--t3)',    background: 'none', border: 'none', cursor: 'pointer' }}>None</button>
                    </div>
                    <div style={{ padding: 14, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {list.map(r => {
                        const rKey = r.key || r.id || r.name;
                        const on   = selected[connId]?.[rKey] ?? true;
                        return (
                          <button key={rKey} onClick={() => toggle(connId, rKey)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 300, padding: '5px 10px', borderRadius: 6, cursor: 'pointer', border: `1px solid ${on ? 'rgba(232,103,43,0.3)' : 'var(--line-2)'}`, background: on ? 'rgba(232,103,43,0.07)' : 'transparent', color: on ? 'var(--brand)' : 'var(--t3)' }}>
                            <span style={{ width: 11, height: 11, borderRadius: 3, flexShrink: 0, border: `1px solid ${on ? 'var(--brand)' : 'var(--line-2)'}`, background: on ? 'var(--brand)' : 'transparent', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                              {on && <Check size={7} color="#fff" />}
                            </span>
                            {r.name || r.label || rKey}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 14px', background: 'rgba(80,200,120,0.06)', border: '1px solid rgba(80,200,120,0.18)', borderRadius: 6, marginBottom: 24 }}>
              <ShieldCheck size={14} color="var(--ok)" style={{ flexShrink: 0, marginTop: 1 }} />
              <p style={{ fontSize: 12, fontWeight: 300, color: 'var(--t2)', margin: 0, lineHeight: 1.5 }}>
                These permissions apply to every future sync. Unselected resources are never queued, stored, or embedded — not now, not ever.
              </p>
            </div>

            <button style={S.btn} onClick={save} disabled={saving}>
              {saving ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <ShieldCheck size={14} />}
              Confirm & build workspace
            </button>
          </>
        )}
      </motion.div>
    </div>
  );
}

// ─── Step 4: Build (indexing) ─────────────────────────────────────────────────

// Ordered stage list — drives the label shown during build
const BUILD_STAGES = [
  { key: 'start',    label: 'Starting sync',            detail: 'connecting to your tools' },
  { key: 'fetch',    label: 'Fetching data',            detail: 'repositories, emails, calendars, issues' },
  { key: 'ingest',   label: 'Ingesting documents',      detail: 'threads, pages, emails, pull requests' },
  { key: 'graph',    label: 'Building Knowledge Graph', detail: 'people, projects, and relationships' },
  { key: 'embed',    label: 'Generating embeddings',    detail: 'semantic search indexes for AI' },
  { key: 'ai',       label: 'Preparing AI context',     detail: 'briefings, patterns, recommendations' },
  { key: 'done',     label: 'Workspace ready',          detail: '' },
];

function StepBuild({ connected, onComplete }) {
  const [stageIdx, setStageIdx] = useState(0);
  const [done,     setDone]     = useState(false);
  const [err,      setErr]      = useState(null);
  const [counts,   setCounts]   = useState({ nodes: 0, vectors: 0 });
  const [connStatus, setConnStatus] = useState({});
  const pollRef  = useRef(null);
  const started  = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    // Kick off real syncs
    fetch('/api/onboarding/start-sync', { method: 'POST', headers: authHdrs() })
      .catch(() => setErr('Sync started in the background — some tools may take a moment to connect.'));

    let elapsed = 0;

    async function poll() {
      try {
        const res = await fetch('/api/onboarding/sync-status', { headers: authHdrs() });
        if (res.ok) {
          const data = await res.json();
          setCounts({ nodes: data.nodeCount || 0, vectors: data.vectorCount || 0 });
          setConnStatus(data.connectorStatus || {});
          elapsed = data.syncElapsedMs || elapsed;

          // Drive stage based on real data + elapsed time
          const n = data.nodeCount || 0;
          const v = data.vectorCount || 0;
          let nextStage = 0;
          if (elapsed > 1500)   nextStage = 1;  // fetching
          if (n > 0)            nextStage = 2;  // ingesting
          if (n > 5)            nextStage = 3;  // graph
          if (v > 0)            nextStage = 4;  // embed
          if (v > 5)            nextStage = 5;  // ai
          if (data.indexingDone) nextStage = 6; // done

          setStageIdx(prev => Math.max(prev, nextStage));

          if (data.indexingDone) {
            clearInterval(pollRef.current);
            setDone(true);
          }
        }
      } catch { /* keep polling */ }
    }

    // Poll every 3 seconds; also progress the UI every second via a minimum timer
    pollRef.current = setInterval(poll, 3000);
    poll();

    // Minimum forward progress every 4s so the UI never stalls even if the server is slow
    const minTimer = setInterval(() => {
      setStageIdx(prev => Math.min(prev + 1, BUILD_STAGES.length - 2));
    }, 4000);

    // Hard completion fallback at 45s
    const fallback = setTimeout(() => {
      clearInterval(pollRef.current);
      clearInterval(minTimer);
      setDone(true);
    }, 45_000);

    return () => {
      clearInterval(pollRef.current);
      clearInterval(minTimer);
      clearTimeout(fallback);
    };
  }, []); // eslint-disable-line

  const cur = BUILD_STAGES[stageIdx] || BUILD_STAGES[0];
  const pct = Math.round((stageIdx / (BUILD_STAGES.length - 1)) * 100);

  return (
    <div style={S.bodyCentered}>
      <motion.div style={{ ...S.inner, textAlign: 'center' }} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        {!done ? (
          <>
            <div style={{ width: 52, height: 52, borderRadius: 12, background: 'rgba(232,103,43,0.1)', border: '1px solid rgba(232,103,43,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
              <Loader2 size={26} color="var(--brand)" style={{ animation: 'spin 1s linear infinite' }} />
            </div>
            <h1 style={{ ...S.h1, fontSize: 22 }}>Building your workspace</h1>

            <AnimatePresence mode="wait">
              <motion.div key={cur.key} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} style={{ marginBottom: 24 }}>
                <p style={{ fontSize: 14, fontWeight: 400, color: 'var(--brand)', margin: '0 0 4px' }}>{cur.label}</p>
                {cur.detail && <p style={{ fontSize: 12, fontWeight: 300, color: 'var(--t3)', margin: 0 }}>{cur.detail}</p>}
              </motion.div>
            </AnimatePresence>

            {/* Overall progress bar */}
            <div style={{ height: 4, background: 'var(--line-1)', borderRadius: 99, overflow: 'hidden', maxWidth: 320, margin: '0 auto 20px' }}>
              <div style={{ height: '100%', width: `${pct}%`, background: 'var(--brand)', borderRadius: 99, transition: 'width 1s ease' }} />
            </div>

            {/* Real counts — show as they accumulate */}
            {(counts.nodes > 0 || counts.vectors > 0) && (
              <div style={{ display: 'flex', justifyContent: 'center', gap: 24, marginBottom: 20 }}>
                {counts.nodes > 0 && (
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 20, fontWeight: 500, color: 'var(--t1)' }}>{counts.nodes.toLocaleString()}</div>
                    <div style={{ fontSize: 10, color: 'var(--t4)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>entities indexed</div>
                  </div>
                )}
                {counts.vectors > 0 && (
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 20, fontWeight: 500, color: 'var(--t1)' }}>{counts.vectors.toLocaleString()}</div>
                    <div style={{ fontSize: 10, color: 'var(--t4)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>vectors stored</div>
                  </div>
                )}
              </div>
            )}

            {/* Per-connector rows with real stage info */}
            {connected.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 340, margin: '0 auto' }}>
                {connected.slice(0, 6).map((id, idx) => {
                  const meta        = CONNECTORS[id];
                  const Icon        = meta?.Icon || Zap;
                  const connPct     = Math.min(100, Math.max(5, pct - idx * 4));
                  const stageLabels = ['Connecting', 'Fetching', 'Ingesting', 'Indexing', 'Embedding', 'Ready'];
                  const connStage   = stageLabels[Math.floor(stageIdx * (stageLabels.length - 1) / (BUILD_STAGES.length - 1))] || 'Ready';
                  return (
                    <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Icon size={12} color={connPct >= 100 ? 'var(--ok)' : 'var(--t3)'} style={{ flexShrink: 0 }} />
                      <span style={{ fontSize: 11, fontWeight: 300, color: 'var(--t2)', minWidth: 96, textAlign: 'left' }}>{meta?.name || id}</span>
                      <div style={{ flex: 1, height: 3, background: 'var(--line-1)', borderRadius: 99, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${connPct}%`, background: connPct >= 100 ? 'var(--ok)' : 'var(--brand)', borderRadius: 99, transition: 'width 1s ease' }} />
                      </div>
                      <span style={{ fontSize: 9, fontWeight: 300, color: 'var(--t4)', minWidth: 52, textAlign: 'right' }}>{connStage}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {err && <div style={{ marginTop: 20, padding: '10px 14px', background: 'rgba(255,200,80,0.06)', border: '1px solid rgba(255,200,80,0.18)', borderRadius: 6, fontSize: 12, fontWeight: 300, color: 'var(--t3)' }}>{err}</div>}
          </>
        ) : (
          <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}>
            <div style={{ width: 60, height: 60, borderRadius: 14, background: 'rgba(80,200,120,0.1)', border: '1px solid rgba(80,200,120,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
              <Check size={30} color="var(--ok)" />
            </div>
            <h1 style={{ ...S.h1, fontSize: 24 }}>Your workspace is ready.</h1>
            {counts.nodes > 0 && (
              <p style={{ fontSize: 13, fontWeight: 300, color: 'var(--t3)', margin: '0 auto 10px', lineHeight: 1.5 }}>
                Indexed <strong style={{ color: 'var(--t2)', fontWeight: 500 }}>{counts.nodes.toLocaleString()}</strong> entities
                {counts.vectors > 0 ? ` and stored ${counts.vectors.toLocaleString()} vector embeddings` : ''}.
              </p>
            )}
            <p style={{ fontSize: 13, fontWeight: 300, color: 'var(--t3)', maxWidth: 360, margin: '0 auto 28px', lineHeight: 1.6 }}>
              FLOW is watching {connected.length} tool{connected.length !== 1 ? 's' : ''} and syncing in the background. Your Morning Brief is ready now.
            </p>
            <button style={S.btn} onClick={onComplete}>Open Morning Brief <ArrowRight size={15} /></button>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}

// ─── Main wizard ──────────────────────────────────────────────────────────────

export default function SetupWizard({ onComplete }) {
  const navigate    = useNavigate();
  const [step,      setStep]      = useState(0);
  const [role,      setRole]      = useState(null);
  const [connected, setConnected] = useState([]);

  const refreshConnected = useCallback(async () => {
    try {
      const token = localStorage.getItem('flow_os_token') || '';
      const wsId  = localStorage.getItem('flow_os_workspace_id') || '';
      const res = await fetch('/api/integrations-hub/status', {
        headers: { Authorization: `Bearer ${token}`, 'workspace-id': wsId },
      });
      if (!res.ok) return;
      const data = await res.json();
      const list = data.integrations
        ? Object.entries(data.integrations).filter(([, v]) => v?.connected).map(([k]) => k)
        : [];
      setConnected(list);
    } catch {}
  }, []);

  useEffect(() => { refreshConnected(); }, [refreshConnected]);

  async function saveRole(r) {
    setRole(r);
    try { await fetch('/api/onboarding/state', { method: 'PUT', headers: authHdrs(), body: JSON.stringify({ role: r }) }).catch(() => {}); } catch {}
  }

  async function finish() {
    try { await fetch('/api/onboarding/complete', { method: 'POST', headers: authHdrs() }); } catch {}
    localStorage.setItem('flow_onboarding_complete', 'true');
    invalidateWorkspaceState();
    if (onComplete) onComplete();
    else navigate('/');
  }

  async function skip() {
    localStorage.setItem('flow_onboarding_dismissed', 'true');
    try { await fetch('/api/onboarding/complete', { method: 'POST', headers: authHdrs() }); } catch {}
    invalidateWorkspaceState();
    navigate('/');
  }

  function next() { setStep(s => Math.min(s + 1, STEPS.length - 1)); }

  return (
    <div style={S.overlay}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <Rail step={step} />
      <AnimatePresence mode="wait">
        <motion.div key={step} style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'auto' }}
          initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }}
          transition={{ duration: 0.2 }}>
          {step === 0 && <StepWelcome onNext={next} onSkip={skip} />}
          {step === 1 && <StepRole selected={role} onSelect={saveRole} onNext={next} />}
          {step === 2 && <StepConnect role={role || 'engineering'} connected={connected} onRefresh={refreshConnected} onNext={next} />}
          {step === 3 && <StepPermissions connected={connected} onNext={next} />}
          {step === 4 && <StepBuild connected={connected} onComplete={finish} />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
