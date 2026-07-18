import { useState, useEffect } from "react";
import { X, GitPullRequest, ExternalLink } from "lucide-react";
import DiffViewer from "../projects/DiffViewer";
import { useEscapeKey } from "../../hooks/useEscapeKey";

/**
 * InlineDiffModal (Phase 16) — read a PR's diff without leaving the Inbox. Given a
 * `repo` ("owner/name") + PR `number`, it resolves the head commit and renders the
 * existing DiffViewer. Reuses the governed Engineering API — no new backend. Falls
 * back to an honest message when GitHub isn't connected or the ref can't be resolved.
 */
export default function InlineDiffModal({ repo, number, onClose }) {
  const [owner, name] = String(repo || "").includes("/") ? repo.split("/") : [null, repo];
  const [state, setState] = useState({ loading: true, sha: null, url: null, error: null });
  useEscapeKey(onClose);

  useEffect(() => {
    if (!owner || !name || !number) { setState({ loading: false, sha: null, url: null, error: "no_ref" }); return; }
    let cancelled = false;
    (async () => {
      const token = localStorage.getItem("flow_os_token") || "";
      const wsId = localStorage.getItem("flow_os_workspace_id") || "";
      try {
        const res = await fetch(`/api/engineering/repos/${owner}/${name}/pulls/${number}`, {
          headers: { Authorization: `Bearer ${token}`, "workspace-id": wsId },
        });
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json();
        const pr = Array.isArray(data.result) ? data.result[0] : data.result;
        if (!cancelled) setState({ loading: false, sha: pr?.metadata?.headSha || null, url: pr?.metadata?.url || pr?.url || null, error: pr?.metadata?.headSha ? null : "no_sha" });
      } catch (err) {
        if (!cancelled) setState({ loading: false, sha: null, url: null, error: err.message });
      }
    })();
    return () => { cancelled = true; };
  }, [owner, name, number]);

  return (
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
      role="dialog" aria-modal="true" aria-label="Pull request diff"
      style={{ position: "fixed", inset: 0, background: "rgba(31,27,22,0.12)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 70, animation: "event-slide-in 0.15s ease" }}>
      <div style={{ width: "100%", maxWidth: 640, maxHeight: "82vh", background: "var(--bg-sidebar)", border: "1px solid var(--border)", borderRadius: 8, display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: "1px solid var(--border)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <GitPullRequest style={{ width: 14, height: 14, color: "var(--brand)" }} />
            <span style={{ fontSize: 13, fontWeight: 500, color: "var(--t1)" }}>{repo}{number ? ` · PR #${number}` : ""}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {state.url && <a href={state.url} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--t4)", textDecoration: "none" }}>GitHub <ExternalLink style={{ width: 10, height: 10 }} /></a>}
            <button onClick={onClose} aria-label="Close diff" style={{ padding: 5, background: "transparent", border: "none", color: "var(--t4)", cursor: "pointer" }}><X style={{ width: 14, height: 14 }} /></button>
          </div>
        </div>
        <div style={{ padding: "14px 16px", overflowY: "auto" }}>
          {state.loading ? (
            <div style={{ fontSize: 12, color: "var(--t5)" }}>Resolving pull request…</div>
          ) : state.sha ? (
            <DiffViewer owner={owner} repo={name} sha={state.sha} label={`Diff · PR #${number}`} />
          ) : (
            <div style={{ fontSize: 12, color: "var(--t4)", lineHeight: 1.6 }}>
              {state.error === "no_ref"
                ? "This conflict has no resolvable repository reference. Connect GitHub to view diffs in FLOW."
                : "Couldn't resolve the pull request's diff here. Connect GitHub, or open it on the source."}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
