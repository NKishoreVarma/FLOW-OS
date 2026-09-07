import { useState, useRef, useEffect } from "react";
import { ArrowUp, Loader2, X } from "lucide-react";

// ─── Slash commands ───────────────────────────────────────────────────────────

const SLASH_COMMANDS = [
  { cmd: "/brief",       label: "Executive briefing",  desc: "Your morning executive brief",       question: "Give me my executive briefing for today" },
  { cmd: "/priorities",  label: "Today's priorities",  desc: "What needs your attention first",    question: "What are my top priorities right now?" },
  { cmd: "/standup",     label: "Prepare standup",     desc: "Summarize for the team",             question: "Prepare me for standup" },
  { cmd: "/review",      label: "Pull requests",       desc: "PRs waiting for review",             question: "Show me pull requests that need review" },
  { cmd: "/meetings",    label: "Upcoming meetings",   desc: "Your schedule for today",            question: "What meetings do I have today?" },
  { cmd: "/engineering", label: "Engineering status",  desc: "Team velocity and code health",      question: "What is the engineering team status?" },
  { cmd: "/team",        label: "Team health",         desc: "People and capacity overview",       question: "How is the team doing overall?" },
  { cmd: "/deployment",  label: "Deployment status",   desc: "Recent and upcoming deploys",        question: "What is the deployment status?" },
  { cmd: "/incidents",   label: "Open incidents",      desc: "Active issues and risk signals",     question: "Are there any open incidents I should know about?" },
  { cmd: "/customers",   label: "Customer health",     desc: "Accounts at risk or pending action", question: "Which customers need attention today?" },
];

// ─── Quick chip sets by conversation state ────────────────────────────────────

const FRESH_CHIPS = [
  "What's urgent today?",
  "Prepare for standup",
  "Review open PRs",
  "Check team health",
];
const RETURNING_CHIPS = [
  "What changed since we last spoke?",
  "Any new incidents?",
  "Follow up on earlier items",
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function ContextChip({ label, onRemove }) {
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 3,
      fontFamily: "var(--font-data)",
      fontSize: 10,
      fontWeight: 300,
      color: "var(--accent-text)",
      background: "var(--accent-dim)",
      border: "1px solid var(--accent-line)",
      borderRadius: 3,
      padding: "2px 5px 2px 7px",
      userSelect: "none",
    }}>
      {label}
      <button
        onClick={onRemove}
        aria-label={`Remove ${label}`}
        style={{
          background: "none", border: "none", padding: "0 1px",
          cursor: "pointer", color: "var(--accent-text)", opacity: 0.5,
          display: "flex", alignItems: "center", lineHeight: 1,
        }}
      >
        <X style={{ width: 9, height: 9 }} />
      </button>
    </span>
  );
}

function QuickChip({ label, onClick, disabled }) {
  const [h, setH] = useState(false);
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        fontFamily: "var(--font-data)",
        fontSize: 10,
        fontWeight: 300,
        padding: "4px 10px",
        background: h ? "var(--accent-dim)" : "transparent",
        border: `1px solid ${h ? "var(--accent-line)" : "var(--line-1)"}`,
        borderRadius: 3,
        color: h ? "var(--accent-text)" : "var(--t4)",
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "all 80ms",
        whiteSpace: "nowrap",
        opacity: disabled ? 0.4 : 1,
      }}
    >
      {label}
    </button>
  );
}

function SlashCommandItem({ cmd, active, onSelect }) {
  return (
    <button
      onClick={() => onSelect(cmd)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        width: "100%",
        padding: "8px 12px",
        background: active ? "var(--accent-dim)" : "transparent",
        border: "none",
        borderLeft: `2px solid ${active ? "var(--accent)" : "transparent"}`,
        cursor: "pointer",
        textAlign: "left",
        transition: "background 60ms",
      }}
    >
      <span style={{
        fontFamily: "var(--font-data)",
        fontSize: 11,
        fontWeight: 300,
        color: active ? "var(--accent-text)" : "var(--t3)",
        minWidth: 90,
        flexShrink: 0,
      }}>
        {cmd.cmd}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 12, fontWeight: 400, color: "var(--t1)", display: "block" }}>
          {cmd.label}
        </span>
        <span style={{ fontSize: 11, fontWeight: 300, color: "var(--t4)", fontFamily: "var(--font-data)" }}>
          {cmd.desc}
        </span>
      </span>
    </button>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function ConversationInput({
  onSubmit,
  isLoading,
  contextChips = [],
  onClearChip,
  hasConversation = false,
}) {
  const [value, setValue]         = useState("");
  const [focused, setFocused]     = useState(false);
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashIdx, setSlashIdx]   = useState(0);
  const textareaRef               = useRef(null);
  const slashRef                  = useRef(null);

  // Focus from external events (e.g. "Ask Anything" button in opening message)
  useEffect(() => {
    const h = () => textareaRef.current?.focus();
    window.addEventListener("flow:focus-input", h);
    return () => window.removeEventListener("flow:focus-input", h);
  }, []);

  // Auto-height textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [value]);

  // Close slash palette when clicking outside
  useEffect(() => {
    if (!slashOpen) return;
    const h = (e) => {
      if (slashRef.current && !slashRef.current.contains(e.target) && e.target !== textareaRef.current) {
        setSlashOpen(false);
      }
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [slashOpen]);

  function handleChange(e) {
    const v = e.target.value;
    setValue(v);
    if (v === "/" || (v.startsWith("/") && !v.includes(" "))) {
      setSlashOpen(true);
      setSlashIdx(0);
    } else {
      setSlashOpen(false);
    }
  }

  const slashQuery   = value.startsWith("/") && !value.includes(" ") ? value.slice(1).toLowerCase() : "";
  const filteredCmds = SLASH_COMMANDS.filter(c =>
    !slashQuery ||
    c.cmd.slice(1).startsWith(slashQuery) ||
    c.label.toLowerCase().includes(slashQuery)
  );

  function selectSlashCommand(cmd) {
    setValue("");
    setSlashOpen(false);
    onSubmit(cmd.question);
    textareaRef.current?.focus();
  }

  function handleSubmit(text) {
    const q = (text || value).trim();
    if (!q || isLoading) return;
    onSubmit(q);
    setValue("");
    setSlashOpen(false);
  }

  function handleKeyDown(e) {
    if (slashOpen && filteredCmds.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSlashIdx(i => Math.min(i + 1, filteredCmds.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSlashIdx(i => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        selectSlashCommand(filteredCmds[slashIdx]);
        return;
      }
      if (e.key === "Escape") {
        setSlashOpen(false);
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(value);
    }
  }

  const hasValue = Boolean(value.trim());
  const chips    = hasConversation ? RETURNING_CHIPS : FRESH_CHIPS;
  const placeholder = slashOpen
    ? "Type a command…"
    : focused
      ? "Ask FLOW, or type / for commands…"
      : "Message FLOW…";

  return (
    <div style={{ width: "100%", position: "relative" }}>
      {/* Slash command palette */}
      {slashOpen && filteredCmds.length > 0 && (
        <div
          ref={slashRef}
          style={{
            position: "absolute",
            bottom: "calc(100% + 6px)",
            left: 0, right: 0,
            background: "var(--surface-4)",
            border: "1px solid var(--line-1)",
            borderRadius: 7,
            boxShadow: "0 8px 32px rgba(31,27,22,0.10)",
            overflow: "hidden",
            zIndex: 100,
          }}
        >
          <div style={{
            padding: "8px 12px 5px",
            fontFamily: "var(--font-data)",
            fontSize: 9,
            fontWeight: 300,
            color: "var(--t4)",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            borderBottom: "1px solid var(--line-0)",
          }}>
            Commands
          </div>
          {filteredCmds.slice(0, 8).map((cmd, i) => (
            <SlashCommandItem
              key={cmd.cmd}
              cmd={cmd}
              active={i === slashIdx}
              onSelect={selectSlashCommand}
            />
          ))}
          <div style={{
            padding: "6px 12px",
            fontFamily: "var(--font-data)",
            fontSize: 9,
            fontWeight: 300,
            color: "var(--t5)",
            borderTop: "1px solid var(--line-0)",
          }}>
            ↑↓ navigate · ↵ select · Esc dismiss
          </div>
        </div>
      )}

      {/* Context chips — active entities from the conversation */}
      {contextChips.length > 0 && (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 6 }}>
          {contextChips.map(chip => (
            <ContextChip key={chip} label={chip} onRemove={() => onClearChip?.(chip)} />
          ))}
        </div>
      )}

      {/* Input field */}
      <div style={{
        position: "relative",
        display: "flex",
        alignItems: "flex-end",
        gap: 8,
        background: focused ? "var(--surface-3)" : "var(--surface-2)",
        border: `1px solid ${focused ? "var(--accent-line)" : "var(--line-2)"}`,
        borderRadius: 6,
        padding: "12px 44px 12px 16px",
        transition: "border-color 180ms, background 180ms",
      }}>
        <textarea
          ref={textareaRef}
          data-flow-input
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={placeholder}
          rows={1}
          disabled={isLoading}
          style={{
            flex: 1,
            background: "transparent",
            border: "none",
            outline: "none",
            fontSize: 13,
            fontWeight: 300,
            color: "var(--t1)",
            resize: "none",
            lineHeight: 1.5,
            minHeight: 20,
            maxHeight: 160,
            overflowY: "auto",
            fontFamily: "var(--font-ui)",
          }}
        />
        <style>{`[data-flow-input]::placeholder { color: var(--t5); font-size: 13px; }`}</style>

        <button
          onClick={() => handleSubmit(value)}
          disabled={!hasValue || isLoading}
          aria-label="Send"
          style={{
            position: "absolute",
            right: 12, bottom: 10,
            width: 28, height: 28,
            borderRadius: 4,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: hasValue && !isLoading ? "var(--accent)" : "rgba(31,27,22,0.06)",
            border: "none",
            cursor: hasValue && !isLoading ? "pointer" : "not-allowed",
            color: hasValue && !isLoading ? "var(--surface-0)" : "var(--t5)",
            transition: "background 100ms",
          }}
        >
          {isLoading
            ? <Loader2 style={{ width: 12, height: 12, animation: "spin 1s linear infinite" }} />
            : <ArrowUp style={{ width: 12, height: 12 }} />
          }
        </button>
      </div>

      {/* Quick chips + keyboard hint */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 6 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
          {chips.map(chip => (
            <QuickChip key={chip} label={chip} onClick={() => handleSubmit(chip)} disabled={isLoading} />
          ))}
        </div>
        <span style={{
          fontFamily: "var(--font-data)",
          fontSize: 9,
          fontWeight: 300,
          color: "var(--t5)",
          letterSpacing: "0.03em",
          flexShrink: 0,
          marginLeft: 8,
        }}>
          / for commands · ↵ to send
        </span>
      </div>
    </div>
  );
}
