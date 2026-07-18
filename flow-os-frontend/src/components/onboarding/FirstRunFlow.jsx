/**
 * FLOW OS — First-Run Flow (Phase 17, M2)
 *
 * The premium first-time experience. Full-screen, focused, one decision per step
 * (Linear/Vercel style) — rendered OUTSIDE the app shell (no sidebar). Reuses the M1
 * onboarding backend: Welcome → Discovery → Permissions → Build → Ready (Morning Brief).
 * Demo mode is co-primary with real connect and seeds the Living Workspace Simulator.
 */

import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight, Check, Code2, MessageSquare, Mail, Calendar, FileText, BookOpen, Sparkles, Loader2, ShieldCheck, Wand2,
} from 'lucide-react';
import { onboardingApi } from '../../lib/onboardingApi';

const STEPS = ['welcome', 'discover', 'permissions', 'build', 'ready'];
const STEP_LABEL = { welcome: 'Welcome', discover: 'Discover', permissions: 'Permissions', build: 'Build', ready: 'Ready' };
const CONNECTOR_META = {
  github: { name: 'GitHub', icon: Code2 }, slack: { name: 'Slack', icon: MessageSquare },
  gmail: { name: 'Gmail', icon: Mail }, 'google-calendar': { name: 'Calendar', icon: Calendar },
  notion: { name: 'Notion', icon: BookOpen }, jira: { name: 'Jira', icon: FileText },
};
const BUILD_STAGES = [
  'Building operational graph…', 'Learning engineering ownership…', 'Analyzing meetings & threads…',
  'Understanding projects & customers…', 'Preparing your Morning Brief…', 'Initializing Adaptive Workday…', 'Almost ready…',
];

const wrap = { position: 'fixed', inset: 0, zIndex: 4000, background: 'var(--bg-base)', color: 'var(--t1)', display: 'flex', flexDirection: 'column', fontFamily: 'inherit', overflow: 'auto' };
const brandDot = { width: 22, height: 22, borderRadius: 6, background: 'var(--brand)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 13 };
const centerCol = { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 24px', textAlign: 'center' };
const h1 = { fontSize: 30, fontWeight: 500, letterSpacing: '-0.02em', margin: '0 0 10px' };
const sub = { fontSize: 15, color: 'var(--t3)', maxWidth: 420, lineHeight: 1.5, margin: '0 0 28px' };
const primaryBtn = { display: 'inline-flex', alignItems: 'center', gap: 8, background: 'var(--brand)', color: '#fff', border: 'none', borderRadius: 10, padding: '12px 20px', fontSize: 14, fontWeight: 500, cursor: 'pointer' };
const ghostBtn = { display: 'inline-flex', alignItems: 'center', gap: 8, background: 'var(--bg-card)', color: 'var(--t1)', border: '1px solid var(--border-strong)', borderRadius: 10, padding: '12px 20px', fontSize: 14, fontWeight: 500, cursor: 'pointer' };

function ProgressRail({ step }) {
  const idx = STEPS.indexOf(step);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '18px 26px', borderBottom: '1px solid var(--border)' }}>
      <div style={brandDot}>F</div>
      <span style={{ fontWeight: 500, letterSpacing: '-0.01em' }}>FLOW</span>
      <div style={{ display: 'flex', gap: 7, marginLeft: 16 }}>
        {STEPS.map((s, i) => (
          <div key={s} title={STEP_LABEL[s]} style={{ width: i === idx ? 22 : 8, height: 8, borderRadius: 99, background: i <= idx ? 'var(--brand)' : 'var(--border-strong)', transition: 'all .3s' }} />
        ))}
      </div>
      <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--t4)' }}>{STEP_LABEL[step]}</span>
    </div>
  );
}

// ── Welcome ─────────────────────────────────────────────────────────────────────
function Welcome({ onConnect, onDemo, onSkip }) {
  return (
    <div style={centerCol}>
      <div style={{ ...brandDot, width: 44, height: 44, borderRadius: 10, fontSize: 22, marginBottom: 22 }}>F</div>
      <h1 style={h1}>Welcome to FLOW.</h1>
      <p style={sub}>Let’s connect your workspace. In a few minutes FLOW will understand your company — your code, meetings, customers, and the work that matters today.</p>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
        <button style={primaryBtn} onClick={onConnect}><ShieldCheck size={16} /> Connect your tools</button>
        <button style={ghostBtn} onClick={onDemo}><Wand2 size={16} /> Load Demo Company <ArrowRight size={15} /></button>
      </div>
      <p style={{ fontSize: 12, color: 'var(--t5)', marginTop: 20 }}>Exploring FLOW? Load a fully-formed 6-month demo company in one click.</p>
      <button onClick={onSkip} style={{ marginTop: 18, background: 'none', border: 'none', color: 'var(--t4)', fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }}>Skip for now</button>
    </div>
  );
}

// ── Discovery ───────────────────────────────────────────────────────────────────
function Discovery({ discovery, revealed, onContinue }) {
  const lines = [];
  if (discovery?.org?.employees) lines.push({ key: 'emp', text: `${discovery.org.employees} employees found` });
  (discovery?.connectors || []).forEach((c) => {
    if (c.status === 'discovered' && c.count) lines.push({ key: c.connector, text: `${c.count} ${c.resourceLabel || 'resources'} in ${CONNECTOR_META[c.connector]?.name || c.connector}` });
  });
  if (discovery?.org?.projects) lines.push({ key: 'proj', text: `${discovery.org.projects} projects mapped` });
  return (
    <div style={centerCol}>
      <h1 style={h1}>Discovering your workspace</h1>
      <p style={sub}>FLOW is scanning what it’s allowed to see — nothing is imported yet.</p>
      <div style={{ width: '100%', maxWidth: 440, textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {lines.map((l, i) => (
          <div key={l.key} style={{ display: 'flex', alignItems: 'center', gap: 10, opacity: i < revealed ? 1 : 0.25, transform: i < revealed ? 'none' : 'translateY(4px)', transition: 'all .35s', fontSize: 14 }}>
            {i < revealed ? <Check size={17} style={{ color: 'var(--brand)' }} /> : <Loader2 size={16} className="spin" style={{ color: 'var(--t4)' }} />}
            <span>{l.text}</span>
          </div>
        ))}
      </div>
      <button style={{ ...primaryBtn, marginTop: 30, opacity: revealed >= lines.length ? 1 : 0.5 }} disabled={revealed < lines.length} onClick={onContinue}>Review what FLOW can access <ArrowRight size={15} /></button>
    </div>
  );
}

// ── Permissions ─────────────────────────────────────────────────────────────────
function Permissions({ discovery, selections, toggle, onSave, saving }) {
  const connectors = (discovery?.connectors || []).filter((c) => c.status === 'discovered' && c.count);
  return (
    <div style={{ ...centerCol, justifyContent: 'flex-start', paddingTop: 40 }}>
      <h1 style={h1}>Decide what FLOW may understand</h1>
      <p style={sub}>You’re in control. FLOW only reads what you allow — everything else is refused at the door.</p>
      <div style={{ width: '100%', maxWidth: 560, textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {connectors.map((c) => {
          const Icon = CONNECTOR_META[c.connector]?.icon || FileText;
          return (
            <div key={c.connector} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10, fontWeight: 500 }}>
                <Icon size={16} style={{ color: 'var(--brand)' }} /> {CONNECTOR_META[c.connector]?.name || c.connector}
                <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--t4)' }}>{c.count} {c.resourceLabel}</span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {c.resources.map((r) => {
                  const on = selections[c.connector]?.[r.key] ?? r.recommended;
                  return (
                    <button key={r.key} onClick={() => toggle(c.connector, r.key, !on)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '6px 10px', borderRadius: 8, cursor: 'pointer', border: `1px solid ${on ? 'var(--brand-line)' : 'var(--border-strong)'}`, background: on ? 'var(--brand-dim)' : 'transparent', color: on ? 'var(--brand-text)' : 'var(--t3)' }}>
                      <span style={{ width: 13, height: 13, borderRadius: 4, border: `1px solid ${on ? 'var(--brand)' : 'var(--border-strong)'}`, background: on ? 'var(--brand)' : 'transparent', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{on && <Check size={10} color="#fff" />}</span>
                      {r.name}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <button style={{ ...primaryBtn, marginTop: 26 }} onClick={onSave} disabled={saving}>
        {saving ? <Loader2 size={16} className="spin" /> : <ShieldCheck size={16} />} Approve & build my workspace
      </button>
    </div>
  );
}

// ── Build ───────────────────────────────────────────────────────────────────────
function Build({ stage }) {
  return (
    <div style={centerCol}>
      <div style={{ ...brandDot, width: 44, height: 44, borderRadius: 10, marginBottom: 22 }}><Sparkles size={22} /></div>
      <h1 style={h1}>Building your workspace</h1>
      <div style={{ height: 26, marginTop: 6 }}>
        <span key={stage} style={{ fontSize: 15, color: 'var(--brand-text)' }}>{BUILD_STAGES[stage]}</span>
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 24 }}>
        {BUILD_STAGES.map((_, i) => (
          <div key={i} style={{ width: 8, height: 8, borderRadius: 99, background: i <= stage ? 'var(--brand)' : 'var(--border-strong)', transition: 'all .3s' }} />
        ))}
      </div>
      <p style={{ fontSize: 12, color: 'var(--t5)', marginTop: 22 }}>FLOW never shows a blank spinner — it tells you what it’s doing.</p>
    </div>
  );
}

// ── Ready ───────────────────────────────────────────────────────────────────────
function Ready({ onEnter }) {
  return (
    <div style={centerCol}>
      <div style={{ width: 52, height: 52, borderRadius: 10, background: 'var(--brand-dim)', border: '1px solid var(--brand-line)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
        <Check size={26} style={{ color: 'var(--brand)' }} />
      </div>
      <h1 style={h1}>Your workspace is ready.</h1>
      <p style={sub}>FLOW has organized everything that matters. Here’s your Morning Brief — the one place to start your day.</p>
      <button style={primaryBtn} onClick={onEnter}>Open my Morning Brief <ArrowRight size={15} /></button>
    </div>
  );
}

export default function FirstRunFlow() {
  const navigate = useNavigate();
  const [step, setStep] = useState('welcome');
  const [mode, setMode] = useState('demo');
  const [discovery, setDiscovery] = useState(null);
  const [revealed, setRevealed] = useState(0);
  const [selections, setSelections] = useState({});
  const [saving, setSaving] = useState(false);
  const [buildStage, setBuildStage] = useState(0);
  const timers = useRef([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  async function runDiscovery(chosen) {
    setMode(chosen); setStep('discover'); setRevealed(0);
    let data;
    try { data = await onboardingApi.discover(chosen); }
    catch { data = { connectors: [], org: null, totals: { resources: 0 } }; }
    setDiscovery(data);
    const count = 1 + (data.connectors || []).filter((c) => c.status === 'discovered' && c.count).length + (data.org?.projects ? 1 : 0);
    for (let i = 1; i <= count; i++) timers.current.push(setTimeout(() => setRevealed(i), i * 380));
  }

  function toggle(connector, key, on) {
    setSelections((prev) => ({ ...prev, [connector]: { ...(prev[connector] || {}), [key]: on } }));
  }

  async function savePermissions() {
    setSaving(true);
    try { await onboardingApi.permissions(selections); } catch { /* best-effort */ }
    setSaving(false);
    startBuild();
  }

  function startBuild() {
    setStep('build'); setBuildStage(0);
    if (mode === 'demo') onboardingApi.seedDemo(45); // dev-only simulator; best-effort
    BUILD_STAGES.forEach((_, i) => timers.current.push(setTimeout(() => setBuildStage(i), i * 900)));
    timers.current.push(setTimeout(async () => {
      try { await onboardingApi.complete(); } catch { /* ignore */ }
      localStorage.setItem('flow_onboarding_complete', 'true');
      setStep('ready');
    }, BUILD_STAGES.length * 900 + 400));
  }

  return (
    <div style={wrap}>
      <style>{`.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <ProgressRail step={step} />
      {step === 'welcome' && <Welcome onConnect={() => runDiscovery('live')} onDemo={() => runDiscovery('demo')} onSkip={() => { localStorage.setItem('flow_onboarding_dismissed', 'true'); navigate('/'); }} />}
      {step === 'discover' && <Discovery discovery={discovery} revealed={revealed} onContinue={() => setStep('permissions')} />}
      {step === 'permissions' && <Permissions discovery={discovery} selections={selections} toggle={toggle} onSave={savePermissions} saving={saving} />}
      {step === 'build' && <Build stage={buildStage} />}
      {step === 'ready' && <Ready onEnter={() => navigate('/')} />}
    </div>
  );
}
