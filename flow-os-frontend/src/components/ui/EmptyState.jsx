import { CheckCircle, Search, Inbox, Calendar, Briefcase, BookOpen, Activity, Bell, AlertTriangle } from "lucide-react";
import { useState } from "react";

const VARIANTS = {
  default:       { icon: CheckCircle,   title: "You're caught up",      desc: "FLOW is watching your connected tools — new work appears here." },
  search:        { icon: Search,        title: "No results",            desc: "Try different search terms or filters." },
  inbox:         { icon: Inbox,         title: "Inbox is empty",        desc: "No messages require your attention." },
  meetings:      { icon: Calendar,      title: "No meetings",           desc: "Your calendar is clear for this period." },
  projects:      { icon: Briefcase,     title: "No projects",           desc: "Connect GitHub to see your projects here." },
  knowledge:     { icon: BookOpen,      title: "No documents",          desc: "Connect Notion or Drive to explore your knowledge base." },
  activity:      { icon: Activity,      title: "No activity yet",       desc: "Activity will appear here as FLOW processes intelligence." },
  notifications: { icon: Bell,          title: "No notifications",      desc: "You're all caught up." },
  error:         { icon: AlertTriangle, title: "Couldn't load this",    desc: "The backend didn't respond. Retry, or check your connection." },
};

export function EmptyState({ variant = "default", message, description, icon: CustomIcon, action }) {
  const v = VARIANTS[variant] || VARIANTS.default;
  const Icon = CustomIcon || v.icon;
  const [hovered, setHovered] = useState(false);
  const accent = variant === "error" ? "var(--p-critical)" : "var(--t4)";

  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", padding: "48px 24px", textAlign: "center",
    }}>
      <div style={{
        width: 40, height: 40, borderRadius: 6,
        background: "rgba(31,27,22,0.05)",
        border: "1px solid var(--border-strong)",
        display: "flex", alignItems: "center", justifyContent: "center",
        marginBottom: 14,
      }}>
        <Icon style={{ width: 16, height: 16, color: accent }} />
      </div>
      <p style={{ fontSize: 13, fontWeight: 500, color: "var(--t2)", marginBottom: 4 }}>
        {message || v.title}
      </p>
      <p style={{ fontSize: 12, color: "var(--t4)", maxWidth: 280, lineHeight: 1.55 }}>
        {description || v.desc}
      </p>
      {action && (
        <button
          onClick={action.onClick}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          style={{
            marginTop:   16,
            padding:     "6px 14px",
            fontSize:     12,
            fontWeight:   500,
            color:       hovered ? "var(--t1)" : "var(--brand-text)",
            background:  hovered ? "var(--brand-dim)" : "transparent",
            border:      "1px solid var(--brand-line)",
            borderRadius: 4,
            cursor:      "pointer",
            transition:  "all 100ms",
          }}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

export default EmptyState;
