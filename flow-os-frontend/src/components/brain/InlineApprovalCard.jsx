import { useState } from "react";
import { ShieldCheck, Check, X } from "lucide-react";

export default function InlineApprovalCard({ approval }) {
  const [hApprove, setHApprove] = useState(false);
  const [hReject, setHReject] = useState(false);

  async function act(action) {
    const token = localStorage.getItem("flow_os_token") || localStorage.getItem("flow_token");
    const ws = localStorage.getItem("flow_os_workspace_id");
    await fetch(`/api/approvals/${approval.id}/${action}`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "workspace-id": ws || "",
        "Content-Type": "application/json",
      },
    }).catch(() => {});
  }

  return (
    <div style={{ border: "1px solid rgba(255,151,65,0.28)", borderRadius: 4, padding: "12px", background: "rgba(255,151,65,0.05)" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 10 }}>
        <ShieldCheck style={{ width: 14, height: 14, color: "var(--p-high)", marginTop: 2, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 12, fontWeight: 500, color: "var(--t1)" }}>{approval.action || "Action requires approval"}</p>
          {approval.requestedBy && (
            <p style={{ fontSize: 11, color: "var(--t4)", marginTop: 2 }}>
              Requested by {approval.requestedBy}
            </p>
          )}
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, paddingLeft: 22 }}>
        <button
          onClick={() => act("approve")}
          onMouseEnter={() => setHApprove(true)}
          onMouseLeave={() => setHApprove(false)}
          style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 3, background: hApprove ? "rgba(76,175,130,0.14)" : "rgba(76,175,130,0.08)", border: "1px solid rgba(76,175,130,0.22)", color: "var(--p-normal)", fontSize: 11, fontWeight: 500, cursor: "pointer", transition: "all 100ms" }}
        >
          <Check style={{ width: 10, height: 10 }} /> Approve
        </button>
        <button
          onClick={() => act("reject")}
          onMouseEnter={() => setHReject(true)}
          onMouseLeave={() => setHReject(false)}
          style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 3, background: hReject ? "rgba(255,87,87,0.14)" : "rgba(255,87,87,0.06)", border: "1px solid rgba(255,87,87,0.22)", color: "var(--p-critical-text)", fontSize: 11, fontWeight: 500, cursor: "pointer", transition: "all 100ms" }}
        >
          <X style={{ width: 10, height: 10 }} /> Reject
        </button>
      </div>
    </div>
  );
}
