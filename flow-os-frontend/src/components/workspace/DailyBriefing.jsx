import { useState, useEffect, useCallback } from "react";
import {
  Sparkles,
  RefreshCw,
  AlertTriangle,
  ListChecks,
  Zap,
  Activity,
  GitCommit,
  FileText,
  CheckCircle,
} from "lucide-react";
import Card from "../ui/Card";
import { brainApi } from "../../lib/brainApi";

// Normalize evidence to an array (may arrive as string or string[])
const toArray = (e) => (Array.isArray(e) ? e : e ? [e] : []);

// True if any section value carries renderable data (non-empty array or a present number).
const hasSectionContent = (sections) =>
  !!sections &&
  Object.values(sections).some(
    (v) => (Array.isArray(v) && v.length > 0) || typeof v === "number" || (v && typeof v === "object" && Object.keys(v).length > 0)
  );

// Map severity/confidence strings to a CSS text-color token
const severityColor = (level) => {
  if (!level) return "text-text-muted";
  const upper = level.toUpperCase();
  if (upper === "HIGH" || upper === "CRITICAL") return "text-critical";
  if (upper === "MEDIUM") return "text-warning";
  return "text-text-muted";
};

const ROLES = ["EMPLOYEE", "MANAGER", "EXECUTIVE"];

// ─── Small reusable pieces ────────────────────────────────────────────────────

function RoleSwitcher({ role, onSelect }) {
  return (
    <div className="inline-flex bg-bg-secondary border border-border-flow rounded-xl p-1 gap-1">
      {ROLES.map((r) => (
        <button
          key={r}
          onClick={() => onSelect(r)}
          className={`px-4 py-1.5 rounded-lg text-ui-xs font-semibold uppercase tracking-wider transition-apple ${
            role === r
              ? "bg-flow-purple text-white shadow"
              : "text-text-secondary hover:text-text-primary hover:bg-bg-hover"
          }`}
        >
          {r}
        </button>
      ))}
    </div>
  );
}

function EvidenceList({ evidence }) {
  const items = toArray(evidence);
  if (items.length === 0) return null;
  return (
    <ul className="mt-2 space-y-1">
      {items.map((ev, i) => (
        <li
          key={i}
          className="flex items-start gap-1.5 text-[11px] text-text-muted leading-relaxed bg-bg-primary/60 border border-border-flow/30 rounded-lg px-2 py-1.5"
        >
          <FileText className="w-3 h-3 flex-shrink-0 mt-0.5 text-flow-purple/60" />
          <span>{ev}</span>
        </li>
      ))}
    </ul>
  );
}

function SystemBadges({ systems }) {
  const arr = toArray(systems);
  if (arr.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-2">
      {arr.map((s, i) => (
        <span
          key={i}
          className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-flow-purple/10 text-flow-purple border border-flow-purple/20 uppercase tracking-wide"
        >
          {s}
        </span>
      ))}
    </div>
  );
}

function ConfidenceChip({ confidence, severity }) {
  const label = confidence ?? severity;
  if (!label) return null;
  const color = severityColor(String(label));
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border border-current/20 ${color}`}
    >
      {String(label).toUpperCase()}
    </span>
  );
}

// ─── Metadata strip ───────────────────────────────────────────────────────────

function MetaStrip({ metadata }) {
  if (!metadata) return null;
  const { healthScore, openIncidents, recommendationCount } = metadata;
  return (
    <div className="flex flex-wrap gap-4 mt-3 pt-3 border-t border-border-flow/30">
      {healthScore != null && (
        <div className="flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5 text-success" />
          <span className="text-[11px] text-text-secondary">
            Health <span className="font-semibold text-success">{healthScore}%</span>
          </span>
        </div>
      )}
      {openIncidents != null && (
        <div className="flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 text-warning" />
          <span className="text-[11px] text-text-secondary">
            Open incidents <span className="font-semibold text-warning">{openIncidents}</span>
          </span>
        </div>
      )}
      {recommendationCount != null && (
        <div className="flex items-center gap-1.5">
          <Zap className="w-3.5 h-3.5 text-flow-purple" />
          <span className="text-[11px] text-text-secondary">
            Recommendations <span className="font-semibold text-text-primary">{recommendationCount}</span>
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Role-section renderers ───────────────────────────────────────────────────

function EmployeeSections({ sections }) {
  if (!sections) return null;
  const { priorities, actions, risks, healthSummary } = sections;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Priorities */}
      {Array.isArray(priorities) && priorities.length > 0 && (
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <ListChecks className="w-4 h-4 text-flow-purple" />
            <h3 className="text-ui-sm font-semibold text-text-primary uppercase tracking-wide">
              Priorities
            </h3>
          </div>
          <div className="space-y-2">
            {priorities.map((p, i) => (
              <div
                key={i}
                className="bg-bg-secondary border border-border-flow/40 rounded-lg p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-ui-xs font-medium text-text-primary leading-snug">
                    {p.title}
                  </span>
                  <ConfidenceChip severity={p.urgency} />
                </div>
                {p.source && (
                  <span className="text-[10px] text-text-muted mt-1 block">{p.source}</span>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Actions */}
      {Array.isArray(actions) && actions.length > 0 && (
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Zap className="w-4 h-4 text-flow-purple" />
            <h3 className="text-ui-sm font-semibold text-text-primary uppercase tracking-wide">
              Recommended Actions
            </h3>
          </div>
          <div className="space-y-3">
            {actions.map((a, i) => (
              <div
                key={i}
                className="bg-bg-secondary border border-border-flow/40 rounded-lg p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-ui-xs font-medium text-text-primary leading-snug">
                    {a.title}
                  </span>
                  <ConfidenceChip confidence={a.confidence} />
                </div>
                {a.businessImpact && (
                  <p className="text-[11px] text-text-secondary mt-1">{a.businessImpact}</p>
                )}
                <SystemBadges systems={a.systems} />
                <EvidenceList evidence={a.evidence} />
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Risks */}
      {Array.isArray(risks) && risks.length > 0 && (
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-warning" />
            <h3 className="text-ui-sm font-semibold text-text-primary uppercase tracking-wide">
              Risks
            </h3>
          </div>
          <div className="space-y-2">
            {risks.map((r, i) => (
              <div
                key={i}
                className="bg-bg-secondary border border-border-flow/40 rounded-lg p-3"
              >
                <span className="text-ui-xs font-medium text-text-primary">{r.title}</span>
                <EvidenceList evidence={r.evidence} />
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Health summary number */}
      {healthSummary != null && (
        <Card className="p-4 flex flex-col items-center justify-center gap-2">
          <Activity className="w-6 h-6 text-success" />
          <span className="text-ui-xs text-text-muted uppercase tracking-widest">
            Workspace Health
          </span>
          <span className="text-4xl font-bold text-success">{healthSummary}</span>
        </Card>
      )}
    </div>
  );
}

function ManagerSections({ sections }) {
  if (!sections) return null;
  const { teamBlockers, sprintHealth, approvals, resourceFlags, actions } = sections;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Team Blockers */}
      {Array.isArray(teamBlockers) && teamBlockers.length > 0 && (
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-critical" />
            <h3 className="text-ui-sm font-semibold text-text-primary uppercase tracking-wide">
              Team Blockers
            </h3>
          </div>
          <div className="space-y-3">
            {teamBlockers.map((b, i) => (
              <div
                key={i}
                className="bg-bg-secondary border border-border-flow/40 rounded-lg p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-ui-xs font-medium text-text-primary leading-snug">
                    {b.title}
                  </span>
                  <ConfidenceChip severity={b.severity} />
                </div>
                <SystemBadges systems={b.systems} />
                <EvidenceList evidence={b.evidence} />
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Resource Flags */}
      {Array.isArray(resourceFlags) && resourceFlags.length > 0 && (
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-4 h-4 text-flow-purple" />
            <h3 className="text-ui-sm font-semibold text-text-primary uppercase tracking-wide">
              Resource Flags
            </h3>
          </div>
          <div className="space-y-3">
            {resourceFlags.map((r, i) => (
              <div
                key={i}
                className="bg-bg-secondary border border-border-flow/40 rounded-lg p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-ui-xs font-medium text-text-primary leading-snug">
                    {r.title}
                  </span>
                  <ConfidenceChip confidence={r.confidence} />
                </div>
                {r.owner && (
                  <span className="text-[10px] text-text-muted mt-1 block">Owner: {r.owner}</span>
                )}
                {r.businessImpact && (
                  <p className="text-[11px] text-text-secondary mt-1">{r.businessImpact}</p>
                )}
                <SystemBadges systems={r.systems} />
                <EvidenceList evidence={r.evidence} />
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Recommended Actions */}
      {Array.isArray(actions) && actions.length > 0 && (
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Zap className="w-4 h-4 text-flow-purple" />
            <h3 className="text-ui-sm font-semibold text-text-primary uppercase tracking-wide">
              Recommended Actions
            </h3>
          </div>
          <div className="space-y-3">
            {actions.map((a, i) => (
              <div
                key={i}
                className="bg-bg-secondary border border-border-flow/40 rounded-lg p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-ui-xs font-medium text-text-primary leading-snug">
                    {a.title}
                  </span>
                  <ConfidenceChip confidence={a.confidence} />
                </div>
                {a.businessImpact && (
                  <p className="text-[11px] text-text-secondary mt-1">{a.businessImpact}</p>
                )}
                <SystemBadges systems={a.systems} />
                <EvidenceList evidence={a.evidence} />
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Pending Approvals */}
      {Array.isArray(approvals) && approvals.length > 0 && (
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle className="w-4 h-4 text-success" />
            <h3 className="text-ui-sm font-semibold text-text-primary uppercase tracking-wide">
              Pending Approvals
            </h3>
          </div>
          <div className="space-y-2">
            {approvals.map((ap, i) => (
              <div
                key={i}
                className="bg-bg-secondary border border-border-flow/40 rounded-lg p-3"
              >
                <span className="text-ui-xs font-medium text-text-primary">{ap.title ?? String(ap)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Sprint Health */}
      {sprintHealth != null && (
        <Card className="p-4 flex flex-col items-center justify-center gap-2">
          <Activity className="w-6 h-6 text-flow-purple" />
          <span className="text-ui-xs text-text-muted uppercase tracking-widest">Sprint Health</span>
          <span className="text-4xl font-bold text-flow-purple">{sprintHealth}</span>
        </Card>
      )}
    </div>
  );
}

function ExecutiveSections({ sections }) {
  if (!sections) return null;
  const {
    companyHealth,
    sectors,
    customerRisks,
    deliveryRisks,
    strategicRecommendations,
    recentDecisions,
  } = sections;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Company Health + Sectors */}
      {(companyHealth != null || (sectors && Object.keys(sectors).length > 0)) && (
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Activity className="w-4 h-4 text-success" />
            <h3 className="text-ui-sm font-semibold text-text-primary uppercase tracking-wide">
              Company Health
            </h3>
          </div>
          {companyHealth != null && (
            <div className="flex items-baseline gap-2 mb-3">
              <span className="text-4xl font-bold text-success">{companyHealth}</span>
              <span className="text-ui-xs text-text-muted">/ 100</span>
            </div>
          )}
          {sectors && typeof sectors === "object" && Object.keys(sectors).length > 0 && (
            <div className="space-y-1.5">
              {Object.entries(sectors).map(([sector, score]) => (
                <div key={sector} className="flex items-center justify-between text-[11px]">
                  <span className="capitalize text-text-secondary">{sector}</span>
                  <span className="font-semibold text-text-primary">{score}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Customer Risks */}
      {Array.isArray(customerRisks) && customerRisks.length > 0 && (
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-warning" />
            <h3 className="text-ui-sm font-semibold text-text-primary uppercase tracking-wide">
              Customer Risks
            </h3>
          </div>
          <div className="space-y-3">
            {customerRisks.map((r, i) => (
              <div
                key={i}
                className="bg-bg-secondary border border-border-flow/40 rounded-lg p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-ui-xs font-medium text-text-primary leading-snug">
                    {r.title}
                  </span>
                  <ConfidenceChip confidence={r.confidence} />
                </div>
                <SystemBadges systems={r.systems} />
                <EvidenceList evidence={r.evidence} />
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Delivery Risks */}
      {Array.isArray(deliveryRisks) && deliveryRisks.length > 0 && (
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-critical" />
            <h3 className="text-ui-sm font-semibold text-text-primary uppercase tracking-wide">
              Delivery Risks
            </h3>
          </div>
          <div className="space-y-3">
            {deliveryRisks.map((r, i) => (
              <div
                key={i}
                className="bg-bg-secondary border border-border-flow/40 rounded-lg p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-ui-xs font-medium text-text-primary leading-snug">
                    {r.title}
                  </span>
                  <ConfidenceChip severity={r.severity} />
                </div>
                <SystemBadges systems={r.systems} />
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Strategic Recommendations */}
      {Array.isArray(strategicRecommendations) && strategicRecommendations.length > 0 && (
        <Card className="p-4 lg:col-span-2">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-4 h-4 text-flow-purple" />
            <h3 className="text-ui-sm font-semibold text-text-primary uppercase tracking-wide">
              Strategic Recommendations
            </h3>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {strategicRecommendations.map((rec, i) => (
              <div
                key={i}
                className="bg-bg-secondary border border-border-flow/40 rounded-lg p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-ui-xs font-medium text-text-primary leading-snug">
                    {rec.title}
                  </span>
                  <ConfidenceChip confidence={rec.confidence} />
                </div>
                {rec.owner && (
                  <span className="text-[10px] text-text-muted mt-1 block">Owner: {rec.owner}</span>
                )}
                {rec.impact && (
                  <span className="text-[10px] text-flow-purple mt-1 block font-semibold">
                    Impact: {rec.impact}
                  </span>
                )}
                {rec.businessImpact && (
                  <p className="text-[11px] text-text-secondary mt-1">{rec.businessImpact}</p>
                )}
                <SystemBadges systems={rec.systems} />
                <EvidenceList evidence={rec.evidence} />
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Recent Decisions */}
      {Array.isArray(recentDecisions) && recentDecisions.length > 0 && (
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <GitCommit className="w-4 h-4 text-text-secondary" />
            <h3 className="text-ui-sm font-semibold text-text-primary uppercase tracking-wide">
              Recent Decisions
            </h3>
          </div>
          <div className="space-y-2">
            {recentDecisions.map((d, i) => (
              <div
                key={i}
                className="bg-bg-secondary border border-border-flow/40 rounded-lg p-3"
              >
                <span className="text-ui-xs font-medium text-text-primary block">{d.title}</span>
                <div className="flex items-center gap-2 mt-1 text-[10px] text-text-muted">
                  {d.author && <span>{d.author}</span>}
                  {d.date && (
                    <span>{new Date(d.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

function DailyBriefing() {
  const [role, setRole] = useState("EMPLOYEE");
  const [briefing, setBriefing] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchBriefing = useCallback(async (selectedRole) => {
    setLoading(true);
    setError(null);
    try {
      const res = await brainApi.briefing(selectedRole);
      setBriefing(res.briefing ?? res);
    } catch (err) {
      setError(err.message || "Failed to load daily briefing.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchBriefing(role);
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  const handleRoleSelect = (newRole) => {
    setRole(newRole);
  };

  const generatedAtStr = briefing?.generatedAt
    ? new Date(briefing.generatedAt).toLocaleString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* ── Header ─────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-ui-xl font-bold text-text-primary tracking-tight">
            Daily Briefing
          </h1>
          {generatedAtStr && (
            <p className="text-ui-xs text-text-muted mt-0.5">{generatedAtStr}</p>
          )}
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <RoleSwitcher role={role} onSelect={handleRoleSelect} />
          <button
            onClick={() => fetchBriefing(role)}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-ui-xs font-medium text-text-secondary hover:text-text-primary hover:bg-bg-hover border border-border-flow/60 transition-apple disabled:opacity-40"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* ── Loading ─────────────────────────────────────────── */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <div className="w-8 h-8 rounded-full border-2 border-flow-purple/20 border-t-flow-purple animate-spin" />
          <span className="text-ui-xs text-text-muted font-medium uppercase tracking-wider">
            Synthesizing briefing...
          </span>
        </div>
      )}

      {/* ── Error ───────────────────────────────────────────── */}
      {!loading && error && (
        <Card className="p-6 border-critical/30 bg-critical/5">
          <div className="flex flex-col items-center gap-3 text-center">
            <AlertTriangle className="w-6 h-6 text-critical" />
            <p className="text-ui-sm text-text-primary font-medium">{error}</p>
            <button
              onClick={() => fetchBriefing(role)}
              className="px-4 py-2 rounded-lg text-ui-xs font-semibold bg-flow-purple text-white hover:bg-flow-purple/90 transition-apple"
            >
              Try Again
            </button>
          </div>
        </Card>
      )}

      {/* ── Content ─────────────────────────────────────────── */}
      {!loading && !error && briefing && (
        <div className="space-y-6 animate-fade-in">
          {/* AI Narrative card */}
          {briefing.aiNarrative && (
            <Card className="p-6 border-flow-purple/30 bg-flow-purple/5 relative overflow-hidden">
              <div className="absolute -right-20 -top-20 w-48 h-48 rounded-full bg-flow-purple/10 blur-3xl pointer-events-none" />
              <div className="relative z-10 space-y-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-flow-purple" />
                  <span className="text-[10px] font-bold text-flow-purple uppercase tracking-widest">
                    AI Narrative — {role}
                  </span>
                </div>
                <p className="text-ui-md text-text-primary leading-relaxed font-light">
                  {briefing.aiNarrative}
                </p>
                <MetaStrip metadata={briefing.metadata} />
              </div>
            </Card>
          )}

          {/* Role-specific sections */}
          {role === "EMPLOYEE" && <EmployeeSections sections={briefing.sections} />}
          {role === "MANAGER" && <ManagerSections sections={briefing.sections} />}
          {role === "EXECUTIVE" && <ExecutiveSections sections={briefing.sections} />}
        </div>
      )}

      {/* Empty state only when briefing loaded but neither narrative nor section data exists */}
      {!loading && !error && briefing && !briefing.aiNarrative && !hasSectionContent(briefing.sections) && (
        <Card className="p-8 text-center">
          <Sparkles className="w-8 h-8 text-text-muted mx-auto mb-3" />
          <p className="text-ui-sm text-text-secondary">No briefing content available for this role.</p>
        </Card>
      )}
    </div>
  );
}

export default DailyBriefing;
