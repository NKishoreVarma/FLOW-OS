import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Loader2, AlertCircle, Zap, UserPlus } from 'lucide-react';

export default function LoginPage() {
  const [mode, setMode] = useState('login'); // 'login' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [orgName, setOrgName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();

  // If already logged in with a valid token, go straight to the app
  useEffect(() => {
    const token = localStorage.getItem('flow_os_token');
    if (!token) return;
    fetch('/api/org/workspaces', {
      headers: { Authorization: `Bearer ${token}`, 'workspace-id': 'verify' },
    }).then(r => {
      if (r.ok) navigate(location.state?.from || '/setup', { replace: true });
    }).catch(() => {});
  }, []);

  async function saveTokenAndRedirect(token) {
    localStorage.setItem('flow_os_token', token);
    const wsRes = await fetch('/api/org/workspaces', {
      headers: { Authorization: `Bearer ${token}`, 'workspace-id': 'init' },
    });
    if (wsRes.ok) {
      const workspaces = await wsRes.json().catch(() => []);
      if (Array.isArray(workspaces) && workspaces.length > 0) {
        const stored = localStorage.getItem('flow_os_workspace_id');
        const match = workspaces.find(w => w.externalId === stored);
        const active = match ? match.externalId : workspaces[0].externalId;
        localStorage.setItem('flow_os_workspace_id', active);
      }
    }
    window.location.href = '/setup';
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (mode === 'signup') {
        const res = await fetch('/api/auth/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: email.trim(),
            password,
            fullName: fullName.trim() || email.split('@')[0],
            orgName: orgName.trim() || 'My Company',
          }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          const msg = body?.error?.message || body?.message || body?.error || 'Signup failed.';
          setError(typeof msg === 'string' ? msg : 'Signup failed.');
          return;
        }
        const token = body.token;
        if (!token) { setError('Signup succeeded but no token returned.'); return; }
        const user = body.user || body.data?.user;
        if (user?.fullName || user?.name) localStorage.setItem('flow_user_name', user.fullName || user.name);
        if (user?.email) localStorage.setItem('flow_user_email', user.email);
        await saveTokenAndRedirect(token);
        return;
      }

      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });

      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        const msg = body?.error?.message || body?.message || body?.error || 'Invalid email or password.';
        setError(typeof msg === 'string' ? msg : 'Invalid email or password.');
        return;
      }

      const token = body.token;
      if (!token) { setError('Login succeeded but no token returned.'); return; }

      const user = body.user || body.data?.user;
      if (user?.fullName || user?.name) localStorage.setItem('flow_user_name', user.fullName || user.name);
      if (user?.email) localStorage.setItem('flow_user_email', user.email);

      await saveTokenAndRedirect(token);
    } catch (err) {
      setError('Connection error. Is the server running?');
    } finally {
      setLoading(false);
    }
  }

  const inputStyle = {
    padding: '10px 14px',
    fontSize: 14,
    border: '1px solid var(--color-border, #e5e3df)',
    borderRadius: 10,
    outline: 'none',
    background: 'var(--color-surface, #f9f8f6)',
    color: 'var(--color-text, #1a1917)',
    width: '100%',
    boxSizing: 'border-box',
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--color-surface, #f9f8f6)',
      padding: '24px',
    }}>
      <div style={{
        width: '100%',
        maxWidth: 400,
        background: 'var(--color-bg, #ffffff)',
        borderRadius: 16,
        border: '1px solid var(--color-border, #e5e3df)',
        padding: '40px 36px',
        boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 32 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'var(--color-accent, #E8672B)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Zap size={20} color="#fff" />
          </div>
          <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-text, #1a1917)' }}>FLOW OS</span>
        </div>

        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-text, #1a1917)', margin: '0 0 6px' }}>
          {mode === 'signup' ? 'Create your workspace' : 'Welcome back'}
        </h1>
        <p style={{ fontSize: 14, color: 'var(--color-text-muted, #6b6a68)', margin: '0 0 28px' }}>
          {mode === 'signup' ? 'Set up FLOW OS for your team' : 'Sign in to your workspace'}
        </p>

        {error && (
          <div style={{
            display: 'flex', gap: 8, alignItems: 'flex-start',
            background: '#fff5f5', border: '1px solid #fecaca',
            borderRadius: 10, padding: '12px 14px', marginBottom: 20,
          }}>
            <AlertCircle size={16} color="#ef4444" style={{ marginTop: 1, flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: '#dc2626' }}>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {mode === 'signup' && (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text, #1a1917)' }}>Full name</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  placeholder="Your name"
                  autoFocus
                  style={inputStyle}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text, #1a1917)' }}>Company name</label>
                <input
                  type="text"
                  value={orgName}
                  onChange={e => setOrgName(e.target.value)}
                  placeholder="Acme Corp"
                  style={inputStyle}
                />
              </div>
            </>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text, #1a1917)' }}>Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@company.com"
              required
              autoFocus={mode === 'login'}
              style={inputStyle}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text, #1a1917)' }}>Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              style={inputStyle}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: 4,
              padding: '11px 0',
              fontSize: 14,
              fontWeight: 600,
              background: loading ? '#c4c2be' : 'var(--color-accent, #E8672B)',
              color: '#fff',
              border: 'none',
              borderRadius: 10,
              cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              width: '100%',
            }}
          >
            {loading && <Loader2 size={16} />}
            {loading ? (mode === 'signup' ? 'Creating…' : 'Signing in…') : (mode === 'signup' ? 'Create workspace' : 'Sign in')}
          </button>
        </form>

        <div style={{ marginTop: 20, textAlign: 'center', fontSize: 13, color: 'var(--color-text-muted, #6b6a68)' }}>
          {mode === 'login' ? (
            <>
              New to FLOW?{' '}
              <button
                onClick={() => { setMode('signup'); setError(null); }}
                style={{ background: 'none', border: 'none', color: 'var(--color-accent, #E8672B)', cursor: 'pointer', fontSize: 13, fontWeight: 500, padding: 0 }}
              >
                Create an account
              </button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button
                onClick={() => { setMode('login'); setError(null); }}
                style={{ background: 'none', border: 'none', color: 'var(--color-accent, #E8672B)', cursor: 'pointer', fontSize: 13, fontWeight: 500, padding: 0 }}
              >
                Sign in
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
