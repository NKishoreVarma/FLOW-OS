/**
 * Success / Value Dashboard (Phase 17, M3) — Track 5.
 *
 * Personal ROI, not system metrics. Reads /api/success/summary (hybrid: measured counts +
 * transparently labeled estimates). Every number carries a basis badge — measured or
 * estimated — and the estimate model is disclosed. Includes the reusable TrustBar and the
 * standalone "Load Demo Company" entry (Track 7) so the dashboard is impressive on demo
 * data and honest on a fresh install.
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Clock, Shuffle, CheckSquare, ShieldCheck, Mail, GitMerge, CalendarCheck, ListTodo,
  RefreshCw, Wand2, UserPlus, Info,
} from 'lucide-react';
import { successApi, onboardingApi } from '../../lib/onboardingApi';
import TrustBar from '../ui/TrustBar';

const ICONS = {
  timeSaved: Clock, contextSwitches: Shuffle, tasksCompleted: CheckSquare, approvalsExecuted: ShieldCheck,
  emailsDrafted: Mail, mergeConflictsResolved: GitMerge, meetingsPrepared: CalendarCheck, jiraIssuesCreated: ListTodo,
};

const page = { maxWidth: 1040, margin: '0 auto', padding: '28px 24px 64px' };
const basisBadge = (basis) => ({
  fontSize: 9, fontWeight: 500, letterSpacing: '0.04em', textTransform: 'uppercase', padding: '2px 6px', borderRadius: 5,
  color: basis === 'measured' ? 'var(--p-normal-text)' : 'var(--p-high-text)',
  background: basis === 'measured' ? 'var(--p-normal)' : 'var(--p-high)',
});
const btn = { display: 'inline-flex', alignItems: 'center', gap: 7, borderRadius: 9, padding: '9px 14px', fontSize: 13, fontWeight: 500, cursor: 'pointer', border: '1px solid var(--border-strong)', background: 'var(--bg-card)', color: 'var(--t1)' };

function MetricCard({ metric, big }) {
  const Icon = ICONS[metric.key] || CheckSquare;
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: big ? '18px 18px 16px' : '14px 15px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Icon size={big ? 18 : 15} style={{ color: 'var(--brand)' }} />
        <span style={{ fontSize: 11, color: 'var(--t3)', fontWeight: 500 }}>{metric.label}</span>
        <span style={{ marginLeft: 'auto', ...basisBadge(metric.basis) }}>{metric.basis}</span>
      </div>
      <div style={{ fontSize: big ? 34 : 24, fontWeight: 500, letterSpacing: '-0.02em', color: 'var(--t1)' }}>
        {metric.value}{metric.unit === 'hours' ? <span style={{ fontSize: 15, color: 'var(--t3)', marginLeft: 4 }}>hrs</span> : null}
      </div>
    </div>
  );
}

export default function SuccessDashboard() {
  const navigate = useNavigate();
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [showModel, setShowModel] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setSummary(await successApi.summary(7)); } catch { setSummary(null); }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function loadDemo() {
    setSeeding(true);
    await onboardingApi.seedDemo(45);
    setSeeding(false);
    setTimeout(load, 800);
  }

  const headline = summary?.headline || [];
  const detail = summary?.detail || [];
  const model = summary?.model;

  return (
    <div style={page}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
        <h1 style={{ fontSize: 22, fontWeight: 500, letterSpacing: '-0.02em', margin: 0 }}>Your week with FLOW</h1>
        <button style={{ ...btn, marginLeft: 'auto', padding: '7px 11px' }} onClick={load}><RefreshCw size={14} /> Refresh</button>
      </div>
      <p style={{ fontSize: 13, color: 'var(--t3)', margin: '0 0 22px' }}>Business value, measured where FLOW actually did the work — and clearly labeled where a number is an estimate.</p>

      {loading ? (
        <p style={{ color: 'var(--t4)', fontSize: 13 }}>Loading your value summary…</p>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12, marginBottom: 12 }}>
            {headline.map((m) => <MetricCard key={m.key} metric={m} big />)}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12, marginBottom: 14 }}>
            {detail.map((m) => <MetricCard key={m.key} metric={m} />)}
          </div>

          {model && (
            <div style={{ marginBottom: 22 }}>
              <button onClick={() => setShowModel((v) => !v)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: 'var(--t3)', fontSize: 12, cursor: 'pointer' }}>
                <Info size={13} /> How “Time Saved” is estimated
              </button>
              {showModel && (
                <div style={{ marginTop: 8, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, fontSize: 12, color: 'var(--t3)', lineHeight: 1.6 }}>
                  <p style={{ margin: '0 0 8px' }}>{model.note}</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {Object.entries(model.minutesPer || {}).map(([k, v]) => (
                      <span key={k} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, background: 'var(--bg-base)', border: '1px solid var(--border-strong)' }}>{k} · {v} min</span>
                    ))}
                    <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, background: 'var(--bg-base)', border: '1px solid var(--border-strong)' }}>context switch · {model.minutesPerContextSwitch} min</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      <div style={{ marginBottom: 20 }}><TrustBar /></div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button style={{ ...btn, borderColor: 'var(--brand-line)', background: 'var(--brand-dim)', color: 'var(--brand-text)' }} onClick={loadDemo} disabled={seeding}>
          <Wand2 size={15} /> {seeding ? 'Loading demo…' : 'Load Demo Company'}
        </button>
        <button style={btn} onClick={() => navigate('/settings/team')}><UserPlus size={15} /> Invite your team</button>
      </div>
    </div>
  );
}
