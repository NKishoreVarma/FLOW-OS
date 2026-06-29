import { useState, useEffect, useCallback } from "react";
import { Brain, Zap, Plug, RefreshCw, AlertTriangle, Clock } from "lucide-react";
import Card from "../ui/Card";
import { brainApi } from "../../lib/brainApi";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const KIND_META = {
  MEMORY:     { label: 'Memory',     dot: 'bg-flow-purple' },
  AUTOMATION: { label: 'Automation', dot: 'bg-warning' },
  CONNECTOR:  { label: 'Connector',  dot: 'bg-success' },
};

function dayLabel(iso) {
  const d = new Date(iso);
  const today = new Date();
  const yest = new Date(); yest.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yest.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function relativeTime(ts) {
  if (!ts) return "";
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function statusChipClass(status) {
  if (!status) return null;
  const s = String(status).toUpperCase();
  if (s === 'COMPLETED' || s === 'EXECUTED') return 'text-success border-success/20';
  if (s === 'FAILED' || s === 'DENIED_BY_GOVERNANCE' || s === 'DENIED') return 'text-critical border-critical/20';
  if (s === 'BLOCKED_BY_GOVERNANCE' || s === 'BLOCKED' || s === 'AWAITING') return 'text-warning border-warning/20';
  return 'text-text-muted border-border-flow/40';
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function KindIcon({ kind }) {
  const cls = "w-4 h-4 flex-shrink-0";
  const k = String(kind || '').toUpperCase();
  if (k === 'MEMORY') return <Brain className={`${cls} text-flow-purple`} />;
  if (k === 'AUTOMATION') return <Zap className={`${cls} text-warning`} />;
  if (k === 'CONNECTOR') return <Plug className={`${cls} text-success`} />;
  return <Clock className={`${cls} text-text-muted`} />;
}

function KindBadge({ kind }) {
  const k = String(kind || '').toUpperCase();
  const meta = KIND_META[k] ?? { label: kind ?? '' };
  const colorCls =
    k === 'MEMORY'     ? 'bg-flow-purple/10 text-flow-purple border-flow-purple/20' :
    k === 'AUTOMATION' ? 'bg-warning/10 text-warning border-warning/20' :
    k === 'CONNECTOR'  ? 'bg-success/10 text-success border-success/20' :
                         'bg-bg-secondary text-text-muted border-border-flow/40';
  return (
    <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold border uppercase tracking-wide ${colorCls}`}>
      {meta.label || kind}
    </span>
  );
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const RANGE_OPTIONS = [
  { label: '24h', value: 24 },
  { label: '7d',  value: 168 },
  { label: '30d', value: 720 },
];

const KIND_FILTERS = [
  { label: 'All',        value: 'ALL' },
  { label: 'Memory',     value: 'MEMORY' },
  { label: 'Automation', value: 'AUTOMATION' },
  { label: 'Connector',  value: 'CONNECTOR' },
];

// ─── Main component ────────────────────────────────────────────────────────────

export default function OperationalTimeline() {
  const [events, setEvents]         = useState([]);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(null);
  const [kindFilter, setKindFilter] = useState('ALL');
  const [range, setRange]           = useState(168);

  const fetchTimeline = useCallback(async (hrs) => {
    setLoading(true);
    setError(null);
    try {
      const res = await brainApi.timeline({ hours: hrs, limit: 100 });
      setEvents(Array.isArray(res.timeline) ? res.timeline : []);
    } catch (err) {
      setError(err.message || "Failed to load timeline.");
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // setTimeout(0) deferral — satisfies react-hooks/set-state-in-effect lint rule
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchTimeline(range);
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);

  // Client-side filter (guard with Array.isArray)
  const filtered = Array.isArray(events)
    ? (kindFilter === 'ALL'
        ? events
        : events.filter((e) => String(e.kind || '').toUpperCase() === kindFilter))
    : [];

  // Group by day label preserving newest-first order from the API
  const grouped = filtered.reduce((acc, event) => {
    const label = dayLabel(event.timestamp);
    if (!acc[label]) acc[label] = [];
    acc[label].push(event);
    return acc;
  }, {});
  const days = Object.keys(grouped);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-ui-xl font-bold text-text-primary tracking-tight flex items-center gap-2">
            <Clock className="w-5 h-5 text-flow-purple" />
            Operational Timeline
          </h1>
          <p className="text-ui-xs text-text-muted mt-0.5">
            The company&apos;s story, in order
          </p>
        </div>
        <button
          onClick={() => fetchTimeline(range)}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-ui-xs font-medium text-text-secondary hover:text-text-primary hover:bg-bg-hover border border-border-flow/60 transition-apple disabled:opacity-40 self-start"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* ── Controls bar ──────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Range selector */}
        <div className="inline-flex bg-bg-secondary border border-border-flow rounded-xl p-1 gap-1">
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setRange(opt.value)}
              className={`px-3 py-1.5 rounded-lg text-ui-xs font-semibold transition-apple ${
                range === opt.value
                  ? "bg-flow-purple text-white shadow"
                  : "text-text-secondary hover:text-text-primary hover:bg-bg-hover"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Kind filter */}
        <div className="inline-flex bg-bg-secondary border border-border-flow rounded-xl p-1 gap-1">
          {KIND_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setKindFilter(f.value)}
              className={`px-3 py-1.5 rounded-lg text-ui-xs font-semibold transition-apple ${
                kindFilter === f.value
                  ? "bg-flow-purple text-white shadow"
                  : "text-text-secondary hover:text-text-primary hover:bg-bg-hover"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Loading ───────────────────────────────────────────────────── */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <div className="w-8 h-8 rounded-full border-2 border-flow-purple/20 border-t-flow-purple animate-spin" />
          <span className="text-ui-xs text-text-muted font-medium uppercase tracking-wider">
            Loading timeline...
          </span>
        </div>
      )}

      {/* ── Error ─────────────────────────────────────────────────────── */}
      {!loading && error && (
        <Card className="p-6 border-critical/30 bg-critical/5">
          <div className="flex flex-col items-center gap-3 text-center">
            <AlertTriangle className="w-6 h-6 text-critical" />
            <p className="text-ui-sm text-text-primary font-medium">{error}</p>
            <button
              onClick={() => fetchTimeline(range)}
              className="px-4 py-2 rounded-lg text-ui-xs font-semibold bg-flow-purple text-white hover:bg-flow-purple/90 transition-apple"
            >
              Try Again
            </button>
          </div>
        </Card>
      )}

      {/* ── Empty state ───────────────────────────────────────────────── */}
      {!loading && !error && filtered.length === 0 && (
        <Card className="p-8 text-center">
          <Clock className="w-8 h-8 text-text-muted mx-auto mb-3" />
          <p className="text-ui-sm text-text-secondary">
            No operational events in this range.
          </p>
        </Card>
      )}

      {/* ── Timeline ──────────────────────────────────────────────────── */}
      {!loading && !error && days.length > 0 && (
        <div className="space-y-8 animate-fade-in">
          {days.map((day) => (
            <div key={day}>
              {/* Day header */}
              <div className="sticky top-0 z-10 flex items-center gap-3 mb-4 py-1 bg-bg-primary/80 backdrop-blur-sm">
                <span className="text-[10px] font-bold text-text-muted uppercase tracking-widest whitespace-nowrap">
                  {day}
                </span>
                <div className="flex-1 h-px bg-border-flow/30" />
              </div>

              {/* Events for this day — vertical rail */}
              <div className="relative pl-6">
                {/* Left rail line */}
                <div className="absolute left-2 top-0 bottom-0 w-px bg-border-flow/30" />

                <div className="space-y-4">
                  {Array.isArray(grouped[day]) &&
                    grouped[day].map((event) => {
                      const kindKey = String(event.kind || '').toUpperCase();
                      const meta = KIND_META[kindKey] ?? { label: event.kind ?? 'Event', dot: 'bg-border-flow' };
                      const chipCls = event.status ? statusChipClass(event.status) : null;

                      return (
                        <div key={event.id} className="relative flex items-start gap-3">
                          {/* Node dot on rail */}
                          <div
                            className={`absolute -left-[18px] mt-1.5 w-3 h-3 rounded-full border-2 border-bg-primary flex-shrink-0 ${meta.dot}`}
                          />

                          {/* Kind icon */}
                          <div className="mt-0.5 flex-shrink-0">
                            <KindIcon kind={event.kind} />
                          </div>

                          {/* Event card */}
                          <div className="flex-1 min-w-0 bg-bg-card border border-border-flow/40 rounded-xl p-3 hover:bg-bg-hover transition-apple">
                            <div className="flex items-start justify-between gap-2">
                              <span className="text-ui-xs font-semibold text-text-primary leading-snug">
                                {event.title}
                              </span>
                              <span className="text-[10px] text-text-muted whitespace-nowrap flex-shrink-0 mt-0.5">
                                {relativeTime(event.timestamp)}
                              </span>
                            </div>

                            {event.summary && (
                              <p className="text-[11px] text-text-secondary mt-1 line-clamp-2 leading-relaxed">
                                {event.summary}
                              </p>
                            )}

                            <div className="flex flex-wrap items-center gap-1.5 mt-2">
                              {/* Category badge */}
                              {event.category && (
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-bg-secondary border border-border-flow/40 text-text-muted uppercase tracking-wide">
                                  {String(event.category).replace(/_/g, ' ')}
                                </span>
                              )}

                              {/* Kind badge */}
                              <KindBadge kind={event.kind} />

                              {/* Status chip */}
                              {chipCls && (
                                <span
                                  className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold border uppercase tracking-wide ${chipCls}`}
                                >
                                  {String(event.status).replace(/_/g, ' ')}
                                </span>
                              )}

                              {/* Actor / source */}
                              {(event.actor || event.source) && (
                                <span className="text-[10px] text-text-muted ml-0.5">
                                  {event.actor ? `by ${event.actor}` : ''}
                                  {event.actor && event.source ? ' · ' : ''}
                                  {event.source ? `via ${event.source}` : ''}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
