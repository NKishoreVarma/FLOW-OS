import { useState } from "react";
import { Sparkles, FileSearch } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { useTypewriter } from "../../hooks/useTypewriter";
import InlinePRCard from "./InlinePRCard";
import InlineMeetingCard from "./InlineMeetingCard";
import InlineApprovalCard from "./InlineApprovalCard";
import InlineMetricCard from "./InlineMetricCard";
import ExecutableActionCard from "../execution/ExecutableActionCard";
import MergeConflictCard from "../execution/MergeConflictCard";
import EvidenceCard from "./EvidenceCard";
import ConversationMeta from "./ConversationMeta";
import RecommendedActions from "./RecommendedActions";

function renderCard(card, i, onAction) {
  if (!card?.type) return null;
  switch (card.type) {
    case "pr":       return <InlinePRCard       key={i} pr={card.data}       onAction={onAction} />;
    case "meeting":  return <InlineMeetingCard  key={i} event={card.data} />;
    case "approval": return <InlineApprovalCard key={i} approval={card.data} />;
    case "metric":   return <InlineMetricCard   key={i} {...card.data} />;
    case "execute":  return <ExecutableActionCard key={i} card={card.data} />;
    case "plan":     return <ExecutableActionCard key={i} card={{ title: card.data?.title || "Execute this", recommendation: card.data, summary: "FLOW detected an action. Click to execute it." }} />;
    case "merge_conflict": return <MergeConflictCard key={i} conflict={card.data} />;
    default:         return null;
  }
}

// Raw retrieval counts ("Org Memory: found 10 record(s). Most recent: Acme Corp.")
// are database output, not a briefing. Rewrite them into prose before rendering.
function humanizeDebugText(text) {
  if (typeof text !== "string" || !/found\s+\d+\s+record\(s\)/i.test(text)) return text;
  const found = [];
  const re = /([A-Za-z][\w\s/&-]*?):\s*found\s+(\d+)\s+record\(s\)\.?(?:\s*Most recent:\s*([^.\n]+)\.?)?/gi;
  const cleaned = text.replace(re, (m, label, n, recent) => {
    found.push({ label: label.trim(), n: Number(n), recent: recent?.trim() });
    return "";
  }).replace(/\s{2,}/g, " ").trim();
  if (!found.length) return text;
  const parts = found.map(({ label, n, recent }) => {
    const noun = n === 1 ? "one record" : `${n} records`;
    return recent ? `**${label}** holds ${noun} — most recently *${recent}*` : `**${label}** holds ${noun}`;
  });
  const prose = `Here's what I'm seeing across your workspace. ${parts.map((p) => `${p}.`).join(" ")}`;
  return cleaned ? `${prose}\n\n${cleaned}` : prose;
}

// Unique source labels behind the answer, for the citation bar.
function citationSources(evidence) {
  const seen = new Set();
  for (const e of evidence || []) {
    const raw = e?.source || e?.connector || e?.origin || e?.type;
    if (typeof raw !== "string" || !raw.trim()) continue;
    const label = raw.replace(/[_-]+/g, " ").trim();
    seen.add(label.charAt(0).toUpperCase() + label.slice(1));
  }
  return [...seen].slice(0, 5);
}

// Generate smart follow-up questions from response content when the server doesn't provide them.
function generateFollowUps(content) {
  if (!content || content.length < 60) return [];
  const lc = content.toLowerCase();
  if (lc.includes("pr #") || lc.includes("pull request") || lc.includes("merge")) {
    return ["Who should review this?", "What's the merge risk?", "Draft a PR description"];
  }
  if (lc.includes("meeting") || lc.includes("standup") || lc.includes("calendar")) {
    return ["Prepare the agenda", "Who else is attending?", "Set a reminder"];
  }
  if (lc.includes("deploy") || lc.includes("release") || lc.includes("shipping")) {
    return ["What's the risk level?", "Show deployment history", "Notify the team"];
  }
  if (lc.includes("customer") || lc.includes("churn") || lc.includes("renewal") || lc.includes("account")) {
    return ["Draft an outreach email", "Who owns this account?", "Show account history"];
  }
  if (lc.includes("incident") || lc.includes("outage") || lc.includes("down")) {
    return ["What's the customer impact?", "Who's working on this?", "Draft status update"];
  }
  if (lc.includes("sprint") || lc.includes("jira") || lc.includes("backlog") || lc.includes("ticket")) {
    return ["Show what's blocked", "Who's behind on tasks?", "Pull sprint velocity"];
  }
  return ["Tell me more", "What should I do next?", "Show related activity"];
}

// Prominent action buttons for the proactive opening message.
function OpeningActionBtn({ label, primary, onClick }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "9px 18px",
        borderRadius: 5,
        fontSize: 13,
        fontWeight: primary ? 500 : 400,
        cursor: "pointer",
        transition: "all 120ms",
        border: primary
          ? `1px solid ${hovered ? "#C2551B" : "var(--accent)"}`
          : `1px solid ${hovered ? "var(--line-2)" : "var(--line-1)"}`,
        background: primary
          ? hovered ? "#D4571E" : "var(--accent)"
          : hovered ? "rgba(31,27,22,0.05)" : "transparent",
        color: primary ? "#FFFFFF" : hovered ? "var(--t1)" : "var(--t2)",
      }}
    >
      {label}
    </button>
  );
}

function FollowUpChip({ label, onClick }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={() => onClick(label)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding:      "5px 12px",
        borderRadius:  5,
        border:       `1px solid ${hovered ? "var(--brand-hover-border)" : "var(--border-strong)"}`,
        background:    hovered ? "var(--brand-hover-bg)" : "var(--surface-ghost-2)",
        fontSize:      12,
        fontWeight:    400,
        color:         hovered ? "var(--t2)" : "var(--t3)",
        cursor:        "pointer",
        transition:    "all 120ms",
        textAlign:     "left",
        lineHeight:     1.4,
        letterSpacing: "-0.1px",
      }}
    >
      {label}
    </button>
  );
}

export default function BrainMessage({ message, isLatest, onAction, onFollowUp, onOpenEntity, onOpenEvidence, onNavigate }) {
  // Server-streamed messages arrive token-by-token from the backend, so the client
  // typewriter is disabled for them — the text already animates live.
  const isServerStreamed = message.streamed;
  const isStreaming      = message.streaming;
  const shouldStream    = isLatest && message.role === "assistant" && !isServerStreamed;
  const { displayed }   = useTypewriter(message.content, { enabled: shouldStream, speed: 11 });
  const displayContent  = humanizeDebugText(shouldStream ? displayed : message.content);
  const streamDone      = isServerStreamed ? !isStreaming : (!shouldStream || displayed.length >= (message.content?.length || 0));
  const [evidenceOpen, setEvidenceOpen] = useState(false);

  const explanation = message.explanation || null;
  // Prefer the final explanation evidence; fall back to the evidence streamed early
  // (as soon as it ranked, before the prose finished).
  const evidence    = explanation?.evidence?.length ? explanation.evidence : (message.streamEvidence || []);

  const sources = citationSources(evidence);

  if (message.role === "user") {
    return (
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 24 }}>
        <div style={{
          maxWidth:   480,
          padding:    "12px 16px",
          background: "var(--surface-3)",
          border:     "1px solid var(--line-2)",
          borderRadius: 6,
        }}>
          <p style={{ fontSize: 13, fontWeight: 300, color: "var(--t1)", lineHeight: 1.5, whiteSpace: "pre-wrap", margin: 0 }}>
            {message.content}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
      {/* Avatar — the accent square, matches the logo */}
      <div style={{
        width: 20, height: 20, borderRadius: 0, flexShrink: 0, marginTop: 2,
        background: "var(--accent)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <span style={{ fontFamily: "var(--font-ui)", fontSize: 9, fontWeight: 500, color: "var(--surface-0)", lineHeight: 1 }}>F</span>
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Micro-delight — shown above main response, small and italic */}
        {message.microDelight && streamDone && (
          <div style={{
            display:    "flex",
            alignItems: "center",
            gap:         5,
            marginBottom: 8,
            padding:    "4px 10px",
            background: "var(--brand-muted)",
            borderRadius: 4,
            borderLeft: "2px solid var(--brand-glass-border)",
          }}>
            <Sparkles style={{ width: 10, height: 10, color: "var(--t5)", flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: "var(--t4)", fontStyle: "italic", lineHeight: 1.5 }}>
              {message.microDelight}
            </span>
          </div>
        )}

        {/* Live reasoning status — communicates progress every second while streaming */}
        {isStreaming && message.status && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: displayContent ? 8 : 0 }}>
            <span style={{ display: "inline-flex", gap: 3 }}>
              {[0, 1, 2].map((i) => (
                <span key={i} style={{ width: 4, height: 4, borderRadius: "50%", background: "var(--brand)", animation: "pulse-dot 1s ease-in-out infinite", animationDelay: `${i * 0.18}s` }} />
              ))}
            </span>
            <span style={{ fontSize: 12, color: "var(--t4)", fontStyle: "italic" }}>{message.status}</span>
          </div>
        )}

        {/* Main response — prose, written like a chief of staff. Plain while streaming, markdown when done. */}
        <div style={{ fontSize: 13, fontWeight: 300, color: "var(--t2)", lineHeight: 1.75 }} className="brain-md">
          {streamDone ? (
            <ReactMarkdown
              components={{
                p:          ({ children }) => <p style={{ margin: "0 0 10px", lineHeight: 1.75 }}>{children}</p>,
                h1:         ({ children }) => <h1 style={{ fontSize: 16, fontWeight: 400, margin: "14px 0 6px", color: "var(--t1)" }}>{children}</h1>,
                h2:         ({ children }) => <h2 style={{ fontSize: 15, fontWeight: 400, margin: "12px 0 5px", color: "var(--t1)" }}>{children}</h2>,
                h3:         ({ children }) => <h3 style={{ fontSize: 14, fontWeight: 400, margin: "10px 0 4px", color: "var(--t1)" }}>{children}</h3>,
                ul:         ({ children }) => <ul style={{ margin: "6px 0 10px", paddingLeft: 20 }}>{children}</ul>,
                ol:         ({ children }) => <ol style={{ margin: "6px 0 10px", paddingLeft: 20 }}>{children}</ol>,
                li:         ({ children }) => <li style={{ margin: "3px 0", lineHeight: 1.65 }}>{children}</li>,
                strong:     ({ children }) => <strong style={{ fontWeight: 500, color: "var(--t1)" }}>{children}</strong>,
                em:         ({ children }) => <em style={{ color: "var(--t2)", fontStyle: "italic" }}>{children}</em>,
                code:       ({ inline, children }) => inline
                  ? <code style={{ fontSize: 12, background: "var(--surface-3)", padding: "1px 5px", borderRadius: 3, fontFamily: "var(--font-data)", color: "var(--t2)" }}>{children}</code>
                  : <pre style={{ background: "var(--surface-code)", borderRadius: 5, padding: "10px 14px", overflowX: "auto", margin: "8px 0" }}><code style={{ fontSize: 12, fontFamily: "var(--font-data)", color: "var(--t2)", lineHeight: 1.55 }}>{children}</code></pre>,
                blockquote: ({ children }) => <blockquote style={{ borderLeft: "2px solid var(--accent-line)", margin: "8px 0", paddingLeft: 12, color: "var(--t3)", fontStyle: "italic" }}>{children}</blockquote>,
                a:          ({ href, children }) => <a href={href} target="_blank" rel="noreferrer" style={{ color: "var(--accent-text)", textDecoration: "none" }}>{children}</a>,
                hr:         () => <hr style={{ border: "none", borderTop: "1px solid var(--line-0)", margin: "12px 0" }} />,
              }}
            >
              {displayContent}
            </ReactMarkdown>
          ) : (
            <span style={{ whiteSpace: "pre-wrap" }}>
              {displayContent}
              <span style={{
                display:       "inline-block",
                width:          7,
                height:        "1em",
                background:    "var(--accent)",
                marginLeft:     3,
                verticalAlign: "text-bottom",
                animation:     "pulse-dot 1s ease-in-out infinite",
              }} />
            </span>
          )}
        </div>

        {/* Citation bar — where the answer came from */}
        {streamDone && sources.length > 0 && (
          <div style={{
            display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
            marginTop: 12, paddingTop: 12,
            borderTop: "1px solid var(--line-0)",
          }}>
            <span style={{ fontFamily: "var(--font-data)", fontSize: 10, fontWeight: 300, color: "var(--t4)", letterSpacing: "0.04em" }}>
              Source
            </span>
            {sources.map((s) => (
              <button
                key={s}
                onClick={() => setEvidenceOpen((o) => !o)}
                style={{
                  fontFamily: "var(--font-data)", fontSize: 10, fontWeight: 300,
                  color: "var(--t4)", padding: "2px 7px",
                  background: "var(--surface-3)", border: "1px solid var(--line-1)",
                  borderRadius: 3, cursor: "pointer", transition: "color 80ms",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = "var(--t2)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = "var(--t4)"; }}
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Inline cards */}
        {message.cards?.length > 0 && streamDone && (
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8, maxWidth: 480 }}>
            {message.cards.map((card, i) => renderCard(card, i, onAction))}
          </div>
        )}

        {/* NL Operations Bridge — executable plan detected from copilot response */}
        {message.plan && !message.streaming && (
          <div style={{ marginTop: 12 }}>
            <ExecutableActionCard card={{
              title: message.plan.title || "Execute this",
              recommendation: message.plan,
              summary: "FLOW detected an action in your request. Click to execute it.",
            }} />
          </div>
        )}

        {/* Nav action links */}
        {message.actions?.length > 0 && streamDone && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
            {message.actions.map((action, i) => (
              <a
                key={i}
                href={action.href || "#"}
                style={{
                  padding:     "5px 12px",
                  borderRadius: 4,
                  border:      "1px solid var(--border-strong)",
                  fontSize:     12,
                  color:       "var(--t3)",
                  textDecoration: "none",
                  transition:  "all 100ms",
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--brand-hover-border)"; e.currentTarget.style.color = "var(--t1)"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border-strong)"; e.currentTarget.style.color = "var(--t3)"; }}
              >
                {action.label}
              </a>
            ))}
          </div>
        )}

        {/* Recommended actions — appear EARLY (from the stream) before the prose
            finishes, then reconcile with the explanation's actions when done. */}
        {(() => {
          const acts = explanation?.recommendedActions?.length ? explanation.recommendedActions : (message.streamActions || []);
          return acts.length > 0 ? (
            <RecommendedActions actions={acts} explanation={explanation} onFollowUp={onFollowUp} onNavigate={onNavigate} />
          ) : null;
        })()}

        {/* Early evidence toggle — sources appear while the answer is still streaming */}
        {isStreaming && !explanation && evidence.length > 0 && (
          <button
            onClick={() => setEvidenceOpen((o) => !o)}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 10, padding: "3px 9px", borderRadius: 4, fontSize: 11, fontWeight: 500, cursor: "pointer", background: "var(--surface-ghost-3)", border: "1px solid var(--border)", color: "var(--t4)" }}
          >
            <FileSearch style={{ width: 11, height: 11 }} /> {evidence.length} source{evidence.length !== 1 ? "s" : ""} {evidenceOpen ? "▲" : "▾"}
          </button>
        )}

        {/* Evidence cards — expandable sources behind the answer (early or final) */}
        {evidence.length > 0 && evidenceOpen && (
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6, maxWidth: 520 }}>
            {evidence.map((e, i) => (
              <EvidenceCard key={e.ref || i} evidence={e} onOpen={onOpenEvidence} />
            ))}
          </div>
        )}

        {/* Explainability meta — confidence / trust / evidence / shortcuts */}
        {explanation && streamDone && (
          <ConversationMeta
            explanation={explanation}
            evidenceOpen={evidenceOpen}
            onToggleEvidence={() => setEvidenceOpen(o => !o)}
            onFollowUp={onFollowUp}
            onOpenEntity={onOpenEntity}
          />
        )}

        {/* Opening action buttons — FLOW-initiated conversation starters */}
        {message.isOpening && streamDone && onFollowUp && (
          <div style={{ display: "flex", gap: 8, marginTop: 20, flexWrap: "wrap" }}>
            <OpeningActionBtn
              label="Start Briefing"
              primary
              onClick={() => onFollowUp("Give me my executive briefing for today")}
            />
            <OpeningActionBtn
              label="Show Priorities"
              onClick={() => onFollowUp("What are my top priorities right now?")}
            />
            <OpeningActionBtn
              label="Ask Anything"
              onClick={() => window.dispatchEvent(new CustomEvent("flow:focus-input"))}
            />
          </div>
        )}

        {/* Follow-up chips — from server or generated from response content */}
        {(() => {
          const fus = message.followUps?.length
            ? message.followUps
            : (streamDone && !message.isOpening ? generateFollowUps(message.content) : []);
          return fus.length > 0 && streamDone && onFollowUp ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 14 }}>
              {fus.map((fu, i) => (
                <FollowUpChip key={i} label={fu} onClick={onFollowUp} />
              ))}
            </div>
          ) : null;
        })()}

        {/* Optional joke */}
        {message.joke && streamDone && (
          <div style={{
            marginTop:  12,
            padding:    "8px 12px",
            background: "var(--brand-muted)",
            borderRadius: 4,
            border:     "1px solid var(--brand-muted-border)",
          }}>
            <span style={{ fontSize: 12, color: "var(--t3)", fontStyle: "italic" }}>
              {message.joke}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
