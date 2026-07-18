import { useState, useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  X, Sparkles, Clock, Copy, Check, ChevronDown, Brain,
  AlertTriangle, Mail, GitBranch, Briefcase, Calendar, Shield,
  MessageSquare, FileText, Activity, ArrowRight, CheckCircle,
  History, Link2, Zap,
} from "lucide-react";
import { useToast } from "./ToastProvider";

const SOURCE_CFG = {
  github:   { Icon: GitBranch,     color: "#e6edf3",  bg: "rgba(230,237,243,0.06)", label: "GitHub"   },
  gmail:    { Icon: Mail,          color: "#EA4335",  bg: "rgba(234,67,53,0.10)",   label: "Gmail"    },
  slack:    { Icon: MessageSquare, color: "#E01E5A",  bg: "rgba(224,30,90,0.10)",   label: "Slack"    },
  jira:     { Icon: Briefcase,     color: "#0052CC",  bg: "rgba(0,82,204,0.10)",    label: "Jira"     },
  calendar: { Icon: Calendar,      color: "#34A853",  bg: "rgba(52,168,83,0.10)",   label: "Calendar" },
  vault:    { Icon: Shield,        color: "#8b5cf6",  bg: "rgba(139,92,246,0.10)",  label: "Vault"    },
  notion:   { Icon: FileText,      color: "#94a3b8",  bg: "rgba(148,163,184,0.08)", label: "Notion"   },
  default:  { Icon: Activity,      color: "#94a3b8",  bg: "rgba(148,163,184,0.05)", label: "System"   },
};

const PRIORITY_CFG = {
  CRITICAL: { label: "CRITICAL", color: "var(--p-critical-text)", bg: "rgba(255,87,87,0.08)",   border: "rgba(255,87,87,0.28)",   bar: "var(--p-critical)"  },
  P1:       { label: "P1",       color: "var(--p-high-text)",     bg: "rgba(255,151,65,0.08)",  border: "rgba(255,151,65,0.28)",  bar: "var(--p-high)"      },
  P2:       { label: "P2",       color: "var(--p-info-text)",     bg: "rgba(96,165,250,0.08)",  border: "rgba(96,165,250,0.28)",  bar: "var(--p-info)"      },
  P3:       { label: "P3",       color: "var(--t5)",              bg: "rgba(31,27,22,0.05)", border: "rgba(31,27,22,0.10)", bar: "var(--t5)"          },
};

const RELATED_ICON = { meeting: Calendar, email: Mail, slack: MessageSquare, jira: Briefcase, github: GitBranch, decision: Shield, incident: AlertTriangle, vault: Shield, gmail: Mail, default: FileText };

const TIMELINE_CFG = {
  ai:      { color: "var(--brand-text)",    dot: "var(--brand)",     Icon: Brain         },
  created: { color: "var(--t5)",            dot: "rgba(31,27,22,0.20)", Icon: Activity },
  updated: { color: "var(--p-high-text)",   dot: "var(--p-high)",    Icon: AlertTriangle },
  action:  { color: "var(--p-normal-text)", dot: "var(--p-normal)",  Icon: CheckCircle   },
};

const PRIMARY_EXEC = {
  critical: { bg: "rgba(255,87,87,0.12)",   color: "var(--p-critical-text)", border: "rgba(255,87,87,0.28)",   hover: "rgba(255,87,87,0.20)"   },
  warning:  { bg: "rgba(255,151,65,0.12)",  color: "var(--p-high-text)",     border: "rgba(255,151,65,0.28)",  hover: "rgba(255,151,65,0.20)"  },
  purple:   { bg: "rgba(232,103,43,0.12)", color: "var(--brand-text)",      border: "rgba(232,103,43,0.28)", hover: "rgba(232,103,43,0.20)" },
};

function SectionHead({ label, icon: Icon, collapsible, open, onToggle }) {
  return (
    <button
      onClick={() => collapsible && onToggle?.()}
      style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, cursor: collapsible ? "pointer" : "default", background: "none", border: "none", padding: 0 }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
        {Icon && <Icon style={{ width: 11, height: 11, color: "var(--t5)" }} />}
        <span style={{ fontSize: 9, fontWeight: 500, color: "var(--t5)", textTransform: "uppercase", letterSpacing: "0.10em" }}>{label}</span>
      </div>
      {collapsible && <ChevronDown style={{ width: 11, height: 11, color: "var(--t5)", transform: open ? "rotate(180deg)" : "none", transition: "transform 150ms" }} />}
    </button>
  );
}

function Section({ label, icon, children, collapsible = false, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <SectionHead label={label} icon={icon} collapsible={collapsible} open={open} onToggle={() => setOpen(p => !p)} />
      {(!collapsible || open) && children}
    </div>
  );
}

function ConfidenceBar({ value }) {
  const [width, setWidth] = useState(0);
  useEffect(() => { const t = setTimeout(() => setWidth(value), 300); return () => clearTimeout(t); }, [value]);
  const color = value >= 90 ? "var(--p-normal)" : value >= 75 ? "var(--p-high)" : "var(--p-critical)";
  const textColor = value >= 90 ? "var(--p-normal-text)" : value >= 75 ? "var(--p-high-text)" : "var(--p-critical-text)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ flex: 1, height: 3, background: "rgba(31,27,22,0.06)", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ height: "100%", background: color, borderRadius: 2, width: `${width}%`, transition: "width 0.8s cubic-bezier(0.16,1,0.3,1)" }} />
      </div>
      <span style={{ fontSize: 11, fontWeight: 500, color: textColor }}>{value}%</span>
    </div>
  );
}

function ImpactChip({ impact }) {
  if (!impact) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      <span style={{ fontSize: 10, color: "var(--t4)" }}>{impact.metric}</span>
      <span style={{ fontSize: 11, fontWeight: 500, color: "var(--p-high-text)" }}>{impact.from}</span>
      <ArrowRight style={{ width: 9, height: 9, color: "var(--t5)" }} />
      <span style={{ fontSize: 11, fontWeight: 500, color: "var(--p-normal-text)" }}>{impact.to}</span>
      {impact.numeric && impact.delta > 0 && (
        <span style={{ fontSize: 8, fontWeight: 500, color: "var(--p-normal-text)", background: "rgba(76,175,130,0.10)", border: "1px solid rgba(76,175,130,0.22)", padding: "1px 5px", borderRadius: 10 }}>↑{impact.delta}pts</span>
      )}
    </div>
  );
}

function DraftEditor({ draft }) {
  const [text, setText] = useState(draft.content);
  const [copied, setCopied] = useState(false);
  const [focused, setFocused] = useState(false);
  const { showToast } = useToast();

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    showToast("Copied to clipboard", "success");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 9, fontWeight: 500, color: "var(--t5)", textTransform: "uppercase", letterSpacing: "0.10em" }}>{draft.label}</span>
        <button
          onClick={handleCopy}
          style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "var(--brand-text)", background: "none", border: "none", cursor: "pointer" }}
        >
          {copied ? <Check style={{ width: 11, height: 11 }} /> : <Copy style={{ width: 11, height: 11 }} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      {draft.editable ? (
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          rows={7}
          style={{ width: "100%", background: "rgba(31,27,22,0.045)", border: `1px solid ${focused ? "rgba(232,103,43,0.40)" : "var(--border-strong)"}`, borderRadius: 4, padding: "10px 12px", fontSize: 11, color: "var(--t1)", lineHeight: 1.6, resize: "none", outline: "none", boxSizing: "border-box", transition: "border-color 120ms" }}
        />
      ) : (
        <div style={{ background: "rgba(31,27,22,0.04)", border: "1px solid var(--border-strong)", borderRadius: 4, padding: "10px 12px", fontSize: 11, color: "var(--t3)", lineHeight: 1.6, whiteSpace: "pre-line" }}>
          {text}
        </div>
      )}
    </div>
  );
}

function RelatedRow({ item }) {
  const [h, setH] = useState(false);
  const Icon   = RELATED_ICON[item.icon] || RELATED_ICON.default;
  const srcCfg = SOURCE_CFG[item.icon] || SOURCE_CFG.default;
  return (
    <div
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "8px 12px", borderBottom: "1px solid rgba(31,27,22,0.05)", background: h ? "rgba(31,27,22,0.04)" : "transparent", cursor: "default", transition: "background 80ms" }}
    >
      <div style={{ flexShrink: 0, width: 22, height: 22, borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", background: srcCfg.bg }}>
        <Icon style={{ width: 11, height: 11, color: srcCfg.color }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 11, color: "var(--t2)", fontWeight: 500, lineHeight: 1.3, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{item.title}</p>
        <p style={{ fontSize: 10, color: "var(--t5)", marginTop: 2 }}>{item.meta}</p>
      </div>
      <span style={{ flexShrink: 0, fontSize: 9, fontWeight: 500, color: "var(--t5)", textTransform: "uppercase", opacity: h ? 1 : 0, transition: "opacity 80ms", marginTop: 2 }}>{item.type}</span>
    </div>
  );
}

function TimelineEvent({ event, isLast }) {
  const cfg = TIMELINE_CFG[event.kind] || TIMELINE_CFG.created;
  const { Icon } = cfg;
  return (
    <div style={{ display: "flex", gap: 10 }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
        <div style={{ width: 18, height: 18, borderRadius: "50%", background: cfg.dot, border: "2px solid var(--bg-sidebar)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1 }}>
          <Icon style={{ width: 9, height: 9, color: "#fff" }} />
        </div>
        {!isLast && <div style={{ width: 1, flex: 1, background: "rgba(31,27,22,0.08)", marginTop: 3 }} />}
      </div>
      <div style={{ paddingBottom: 14, flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 10, fontWeight: 500, color: cfg.color }}>{event.actor}</span>
          <span style={{ fontSize: 9, color: "var(--t5)" }}>{event.time}</span>
        </div>
        <p style={{ fontSize: 11, color: "var(--t3)", marginTop: 2, lineHeight: 1.4 }}>{event.event}</p>
      </div>
    </div>
  );
}

const ActionCenter = ({ item, onClose, onComplete }) => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const scrollRef = useRef(null);

  useEffect(() => { if (item) scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" }); }, [item]);
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleExecute  = () => { showToast(`Executing: ${item.execution.primary.label}`, "success"); if (onComplete) onComplete(item.id); onClose(); };
  const handleNavigate = () => { navigate(item.execution.secondary.navigate); onClose(); };
  const handleReject   = () => { showToast(item.execution.reject.label === "Reject Draft" ? "Draft rejected." : "Action dismissed.", "warning"); if (onComplete) onComplete(item.id); onClose(); };

  const srcCfg = SOURCE_CFG[item?.source] || SOURCE_CFG.default;
  const pCfg   = PRIORITY_CFG[item?.priority] || PRIORITY_CFG.P3;
  const execStyle = PRIMARY_EXEC[item?.execution?.primary?.variant] || PRIMARY_EXEC.purple;
  const { Icon: SourceIcon } = srcCfg;

  const [hPrimary,   setHPrimary]   = useState(false);
  const [hSecondary, setHSecondary] = useState(false);
  const [hReject,    setHReject]    = useState(false);

  return (
    <AnimatePresence>
      {item && (
        <>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            style={{ position: "fixed", inset: 0, background: "rgba(31,27,22,0.12)", backdropFilter: "blur(2px)", zIndex: 50 }}
            onClick={onClose}
          />

          <motion.div
            key="panel"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 260 }}
            style={{
              position: "fixed", inset: "0 0 0 auto",
              width: "100%", maxWidth: 480,
              zIndex: 50,
              display: "flex", flexDirection: "column",
              overflow: "hidden",
              background: "#13121A",
              borderLeft: "1px solid rgba(31,27,22,0.07)",
              boxShadow: "-12px 0 48px rgba(31,27,22,0.35)",
            }}
          >
            {/* Header */}
            <div style={{ padding: "16px 18px", borderBottom: "1px solid rgba(31,27,22,0.06)", flexShrink: 0 }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                <div style={{ flexShrink: 0, width: 36, height: 36, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", background: srcCfg.bg, border: `1px solid ${srcCfg.color}22`, marginTop: 2 }}>
                  <SourceIcon style={{ width: 16, height: 16, color: srcCfg.color }} />
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap", marginBottom: 6 }}>
                    <span style={{ fontSize: 8, fontWeight: 500, padding: "2px 6px", borderRadius: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: pCfg.color, background: pCfg.bg, border: `1px solid ${pCfg.border}` }}>{item.priority}</span>
                    <span style={{ fontSize: 8, fontWeight: 500, padding: "2px 6px", borderRadius: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--t5)", background: "rgba(31,27,22,0.05)", border: "1px solid rgba(31,27,22,0.08)" }}>{item.status}</span>
                    {item.timestamp && (
                      <span style={{ marginLeft: "auto", flexShrink: 0, fontSize: 9, color: "var(--t5)", display: "flex", alignItems: "center", gap: 4 }}>
                        <Clock style={{ width: 9, height: 9 }} /> {item.timestamp}
                      </span>
                    )}
                  </div>

                  <h2 style={{ fontSize: 14, fontWeight: 500, color: "var(--t1)", lineHeight: 1.3 }}>{item.title}</h2>

                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, fontSize: 10, color: "var(--t5)" }}>
                    <span style={{ color: srcCfg.color, fontWeight: 500 }}>{srcCfg.label}</span>
                    <span>·</span>
                    <span>{item.metadata?.timeMin} min to complete</span>
                  </div>
                </div>

                <button
                  onClick={onClose}
                  style={{ flexShrink: 0, padding: 6, borderRadius: 4, background: "transparent", border: "none", color: "var(--t5)", cursor: "pointer", display: "flex", alignItems: "center" }}
                >
                  <X style={{ width: 14, height: 14 }} />
                </button>
              </div>

              <div style={{ marginTop: 12, height: 2, borderRadius: 2, background: pCfg.bar, opacity: 0.35 }} />
            </div>

            {/* Body */}
            <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "18px", display: "flex", flexDirection: "column", gap: 20 }}>

              {item.context?.length > 0 && (
                <Section label="Context" icon={FileText}>
                  <div style={{ background: "rgba(31,27,22,0.025)", border: "1px solid rgba(31,27,22,0.06)", borderRadius: 5, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
                    {item.context.map((c, i) => <p key={i} style={{ fontSize: 12, color: "var(--t3)", lineHeight: 1.5 }}>{c}</p>)}
                  </div>
                </Section>
              )}

              <Section label="AI Analysis" icon={Brain} collapsible defaultOpen>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ background: "rgba(232,103,43,0.06)", border: "1px solid rgba(232,103,43,0.12)", borderRadius: 5, padding: "12px 14px" }}>
                    <p style={{ fontSize: 9, fontWeight: 500, color: "rgba(232,103,43,0.7)", textTransform: "uppercase", letterSpacing: "0.10em", marginBottom: 6, display: "flex", alignItems: "center", gap: 4 }}>
                      <Sparkles style={{ width: 9, height: 9 }} /> Why FLOW recommends this
                    </p>
                    <p style={{ fontSize: 11, color: "var(--t3)", lineHeight: 1.5 }}>{item.aiAnalysis.recommendation}</p>
                  </div>

                  <div style={{ background: "rgba(31,27,22,0.025)", border: "1px solid rgba(31,27,22,0.06)", borderRadius: 5, padding: "12px 14px" }}>
                    <p style={{ fontSize: 9, fontWeight: 500, color: "var(--t5)", textTransform: "uppercase", letterSpacing: "0.10em", marginBottom: 6 }}>Business Impact</p>
                    <p style={{ fontSize: 11, color: "var(--t3)", lineHeight: 1.5, marginBottom: 8 }}>{item.aiAnalysis.businessImpact}</p>
                    <ImpactChip impact={item.metadata?.impact} />
                  </div>

                  <div style={{ background: "rgba(31,27,22,0.025)", border: "1px solid rgba(31,27,22,0.06)", borderRadius: 5, padding: "12px 14px" }}>
                    <p style={{ fontSize: 9, fontWeight: 500, color: "var(--t5)", textTransform: "uppercase", letterSpacing: "0.10em", marginBottom: 6 }}>Urgency Rationale</p>
                    <p style={{ fontSize: 11, color: "var(--t3)", lineHeight: 1.5 }}>{item.aiAnalysis.urgencyRationale}</p>
                  </div>

                  {item.aiAnalysis.dependencies?.length > 0 && (
                    <div style={{ background: "rgba(31,27,22,0.025)", border: "1px solid rgba(31,27,22,0.06)", borderRadius: 5, padding: "12px 14px" }}>
                      <p style={{ fontSize: 9, fontWeight: 500, color: "var(--t5)", textTransform: "uppercase", letterSpacing: "0.10em", marginBottom: 8 }}>Dependencies</p>
                      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 5 }}>
                        {item.aiAnalysis.dependencies.map((dep, i) => (
                          <li key={i} style={{ display: "flex", alignItems: "flex-start", gap: 6, fontSize: 11, color: "var(--t3)", lineHeight: 1.4 }}>
                            <span style={{ color: "rgba(232,103,43,0.5)", flexShrink: 0, marginTop: 2, fontSize: 8 }}>◆</span>
                            {dep}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {item.aiAnalysis.historicalNote && (
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "10px 12px", background: "rgba(31,27,22,0.015)", border: "1px solid rgba(31,27,22,0.06)", borderRadius: 5 }}>
                      <History style={{ width: 11, height: 11, color: "var(--t5)", flexShrink: 0, marginTop: 2 }} />
                      <p style={{ fontSize: 11, color: "var(--t4)", lineHeight: 1.4 }}>{item.aiAnalysis.historicalNote}</p>
                    </div>
                  )}

                  <div>
                    <p style={{ fontSize: 9, fontWeight: 500, color: "var(--t5)", textTransform: "uppercase", letterSpacing: "0.10em", marginBottom: 6 }}>Confidence</p>
                    <ConfidenceBar value={item.aiAnalysis.confidence} />
                  </div>
                </div>
              </Section>

              {item.draft && (
                <Section label="Suggested Action" icon={Zap}>
                  <DraftEditor draft={item.draft} />
                </Section>
              )}

              {item.relatedItems?.length > 0 && (
                <Section label="Related" icon={Link2} collapsible defaultOpen>
                  <div style={{ background: "rgba(31,27,22,0.015)", border: "1px solid rgba(31,27,22,0.06)", borderRadius: 5, overflow: "hidden" }}>
                    {item.relatedItems.map((rel, i) => <RelatedRow key={i} item={rel} />)}
                  </div>
                </Section>
              )}

              {item.timeline?.length > 0 && (
                <Section label="Timeline" icon={History} collapsible defaultOpen={false}>
                  <div style={{ paddingTop: 4 }}>
                    {item.timeline.map((ev, i) => <TimelineEvent key={i} event={ev} isLast={i === item.timeline.length - 1} />)}
                  </div>
                </Section>
              )}
            </div>

            {/* Footer */}
            <div style={{ padding: "12px 18px", borderTop: "1px solid rgba(31,27,22,0.06)", flexShrink: 0, background: "rgba(31,27,22,0.01)", display: "flex", alignItems: "center", gap: 8 }}>
              <button
                onClick={handleReject}
                onMouseEnter={() => setHReject(true)}
                onMouseLeave={() => setHReject(false)}
                style={{ flexShrink: 0, fontSize: 11, fontWeight: 500, padding: "7px 12px", borderRadius: 4, color: hReject ? "var(--p-critical-text)" : "var(--t4)", border: `1px solid ${hReject ? "rgba(255,87,87,0.30)" : "rgba(31,27,22,0.08)"}`, background: hReject ? "rgba(255,87,87,0.05)" : "transparent", cursor: "pointer", transition: "all 100ms" }}
              >
                {item.execution.reject.label}
              </button>

              <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
                <button
                  onClick={handleNavigate}
                  onMouseEnter={() => setHSecondary(true)}
                  onMouseLeave={() => setHSecondary(false)}
                  style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 500, padding: "7px 12px", borderRadius: 4, color: hSecondary ? "var(--t1)" : "var(--t3)", border: `1px solid ${hSecondary ? "rgba(31,27,22,0.14)" : "rgba(31,27,22,0.08)"}`, background: hSecondary ? "rgba(31,27,22,0.06)" : "transparent", cursor: "pointer", transition: "all 100ms" }}
                >
                  <SourceIcon style={{ width: 11, height: 11, color: srcCfg.color }} />
                  {item.execution.secondary.label}
                </button>

                <button
                  onClick={handleExecute}
                  onMouseEnter={() => setHPrimary(true)}
                  onMouseLeave={() => setHPrimary(false)}
                  style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 500, padding: "7px 14px", borderRadius: 4, color: execStyle.color, border: `1px solid ${execStyle.border}`, background: hPrimary ? execStyle.hover : execStyle.bg, cursor: "pointer", transition: "all 100ms" }}
                >
                  <CheckCircle style={{ width: 12, height: 12 }} />
                  {item.execution.primary.label}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default ActionCenter;
