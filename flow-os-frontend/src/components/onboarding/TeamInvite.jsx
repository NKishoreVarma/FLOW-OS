/**
 * Team Invite (Phase 17, M3) — Track 6.
 *
 * Encourages collaborative adoption. Reuses the existing user CRUD (POST /api/users/invite,
 * GET /api/users). For each role it says WHY to invite them and WHAT they gain. No email
 * infra yet, so it generates a temporary password and surfaces it for the admin to share —
 * honest rather than pretending an email was sent.
 */

import { useState, useEffect, useCallback } from 'react';
import { UserPlus, Check, Copy, Users } from 'lucide-react';
import { teamApi, generateTempPassword } from '../../lib/trustApi';

const ROLES = [
  { value: 'ADMIN', label: 'Admin', why: 'Co-runs governance', gain: 'Approve actions, manage permissions & policies' },
  { value: 'MEMBER', label: 'Member', why: 'Does the daily work', gain: 'Morning Brief, Workday queue, execute their own actions' },
  { value: 'VIEWER', label: 'Viewer', why: 'Stays informed', gain: 'Read-only briefings & dashboards' },
];
const SUGGESTED = ['Engineering Manager', 'Product Manager', 'Operations', 'Finance', 'Support'];

const page = { maxWidth: 760, margin: '0 auto', padding: '28px 24px 64px' };
const input = { width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border-strong)', borderRadius: 8, padding: '9px 11px', fontSize: 13, color: 'var(--t1)', outline: 'none', boxSizing: 'border-box' };
const card = { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: 18 };
const primary = { display: 'inline-flex', alignItems: 'center', gap: 7, background: 'var(--brand)', color: '#fff', border: 'none', borderRadius: 9, padding: '10px 16px', fontSize: 13, fontWeight: 500, cursor: 'pointer' };

export default function TeamInvite() {
  const [team, setTeam] = useState([]);
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState('MEMBER');
  const [busy, setBusy] = useState(false);
  const [invited, setInvited] = useState(null); // { email, password }
  const [error, setError] = useState('');

  const load = useCallback(async () => { try { const r = await teamApi.list(); setTeam(r.users || r || []); } catch { setTeam([]); } }, []);
  useEffect(() => { load(); }, [load]);

  async function invite() {
    setError(''); setInvited(null);
    if (!email || !fullName) { setError('Name and email are required.'); return; }
    setBusy(true);
    const password = generateTempPassword();
    try {
      await teamApi.invite({ email, fullName, role, password });
      setInvited({ email, password });
      setEmail(''); setFullName('');
      load();
    } catch (e) { setError(e.message); }
    setBusy(false);
  }

  return (
    <div style={page}>
      <h1 style={{ fontSize: 22, fontWeight: 500, letterSpacing: '-0.02em', margin: '0 0 6px' }}>Invite your team</h1>
      <p style={{ fontSize: 13, color: 'var(--t3)', margin: '0 0 22px' }}>FLOW gets better with your team on it — everyone sees the work that’s theirs, and nothing they’re not allowed to.</p>

      <div style={{ ...card, marginBottom: 18 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
          <div><label style={{ fontSize: 11, color: 'var(--t4)' }}>Full name</label><input style={input} value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Priya N." /></div>
          <div><label style={{ fontSize: 11, color: 'var(--t4)' }}>Work email</label><input style={input} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="priya@company.com" /></div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          {ROLES.map((r) => (
            <button key={r.value} onClick={() => setRole(r.value)} style={{ flex: '1 1 200px', textAlign: 'left', cursor: 'pointer', borderRadius: 10, padding: 11, border: `1px solid ${role === r.value ? 'var(--brand-line)' : 'var(--border-strong)'}`, background: role === r.value ? 'var(--brand-dim)' : 'transparent' }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: role === r.value ? 'var(--brand-text)' : 'var(--t1)', display: 'flex', alignItems: 'center', gap: 6 }}>{r.label}{role === r.value && <Check size={13} />}</div>
              <div style={{ fontSize: 11, color: 'var(--t4)', marginTop: 3 }}>{r.why} · {r.gain}</div>
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
          {SUGGESTED.map((s) => <button key={s} onClick={() => setFullName(s)} style={{ fontSize: 11, padding: '4px 9px', borderRadius: 7, border: '1px solid var(--border-strong)', background: 'var(--bg-base)', color: 'var(--t3)', cursor: 'pointer' }}>{s}</button>)}
        </div>
        {error && <p style={{ color: 'var(--p-critical-text)', fontSize: 12, margin: '0 0 10px' }}>{error}</p>}
        <button style={primary} onClick={invite} disabled={busy}><UserPlus size={15} /> {busy ? 'Inviting…' : 'Send invite'}</button>

        {invited && (
          <div style={{ marginTop: 14, padding: 12, borderRadius: 10, background: 'var(--brand-dim)', border: '1px solid var(--brand-line)' }}>
            <div style={{ fontSize: 12, color: 'var(--brand-text)', fontWeight: 500, marginBottom: 6 }}>✓ {invited.email} added</div>
            <div style={{ fontSize: 12, color: 'var(--t2)', display: 'flex', alignItems: 'center', gap: 8 }}>
              Temporary password: <code style={{ background: 'var(--bg-base)', padding: '2px 7px', borderRadius: 6, border: '1px solid var(--border-strong)' }}>{invited.password}</code>
              <button onClick={() => navigator.clipboard?.writeText(invited.password)} style={{ background: 'none', border: 'none', color: 'var(--t3)', cursor: 'pointer' }}><Copy size={13} /></button>
            </div>
            <div style={{ fontSize: 11, color: 'var(--t4)', marginTop: 5 }}>Share this with them to sign in — they can change it after first login.</div>
          </div>
        )}
      </div>

      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}><Users size={15} style={{ color: 'var(--brand)' }} /><span style={{ fontSize: 12, fontWeight: 500, color: 'var(--t2)' }}>YOUR TEAM ({team.length})</span></div>
        {team.length === 0 ? <p style={{ fontSize: 12, color: 'var(--t4)', margin: 0 }}>No teammates yet — invite your first above.</p> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {team.map((u) => (
              <div key={u.id || u.email} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
                <div style={{ width: 26, height: 26, borderRadius: 8, background: 'var(--brand-dim)', color: 'var(--brand-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 500 }}>{(u.fullName || u.email || '?').slice(0, 1).toUpperCase()}</div>
                <span style={{ color: 'var(--t1)' }}>{u.fullName || u.email}</span>
                <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 500, color: 'var(--t4)', textTransform: 'uppercase' }}>{u.role}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
