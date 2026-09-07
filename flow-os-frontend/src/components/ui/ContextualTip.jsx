/**
 * ContextualTip — dismissible in-app education tip.
 *
 * Usage:
 *   <ContextualTip id="brain-evidence" title="Reading evidence" variant="info">
 *     Click any citation in an AI response to see the source document.
 *   </ContextualTip>
 *
 * Tips are persisted to localStorage keyed by id — dismissed tips never
 * reappear for that browser session.
 *
 * Variants: info (default), success, warning, tip
 */

import { useState, useEffect } from "react";
import { X, Lightbulb, Info, CheckCircle, AlertTriangle, Sparkles } from "lucide-react";

const VARIANT_MAP = {
  info:    { icon: Info,          color: "var(--p-info-text)",     bg: "rgba(96,165,250,0.07)",    border: "rgba(96,165,250,0.22)"    },
  success: { icon: CheckCircle,   color: "var(--p-normal-text)",   bg: "rgba(76,175,130,0.07)",    border: "rgba(76,175,130,0.22)"    },
  warning: { icon: AlertTriangle, color: "var(--p-high-text)",     bg: "rgba(255,151,65,0.07)",    border: "rgba(255,151,65,0.22)"    },
  tip:     { icon: Lightbulb,     color: "var(--brand-text)",      bg: "rgba(232,103,43,0.06)",    border: "var(--brand-line)"         },
  ai:      { icon: Sparkles,      color: "var(--brand-text)",      bg: "var(--brand-dim)",         border: "var(--brand-line)"         },
};

const STORAGE_KEY = "flow_dismissed_tips";

function getDismissed() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); }
  catch { return {}; }
}

function setDismissed(id) {
  try {
    const curr = getDismissed();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...curr, [id]: true }));
  } catch {}
}

export function resetTip(id) {
  try {
    const curr = getDismissed();
    delete curr[id];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(curr));
  } catch {}
}

export function resetAllTips() {
  try { localStorage.removeItem(STORAGE_KEY); }
  catch {}
}

export default function ContextualTip({
  id,
  title,
  children,
  variant = "tip",
  action,
  actionLabel,
  permanent = false,  // if true, cannot be dismissed
  compact = false,
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (permanent) { setVisible(true); return; }
    const dismissed = getDismissed();
    setVisible(!dismissed[id]);
  }, [id, permanent]);

  const dismiss = () => {
    setVisible(false);
    if (!permanent) setDismissed(id);
  };

  if (!visible) return null;

  const { icon: Icon, color, bg, border } = VARIANT_MAP[variant] || VARIANT_MAP.tip;

  if (compact) {
    return (
      <div style={{
        display: "flex", alignItems: "flex-start", gap: 7, padding: "7px 10px",
        background: bg, border: `1px solid ${border}`, borderRadius: 5,
        fontSize: 11, color: "var(--t3)", lineHeight: 1.5,
      }}>
        <Icon style={{ width: 11, height: 11, color, flexShrink: 0, marginTop: 1 }} />
        <span style={{ flex: 1 }}>{children}</span>
        {!permanent && (
          <button onClick={dismiss} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--t5)", padding: 0, lineHeight: 1, marginTop: 1 }}>
            <X style={{ width: 10, height: 10 }} />
          </button>
        )}
      </div>
    );
  }

  return (
    <div style={{
      padding: "12px 14px",
      background: bg,
      border: `1px solid ${border}`,
      borderRadius: 6,
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <div style={{ width: 24, height: 24, borderRadius: 4, background: `${color}18`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
          <Icon style={{ width: 13, height: 13, color }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          {title && <p style={{ fontSize: 12, fontWeight: 600, color: "var(--t1)", margin: "0 0 3px", lineHeight: 1.4 }}>{title}</p>}
          <p style={{ fontSize: 12, color: "var(--t3)", margin: 0, lineHeight: 1.6 }}>{children}</p>
          {action && actionLabel && (
            <button onClick={action} style={{
              marginTop: 8, fontSize: 11, fontWeight: 500, color, background: "none",
              border: "none", cursor: "pointer", padding: 0, textDecoration: "underline",
            }}>
              {actionLabel}
            </button>
          )}
        </div>
        {!permanent && (
          <button onClick={dismiss} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--t5)", padding: 2, borderRadius: 3, flexShrink: 0 }}
            title="Dismiss">
            <X style={{ width: 12, height: 12 }} />
          </button>
        )}
      </div>
    </div>
  );
}
