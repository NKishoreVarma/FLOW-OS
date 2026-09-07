/**
 * Help Center (Programs 3 + 8)
 *
 * Integrated docs, FAQ, troubleshooting, shortcuts, contact support,
 * and release notes — no external dependencies.
 */

import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  LifeBuoy, Search, Keyboard, Sparkles, Plug, GitPullRequest, MessageSquare,
  Calendar, Activity, Brain, ArrowRight, ChevronDown, ChevronRight,
  BookOpen, HelpCircle, AlertCircle, MessageCircle, Zap, Shield,
  Link2, Users, Settings, Tag, Mail, FileText, Clock, CheckCircle,
  PlayCircle, Package,
} from "lucide-react";

/* ─── content ─────────────────────────────────────────────── */

const SHORTCUTS = [
  { keys: ["⌘", "K"], label: "Command palette — search everything" },
  { keys: ["⌘", "B"], label: "Toggle sidebar" },
  { keys: ["⌘", "N"], label: "New note or draft" },
  { keys: ["⌘", "E"], label: "Compose email" },
  { keys: ["/"],       label: "Open keyboard shortcut reference" },
  { keys: ["\\"],      label: "Toggle live event feed" },
  { keys: ["⌘", "/"], label: "Focus command input on Brain page" },
  { keys: ["Esc"],     label: "Close any panel or modal" },
];

const DOCS = [
  {
    category: "Getting Started",
    icon: Zap,
    items: [
      {
        title: "Welcome to FLOW",
        body: "FLOW is an enterprise intelligence operating system. It ingests signals from your tools, reasons across all of them, and surfaces the most important action you should take right now.",
        steps: [
          "Sign in and complete the setup wizard — it takes under 5 minutes.",
          "Connect at least one integration from the Integrations page.",
          "Open the Morning Briefing (the default home page) to see your first AI summary.",
          "Use ⌘K to search across all your connected data sources.",
        ],
      },
      {
        title: "Connecting your first integration",
        body: "FLOW works best when it can see your entire workflow. Start with the tool you use most — usually email, Slack, or GitHub.",
        steps: [
          "Navigate to Settings → Integrations.",
          "Click the connector you want to add (Gmail, GitHub, Slack, Jira, or Notion).",
          "Follow the OAuth flow — FLOW requests read-only access by default.",
          "After connecting, run a sync to import recent data.",
          "FLOW will surface insights from this connector in your Morning Briefing within minutes.",
        ],
      },
      {
        title: "Understanding the Morning Briefing",
        body: "The Morning Briefing is the FLOW home page. It shows: workspace health score, top 3 actions recommended by AI, connector status, and a narrative summary of what's happening.",
        steps: [
          "The health score (0–100) is derived from pending incidents, open PRs, overdue tasks, and AI predictions.",
          "Each recommended action is clickable and opens a detailed view with evidence and execution options.",
          "The briefing refreshes every 5 minutes from the Workspace Intelligence Cache — never from a live AI call.",
          "Use the 'Ask FLOW' input at the bottom to switch to interactive AI reasoning.",
        ],
      },
    ],
  },
  {
    category: "AI Features",
    icon: Brain,
    items: [
      {
        title: "Asking the Operational Brain",
        body: "The Operational Brain is FLOW's multi-stage reasoning pipeline. Ask it anything about your company — it retrieves evidence from all your connected sources, runs a 9-stage reasoning chain, and gives an explainable answer.",
        steps: [
          "Click the Brain icon in the sidebar or press ⌘K then type your question.",
          "Every answer includes evidence citations — click them to see the source.",
          "The confidence score (0–100) reflects data freshness, source diversity, and reasoning consistency.",
          "Click 'Why?' to get a deeper explanation of how the answer was constructed.",
          "Use 'What's missing?' to see what evidence would improve the answer.",
        ],
      },
      {
        title: "Executive Council",
        body: "The Executive Council routes your question to 6 specialized AI executives (Engineering, Operations, Sales, HR, Security, Finance). They analyze it from their domain perspective and present a synthesized answer with dissenting views preserved.",
        steps: [
          "Navigate to Council in the sidebar.",
          "Type your strategic question in the Ask box.",
          "Each agent card shows its health status and domain focus.",
          "The final synthesis includes minority opinions — not all AI voices are the same.",
          "Use the council for strategic questions; use the Brain for operational questions.",
        ],
      },
      {
        title: "What-If Simulation",
        body: "Simulate hypothetical scenarios before acting — what happens if a key engineer leaves, a service goes down, or a customer churns?",
        steps: [
          "Go to Settings → Simulation (dev/admin only).",
          "Type a scenario in natural language ('What if Alice resigns?') or choose from 11 scenario types.",
          "FLOW traces cascading impact across your Knowledge Graph — all real data, no fabrication.",
          "Compare two scenarios side-by-side.",
          "Financial impact figures are labeled as estimates with stated assumptions.",
        ],
      },
    ],
  },
  {
    category: "Connectors",
    icon: Link2,
    items: [
      {
        title: "Supported integrations",
        body: "FLOW connects to the following platforms in v1.0:",
        steps: [
          "Gmail — read inbox, send/reply/forward, label management, inbox sync to AI.",
          "Google Calendar — events, meeting prep AI context, notes, action items.",
          "GitHub — repositories, pull requests, code review, deployments, branch management.",
          "Jira — issues, projects (adapter available).",
          "Notion — pages, databases (adapter available).",
          "Slack — channel data (adapter available).",
          "HubSpot, Salesforce, Workday, BambooHR — partial adapters (v1.0 foundation).",
        ],
      },
      {
        title: "Integration Permissions",
        body: "FLOW uses deny-by-default integration permissions. Every resource must be explicitly allowed before FLOW ingests it. This is by design — enterprise data governance requires explicit opt-in.",
        steps: [
          "After connecting an integration, go to Settings → Permissions.",
          "FLOW discovers available resources (channels, repos, calendars, labels).",
          "Toggle each resource to Allow or Hide.",
          "Only allowed resources are ingested, vectorized, or reasoned over.",
          "Ungoverned (legacy) resources are labeled and can be seeded as 'allowed' on first discovery.",
        ],
      },
      {
        title: "Connector health and troubleshooting",
        body: "Each connector shows a health status: Healthy, Degraded, or Down. If a connector is Degraded, FLOW uses cached data and will retry.",
        steps: [
          "Check connector health in Settings → Health or the Platform Console.",
          "Degraded usually means: rate limited, token expired, or provider outage.",
          "To fix a token expiry: go to Integrations, click the connector, and re-authorize.",
          "To fix rate limiting: reduce sync frequency or wait for the rate limit window to reset.",
          "If Down for >10 min with no API outage: try revoking and re-authorizing credentials.",
        ],
      },
    ],
  },
  {
    category: "Security & Privacy",
    icon: Shield,
    items: [
      {
        title: "How FLOW handles your data",
        body: "FLOW processes data in your own infrastructure. Nothing is sent to Anthropic or third-party AI providers except through your configured Gemini API key.",
        steps: [
          "All data is stored in your own PostgreSQL database + pgvector extension.",
          "Vault files (Markdown intel reports) are written to your server's filesystem.",
          "The Privacy Gate automatically discards messages scored >0.85 private — they are never stored.",
          "Embeddings are generated via your Gemini API key — data passes through Google's API.",
          "Redis stores only ephemeral social coordination messages (3600s TTL) and onboarding state.",
        ],
      },
      {
        title: "Roles and permissions",
        body: "FLOW has four roles: OWNER (full access), ADMIN (most actions + approvals), MEMBER (standard access), and VIEWER (read-only).",
        steps: [
          "OWNER: Create/delete workspaces, manage policies, approve high/critical actions.",
          "ADMIN: Manage users, approve medium/high actions, view audit log.",
          "MEMBER: Use all AI features, read connectors, execute pre-approved actions.",
          "VIEWER: Read-only access to briefings, knowledge, and activity feed.",
          "Roles are set per-workspace in Settings → Identity & Access.",
        ],
      },
      {
        title: "Audit log",
        body: "Every governed action in FLOW is logged to a durable PostgreSQL audit log. This includes connector actions, approval decisions, and policy changes.",
        steps: [
          "Navigate to Settings → Audit Log to view the complete history.",
          "Filter by connector, action type, user, or date range.",
          "Each entry includes: who, what, when, risk level, and outcome (success/denied/approval_required).",
          "Audit logs are append-only — entries cannot be deleted.",
          "Export the audit log from the Audit page for compliance reporting.",
        ],
      },
    ],
  },
  {
    category: "Workflows",
    icon: Zap,
    items: [
      {
        title: "Governed action execution",
        body: "FLOW executes actions on your behalf through a risk-tiered approval system. Low-risk actions execute automatically; high-risk ones require ADMIN approval.",
        steps: [
          "LOW risk: Auto-executes. Example: creating a draft email.",
          "MEDIUM risk: Requires confirmation from the requester.",
          "HIGH risk: Requires 1× ADMIN or OWNER approval.",
          "CRITICAL risk: Requires 2× distinct ADMIN/OWNER approvals.",
          "All actions are governed — no connector method can be called outside the governed pipeline.",
        ],
      },
      {
        title: "Autonomous Operations",
        body: "The Chief of Staff view surfaces the top 5 things you should act on right now, with one-click execution for each. The Weekly Review shows engineering velocity, execution success, and open risks.",
        steps: [
          "Navigate to Chief of Staff in the sidebar.",
          "Each card shows the action, risk level, required approvals, and estimated impact.",
          "Click Execute to run the action through the governed pipeline.",
          "Navigate to Weekly Review for a retrospective view of the past 7 days.",
          "All actions in these views use the same governed pipeline — no shortcuts.",
        ],
      },
    ],
  },
  {
    category: "Troubleshooting",
    icon: AlertCircle,
    items: [
      {
        title: "Morning Briefing shows stale data",
        body: "The briefing reads from the Workspace Intelligence Cache, which rebuilds every 5 minutes. If data appears stale beyond 10 minutes, the cache may need a manual refresh.",
        steps: [
          "Check workspace health at Settings → Health.",
          "If WIC shows a build error, check server logs for prediction engine errors.",
          "Force a cache rebuild by hitting GET /api/workspace/snapshot?force=true with your JWT.",
          "If predictions are failing, verify GEMINI_API_KEY is set and active.",
          "If the problem persists, restart the prediction worker.",
        ],
      },
      {
        title: "AI answers are slow or unavailable",
        body: "The Operational Brain takes 20–30 seconds to generate a response. This is expected — it runs a 9-stage reasoning pipeline including LLM calls.",
        steps: [
          "Check GEMINI_API_KEY is configured and not expired.",
          "If GEMINI_API_KEY is missing, FLOW uses heuristic fallbacks — answers will be simpler.",
          "Check /api/ai/providers for provider health status.",
          "If all providers are down, FLOW falls back to deterministic non-LLM answers for all queries.",
          "For faster responses, use the Workspace Intelligence Cache endpoints (/api/workspace/*).",
        ],
      },
      {
        title: "Integration OAuth errors",
        body: "OAuth errors typically mean your credentials have expired or the app needs re-authorization.",
        steps: [
          "Go to Settings → Integrations and find the affected connector.",
          "Click 'Re-authorize' to start a new OAuth flow.",
          "Ensure GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are set in your .env for Gmail/Calendar.",
          "For GitHub, ensure GITHUB_TOKEN has the required scopes: repo, read:user.",
          "After re-authorizing, run a manual sync to re-import recent data.",
        ],
      },
      {
        title: "Onboarding wizard appears on every load",
        body: "The onboarding wizard checks Redis for completion state. If Redis is flushed, the wizard re-appears.",
        steps: [
          "The 'Skip for now' button sets a localStorage flag that prevents repeat appearances.",
          "To permanently dismiss: complete the wizard or click 'Skip for now'.",
          "If the wizard keeps reappearing despite dismissal, check for localStorage restrictions in your browser.",
          "To reset onboarding intentionally: POST /api/onboarding/reset (ADMIN only).",
        ],
      },
    ],
  },
];

const FAQ = [
  {
    q: "Is my data sent to OpenAI or Anthropic?",
    a: "No. FLOW uses Google's Gemini API (via your own API key) for AI reasoning. Your data passes through Google's API endpoint only. Nothing is sent to OpenAI, Anthropic, or any other provider unless you configure additional providers via the AI Orchestrator settings.",
  },
  {
    q: "How is the health score calculated?",
    a: "The health score (0–100) is a composite of 8 dimensions: pending incidents, open PRs, overdue approvals, connector health, AI success rate, memory retention, security posture, and prediction risk. It's computed deterministically — no LLM is involved.",
  },
  {
    q: "Can I connect multiple GitHub organizations?",
    a: "In v1.0, each workspace has one GitHub PAT. A PAT with org:read scope can access multiple organizations. Full multi-org workspace support is on the roadmap.",
  },
  {
    q: "What happens if a connector goes down?",
    a: "FLOW degrades gracefully. The connector shows 'Degraded' status. The AI uses cached data for reasoning. Sync is paused and retried automatically. Users see a 'Showing cached data' indicator on affected surfaces.",
  },
  {
    q: "How do I invite my team?",
    a: "Go to Settings → Team (or the 'Invite your team' button on the Value page). Enter an email and role. FLOW generates a temporary password — email delivery isn't configured in v1.0, so share the password directly.",
  },
  {
    q: "Is the What-If simulation using real data?",
    a: "Yes. Simulations use the actual Operational Graph, event history, and your connected data. Financial impact figures are clearly labeled as heuristic estimates with stated assumptions. No fabricated data is used.",
  },
  {
    q: "What are the system requirements?",
    a: "FLOW runs on Node.js 20+, PostgreSQL 16 with pgvector extension, and Redis 7+. Frontend: any modern browser (Chrome, Firefox, Safari, Edge). Mobile: responsive web, no native app in v1.0.",
  },
  {
    q: "How does the Privacy Gate work?",
    a: "Every ingested message is scored for privacy (0–1). Messages scoring above 0.85 are classified as PRIVATE_PERSONAL and hard-dropped — never stored, logged, vectorized, or shown in any query result. The text is set to null immediately after scoring.",
  },
];

/* ─── component ─────────────────────────────────────────────── */

export default function HelpCenter() {
  const navigate = useNavigate();
  const [tab, setTab] = useState("start");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState({});
  const [faqExpanded, setFaqExpanded] = useState({});

  const TABS = [
    { id: "start",   label: "Getting Started", icon: Zap },
    { id: "docs",    label: "Documentation",   icon: BookOpen },
    { id: "faq",     label: "FAQ",             icon: HelpCircle },
    { id: "support", label: "Contact Support", icon: MessageCircle },
    { id: "shortcuts", label: "Shortcuts",     icon: Keyboard },
  ];

  const filteredDocs = useMemo(() => {
    if (!search.trim()) return DOCS;
    const q = search.toLowerCase();
    return DOCS.map(cat => ({
      ...cat,
      items: cat.items.filter(i =>
        i.title.toLowerCase().includes(q) ||
        i.body.toLowerCase().includes(q) ||
        (i.steps || []).some(s => s.toLowerCase().includes(q))
      ),
    })).filter(cat => cat.items.length > 0);
  }, [search]);

  const filteredFaq = useMemo(() => {
    if (!search.trim()) return FAQ;
    const q = search.toLowerCase();
    return FAQ.filter(f => f.q.toLowerCase().includes(q) || f.a.toLowerCase().includes(q));
  }, [search]);

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "18px 24px 0", borderBottom: "1px solid var(--border)", background: "var(--bg-sidebar)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <LifeBuoy style={{ width: 16, height: 16, color: "var(--brand)" }} />
          <h1 style={{ fontSize: 16, fontWeight: 600, color: "var(--t1)", letterSpacing: "-0.3px", margin: 0 }}>Help & Documentation</h1>
        </div>
        <p style={{ fontSize: 12, color: "var(--t4)", margin: "0 0 14px" }}>
          Everything you need to get value from FLOW — guides, reference, FAQ, and support.
        </p>

        {/* Search */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--bg-input)", border: "1px solid var(--border-strong)", borderRadius: 5, padding: "7px 10px", marginBottom: 14, maxWidth: 480 }}>
          <Search style={{ width: 12, height: 12, color: "var(--t5)" }} />
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setTab("docs"); }}
            placeholder="Search documentation, FAQ, and guides…"
            style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontSize: 12, color: "var(--t1)", fontFamily: "inherit" }}
          />
          {search && <button onClick={() => setSearch("")} style={{ fontSize: 10, color: "var(--t5)", background: "none", border: "none", cursor: "pointer" }}>×</button>}
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 2 }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              display: "flex", alignItems: "center", gap: 5,
              padding: "6px 12px", fontSize: 11, fontWeight: tab === t.id ? 600 : 400,
              borderRadius: "4px 4px 0 0", border: "none", cursor: "pointer",
              background: tab === t.id ? "var(--bg-base)" : "transparent",
              color: tab === t.id ? "var(--t1)" : "var(--t4)",
              borderBottom: tab === t.id ? "2px solid var(--brand)" : "2px solid transparent",
            }}>
              <t.icon style={{ width: 11, height: 11 }} /> {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "24px" }}>

        {/* GETTING STARTED */}
        {tab === "start" && (
          <div style={{ maxWidth: 800 }}>
            {/* Quick actions */}
            <div style={{ marginBottom: 28 }}>
              <p style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--t5)", marginBottom: 10 }}>Quick actions</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {[
                  { icon: Search,          label: "Open search",          action: () => window.dispatchEvent(new CustomEvent("flow:open-search")) },
                  { icon: Sparkles,        label: "Ask the Brain",        action: () => navigate("/") },
                  { icon: Plug,            label: "Connect integrations", action: () => navigate("/settings/integrations") },
                  { icon: Activity,        label: "View activity",        action: () => navigate("/activity") },
                  { icon: GitPullRequest,  label: "Review PRs",           action: () => navigate("/projects") },
                  { icon: Calendar,        label: "Prepare for meetings", action: () => navigate("/meetings") },
                ].map(q => (
                  <button key={q.label} onClick={q.action} style={{
                    display: "inline-flex", alignItems: "center", gap: 7, padding: "8px 13px", fontSize: 12, borderRadius: 5, cursor: "pointer",
                    background: "rgba(232,103,43,0.05)", border: "1px solid var(--brand-line)", color: "var(--t2)", transition: "all 80ms",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = "rgba(232,103,43,0.10)"; e.currentTarget.style.color = "var(--t1)"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "rgba(232,103,43,0.05)"; e.currentTarget.style.color = "var(--t2)"; }}
                  >
                    <q.icon style={{ width: 12, height: 12, color: "var(--brand)" }} /> {q.label}
                  </button>
                ))}
              </div>
            </div>

            {/* What you can do */}
            <p style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--t5)", marginBottom: 12 }}>What you can do with FLOW</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12, marginBottom: 32 }}>
              {[
                { icon: Brain,          title: "Reason across your entire company",   body: "Ask anything. FLOW retrieves evidence, checks for contradictions, and synthesizes an explainable answer.", to: "/" },
                { icon: GitPullRequest, title: "Review & merge PRs",                  body: "Merge readiness score, diff, reviews — inside FLOW without opening GitHub.", to: "/projects" },
                { icon: MessageSquare,  title: "Read your full inbox",                 body: "AI-summarized emails with one-click reply, forward, and archive.", to: "/inbox" },
                { icon: Calendar,       title: "Prepare for any meeting",              body: "AI brief, suggested questions, related context, and action item tracking.", to: "/meetings" },
                { icon: Activity,       title: "Track everything",                     body: "One activity feed: memory, automations, connectors, and incidents.", to: "/activity" },
                { icon: Shield,         title: "Govern every action",                  body: "Every AI action is risk-tiered, approval-gated, and audited.", to: "/settings/governance" },
              ].map(c => (
                <button key={c.title} onClick={() => navigate(c.to)}
                  style={{ textAlign: "left", display: "flex", flexDirection: "column", gap: 6, padding: "14px", borderRadius: 6, cursor: "pointer", background: "var(--bg-card)", border: "1px solid var(--border)", transition: "border-color 100ms" }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = "var(--border-strong)"}
                  onMouseLeave={e => e.currentTarget.style.borderColor = "var(--border)"}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <c.icon style={{ width: 13, height: 13, color: "var(--brand)" }} />
                    <span style={{ fontSize: 13, fontWeight: 500, color: "var(--t1)" }}>{c.title}</span>
                  </div>
                  <p style={{ fontSize: 12, color: "var(--t4)", lineHeight: 1.55, margin: 0 }}>{c.body}</p>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--brand-text)", marginTop: 2 }}>
                    Open <ArrowRight style={{ width: 10, height: 10 }} />
                  </span>
                </button>
              ))}
            </div>

            {/* Setup checklist */}
            <p style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--t5)", marginBottom: 12 }}>Setup checklist</p>
            <div style={{ border: "1px solid var(--border)", borderRadius: 6, overflow: "hidden", marginBottom: 24 }}>
              {[
                { label: "Sign in and create your workspace",       done: true,  action: null },
                { label: "Connect your first integration",          done: false, action: () => navigate("/settings/integrations") },
                { label: "Run a sync to import recent data",        done: false, action: null },
                { label: "Read your first Morning Briefing",        done: false, action: () => navigate("/") },
                { label: "Ask the Operational Brain a question",    done: false, action: () => navigate("/") },
                { label: "Invite a team member",                    done: false, action: () => navigate("/settings/team") },
              ].map((item, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderTop: i > 0 ? "1px solid var(--border)" : "none", background: "var(--bg-card)" }}>
                  <CheckCircle style={{ width: 14, height: 14, color: item.done ? "var(--p-normal-text)" : "var(--border-strong)", flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: item.done ? "var(--t4)" : "var(--t2)", textDecoration: item.done ? "line-through" : "none", flex: 1 }}>{item.label}</span>
                  {item.action && !item.done && (
                    <button onClick={item.action} style={{ fontSize: 11, color: "var(--brand-text)", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                      Go <ArrowRight style={{ width: 9, height: 9 }} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* DOCUMENTATION */}
        {tab === "docs" && (
          <div style={{ maxWidth: 820 }}>
            {search && <p style={{ fontSize: 11, color: "var(--t5)", marginBottom: 16 }}>
              {filteredDocs.reduce((a, c) => a + c.items.length, 0)} result{filteredDocs.reduce((a, c) => a + c.items.length, 0) !== 1 ? "s" : ""} for "{search}"
            </p>}
            {filteredDocs.map(cat => (
              <div key={cat.category} style={{ marginBottom: 28 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 12 }}>
                  <cat.icon style={{ width: 13, height: 13, color: "var(--brand)" }} />
                  <p style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--t5)", margin: 0 }}>{cat.category}</p>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {cat.items.map(item => {
                    const key = `${cat.category}:${item.title}`;
                    const open = expanded[key];
                    return (
                      <div key={item.title} style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 6, overflow: "hidden" }}>
                        <button
                          onClick={() => setExpanded(p => ({ ...p, [key]: !p[key] }))}
                          style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", background: "none", border: "none", cursor: "pointer" }}
                        >
                          <span style={{ fontSize: 13, fontWeight: 500, color: "var(--t1)", textAlign: "left" }}>{item.title}</span>
                          {open ? <ChevronDown style={{ width: 13, height: 13, color: "var(--t4)", flexShrink: 0 }} /> : <ChevronRight style={{ width: 13, height: 13, color: "var(--t4)", flexShrink: 0 }} />}
                        </button>
                        {open && (
                          <div style={{ padding: "0 14px 14px", borderTop: "1px solid var(--border)" }}>
                            <p style={{ fontSize: 12, color: "var(--t3)", lineHeight: 1.6, margin: "12px 0 10px" }}>{item.body}</p>
                            {item.steps && (
                              <ol style={{ margin: 0, padding: "0 0 0 16px" }}>
                                {item.steps.map((s, i) => (
                                  <li key={i} style={{ fontSize: 12, color: "var(--t3)", lineHeight: 1.6, marginBottom: 4 }}>{s}</li>
                                ))}
                              </ol>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* FAQ */}
        {tab === "faq" && (
          <div style={{ maxWidth: 720 }}>
            <p style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--t5)", marginBottom: 14 }}>Frequently Asked Questions</p>
            {filteredFaq.length === 0 ? (
              <p style={{ fontSize: 12, color: "var(--t4)" }}>No results for "{search}".</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {filteredFaq.map((f, i) => {
                  const open = faqExpanded[i];
                  return (
                    <div key={i} style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 6, overflow: "hidden" }}>
                      <button
                        onClick={() => setFaqExpanded(p => ({ ...p, [i]: !p[i] }))}
                        style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", background: "none", border: "none", cursor: "pointer" }}
                      >
                        <span style={{ fontSize: 13, fontWeight: 500, color: "var(--t1)", textAlign: "left" }}>{f.q}</span>
                        {open ? <ChevronDown style={{ width: 13, height: 13, color: "var(--t4)" }} /> : <ChevronRight style={{ width: 13, height: 13, color: "var(--t4)" }} />}
                      </button>
                      {open && (
                        <div style={{ padding: "0 14px 14px", borderTop: "1px solid var(--border)" }}>
                          <p style={{ fontSize: 12, color: "var(--t3)", lineHeight: 1.65, margin: "12px 0 0" }}>{f.a}</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* CONTACT SUPPORT */}
        {tab === "support" && (
          <div style={{ maxWidth: 600 }}>
            <p style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--t5)", marginBottom: 14 }}>Contact Support</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {[
                {
                  icon: Mail, label: "Email support", value: "support@flowos.ai",
                  body: "For account, billing, or enterprise questions. Response within 1 business day.",
                  action: "mailto:support@flowos.ai", actionLabel: "Send email",
                },
                {
                  icon: FileText, label: "Documentation",
                  body: "Full architecture documentation is in docs/ARCHITECTURE/ in your deployment.",
                  action: null,
                },
                {
                  icon: Tag, label: "Release notes",
                  body: "See what changed in each version, including breaking changes.",
                  action: "/settings/releases", actionLabel: "View releases", isNav: true,
                },
                {
                  icon: Clock, label: "Response SLA",
                  body: "FREE: best effort · STARTER: 2 business days · PRO: 1 business day · ENTERPRISE: 4 hours",
                  action: null,
                },
              ].map(card => (
                <div key={card.label} style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 6, padding: "14px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}>
                    <card.icon style={{ width: 13, height: 13, color: "var(--brand)" }} />
                    <span style={{ fontSize: 12, fontWeight: 500, color: "var(--t1)" }}>{card.label}</span>
                  </div>
                  <p style={{ fontSize: 12, color: "var(--t4)", lineHeight: 1.55, margin: "0 0 8px" }}>{card.body}</p>
                  {card.action && (
                    card.isNav
                      ? <button onClick={() => navigate(card.action)} style={{ fontSize: 11, color: "var(--brand-text)", background: "none", border: "none", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}>{card.actionLabel} <ArrowRight style={{ width: 9, height: 9 }} /></button>
                      : <a href={card.action} style={{ fontSize: 11, color: "var(--brand-text)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}>{card.actionLabel} <ArrowRight style={{ width: 9, height: 9 }} /></a>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* SHORTCUTS */}
        {tab === "shortcuts" && (
          <div style={{ maxWidth: 640 }}>
            <p style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--t5)", marginBottom: 14 }}>Keyboard Shortcuts</p>
            <div style={{ border: "1px solid var(--border)", borderRadius: 6, overflow: "hidden" }}>
              {SHORTCUTS.map((s, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 14px", borderTop: i > 0 ? "1px solid var(--border)" : "none", background: "var(--bg-card)" }}>
                  <span style={{ fontSize: 13, color: "var(--t2)" }}>{s.label}</span>
                  <span style={{ display: "flex", gap: 4 }}>
                    {s.keys.map((k, j) => (
                      <kbd key={j} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 22, height: 22, padding: "0 6px", fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", color: "var(--t3)", background: "rgba(31,27,22,0.05)", border: "1px solid var(--border-strong)", borderRadius: 4 }}>{k}</kbd>
                    ))}
                  </span>
                </div>
              ))}
            </div>
            <p style={{ fontSize: 11, color: "var(--t5)", marginTop: 12 }}>
              Most actions are also accessible from the Command Palette (⌘K). Type "/" after opening the palette to see all slash commands.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
