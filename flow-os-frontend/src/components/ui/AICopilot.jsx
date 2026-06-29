import { useState, useRef, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Sparkles, X, Send, ChevronDown, ChevronUp } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { brainApi } from "../../lib/brainApi";
import { EVENT_ACTIVE_ENTITY } from "../../lib/entityContext";

const PAGE_CONTEXT = {
  '/workfeed': 'Daily Workfeed',
  '/dashboard': 'Executive Dashboard',
  '/briefing': 'Daily Briefing',
  '/timeline': 'Operational Timeline',
  '/meetings': 'Meetings',
  '/projects': 'Project Intelligence',
  '/knowledge': 'Knowledge',
  '/inbox': 'Inbox',
  '/search': 'Universal Search',
  '/assistant': 'Workspace Intelligence',
  '/admin': 'Company Overview',
  '/company': 'Team Dashboard'
};

function getPageContext(pathname) {
  // Find the longest matching key that pathname starts with
  const match = Object.keys(PAGE_CONTEXT)
    .filter((key) => pathname.startsWith(key))
    .sort((a, b) => b.length - a.length)[0];
  return match ? PAGE_CONTEXT[match] : pathname;
}

const EXAMPLE_QUESTIONS = [
  "What are my top priorities today?",
  "Summarize recent incidents this week.",
  "What decisions were made in the last sprint?"
];

function EvidenceDisclosure({ evidence }) {
  const [open, setOpen] = useState(false);
  if (!evidence || evidence.length === 0) return null;
  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center gap-1 text-[10px] text-text-muted hover:text-text-secondary transition-colors cursor-pointer select-none"
      >
        {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        Evidence ({evidence.length})
      </button>
      {open && (
        <ul className="mt-1.5 space-y-1 pl-2 border-l border-border-flow/60">
          {evidence.map((item, idx) => (
            <li key={idx} className="text-[10px] text-text-muted leading-relaxed">
              <span className="text-text-secondary">{item.text || item.content || String(item)}</span>
              {item.source && (
                <span className="ml-1 text-flow-purple opacity-70">[{item.source}]</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AssistantMessage({ msg, onActionClick }) {
  return (
    <div className="flex flex-col gap-1 max-w-[88%] self-start">
      <div className="bg-bg-hover border border-border-flow/60 rounded-xl rounded-tl-sm px-3 py-2.5 text-ui-xs text-text-primary leading-relaxed">
        {msg.text}
      </div>

      {msg.confidence != null && (
        <span className="text-[10px] text-text-muted ml-1">
          <span className="bg-flow-purple/10 text-flow-purple border border-flow-purple/20 rounded px-1.5 py-0.5 font-semibold">
            {msg.confidence}% confidence
          </span>
        </span>
      )}

      {msg.evidence && <div className="ml-1"><EvidenceDisclosure evidence={msg.evidence} /></div>}

      {msg.suggestedActions && msg.suggestedActions.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-1 ml-1">
          {msg.suggestedActions.map((action, idx) => (
            <button
              key={idx}
              onClick={() => onActionClick(action)}
              className="text-[10px] px-2.5 py-1 rounded-full border border-flow-purple/30 text-flow-purple bg-flow-purple/5 hover:bg-flow-purple/15 transition-colors cursor-pointer font-medium"
            >
              {action.label || action.title || String(action)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function UserMessage({ msg }) {
  return (
    <div className="flex justify-end">
      <div className="bg-flow-purple/20 border border-flow-purple/25 rounded-xl rounded-tr-sm px-3 py-2.5 text-ui-xs text-text-primary leading-relaxed max-w-[88%]">
        {msg.text}
      </div>
    </div>
  );
}

export default function AICopilot({ entityId = null }) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeEntityId, setActiveEntityId] = useState(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const location = useLocation();
  const navigate = useNavigate();

  const pageContext = getPageContext(location.pathname);

  // Track entity context opened in the EntityContextPanel drawer
  useEffect(() => {
    const handler = (e) => {
      setActiveEntityId(e.detail?.entityId || null);
    };
    window.addEventListener(EVENT_ACTIVE_ENTITY, handler);
    return () => window.removeEventListener(EVENT_ACTIVE_ENTITY, handler);
  }, []);

  // Autoscroll to bottom on new messages
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isOpen]);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Escape key closes the panel (only while open)
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e) => { if (e.key === "Escape") setIsOpen(false); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen]);

  const sendMessage = async (questionText) => {
    const question = (questionText ?? input).trim();
    if (!question || loading) return;

    const userMsg = { id: Date.now(), role: "user", text: question };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const data = await brainApi.copilot({ question, pageContext, entityId: entityId ?? activeEntityId });
      const assistantMsg = {
        id: Date.now() + 1,
        role: "assistant",
        text: data.answer || data.brief || data.response || "I've processed your query.",
        confidence: data.confidence ?? null,
        evidence: data.evidence ?? [],
        suggestedActions: data.suggestedActions ?? []
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      const errorMsg = {
        id: Date.now() + 1,
        role: "assistant",
        text: `Sorry, I couldn't process that right now. ${err.message || "Please try again."}`,
        confidence: null,
        evidence: [],
        suggestedActions: []
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleActionClick = (action) => {
    if (action.route) {
      navigate(action.route);
    }
    setIsOpen(false);
  };

  const handleExampleClick = (question) => {
    setInput(question);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  return (
    <>
      {/* Floating launcher button — hidden while panel is open */}
      <AnimatePresence>
        {!isOpen && (
          <motion.button
            key="copilot-launcher"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            onClick={() => setIsOpen(true)}
            className="fixed bottom-6 right-6 z-40 w-12 h-12 rounded-full bg-flow-purple shadow-lg flex items-center justify-center hover:opacity-90 transition-opacity cursor-pointer"
            aria-label="Open FLOW Copilot"
          >
            <Sparkles className="w-5 h-5 text-white" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Copilot panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            key="copilot-panel"
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.97 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            role="dialog"
            aria-label="FLOW Copilot"
            aria-modal="false"
            className="fixed bottom-6 right-6 z-50 w-[400px] max-w-[calc(100vw-3rem)] h-[600px] max-h-[calc(100vh-3rem)] bg-bg-card border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border-flow/70 flex-shrink-0">
              <div className="flex flex-col gap-0.5">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-flow-purple" />
                  <span className="text-ui-sm font-semibold text-text-primary">FLOW Copilot</span>
                  <span className="text-[10px] text-text-muted bg-bg-hover px-1.5 py-0.5 rounded border border-border-flow/60">
                    {pageContext}
                  </span>
                </div>
                {(entityId ?? activeEntityId) && (
                  <span className="text-[10px] text-flow-purple ml-6">
                    in context: {entityId ?? activeEntityId}
                  </span>
                )}
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 rounded text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors cursor-pointer"
                aria-label="Close Copilot"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Message list */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {messages.length === 0 && !loading ? (
                /* Empty state */
                <div className="flex flex-col items-center justify-center h-full gap-4 text-center pb-4">
                  <div className="w-12 h-12 rounded-full bg-flow-purple/10 border border-flow-purple/20 flex items-center justify-center">
                    <Sparkles className="w-5 h-5 text-flow-purple" />
                  </div>
                  <div>
                    <p className="text-ui-sm font-semibold text-text-primary">Ask me anything about your workspace</p>
                    <p className="text-ui-xs text-text-muted mt-1">I have context from your current page: <span className="text-flow-purple">{pageContext}</span></p>
                  </div>
                  <div className="flex flex-col gap-2 w-full">
                    {EXAMPLE_QUESTIONS.map((q, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleExampleClick(q)}
                        className="text-ui-xs text-text-secondary bg-bg-hover border border-border-flow/60 hover:border-flow-purple/30 hover:text-text-primary rounded-lg px-3 py-2 text-left transition-colors cursor-pointer"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                /* Messages */
                <>
                  {messages.map((msg) =>
                    msg.role === "user" ? (
                      <UserMessage key={msg.id} msg={msg} />
                    ) : (
                      <AssistantMessage key={msg.id} msg={msg} onActionClick={handleActionClick} />
                    )
                  )}
                  {loading && (
                    <div className="flex items-center gap-2 text-ui-xs text-text-muted self-start">
                      <div className="w-4 h-4 rounded-full border-2 border-flow-purple/30 border-t-flow-purple animate-spin" />
                      <span>Thinking…</span>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </>
              )}
            </div>

            {/* Footer input */}
            <div className="px-3 py-3 border-t border-border-flow/70 flex items-center gap-2 flex-shrink-0">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={loading}
                placeholder="Ask about your workspace…"
                aria-label="Ask the Copilot a question"
                className="flex-1 bg-bg-hover border border-border-flow/70 focus:border-flow-purple/50 rounded-lg px-3 py-2 text-ui-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-flow-purple/30 disabled:opacity-50 transition-colors"
              />
              <button
                onClick={() => sendMessage()}
                disabled={loading || !input.trim()}
                className="w-8 h-8 rounded-lg bg-flow-purple flex items-center justify-center hover:opacity-90 disabled:opacity-40 transition-opacity cursor-pointer flex-shrink-0"
                aria-label="Send message"
              >
                <Send className="w-3.5 h-3.5 text-white" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
