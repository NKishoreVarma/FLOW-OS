import { useState, useEffect, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  X,
  Users,
  Briefcase,
  Building2,
  Calendar,
  Mail,
  FileText,
  GitPullRequest,
  CircleDot,
  Box,
  CheckCircle,
  Sparkles,
} from "lucide-react";
import { brainApi } from "../../lib/brainApi";
import {
  EVENT_OPEN_ENTITY,
  openEntityContext,
  emitActiveEntity,
} from "../../lib/entityContext";

const RELATED_GROUPS = [
  { key: "people",       label: "People",        Icon: Users },
  { key: "projects",     label: "Projects",      Icon: Briefcase },
  { key: "customers",    label: "Customers",     Icon: Building2 },
  { key: "meetings",     label: "Meetings",      Icon: Calendar },
  { key: "emails",       label: "Emails",        Icon: Mail },
  { key: "documents",    label: "Documents",     Icon: FileText },
  { key: "pullRequests", label: "Pull Requests", Icon: GitPullRequest },
  { key: "issues",       label: "Issues",        Icon: CircleDot },
  { key: "other",        label: "Other",         Icon: Box },
];

function GroupSection({ Icon, label, items, count }) {
  if (!Array.isArray(items) || items.length === 0) return null;
  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-3.5 h-3.5 text-flow-purple flex-shrink-0" />
        <span className="text-[10px] font-bold text-text-secondary uppercase tracking-wider">
          {label}
        </span>
        <span className="ml-auto text-[10px] text-text-muted bg-bg-hover border border-border-flow/50 rounded-full px-1.5 py-0.5 font-semibold">
          {count ?? items.length}
        </span>
      </div>
      <div className="space-y-1">
        {items.map((item) => (
          <button
            key={item.id ?? item.name}
            onClick={() => openEntityContext(item.id, item.name)}
            className="w-full text-left bg-bg-hover border border-border-flow/40 hover:border-flow-purple/40 rounded-lg px-3 py-2 transition-colors cursor-pointer group"
          >
            <span className="block text-ui-xs font-semibold text-text-primary group-hover:text-flow-purple transition-colors">
              {item.name}
            </span>
            {(item.type || item.relation) && (
              <span className="block text-[10px] text-text-muted mt-0.5">
                {[item.type, item.relation].filter(Boolean).join(" · ")}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

export function EntityContextContent({ entityId, name }) {
  const [context, setContext] = useState(null);
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async (id) => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [ctxResult, recResult] = await Promise.allSettled([
        brainApi.context(id),
        brainApi.recommendations(),
      ]);

      if (ctxResult.status === "fulfilled") {
        setContext(ctxResult.value?.context ?? null);
      } else {
        setError(ctxResult.reason?.message || "Failed to load entity context.");
      }

      if (recResult.status === "fulfilled") {
        const recs = recResult.value?.recommendations;
        setRecommendations(Array.isArray(recs) ? recs.slice(0, 3) : []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchData(entityId);
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityId]);

  const displayName = name || entityId;

  if (!entityId) {
    return (
      <div className="flex flex-col items-center justify-center h-40 text-center px-4">
        <Box className="w-8 h-8 text-text-muted mb-2" />
        <p className="text-ui-xs text-text-muted">No entity selected.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-40 gap-3">
        <div className="w-6 h-6 rounded-full border-2 border-flow-purple/20 border-t-flow-purple animate-spin" />
        <span className="text-[11px] text-text-muted font-medium uppercase tracking-wider">
          Loading context…
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-40 gap-3 px-4 text-center">
        <CircleDot className="w-6 h-6 text-critical" />
        <p className="text-ui-xs text-text-primary font-medium">{error}</p>
        <button
          onClick={() => fetchData(entityId)}
          className="text-[11px] px-3 py-1.5 rounded-lg bg-flow-purple text-white hover:bg-flow-purple/90 transition-colors cursor-pointer"
        >
          Retry
        </button>
      </div>
    );
  }

  const related = context?.related ?? {};
  const decisions = Array.isArray(context?.decisions) ? context.decisions : [];
  const neighborCount = context?.neighborCount ?? 0;

  const hasRelated = RELATED_GROUPS.some(
    ({ key }) => Array.isArray(related[key]) && related[key].length > 0
  );
  const isEmpty = !hasRelated && decisions.length === 0 && recommendations.length === 0;

  return (
    <div className="px-4 pb-4">
      {/* Entity header */}
      <div className="py-3 mb-2 border-b border-border-flow/40">
        <p className="text-ui-sm font-bold text-text-primary truncate">{displayName}</p>
        <p className="text-[11px] text-text-muted mt-0.5">
          {neighborCount} connected {neighborCount === 1 ? "entity" : "entities"}
        </p>
      </div>

      {isEmpty && (
        <div className="flex flex-col items-center justify-center py-10 text-center gap-3">
          <Box className="w-7 h-7 text-text-muted" />
          <p className="text-ui-xs text-text-secondary">
            No connected context found for this entity yet.
          </p>
        </div>
      )}

      {/* Related groups */}
      {RELATED_GROUPS.map(({ key, label, Icon }) => (
        <GroupSection
          key={key}
          Icon={Icon}
          label={label}
          items={related[key]}
        />
      ))}

      {/* Decisions */}
      {decisions.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle className="w-3.5 h-3.5 text-success flex-shrink-0" />
            <span className="text-[10px] font-bold text-text-secondary uppercase tracking-wider">
              Decisions
            </span>
            <span className="ml-auto text-[10px] text-text-muted bg-bg-hover border border-border-flow/50 rounded-full px-1.5 py-0.5 font-semibold">
              {decisions.length}
            </span>
          </div>
          <div className="space-y-1">
            {decisions.map((d) => (
              <div
                key={d.id ?? d.title}
                className="bg-bg-hover border border-border-flow/40 rounded-lg px-3 py-2"
              >
                <span className="block text-ui-xs font-semibold text-text-primary">{d.title}</span>
                {d.createdAt && (
                  <span className="block text-[10px] text-text-muted mt-0.5">
                    {new Date(d.createdAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Active Recommendations */}
      {recommendations.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-3.5 h-3.5 text-flow-purple flex-shrink-0" />
            <span className="text-[10px] font-bold text-text-secondary uppercase tracking-wider">
              Active Recommendations
            </span>
            <span className="ml-auto text-[10px] text-text-muted bg-bg-hover border border-border-flow/50 rounded-full px-1.5 py-0.5 font-semibold">
              {recommendations.length}
            </span>
          </div>
          <div className="space-y-1">
            {recommendations.map((rec) => (
              <div
                key={rec.id ?? rec.title}
                className="bg-bg-hover border border-border-flow/40 rounded-lg px-3 py-2 flex items-start justify-between gap-2"
              >
                <span className="text-ui-xs font-semibold text-text-primary leading-snug">
                  {rec.title}
                </span>
                {rec.confidence != null && (
                  <span className="text-[10px] font-bold text-flow-purple bg-flow-purple/10 border border-flow-purple/20 rounded-full px-1.5 py-0.5 flex-shrink-0">
                    {rec.confidence}%
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function EntityContextPanel() {
  const [open, setOpen] = useState(false);
  const [entityId, setEntityId] = useState(null);
  const [name, setName] = useState("");

  useEffect(() => {
    const handler = (e) => {
      const { entityId: eid, name: ename } = e.detail ?? {};
      setEntityId(eid);
      setName(ename ?? "");
      setOpen(true);
      emitActiveEntity(eid);
    };
    window.addEventListener(EVENT_OPEN_ENTITY, handler);
    return () => window.removeEventListener(EVENT_OPEN_ENTITY, handler);
  }, []);

  const handleClose = () => {
    setOpen(false);
    emitActiveEntity(null);
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="entity-panel-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 bg-black/50 z-40"
            onClick={handleClose}
          />

          {/* Slide-over drawer */}
          <motion.div
            key="entity-panel-drawer"
            initial={{ x: "100%", opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: "100%", opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="fixed inset-y-0 right-0 z-50 w-[440px] max-w-[calc(100vw-2rem)] bg-bg-card border-l border-white/10 shadow-2xl flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3.5 border-b border-border-flow/70 flex-shrink-0">
              <div>
                <span className="text-ui-sm font-semibold text-text-primary">
                  Cross-Capability Context
                </span>
                {name && (
                  <p className="text-[11px] text-text-muted mt-0.5 truncate max-w-[280px]">
                    {name}
                  </p>
                )}
              </div>
              <button
                onClick={handleClose}
                className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors cursor-pointer flex-shrink-0"
                aria-label="Close entity context panel"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto">
              <EntityContextContent entityId={entityId} name={name} />
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
