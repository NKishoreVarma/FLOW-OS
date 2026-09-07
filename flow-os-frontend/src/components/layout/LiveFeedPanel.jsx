import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { useWebSocket } from "../../hooks/useWebSocket";
import { useWorkspaceState } from "../../hooks/useWorkspaceState";
import { isIntegrationEvent, eventSource, eventTitle, sourceDotColor, isCriticalEvent } from "../../lib/liveEvents";

function timeSince(ts) {
  const d = Date.now() - ts;
  if (d < 60000)    return "just now";
  if (d < 3600000)  return `${Math.floor(d / 60000)}m ago`;
  if (d < 86400000) return `${Math.floor(d / 3600000)}h ago`;
  if (d < 604800000) return `${Math.floor(d / 86400000)}d ago`;
  return `${Math.floor(d / 604800000)}w ago`;
}

// The live panel shows ONE category: real messages from real integrations.
// Slack messages, Gmail previews, GitHub PR updates, Jira changes. Never system telemetry.

function FeedEvent({ event, prominent = false }) {
  const [hovered, setHovered] = useState(false);
  const navigate = useNavigate();
  // Real event time (commit author date, calendar start, etc.), not when FLOW
  // received it. Normalized once in the WS hook as realTs; payload is the fallback.
  const realTs   = event.realTs || event.payload?.ts || event.payload?.timestamp;
  const ts       = realTs && !Number.isNaN(new Date(realTs).getTime()) ? new Date(realTs).getTime() : Math.floor(event.id);
  const source   = eventSource(event);
  const critical = isCriticalEvent(event);
  const title    = eventTitle(event);
  const subtitle = event.payload?.detail || event.payload?.subtitle || "";

  function ask() {
    const q = `Tell me more about: ${title}`;
    window.dispatchEvent(new CustomEvent("flow:ask-brain", { detail: { question: q } }));
    sessionStorage.setItem("flow_pending_ask", q);
    navigate("/brain");
  }

  return (
    <motion.div
      initial={prominent ? { opacity: 0, x: 10 } : false}
      animate={prominent ? { opacity: 1, x: 0 } : false}
      transition={{ duration: 0.18, ease: "easeOut" }}
      onClick={ask}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 9,
        padding: "10px 16px",
        cursor: "pointer",
        background: hovered ? "rgba(31,27,22,0.04)" : "transparent",
        borderBottom: "1px solid var(--line-0)",
        transition: "background 80ms",
      }}
    >
      <span style={{
        width: 5, height: 5, borderRadius: "50%",
        background: sourceDotColor(source, { critical }),
        marginTop: 5, flexShrink: 0,
        opacity: prominent ? 1 : 0.55,
        ...(critical ? { animation: "pulse-dot 1s ease-in-out infinite" } : {}),
      }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 11,
          fontWeight: 400,
          color: prominent ? (hovered ? "var(--t1)" : "var(--t2)") : "var(--t3)",
          lineHeight: 1.45,
          marginBottom: 2,
          overflow: "hidden", textOverflow: "ellipsis",
          display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
          transition: "color 100ms",
        }}>
          {title}
        </div>
        {subtitle && subtitle !== title && (
          <div style={{
            fontSize: 10.5, fontWeight: 300, color: "var(--t4)", lineHeight: 1.4, marginBottom: 3,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            “{subtitle}”
          </div>
        )}
        <div style={{ fontFamily: "var(--font-data)", fontSize: 10, fontWeight: 300, color: "var(--t4)" }}>
          {source} · {timeSince(ts)}
        </div>
      </div>
    </motion.div>
  );
}

function SectionLabel({ label }) {
  return (
    <div style={{
      fontFamily: "var(--font-data)",
      fontSize: 9,
      fontWeight: 300,
      textTransform: "uppercase",
      letterSpacing: "0.1em",
      color: "var(--t5)",
      padding: "10px 16px 4px",
    }}>
      {label}
    </div>
  );
}

const DEMO = [
  { id: Date.now() - 45000,   type: "GITHUB_PR_UPDATED", data: { text: "Rahul commented on PR #447 — \"LGTM, merging\"", source: "GitHub" } },
  { id: Date.now() - 120000,  type: "EMAIL_RECEIVED",    data: { text: "Sarah emailed TechCorp's VP — following up on the proposal", source: "Gmail" } },
  { id: Date.now() - 240000,  type: "SLACK_MESSAGE",     data: { text: "#engineering: deploy complete — staging is live", source: "Slack" } },
  { id: Date.now() - 1080000, type: "JIRA_ISSUE_CREATED",data: { text: "Marcus opened FLOW-2847 — payment bug, P1", source: "Jira" } },
  { id: Date.now() - 3600000, type: "MEETING_ENDED",     data: { text: "Standup ended — 8 action items captured", source: "Calendar" } },
];

export default function LiveFeedPanel({ isOpen, onToggle }) {
  const { events: wsEvents } = useWebSocket();
  const wsState = useWorkspaceState();
  const now = Date.now();

  const allEvents = useMemo(() => {
    const real = wsEvents.filter(isIntegrationEvent);
    if (real.length > 0) return [...real].reverse().slice(0, 40);
    // Only show demo personas in demo mode — never for real workspaces.
    return wsState.workspaceMode === 'demo' ? DEMO : [];
  }, [wsEvents, wsState.workspaceMode]);

  // Real event time (from the source, e.g. commit date) — falls back to receipt time.
  const evMs = (e) => {
    const ts = e.realTs || e.payload?.ts || e.payload?.timestamp;
    const t = ts ? new Date(ts).getTime() : NaN;
    return Number.isNaN(t) ? Math.floor(e.id) : t;
  };

  const grouped = useMemo(() => {
    const oneHour = now - 60 * 60 * 1000;
    const oneDay  = now - 24 * 60 * 60 * 1000;
    return {
      live:    allEvents.filter(e => evMs(e) > oneHour),
      earlier: allEvents.filter(e => evMs(e) <= oneHour && evMs(e) > oneDay),
      older:   allEvents.filter(e => evMs(e) <= oneDay),
    };
  }, [allEvents, now]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.aside
          key="live-panel"
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: 260, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          style={{
            display: "flex", flexDirection: "column",
            height: "100vh",
            background: "var(--surface-1)",
            borderLeft: "1px solid var(--line-0)",
            flexShrink: 0, overflow: "hidden",
            minWidth: isOpen ? 260 : 0,
            fontFamily: "var(--font-ui)",
          }}
        >
          {/* Header */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "14px 16px",
            borderBottom: "1px solid var(--line-0)",
            flexShrink: 0,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{
                fontFamily: "var(--font-data)",
                fontSize: 10, fontWeight: 300,
                letterSpacing: "0.08em", textTransform: "uppercase",
                color: "var(--t4)",
              }}>
                Live
              </span>
              <span style={{
                width: 5, height: 5, borderRadius: "50%",
                background: "var(--ok)",
                animation: "pulse-dot 2.5s ease-in-out infinite",
              }} />
            </div>
            <button
              onClick={onToggle}
              aria-label="Close live feed"
              style={{
                width: 20, height: 20, borderRadius: 3,
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "var(--t4)", background: "none", border: "none", cursor: "pointer",
                transition: "color 100ms, background 100ms",
              }}
              onMouseEnter={e => { e.currentTarget.style.color = "var(--t2)"; e.currentTarget.style.background = "rgba(31,27,22,0.06)"; }}
              onMouseLeave={e => { e.currentTarget.style.color = "var(--t4)"; e.currentTarget.style.background = "none"; }}
            >
              <X style={{ width: 11, height: 11 }} />
            </button>
          </div>

          {/* Events */}
          <div style={{ flex: 1, overflowY: "auto" }}>
            {grouped.live.length > 0 && (
              <>
                <SectionLabel label="Now" />
                {grouped.live.map(ev => <FeedEvent key={ev.id} event={ev} prominent />)}
              </>
            )}
            {grouped.earlier.length > 0 && (
              <>
                <SectionLabel label="Earlier" />
                {grouped.earlier.map(ev => <FeedEvent key={ev.id} event={ev} />)}
              </>
            )}
            {grouped.older.length > 0 && (
              <>
                <SectionLabel label="Yesterday" />
                {grouped.older.map(ev => <FeedEvent key={ev.id} event={ev} />)}
              </>
            )}
            {allEvents.length === 0 && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 120, padding: "0 20px" }}>
                <p style={{ fontSize: 12, fontWeight: 300, color: "var(--t3)", textAlign: "center", lineHeight: 1.6 }}>
                  {wsState.workspacePhase !== 'READY'
                    ? "Connect your tools first — live activity from GitHub, Gmail, and Jira will appear here."
                    : "Quiet right now. Messages from GitHub, Gmail, and Jira appear here as they arrive."
                  }
                </p>
              </div>
            )}
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
