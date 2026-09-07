import { useNavigate } from "react-router-dom";
import {
  LifeBuoy, Command, Search, Sparkles, Plug, GitPullRequest, MessageSquare,
  Calendar, Brain, Activity, Keyboard, ArrowRight,
} from "lucide-react";

/**
 * HelpCenter — the real `/help` page (was a ComingSoon stub). No backend: a
 * getting-started + keyboard-shortcuts + "what FLOW can do" reference whose
 * buttons trigger the same in-app actions the shortcuts do, so users learn FLOW
 * without leaving to read external docs.
 */
const SHORTCUTS = [
  { keys: ["⌘", "K"], label: "Command palette / universal search" },
  { keys: ["⌘", "B"], label: "Toggle sidebar" },
  { keys: ["⌘", "N"], label: "New note" },
  { keys: ["⌘", "E"], label: "Compose email" },
  { keys: ["/"],      label: "Keyboard shortcut reference" },
  { keys: ["\\"],     label: "Toggle live feed panel" },
];

const CAPABILITIES = [
  { icon: Brain,          title: "Ask the Operational Brain", body: "Ask anything about your company. Answers come with evidence, confidence, trust, and one-click actions.", to: "/" },
  { icon: GitPullRequest, title: "Review & merge PRs",         body: "See merge readiness, read the diff inline, and merge — without opening GitHub.", to: "/projects" },
  { icon: MessageSquare,  title: "Read Slack threads",         body: "Open a full thread with participants, replies, and mentions inside FLOW.", to: "/" },
  { icon: Calendar,       title: "Prep for meetings",          body: "AI meeting prep, notes, and action items synced to your calendar.", to: "/meetings" },
  { icon: Activity,       title: "Track everything",           body: "One activity feed across memory, automations, and every connector.", to: "/activity" },
  { icon: Plug,           title: "Connect your tools",         body: "Link GitHub, Gmail, Slack, Jira, Calendar and more from Integrations.", to: "/settings/integrations" },
];

function QuickAction({ icon: Icon, label, onClick }) {
  return (
    <button onClick={onClick}
      style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "7px 13px", fontSize: 12, borderRadius: 5, cursor: "pointer",
        background: "rgba(232,103,43,0.05)", border: "1px solid var(--brand-line)", color: "var(--t2)", transition: "all 100ms" }}
      onMouseEnter={e => { e.currentTarget.style.background = "rgba(232,103,43,0.10)"; e.currentTarget.style.color = "var(--t1)"; }}
      onMouseLeave={e => { e.currentTarget.style.background = "rgba(232,103,43,0.05)"; e.currentTarget.style.color = "var(--t2)"; }}
    >
      <Icon style={{ width: 12, height: 12, color: "var(--brand)" }} />{label}
    </button>
  );
}

export default function HelpCenter() {
  const navigate = useNavigate();

  return (
    <div style={{ padding: "24px", maxWidth: 820, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <LifeBuoy style={{ width: 16, height: 16, color: "var(--brand)" }} />
        <h1 style={{ fontSize: 16, fontWeight: 500, color: "var(--t1)", letterSpacing: "-0.3px" }}>Help & Getting Started</h1>
      </div>
      <p style={{ fontSize: 12, color: "var(--t4)", marginBottom: 24 }}>
        FLOW is your operating system for work. Here's how to get the most out of it.
      </p>

      {/* Quick actions */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 28 }}>
        <QuickAction icon={Search}   label="Open search (⌘K)"     onClick={() => window.dispatchEvent(new CustomEvent("flow:open-search"))} />
        <QuickAction icon={Sparkles} label="Ask the Brain"         onClick={() => navigate("/")} />
        <QuickAction icon={Plug}     label="Connect integrations"  onClick={() => navigate("/settings/integrations")} />
        <QuickAction icon={Activity} label="View activity"         onClick={() => navigate("/activity")} />
      </div>

      {/* Capabilities */}
      <div style={{ fontSize: 10, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--t5)", marginBottom: 12 }}>What you can do</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12, marginBottom: 32 }}>
        {CAPABILITIES.map(c => {
          const Icon = c.icon;
          return (
            <button key={c.title} onClick={() => navigate(c.to)}
              style={{ textAlign: "left", display: "flex", flexDirection: "column", gap: 6, padding: "14px", borderRadius: 6, cursor: "pointer",
                background: "var(--bg-card)", border: "1px solid var(--border)", transition: "border-color 100ms" }}
              onMouseEnter={e => e.currentTarget.style.borderColor = "var(--border-strong)"}
              onMouseLeave={e => e.currentTarget.style.borderColor = "var(--border)"}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Icon style={{ width: 13, height: 13, color: "var(--brand)" }} />
                <span style={{ fontSize: 13, fontWeight: 500, color: "var(--t1)" }}>{c.title}</span>
              </div>
              <p style={{ fontSize: 12, color: "var(--t4)", lineHeight: 1.55, margin: 0 }}>{c.body}</p>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--brand-text)", marginTop: 2 }}>
                Open <ArrowRight style={{ width: 10, height: 10 }} />
              </span>
            </button>
          );
        })}
      </div>

      {/* Keyboard shortcuts */}
      <div style={{ fontSize: 10, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--t5)", marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
        <Keyboard style={{ width: 11, height: 11 }} /> Keyboard shortcuts
      </div>
      <div style={{ border: "1px solid var(--border)", borderRadius: 6, overflow: "hidden" }}>
        {SHORTCUTS.map((s, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderTop: i > 0 ? "1px solid var(--border)" : "none", background: "var(--bg-card)" }}>
            <span style={{ fontSize: 13, color: "var(--t2)" }}>{s.label}</span>
            <span style={{ display: "flex", gap: 4 }}>
              {s.keys.map((k, j) => (
                <kbd key={j} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 20, height: 20, padding: "0 5px", fontSize: 11, fontFamily: "monospace", color: "var(--t3)", background: "rgba(31,27,22,0.05)", border: "1px solid var(--border-strong)", borderRadius: 4 }}>
                  {k}
                </kbd>
              ))}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
