import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { sourceDotColor } from "../../lib/liveEvents";

// Toasts pop for real integration messages (Slack, Gmail, GitHub, Jira) and
// meaningful business events (incidents, approvals). Never system telemetry.

const SOURCE_BORDER = {
  Slack:    "#1E7F4F",
  Gmail:    "#2A5FA8",
  GitHub:   "rgba(31,27,22,0.4)",
  Jira:     "var(--accent)",
  Calendar: "#1E7F4F",
};

function FlowToast({ event, onDismiss }) {
  const critical = event.type === "critical";
  const source = event.source || "FLOW";
  const borderColor = critical ? "var(--crit)" : SOURCE_BORDER[source] || "var(--line-2)";
  const dotColor = sourceDotColor(source, { critical });

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -10, scale: 0.97 }}
      animate={{ opacity: 1, y: 0,  scale: 1 }}
      exit={{    opacity: 0, y: -6, scale: 0.97, transition: { duration: 0.18 } }}
      transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
      onClick={() => onDismiss(event.id)}
      style={{
        width:        300,
        background:   "var(--surface-2)",
        border:       "1px solid var(--line-2)",
        borderLeft:   `2px solid ${borderColor}`,
        borderRadius:  6,
        padding:      "12px 14px",
        cursor:       "pointer",
        position:     "relative",
        overflow:     "hidden",
        boxShadow:    "0 8px 32px rgba(31,27,22,0.12)",
        fontFamily:   "var(--font-ui)",
      }}
    >
      {/* Header — source + time */}
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 5 }}>
        <span style={{
          width: 5, height: 5, borderRadius: "50%", flexShrink: 0,
          background: dotColor,
          ...(critical ? { animation: "pulse-dot 1s ease-in-out infinite" } : {}),
        }} />
        <span style={{
          fontFamily: "var(--font-data)", fontSize: 10, fontWeight: 300,
          color: "var(--t4)", textTransform: "uppercase", letterSpacing: "0.06em", flex: 1,
        }}>
          {source}
        </span>
        <span style={{ fontFamily: "var(--font-data)", fontSize: 10, fontWeight: 300, color: "var(--t5)" }}>
          just now
        </span>
      </div>

      <div style={{ fontSize: 12, fontWeight: 400, color: "var(--t1)", lineHeight: 1.4, marginBottom: event.body || event.action ? 3 : 0 }}>
        {event.title}
      </div>

      {event.body && (
        <div style={{ fontSize: 11, fontWeight: 300, color: "var(--t3)", lineHeight: 1.45, marginBottom: event.action ? 8 : 0 }}>
          {event.body}
        </div>
      )}

      {event.action && (
        <button
          onClick={e => { e.stopPropagation(); event.action.onClick(); onDismiss(event.id); }}
          style={{
            fontFamily:  "var(--font-data)",
            fontSize:     10, fontWeight: 300,
            color:       "var(--accent-text)",
            padding:     "3px 8px",
            background:  "var(--accent-dim)",
            border:      "1px solid var(--accent-line)",
            borderRadius: 3,
            cursor:      "pointer",
            transition:  "background 80ms",
          }}
          onMouseEnter={e => { e.currentTarget.style.background = "rgba(232,103,43,0.14)"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "var(--accent-dim)"; }}
        >
          {event.action.label} ↗
        </button>
      )}

      {/* Auto-dismiss progress bar */}
      <motion.div
        initial={{ scaleX: 1, originX: 0 }}
        animate={{ scaleX: 0 }}
        transition={{ duration: 5, ease: "linear" }}
        style={{
          position:   "absolute",
          bottom:      0, left: 0, right: 0,
          height:      1.5,
          background: "var(--accent)",
          opacity:     0.35,
        }}
      />
    </motion.div>
  );
}

export function ToastContainer({ toasts, onDismiss }) {
  return (
    <div style={{
      position:      "fixed",
      top:            14, right: 14,
      zIndex:         9999,
      display:        "flex",
      flexDirection:  "column",
      gap:             6,
      pointerEvents:  "none",
    }}>
      <AnimatePresence mode="popLayout">
        {toasts.map(t => (
          <div key={t.id} style={{ pointerEvents: "all" }}>
            <FlowToast event={t} onDismiss={onDismiss} />
          </div>
        ))}
      </AnimatePresence>
    </div>
  );
}

export function useFlowToasts() {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((event) => {
    setToasts(prev => [event, ...prev].slice(0, 4));
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== event.id));
    }, 5200);
  }, []);

  const dismissToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return { toasts, addToast, dismissToast };
}
