import { useState } from "react";
import { GitPullRequest, Circle, CheckCircle2, XCircle, ExternalLink, FileDiff } from "lucide-react";
import ConfirmDialog from "../ui/ConfirmDialog";
import DiffViewer from "../projects/DiffViewer";

export default function InlinePRCard({ pr, onAction }) {
  const [confirming, setConfirming] = useState(false);
  const [merging, setMerging]       = useState(false);
  const [diffOpen, setDiffOpen]     = useState(false);
  const [headSha, setHeadSha]       = useState(pr.headSha || null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [approving, setApproving]   = useState(false);
  const [approved, setApproved]     = useState(false);

  const canDiff = Boolean(pr.owner && pr.repo && pr.number);

  async function approve() {
    if (approving || approved) return;
    setApproving(true);
    const token = localStorage.getItem("flow_os_token") || "";
    const wsId  = localStorage.getItem("flow_os_workspace_id") || "";
    try {
      const res = await fetch(`/api/engineering/repos/${pr.owner}/${pr.repo}/pulls/${pr.number}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, "workspace-id": wsId },
        body: JSON.stringify({ event: "APPROVE", body: "Approved via FLOW." }),
      });
      if (res.ok) { setApproved(true); onAction?.("approved", pr); }
      else onAction?.("approve_failed", pr);
    } catch { onAction?.("approve_failed", pr); }
    finally { setApproving(false); }
  }

  async function toggleDiff() {
    if (diffOpen) { setDiffOpen(false); return; }
    setDiffOpen(true);
    if (headSha) return;
    setDiffLoading(true);
    const token = localStorage.getItem("flow_os_token") || "";
    const wsId  = localStorage.getItem("flow_os_workspace_id") || "";
    try {
      const res = await fetch(`/api/engineering/repos/${pr.owner}/${pr.repo}/pulls/${pr.number}`, {
        headers: { Authorization: `Bearer ${token}`, "workspace-id": wsId },
      });
      if (res.ok) {
        const data = await res.json();
        const detail = Array.isArray(data.result) ? data.result[0] : data.result;
        setHeadSha(detail?.metadata?.headSha || null);
      }
    } catch { /* DiffViewer renders its own error state */ }
    finally { setDiffLoading(false); }
  }

  const score  = pr.mergeReadinessScore ?? 0;
  const scoreColor = score >= 80 ? "var(--p-normal)" : score >= 50 ? "var(--p-high)" : "var(--p-critical)";

  const isMergeable = pr.state === "open" && score >= 50;

  async function executeMerge() {
    setConfirming(false);
    setMerging(true);
    const token = localStorage.getItem("flow_os_token") || localStorage.getItem("flow_token");
    const wsId  = localStorage.getItem("flow_os_workspace_id");
    try {
      if (pr.owner && pr.repo && pr.number) {
        await fetch(`/api/engineering/repos/${pr.owner}/${pr.repo}/pulls/${pr.number}/merge`, {
          method:  "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, "workspace-id": wsId || "" },
          body: JSON.stringify({ mergeMethod: "squash" }),
        });
      }
      onAction?.("merged", pr);
    } catch { onAction?.("merge_failed", pr); }
    finally { setMerging(false); }
  }

  const StateIcon = pr.state === "merged"
    ? <CheckCircle2 style={{ width: 13, height: 13, color: "var(--brand)" }} />
    : pr.state === "closed"
      ? <XCircle style={{ width: 13, height: 13, color: "var(--p-critical)" }} />
      : <Circle style={{ width: 13, height: 13, color: "var(--p-info)" }} />;

  const btn = (content, onClick, style = {}) => (
    <button
      onClick={onClick}
      style={{
        padding: "4px 10px", borderRadius: 4, fontSize: 11,
        background: "transparent", border: "1px solid var(--border-strong)",
        color: "var(--t3)", cursor: "pointer", transition: "all 100ms",
        display: "inline-flex", alignItems: "center", gap: 5,
        ...style,
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--accent-line)"; e.currentTarget.style.color = "var(--t1)"; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border-strong)"; e.currentTarget.style.color = style.color || "var(--t3)"; }}
    >
      {content}
    </button>
  );

  return (
    <>
      <div style={{ border: "1px solid var(--border)", borderRadius: 4, padding: "10px 12px", background: "var(--bg-card)", transition: "background 100ms" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
          <GitPullRequest style={{ width: 13, height: 13, color: "var(--t4)", marginTop: 1, flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              {StateIcon}
              <span style={{ fontSize: 12, fontWeight: 500, color: "var(--t1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {pr.title}
              </span>
              {pr.number && <span style={{ fontSize: 11, color: "var(--t5)", flexShrink: 0 }}>#{pr.number}</span>}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 11, color: "var(--t3)", marginBottom: isMergeable || pr.htmlUrl ? 8 : 0 }}>
              {pr.author && <span>@{pr.author}</span>}
              {pr.mergeReadinessScore !== undefined && (
                <span style={{ fontWeight: 500, color: scoreColor }}>Readiness: {score}%</span>
              )}
              {pr.repo && <span style={{ color: "var(--t5)" }}>{pr.repo}</span>}
            </div>

            {pr.state !== "merged" && pr.state !== "closed" && (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {btn("Summarize", () => onAction?.("summarize", pr))}
                {canDiff && btn(
                  <><FileDiff style={{ width: 10, height: 10 }} />{diffOpen ? "Hide diff" : "View diff"}</>,
                  toggleDiff,
                  diffOpen ? { borderColor: "var(--accent-line)", color: "var(--t1)" } : {},
                )}
                {/* Approve the PR inside FLOW — no trip to GitHub (governed via executeAction) */}
                {canDiff && (approved
                  ? <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 10px", fontSize: 11, color: "var(--p-normal-text)" }}><CheckCircle2 style={{ width: 11, height: 11 }} /> Approved</span>
                  : btn(
                      approving ? "Approving…" : <><CheckCircle2 style={{ width: 10, height: 10 }} /> Approve</>,
                      approve,
                      { color: "var(--p-normal-text)", borderColor: "rgba(76,175,130,0.3)" },
                    ))}
                {pr.htmlUrl && (
                  <a href={pr.htmlUrl} target="_blank" rel="noreferrer" title="Open on GitHub"
                    style={{ display: "inline-flex", alignItems: "center", padding: "4px 6px", borderRadius: 4, color: "var(--t5)", textDecoration: "none" }}>
                    <ExternalLink style={{ width: 10, height: 10 }} />
                  </a>
                )}
                {isMergeable && (
                  <button
                    onClick={() => setConfirming(true)}
                    disabled={merging}
                    style={{
                      padding: "4px 10px", borderRadius: 4, fontSize: 11,
                      background: "rgba(76,175,130,0.08)", border: "1px solid rgba(76,175,130,0.22)",
                      color: "var(--p-normal)", cursor: merging ? "not-allowed" : "pointer",
                      opacity: merging ? 0.6 : 1,
                    }}
                  >
                    {merging ? "Merging…" : "Merge"}
                  </button>
                )}
              </div>
            )}

            {diffOpen && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
                {diffLoading && !headSha ? (
                  <div style={{ fontSize: 11, color: "var(--t5)" }}>Loading diff…</div>
                ) : (
                  <DiffViewer owner={pr.owner} repo={pr.repo} sha={headSha} label={`Diff · latest commit of #${pr.number}`} />
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog
        isOpen={confirming}
        danger
        title={`Merge PR #${pr.number}?`}
        description={`"${pr.title}" will be squash-merged into the base branch. This cannot be undone.`}
        confirmLabel="Merge pull request"
        onConfirm={executeMerge}
        onCancel={() => setConfirming(false)}
      />
    </>
  );
}
