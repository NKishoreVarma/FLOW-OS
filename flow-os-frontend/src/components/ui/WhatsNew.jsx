/**
 * WhatsNew — "What's new in FLOW" announcement panel.
 *
 * Shows the latest 3 product updates with a dismiss (collapse) control.
 * Persisted in localStorage — dismissed until content changes.
 *
 * Usage (mount in LayoutShell or per-page):
 *   <WhatsNew version="1.0.0" />
 */

import { useState, useEffect } from "react";
import { Sparkles, X, Star, Zap, Shield, ArrowRight } from "lucide-react";

const UPDATES = [
  {
    icon: Star,
    label: "New",
    title: "Chief of Staff is live",
    body: "FLOW now surfaces your top 5 actions every morning with one-click execution. Find it in the sidebar under 'Chief of Staff'.",
    action: "/chief",
  },
  {
    icon: Zap,
    label: "Improved",
    title: "Morning Briefing loads in 5ms",
    body: "The home page now reads from a pre-built cache — no more waiting for AI to generate on load. Deep reasoning is still one click away.",
    action: "/",
  },
  {
    icon: Shield,
    label: "Security",
    title: "WebSocket authentication hardened",
    body: "All live event streams now require JWT authentication. Set WS_AUTH_REQUIRED=true in your deployment to enforce this.",
    action: "/settings/security",
  },
];

const STORAGE_KEY = "flow_whats_new_dismissed";

export default function WhatsNew({ version = "1.0.0" }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const dismissed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      setVisible(!dismissed[version]);
    } catch {
      setVisible(true);
    }
  }, [version]);

  const dismiss = () => {
    setVisible(false);
    try {
      const curr = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...curr, [version]: true }));
    } catch {}
  };

  if (!visible) return null;

  return (
    <div style={{
      background: "var(--brand-dim)", border: "1px solid var(--brand-line)",
      borderRadius: 7, padding: "14px 16px", marginBottom: 16,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <Sparkles style={{ width: 13, height: 13, color: "var(--brand)" }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--brand-text)", letterSpacing: "0.02em" }}>What's new in v{version}</span>
        </div>
        <button onClick={dismiss} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--t5)", padding: 2 }}>
          <X style={{ width: 12, height: 12 }} />
        </button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
        {UPDATES.map((u, i) => (
          <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <div style={{ width: 22, height: 22, borderRadius: 4, background: "rgba(232,103,43,0.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <u.icon style={{ width: 11, height: 11, color: "var(--brand)" }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                <span style={{ fontSize: 9, fontWeight: 600, padding: "1px 5px", borderRadius: 3, background: "rgba(232,103,43,0.15)", color: "var(--brand-text)", textTransform: "uppercase" }}>{u.label}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--t1)" }}>{u.title}</span>
              </div>
              <p style={{ fontSize: 11, color: "var(--t3)", margin: 0, lineHeight: 1.55 }}>{u.body}</p>
            </div>
            {u.action && (
              <a href={u.action} style={{ fontSize: 10, color: "var(--brand-text)", background: "none", border: "none", cursor: "pointer", flexShrink: 0, textDecoration: "none", display: "flex", alignItems: "center", gap: 3 }}>
                Open <ArrowRight style={{ width: 9, height: 9 }} />
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
