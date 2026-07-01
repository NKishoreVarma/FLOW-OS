import { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWebSocket } from '../../hooks/useWebSocket';
import { useToast } from '../ui/ToastProvider';
import PageContainer from '../ui/PageContainer';
import Skeleton from '../ui/Skeleton';
import DraftReviewSheet from '../ui/DraftReviewSheet';
import RecommendationEngine from './RecommendationEngine';
import ActionCenter from '../ui/ActionCenter';
import { normalizeItem } from './actionCenterAdapter';
import {
  AlertTriangle, Mail, GitBranch, MessageSquare, Calendar,
  FileText, Zap, CheckCircle, Clock, Brain,
  Sparkles, TrendingUp, TrendingDown, Activity, RefreshCw,
  X, BarChart3, Shield, Users, Code, Briefcase
} from 'lucide-react';

const SOURCE_CONFIG = {
  slack:  { icon: MessageSquare, color: 'text-[#E01E5A]',  bg: 'bg-[#E01E5A]/10',  label: 'Slack'  },
  gmail:  { icon: Mail,          color: 'text-[#EA4335]',  bg: 'bg-[#EA4335]/10',  label: 'Gmail'  },
  github: { icon: GitBranch,     color: 'text-[#e6edf3]',  bg: 'bg-white/5',       label: 'GitHub' },
  jira:   { icon: Briefcase,     color: 'text-[#0052CC]',  bg: 'bg-[#0052CC]/10',  label: 'Jira'   },
  notion: { icon: FileText,      color: 'text-text-secondary', bg: 'bg-white/5',   label: 'Notion' },
  vault:  { icon: Shield,        color: 'text-flow-purple', bg: 'bg-flow-purple/10', label: 'Vault'  },
  calendar:{ icon: Calendar,     color: 'text-[#34A853]',  bg: 'bg-[#34A853]/10',  label: 'Calendar'},
  default:{ icon: Activity,      color: 'text-text-muted', bg: 'bg-white/5',       label: 'System' },
};

const PRIORITY_CONFIG = {
  CRITICAL: { label: 'CRITICAL', color: 'text-critical', bg: 'bg-critical/10', border: 'border-critical/30', dot: 'bg-critical', glow: 'shadow-[0_0_8px_rgba(244,63,94,0.4)]' },
  P1:       { label: 'P1',       color: 'text-warning',  bg: 'bg-warning/10',  border: 'border-warning/30',  dot: 'bg-warning',  glow: 'shadow-[0_0_8px_rgba(245,158,11,0.3)]' },
  P2:       { label: 'P2',       color: 'text-info',     bg: 'bg-info/10',     border: 'border-info/30',     dot: 'bg-info',     glow: '' },
  P3:       { label: 'P3',       color: 'text-text-muted',bg: 'bg-white/5',   border: 'border-white/10',    dot: 'bg-text-muted',glow: '' },
};

function SourceChip({ source }) {
  const cfg = SOURCE_CONFIG[source?.toLowerCase()] || SOURCE_CONFIG.default;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${cfg.bg} ${cfg.color} border border-current/20`}>
      <Icon className="w-2.5 h-2.5" />
      {cfg.label}
    </span>
  );
}

function PriorityChip({ priority }) {
  const cfg = PRIORITY_CONFIG[priority] || PRIORITY_CONFIG.P3;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${cfg.bg} ${cfg.color} border ${cfg.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot} ${priority === 'CRITICAL' ? 'animate-pulse' : ''}`} />
      {cfg.label}
    </span>
  );
}

function AIReasonBadge({ reason }) {
  const [expanded, setExpanded] = useState(false);
  if (!reason) return null;
  return (
    <button
      onClick={() => setExpanded(p => !p)}
      className="flex items-start gap-1.5 mt-2 text-left group"
    >
      <Brain className="w-3 h-3 text-flow-purple flex-shrink-0 mt-0.5 group-hover:text-flow-purple/80" />
      <span className={`text-[10px] text-flow-purple/70 group-hover:text-flow-purple/90 transition-colors leading-tight ${expanded ? '' : 'line-clamp-1'}`}>
        {reason}
      </span>
    </button>
  );
}

function SectionLabel({ children, count, accent }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <span className={`text-[10px] font-bold uppercase tracking-widest ${accent || 'text-text-muted'}`}>{children}</span>
      {count > 0 && (
        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${accent ? 'bg-critical/15 text-critical' : 'bg-white/5 text-text-muted'}`}>
          {count}
        </span>
      )}
      <div className="flex-1 h-px bg-white/5" />
    </div>
  );
}

function CriticalCard({ item, onResolve, isNew }) {
  return (
    <div className={`group relative bg-bg-card border rounded-xl p-4 transition-all duration-300 hover:border-critical/40 cursor-default
      ${isNew ? 'border-critical/40 shadow-[0_0_20px_rgba(244,63,94,0.15)] animate-new-item' : 'border-critical/20'}`}
    >
      <div className="absolute top-3 right-3 w-2 h-2 rounded-full bg-critical animate-pulse" />
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-critical/10 border border-critical/20 flex items-center justify-center mt-0.5">
          <AlertTriangle className="w-4 h-4 text-critical" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <PriorityChip priority={item.priority || 'CRITICAL'} />
            <SourceChip source={item.source} />
            <span className="text-[10px] text-text-muted ml-auto flex-shrink-0">{item.timestamp}</span>
          </div>
          <h3 className="text-ui-sm font-semibold text-text-primary leading-tight mb-1">{item.title}</h3>
          <p className="text-[11px] text-text-secondary leading-relaxed">{item.description}</p>
          <AIReasonBadge reason={item.aiReason} />
          <div className="flex items-center gap-2 mt-3">
            <button
              onClick={() => onResolve(item.id)}
              className="text-[10px] font-semibold px-3 py-1.5 rounded-lg bg-critical/10 text-critical border border-critical/20 hover:bg-critical/20 transition-all"
            >
              {item.actionLabel || 'Acknowledge'}
            </button>
            <button className="text-[10px] font-medium px-3 py-1.5 rounded-lg text-text-muted hover:bg-white/5 transition-all">
              Escalate
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ActionCard({ item, onComplete, isNew }) {
  const Cfg = SOURCE_CONFIG[item.source?.toLowerCase()] || SOURCE_CONFIG.default;
  return (
    <div className={`group relative bg-bg-card border rounded-xl p-4 transition-all duration-200 hover:border-flow-purple/30 hover:-translate-y-px cursor-default
      ${isNew ? 'border-flow-purple/40 animate-new-item' : 'border-border-flow'}`}
    >
      <div className="flex items-start gap-3">
        <div className={`flex-shrink-0 w-8 h-8 rounded-lg ${Cfg.bg} border border-current/10 flex items-center justify-center mt-0.5`}>
          <Cfg.icon className={`w-4 h-4 ${Cfg.color}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <PriorityChip priority={item.priority} />
            <SourceChip source={item.source} />
            <span className="text-[10px] text-text-muted ml-auto flex-shrink-0 flex items-center gap-1">
              <Clock className="w-2.5 h-2.5" />{item.timestamp}
            </span>
          </div>
          <h3 className="text-ui-sm font-semibold text-text-primary leading-tight mb-1">{item.title}</h3>
          <p className="text-[11px] text-text-secondary leading-relaxed line-clamp-2">{item.description}</p>
          <AIReasonBadge reason={item.aiReason} />
          <div className="flex items-center gap-2 mt-3">
            <button
              onClick={() => onComplete(item.id)}
              className="text-[10px] font-semibold px-3 py-1.5 rounded-lg bg-flow-purple/10 text-flow-purple border border-flow-purple/20 hover:bg-flow-purple/20 transition-all"
            >
              {item.actionLabel || 'Take Action'}
            </button>
            <button
              onClick={() => onComplete(item.id)}
              className="text-[10px] font-medium px-3 py-1.5 rounded-lg text-text-muted hover:bg-white/5 transition-all"
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MeetingCard({ item }) {
  const typeColor = item.type === 'Urgent' ? 'text-critical border-critical/30 bg-critical/5' : 'text-info border-info/30 bg-info/5';
  return (
    <div className="group bg-bg-card border border-border-flow rounded-xl p-4 hover:border-white/15 transition-all duration-200 hover:-translate-y-px">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-[#34A853]/10 border border-[#34A853]/20 flex items-center justify-center flex-shrink-0">
            <Calendar className="w-3.5 h-3.5 text-[#34A853]" />
          </div>
          <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full border ${typeColor}`}>{item.type}</span>
        </div>
        <span className="text-[10px] text-text-muted font-medium">{item.time}</span>
      </div>
      <h3 className="text-ui-sm font-semibold text-text-primary leading-tight mb-1">{item.title}</h3>
      <p className="text-[11px] text-text-secondary mb-2 flex items-center gap-1">
        <Users className="w-2.5 h-2.5 flex-shrink-0" />
        <span className="line-clamp-1">{item.participants}</span>
      </p>
      {item.prepContext && (
        <p className="text-[10px] text-text-muted leading-relaxed bg-white/3 rounded-lg px-2.5 py-2 border border-white/5 mb-3">
          <span className="text-flow-purple font-medium">Prep: </span>{item.prepContext}
        </p>
      )}
      <button className="text-[10px] font-semibold px-3 py-1.5 rounded-lg bg-[#34A853]/10 text-[#34A853] border border-[#34A853]/20 hover:bg-[#34A853]/20 transition-all w-full">
        Join Meeting
      </button>
    </div>
  );
}

function ApprovalCard({ item, onApprove, onReject, onEdit }) {
  return (
    <div className="group bg-gradient-to-br from-flow-purple/5 to-transparent border border-flow-purple/20 rounded-xl p-4 hover:border-flow-purple/40 transition-all duration-200">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-flow-purple/10 border border-flow-purple/20 flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-3.5 h-3.5 text-flow-purple" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-flow-purple uppercase tracking-wider">AI Generated</span>
            <p className="text-[9px] text-text-muted">Requires your approval</p>
          </div>
        </div>
        <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-success/10 text-success border border-success/20">
          {item.confidence} confident
        </span>
      </div>
      <h3 className="text-ui-sm font-semibold text-text-primary leading-tight mb-1">{item.action}</h3>
      <p className="text-[10px] text-text-secondary mb-1">→ {item.target}</p>
      <pre className="text-[10px] text-text-secondary leading-relaxed bg-bg-primary rounded-lg px-3 py-2.5 border border-white/5 whitespace-pre-wrap font-sans line-clamp-4 mt-2 mb-3">
        {item.details}
      </pre>
      <div className="flex items-center gap-2">
        <button onClick={() => onApprove(item.id)} className="flex-1 text-[10px] font-semibold px-3 py-1.5 rounded-lg bg-success/10 text-success border border-success/20 hover:bg-success/20 transition-all flex items-center justify-center gap-1">
          <CheckCircle className="w-3 h-3" />Approve & Send
        </button>
        <button onClick={onEdit} className="text-[10px] font-medium px-3 py-1.5 rounded-lg text-flow-purple border border-flow-purple/20 hover:bg-flow-purple/10 transition-all">
          Edit
        </button>
        <button onClick={() => onReject(item.id)} className="text-[10px] font-medium px-3 py-1.5 rounded-lg text-text-muted border border-white/10 hover:bg-white/5 transition-all">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

function TimelineRow({ item }) {
  const Cfg = SOURCE_CONFIG[item.source?.toLowerCase()] || SOURCE_CONFIG.default;
  return (
    <div className="flex items-start gap-2.5 py-2 group hover:bg-white/2 rounded-lg px-1.5 transition-colors">
      <div className={`flex-shrink-0 w-5 h-5 rounded-md ${Cfg.bg} flex items-center justify-center mt-0.5`}>
        <Cfg.icon className={`w-2.5 h-2.5 ${Cfg.color}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-medium text-text-primary leading-tight truncate">{item.title}</p>
        <p className="text-[10px] text-text-muted leading-relaxed mt-0.5 line-clamp-1">{item.description}</p>
      </div>
      <span className="text-[9px] text-text-muted flex-shrink-0 mt-0.5">{item.timestamp}</span>
    </div>
  );
}

function HealthBar({ label, value, icon: Icon }) {
  const colorMap = {
    green: 'bg-success',
    yellow: 'bg-warning',
    red: 'bg-critical',
    blue: 'bg-info',
    purple: 'bg-flow-purple',
  };
  const barColor = value >= 80 ? colorMap.green : value >= 60 ? colorMap.yellow : colorMap.red;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {Icon && <Icon className="w-3 h-3 text-text-muted" />}
          <span className="text-[10px] text-text-secondary font-medium">{label}</span>
        </div>
        <span className={`text-[10px] font-bold ${value >= 80 ? 'text-success' : value >= 60 ? 'text-warning' : 'text-critical'}`}>{value}</span>
      </div>
      <div className="h-1 bg-white/5 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${barColor}`}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

function GreetingHeader({ health, attentionCount, onRefresh, loading }) {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const displayName = localStorage.getItem('flow_user_name') || localStorage.getItem('flow_user_email') || 'there';
  const healthColor = health >= 80 ? 'text-success' : health >= 60 ? 'text-warning' : 'text-critical';
  const trend = health >= 80 ? <TrendingUp className="w-4 h-4 text-success" /> : <TrendingDown className="w-4 h-4 text-critical" />;

  return (
    <div className="flex items-start justify-between gap-4 flex-wrap">
      <div>
        <p className="text-[11px] font-medium text-text-muted mb-0.5">{greeting}, {displayName}</p>
        <h1 className="text-2xl font-bold text-text-primary tracking-tight">
          {attentionCount > 0 ? (
            <span>{attentionCount} items need your attention</span>
          ) : (
            <span>Workspace is clear</span>
          )}
        </h1>
        <p className="text-[11px] text-text-muted mt-1">
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <div className="text-right">
          <div className={`flex items-center gap-1.5 justify-end ${healthColor}`}>
            {trend}
            <span className="text-2xl font-bold">{health}</span>
          </div>
          <p className="text-[9px] text-text-muted font-medium uppercase tracking-wider">Workspace Health</p>
        </div>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="w-8 h-8 rounded-lg border border-border-flow hover:border-white/20 flex items-center justify-center text-text-muted hover:text-text-primary transition-all"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>
    </div>
  );
}

const DEMO_WORKFEED = {
  critical: [
    { id: 'INC-A3F2', title: 'DB Connection Pool Exhausted — API Degraded', description: 'PostgreSQL pool hitting max_connections (100). p99 latency spiked to 4.2s on /api/query. Affecting 3 enterprise tenants.', priority: 'CRITICAL', source: 'github', channel: '#incidents', sender: 'AlertManager', timestamp: '9:41 AM', aiReason: 'Pattern matches prior Nov outage. Root cause likely BullMQ worker leak under sustained load.', actionLabel: 'View Runbook' },
    { id: 'INC-B7C1', title: 'TechCorp SLA Breach Risk — Response Time >2s', description: 'TechCorp (Enterprise Tier) averaging 2.3s API response. SLA threshold is 2.0s. Contract at risk if unresolved in 4h.', priority: 'P1', source: 'slack', channel: '#enterprise', sender: 'SRE Bot', timestamp: '9:18 AM', aiReason: 'SLA breach escalation path per contract. Finance flagged $120k ARR exposure.', actionLabel: 'Acknowledge' },
  ],
  actions: [
    { id: 'ACT-001', title: 'Review PR #847: pgvector connection pooling fix', description: 'Alex R. opened a critical fix for the connection pool exhaustion. 2 reviewers needed. Blocking hotfix deploy.', priority: 'P1', source: 'github', sender: 'Alex R.', timestamp: '9:55 AM', dueLabel: 'Due in 2h', aiReason: 'Directly addresses active P0 incident. Merge unblocks 3 enterprise tenants.', actionLabel: 'Open PR' },
    { id: 'ACT-002', title: 'Reply to TechCorp CTO — SLA concern email', description: 'David Park (TechCorp CTO) emailed 47 min ago re: API degradation. AI-drafted reply ready for review.', priority: 'P1', source: 'gmail', sender: 'David Park', timestamp: '9:14 AM', dueLabel: 'Overdue 47m', aiReason: 'Enterprise relationship risk. Every hour without reply increases churn probability by 12%.', actionLabel: 'Review Draft' },
    { id: 'ACT-003', title: 'Create Jira ticket: Redis Cluster migration', description: 'Architecture decision from Jun 26 to migrate Redis to Redis Cluster has no corresponding Jira. Sprint planning is tomorrow.', priority: 'P2', source: 'jira', sender: 'Sarah Chen', timestamp: '8:30 AM', dueLabel: 'Before standup', aiReason: 'Decision is 24h old with no execution ticket. Blocks tomorrow sprint planning.', actionLabel: 'Create Ticket' },
    { id: 'ACT-004', title: 'Approve Q3 infra budget — CFO waiting', description: 'Finance submitted $47k infra scaling request. CFO needs sign-off by EOD for board deck.', priority: 'P2', source: 'slack', sender: 'CFO Office', timestamp: '8:00 AM', dueLabel: 'EOD today', aiReason: 'Budget cycle closes tonight. Delay pushes scaling decision to Q4.', actionLabel: 'Review Budget' },
  ],
  meetings: [
    { id: 'MTG-001', title: 'DB Incident Postmortem', startTime: '11:00 AM', duration: '60 min', participants: ['James K. (CTO)', 'Alex R.', 'Maria S.', 'SRE Team'], platform: 'zoom', aiContext: 'Third connection pool incident in 90 days. Prepare: connection pool metrics, worker thread analysis, mitigation timeline.', relatedDocs: ['PR #847', '#incidents thread', 'Nov postmortem'] },
    { id: 'MTG-002', title: 'FLOW OS v2.0 Weekly Sync', startTime: '2:00 PM', duration: '45 min', participants: ['Sarah Chen (PM)', 'Engineering Leads', 'Design'], platform: 'google-meet', aiContext: 'Feature freeze July 15. 6 open P1 items. Attendance matters — decisions are final.', relatedDocs: ['Sprint board', 'v2 roadmap'] },
  ],
  approvals: [
    { id: 'APR-001', type: 'email', title: 'Email reply to TechCorp CTO', to: 'david.park@techcorp.com', subject: 'Re: API Performance Degradation', preview: 'Hi David, Thank you for flagging this. Our team identified the root cause at 9:41 AM — a connection pool exhaustion under sustained BullMQ load. We have a hotfix in review (PR #847) targeting deploy within the hour. I\'ll send you a status update at 11 AM. We take your SLA seriously and are committed to resolution.', confidence: 94, aiReason: 'Tone-matched to prior TechCorp communication. Factually grounded in live incident data.' },
    { id: 'APR-002', type: 'jira', title: 'Create Jira: Redis Cluster Migration', assignee: 'Alex R.', priority: 'P1', estimate: '5 days', preview: 'Migrate production Redis instance to Redis Cluster (3-node) for BullMQ queue reliability. Decision ratified Jun 26 by Architecture Review Board. Acceptance criteria: zero job loss during failover, p99 queue latency <50ms.', confidence: 88, aiReason: 'Derived from architecture decision DEC-002. All required fields auto-populated from Slack thread context.' },
  ],
  activity: [
    { id: 'ACT-T1', type: 'commit', text: 'Alex R. pushed 3 commits to fix/db-pool-exhaustion', source: 'github', time: '9:58 AM' },
    { id: 'ACT-T2', type: 'message', text: 'SRE channel: "Hotfix in review, ETA 30 min for deploy"', source: 'slack', time: '9:52 AM' },
    { id: 'ACT-T3', type: 'intel', text: 'FLOW OS ingested 47 new operational chunks from GitHub + Slack', source: 'vault', time: '9:30 AM' },
    { id: 'ACT-T4', type: 'decision', text: 'Decision logged: Feature freeze July 15 confirmed', source: 'notion', time: '9:00 AM' },
    { id: 'ACT-T5', type: 'calendar', text: 'Meeting added: DB Postmortem at 11:00 AM', source: 'calendar', time: '8:45 AM' },
  ],
  aiRecommendation: {
    suggestion: 'Merge PR #847 first, then reply to TechCorp CTO with updated ETA. This resolves the P0 before the customer escalation window closes.',
    reasoning: 'The connection pool fix unblocks the SLA breach narrative. Sending the reply before the fix lands gives TechCorp inaccurate information.',
  },
  healthScore: { overall: 74, engineering: 68, product: 88, operations: 71, finance: 95, hr: 90, trend: 'degrading' },
  memory: { totalDecisions: 1247, totalIncidents: 89, totalChunks: 14820, recentDecisions: [
    { id: 'DEC-001', text: 'Adopt pgvector as primary vector store, deprecating in-memory fallback.', date: 'Jun 25', author: 'James K. (CTO)' },
    { id: 'DEC-002', text: 'Migrate Redis to Redis Cluster for BullMQ queue reliability.', date: 'Jun 26', author: 'Alex R.' },
    { id: 'DEC-003', text: 'FLOW OS v2.0 feature freeze on July 15. No new features until launch.', date: 'Jun 27', author: 'Sarah Chen (PM)' },
  ]},
};

function MorningBriefBanner({ token, workspaceId }) {
  const navigate = useNavigate();
  const [brief, setBrief] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token || !workspaceId) { setLoading(false); return; }
    fetch('http://localhost:5001/api/brain/briefing?role=EXECUTIVE', {
      headers: { Authorization: `Bearer ${token}`, 'workspace-id': workspaceId },
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        const text = data?.brief || data?.summary || data?.content || data?.text;
        if (text && typeof text === 'string') setBrief(text.slice(0, 300));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [token, workspaceId]);

  if (!loading && !brief) return null;

  return (
    <div className="mb-6 px-5 py-4 rounded-xl bg-flow-purple/5 border border-flow-purple/15 flex items-start justify-between gap-4">
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-bold text-flow-purple uppercase tracking-wider mb-1.5">AI Morning Brief</p>
        {loading ? (
          <div className="space-y-2">
            <div className="h-3.5 bg-bg-hover rounded animate-pulse w-full" />
            <div className="h-3.5 bg-bg-hover rounded animate-pulse w-3/4" />
          </div>
        ) : (
          <p className="text-ui-sm text-text-secondary leading-relaxed">{brief}</p>
        )}
      </div>
      {!loading && (
        <button
          onClick={() => navigate('/briefing')}
          className="flex-shrink-0 text-[11px] font-semibold text-flow-purple hover:text-flow-purple/80 transition-colors cursor-pointer whitespace-nowrap"
        >
          Full Briefing →
        </button>
      )}
    </div>
  );
}

const DailyWorkfeed = () => {
  const { token, workspaceId, isAuthLoading, events: liveEvents } = useWebSocket();
  const { showToast } = useToast();

  const [data, setData] = useState(DEMO_WORKFEED);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeApprovalReview, setActiveApprovalReview] = useState(null);
  const [actionCenterRaw, setActionCenterRaw] = useState(null);
  const processedEventIds = useRef(new Set());

  const fetchWorkfeed = useCallback(async () => {
    if (!token || !workspaceId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/intelligence/workfeed', {
        headers: { 'Authorization': `Bearer ${token}`, 'workspace-id': workspaceId },
      });
      if (!res.ok) {
        // Route not yet available in running backend — serve demo data
        setData(DEMO_WORKFEED);
        return;
      }
      const json = await res.json();
      setData(json);
    } catch {
      // Network failure — serve demo data so workfeed still renders
      setData(DEMO_WORKFEED);
    } finally {
      setLoading(false);
    }
  }, [token, workspaceId]);

  useEffect(() => {
    if (isAuthLoading || !token || !workspaceId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchWorkfeed();
  }, [isAuthLoading, token, workspaceId, fetchWorkfeed]);

  // Live WebSocket event handling
  useEffect(() => {
    if (isAuthLoading || !liveEvents.length || !data) return;
    liveEvents.forEach(ev => {
      if (processedEventIds.current.has(ev.id)) return;
      processedEventIds.current.add(ev.id);
      const type = ev.type;
      const payload = ev.payload || ev;

      if (type === 'INCIDENT_CREATED' || type === 'RISK_DETECTED') {
        const newItem = {
          id: payload.incidentId || String(Math.random()),
          title: payload.incidentName || payload.title || 'Incident detected',
          description: payload.evidence?.[0] || 'Critical risk flagged.',
          priority: payload.severity || 'CRITICAL',
          source: 'slack',
          timestamp: 'Just now',
          aiReason: 'Live detection via ingestion pipeline.',
          actionLabel: 'Acknowledge',
          isNew: true,
        };
        setData(prev => ({
          ...prev,
          critical: [newItem, ...prev.critical].slice(0, 5),
        }));
        showToast(`New incident: ${newItem.title}`, 'error');
      }

      if (type === 'INTEL_STORED') {
        const newActivity = {
          id: String(Math.random()),
          title: `New intel ingested (${payload.source || 'stream'})`,
          description: payload.textSample || 'Intelligence chunk stored.',
          source: payload.source || 'slack',
          timestamp: 'Just now',
          group: 'Now',
          isNew: true,
        };
        setData(prev => ({
          ...prev,
          activity: [newActivity, ...prev.activity].slice(0, 10),
        }));
      }
    });
  }, [liveEvents, isAuthLoading, data, showToast]);

  const handleResolve = (id) => {
    setData(prev => ({ ...prev, critical: prev.critical.filter(c => c.id !== id) }));
    showToast('Incident acknowledged.', 'success');
  };
  const handleActionComplete = (id) => {
    setData(prev => ({ ...prev, actions: prev.actions.filter(a => a.id !== id) }));
  };
  const handleApprove = (id) => {
    setData(prev => ({ ...prev, approvals: prev.approvals.filter(a => a.id !== id) }));
    showToast('Draft approved and dispatched.', 'success');
    setActiveApprovalReview(null);
  };
  const handleReject = (id) => {
    setData(prev => ({ ...prev, approvals: prev.approvals.filter(a => a.id !== id) }));
    showToast('Draft rejected.', 'warning');
    setActiveApprovalReview(null);
  };

  if (isAuthLoading || loading) {
    return (
      <PageContainer className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="w-40 h-5" />
          <Skeleton className="w-72 h-8" />
        </div>
        <Skeleton className="w-full h-28 rounded-2xl" />
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 space-y-4">
            {[1,2,3].map(i => <Skeleton key={i} className="h-36 rounded-xl" />)}
          </div>
          <div className="lg:col-span-5 space-y-4">
            {[1,2].map(i => <Skeleton key={i} className="h-44 rounded-xl" />)}
          </div>
        </div>
      </PageContainer>
    );
  }

  if (error) {
    return (
      <PageContainer>
        <div className="flex flex-col items-center justify-center h-64 text-center space-y-4">
          <AlertTriangle className="w-10 h-10 text-critical/60" />
          <div>
            <p className="text-ui-sm font-semibold text-text-primary">Could not load workfeed</p>
            <p className="text-[11px] text-text-muted mt-1">{error || 'Unknown error'}</p>
          </div>
          <button
            onClick={fetchWorkfeed}
            className="text-[11px] font-semibold px-4 py-2 rounded-lg bg-flow-purple/10 text-flow-purple border border-flow-purple/20 hover:bg-flow-purple/20 transition-all"
          >
            Retry
          </button>
        </div>
      </PageContainer>
    );
  }

  const { critical = [], actions = [], meetings = [], approvals = [], activity = [], healthScore, memory } = data;
  const attentionCount = critical.length + actions.length + approvals.length;
  const activityByGroup = activity.reduce((acc, item) => {
    const g = item.group || 'Today';
    if (!acc[g]) acc[g] = [];
    acc[g].push(item);
    return acc;
  }, {});

  return (
    <PageContainer className="space-y-6">
      {/* Header */}
      <GreetingHeader
        health={healthScore?.overall || 74}
        attentionCount={attentionCount}
        onRefresh={fetchWorkfeed}
        loading={loading}
      />

      <MorningBriefBanner token={token} workspaceId={workspaceId} />

      {/* FLOW Recommendation Engine — flagship hero section */}
      <RecommendationEngine
        data={data}
        onRefresh={fetchWorkfeed}
        isRefreshing={loading}
        onOpenActionCenter={setActionCenterRaw}
      />

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Incidents', value: critical.length, icon: AlertTriangle, color: critical.length > 0 ? 'text-critical' : 'text-text-muted', accent: critical.length > 0 },
          { label: 'Actions', value: actions.length, icon: Zap, color: 'text-warning', accent: false },
          { label: 'Approvals', value: approvals.length, icon: Sparkles, color: 'text-flow-purple', accent: approvals.length > 0 },
          { label: 'Decisions', value: memory?.totalDecisions || 0, icon: Brain, color: 'text-info', accent: false },
        ].map(stat => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className={`bg-bg-card border rounded-xl p-3.5 flex items-center gap-3 ${stat.accent ? 'border-critical/20' : 'border-border-flow'}`}>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${stat.accent ? 'bg-critical/10' : 'bg-white/5'}`}>
                <Icon className={`w-4 h-4 ${stat.color}`} />
              </div>
              <div>
                <div className={`text-xl font-bold ${stat.color}`}>{stat.value.toLocaleString()}</div>
                <div className="text-[9px] text-text-muted uppercase tracking-wider font-medium">{stat.label}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Main content */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left column */}
        <div className="lg:col-span-7 space-y-6">

          {/* Critical Incidents */}
          {critical.length > 0 && (
            <div>
              <SectionLabel count={critical.length} accent="text-critical">Critical Incidents</SectionLabel>
              <div className="space-y-3">
                {critical.map(item => (
                  <CriticalCard key={item.id} item={item} onResolve={handleResolve} isNew={item.isNew} />
                ))}
              </div>
            </div>
          )}

          {/* AI Approvals */}
          {approvals.length > 0 && (
            <div>
              <SectionLabel count={approvals.length} accent="text-flow-purple">Awaiting Your Approval</SectionLabel>
              <div className="space-y-3">
                {approvals.map(item => (
                  <ApprovalCard
                    key={item.id}
                    item={item}
                    onApprove={handleApprove}
                    onReject={handleReject}
                    onEdit={() => setActiveApprovalReview(item)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Actions Required */}
          <div>
            <SectionLabel count={actions.length}>Actions Required</SectionLabel>
            <div className="space-y-3">
              {actions.length === 0 ? (
                <div className="bg-bg-card border border-border-flow rounded-xl p-6 text-center">
                  <CheckCircle className="w-8 h-8 text-success/40 mx-auto mb-2" />
                  <p className="text-[11px] text-text-muted">All caught up. No pending actions.</p>
                </div>
              ) : (
                actions.map(item => (
                  <ActionCard key={item.id} item={item} onComplete={handleActionComplete} isNew={item.isNew} />
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right column */}
        <div className="lg:col-span-5 space-y-6">

          {/* Workspace Health */}
          {healthScore && (
            <div className="bg-bg-card border border-border-flow rounded-xl p-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-text-muted" />
                  <span className="text-[11px] font-bold text-text-secondary uppercase tracking-wider">Workspace Health</span>
                </div>
                <span className={`text-xs font-bold ${healthScore.trend === 'degrading' ? 'text-critical' : 'text-success'} flex items-center gap-1`}>
                  {healthScore.trend === 'degrading' ? <TrendingDown className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />}
                  {healthScore.trend}
                </span>
              </div>
              <div className="space-y-3">
                <HealthBar label="Engineering" value={healthScore.engineering} icon={Code} />
                <HealthBar label="Product" value={healthScore.product} icon={Sparkles} />
                <HealthBar label="Operations" value={healthScore.operations} icon={Activity} />
                <HealthBar label="Finance" value={healthScore.finance} icon={TrendingUp} />
                <HealthBar label="HR" value={healthScore.hr} icon={Users} />
              </div>
            </div>
          )}

          {/* Today's Meetings */}
          {meetings.length > 0 && (
            <div>
              <SectionLabel count={meetings.length}>Today's Meetings</SectionLabel>
              <div className="space-y-3">
                {meetings.map(item => (
                  <MeetingCard key={item.id} item={item} />
                ))}
              </div>
            </div>
          )}

          {/* Activity Timeline */}
          <div className="bg-bg-card border border-border-flow rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3 pb-2 border-b border-white/5">
              <Activity className="w-3.5 h-3.5 text-text-muted" />
              <span className="text-[10px] font-bold text-text-secondary uppercase tracking-wider">Recent Activity</span>
            </div>
            {activity.length === 0 ? (
              <p className="text-[11px] text-text-muted text-center py-4">No recent activity.</p>
            ) : (
              <div className="space-y-1">
                {Object.entries(activityByGroup).map(([group, items]) => (
                  <div key={group}>
                    <p className="text-[8px] font-bold text-text-muted uppercase tracking-widest px-1.5 py-1.5">{group}</p>
                    {items.map(item => <TimelineRow key={item.id} item={item} />)}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Company Memory Snapshot */}
          {memory && (
            <div className="bg-gradient-to-br from-flow-purple/5 to-transparent border border-flow-purple/10 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Brain className="w-3.5 h-3.5 text-flow-purple" />
                <span className="text-[10px] font-bold text-flow-purple uppercase tracking-wider">Company Memory</span>
              </div>
              <div className="grid grid-cols-3 gap-2 mb-3">
                {[
                  { label: 'Decisions', value: memory.totalDecisions?.toLocaleString() || '0' },
                  { label: 'Incidents', value: memory.totalIncidents?.toLocaleString() || '0' },
                  { label: 'Intel Chunks', value: memory.totalChunks?.toLocaleString() || '0' },
                ].map(stat => (
                  <div key={stat.label} className="text-center">
                    <div className="text-sm font-bold text-text-primary">{stat.value}</div>
                    <div className="text-[8px] text-text-muted uppercase tracking-wider">{stat.label}</div>
                  </div>
                ))}
              </div>
              {memory.recentDecisions?.slice(0, 2).map(dec => (
                <div key={dec.id} className="border-t border-white/5 pt-2 mt-2">
                  <p className="text-[10px] text-text-secondary leading-relaxed line-clamp-2">{dec.text}</p>
                  <p className="text-[9px] text-text-muted mt-0.5">{dec.author} · {dec.date}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Draft Review Sheet — approval card editing (legacy, kept for direct approval card "Edit" button) */}
      <DraftReviewSheet
        isOpen={activeApprovalReview !== null}
        onClose={() => setActiveApprovalReview(null)}
        approvalItem={activeApprovalReview}
        onApprove={handleApprove}
        onReject={handleReject}
      />

      {/* Universal Action Center — opens from Recommendation Engine card clicks */}
      <ActionCenter
        key={actionCenterRaw?.id}
        item={normalizeItem(actionCenterRaw, data)}
        onClose={() => setActionCenterRaw(null)}
        onComplete={(id) => {
          setActionCenterRaw(null);
          // Mirror completion into the action/approval arrays so cards disappear
          setData(prev => prev ? {
            ...prev,
            actions:   prev.actions?.filter(a => a.id !== id) ?? [],
            approvals: prev.approvals?.filter(a => a.id !== id) ?? [],
            critical:  prev.critical?.filter(a => a.id !== id) ?? [],
          } : prev);
        }}
      />
    </PageContainer>
  );
};

export default DailyWorkfeed;
