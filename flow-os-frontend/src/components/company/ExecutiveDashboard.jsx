import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  RefreshCw,
  Sparkles,
  FileText,
  Zap,
  Target,
  Clock,
  LayoutDashboard,
  GitCommit,
  Database,
  Cpu,
} from "lucide-react";
import Card from "../ui/Card";
import { brainApi } from "../../lib/brainApi";
import { useToast } from "../ui/ToastProvider";

// Normalize evidence to an array (may arrive as string or string[])
const toArray = (e) => (Array.isArray(e) ? e : e ? [e] : []);

const scoreColor = (score) => {
  if (score == null) return "text-text-muted";
  if (score >= 80) return "text-success";
  if (score >= 60) return "text-warning";
  return "text-critical";
};

const scoreLabel = (score) => {
  if (score == null) return "Unknown";
  if (score >= 80) return "Healthy";
  if (score >= 60) return "Stable";
  return "At Risk";
};

const severityColor = (level) => {
  if (!level) return "text-text-muted";
  const upper = String(level).toUpperCase();
  if (upper === "HIGH" || upper === "CRITICAL") return "text-critical";
  if (upper === "MEDIUM") return "text-warning";
  return "text-text-muted";
};

function relativeTime(ts) {
  if (!ts) return "";
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ─── Small reusable pieces ────────────────────────────────────────────────────

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

function UnavailableCard({ message = "Data unavailable" }) {
  return (
    <Card className="p-4 flex flex-col items-center justify-center gap-2 min-h-[80px] border-border-flow/30 opacity-60">
      <AlertTriangle className="w-4 h-4 text-text-muted" />
      <span className="text-[11px] text-text-muted">{message}</span>
    </Card>
  );
}

// ─── Sector Health Grid ───────────────────────────────────────────────────────

function SectorHealthGrid({ sectors }) {
  if (!sectors || typeof sectors !== "object" || Object.keys(sectors).length === 0) {
    return <UnavailableCard message="No sector data available" />;
  }
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
      {Object.entries(sectors).map(([sector, score]) => {
        const color = scoreColor(score);
        const pct = score != null ? Math.min(100, Math.max(0, score)) : 0;
        return (
          <Card key={sector} className="p-3">
            <span className="text-[10px] text-text-muted uppercase tracking-wider capitalize block mb-1">
              {sector.replace(/_/g, " ")}
            </span>
            <span className={`text-xl font-bold ${color}`}>
              {score != null ? score : "—"}
            </span>
            <div className="mt-2 h-1 rounded-full bg-bg-secondary overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  pct >= 80 ? "bg-success" : pct >= 60 ? "bg-warning" : "bg-critical"
                }`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </Card>
        );
      })}
    </div>
  );
}

// ─── Timeline icon by event kind ─────────────────────────────────────────────

function TimelineIcon({ kind }) {
  const cls = "w-4 h-4 flex-shrink-0";
  if (!kind) return <Clock className={`${cls} text-text-muted`} />;
  const k = String(kind).toUpperCase();
  if (k === "MEMORY") return <Database className={`${cls} text-flow-purple`} />;
  if (k === "AUTOMATION") return <Cpu className={`${cls} text-success`} />;
  if (k === "CONNECTOR") return <Zap className={`${cls} text-warning`} />;
  return <GitCommit className={`${cls} text-text-muted`} />;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ExecutiveDashboard() {
  const navigate = useNavigate();
  const { showToast } = useToast();

  // Each slot: { ok: true, value: ... } | { ok: false, reason: string } | null
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  // Tracks rec keys currently being executed (stays true on success to disable button)
  const [executingIds, setExecutingIds] = useState(new Set());

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [briefingRes, recommendationsRes, timelineRes, goalsRes] = await Promise.allSettled([
      brainApi.briefing("EXECUTIVE"),
      brainApi.recommendations(),
      brainApi.timeline({ limit: 8 }),
      brainApi.goals(),
    ]);

    setData({
      briefing:
        briefingRes.status === "fulfilled"
          ? { ok: true, value: briefingRes.value }
          : { ok: false, reason: briefingRes.reason?.message ?? "Fetch failed" },
      recommendations:
        recommendationsRes.status === "fulfilled"
          ? { ok: true, value: recommendationsRes.value }
          : { ok: false, reason: recommendationsRes.reason?.message ?? "Fetch failed" },
      timeline:
        timelineRes.status === "fulfilled"
          ? { ok: true, value: timelineRes.value }
          : { ok: false, reason: timelineRes.reason?.message ?? "Fetch failed" },
      goals:
        goalsRes.status === "fulfilled"
          ? { ok: true, value: goalsRes.value }
          : { ok: false, reason: goalsRes.reason?.message ?? "Fetch failed" },
    });

    setLastUpdated(new Date());
    setLoading(false);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => fetchAll(), 0);
    return () => clearTimeout(t);
  }, [fetchAll]);

  const allFailed =
    data &&
    !data.briefing.ok &&
    !data.recommendations.ok &&
    !data.timeline.ok &&
    !data.goals.ok;

  // Derived data — defensive extraction
  const briefingSections =
    data?.briefing?.value?.briefing?.sections ??
    data?.briefing?.value?.sections ??
    null;
  const briefingMeta =
    data?.briefing?.value?.briefing?.metadata ??
    data?.briefing?.value?.metadata ??
    null;

  const companyHealth =
    briefingSections?.companyHealth ?? briefingMeta?.healthScore ?? null;
  const sectors = briefingSections?.sectors ?? null;

  const customerRisks = Array.isArray(briefingSections?.customerRisks)
    ? briefingSections.customerRisks
    : [];
  const deliveryRisks = Array.isArray(briefingSections?.deliveryRisks)
    ? briefingSections.deliveryRisks
    : [];
  const strategicRecs = Array.isArray(briefingSections?.strategicRecommendations)
    ? briefingSections.strategicRecommendations
    : [];
  const recentDecisions = Array.isArray(briefingSections?.recentDecisions)
    ? briefingSections.recentDecisions
    : [];

  const fallbackRecs = Array.isArray(data?.recommendations?.value?.recommendations)
    ? data.recommendations.value.recommendations
    : [];
  // Prefer briefing strategic recs; fall back to /recommendations endpoint
  const displayRecs = strategicRecs.length > 0 ? strategicRecs : fallbackRecs;

  const timeline = Array.isArray(data?.timeline?.value?.timeline)
    ? data.timeline.value.timeline
    : [];
  const goals = Array.isArray(data?.goals?.value?.goals)
    ? data.goals.value.goals
    : [];

  // Merge delivery + customer risks into "Critical Priorities"
  const criticalPriorities = [...deliveryRisks, ...customerRisks];

  const handleExecute = async (rec, key) => {
    setExecutingIds((prev) => new Set(prev).add(key));
    try {
      await brainApi.executeRecommendation(rec);
      showToast("Recommendation routed to a decision", "success");
    } catch (err) {
      showToast(err.message || "Failed to execute recommendation", "error");
      // Remove key so button re-enables on error
      setExecutingIds((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  const lastUpdatedStr = lastUpdated
    ? lastUpdated.toLocaleString(undefined, { hour: "2-digit", minute: "2-digit" })
    : null;

  // ── Full-page error when every fetch failed ────────────────────────────────
  if (data && allFailed) {
    return (
      <div className="p-6 max-w-7xl mx-auto flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <AlertTriangle className="w-8 h-8 text-critical" />
        <p className="text-ui-sm text-text-primary font-medium text-center">
          Unable to load Executive Dashboard. Please check your connection.
        </p>
        <button
          onClick={fetchAll}
          className="px-4 py-2 rounded-lg text-ui-xs font-semibold bg-flow-purple text-white hover:bg-flow-purple/90 transition-apple"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* ── 1. Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-ui-xl font-bold text-text-primary tracking-tight flex items-center gap-2">
            <LayoutDashboard className="w-5 h-5 text-flow-purple" />
            Executive Dashboard
          </h1>
          <p className="text-ui-xs text-text-muted mt-0.5">
            What needs your attention today
          </p>
          {lastUpdatedStr && (
            <p className="text-[10px] text-text-muted/60 mt-0.5">
              Updated {lastUpdatedStr}
            </p>
          )}
        </div>
        <button
          onClick={fetchAll}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-ui-xs font-medium text-text-secondary hover:text-text-primary hover:bg-bg-hover border border-border-flow/60 transition-apple disabled:opacity-40 self-start"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* ── Initial loading spinner ────────────────────────────────────────── */}
      {loading && !data && (
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <div className="w-8 h-8 rounded-full border-2 border-flow-purple/20 border-t-flow-purple animate-spin" />
          <span className="text-ui-xs text-text-muted font-medium uppercase tracking-wider">
            Loading executive data...
          </span>
        </div>
      )}

      {data && (
        <div className="space-y-6 animate-fade-in">
          {/* ── 2. Company Health (hero) ──────────────────────────────────── */}
          <Card className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <Activity className="w-4 h-4 text-success" />
              <h2 className="text-ui-sm font-semibold text-text-primary uppercase tracking-wide">
                Company Health — How are we doing?
              </h2>
            </div>

            {!data.briefing.ok ? (
              <p className="text-[11px] text-text-muted">
                Health data unavailable: {data.briefing.reason}
              </p>
            ) : (
              <div className="flex flex-col sm:flex-row sm:items-center gap-6">
                {/* Big score */}
                <div className="flex flex-col items-center sm:items-start gap-1 min-w-[120px]">
                  <span className={`text-6xl font-bold ${scoreColor(companyHealth)}`}>
                    {companyHealth != null ? companyHealth : "—"}
                  </span>
                  <span className="text-[10px] text-text-muted uppercase tracking-widest">
                    / 100
                  </span>
                  {companyHealth != null && (
                    <span className={`text-ui-xs font-semibold ${scoreColor(companyHealth)}`}>
                      {scoreLabel(companyHealth)}
                    </span>
                  )}
                </div>

                {/* Supporting stats */}
                <div className="flex flex-wrap gap-4 sm:border-l sm:border-border-flow/40 sm:pl-6">
                  {briefingMeta?.openIncidents != null && (
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-warning" />
                      <div>
                        <span className="text-ui-md font-bold text-warning">
                          {briefingMeta.openIncidents}
                        </span>
                        <span className="text-[10px] text-text-muted block">
                          Open Incidents
                        </span>
                      </div>
                    </div>
                  )}
                  {briefingMeta?.recommendationCount != null && (
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-flow-purple" />
                      <div>
                        <span className="text-ui-md font-bold text-flow-purple">
                          {briefingMeta.recommendationCount}
                        </span>
                        <span className="text-[10px] text-text-muted block">
                          Recommendations
                        </span>
                      </div>
                    </div>
                  )}
                  {recentDecisions.length > 0 && (
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-success" />
                      <div>
                        <span className="text-ui-md font-bold text-text-primary">
                          {recentDecisions.length}
                        </span>
                        <span className="text-[10px] text-text-muted block">
                          Recent Decisions
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </Card>

          {/* ── 3. Sector Health grid ─────────────────────────────────────── */}
          <div>
            <h2 className="text-ui-sm font-semibold text-text-primary uppercase tracking-wide mb-3 flex items-center gap-2">
              <Activity className="w-4 h-4 text-flow-purple" />
              Sector Health — Where is performance strongest and weakest?
            </h2>
            {!data.briefing.ok ? (
              <UnavailableCard
                message={`Sector data unavailable: ${data.briefing.reason}`}
              />
            ) : (
              <SectorHealthGrid sectors={sectors} />
            )}
          </div>

          {/* ── 4. Critical Priorities ────────────────────────────────────── */}
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-4 h-4 text-critical" />
              <h2 className="text-ui-sm font-semibold text-text-primary uppercase tracking-wide">
                Critical Priorities — What requires immediate attention?
              </h2>
            </div>

            {!data.briefing.ok ? (
              <p className="text-[11px] text-text-muted">
                Priorities unavailable: {data.briefing.reason}
              </p>
            ) : criticalPriorities.length === 0 ? (
              <p className="text-[11px] text-text-muted py-3 text-center">
                No critical priorities right now.
              </p>
            ) : (
              <div className="space-y-3">
                {criticalPriorities.map((item, i) => (
                  <div
                    key={i}
                    className="bg-bg-secondary border border-border-flow/40 rounded-lg p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-ui-xs font-medium text-text-primary leading-snug">
                        {item.title}
                      </span>
                      <ConfidenceChip
                        confidence={item.confidence}
                        severity={item.severity}
                      />
                    </div>
                    <SystemBadges systems={item.systems} />
                    <EvidenceList evidence={item.evidence} />
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* ── 5 + 6 side-by-side on large screens ─────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* ── 5. Recommendations ─────────────────────────────────────── */}
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-4 h-4 text-flow-purple" />
                <h2 className="text-ui-sm font-semibold text-text-primary uppercase tracking-wide">
                  Recommendations — What should I approve?
                </h2>
              </div>

              {!data.briefing.ok && !data.recommendations.ok ? (
                <p className="text-[11px] text-text-muted">
                  Recommendations unavailable.
                </p>
              ) : displayRecs.length === 0 ? (
                <p className="text-[11px] text-text-muted py-3 text-center">
                  No recommendations at this time.
                </p>
              ) : (
                <div className="space-y-3">
                  {displayRecs.map((rec, i) => {
                    const recKey = rec.id ?? `rec-${i}`;
                    const isExecuted = executingIds.has(recKey);
                    return (
                      <div
                        key={recKey}
                        className="bg-bg-secondary border border-border-flow/40 rounded-lg p-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-ui-xs font-medium text-text-primary leading-snug">
                            {rec.title}
                          </span>
                          <ConfidenceChip confidence={rec.confidence} />
                        </div>
                        {rec.impact && (
                          <span className="text-[10px] text-flow-purple mt-1 block font-semibold uppercase tracking-wide">
                            Impact: {rec.impact}
                          </span>
                        )}
                        {rec.owner && (
                          <span className="text-[10px] text-text-muted mt-0.5 block">
                            Owner: {rec.owner}
                          </span>
                        )}
                        {rec.businessImpact && (
                          <p className="text-[11px] text-text-secondary mt-1">
                            {rec.businessImpact}
                          </p>
                        )}
                        {rec.estimatedImprovement && (
                          <p className="text-[11px] text-success mt-1">
                            Est. improvement: {rec.estimatedImprovement}
                          </p>
                        )}
                        <SystemBadges systems={rec.systems} />
                        <EvidenceList evidence={rec.evidence} />
                        <div className="mt-3">
                          <button
                            onClick={() => handleExecute(rec, recKey)}
                            disabled={isExecuted}
                            className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-apple ${
                              isExecuted
                                ? "bg-success/10 text-success border border-success/20 cursor-not-allowed opacity-70"
                                : "bg-flow-purple text-white hover:bg-flow-purple/90"
                            }`}
                          >
                            {isExecuted ? "Routed ✓" : "Execute"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>

            {/* ── 6. Goal Progress ───────────────────────────────────────── */}
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <Target className="w-4 h-4 text-flow-purple" />
                <h2 className="text-ui-sm font-semibold text-text-primary uppercase tracking-wide">
                  Goal Progress — Are we on track?
                </h2>
              </div>

              {!data.goals.ok ? (
                <p className="text-[11px] text-text-muted">
                  Goals unavailable: {data.goals.reason}
                </p>
              ) : goals.length === 0 ? (
                <p className="text-[11px] text-text-muted py-3 text-center">
                  No active goals.
                </p>
              ) : (
                <div className="space-y-3">
                  {goals.map((goal) => {
                    const progress =
                      goal.progress != null
                        ? Math.min(100, Math.max(0, goal.progress))
                        : 0;
                    const s = String(goal.status ?? "").toUpperCase();
                    const statusColor =
                      s === "COMPLETED"
                        ? "text-success"
                        : s === "AT_RISK"
                        ? "text-critical"
                        : "text-flow-purple";
                    return (
                      <div
                        key={goal.id}
                        className="bg-bg-secondary border border-border-flow/40 rounded-lg p-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-ui-xs font-medium text-text-primary leading-snug">
                            {goal.title}
                          </span>
                          {goal.status && (
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border border-current/20 ${statusColor}`}
                            >
                              {s.replace(/_/g, " ")}
                            </span>
                          )}
                        </div>
                        {goal.owner && (
                          <span className="text-[10px] text-text-muted mt-0.5 block">
                            Owner: {goal.owner}
                          </span>
                        )}
                        {goal.targetDate && (
                          <span className="text-[10px] text-text-muted block">
                            Target:{" "}
                            {new Date(goal.targetDate).toLocaleDateString(undefined, {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}
                          </span>
                        )}
                        <div className="mt-2">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] text-text-muted">Progress</span>
                            <span className="text-[10px] font-semibold text-text-primary">
                              {progress}%
                            </span>
                          </div>
                          <div className="h-1.5 rounded-full bg-bg-primary overflow-hidden">
                            <div
                              className="h-full rounded-full bg-flow-purple transition-all"
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </div>

          {/* ── 7. Operational Timeline ───────────────────────────────────── */}
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-text-secondary" />
                <h2 className="text-ui-sm font-semibold text-text-primary uppercase tracking-wide">
                  Operational Timeline — What changed recently?
                </h2>
              </div>
              <button
                onClick={() => navigate("/timeline")}
                className="text-[11px] text-flow-purple hover:text-flow-purple/80 font-medium transition-apple underline-offset-2 hover:underline"
              >
                View full timeline →
              </button>
            </div>

            {!data.timeline.ok ? (
              <p className="text-[11px] text-text-muted">
                Timeline unavailable: {data.timeline.reason}
              </p>
            ) : timeline.length === 0 ? (
              <p className="text-[11px] text-text-muted py-3 text-center">
                No recent timeline events.
              </p>
            ) : (
              <div className="space-y-2">
                {timeline.slice(0, 8).map((event) => (
                  <div
                    key={event.id}
                    className="flex items-start gap-3 p-2 rounded-lg hover:bg-bg-secondary/50 transition-apple"
                  >
                    <div className="mt-0.5">
                      <TimelineIcon kind={event.kind} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-ui-xs font-medium text-text-primary truncate">
                          {event.title}
                        </span>
                        <span className="text-[10px] text-text-muted whitespace-nowrap flex-shrink-0">
                          {relativeTime(event.timestamp)}
                        </span>
                      </div>
                      {event.category && (
                        <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-bg-primary border border-border-flow/40 text-text-muted uppercase tracking-wide">
                          {event.category}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
