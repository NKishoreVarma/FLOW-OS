import { useState, useEffect } from "react";
import { Star, RefreshCw, Zap } from "lucide-react";
import ActionCard from "../inbox/ActionCard";

function authHeaders() {
  return {
    Authorization: `Bearer ${localStorage.getItem("flow_os_token") || ""}`,
    "workspace-id": localStorage.getItem("flow_os_workspace_id") || "workspace_corp_alpha",
    "Content-Type": "application/json",
  };
}

async function getJSON(p) {
  const r = await fetch(p, { headers: authHeaders() });
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
}

const DEMO = {
  greeting: "Good morning, Rahul.",
  summary: "3 items need your attention now (approval and conflict). 5 more can wait.",
  topItems: [
    {
      id: "d-1",
      type: "approval",
      title: "Approve: github MERGE_PULL_REQUEST",
      subtitle: "HIGH risk · 2 approvals required",
      impact: "critical",
      impactLabel: "Critical Impact",
      estimatedImpact: "Unblocks 3 engineers",
      evidenceLines: ["HIGH risk · 2 approvals required", "Blocking 3 engineers"],
      actions: [
        { label: "Approve", workflowId: "approve_action", risk: "HIGH", steps: [], isPrimary: true },
        { label: "Reject", workflowId: "reject_action", risk: "LOW", steps: [], isPrimary: false },
      ],
      source: "github",
      actionRoute: "/inbox",
    },
    {
      id: "d-2",
      type: "conflict",
      title: "Merge conflict in flow-backend",
      subtitle: "auth.js — Rahul & Kishore both modified",
      impact: "high",
      impactLabel: "High Impact",
      estimatedImpact: "Unblocks merge",
      evidenceLines: ["auth.js changed by 2 people", "Owned by: rahul, kishore"],
      actions: [
        { label: "Resolve", workflowId: "navigate", risk: "LOW", steps: [], isPrimary: true },
        { label: "Notify Team", workflowId: "notify_team", risk: "LOW", steps: [], isPrimary: false },
      ],
      source: "github",
      actionRoute: "/inbox",
    },
  ],
};

export default function ChiefOfStaff() {
  const [data, setData] = useState(null);
  const [demo, setDemo] = useState(false);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);

  const load = async () => {
    setLoading(true);
    try {
      const d = await getJSON("/api/autonomous/chief-of-staff");
      setData(d);
      setItems(d.topItems || []);
      setDemo(false);
    } catch {
      setData(DEMO);
      setItems(DEMO.topItems);
      setDemo(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <div style={{ padding: "28px 24px 48px", maxWidth: 720, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Star style={{ width: 18, height: 18, color: "var(--brand)" }} />
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "var(--t1)" }}>Chief of Staff</h1>
          {demo && (
            <span style={{
              fontSize: 11,
              color: "var(--t4)",
              background: "var(--bg-secondary)",
              padding: "2px 8px",
              borderRadius: 10,
              border: "1px solid var(--border)",
            }}>
              Sample data
            </span>
          )}
        </div>
        <button
          onClick={load}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            padding: "6px 12px",
            borderRadius: 7,
            border: "1px solid var(--border)",
            background: "transparent",
            color: "var(--t3)",
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          <RefreshCw style={{ width: 12, height: 12 }} /> Refresh
        </button>
      </div>

      {loading ? (
        <div style={{ color: "var(--t4)", fontSize: 13 }}>Loading…</div>
      ) : (
        <>
          {data?.greeting && (
            <div style={{ marginBottom: 6 }}>
              <p style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "var(--t1)" }}>
                {data.greeting}
              </p>
              <p style={{ margin: "6px 0 20px", fontSize: 14, color: "var(--t3)" }}>
                {data.summary}
              </p>
            </div>
          )}

          {items.length === 0 ? (
            <div style={{
              padding: 32,
              textAlign: "center",
              color: "var(--t4)",
              background: "var(--bg-secondary)",
              borderRadius: 12,
              border: "1px solid var(--border)",
            }}>
              <Zap style={{ width: 24, height: 24, marginBottom: 8, opacity: 0.4 }} />
              <p style={{ margin: 0, fontSize: 14 }}>All clear — no urgent items.</p>
            </div>
          ) : (
            <div>
              {items.map((card) => (
                <ActionCard
                  key={card.id}
                  card={card}
                  onExecute={() => setItems((prev) => prev.filter((i) => i.id !== card.id))}
                  onDismiss={() => setItems((prev) => prev.filter((i) => i.id !== card.id))}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
