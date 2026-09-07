import { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { Zap } from "lucide-react";
import BrainMessage from "./BrainMessage";
import ConversationInput from "./ConversationInput";

const SESSION_KEY = "flow_conversation_v2";

function loadSession() {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || "[]"); }
  catch { return []; }
}

function saveSession(msgs) {
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(msgs.slice(-40))); } catch {}
}

function buildFallback(question) {
  return {
    id:      Date.now() + Math.random(),
    role:    "assistant",
    content: `I received your question about "${question}".\n\nConnect to the FLOW backend to get live workspace intelligence. Your connectors are monitoring GitHub, Calendar, Gmail, and more — start the server to see real-time answers.`,
    actions: [
      { label: "View Timeline →", href: "/timeline" },
      { label: "Check Health →",  href: "/settings?tab=health" },
    ],
    followUps: [],
    tone:     "normal",
  };
}

function normalizeResponse(data, question) {
  // Support both new HIE shape and older flat shape
  return {
    id:              Date.now() + Math.random(),
    role:            "assistant",
    content:         data.answer || data.response || data.brief || data.content || "Request processed.",
    cards:           data.cards           || [],
    actions:         data.actions         || [],
    followUps:       data.followUps       || [],
    followUpQuestion: data.followUpQuestion || null,
    joke:            data.joke            || null,
    microDelight:    data.microDelight    || null,
    tone:            data.tone            || "normal",
    occasion:        data.occasion        || null,
    isEmpty:         data.isEmpty         || false,
    isCasual:        data.isCasual        || false,
    domain:          data.domain          || "general",
  };
}

export default function ConversationThread() {
  const [messages,   setMessages]   = useState(loadSession);
  const [isLoading,  setIsLoading]  = useState(false);
  const [recentDomain, setRecentDomain] = useState("general");
  const bottomRef = useRef(null);

  useEffect(() => { saveSession(messages); }, [messages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const sendMessage = useCallback(async (question) => {
    const userMsg = { id: Date.now() + Math.random(), role: "user", content: question };
    setMessages(prev => [...prev, userMsg]);
    setIsLoading(true);

    const token = localStorage.getItem("flow_os_token") || localStorage.getItem("flow_token");
    const wsId  = localStorage.getItem("flow_os_workspace_id");

    try {
      const res = await fetch("/api/brain/copilot", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
          "workspace-id": wsId || "",
        },
        body: JSON.stringify({ question, pageContext: recentDomain }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      const msg = normalizeResponse(data, question);
      setMessages(prev => [...prev, msg]);
      if (msg.domain) setRecentDomain(msg.domain);

    } catch {
      setMessages(prev => [...prev, buildFallback(question)]);
    } finally {
      setIsLoading(false);
    }
  }, [recentDomain]);

  // Follow-up chip click → inject as a new user message
  const handleFollowUp = useCallback((text) => {
    sendMessage(text);
  }, [sendMessage]);

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <div style={{ flex: 1, overflowY: "auto", padding: "24px", maxWidth: 800, width: "100%", margin: "0 auto" }}>
        {messages.length === 0 && !isLoading && (
          <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", minHeight: 160 }}>
            <p style={{ fontSize: 13, color: "var(--t4)" }}>Ask FLOW anything about your workspace.</p>
          </div>
        )}

        {messages.map((msg, i) => (
          <BrainMessage
            key={msg.id}
            message={msg}
            isLatest={i === messages.length - 1 && msg.role === "assistant"}
            onFollowUp={handleFollowUp}
          />
        ))}

        {isLoading && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ display: "flex", gap: 12, marginBottom: 20 }}>
            <div style={{ width: 26, height: 26, borderRadius: 5, background: "var(--accent-dim)", border: "1px solid var(--accent-line)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2 }}>
              <Zap style={{ width: 12, height: 12, color: "var(--brand)" }} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 4, paddingTop: 8 }}>
              {[0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--t4)", display: "inline-block" }}
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
                />
              ))}
            </div>
          </motion.div>
        )}

        <div ref={bottomRef} />
      </div>

      <div style={{ padding: "8px 24px 20px", borderTop: "1px solid var(--border)", flexShrink: 0, maxWidth: 800, width: "100%", margin: "0 auto" }}>
        <ConversationInput onSubmit={sendMessage} isLoading={isLoading} domain={recentDomain} />
      </div>
    </div>
  );
}
