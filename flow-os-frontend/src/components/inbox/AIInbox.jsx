import { useState, useEffect, useCallback } from "react";
import { Mail, CornerUpLeft, CheckSquare, X, RefreshCw } from "lucide-react";
import PageContainer from "../ui/PageContainer";
import Card from "../ui/Card";
import Button from "../ui/Button";
import SourceBadge from "../workfeed/SourceBadge";
import { useWebSocket } from "../../hooks/useWebSocket";

const DEMO_INBOX = [
  {
    id: 'e1',
    from: 'Acme Corp (Client)',
    subject: 'Escalation: Production API Latency',
    priority: 'Critical',
    snippet: 'We are seeing 500ms+ latency on the primary ingestion endpoints.',
    timestamp: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    labels: ['inbox', 'important'],
    threadId: 'thread-001',
    aiSuggestion: 'Acknowledge immediately. Offer a 1-hour update. Reference the DB migration as likely cause.',
  },
  {
    id: 'e2',
    from: 'Sarah Chen',
    subject: 'Re: Design Tokens',
    priority: 'Action Needed',
    snippet: "I've attached the missing Figma tokens. Can you integrate them today?",
    timestamp: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
    labels: ['inbox'],
    threadId: 'thread-002',
    aiSuggestion: 'Reply confirming timeline. Tokens are already integrated in this sprint.',
  },
  {
    id: 'e3',
    from: 'GitHub Notifications',
    subject: 'Dependabot: Bump react-router-dom',
    priority: 'FYI',
    snippet: 'Bumps react-router-dom from 6.22 to 6.23.',
    timestamp: new Date(Date.now() - 5 * 3600 * 1000).toISOString(),
    labels: ['inbox'],
    threadId: 'thread-003',
    aiSuggestion: 'Low risk. Merge after quick review of changelog.',
  },
  {
    id: 'e4',
    from: 'James K. (CTO)',
    subject: 'Q3 Architecture Review — Your Input Needed',
    priority: 'Action Needed',
    snippet: 'Please prepare a 2-slide summary of our current vector DB strategy for the board.',
    timestamp: new Date(Date.now() - 8 * 3600 * 1000).toISOString(),
    labels: ['inbox', 'important'],
    threadId: 'thread-004',
    aiSuggestion: 'High priority. Reference the pgvector migration doc and Synapse Engine design.',
  },
  {
    id: 'e5',
    from: 'TechStartup Inc.',
    subject: 'Partnership Inquiry — AI Integration',
    priority: 'FYI',
    snippet: "We are building on top of FLOW's API and would love to discuss a partnership.",
    timestamp: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
    labels: ['inbox'],
    threadId: 'thread-005',
    aiSuggestion: 'Forward to business development. Promising enterprise lead.',
  },
  {
    id: 'e6',
    from: 'On-Call Alert',
    subject: 'ALERT: CPU spike on prod-api-03',
    priority: 'Critical',
    snippet: 'CPU utilization at 94% for 5+ minutes. Auto-scaling triggered.',
    timestamp: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    labels: ['inbox', 'important'],
    threadId: 'thread-006',
    aiSuggestion: 'Check ingestion queue backlog. Likely correlation with increased ingest volume.',
  },
];

function normalizeMessage(msg) {
  return {
    id:           msg.id || msg.messageId,
    from:         msg.from || msg.sender || 'Unknown',
    subject:      msg.subject || '(no subject)',
    snippet:      msg.snippet || (typeof msg.body === 'string' ? msg.body.slice(0, 100) : ''),
    timestamp:    msg.timestamp || msg.date || new Date().toISOString(),
    priority:     msg.labels?.includes?.('important') ? 'Action Needed' : 'FYI',
    labels:       msg.labels || [],
    threadId:     msg.threadId || msg.id,
    aiSuggestion: msg.aiSuggestion || null,
  };
}

function formatTimestamp(ts) {
  try {
    const diff = Date.now() - new Date(ts).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  } catch {
    return '';
  }
}

export const AIInbox = () => {
  const { token, workspaceId, isAuthLoading } = useWebSocket();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isDemo, setIsDemo] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [draftText, setDraftText] = useState('');
  const [sending, setSending] = useState(false);

  const headers = {
    Authorization: `Bearer ${token}`,
    'workspace-id': workspaceId || 'workspace_corp_alpha',
    'Content-Type': 'application/json',
  };

  const loadInbox = useCallback(async () => {
    if (isAuthLoading) return;
    setLoading(true);
    try {
      const res = await fetch('/api/communication/inbox?limit=20&provider=gmail', { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const raw = data.result?.messages || data.result || [];
      const msgs = Array.isArray(raw) ? raw.map(normalizeMessage) : [];
      if (msgs.length > 0) {
        setMessages(msgs);
        setIsDemo(false);
      } else {
        setMessages(DEMO_INBOX);
        setIsDemo(true);
      }
    } catch {
      setMessages(DEMO_INBOX);
      setIsDemo(true);
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, workspaceId, isAuthLoading]);

  useEffect(() => { setTimeout(() => loadInbox(), 0); }, [loadInbox]);

  const handleSelectMessage = (msg) => {
    setSelectedMessage(msg);
    setDraftText('');
  };

  const handleSendReply = async () => {
    if (!selectedMessage || !draftText.trim()) return;
    if (isDemo) {
      alert('Sent! (demo)');
      setDraftText('');
      return;
    }
    setSending(true);
    try {
      const res = await fetch(
        `/api/communication/reply/${selectedMessage.id}?provider=gmail`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({ body: draftText, provider: 'gmail' }),
        }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      alert('Reply sent!');
      setDraftText('');
    } catch {
      alert('Failed to send reply. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const priorityChip = (priority) => {
    if (priority === 'Critical') return 'text-destructive bg-destructive/10 border-destructive/30';
    if (priority === 'Action Needed') return 'text-warning bg-warning/10 border-warning/30';
    return 'text-text-muted bg-bg-card border-border-flow';
  };

  return (
    <PageContainer className="space-y-8 select-none">

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-ui-xl font-bold text-text-primary tracking-tight flex items-center space-x-3">
            <Mail className="w-8 h-8 text-flow-purple" />
            <span>AI Inbox</span>
            {isDemo && (
              <span className="text-xs text-text-muted bg-bg-card border border-border-flow px-2 py-0.5 rounded-full">
                Demo mode
              </span>
            )}
          </h1>
          <p className="text-ui-xs text-text-secondary">
            Your communications, automatically prioritized and drafted by FLOW.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={loadInbox}
            disabled={loading}
            className="flex items-center space-x-1.5 text-text-muted hover:text-text-primary"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </Button>
          {["Critical", "Action Needed", "Waiting", "FYI"].map((tab, i) => (
            <button
              key={i}
              className={`px-4 py-2 rounded-xl text-ui-xs font-semibold transition-apple ${
                i === 0
                  ? "bg-bg-card border border-border-flow text-text-primary shadow-sm"
                  : "text-text-muted hover:text-text-primary"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

        {/* Left Column: Email List (5/12) */}
        <div className="lg:col-span-5 space-y-3">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="animate-pulse bg-bg-card rounded h-16 w-full" />
            ))
          ) : (
            messages.map((email) => (
              <Card
                key={email.id}
                className={`p-4 cursor-pointer transition-apple ${
                  selectedMessage?.id === email.id
                    ? "border-flow-purple ring-1 ring-flow-purple/30 bg-bg-card"
                    : "hover:border-border-flow/80 bg-bg-primary"
                }`}
                onClick={() => handleSelectMessage(email)}
              >
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center space-x-2">
                    <span
                      className={`text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wider ${priorityChip(email.priority)}`}
                    >
                      {email.priority}
                    </span>
                  </div>
                  <span className="text-[10px] text-text-muted">{formatTimestamp(email.timestamp)}</span>
                </div>
                <h3 className="text-ui-sm font-semibold text-text-primary truncate">{email.subject}</h3>
                <p className="text-[11px] text-text-secondary font-medium truncate mb-1">{email.from}</p>
                <p className="text-ui-xs text-text-secondary font-light line-clamp-2">{email.snippet}</p>

                {email.aiSuggestion && (
                  <div className="mt-3 inline-flex items-center space-x-1.5 text-[10px] font-bold text-flow-purple bg-flow-purple/10 px-2 py-1 rounded border border-flow-purple/20">
                    <CornerUpLeft className="w-3 h-3" />
                    <span>AI Suggestion Ready</span>
                  </div>
                )}
              </Card>
            ))
          )}
        </div>

        {/* Right Column: Reader & Reply Sheet (7/12) */}
        <div className="lg:col-span-7">
          {selectedMessage ? (
            <Card className="h-full flex flex-col min-h-[600px] select-text">
              <div className="p-6 border-b border-border-flow/40 space-y-4">
                <div className="flex justify-between items-start">
                  <div className="space-y-1">
                    <h2 className="text-ui-lg font-bold text-text-primary">
                      {selectedMessage.subject}
                    </h2>
                    <div className="flex items-center space-x-2 text-ui-sm text-text-secondary">
                      <span className="font-medium text-text-primary">{selectedMessage.from}</span>
                      <span>•</span>
                      <span>{formatTimestamp(selectedMessage.timestamp)}</span>
                    </div>
                  </div>
                  <SourceBadge source="gmail" className="scale-90 origin-top-right" />
                </div>

                <div className="bg-bg-primary/50 rounded-lg p-4 text-ui-sm text-text-secondary leading-relaxed font-light border border-border-flow/40">
                  {selectedMessage.snippet}
                  <br /><br />
                  (Rest of email thread omitted for brevity)
                </div>

                {/* AI Suggestion panel */}
                {selectedMessage.aiSuggestion && (
                  <div className="bg-flow-purple/10 border border-flow-purple/30 rounded-lg p-3">
                    <div className="flex items-center space-x-2 mb-1.5">
                      <CornerUpLeft className="w-3.5 h-3.5 text-flow-purple" />
                      <span className="text-[10px] font-bold text-flow-purple uppercase tracking-wider">
                        AI Suggestion
                      </span>
                    </div>
                    <p className="text-ui-xs text-text-secondary leading-relaxed">
                      {selectedMessage.aiSuggestion}
                    </p>
                  </div>
                )}
              </div>

              {/* Reply panel */}
              <div className="p-6 flex-1 flex flex-col bg-flow-purple/5 relative overflow-hidden">
                <div className="absolute -right-24 -top-24 w-48 h-48 rounded-full bg-flow-purple/20 blur-3xl pointer-events-none" />

                <div className="flex items-center justify-between mb-4 select-none">
                  <div className="flex items-center space-x-2 text-flow-purple">
                    <CornerUpLeft className="w-4 h-4" />
                    <h3 className="text-ui-sm font-semibold uppercase tracking-wider">Reply</h3>
                  </div>
                  {isDemo && (
                    <span className="text-[10px] text-text-muted font-bold bg-bg-secondary px-2 py-0.5 rounded border border-border-flow">
                      Demo Mode
                    </span>
                  )}
                </div>

                <textarea
                  className="flex-1 w-full bg-bg-card border border-border-flow/60 rounded-xl p-4 text-ui-sm text-text-primary focus:outline-none focus:border-flow-purple/50 focus:ring-1 focus:ring-flow-purple/50 resize-none font-light leading-relaxed min-h-[200px]"
                  placeholder="Write your reply here…"
                  value={draftText}
                  onChange={(e) => setDraftText(e.target.value)}
                />

                <div className="flex items-center justify-end mt-4 space-x-3 select-none">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-text-muted hover:text-critical space-x-1.5"
                    onClick={() => { setSelectedMessage(null); setDraftText(''); }}
                  >
                    <X className="w-4 h-4" />
                    <span>Discard</span>
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    className="space-x-1.5"
                    disabled={sending || !draftText.trim()}
                    onClick={handleSendReply}
                  >
                    <CheckSquare className="w-4 h-4" />
                    <span>{sending ? 'Sending…' : 'Send Reply'}</span>
                  </Button>
                </div>
              </div>
            </Card>
          ) : (
            <div className="h-full flex flex-col items-center justify-center border-2 border-dashed border-border-flow/60 rounded-2xl bg-bg-primary/30 min-h-[600px]">
              <Mail className="w-8 h-8 text-text-muted/50 mb-3" />
              <p className="text-ui-sm text-text-muted font-medium">Select an email to review</p>
            </div>
          )}
        </div>

      </div>

    </PageContainer>
  );
};

export default AIInbox;
