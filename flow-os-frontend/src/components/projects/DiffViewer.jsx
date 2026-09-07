import { useState, useEffect } from "react";
import { FileDiff, Plus, Minus, ChevronRight, ChevronDown, AlertTriangle } from "lucide-react";

/**
 * DiffViewer — renders the file-level diff of a single commit inline, so reviewing
 * "what actually changed" no longer requires leaving FLOW for github.com.
 *
 * Source is the existing, fully-backed endpoint:
 *   GET /api/engineering/repos/:owner/:repo/commits/:sha
 * which returns metadata.filesChanged[] = { filename, status, additions, deletions, patch }.
 * No new backend — this only surfaces data the Engineering Capability already returns.
 */
const STATUS_COLOR = {
  added:    "var(--p-normal)",
  removed:  "var(--p-critical)",
  modified: "var(--p-info)",
  renamed:  "var(--p-high)",
};

function patchLineColor(line) {
  if (line.startsWith("+") && !line.startsWith("+++")) return { color: "var(--p-normal-text)", bg: "rgba(76,175,130,0.08)" };
  if (line.startsWith("-") && !line.startsWith("---")) return { color: "var(--p-critical-text)", bg: "rgba(255,87,87,0.08)" };
  if (line.startsWith("@@")) return { color: "var(--p-info-text)", bg: "rgba(91,158,255,0.06)" };
  return { color: "var(--t4)", bg: "transparent" };
}

function FileBlock({ file }) {
  const [open, setOpen] = useState(false);
  const color = STATUS_COLOR[file.status] || "var(--t4)";
  const lines = (file.patch || "").split("\n");

  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 4, overflow: "hidden" }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 8,
          padding: "7px 10px", background: "rgba(31,27,22,0.04)", border: "none",
          cursor: "pointer", textAlign: "left",
        }}
      >
        {open ? <ChevronDown style={{ width: 11, height: 11, color: "var(--t5)", flexShrink: 0 }} />
              : <ChevronRight style={{ width: 11, height: 11, color: "var(--t5)", flexShrink: 0 }} />}
        <span style={{ width: 6, height: 6, borderRadius: 2, background: color, flexShrink: 0 }} />
        <span style={{
          fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: "var(--t2)",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1,
        }}>
          {file.filename}
        </span>
        {file.additions != null && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 2, fontSize: 10, color: "var(--p-normal-text)", fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
            <Plus style={{ width: 8, height: 8 }} />{file.additions}
          </span>
        )}
        {file.deletions != null && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 2, fontSize: 10, color: "var(--p-critical-text)", fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
            <Minus style={{ width: 8, height: 8 }} />{file.deletions}
          </span>
        )}
      </button>
      {open && (
        file.patch ? (
          <pre style={{
            margin: 0, padding: 0, overflowX: "auto",
            borderTop: "1px solid var(--border)", background: "var(--bg-card)",
          }}>
            {lines.map((ln, i) => {
              const c = patchLineColor(ln);
              return (
                <div key={i} style={{
                  fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, lineHeight: 1.6,
                  padding: "0 10px", whiteSpace: "pre", color: c.color, background: c.bg,
                }}>
                  {ln || " "}
                </div>
              );
            })}
          </pre>
        ) : (
          <div style={{ padding: "8px 10px", fontSize: 11, color: "var(--t5)", borderTop: "1px solid var(--border)" }}>
            No inline patch for this file (binary or too large).
          </div>
        )
      )}
    </div>
  );
}

export default function DiffViewer({ owner, repo, sha, label }) {
  const [state, setState] = useState({ loading: true, files: null, error: null, meta: null });

  useEffect(() => {
    if (!owner || !repo || !sha) {
      setState({ loading: false, files: null, error: "missing_ref", meta: null });
      return;
    }
    let cancelled = false;
    (async () => {
      const token = localStorage.getItem("flow_os_token") || "";
      const wsId  = localStorage.getItem("flow_os_workspace_id") || "";
      try {
        const res = await fetch(`/api/engineering/repos/${owner}/${repo}/commits/${sha}`, {
          headers: { Authorization: `Bearer ${token}`, "workspace-id": wsId },
        });
        if (!res.ok) throw new Error(`status ${res.status}`);
        const data = await res.json();
        const commit = Array.isArray(data.result) ? data.result[0] : data.result;
        const files = commit?.metadata?.filesChanged || [];
        if (!cancelled) setState({ loading: false, files, error: null, meta: {
          message: commit?.title, additions: commit?.metadata?.additions, deletions: commit?.metadata?.deletions,
        } });
      } catch (err) {
        if (!cancelled) setState({ loading: false, files: null, error: err.message || "load_failed", meta: null });
      }
    })();
    return () => { cancelled = true; };
  }, [owner, repo, sha]);

  const header = (
    <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10 }}>
      <FileDiff style={{ width: 12, height: 12, color: "var(--brand)" }} />
      <span style={{ fontSize: 10, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--t5)" }}>
        {label || "Files changed"}
      </span>
      {state.meta && (state.meta.additions != null || state.meta.deletions != null) && (
        <span style={{ fontSize: 10, color: "var(--t5)", fontVariantNumeric: "tabular-nums" }}>
          <span style={{ color: "var(--p-normal-text)" }}>+{state.meta.additions ?? 0}</span>{" "}
          <span style={{ color: "var(--p-critical-text)" }}>−{state.meta.deletions ?? 0}</span>
        </span>
      )}
    </div>
  );

  if (state.loading) {
    return (
      <div>
        {header}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {[0, 1].map(i => (
            <div key={i} style={{ height: 30, borderRadius: 4, background: "rgba(31,27,22,0.04)", border: "1px solid var(--border)", position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, transparent 0%, rgba(31,27,22,0.05) 50%, transparent 100%)", animation: "shimmer-sweep 1.6s ease-in-out infinite" }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (state.error || !state.files) {
    return (
      <div>
        {header}
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: "var(--t4)", padding: "10px 12px", border: "1px solid var(--border)", borderRadius: 4, background: "rgba(31,27,22,0.04)" }}>
          <AlertTriangle style={{ width: 12, height: 12, color: "var(--p-high)", flexShrink: 0 }} />
          {state.error === "missing_ref"
            ? "Diff unavailable — no commit reference for this item."
            : "Couldn't load this diff. Connect GitHub, or open it on the source."}
        </div>
      </div>
    );
  }

  if (state.files.length === 0) {
    return (
      <div>
        {header}
        <div style={{ fontSize: 11, color: "var(--t5)", padding: "10px 12px", border: "1px solid var(--border)", borderRadius: 4 }}>
          No file changes in this commit.
        </div>
      </div>
    );
  }

  return (
    <div>
      {header}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {state.files.map((f, i) => <FileBlock key={f.filename || i} file={f} />)}
      </div>
    </div>
  );
}
