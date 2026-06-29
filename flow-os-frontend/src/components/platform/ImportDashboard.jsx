import { useState, useEffect, useRef } from "react";
import {
  Download, Upload, CheckCircle2, AlertTriangle, RefreshCw,
  Database, GitPullRequest, FileText, Loader2, XCircle,
  Clock, Activity, ChevronRight, FileJson
} from "lucide-react";
import PageContainer from "../ui/PageContainer";
import Card from "../ui/Card";
import Button from "../ui/Button";
import Skeleton from "../ui/Skeleton";
import { useWebSocket } from "../../hooks/useWebSocket";

// ─── Constants ──────────────────────────────────────────────────────────────

const TABS = ["Import", "Create", "Sync", "Refresh", "Validate"];

const STAGE_LABELS = {
  stageValidate: "Validating datasets",
  stageNormalize: "Normalizing records",
  stageResolveRelationships: "Resolving relationships",
  stageBootstrapWorkspace: "Bootstrapping workspace",
  stageGenerateGraphs: "Building knowledge + operational graphs",
  stageIngestMemory: "Ingesting organizational memory",
  stageVectorize: "Indexing vectors",
  stageRefreshRecommendations: "Refreshing recommendations",
  stageRefreshBriefings: "Generating executive briefings",
  stageWarmCopilot: "Warming copilot context",
};

const STAGE_ORDER = Object.keys(STAGE_LABELS);

const TAB_ENDPOINTS = {
  Import: "/api/lifecycle/import",
  Create: "/api/lifecycle/create",
  Sync: "/api/lifecycle/sync",
  Refresh: "/api/lifecycle/refresh",
  Validate: "/api/lifecycle/validate",
};

const TAB_DESCRIPTIONS = {
  Import: "Ingest corporate twins, map workspace departments, build graph relationships, and seed the vector index from your JSON manifest.",
  Create: "Bootstrap a fresh workspace by providing a complete organizational manifest. Creates all entities, roles, graphs and memory from scratch.",
  Sync: "Incrementally update an existing workspace. Only changed or new records are processed — existing data is preserved.",
  Refresh: "Rebuild recommendation scores, executive briefings, and copilot context from the current workspace state. No data input required.",
  Validate: "Dry-run validation against your manifest and datasets. No data is written — returns per-type errors, broken references, and warnings.",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const StatusChip = ({ status }) => {
  const map = {
    completed: "text-success bg-success/10 border-success/20",
    failed: "text-error bg-error/10 border-error/20",
    running: "text-flow-purple bg-flow-purple/10 border-flow-purple/20",
    pending: "text-text-secondary bg-bg-secondary border-border-flow",
  };
  const cls = map[status?.toLowerCase()] ?? map.pending;
  return (
    <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded border ${cls}`}>
      {status ?? "unknown"}
    </span>
  );
};

// ─── Sub-components ──────────────────────────────────────────────────────────

const ManifestInputs = ({ manifest, setManifest, datasets, setDatasets, parseError }) => (
  <div className="space-y-4">
    <div className="space-y-1">
      <label className="text-[10px] font-bold uppercase tracking-widest text-text-secondary">
        Manifest JSON
      </label>
      <textarea
        className="w-full h-44 bg-bg-secondary border border-border-flow/60 text-text-primary font-mono text-xs rounded-xl p-4 focus:outline-none focus:border-flow-purple/80 select-text resize-none"
        placeholder='{ "schemaVersion": "1.0", "organization": { "name": "Acme" }, "datasets": [] }'
        value={manifest}
        onChange={(e) => setManifest(e.target.value)}
      />
    </div>
    <div className="space-y-1">
      <label className="text-[10px] font-bold uppercase tracking-widest text-text-secondary">
        Datasets JSON (type → records[])
      </label>
      <textarea
        className="w-full h-44 bg-bg-secondary border border-border-flow/60 text-text-primary font-mono text-xs rounded-xl p-4 focus:outline-none focus:border-flow-purple/80 select-text resize-none"
        placeholder='{ "users": [], "projects": [], "documents": [] }'
        value={datasets}
        onChange={(e) => setDatasets(e.target.value)}
      />
    </div>
    {parseError && (
      <div className="flex items-start gap-2 text-error text-ui-xs bg-error/5 border border-error/20 rounded-lg p-3">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
        <span>{parseError}</span>
      </div>
    )}
  </div>
);

const ProgressView = ({ stages, operationResult, operationError, onReset }) => (
  <div className="space-y-4">
    <div className="space-y-2">
      {STAGE_ORDER.map((key) => {
        const stage = stages[key];
        if (!stage) return null;
        return (
          <div key={key} className="flex items-center gap-3 p-3 bg-bg-secondary rounded-lg border border-border-flow/50">
            {stage.status === "running" && (
              <Loader2 className="w-4 h-4 text-flow-purple animate-spin shrink-0" />
            )}
            {stage.status === "completed" && (
              <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
            )}
            {stage.status === "failed" && (
              <XCircle className="w-4 h-4 text-error shrink-0" />
            )}
            <span className={`text-ui-xs font-medium ${
              stage.status === "completed" ? "text-success" :
              stage.status === "failed" ? "text-error" :
              "text-text-primary"
            }`}>
              {STAGE_LABELS[key]}
            </span>
          </div>
        );
      })}
    </div>

    {operationResult && (
      <div className="p-4 bg-success/5 border border-success/20 rounded-xl space-y-3">
        <div className="flex items-center gap-2 text-success font-bold text-ui-sm">
          <CheckCircle2 className="w-5 h-5" />
          <span>Operation completed successfully</span>
        </div>
        {operationResult.statistics && (
          <div className="grid grid-cols-2 gap-2 text-ui-xs text-text-secondary">
            {Object.entries(operationResult.statistics).map(([k, v]) => (
              <span key={k} className="flex items-center gap-1">
                <ChevronRight className="w-3 h-3 text-flow-purple" />
                <span className="capitalize">{k.replace(/([A-Z])/g, " $1").trim()}: <strong className="text-text-primary">{String(v)}</strong></span>
              </span>
            ))}
          </div>
        )}
        {operationResult.graphMetrics && (
          <div className="pt-2 border-t border-border-flow/30 grid grid-cols-2 gap-2 text-ui-xs text-text-secondary">
            {Object.entries(operationResult.graphMetrics).map(([k, v]) => (
              <span key={k} className="flex items-center gap-1">
                <Activity className="w-3 h-3 text-flow-purple" />
                <span className="capitalize">{k.replace(/([A-Z])/g, " $1").trim()}: <strong className="text-text-primary">{String(v)}</strong></span>
              </span>
            ))}
          </div>
        )}
      </div>
    )}

    {operationError && (
      <div className="p-4 bg-error/5 border border-error/20 rounded-xl space-y-2">
        <div className="flex items-center gap-2 text-error font-bold text-ui-sm">
          <XCircle className="w-5 h-5" />
          <span>Operation failed</span>
        </div>
        {operationError.errors?.length > 0 && (
          <ul className="list-disc pl-5 space-y-0.5 text-ui-xs text-error">
            {operationError.errors.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        )}
        {operationError.message && (
          <p className="text-ui-xs text-error">{operationError.message}</p>
        )}
      </div>
    )}

    {(operationResult || operationError) && (
      <Button variant="secondary" size="sm" onClick={onReset}>
        <RefreshCw className="w-3.5 h-3.5 mr-2" /> Start new operation
      </Button>
    )}
  </div>
);

const ValidateResultPanel = ({ result }) => {
  if (!result) return null;
  return (
    <div className="space-y-4 text-ui-xs">
      {/* Per-type rows */}
      {result.types?.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-text-secondary">Per-type results</p>
          {result.types.map((t, i) => (
            <div key={i} className="p-3 bg-bg-secondary border border-border-flow/50 rounded-lg space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-bold text-text-primary">{t.type}</span>
                {t.valid ? (
                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded border text-success bg-success/10 border-success/20">valid</span>
                ) : (
                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded border text-error bg-error/10 border-error/20">invalid</span>
                )}
              </div>
              {t.errors?.length > 0 && (
                <ul className="list-disc pl-4 space-y-0.5 text-error">
                  {t.errors.map((e, j) => <li key={j}>{e}</li>)}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Broken references */}
      {result.brokenReferences?.length > 0 && (
        <div className="p-3 bg-error/5 border border-error/20 rounded-lg space-y-1">
          <p className="font-bold text-error">Broken References</p>
          <ul className="list-disc pl-4 space-y-0.5 text-error">
            {result.brokenReferences.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </div>
      )}

      {/* Warnings */}
      {result.warnings?.length > 0 && (
        <div className="p-3 bg-warning/5 border border-warning/20 rounded-lg space-y-1">
          <p className="font-bold text-warning">Warnings</p>
          <ul className="list-disc pl-4 space-y-0.5 text-warning">
            {result.warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      )}

      {/* All-clear */}
      {!result.types?.length && !result.brokenReferences?.length && !result.warnings?.length && (
        <div className="flex items-center gap-2 text-success p-3 bg-success/5 border border-success/20 rounded-lg">
          <CheckCircle2 className="w-4 h-4" />
          <span>All datasets passed validation with no issues.</span>
        </div>
      )}
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

const ImportDashboard = () => {
  const { token, workspaceId, events, isAuthLoading } = useWebSocket();

  const [activeTab, setActiveTab] = useState("Import");
  const [manifest, setManifest] = useState("");
  const [datasets, setDatasets] = useState("");
  const [parseError, setParseError] = useState("");

  const [executing, setExecuting] = useState(false);
  const [stages, setStages] = useState({});
  const [operationResult, setOperationResult] = useState(null);
  const [operationError, setOperationError] = useState(null);
  const [showProgress, setShowProgress] = useState(false);

  const [validateResult, setValidateResult] = useState(null);
  const [validating, setValidating] = useState(false);

  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  const lastEventIdRef = useRef(null);

  // ── History fetch (declared first so WS effect can reference it) ───────────
  const loadHistory = () => {
    if (!token || !workspaceId) return;
    setTimeout(async () => {
      try {
        const res = await fetch("/api/lifecycle/history", {
          headers: {
            Authorization: `Bearer ${token}`,
            "workspace-id": workspaceId,
          },
        });
        if (res.ok) {
          const body = await res.json();
          setHistory(body.history ?? []);
        }
      } catch (err) {
        console.error("Failed to fetch lifecycle history:", err);
      } finally {
        setHistoryLoading(false);
      }
    }, 0);
  };

  useEffect(() => {
    if (!isAuthLoading) {
      loadHistory();
    }
  }, [isAuthLoading, token, workspaceId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── WS event consumer ──────────────────────────────────────────────────────
  useEffect(() => {
    const latest = events[0];
    if (!latest) return;
    if (latest.id === lastEventIdRef.current) return;
    lastEventIdRef.current = latest.id;

    const { type, payload } = latest;

    setTimeout(() => {
      if (type === "LIFECYCLE_STARTED") {
        setShowProgress(true);
        setStages({});
        setOperationResult(null);
        setOperationError(null);
      } else if (type === "LIFECYCLE_STAGE_STARTED") {
        const stageName = payload?.stage;
        if (stageName) {
          setStages((prev) => ({ ...prev, [stageName]: { status: "running" } }));
        }
      } else if (type === "LIFECYCLE_STAGE_COMPLETED") {
        const stageName = payload?.stage;
        if (stageName) {
          setStages((prev) => ({ ...prev, [stageName]: { status: "completed" } }));
        }
      } else if (type === "LIFECYCLE_STAGE_FAILED") {
        const stageName = payload?.stage;
        if (stageName) {
          setStages((prev) => ({ ...prev, [stageName]: { status: "failed" } }));
        }
      } else if (type === "LIFECYCLE_COMPLETED") {
        setExecuting(false);
        setOperationResult(payload ?? {});
        loadHistory();
      } else if (type === "LIFECYCLE_FAILED") {
        setExecuting(false);
        setOperationError(payload ?? { message: "Unknown error" });
      }
    }, 0);
  }, [events]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Parse helpers ──────────────────────────────────────────────────────────
  const parseInputs = () => {
    setParseError("");
    let parsedManifest, parsedDatasets;
    try {
      parsedManifest = JSON.parse(manifest);
    } catch {
      setParseError("Manifest JSON is invalid. Please check brackets and quotes.");
      return null;
    }
    try {
      parsedDatasets = JSON.parse(datasets || "{}");
    } catch {
      setParseError("Datasets JSON is invalid. Please check brackets and quotes.");
      return null;
    }
    return { manifest: parsedManifest, datasets: parsedDatasets };
  };

  // ── Execute operation ──────────────────────────────────────────────────────
  const handleExecute = async () => {
    if (!token || !workspaceId) return;

    let body = {};
    if (activeTab !== "Refresh") {
      const parsed = parseInputs();
      if (!parsed) return;
      body = parsed;
    }

    setExecuting(true);
    setShowProgress(true);
    setStages({});
    setOperationResult(null);
    setOperationError(null);

    try {
      const res = await fetch(TAB_ENDPOINTS[activeTab], {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "workspace-id": workspaceId,
        },
        body: activeTab !== "Refresh" ? JSON.stringify(body) : undefined,
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        setExecuting(false);
        setOperationError({ message: errBody.error || `HTTP ${res.status}`, errors: errBody.errors ?? [] });
      }
      // Success path driven by WS events
    } catch (err) {
      setExecuting(false);
      setOperationError({ message: err.message });
    }
  };

  // ── Validate operation ─────────────────────────────────────────────────────
  const handleValidate = async () => {
    if (!token || !workspaceId) return;
    const parsed = parseInputs();
    if (!parsed) return;

    setValidating(true);
    setValidateResult(null);

    setTimeout(async () => {
      try {
        const res = await fetch("/api/lifecycle/validate", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            "workspace-id": workspaceId,
          },
          body: JSON.stringify(parsed),
        });
        const body = await res.json();
        setValidateResult(body);
      } catch (err) {
        setValidateResult({ brokenReferences: [], warnings: [], types: [], error: err.message });
      } finally {
        setValidating(false);
      }
    }, 0);
  };

  const resetProgress = () => {
    setShowProgress(false);
    setStages({});
    setOperationResult(null);
    setOperationError(null);
    setExecuting(false);
  };

  // ── Tab icons ──────────────────────────────────────────────────────────────
  const TAB_ICONS = {
    Import: Download,
    Create: Database,
    Sync: GitPullRequest,
    Refresh: RefreshCw,
    Validate: CheckCircle2,
  };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <PageContainer className="space-y-8 select-none text-left">

      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-ui-xl font-bold text-text-primary tracking-tight flex items-center gap-3">
          <FileJson className="w-7 h-7 text-flow-purple" />
          <span>Workspace Lifecycle Engine</span>
        </h1>
        <p className="text-ui-sm text-text-secondary max-w-2xl leading-relaxed">
          Import, create, sync, refresh, or validate workspace data through the lifecycle pipeline.
        </p>
      </div>

      {/* Tabs + Main Panel */}
      <div className="space-y-0">
        {/* Tab bar */}
        <div className="flex items-center gap-1 border-b border-border-flow/60 pb-0">
          {TABS.map((tab) => {
            const Icon = TAB_ICONS[tab];
            const isActive = activeTab === tab;
            return (
              <button
                key={tab}
                onClick={() => {
                  setActiveTab(tab);
                  resetProgress();
                  setValidateResult(null);
                  setParseError("");
                }}
                className={`
                  inline-flex items-center gap-2 px-4 py-2.5 text-ui-sm font-medium rounded-t-lg border border-b-0 transition-apple cursor-pointer select-none
                  ${isActive
                    ? "bg-bg-card border-border-flow text-text-primary"
                    : "bg-transparent border-transparent text-text-secondary hover:text-text-primary hover:bg-bg-secondary/50"
                  }
                `}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab}
              </button>
            );
          })}
        </div>

        {/* Panel */}
        <Card className="rounded-tl-none p-6 space-y-5">
          {/* Description */}
          <p className="text-ui-xs text-text-secondary leading-relaxed border-b border-border-flow/30 pb-4">
            {TAB_DESCRIPTIONS[activeTab]}
          </p>

          {/* Content */}
          {showProgress && activeTab !== "Validate" ? (
            <ProgressView
              stages={stages}
              operationResult={operationResult}
              operationError={operationError}
              onReset={resetProgress}
            />
          ) : (
            <div className="space-y-5">
              {/* Refresh — no inputs */}
              {activeTab === "Refresh" ? (
                <div className="flex items-center gap-3 p-4 bg-bg-secondary rounded-xl border border-border-flow/40 text-ui-xs text-text-secondary">
                  <RefreshCw className="w-4 h-4 text-flow-purple shrink-0" />
                  <span>Clicking <strong className="text-text-primary">Run Refresh</strong> will rebuild recommendation scores, briefings, and copilot context across this workspace. No data is required.</span>
                </div>
              ) : (
                <ManifestInputs
                  manifest={manifest}
                  setManifest={setManifest}
                  datasets={datasets}
                  setDatasets={setDatasets}
                  parseError={parseError}
                />
              )}

              {/* Validate results */}
              {activeTab === "Validate" && validateResult && (
                <div className="border-t border-border-flow/30 pt-4">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-text-secondary mb-3">Validation Results</p>
                  <ValidateResultPanel result={validateResult} />
                </div>
              )}

              {/* Action buttons */}
              <div className="flex items-center justify-end gap-3 pt-2 border-t border-border-flow/30">
                {activeTab === "Validate" ? (
                  <Button
                    variant="primary"
                    onClick={handleValidate}
                    disabled={validating || !manifest.trim()}
                  >
                    {validating ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Validating…</>
                    ) : (
                      <><CheckCircle2 className="w-4 h-4 mr-2" />Validate</>
                    )}
                  </Button>
                ) : (
                  <Button
                    variant="primary"
                    onClick={handleExecute}
                    disabled={executing || (activeTab !== "Refresh" && !manifest.trim())}
                  >
                    {executing ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Running…</>
                    ) : activeTab === "Refresh" ? (
                      <><RefreshCw className="w-4 h-4 mr-2" />Run Refresh</>
                    ) : (
                      <><Upload className="w-4 h-4 mr-2" />Execute {activeTab}</>
                    )}
                  </Button>
                )}
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* History panel */}
      <Card className="p-6 space-y-4">
        <h2 className="text-ui-sm font-bold uppercase tracking-wider text-text-primary border-b border-border-flow/40 pb-2 flex items-center gap-2">
          <Clock className="w-4 h-4 text-flow-purple" />
          Execution History
        </h2>

        {historyLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
          </div>
        ) : history.length > 0 ? (
          <div className="space-y-3">
            {history.map((h, i) => (
              <div
                key={h.importId ?? i}
                className="p-4 bg-bg-secondary border border-border-flow rounded-xl space-y-2"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <FileText className="w-4 h-4 text-flow-purple shrink-0" />
                    <div className="min-w-0">
                      <span className="text-ui-xs font-bold text-text-primary block truncate">
                        {h.importId ?? "—"}
                      </span>
                      <span className="text-[10px] text-text-muted uppercase tracking-widest">
                        {h.operation ?? "import"}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <StatusChip status={h.status} />
                    <span className="text-[10px] text-text-muted whitespace-nowrap">
                      {h.timestamp ? new Date(h.timestamp).toLocaleString() : "—"}
                    </span>
                  </div>
                </div>

                {/* Statistics / graphMetrics row */}
                {(h.statistics || h.graphMetrics) && (
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-text-secondary pt-1 border-t border-border-flow/30">
                    {h.statistics && Object.entries(h.statistics).slice(0, 4).map(([k, v]) => (
                      <span key={k} className="flex items-center gap-1">
                        <Activity className="w-3 h-3 text-flow-purple" />
                        {k.replace(/([A-Z])/g, " $1").trim()}: <strong className="text-text-primary ml-0.5">{String(v)}</strong>
                      </span>
                    ))}
                    {h.graphMetrics && Object.entries(h.graphMetrics).slice(0, 2).map(([k, v]) => (
                      <span key={k} className="flex items-center gap-1">
                        <Activity className="w-3 h-3 text-flow-purple/70" />
                        {k.replace(/([A-Z])/g, " $1").trim()}: <strong className="text-text-primary ml-0.5">{String(v)}</strong>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-ui-xs text-text-secondary text-center py-6">
            No lifecycle operations logged for this workspace yet.
          </p>
        )}
      </Card>

    </PageContainer>
  );
};

export default ImportDashboard;
