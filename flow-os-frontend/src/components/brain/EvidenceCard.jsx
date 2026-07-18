import { useState } from "react";
import {
  GitPullRequest, Calendar, MessageSquare, Users, AlertTriangle,
  FileText, Clock, Share2, ChevronRight, ChevronDown, User, ExternalLink,
} from "lucide-react";
import SourceBadge from "../ui/SourceBadge";

/**
 * EvidenceCard — renders one piece of evidence / one entity the Brain cited as a
 * clickable card instead of a bare citation. Clicking expands the full content and
 * offers the one contextual action that keeps you inside FLOW (open the Slack thread
 * in-app, jump to the entity's cross-capability workspace, etc.).
 *
 * Consumes the Explainability envelope's normalized evidence item:
 *   { ref, sourceType, source, content, actor, ts, freshnessDays, score, entityId }
 * No new backend — this is a presentation layer over data the Brain already returns.
 */
const TYPE_META = {
  github:    { icon: GitPullRequest, badge: "github",   label: "GitHub" },
  pr:        { icon: GitPullRequest, badge: "github",   label: "Pull Request" },
  commit:    { icon: GitPullRequest, badge: "github",   label: "Commit" },
  meeting:   { icon: Calendar,       badge: "calendar", label: "Meeting" },
  calendar:  { icon: Calendar,       badge: "calendar", label: "Meeting" },
  slack:     { icon: MessageSquare,  badge: "slack",    label: "Slack" },
  gmail:     { icon: MessageSquare,  badge: "gmail",    label: "Email" },
  email:     { icon: MessageSquare,  badge: "gmail",    label: "Email" },
  customer:  { icon: Users,          badge: "default",  label: "Customer" },
  crm:       { icon: Users,          badge: "default",  label: "Customer" },
  incident:  { icon: AlertTriangle,  badge: "default",  label: "Incident" },
  knowledge: { icon: FileText,       badge: "notion",   label: "Document" },
  document:  { icon: FileText,       badge: "notion",   label: "Document" },
  notion:    { icon: FileText,       badge: "notion",   label: "Document" },
  vault:     { icon: FileText,       badge: "vault",    label: "Vault" },
  timeline:  { icon: Clock,          badge: "default",  label: "Timeline" },
  graph:     { icon: Share2,         badge: "default",  label: "Graph Node" },
  jira:      { icon: FileText,       badge: "jira",     label: "Jira" },
  default:   { icon: FileText,       badge: "default",  label: "Evidence" },
};

function metaFor(sourceType, source) {
  const key = String(sourceType || source || "").toLowerCase();
  return TYPE_META[key]
    || Object.entries(TYPE_META).find(([k]) => key.includes(k))?.[1]
    || TYPE_META.default;
}

function freshnessLabel(days) {
  if (days == null) return null;
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.round(days / 7)}w ago`;
  return `${Math.round(days / 30)}mo ago`;
}

export default function EvidenceCard({ evidence, onOpen }) {
  const [open, setOpen] = useState(false);
  const m = metaFor(evidence.sourceType, evidence.source);
  const Icon = m.icon;
  const badgeKey = m.badge;
  const fresh = freshnessLabel(evidence.freshnessDays);
  const isSlack = badgeKey === "slack";

  const title = (evidence.content || "").split("\n")[0].slice(0, 90) || `${m.label} evidence`;
  const canOpen = Boolean(onOpen && (evidence.entityId || isSlack));

  return (
    <div style={{
      border: "1px solid var(--border)", borderRadius: 5, background: "var(--bg-card)",
      overflow: "hidden", transition: "border-color 100ms",
    }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 9,
          padding: "8px 10px", background: "transparent", border: "none",
          cursor: "pointer", textAlign: "left",
        }}
      >
        {open ? <ChevronDown style={{ width: 11, height: 11, color: "var(--t5)", flexShrink: 0 }} />
              : <ChevronRight style={{ width: 11, height: 11, color: "var(--t5)", flexShrink: 0 }} />}
        <Icon style={{ width: 12, height: 12, color: "var(--t4)", flexShrink: 0 }} />
        <span style={{
          fontSize: 12, color: "var(--t2)", flex: 1, minWidth: 0,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {title}
        </span>
        <SourceBadge source={badgeKey} />
        {fresh && (
          <span style={{ fontSize: 10, color: "var(--t5)", flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>{fresh}</span>
        )}
      </button>

      {open && (
        <div style={{ padding: "0 10px 10px 32px", display: "flex", flexDirection: "column", gap: 8 }}>
          <p style={{ fontSize: 12, color: "var(--t3)", lineHeight: 1.6, margin: 0, whiteSpace: "pre-wrap" }}>
            {evidence.content || "No preview available for this source."}
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            {evidence.actor && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--t4)" }}>
                <User style={{ width: 10, height: 10 }} />{evidence.actor}
              </span>
            )}
            {evidence.score != null && (
              <span style={{ fontSize: 11, color: "var(--t5)", fontVariantNumeric: "tabular-nums" }}>
                relevance {(evidence.score * 100).toFixed(0)}%
              </span>
            )}
            {canOpen && (
              <button
                onClick={() => onOpen(evidence)}
                style={{
                  marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 5,
                  padding: "3px 9px", borderRadius: 4, fontSize: 11, cursor: "pointer",
                  background: "var(--accent-dim)", border: "1px solid var(--brand-line)",
                  color: "var(--brand-text)",
                }}
              >
                {isSlack ? "Open thread" : "Open"}
                <ExternalLink style={{ width: 9, height: 9 }} />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
