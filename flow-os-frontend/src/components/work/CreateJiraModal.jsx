import { useState } from "react";
import { X, CheckSquare, Loader2, Check, AlertTriangle } from "lucide-react";
import SourceBadge from "../ui/SourceBadge";
import { useEscapeKey } from "../../hooks/useEscapeKey";

/**
 * CreateJiraModal — turn any FLOW recommendation into a real Jira issue without
 * opening Jira. Reuses the existing endpoint (no new backend):
 *   POST /api/work/issues { projectKey, title, description, priority, assignee }
 *
 * Labels + the FLOW backlink are folded into the description because the existing
 * route doesn't take a labels field — keeping this strictly a reuse of what's there.
 */
const PRIORITIES = ["P0", "P1", "P2", "P3"];

export default function CreateJiraModal({ initial = {}, onClose, onCreated }) {
  const [projectKey, setProjectKey] = useState(initial.projectKey || "PROJ");
  const [title, setTitle]           = useState(initial.title || "");
  const [description, setDescription] = useState(initial.description || "");
  const [priority, setPriority]     = useState(initial.priority || "P2");
  const [labels, setLabels]         = useState(initial.labels || "");
  const [assignee, setAssignee]     = useState(initial.assignee || "");
  const [state, setState]           = useState({ submitting: false, done: null, error: null });
  useEscapeKey(onClose, !state.submitting);

  const canSubmit = title.trim().length > 2 && projectKey.trim().length > 0 && !state.submitting;

  async function submit() {
    if (!canSubmit) return;
    setState({ submitting: true, done: null, error: null });
    const token = localStorage.getItem("flow_os_token") || "";
    const wsId  = localStorage.getItem("flow_os_workspace_id") || "";

    const backlinkParts = [];
    if (labels.trim()) backlinkParts.push(`Labels: ${labels.trim()}`);
    if (initial.flowSource) backlinkParts.push(`FLOW source: ${initial.flowSource}`);
    backlinkParts.push("Created from FLOW OS.");
    const fullDescription = [description.trim(), backlinkParts.join("\n")].filter(Boolean).join("\n\n");

    try {
      const res = await fetch("/api/work/issues", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, "workspace-id": wsId },
        body: JSON.stringify({ projectKey: projectKey.trim(), title: title.trim(), description: fullDescription, priority, assignee: assignee.trim() || null }),
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const data = await res.json();
      const issue = data.result || data;
      setState({ submitting: false, done: issue, error: null });
      onCreated?.(issue);
    } catch (err) {
      setState({ submitting: false, done: null, error: err.message || "Failed to create issue" });
    }
  }

  const field = (label, node) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <label style={{ fontSize: 10, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--t5)" }}>{label}</label>
      {node}
    </div>
  );

  const inputStyle = {
    width: "100%", background: "var(--bg-card)", border: "1px solid var(--border-strong)",
    borderRadius: 4, padding: "8px 10px", fontSize: 13, color: "var(--t1)", outline: "none",
  };

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose?.(); }}
      role="dialog" aria-modal="true" aria-label="Create Jira issue"
      style={{ position: "fixed", inset: 0, background: "rgba(31,27,22,0.12)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 70, animation: "event-slide-in 0.15s ease" }}
    >
      <div style={{ width: "100%", maxWidth: 480, background: "var(--bg-sidebar)", border: "1px solid var(--border)", borderRadius: 8, display: "flex", flexDirection: "column", maxHeight: "88vh" }}>
        {/* Header */}
        <div style={{ padding: "16px 18px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <CheckSquare style={{ width: 14, height: 14, color: "var(--brand)" }} />
            <span style={{ fontSize: 14, fontWeight: 500, color: "var(--t1)" }}>Create Jira Issue</span>
            <SourceBadge source="jira" />
          </div>
          <button onClick={onClose} aria-label="Close dialog" style={{ padding: 5, background: "transparent", border: "none", color: "var(--t4)", cursor: "pointer" }}>
            <X style={{ width: 14, height: 14 }} />
          </button>
        </div>

        {state.done ? (
          <div style={{ padding: "28px 20px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
            <div style={{ width: 40, height: 40, borderRadius: "50%", background: "rgba(76,175,130,0.12)", border: "1px solid rgba(76,175,130,0.30)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Check style={{ width: 18, height: 18, color: "var(--p-normal)" }} />
            </div>
            <p style={{ fontSize: 14, fontWeight: 500, color: "var(--t1)" }}>
              Issue {state.done.key ? state.done.key : "created"}
            </p>
            <p style={{ fontSize: 12, color: "var(--t4)" }}>{title}</p>
            <button onClick={onClose} style={{ marginTop: 8, padding: "7px 16px", borderRadius: 4, fontSize: 13, background: "var(--brand)", border: "none", color: "#fff", cursor: "pointer" }}>Done</button>
          </div>
        ) : (
          <>
            <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 14, overflowY: "auto" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                {field("Project Key", <input style={inputStyle} value={projectKey} onChange={e => setProjectKey(e.target.value)} placeholder="PROJ" />)}
                {field("Priority", (
                  <select style={inputStyle} value={priority} onChange={e => setPriority(e.target.value)}>
                    {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                ))}
              </div>
              {field("Title", <input style={inputStyle} value={title} onChange={e => setTitle(e.target.value)} placeholder="Short summary of the work" autoFocus />)}
              {field("Description", <textarea style={{ ...inputStyle, minHeight: 90, resize: "vertical", fontFamily: "inherit", lineHeight: 1.6 }} value={description} onChange={e => setDescription(e.target.value)} placeholder="What needs to be done and why" />)}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                {field("Labels", <input style={inputStyle} value={labels} onChange={e => setLabels(e.target.value)} placeholder="backend, incident" />)}
                {field("Assignee", <input style={inputStyle} value={assignee} onChange={e => setAssignee(e.target.value)} placeholder="username (optional)" />)}
              </div>
              {state.error && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--p-critical-text)", background: "rgba(255,87,87,0.06)", border: "1px solid rgba(255,87,87,0.20)", borderRadius: 4, padding: "8px 10px" }}>
                  <AlertTriangle style={{ width: 12, height: 12, flexShrink: 0 }} />
                  Couldn't create the issue ({state.error}). Connect Jira, or check the project key.
                </div>
              )}
            </div>
            <div style={{ padding: "12px 18px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button onClick={onClose} style={{ padding: "7px 14px", borderRadius: 4, fontSize: 13, background: "transparent", border: "1px solid var(--border-strong)", color: "var(--t3)", cursor: "pointer" }}>Cancel</button>
              <button onClick={submit} disabled={!canSubmit}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 16px", borderRadius: 4, fontSize: 13, background: canSubmit ? "var(--brand)" : "rgba(232,103,43,0.3)", border: "none", color: "#fff", cursor: canSubmit ? "pointer" : "not-allowed" }}>
                {state.submitting && <Loader2 style={{ width: 12, height: 12, animation: "spin 1s linear infinite" }} />}
                {state.submitting ? "Creating…" : "Create Issue"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
