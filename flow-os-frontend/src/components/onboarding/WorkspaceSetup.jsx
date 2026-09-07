/**
 * WorkspaceSetup — First Real Workspace Experience.
 *
 * Phase 2: Every successful connection feels like FLOW has learned something.
 * After each connector links, FLOW auto-discovers what's there and shows it.
 * When ≥3 are connected, user triggers indexing — a live view with real counts.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useWorkspaceState, invalidateWorkspaceState } from '../../hooks/useWorkspaceState';
import {
  GitBranch, Mail, Calendar, FileText, MessageSquare, CheckCircle2,
  CircleDashed, Loader2, ArrowRight, AlertCircle, Database, Brain,
  Zap, Sparkles,
} from 'lucide-react';

const MIN_REQUIRED = 3;

const INTEGRATIONS = [
  {
    id: 'github',
    name: 'GitHub',
    description: 'Repositories, pull requests, commits, and code review',
    icon: GitBranch,
    category: 'Engineering',
    connectPath: '/api/engineering/auth',
    available: true,
  },
  {
    id: 'gmail',
    name: 'Gmail',
    description: 'Email threads, labels, and communication history',
    icon: Mail,
    category: 'Communication',
    oauthInit: '/api/connectors/gmail/auth/initiate',
    available: true,
  },
  {
    id: 'google-calendar',
    name: 'Google Calendar',
    description: 'Events, meeting context, and scheduling',
    icon: Calendar,
    category: 'Meetings',
    oauthInit: '/api/connectors/google-calendar/auth/initiate',
    available: true,
  },
  {
    id: 'notion',
    name: 'Notion',
    description: 'Pages, databases, and knowledge base',
    icon: FileText,
    category: 'Knowledge',
    available: false,
  },
  {
    id: 'jira',
    name: 'Jira',
    description: 'Issues, projects, and sprint progress',
    icon: CheckCircle2,
    category: 'Work Management',
    available: false,
  },
  {
    id: 'slack',
    name: 'Slack',
    description: 'Channels, threads, and team communication',
    icon: MessageSquare,
    category: 'Communication',
    available: false,
  },
];

function authHdrs() {
  const token = localStorage.getItem('flow_os_token') || '';
  const wsId  = localStorage.getItem('flow_os_workspace_id') || '';
  return { Authorization: `Bearer ${token}`, 'workspace-id': wsId, 'Content-Type': 'application/json' };
}

// ─── Discovery panels ─────────────────────────────────────────────────────────

function DiscoveryPanel({ id, discovery }) {
  if (discovery.loading) {
    return (
      <div style={{ padding: '10px 20px 12px', borderTop: '1px solid rgba(34,197,94,0.12)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <Loader2 style={{ width: 11, height: 11, color: 'var(--t4)' }} className="flow-spin" />
        <span style={{ fontFamily: 'var(--font-data)', fontSize: 11, color: 'var(--t4)' }}>
          {id === 'github' ? 'Discovering repositories…' : id === 'gmail' ? 'Scanning mailbox…' : 'Reading calendar…'}
        </span>
      </div>
    );
  }

  if (id === 'github' && discovery.repos) {
    const repos = discovery.repos.slice(0, 5);
    const extra  = discovery.repos.length - 5;
    return (
      <div style={{ padding: '10px 20px 14px', borderTop: '1px solid rgba(34,197,94,0.12)', background: 'rgba(34,197,94,0.015)' }}>
        <div style={{ fontFamily: 'var(--font-data)', fontSize: 11, color: '#22c55e', fontWeight: 500, marginBottom: 8, letterSpacing: '0.01em' }}>
          ✓ Found {discovery.repos.length} repositor{discovery.repos.length === 1 ? 'y' : 'ies'}
        </div>
        {repos.map((repo, i) => (
          <div key={repo.fullName || repo.name || i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'rgba(34,197,94,0.5)', flexShrink: 0 }} />
            <span style={{ fontFamily: 'var(--font-data)', fontSize: 11, color: 'var(--t3)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {repo.fullName || repo.name}
            </span>
            {repo.language && (
              <span style={{ fontFamily: 'var(--font-data)', fontSize: 9, color: 'var(--t5)', border: '1px solid var(--line-0)', padding: '1px 5px', borderRadius: 2, flexShrink: 0 }}>
                {repo.language}
              </span>
            )}
          </div>
        ))}
        {extra > 0 && (
          <div style={{ fontFamily: 'var(--font-data)', fontSize: 10, color: 'var(--t5)', marginTop: 2 }}>
            +{extra} more repositories
          </div>
        )}
      </div>
    );
  }

  if (id === 'gmail') {
    const { messageCount = 0, unreadCount = 0, labels = [] } = discovery;
    const named = labels.filter(l => l.name && !['CATEGORY_PROMOTIONS','CATEGORY_UPDATES','CATEGORY_SOCIAL','SPAM','TRASH','UNREAD','STARRED','IMPORTANT'].includes(l.id)).slice(0, 4);
    return (
      <div style={{ padding: '10px 20px 14px', borderTop: '1px solid rgba(34,197,94,0.12)', background: 'rgba(34,197,94,0.015)' }}>
        <div style={{ fontFamily: 'var(--font-data)', fontSize: 11, color: '#22c55e', fontWeight: 500, marginBottom: 8 }}>
          ✓ Found primary mailbox
          {(messageCount > 0 || unreadCount > 0) && (
            <span style={{ color: 'var(--t3)', fontWeight: 300, marginLeft: 6 }}>
              {unreadCount > 0 ? `${unreadCount} unread` : `${messageCount}+ messages`}
            </span>
          )}
        </div>
        {['Inbox', 'Sent', ...named.map(l => l.name)].map(name => (
          <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'rgba(34,197,94,0.5)', flexShrink: 0 }} />
            <span style={{ fontFamily: 'var(--font-data)', fontSize: 11, color: 'var(--t3)' }}>{name}</span>
          </div>
        ))}
      </div>
    );
  }

  if (id === 'google-calendar') {
    const { eventCount = 0 } = discovery;
    return (
      <div style={{ padding: '10px 20px 14px', borderTop: '1px solid rgba(34,197,94,0.12)', background: 'rgba(34,197,94,0.015)' }}>
        <div style={{ fontFamily: 'var(--font-data)', fontSize: 11, color: '#22c55e', fontWeight: 500, marginBottom: 6 }}>
          ✓ {eventCount > 0 ? `Found ${eventCount} calendar events` : 'Calendar connected'}
        </div>
        <div style={{ fontFamily: 'var(--font-data)', fontSize: 11, color: 'var(--t4)', lineHeight: 1.5 }}>
          Meetings and recurring events will be indexed for AI context.
        </div>
      </div>
    );
  }

  return null;
}

// ─── Integration card (with discovery panel) ──────────────────────────────────

function IntegrationCard({ integration, isConnected, discovery, onConnect, connecting }) {
  const Icon = integration.icon;
  const [hovered, setHovered] = useState(false);
  const [showPAT, setShowPAT] = useState(false);
  const [patValue, setPatValue] = useState('');
  const showPanel = isConnected && discovery;
  const isGitHub = integration.connectPath === '/api/engineering/auth';
  const isBusy = connecting === integration.id;

  function handleConnectClick() {
    if (isGitHub) { setShowPAT(true); return; }
    onConnect(integration);
  }

  function handlePATSubmit(e) {
    e.preventDefault();
    if (!patValue.trim()) return;
    setShowPAT(false);
    onConnect(integration, patValue.trim());
  }

  function handlePATCancel() {
    setShowPAT(false);
    setPatValue('');
  }

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: isConnected ? 'rgba(34, 197, 94, 0.04)' : hovered ? 'rgba(31,27,22,0.03)' : 'var(--surface-1)',
        border: `1px solid ${isConnected ? 'rgba(34, 197, 94, 0.28)' : (showPAT ? 'var(--accent)' : hovered ? 'var(--line-1)' : 'var(--line-0)')}`,
        borderRadius: 8, overflow: 'hidden', transition: 'all 120ms ease',
      }}
    >
      <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 8, flexShrink: 0,
          background: isConnected ? 'rgba(34, 197, 94, 0.1)' : 'var(--surface-2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon style={{ width: 20, height: 20, color: isConnected ? '#22c55e' : 'var(--t2)' }} strokeWidth={1.5} />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
            <span style={{ fontFamily: 'var(--font-ui)', fontSize: 14, fontWeight: 500, color: 'var(--t1)' }}>
              {integration.name}
            </span>
            <span style={{ fontFamily: 'var(--font-data)', fontSize: 9, fontWeight: 300, color: 'var(--t4)', border: '1px solid var(--line-1)', padding: '1px 5px', borderRadius: 3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {integration.category}
            </span>
          </div>
          <p style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--t3)', margin: 0, lineHeight: 1.4 }}>
            {integration.description}
          </p>
        </div>

        <div style={{ flexShrink: 0 }}>
          {isConnected ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <CheckCircle2 style={{ width: 16, height: 16, color: '#22c55e' }} />
              <span style={{ fontFamily: 'var(--font-data)', fontSize: 11, color: '#22c55e', fontWeight: 500 }}>Connected</span>
            </div>
          ) : !integration.available ? (
            <span style={{ fontFamily: 'var(--font-data)', fontSize: 10, fontWeight: 300, color: 'var(--t4)', border: '1px solid var(--line-0)', padding: '4px 10px', borderRadius: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Coming soon
            </span>
          ) : showPAT ? null : (
            <button
              onClick={handleConnectClick}
              disabled={isBusy}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px',
                background: isBusy ? 'var(--surface-2)' : 'var(--accent)',
                color: isBusy ? 'var(--t3)' : '#fff',
                border: 'none', borderRadius: 5, cursor: isBusy ? 'default' : 'pointer',
                fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 500, opacity: isBusy ? 0.7 : 1,
              }}
            >
              {isBusy && <Loader2 style={{ width: 12, height: 12 }} className="flow-spin" />}
              {isBusy ? 'Connecting…' : 'Connect'}
            </button>
          )}
        </div>
      </div>

      {/* GitHub PAT inline input */}
      {showPAT && (
        <div style={{ padding: '0 20px 18px', borderTop: '1px solid rgba(232,103,43,0.15)', background: 'rgba(232,103,43,0.02)' }}>
          <p style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--t3)', margin: '12px 0 10px', lineHeight: 1.55 }}>
            Paste a GitHub Personal Access Token with <strong>repo</strong> and <strong>read:user</strong> scopes.{' '}
            <a
              href="https://github.com/settings/tokens/new?scopes=repo,read:user&description=FLOW+OS"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--accent)', textDecoration: 'none' }}
            >
              Generate one →
            </a>
          </p>
          <form onSubmit={handlePATSubmit} style={{ display: 'flex', gap: 8 }}>
            <input
              autoFocus
              type="password"
              value={patValue}
              onChange={e => setPatValue(e.target.value)}
              placeholder="ghp_xxxxxxxxxxxxxxxxxxxxxxxx"
              style={{
                flex: 1, padding: '8px 12px', fontSize: 13,
                fontFamily: 'var(--font-data)',
                border: '1px solid var(--line-1)', borderRadius: 5,
                background: 'var(--surface-1)', color: 'var(--t1)',
                outline: 'none',
              }}
            />
            <button
              type="submit"
              disabled={!patValue.trim() || isBusy}
              style={{
                padding: '8px 16px', fontSize: 12, fontWeight: 500,
                background: patValue.trim() ? 'var(--accent)' : 'var(--surface-2)',
                color: patValue.trim() ? '#fff' : 'var(--t4)',
                border: 'none', borderRadius: 5,
                cursor: patValue.trim() && !isBusy ? 'pointer' : 'default',
                fontFamily: 'var(--font-ui)', display: 'flex', alignItems: 'center', gap: 5,
              }}
            >
              {isBusy && <Loader2 style={{ width: 11, height: 11 }} className="flow-spin" />}
              {isBusy ? 'Connecting…' : 'Connect'}
            </button>
            <button
              type="button"
              onClick={handlePATCancel}
              style={{
                padding: '8px 12px', fontSize: 12, background: 'none',
                border: '1px solid var(--line-0)', borderRadius: 5,
                color: 'var(--t3)', cursor: 'pointer', fontFamily: 'var(--font-ui)',
              }}
            >
              Cancel
            </button>
          </form>
        </div>
      )}

      {showPanel && <DiscoveryPanel id={integration.id} discovery={discovery} />}
    </div>
  );
}

// ─── Progress bar row ─────────────────────────────────────────────────────────

function ProgressRow({ label, Icon, pct, countLabel, done }) {
  const blocks = Math.round(Math.min(100, pct) / 10);
  const color = done ? '#22c55e' : 'var(--brand)';
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon style={{ width: 13, height: 13, color: pct > 0 ? color : 'var(--t5)' }} strokeWidth={1.5} />
          <span style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: pct > 0 ? 'var(--t2)' : 'var(--t4)' }}>{label}</span>
        </div>
        {countLabel && (
          <span style={{ fontFamily: 'var(--font-data)', fontSize: 11, color: 'var(--t4)', fontWeight: 300 }}>{countLabel}</span>
        )}
      </div>
      <div style={{ display: 'flex', gap: 2 }}>
        {[...Array(10)].map((_, i) => (
          <div key={i} style={{
            flex: 1, height: 5, borderRadius: 1,
            background: i < blocks ? color : 'var(--line-0)',
            opacity: i < blocks ? 0.4 + (i / 9) * 0.6 : 1,
            transition: 'background 0.25s ease',
          }} />
        ))}
      </div>
    </div>
  );
}

// ─── Indexing phase view ──────────────────────────────────────────────────────

function IndexingView({ discoveries, wsPhase, discoveryLog, onEnter }) {
  const done = wsPhase === 'READY';
  const [pct, setPct] = useState({ github: 0, gmail: 0, calendar: 0, graph: 0, ai: 0 });

  const repos   = discoveries.github?.repos?.length || 0;
  const emails  = discoveries.gmail?.messageCount || 0;
  const events  = discoveries['google-calendar']?.eventCount || 0;
  const commits = repos * 15;
  const entities = repos * 4 + Math.round(emails / 8) + Math.round(events / 4);

  useEffect(() => {
    if (done) {
      setPct({ github: 100, gmail: 100, calendar: 100, graph: 100, ai: 100 });
      return;
    }
    const timers = [];
    function fillBar(key, target, delayMs, stepMs) {
      const t = setTimeout(() => {
        let cur = 0;
        const iv = setInterval(() => {
          cur = Math.min(target, cur + 1 + Math.random() * 2);
          setPct(prev => ({ ...prev, [key]: Math.round(cur) }));
          if (cur >= target) clearInterval(iv);
        }, stepMs);
        timers.push(iv);
      }, delayMs);
      timers.push(t);
    }
    fillBar('github',   88,   400,  80);
    fillBar('gmail',    82,  1600, 100);
    fillBar('calendar', 91,   900,  75);
    fillBar('graph',    70,  3500, 150);
    fillBar('ai',       62,  6000, 180);
    return () => timers.forEach(t => { clearTimeout(t); clearInterval(t); });
  }, [done]);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface-0)', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '48px 24px' }}>
      {/* Logo + title */}
      <div style={{ textAlign: 'center', maxWidth: 520, marginBottom: 40 }}>
        <div style={{
          width: 40, height: 40, background: done ? '#22c55e' : 'var(--accent)', borderRadius: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 20px', transition: 'background 0.6s ease',
        }}>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 500, color: '#fff' }}>F</span>
        </div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 400, color: 'var(--t1)', margin: '0 0 10px', letterSpacing: '-0.01em' }}>
          {done ? 'FLOW knows your workspace.' : 'FLOW is learning your workspace.'}
        </h1>
        <p style={{ fontFamily: 'var(--font-ui)', fontSize: 14, color: 'var(--t3)', margin: 0, lineHeight: 1.6 }}>
          {done
            ? 'Indexing complete. Your AI teammate is ready.'
            : 'Indexing commits, emails, and meetings. Building your intelligence layer.'
          }
        </p>
      </div>

      {/* Progress bars */}
      <div style={{ width: '100%', maxWidth: 560, marginBottom: 24, background: 'var(--surface-1)', border: '1px solid var(--line-0)', borderRadius: 10, padding: '24px 28px' }}>
        <ProgressRow label="GitHub" Icon={GitBranch} pct={pct.github} done={done}
          countLabel={commits > 0 ? `${commits.toLocaleString()} commits · ${repos} repos` : repos > 0 ? `${repos} repositories` : null} />
        <ProgressRow label="Gmail" Icon={Mail} pct={pct.gmail} done={done}
          countLabel={emails > 0 ? `${emails.toLocaleString()} conversations` : pct.gmail > 0 ? 'scanning…' : null} />
        <ProgressRow label="Google Calendar" Icon={Calendar} pct={pct.calendar} done={done}
          countLabel={events > 0 ? `${events} events` : pct.calendar > 0 ? 'reading…' : null} />
        <ProgressRow label="Knowledge Graph" Icon={Database} pct={pct.graph} done={done}
          countLabel={entities > 0 ? `${entities.toLocaleString()} entities` : pct.graph > 0 ? 'building…' : null} />
        <ProgressRow label="AI Embeddings" Icon={Brain} pct={pct.ai} done={done}
          countLabel={pct.ai >= 60 ? 'preparing intelligence' : pct.ai > 0 ? 'waiting…' : null} />
      </div>

      {/* Discovery log */}
      {discoveryLog.length > 0 && (
        <div style={{ width: '100%', maxWidth: 560, marginBottom: 28, background: 'var(--surface-1)', border: '1px solid var(--line-0)', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--line-0)', fontFamily: 'var(--font-data)', fontSize: 9, fontWeight: 300, textTransform: 'uppercase', letterSpacing: '0.09em', color: 'var(--t5)' }}>
            Discoveries
          </div>
          <div style={{ padding: '6px 0', maxHeight: 180, overflowY: 'auto' }}>
            {discoveryLog.map(entry => (
              <div key={entry.id} style={{ padding: '4px 16px', display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontFamily: 'var(--font-data)', fontSize: 11, color: '#22c55e', flexShrink: 0 }}>✓</span>
                <span style={{ fontFamily: 'var(--font-data)', fontSize: 11, color: 'var(--t3)', lineHeight: 1.5 }}>{entry.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* CTA */}
      {done ? (
        <button
          onClick={onEnter}
          style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '14px 32px',
            background: '#22c55e', color: '#fff', border: 'none', borderRadius: 8,
            cursor: 'pointer', fontFamily: 'var(--font-ui)', fontSize: 15, fontWeight: 500,
          }}
        >
          <Sparkles style={{ width: 16, height: 16 }} />
          Open your workspace
          <ArrowRight style={{ width: 16, height: 16 }} />
        </button>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--t4)' }}>
          <Loader2 style={{ width: 14, height: 14 }} className="flow-spin" />
          <span style={{ fontFamily: 'var(--font-ui)', fontSize: 12 }}>Building your workspace intelligence…</span>
        </div>
      )}
    </div>
  );
}

// ─── Friendly OAuth error messages ───────────────────────────────────────────

const PROVIDER_NAMES = { gmail: 'Gmail', 'google-calendar': 'Google Calendar' };

function oauthErrorMessage(errorCode, provider) {
  const name = PROVIDER_NAMES[provider] || 'Google';
  switch (errorCode) {
    case 'access_denied':
      return {
        title: `${name} sign-in was not authorized`,
        body: `This Google account is not currently authorized to use this application. If you are the developer, add this email address to the OAuth Consent Screen Test Users list in Google Cloud Console, or publish the app to remove this restriction.`,
        action: 'Open Google Cloud Console',
        actionUrl: 'https://console.cloud.google.com/apis/credentials/consent',
      };
    case 'exchange_failed':
      return {
        title: `${name} token exchange failed`,
        body: 'FLOW received authorization but could not complete sign-in. Check that the OAuth Client ID and Client Secret in your .env match the credentials in Google Cloud Console.',
        action: null,
      };
    default:
      return {
        title: `${name} sign-in failed`,
        body: 'Something went wrong during sign-in. Try again. If the issue persists, check your Google Cloud Console OAuth configuration.',
        action: null,
      };
  }
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function WorkspaceSetup() {
  const navigate    = useNavigate();
  const location    = useLocation();
  const ws          = useWorkspaceState();
  const [connecting, setConnecting] = useState(null);
  const [error, setError]           = useState(null);   // { title, body, action?, actionUrl? }
  const [phase, setPhase]           = useState('CONNECT'); // 'CONNECT' | 'INDEX'
  const [syncing, setSyncing]       = useState(false);
  const [discoveries, setDiscoveries] = useState({});     // connectorId → { loading?, repos?, ... }
  const [discoveryLog, setDiscoveryLog] = useState([]);
  const prevConnectedRef = useRef([]);
  const initializedRef   = useRef(false);

  const connected      = ws.connectedConnectors || [];
  const connectedCount = connected.length;
  const isReadyToIndex = connectedCount >= MIN_REQUIRED;
  const readinessPercent = ws.readinessPercent
    || Math.min(100, Math.round((connectedCount / MIN_REQUIRED) * 100));

  // ── Auto-redirect when READY and we're still on CONNECT phase ───────────────
  useEffect(() => {
    if (!ws.loading && ws.workspacePhase === 'READY' && phase === 'CONNECT') {
      navigate('/', { replace: true });
    }
  }, [ws.loading, ws.workspacePhase, phase, navigate]);

  // ── Parse oauth_error / success params from the URL ──────────────────────────
  // Google redirects the OAuth tab back to /setup. Read the outcome from the URL.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const oauthError    = params.get('oauth_error');
    const provider      = params.get('provider') || '';
    const gmailOk       = params.get('gmailConnected');
    const calendarOk    = params.get('calendarConnected');

    if (oauthError) {
      // Write to sessionStorage so the main tab picks it up on focus.
      const errData = oauthErrorMessage(oauthError, provider);
      sessionStorage.setItem('flow_oauth_error', JSON.stringify(errData));
      setError(errData);
      // Clean the URL so a refresh doesn't re-show the error.
      navigate('/setup', { replace: true });
    }
    if (gmailOk || calendarOk) {
      // Successful OAuth landed back on /setup — refresh state and clean URL.
      invalidateWorkspaceState();
      navigate('/setup', { replace: true });
    }
  }, [location.search, navigate]);

  // ── Focus listener: refresh state + surface any pending OAuth error ─────────
  useEffect(() => {
    const onFocus = () => {
      invalidateWorkspaceState();
      // If OAuth completed (or failed) in a tab, pick up the pending error.
      const pending = sessionStorage.getItem('flow_oauth_error');
      if (pending) {
        try { setError(JSON.parse(pending)); } catch { /* ignore */ }
        sessionStorage.removeItem('flow_oauth_error');
      }
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  // ── Detect new connectors and auto-discover ──────────────────────────────────
  useEffect(() => {
    if (ws.loading) return;

    if (!initializedRef.current) {
      initializedRef.current = true;
      // Discover any connectors already connected when the page loads
      if (connected.length > 0) {
        connected.forEach(id => triggerDiscovery(id));
        prevConnectedRef.current = [...connected];
      }
      return;
    }

    const newConnectors = connected.filter(id => !prevConnectedRef.current.includes(id));
    if (newConnectors.length > 0) {
      newConnectors.forEach(id => triggerDiscovery(id));
      prevConnectedRef.current = [...connected];
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ws.loading, connected.join(',')]);

  function addLog(text) {
    setDiscoveryLog(prev => [{ id: Date.now() + Math.random(), text }, ...prev].slice(0, 25));
  }

  async function triggerDiscovery(connectorId) {
    setDiscoveries(prev => ({ ...prev, [connectorId]: { loading: true } }));
    try {
      if (connectorId === 'github') {
        const r = await fetch('/api/engineering/repos', { headers: authHdrs() });
        if (!r.ok) { setDiscoveries(prev => ({ ...prev, github: {} })); return; }
        const data = await r.json();
        const repos = data.result || data.repositories || (Array.isArray(data) ? data : []);
        setDiscoveries(prev => ({ ...prev, github: { repos } }));
        addLog(`Found ${repos.length} repositor${repos.length === 1 ? 'y' : 'ies'} in your GitHub account`);
        // Also discover PR count from first repo
        if (repos.length > 0) {
          const top = repos[0];
          const owner = (top.fullName || top.full_name || '').split('/')[0];
          const name  = top.name;
          if (owner && name) {
            const pr = await fetch(`/api/engineering/repos/${owner}/${name}/pulls?state=open&limit=50`, { headers: authHdrs() });
            if (pr.ok) {
              const pd = await pr.json();
              const prs = pd.result || pd.pullRequests || (Array.isArray(pd) ? pd : []);
              if (prs.length > 0) addLog(`Found ${prs.length} open pull requests in ${name}`);
            }
          }
        }
      } else if (connectorId === 'gmail') {
        const [lr, ir] = await Promise.allSettled([
          fetch('/api/communication/labels', { headers: authHdrs() }),
          fetch('/api/communication/inbox?limit=100', { headers: authHdrs() }),
        ]);
        const labels = lr.status === 'fulfilled' && lr.value.ok ? (await lr.value.json()) : null;
        const inbox  = ir.status === 'fulfilled' && ir.value.ok ? (await ir.value.json()) : null;
        const labelList = (labels?.result || labels?.labels || []);
        const msgs = inbox?.result || inbox?.messages || (Array.isArray(inbox) ? inbox : []);
        const unreadCount = msgs.filter?.(m => m.unread || m.isUnread)?.length || 0;
        setDiscoveries(prev => ({ ...prev, gmail: { labels: labelList, messageCount: msgs.length, unreadCount } }));
        addLog(`Found your primary mailbox${unreadCount > 0 ? ` · ${unreadCount} unread` : ` · ${msgs.length}+ messages`}`);
      } else if (connectorId === 'google-calendar') {
        const r = await fetch('/api/meetings/upcoming?days=90&limit=200', { headers: authHdrs() });
        if (!r.ok) { setDiscoveries(prev => ({ ...prev, 'google-calendar': {} })); return; }
        const data = await r.json();
        const events = data.result || data.events || (Array.isArray(data) ? data : []);
        setDiscoveries(prev => ({ ...prev, 'google-calendar': { eventCount: events.length } }));
        addLog(`Found ${events.length} calendar events across 90 days`);
      }
    } catch {
      setDiscoveries(prev => ({ ...prev, [connectorId]: {} }));
    }
  }

  async function startIndexing() {
    setSyncing(true);
    setPhase('INDEX');

    // Build initial discovery log from known data
    const gh  = discoveries.github;
    const gm  = discoveries.gmail;
    const cal = discoveries['google-calendar'];

    if (gh?.repos?.length) {
      addLog(`${gh.repos.length} repositories ready to index`);
      addLog(`Indexing ${gh.repos.length * 15}+ commits and pull requests`);
    }
    if (gm?.messageCount) addLog(`${gm.messageCount}+ conversations scheduled for import`);
    if (cal?.eventCount)  addLog(`${cal.eventCount} calendar events ready for context extraction`);
    addLog('Building knowledge graph from relationships across systems');
    addLog('Preparing vector embeddings for AI retrieval');

    try {
      await fetch('/api/onboarding/start-sync', { method: 'POST', headers: authHdrs() });
      invalidateWorkspaceState();
    } catch { /* non-fatal */ }
  }

  function enterWorkspace() {
    // Pass discovery stats to BrainHome for the personalized first brief
    const stats = {
      repos:    discoveries.github?.repos?.length || 0,
      emails:   discoveries.gmail?.messageCount || 0,
      events:   discoveries['google-calendar']?.eventCount || 0,
      ts: Date.now(),
    };
    sessionStorage.setItem('flow_first_entry_stats', JSON.stringify(stats));
    navigate('/', { replace: true });
  }

  const handleConnect = useCallback(async (integration, patToken) => {
    setConnecting(integration.id);
    setError(null);
    try {
      if (integration.oauthInit) {
        const backendBase     = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5001';
        const capabilityPath  = integration.id === 'gmail' ? 'communication'
          : integration.id === 'google-calendar' ? 'meetings'
          : integration.id;
        const r = await fetch(integration.oauthInit, {
          method: 'POST', headers: authHdrs(),
          body: JSON.stringify({ callbackUrl: `${backendBase}/api/${capabilityPath}/oauth/callback` }),
        });
        if (!r.ok) throw new Error(`Could not initiate ${integration.name} OAuth`);
        const { authUrl } = await r.json();
        if (authUrl) window.open(authUrl, '_blank');
      } else if (integration.connectPath === '/api/engineering/auth') {
        if (!patToken) { setConnecting(null); return; }
        const r = await fetch('/api/engineering/auth', {
          method: 'POST', headers: authHdrs(),
          body: JSON.stringify({ token: patToken }),
        });
        if (!r.ok) {
          let msg = 'GitHub token rejected. Check scopes: repo, read:user';
          let action = null;
          let actionUrl = null;
          try {
            const body = await r.json();
            if (body?.error?.userMessage) msg = body.error.userMessage;
            else if (body?.error?.message) msg = body.error.message;
            else if (typeof body?.error === 'string') msg = body.error;
            if (body?.error?.selfServeAction) {
              action    = body.error.selfServeAction.label;
              actionUrl = body.error.selfServeAction.href;
            }
          } catch { /* ignore parse failure, use fallback */ }
          setError({ title: `Failed to connect ${integration.name}`, body: msg, action, actionUrl });
          setConnecting(null);
          return;
        }
        invalidateWorkspaceState();
      }
    } catch (err) {
      setError({ title: `Failed to connect ${integration.name}`, body: err.message || 'Check your credentials and try again.' });
    } finally {
      setConnecting(null);
    }
  }, []);

  // ── INDEX phase ───────────────────────────────────────────────────────────────
  if (phase === 'INDEX') {
    return (
      <>
        <IndexingView
          discoveries={discoveries}
          wsPhase={ws.workspacePhase}
          discoveryLog={discoveryLog}
          onEnter={enterWorkspace}
        />
        <style>{`@keyframes flow-spin { to { transform: rotate(360deg); } } .flow-spin { animation: flow-spin 1s linear infinite; }`}</style>
      </>
    );
  }

  // ── CONNECT phase ─────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface-0)', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '48px 24px' }}>
      {/* Header */}
      <div style={{ textAlign: 'center', maxWidth: 520, marginBottom: 40 }}>
        <div style={{ width: 40, height: 40, background: 'var(--accent)', borderRadius: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 500, color: '#fff' }}>F</span>
        </div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 400, color: 'var(--t1)', margin: '0 0 10px', letterSpacing: '-0.01em' }}>
          Set up your workspace
        </h1>
        <p style={{ fontFamily: 'var(--font-ui)', fontSize: 14, color: 'var(--t3)', margin: 0, lineHeight: 1.6 }}>
          Connect {MIN_REQUIRED} tools. FLOW will discover what's there, then index it.
        </p>
      </div>

      {/* Readiness meter */}
      <div style={{ width: '100%', maxWidth: 560, marginBottom: 20, background: 'var(--surface-1)', border: '1px solid var(--line-0)', borderRadius: 10, padding: '20px 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <span style={{ fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 500, color: 'var(--t1)' }}>Workspace Readiness</span>
          <span style={{ fontFamily: 'var(--font-data)', fontSize: 13, fontWeight: 600, color: isReadyToIndex ? '#22c55e' : 'var(--accent)' }}>
            {readinessPercent}%
          </span>
        </div>
        <div style={{ height: 5, background: 'var(--line-0)', borderRadius: 3, marginBottom: 10 }}>
          <div style={{ height: '100%', borderRadius: 3, background: isReadyToIndex ? '#22c55e' : 'var(--accent)', width: `${readinessPercent}%`, transition: 'width 800ms cubic-bezier(0.4, 0, 0.2, 1)' }} />
        </div>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          {[
            { label: 'Integrations', value: `${connectedCount}/${MIN_REQUIRED}`, done: connectedCount >= MIN_REQUIRED },
            { label: 'AI Engine',    value: isReadyToIndex ? (syncing ? 'Indexing…' : 'Ready') : 'Waiting', done: isReadyToIndex },
            { label: 'Dashboard',   value: ws.workspacePhase === 'READY' ? 'Unlocked' : 'Locked', done: ws.workspacePhase === 'READY' },
          ].map(item => (
            <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {item.done
                ? <CheckCircle2 style={{ width: 13, height: 13, color: '#22c55e' }} />
                : <CircleDashed  style={{ width: 13, height: 13, color: 'var(--t4)' }} />
              }
              <span style={{ fontFamily: 'var(--font-data)', fontSize: 11, color: item.done ? 'var(--t2)' : 'var(--t4)' }}>
                {item.label}: <strong style={{ fontWeight: 500 }}>{item.value}</strong>
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* "Start FLOW" prompt when ≥3 connected */}
      {isReadyToIndex && (
        <div style={{
          width: '100%', maxWidth: 560, marginBottom: 16,
          background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.25)',
          borderRadius: 10, padding: '16px 20px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <CheckCircle2 style={{ width: 16, height: 16, color: '#22c55e', flexShrink: 0 }} />
            <div>
              <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 500, color: 'var(--t1)', marginBottom: 2 }}>
                Your tools are connected.
              </div>
              <div style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--t3)' }}>
                FLOW has discovered your repositories, mailbox, and calendar.
              </div>
            </div>
          </div>
          <button
            onClick={startIndexing}
            style={{
              display: 'flex', alignItems: 'center', gap: 7, padding: '9px 18px',
              background: '#22c55e', color: '#fff', border: 'none',
              borderRadius: 6, cursor: 'pointer', flexShrink: 0,
              fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 500,
            }}
          >
            <Zap style={{ width: 13, height: 13 }} />
            Start FLOW
            <ArrowRight style={{ width: 13, height: 13 }} />
          </button>
        </div>
      )}

      {/* Error — rich object (OAuth failures) or plain string (connect failures) */}
      {error && (
        <div style={{ maxWidth: 560, width: '100%', marginBottom: 14, background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.22)', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <AlertCircle style={{ width: 15, height: 15, color: '#ef4444', flexShrink: 0, marginTop: 1 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 500, color: '#ef4444', marginBottom: error.body ? 4 : 0 }}>
                {error.title || error}
              </div>
              {error.body && (
                <div style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--t3)', lineHeight: 1.55 }}>
                  {error.body}
                </div>
              )}
              {error.action && error.actionUrl && (
                <a
                  href={error.actionUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: 'inline-block', marginTop: 10, fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 500, color: '#ef4444', textDecoration: 'underline', cursor: 'pointer' }}
                >
                  {error.action} →
                </a>
              )}
            </div>
            <button
              onClick={() => setError(null)}
              aria-label="Dismiss"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t4)', fontSize: 16, lineHeight: 1, padding: '0 0 0 4px', flexShrink: 0 }}
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* Integration cards */}
      <div style={{ width: '100%', maxWidth: 560, display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
        {INTEGRATIONS.map(integration => (
          <IntegrationCard
            key={integration.id}
            integration={integration}
            isConnected={connected.includes(integration.id)}
            discovery={discoveries[integration.id] || null}
            onConnect={handleConnect}
            connecting={connecting}
          />
        ))}
      </div>

      {/* Discovery log (CONNECT phase) */}
      {discoveryLog.length > 0 && (
        <div style={{ width: '100%', maxWidth: 560, background: 'var(--surface-1)', border: '1px solid var(--line-0)', borderRadius: 10, overflow: 'hidden', marginBottom: 16 }}>
          <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--line-0)', fontFamily: 'var(--font-data)', fontSize: 9, fontWeight: 300, textTransform: 'uppercase', letterSpacing: '0.09em', color: 'var(--t5)' }}>
            What FLOW found
          </div>
          <div style={{ padding: '6px 0' }}>
            {discoveryLog.slice(0, 6).map(entry => (
              <div key={entry.id} style={{ padding: '4px 16px', display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontFamily: 'var(--font-data)', fontSize: 11, color: '#22c55e', flexShrink: 0 }}>✓</span>
                <span style={{ fontFamily: 'var(--font-data)', fontSize: 11, color: 'var(--t3)', lineHeight: 1.5 }}>{entry.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <style>{`
        @keyframes flow-spin { to { transform: rotate(360deg); } }
        .flow-spin { animation: flow-spin 1s linear infinite; }
      `}</style>
    </div>
  );
}
