import { useState, useEffect, useRef } from "react";
import {
  Download, Upload, CheckCircle2, AlertTriangle, RefreshCw,
  Database, GitPullRequest, FileText, Loader2, XCircle,
  Clock, Activity, ChevronRight, FileJson, Sparkles,
} from "lucide-react";
import { useWebSocket } from "../../hooks/useWebSocket";

const TABS = ["Import", "Create", "Sync", "Refresh", "Validate"];

const STAGE_LABELS = {
  stageValidate:               "Validating datasets",
  stageNormalize:              "Normalizing records",
  stageResolveRelationships:   "Resolving relationships",
  stageBootstrapWorkspace:     "Bootstrapping workspace",
  stageGenerateGraphs:         "Building knowledge + operational graphs",
  stageIngestMemory:           "Ingesting organizational memory",
  stageVectorize:              "Indexing vectors",
  stageRefreshRecommendations: "Refreshing recommendations",
  stageRefreshBriefings:       "Generating executive briefings",
  stageWarmCopilot:            "Warming copilot context",
};

const STAGE_ORDER = Object.keys(STAGE_LABELS);

const TAB_ENDPOINTS = {
  Import:   "/api/lifecycle/import",
  Create:   "/api/lifecycle/create",
  Sync:     "/api/lifecycle/sync",
  Refresh:  "/api/lifecycle/refresh",
  Validate: "/api/lifecycle/validate",
};

const TAB_DESCRIPTIONS = {
  Import:   "Ingest corporate twins, map workspace departments, build graph relationships, and seed the vector index from your JSON manifest.",
  Create:   "Bootstrap a fresh workspace by providing a complete organizational manifest. Creates all entities, roles, graphs and memory from scratch.",
  Sync:     "Incrementally update an existing workspace. Only changed or new records are processed — existing data is preserved.",
  Refresh:  "Rebuild recommendation scores, executive briefings, and copilot context from the current workspace state. No data input required.",
  Validate: "Dry-run validation against your manifest and datasets. No data is written — returns per-type errors, broken references, and warnings.",
};

const TAB_ICONS = {
  Import:   Download,
  Create:   Database,
  Sync:     GitPullRequest,
  Refresh:  RefreshCw,
  Validate: CheckCircle2,
};

function statusStyle(s) {
  switch (s?.toLowerCase()) {
    case "completed": return { color: "var(--p-normal-text)", background: "rgba(76,175,130,0.08)", border: "1px solid rgba(76,175,130,0.22)" };
    case "failed":    return { color: "var(--p-critical-text)", background: "rgba(255,87,87,0.08)", border: "1px solid rgba(255,87,87,0.22)" };
    case "running":   return { color: "var(--brand-text)", background: "rgba(232,103,43,0.08)", border: "1px solid rgba(232,103,43,0.22)" };
    default:          return { color: "var(--t4)", background: "rgba(31,27,22,0.05)", border: "1px solid var(--border)" };
  }
}

const StatusChip = ({ status }) => (
  <span style={{ ...statusStyle(status), fontSize: 9, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.10em", padding: "2px 8px", borderRadius: 3 }}>
    {status ?? "unknown"}
  </span>
);

const textareaStyle = {
  width: "100%", background: "rgba(31,27,22,0.08)", border: "1px solid var(--border-strong)",
  borderRadius: 4, padding: "12px 14px", fontSize: 11, color: "var(--t1)", outline: "none",
  resize: "vertical", boxSizing: "border-box", lineHeight: 1.6,
};

const labelStyle = {
  display: "block", fontSize: 8, fontWeight: 500, color: "var(--t5)",
  textTransform: "uppercase", letterSpacing: "0.10em", marginBottom: 6,
};

const ManifestInputs = ({ manifest, setManifest, datasets, setDatasets, parseError, onLoadDemo, loadingDemo }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
    {/* Demo shortcut */}
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", background: "rgba(232,103,43,0.04)", border: "1px solid rgba(232,103,43,0.22)", borderRadius: 4 }}>
      <div>
        <span style={{ display: "block", fontSize: 12, fontWeight: 500, color: "var(--brand-text)", marginBottom: 2 }}>Helios Software Inc. — Demo Company</span>
        <span style={{ fontSize: 10, color: "var(--t4)" }}>450 employees · 16 repos · 210 customers · 21 dataset types</span>
      </div>
      <button
        onClick={onLoadDemo}
        disabled={loadingDemo}
        style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", background: loadingDemo ? "rgba(232,103,43,0.10)" : "var(--brand)", border: "none", borderRadius: 4, fontSize: 11, fontWeight: 500, color: "#fff", cursor: loadingDemo ? "not-allowed" : "pointer", opacity: loadingDemo ? 0.6 : 1 }}
      >
        {loadingDemo ? <Loader2 style={{ width: 12, height: 12, animation: "spin 0.8s linear infinite" }} /> : <Sparkles style={{ width: 12, height: 12 }} />}
        {loadingDemo ? "Loading…" : "Load Demo"}
      </button>
    </div>

    <div>
      <label style={labelStyle}>Manifest JSON</label>
      <textarea
        rows={8}
        placeholder={'{ "schemaVersion": "1.0", "organization": { "name": "Acme" }, "datasets": [] }'}
        value={manifest}
        onChange={e => setManifest(e.target.value)}
        style={textareaStyle}
      />
    </div>
    <div>
      <label style={labelStyle}>Datasets JSON (type → records[])</label>
      <textarea
        rows={8}
        placeholder={'{ "employees": [], "customers": [], "documents": [] }'}
        value={datasets}
        onChange={e => setDatasets(e.target.value)}
        style={textareaStyle}
      />
    </div>
    {parseError && (
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "10px 12px", background: "rgba(255,87,87,0.05)", border: "1px solid rgba(255,87,87,0.22)", borderRadius: 4 }}>
        <AlertTriangle style={{ width: 14, height: 14, color: "var(--p-critical)", flexShrink: 0, marginTop: 1 }} />
        <span style={{ fontSize: 11, color: "var(--p-critical-text)" }}>{parseError}</span>
      </div>
    )}
  </div>
);

const ProgressView = ({ stages, operationResult, operationError, onReset }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {STAGE_ORDER.map(key => {
        const stage = stages[key];
        if (!stage) return null;
        return (
          <div key={key} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "rgba(31,27,22,0.04)", border: "1px solid var(--border)", borderRadius: 4 }}>
            {stage.status === "running"   && <Loader2 style={{ width: 14, height: 14, color: "var(--brand)", animation: "spin 0.8s linear infinite", flexShrink: 0 }} />}
            {stage.status === "completed" && <CheckCircle2 style={{ width: 14, height: 14, color: "var(--p-normal)", flexShrink: 0 }} />}
            {stage.status === "failed"    && <XCircle style={{ width: 14, height: 14, color: "var(--p-critical)", flexShrink: 0 }} />}
            <span style={{ fontSize: 11, color: stage.status === "completed" ? "var(--p-normal-text)" : stage.status === "failed" ? "var(--p-critical-text)" : "var(--t1)" }}>
              {STAGE_LABELS[key]}
            </span>
          </div>
        );
      })}
    </div>

    {operationResult && (
      <div style={{ padding: "16px", background: "rgba(76,175,130,0.05)", border: "1px solid rgba(76,175,130,0.22)", borderRadius: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <CheckCircle2 style={{ width: 16, height: 16, color: "var(--p-normal)" }} />
          <span style={{ fontSize: 12, fontWeight: 500, color: "var(--p-normal-text)" }}>Operation completed successfully</span>
        </div>
        {operationResult.statistics && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, fontSize: 10, color: "var(--t4)" }}>
            {Array.isArray(operationResult.statistics.datasets)
              ? operationResult.statistics.datasets.slice(0, 8).map((ds, i) => (
                <span key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <ChevronRight style={{ width: 10, height: 10, color: "var(--brand)" }} />
                  {ds.type}: <strong style={{ color: "var(--t1)", marginLeft: 3 }}>{ds.count}</strong>
                </span>
              ))
              : Object.entries(operationResult.statistics).slice(0, 8).map(([k, v]) => (
                <span key={k} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <ChevronRight style={{ width: 10, height: 10, color: "var(--brand)" }} />
                  {k.replace(/([A-Z])/g, " $1").trim()}: <strong style={{ color: "var(--t1)", marginLeft: 3 }}>{String(v)}</strong>
                </span>
              ))
            }
          </div>
        )}
        {operationResult.graphMetrics && (
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid rgba(76,175,130,0.18)", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, fontSize: 10, color: "var(--t4)" }}>
            {Object.entries(operationResult.graphMetrics).map(([k, v]) => (
              <span key={k} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <Activity style={{ width: 10, height: 10, color: "var(--brand)" }} />
                {k.replace(/([A-Z])/g, " $1").trim()}: <strong style={{ color: "var(--t1)", marginLeft: 3 }}>{String(v)}</strong>
              </span>
            ))}
          </div>
        )}
      </div>
    )}

    {operationError && (
      <div style={{ padding: "16px", background: "rgba(255,87,87,0.05)", border: "1px solid rgba(255,87,87,0.22)", borderRadius: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <XCircle style={{ width: 16, height: 16, color: "var(--p-critical)" }} />
          <span style={{ fontSize: 12, fontWeight: 500, color: "var(--p-critical-text)" }}>Operation failed</span>
        </div>
        {operationError.errors?.length > 0 && (
          <ul style={{ paddingLeft: 18, margin: 0, fontSize: 10, color: "var(--p-critical-text)" }}>
            {operationError.errors.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        )}
        {operationError.message && <p style={{ fontSize: 10, color: "var(--p-critical-text)", margin: 0, marginTop: 4 }}>{operationError.message}</p>}
      </div>
    )}

    {(operationResult || operationError) && (
      <button onClick={onReset} style={{ alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", background: "rgba(31,27,22,0.05)", border: "1px solid var(--border)", borderRadius: 4, fontSize: 11, color: "var(--t3)", cursor: "pointer" }}>
        <RefreshCw style={{ width: 12, height: 12 }} /> Start new operation
      </button>
    )}
  </div>
);

const ValidateResultPanel = ({ result }) => {
  if (!result) return null;
  const perTypeEntries = Object.entries(result.perType || {});
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, fontSize: 11 }}>
      {result.manifestErrors?.length > 0 && (
        <div style={{ padding: "10px 12px", background: "rgba(255,87,87,0.05)", border: "1px solid rgba(255,87,87,0.22)", borderRadius: 4 }}>
          <p style={{ fontWeight: 500, color: "var(--p-critical-text)", marginBottom: 6 }}>Manifest Errors</p>
          <ul style={{ paddingLeft: 16, margin: 0, color: "var(--p-critical-text)" }}>
            {result.manifestErrors.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        </div>
      )}
      {perTypeEntries.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 8, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.10em", color: "var(--t5)" }}>Per-type results</span>
          {perTypeEntries.map(([typeName, t], i) => (
            <div key={i} style={{ padding: "10px 12px", background: "rgba(31,27,22,0.04)", border: "1px solid var(--border)", borderRadius: 4 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: t.errors?.length ? 6 : 0 }}>
                <span style={{ fontWeight: 500, color: "var(--t1)" }}>{typeName}</span>
                <span style={{ ...(t.valid ? { color: "var(--p-normal-text)", background: "rgba(76,175,130,0.08)", border: "1px solid rgba(76,175,130,0.22)" } : { color: "var(--p-critical-text)", background: "rgba(255,87,87,0.08)", border: "1px solid rgba(255,87,87,0.22)" }), fontSize: 8, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.08em", padding: "2px 7px", borderRadius: 3 }}>
                  {t.valid ? "valid" : "invalid"}
                </span>
              </div>
              {t.errors?.length > 0 && (
                <ul style={{ paddingLeft: 14, margin: 0, fontSize: 10, color: "var(--p-critical-text)" }}>
                  {t.errors.map((e, j) => <li key={j}>{e}</li>)}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
      {result.brokenReferences?.length > 0 && (
        <div style={{ padding: "10px 12px", background: "rgba(255,87,87,0.05)", border: "1px solid rgba(255,87,87,0.22)", borderRadius: 4 }}>
          <p style={{ fontWeight: 500, color: "var(--p-critical-text)", marginBottom: 6 }}>Broken References</p>
          <ul style={{ paddingLeft: 16, margin: 0, color: "var(--p-critical-text)" }}>
            {result.brokenReferences.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </div>
      )}
      {result.warnings?.length > 0 && (
        <div style={{ padding: "10px 12px", background: "rgba(255,151,65,0.05)", border: "1px solid rgba(255,151,65,0.22)", borderRadius: 4 }}>
          <p style={{ fontWeight: 500, color: "var(--p-high-text)", marginBottom: 6 }}>Warnings</p>
          <ul style={{ paddingLeft: 16, margin: 0, color: "var(--p-high-text)" }}>
            {result.warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      )}
      {result.valid === true && !result.manifestErrors?.length && !result.brokenReferences?.length && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", background: "rgba(76,175,130,0.05)", border: "1px solid rgba(76,175,130,0.22)", borderRadius: 4 }}>
          <CheckCircle2 style={{ width: 14, height: 14, color: "var(--p-normal)" }} />
          <span style={{ fontSize: 11, color: "var(--p-normal-text)" }}>All datasets passed validation with no issues.</span>
        </div>
      )}
    </div>
  );
};

const ImportDashboard = () => {
  const { token, workspaceId, events, isAuthLoading } = useWebSocket();

  const [activeTab, setActiveTab]           = useState("Import");
  const [manifest, setManifest]             = useState("");
  const [datasets, setDatasets]             = useState("");
  const [parseError, setParseError]         = useState("");
  const [loadingDemo, setLoadingDemo]       = useState(false);

  const [executing, setExecuting]           = useState(false);
  const [stages, setStages]                 = useState({});
  const [operationResult, setOperationResult] = useState(null);
  const [operationError, setOperationError]   = useState(null);
  const [showProgress, setShowProgress]     = useState(false);

  const [validateResult, setValidateResult] = useState(null);
  const [validating, setValidating]         = useState(false);

  const [history, setHistory]               = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [hTab, setHTab]                     = useState(null);

  const lastEventIdRef = useRef(null);

  const loadHistory = () => {
    if (!token || !workspaceId) return;
    setTimeout(async () => {
      try {
        const res = await fetch("/api/lifecycle/history", {
          headers: { Authorization: `Bearer ${token}`, "workspace-id": workspaceId },
        });
        if (res.ok) setHistory((await res.json()).history ?? []);
      } catch {}
      finally { setHistoryLoading(false); }
    }, 0);
  };

  useEffect(() => {
    if (!isAuthLoading) loadHistory();
  }, [isAuthLoading, token, workspaceId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const latest = events[0];
    if (!latest || latest.id === lastEventIdRef.current) return;
    lastEventIdRef.current = latest.id;
    const { type, payload } = latest;
    setTimeout(() => {
      if (type === "LIFECYCLE_STARTED") {
        setShowProgress(true); setStages({}); setOperationResult(null); setOperationError(null);
      } else if (type === "LIFECYCLE_STAGE_STARTED") {
        if (payload?.stage) setStages(p => ({ ...p, [payload.stage]: { status: "running" } }));
      } else if (type === "LIFECYCLE_STAGE_COMPLETED") {
        if (payload?.stage) setStages(p => ({ ...p, [payload.stage]: { status: "completed" } }));
      } else if (type === "LIFECYCLE_STAGE_FAILED") {
        if (payload?.stage) setStages(p => ({ ...p, [payload.stage]: { status: "failed" } }));
      } else if (type === "LIFECYCLE_COMPLETED") {
        setExecuting(false); setOperationResult(payload ?? {}); loadHistory();
      } else if (type === "LIFECYCLE_FAILED") {
        setExecuting(false); setOperationError(payload ?? { message: "Unknown error" });
      }
    }, 0);
  }, [events]); // eslint-disable-line react-hooks/exhaustive-deps

  const parseInputs = () => {
    setParseError("");
    let parsedManifest, parsedDatasets;
    try { parsedManifest = JSON.parse(manifest); } catch {
      setParseError("Manifest JSON is invalid. Please check brackets and quotes."); return null;
    }
    try { parsedDatasets = JSON.parse(datasets || "{}"); } catch {
      setParseError("Datasets JSON is invalid. Please check brackets and quotes."); return null;
    }
    return { manifest: parsedManifest, datasets: parsedDatasets };
  };

  const handleLoadDemo = async () => {
    setLoadingDemo(true);
    try {
      const res = await fetch("/api/lifecycle/demo/manifest", {
        headers: { Authorization: `Bearer ${token}`, "workspace-id": workspaceId },
      });
      if (res.ok) {
        const body = await res.json();
        const { manifest: m, datasetSizes } = body;
        // Build compact datasets preview (first 3 records per type for the textarea)
        const datasetsPreview = {};
        for (const entry of (m.datasets ?? [])) {
          datasetsPreview[entry.type] = `(${(datasetSizes.find(d => d.type === entry.type)?.count ?? 0)} records — use Load Demo button to import)`;
        }
        setManifest(JSON.stringify(m, null, 2));
        setDatasets(JSON.stringify({ _note: "Datasets loaded server-side — click Execute Import" }, null, 2));
      }
    } catch {}
    finally { setLoadingDemo(false); }
  };

  const handleExecute = async () => {
    if (!token || !workspaceId) return;
    let body = {};
    if (activeTab !== "Refresh") {
      const parsed = parseInputs();
      if (!parsed) return;
      body = parsed;
    }
    setExecuting(true); setShowProgress(true); setStages({}); setOperationResult(null); setOperationError(null);
    try {
      const res = await fetch(TAB_ENDPOINTS[activeTab], {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, "workspace-id": workspaceId },
        body: activeTab !== "Refresh" ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        setExecuting(false);
        setOperationError({ message: errBody.error || `HTTP ${res.status}`, errors: errBody.errors ?? [] });
      }
    } catch (err) {
      setExecuting(false); setOperationError({ message: err.message });
    }
  };

  const handleDemoImport = async () => {
    if (!token || !workspaceId) return;
    setExecuting(true); setShowProgress(true); setStages({}); setOperationResult(null); setOperationError(null);
    try {
      const res = await fetch("/api/lifecycle/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, "workspace-id": workspaceId },
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        setExecuting(false);
        setOperationError({ message: errBody.error || `HTTP ${res.status}`, errors: errBody.errors ?? [] });
      }
    } catch (err) {
      setExecuting(false); setOperationError({ message: err.message });
    }
  };

  const handleValidate = async () => {
    if (!token || !workspaceId) return;
    const parsed = parseInputs();
    if (!parsed) return;
    setValidating(true); setValidateResult(null);
    setTimeout(async () => {
      try {
        const res = await fetch("/api/lifecycle/validate", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, "workspace-id": workspaceId },
          body: JSON.stringify(parsed),
        });
        setValidateResult(await res.json());
      } catch (err) {
        setValidateResult({ brokenReferences: [], warnings: [], types: [], error: err.message });
      } finally { setValidating(false); }
    }, 0);
  };

  const resetProgress = () => {
    setShowProgress(false); setStages({}); setOperationResult(null); setOperationError(null); setExecuting(false);
  };

  return (
    <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: 24 }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 500, color: "var(--t1)", letterSpacing: "-0.4px", display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <FileJson style={{ width: 22, height: 22, color: "var(--brand)" }} />
            Workspace Lifecycle Engine
          </h1>
          <p style={{ fontSize: 12, color: "var(--t4)", maxWidth: 560 }}>
            Import, create, sync, refresh, or validate workspace data through the lifecycle pipeline.
          </p>
        </div>
        {/* Quick demo import */}
        <button
          onClick={handleDemoImport}
          disabled={executing}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", background: "rgba(232,103,43,0.10)", border: "1px solid rgba(232,103,43,0.35)", borderRadius: 4, fontSize: 11, fontWeight: 500, color: "var(--brand-text)", cursor: executing ? "not-allowed" : "pointer", flexShrink: 0 }}
        >
          <Sparkles style={{ width: 13, height: 13 }} />
          Import Helios Demo
        </button>
      </div>

      {/* Tab bar + panel */}
      <div>
        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, borderBottom: "1px solid var(--border)", paddingBottom: 0 }}>
          {TABS.map(tab => {
            const Icon = TAB_ICONS[tab];
            const isActive = activeTab === tab;
            return (
              <button
                key={tab}
                onClick={() => { setActiveTab(tab); resetProgress(); setValidateResult(null); setParseError(""); }}
                onMouseEnter={() => setHTab(tab)}
                onMouseLeave={() => setHTab(null)}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", fontSize: 11, fontWeight: 500, cursor: "pointer", borderRadius: "4px 4px 0 0", border: "1px solid transparent", borderBottom: "none", marginBottom: -1, transition: "all 80ms",
                  background: isActive ? "var(--bg-card)" : hTab === tab ? "rgba(31,27,22,0.04)" : "transparent",
                  borderColor: isActive ? "var(--border-strong)" : "transparent",
                  color: isActive ? "var(--t1)" : "var(--t4)",
                }}
              >
                <Icon style={{ width: 12, height: 12 }} /> {tab}
              </button>
            );
          })}
        </div>

        {/* Panel */}
        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-strong)", borderTop: "none", borderRadius: "0 4px 4px 4px", padding: "24px", display: "flex", flexDirection: "column", gap: 20 }}>
          <p style={{ fontSize: 11, color: "var(--t4)", borderBottom: "1px solid var(--border)", paddingBottom: 14 }}>{TAB_DESCRIPTIONS[activeTab]}</p>

          {showProgress && activeTab !== "Validate" ? (
            <ProgressView stages={stages} operationResult={operationResult} operationError={operationError} onReset={resetProgress} />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              {activeTab === "Refresh" ? (
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px", background: "rgba(31,27,22,0.04)", border: "1px solid var(--border)", borderRadius: 4, fontSize: 11, color: "var(--t4)" }}>
                  <RefreshCw style={{ width: 14, height: 14, color: "var(--brand)", flexShrink: 0 }} />
                  Clicking <strong style={{ color: "var(--t1)", margin: "0 4px" }}>Run Refresh</strong> will rebuild recommendation scores, briefings, and copilot context across this workspace. No data is required.
                </div>
              ) : (
                <ManifestInputs
                  manifest={manifest} setManifest={setManifest}
                  datasets={datasets} setDatasets={setDatasets}
                  parseError={parseError}
                  onLoadDemo={handleLoadDemo}
                  loadingDemo={loadingDemo}
                />
              )}

              {activeTab === "Validate" && validateResult && (
                <div style={{ borderTop: "1px solid var(--border)", paddingTop: 16 }}>
                  <span style={{ display: "block", fontSize: 8, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.10em", color: "var(--t5)", marginBottom: 12 }}>Validation Results</span>
                  <ValidateResultPanel result={validateResult} />
                </div>
              )}

              {/* Action buttons */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 10, borderTop: "1px solid var(--border)", paddingTop: 16 }}>
                {activeTab === "Validate" ? (
                  <button onClick={handleValidate} disabled={validating || !manifest.trim()}
                    style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 16px", background: "var(--brand)", border: "none", borderRadius: 4, fontSize: 11, fontWeight: 500, color: "#fff", cursor: (validating || !manifest.trim()) ? "not-allowed" : "pointer", opacity: (validating || !manifest.trim()) ? 0.5 : 1 }}>
                    {validating ? <Loader2 style={{ width: 13, height: 13, animation: "spin 0.8s linear infinite" }} /> : <CheckCircle2 style={{ width: 13, height: 13 }} />}
                    {validating ? "Validating…" : "Validate"}
                  </button>
                ) : activeTab === "Refresh" ? (
                  <button onClick={handleExecute} disabled={executing}
                    style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 16px", background: "var(--brand)", border: "none", borderRadius: 4, fontSize: 11, fontWeight: 500, color: "#fff", cursor: executing ? "not-allowed" : "pointer", opacity: executing ? 0.5 : 1 }}>
                    {executing ? <Loader2 style={{ width: 13, height: 13, animation: "spin 0.8s linear infinite" }} /> : <RefreshCw style={{ width: 13, height: 13 }} />}
                    {executing ? "Running…" : "Run Refresh"}
                  </button>
                ) : (
                  <>
                    <button onClick={handleValidate} disabled={executing || validating || !manifest.trim()}
                      style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", background: "rgba(31,27,22,0.05)", border: "1px solid var(--border)", borderRadius: 4, fontSize: 11, color: "var(--t3)", cursor: (executing || validating || !manifest.trim()) ? "not-allowed" : "pointer", opacity: (executing || validating || !manifest.trim()) ? 0.5 : 1 }}>
                      <CheckCircle2 style={{ width: 12, height: 12 }} /> Validate
                    </button>
                    <button onClick={handleExecute} disabled={executing || validating || !manifest.trim()}
                      style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 16px", background: "var(--brand)", border: "none", borderRadius: 4, fontSize: 11, fontWeight: 500, color: "#fff", cursor: (executing || validating || !manifest.trim()) ? "not-allowed" : "pointer", opacity: (executing || validating || !manifest.trim()) ? 0.5 : 1 }}>
                      {executing ? <Loader2 style={{ width: 13, height: 13, animation: "spin 0.8s linear infinite" }} /> : <Upload style={{ width: 13, height: 13 }} />}
                      {executing ? "Running…" : `Execute ${activeTab}`}
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* History panel */}
      <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-strong)", borderRadius: 4, padding: "20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, borderBottom: "1px solid var(--border)", paddingBottom: 12, marginBottom: 16 }}>
          <Clock style={{ width: 13, height: 13, color: "var(--brand)" }} />
          <h2 style={{ fontSize: 9, fontWeight: 500, color: "var(--t1)", textTransform: "uppercase", letterSpacing: "0.10em" }}>Execution History</h2>
        </div>

        {historyLoading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[1, 2].map(i => (
              <div key={i} style={{ height: 60, borderRadius: 4, background: "rgba(31,27,22,0.04)", border: "1px solid var(--border)", position: "relative", overflow: "hidden" }}>
                <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, transparent 0%, rgba(31,27,22,0.05) 50%, transparent 100%)", animation: "shimmer-sweep 1.6s ease-in-out infinite" }} />
              </div>
            ))}
          </div>
        ) : history.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {history.map((h, i) => (
              <div key={h.importId ?? i} style={{ padding: "12px 14px", background: "rgba(31,27,22,0.04)", border: "1px solid var(--border)", borderRadius: 4 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <FileText style={{ width: 13, height: 13, color: "var(--brand)", flexShrink: 0 }} />
                    <div>
                      <span style={{ display: "block", fontSize: 11, fontWeight: 500, color: "var(--t1)" }}>{h.importId ?? "—"}</span>
                      <span style={{ fontSize: 9, color: "var(--t5)", textTransform: "uppercase", letterSpacing: "0.08em" }}>{h.operation ?? "import"}</span>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <StatusChip status={h.status} />
                    <span style={{ fontSize: 9, color: "var(--t5)", whiteSpace: "nowrap" }}>
                      {h.completedAt ? new Date(h.completedAt).toLocaleString() : "—"}
                    </span>
                  </div>
                </div>
                {(h.statistics || h.graphMetrics) && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px", fontSize: 9, color: "var(--t5)", paddingTop: 6, borderTop: "1px solid var(--border)" }}>
                    {Array.isArray(h.statistics?.datasets) && h.statistics.datasets.slice(0, 4).map((ds, j) => (
                      <span key={j} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <Activity style={{ width: 9, height: 9, color: "var(--brand)" }} />
                        {ds.type}: <strong style={{ color: "var(--t2)", marginLeft: 2 }}>{ds.count}</strong>
                      </span>
                    ))}
                    {h.graphMetrics && Object.entries(h.graphMetrics).slice(0, 2).map(([k, v]) => (
                      <span key={k} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <Activity style={{ width: 9, height: 9, color: "rgba(232,103,43,0.6)" }} />
                        {k}: <strong style={{ color: "var(--t2)", marginLeft: 2 }}>{String(v)}</strong>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p style={{ textAlign: "center", color: "var(--t5)", fontSize: 11, padding: "32px 0" }}>
            No lifecycle operations logged for this workspace yet.
          </p>
        )}
      </div>
    </div>
  );
};

export default ImportDashboard;
