import { useState, useEffect, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  X, Users, Briefcase, Building2, Calendar, Mail, FileText,
  GitPullRequest, CircleDot, Box, CheckCircle, Sparkles,
} from "lucide-react";
import { brainApi } from "../../lib/brainApi";
import { EVENT_OPEN_ENTITY, openEntityContext, emitActiveEntity } from "../../lib/entityContext";

const RELATED_GROUPS = [
  { key: "people",       label: "People",        Icon: Users        },
  { key: "projects",     label: "Projects",      Icon: Briefcase    },
  { key: "customers",    label: "Customers",     Icon: Building2    },
  { key: "meetings",     label: "Meetings",      Icon: Calendar     },
  { key: "emails",       label: "Emails",        Icon: Mail         },
  { key: "documents",    label: "Documents",     Icon: FileText     },
  { key: "pullRequests", label: "Pull Requests", Icon: GitPullRequest },
  { key: "issues",       label: "Issues",        Icon: CircleDot    },
  { key: "other",        label: "Other",         Icon: Box          },
];

function GroupSection({ Icon, label, items }) {
  const [h, setH] = useState(null);
  if (!Array.isArray(items) || items.length === 0) return null;
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}>
        <Icon style={{ width: 12, height: 12, color: "var(--brand)", flexShrink: 0 }} />
        <span style={{ fontSize: 9, fontWeight: 500, color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.10em" }}>{label}</span>
        <span style={{ marginLeft: "auto", fontSize: 9, fontWeight: 500, color: "var(--t5)", background: "rgba(31,27,22,0.05)", border: "1px solid var(--border)", borderRadius: 10, padding: "1px 6px" }}>{items.length}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {items.map((item) => (
          <button
            key={item.id ?? item.name}
            onClick={() => openEntityContext(item.id, item.name)}
            onMouseEnter={() => setH(item.id ?? item.name)}
            onMouseLeave={() => setH(null)}
            style={{ width: "100%", textAlign: "left", background: h === (item.id ?? item.name) ? "var(--bg-hover)" : "rgba(31,27,22,0.045)", border: `1px solid ${h === (item.id ?? item.name) ? "rgba(232,103,43,0.28)" : "var(--border)"}`, borderRadius: 4, padding: "7px 10px", cursor: "pointer", transition: "all 100ms" }}
          >
            <span style={{ display: "block", fontSize: 12, fontWeight: 500, color: h === (item.id ?? item.name) ? "var(--brand-text)" : "var(--t1)", transition: "color 100ms" }}>{item.name}</span>
            {(item.type || item.relation) && (
              <span style={{ display: "block", fontSize: 10, color: "var(--t5)", marginTop: 2 }}>
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
  const [context, setContext]               = useState(null);
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading]               = useState(false);
  const [error, setError]                   = useState(null);

  const fetchData = useCallback(async (id) => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [ctxResult, recResult] = await Promise.allSettled([
        brainApi.context(id),
        brainApi.recommendations(),
      ]);
      if (ctxResult.status === "fulfilled") setContext(ctxResult.value?.context ?? null);
      else setError(ctxResult.reason?.message || "Failed to load entity context.");
      if (recResult.status === "fulfilled") {
        const recs = recResult.value?.recommendations;
        setRecommendations(Array.isArray(recs) ? recs.slice(0, 3) : []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => { fetchData(entityId); }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityId]);

  const displayName = name || entityId;

  if (!entityId) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 160, textAlign: "center", padding: "0 16px" }}>
        <Box style={{ width: 28, height: 28, color: "var(--t5)", marginBottom: 8 }} />
        <p style={{ fontSize: 12, color: "var(--t5)" }}>No entity selected.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 160, gap: 10 }}>
        <div style={{ width: 24, height: 24, borderRadius: "50%", border: "2px solid rgba(232,103,43,0.20)", borderTopColor: "var(--brand)", animation: "spin 0.8s linear infinite" }} />
        <span style={{ fontSize: 10, color: "var(--t5)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Loading context…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 160, gap: 10, padding: "0 16px", textAlign: "center" }}>
        <CircleDot style={{ width: 24, height: 24, color: "var(--p-critical)" }} />
        <p style={{ fontSize: 12, color: "var(--t2)", fontWeight: 500 }}>{error}</p>
        <button
          onClick={() => fetchData(entityId)}
          style={{ fontSize: 11, padding: "5px 14px", borderRadius: 4, background: "var(--brand)", border: "none", color: "#fff", cursor: "pointer" }}
        >
          Retry
        </button>
      </div>
    );
  }

  const related       = context?.related ?? {};
  const decisions     = Array.isArray(context?.decisions) ? context.decisions : [];
  const neighborCount = context?.neighborCount ?? 0;
  const hasRelated    = RELATED_GROUPS.some(({ key }) => Array.isArray(related[key]) && related[key].length > 0);
  const isEmpty       = !hasRelated && decisions.length === 0 && recommendations.length === 0;

  return (
    <div style={{ padding: "0 16px 16px" }}>
      {/* Entity header */}
      <div style={{ padding: "12px 0 10px", marginBottom: 8, borderBottom: "1px solid var(--border)" }}>
        <p style={{ fontSize: 13, fontWeight: 500, color: "var(--t1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{displayName}</p>
        <p style={{ fontSize: 11, color: "var(--t5)", marginTop: 2 }}>{neighborCount} connected {neighborCount === 1 ? "entity" : "entities"}</p>
      </div>

      {isEmpty && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "32px 0", textAlign: "center", gap: 10 }}>
          <Box style={{ width: 26, height: 26, color: "var(--t5)" }} />
          <p style={{ fontSize: 12, color: "var(--t4)", fontWeight: 300 }}>No connected context found for this entity yet.</p>
        </div>
      )}

      {RELATED_GROUPS.map(({ key, label, Icon }) => (
        <GroupSection key={key} Icon={Icon} label={label} items={related[key]} />
      ))}

      {decisions.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}>
            <CheckCircle style={{ width: 12, height: 12, color: "var(--p-normal)", flexShrink: 0 }} />
            <span style={{ fontSize: 9, fontWeight: 500, color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.10em" }}>Decisions</span>
            <span style={{ marginLeft: "auto", fontSize: 9, fontWeight: 500, color: "var(--t5)", background: "rgba(31,27,22,0.05)", border: "1px solid var(--border)", borderRadius: 10, padding: "1px 6px" }}>{decisions.length}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {decisions.map((d) => (
              <div key={d.id ?? d.title} style={{ background: "rgba(31,27,22,0.045)", border: "1px solid var(--border)", borderRadius: 4, padding: "7px 10px" }}>
                <span style={{ display: "block", fontSize: 12, fontWeight: 500, color: "var(--t1)" }}>{d.title}</span>
                {d.createdAt && (
                  <span style={{ display: "block", fontSize: 10, color: "var(--t5)", marginTop: 2 }}>
                    {new Date(d.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {recommendations.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}>
            <Sparkles style={{ width: 12, height: 12, color: "var(--brand)", flexShrink: 0 }} />
            <span style={{ fontSize: 9, fontWeight: 500, color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.10em" }}>Active Recommendations</span>
            <span style={{ marginLeft: "auto", fontSize: 9, fontWeight: 500, color: "var(--t5)", background: "rgba(31,27,22,0.05)", border: "1px solid var(--border)", borderRadius: 10, padding: "1px 6px" }}>{recommendations.length}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {recommendations.map((rec) => (
              <div key={rec.id ?? rec.title} style={{ background: "rgba(31,27,22,0.045)", border: "1px solid var(--border)", borderRadius: 4, padding: "7px 10px", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 500, color: "var(--t1)", lineHeight: 1.3 }}>{rec.title}</span>
                {rec.confidence != null && (
                  <span style={{ fontSize: 9, fontWeight: 500, color: "var(--brand-text)", background: "rgba(232,103,43,0.10)", border: "1px solid rgba(232,103,43,0.22)", borderRadius: 10, padding: "2px 6px", flexShrink: 0 }}>
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
  const [open, setOpen]       = useState(false);
  const [entityId, setEntityId] = useState(null);
  const [name, setName]       = useState("");

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

  const handleClose = () => { setOpen(false); emitActiveEntity(null); };

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e) => { if (e.key === "Escape") handleClose(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="entity-panel-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            style={{ position: "fixed", inset: 0, background: "rgba(31,27,22,0.12)", zIndex: 40 }}
            onClick={handleClose}
          />

          <motion.div
            key="entity-panel-drawer"
            initial={{ x: "100%", opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: "100%", opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            role="dialog"
            aria-label="Cross-Capability Context"
            aria-modal="true"
            style={{ position: "fixed", inset: "0 0 0 auto", zIndex: 50, width: 440, maxWidth: "calc(100vw - 2rem)", background: "var(--bg-sidebar)", borderLeft: "1px solid var(--border-strong)", boxShadow: "-12px 0 40px rgba(31,27,22,0.12)", display: "flex", flexDirection: "column" }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
              <div>
                <span style={{ fontSize: 13, fontWeight: 500, color: "var(--t1)" }}>Cross-Capability Context</span>
                {name && <p style={{ fontSize: 11, color: "var(--t5)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 280 }}>{name}</p>}
              </div>
              <button
                onClick={handleClose}
                aria-label="Close context panel"
                style={{ padding: 6, borderRadius: 4, background: "transparent", border: "none", color: "var(--t5)", cursor: "pointer", display: "flex", alignItems: "center", flexShrink: 0 }}
              >
                <X style={{ width: 14, height: 14 }} />
              </button>
            </div>

            <div style={{ flex: 1, overflowY: "auto" }}>
              <EntityContextContent entityId={entityId} name={name} />
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
