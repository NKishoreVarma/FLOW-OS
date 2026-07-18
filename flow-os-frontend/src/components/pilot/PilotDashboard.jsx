import { useState, useEffect, useRef } from "react";
import { Activity, ThumbsUp, ThumbsDown, RefreshCw, Radio } from "lucide-react";

function authHeaders() {
  return {
    Authorization: `Bearer ${localStorage.getItem("flow_os_token") || ""}`,
    "workspace-id": localStorage.getItem("flow_os_workspace_id") || "",
  };
}
async function getJSON(path) {
  const r = await fetch(path, { headers: authHeaders() });
  if (!r.ok) throw new Error(r.status);
  return r.json();
}

const SECTION = { background: "var(--bg-secondary)", border: "1px solid var(--border)", borderRadius: 10, padding: "18px 20px" };
const LABEL = { fontSize: 11, fontWeight: 500, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--t4)", marginBottom: 12 };

export default function PilotDashboard() {
  const [summary, setSummary]     = useState(null);
  const [digest, setDigest]       = useState(null);
  const [feedback, setFeedback]   = useState([]);
  const [liveLog, setLiveLog]     = useState([]);
  const [connected, setConnected] = useState(false);
  const esRef = useRef(null);

  const load = async () => {
    try {
      const [s, d, f] = await Promise.all([
        getJSON("/api/analytics/summary?days=14"),
        getJSON("/api/analytics/digest"),
        getJSON("/api/feedback?limit=20"),
      ]);
      setSummary(s);
      setDigest(d);
      setFeedback(f.feedback || []);
    } catch { /* keep previous state */ }
  };

  useEffect(() => {
    load();
    const token = localStorage.getItem("flow_os_token") || "";
    const wsId = localStorage.getItem("flow_os_workspace_id") || "";
    // EventSource cannot send Authorization headers — use query params
    const es = new EventSource(`/api/analytics/live?token=${encodeURIComponent(token)}&wsId=${encodeURIComponent(wsId)}`);
    esRef.current = es;
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.onmessage = (evt) => {
      try {
        const data = JSON.parse(evt.data);
        if (data.type === "connected") return;
        setLiveLog(prev => [{ ...data, at: new Date().toISOString() }, ...prev].slice(0, 50));
        if (data.type === "feedback") load();
      } catch { /* ignore malformed frame */ }
    };
    return () => es.close();
  }, []);

  const maxDau = Math.max(1, ...(summary?.dau || []).map(d => d.users));

  return (
    <div style={{ padding: "28px 24px 48px", maxWidth: 960, margin: "0 auto", display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Activity style={{ width: 20, height: 20, color: "var(--brand)" }} />
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 500, color: "var(--t1)" }}>Pilot Dashboard</h1>
          <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "2px 8px", borderRadius: 10, background: connected ? "rgba(76,175,130,0.1)" : "rgba(255,87,87,0.08)", border: `1px solid ${connected ? "rgba(76,175,130,0.3)" : "rgba(255,87,87,0.2)"}` }}>
            <Radio style={{ width: 10, height: 10, color: connected ? "var(--p-normal-text)" : "var(--p-critical-text)" }} />
            <span style={{ fontSize: 11, color: connected ? "var(--p-normal-text)" : "var(--p-critical-text)" }}>{connected ? "Live" : "Offline"}</span>
          </div>
        </div>
        <button onClick={load} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "transparent", color: "var(--t3)", fontSize: 12, cursor: "pointer" }}>
          <RefreshCw style={{ width: 13, height: 13 }} /> Refresh
        </button>
      </div>

      {digest && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
          {[
            { label: "Sessions Today", value: digest.sessions },
            { label: "Actions Completed", value: digest.actionsCompleted },
            { label: "Errors Today", value: digest.errors },
            { label: "Feedback Today", value: digest.feedback?.total ?? 0 },
          ].map(c => (
            <div key={c.label} style={{ ...SECTION, textAlign: "center" }}>
              <div style={{ fontSize: 28, fontWeight: 500, color: "var(--t1)" }}>{c.value}</div>
              <div style={{ fontSize: 11, color: "var(--t4)", marginTop: 4 }}>{c.label}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <div style={SECTION}>
          <div style={LABEL}>Daily Active Users (14 days)</div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 80 }}>
            {(summary?.dau || []).map((d, i) => (
              <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                <div style={{ width: "100%", height: Math.max(4, (d.users / maxDau) * 64), background: "var(--brand)", borderRadius: "3px 3px 0 0", opacity: 0.7 }} />
                <span style={{ fontSize: 9, color: "var(--t5)" }}>{String(d.day).slice(5)}</span>
              </div>
            ))}
            {!summary?.dau?.length && <p style={{ margin: 0, fontSize: 12, color: "var(--t4)" }}>No data yet</p>}
          </div>
        </div>

        <div style={SECTION}>
          <div style={LABEL}>Feature Engagement</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {(summary?.featureEngagement || []).slice(0, 6).map((f, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                <span style={{ color: "var(--t2)" }}>{f.route || "—"}</span>
                <span style={{ color: "var(--t4)", fontVariantNumeric: "tabular-nums" }}>{f.count}</span>
              </div>
            ))}
            {!summary?.featureEngagement?.length && <p style={{ margin: 0, fontSize: 12, color: "var(--t4)" }}>No visits tracked yet</p>}
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <div style={SECTION}>
          <div style={LABEL}>Live Event Log</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 220, overflowY: "auto" }}>
            {liveLog.length === 0 && <p style={{ margin: 0, fontSize: 12, color: "var(--t4)" }}>Waiting for events…</p>}
            {liveLog.map((e, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                <span style={{ color: e.type?.includes("fail") ? "var(--p-critical-text)" : "var(--t2)" }}>{e.type}</span>
                <span style={{ color: "var(--t5)" }}>{e.at ? new Date(e.at).toLocaleTimeString() : ""}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={SECTION}>
          <div style={LABEL}>Pilot Feedback</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 220, overflowY: "auto" }}>
            {feedback.length === 0 && <p style={{ margin: 0, fontSize: 12, color: "var(--t4)" }}>No feedback yet</p>}
            {feedback.map((f) => (
              <div key={f.id} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                {f.thumbs === "up"
                  ? <ThumbsUp style={{ width: 13, height: 13, color: "var(--p-normal-text)", flexShrink: 0, marginTop: 1 }} />
                  : <ThumbsDown style={{ width: 13, height: 13, color: "var(--p-critical-text)", flexShrink: 0, marginTop: 1 }} />}
                <div>
                  <div style={{ fontSize: 12, color: "var(--t2)" }}>{f.text || f.context || "No text"}</div>
                  <div style={{ fontSize: 11, color: "var(--t5)" }}>{f.context} · {new Date(f.reported_at).toLocaleString()}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
