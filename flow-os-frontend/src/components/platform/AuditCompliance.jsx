import { useState, useEffect, useMemo } from "react";
import { FileText, Search, Download, FileKey, Shield, RefreshCw } from "lucide-react";
import { useWebSocket } from "../../hooks/useWebSocket";

const STATUS_STYLE = {
  allow:            { color: "var(--p-normal-text)" },
  success:          { color: "var(--p-normal-text)" },
  denied:           { color: "var(--p-critical-text)" },
  deny:             { color: "var(--p-critical-text)" },
  approval_required:{ color: "var(--p-high-text)" },
  error:            { color: "var(--p-critical-text)" },
};

const statusStyle = (s) => STATUS_STYLE[(s ?? "").toLowerCase()] ?? { color: "var(--t5)" };

const COMPLIANCE_REPORTS = ["SOC 2 Type II", "ISO 27001", "GDPR DPA"];

const AuditCompliance = () => {
  const { token, workspaceId } = useWebSocket();
  const [logs, setLogs]               = useState([]);
  const [loading, setLoading]         = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [hRow, setHRow]               = useState(null);
  const [hBtn, setHBtn]               = useState(null);

  const fetchLogs = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch("/api/connectors/audit?limit=50", {
        headers: { Authorization: `Bearer ${token}`, "workspace-id": workspaceId || "temp" },
      });
      if (res.ok) {
        const data = await res.json();
        setLogs(Array.isArray(data) ? data : (data.events ?? data.logs ?? data.entries ?? []));
      }
    } catch {}
    finally { setLoading(false); }
  };

  useEffect(() => { fetchLogs(); }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return logs;
    const q = searchQuery.toLowerCase();
    return logs.filter(r =>
      (r.action ?? r.event ?? "").toLowerCase().includes(q) ||
      (r.actor ?? r.actorId ?? r.userId ?? "").toLowerCase().includes(q) ||
      (r.resource ?? r.resourceType ?? r.connectorId ?? "").toLowerCase().includes(q) ||
      (r.status ?? r.outcome ?? "").toLowerCase().includes(q)
    );
  }, [logs, searchQuery]);

  const handleExport = () => {
    const rows = [["Timestamp","Actor","Action","Resource","Status"]];
    filtered.forEach(r => rows.push([
      new Date(r.createdAt ?? r.timestamp ?? Date.now()).toLocaleString(),
      r.actor ?? r.actorId ?? "—",
      r.action ?? r.event ?? "—",
      r.resource ?? r.resourceType ?? r.connectorId ?? "—",
      r.status ?? r.outcome ?? "—",
    ]));
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `audit-log-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
  };

  const formatTime = (ts) => {
    if (!ts) return "—";
    try { return new Date(ts).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }); }
    catch { return String(ts); }
  };

  return (
    <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: 24 }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 500, color: "var(--t1)", letterSpacing: "-0.4px", display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <FileText style={{ width: 22, height: 22, color: "var(--brand)" }} />
            Audit & Compliance
          </h1>
          <p style={{ fontSize: 12, color: "var(--t4)", maxWidth: 520 }}>
            Immutable, searchable logs for SOC2, ISO27001, and GDPR compliance tracing.
            {!loading && ` · ${logs.length} entries`}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          <button onClick={fetchLogs} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "var(--t5)", background: "rgba(31,27,22,0.05)", border: "1px solid var(--border)", borderRadius: 4, padding: "6px 10px", cursor: "pointer" }}>
            <RefreshCw style={{ width: 11, height: 11 }} /> Refresh
          </button>
          <button onClick={handleExport} disabled={filtered.length === 0} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#fff", background: "var(--brand)", border: "none", borderRadius: 4, padding: "6px 12px", cursor: filtered.length === 0 ? "not-allowed" : "pointer", fontWeight: 500, opacity: filtered.length === 0 ? 0.4 : 1 }}>
            <Download style={{ width: 13, height: 13 }} /> Export CSV
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "3fr 1fr", gap: 14 }}>

        {/* Logs table */}
        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-strong)", borderRadius: 4, padding: "20px" }}>
          <div style={{ position: "relative", marginBottom: 16 }}>
            <Search style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", width: 14, height: 14, color: searchFocused ? "var(--brand)" : "var(--t5)", transition: "color 120ms" }} />
            <input
              type="text"
              placeholder="Search logs (actor, action, resource, status)..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              style={{ width: "100%", background: "rgba(31,27,22,0.045)", border: `1px solid ${searchFocused ? "rgba(232,103,43,0.40)" : "var(--border-strong)"}`, borderRadius: 4, paddingLeft: 34, paddingRight: 12, paddingTop: 8, paddingBottom: 8, fontSize: 12, color: "var(--t1)", outline: "none", boxSizing: "border-box", transition: "border-color 120ms" }}
            />
          </div>

          {loading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {[1,2,3,4,5].map(i => (
                <div key={i} style={{ height: 40, borderRadius: 4, background: "rgba(31,27,22,0.04)", border: "1px solid var(--border)", position: "relative", overflow: "hidden" }}>
                  <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, transparent 0%, rgba(31,27,22,0.05) 50%, transparent 100%)", animation: "shimmer-sweep 1.6s ease-in-out infinite" }} />
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: "center", padding: "32px 0", color: "var(--t5)", fontSize: 11 }}>
              {logs.length === 0 ? "No audit logs yet. Execute connector actions to generate entries." : "No results match your search."}
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)" }}>
                    {["Timestamp","Actor","Action","Resource","Status"].map(h => (
                      <th key={h} style={{ padding: "6px 10px", fontSize: 9, fontWeight: 500, color: "var(--t5)", textTransform: "uppercase", letterSpacing: "0.10em", textAlign: "left", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row, i) => {
                    const status = row.status ?? row.outcome ?? "—";
                    const s = statusStyle(status);
                    return (
                      <tr key={row.id ?? i} onMouseEnter={() => setHRow(i)} onMouseLeave={() => setHRow(null)}
                        style={{ borderBottom: "1px solid var(--border)", background: hRow === i ? "var(--bg-hover)" : "transparent", transition: "background 80ms" }}>
                        <td style={{ padding: "10px 10px", color: "var(--t4)", fontSize: 10, whiteSpace: "nowrap" }}>{formatTime(row.createdAt ?? row.timestamp)}</td>
                        <td style={{ padding: "10px 10px", fontWeight: 500, color: "var(--t1)", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.actor ?? row.actorId ?? row.userId ?? "—"}</td>
                        <td style={{ padding: "10px 10px", color: "var(--t2)", whiteSpace: "nowrap" }}>{row.action ?? row.event ?? "—"}</td>
                        <td style={{ padding: "10px 10px", color: "var(--t3)", fontSize: 10, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.resource ?? row.resourceType ?? row.connectorId ?? "—"}</td>
                        <td style={{ padding: "10px 10px", whiteSpace: "nowrap" }}>
                          <span style={{ fontSize: 9, fontWeight: 500, color: s.color, textTransform: "uppercase" }}>{status}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Compliance sidebar */}
        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-strong)", borderRadius: 4, padding: "20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, borderBottom: "1px solid var(--border)", paddingBottom: 10, marginBottom: 18 }}>
            <Shield style={{ width: 14, height: 14, color: "var(--brand)" }} />
            <h2 style={{ fontSize: 9, fontWeight: 500, color: "var(--t1)", textTransform: "uppercase", letterSpacing: "0.10em" }}>Compliance Reports</h2>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {COMPLIANCE_REPORTS.map(name => (
              <button key={name} onMouseEnter={() => setHBtn(name)} onMouseLeave={() => setHBtn(null)}
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", background: hBtn === name ? "var(--bg-hover)" : "rgba(31,27,22,0.04)", border: `1px solid ${hBtn === name ? "rgba(232,103,43,0.30)" : "var(--border)"}`, borderRadius: 4, cursor: "pointer", transition: "all 100ms" }}>
                <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 500, color: "var(--t1)" }}>
                  <FileKey style={{ width: 13, height: 13, color: "var(--brand)" }} /> {name}
                </span>
                <Download style={{ width: 12, height: 12, color: "var(--t5)" }} />
              </button>
            ))}
          </div>

          {/* Log summary stats */}
          {!loading && logs.length > 0 && (
            <div style={{ marginTop: 20, borderTop: "1px solid var(--border)", paddingTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                { label: "Total Events",  value: logs.length },
                { label: "Allow / Success", value: logs.filter(r => ["allow","success"].includes((r.status??r.outcome??"").toLowerCase())).length },
                { label: "Denied",         value: logs.filter(r => ["denied","deny"].includes((r.status??r.outcome??"").toLowerCase())).length },
                { label: "Pending Approval", value: logs.filter(r => (r.status??r.outcome??"").toLowerCase().includes("approval")).length },
              ].map(s => (
                <div key={s.label} style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 10, color: "var(--t4)" }}>{s.label}</span>
                  <span style={{ fontSize: 10, fontWeight: 500, color: "var(--t1)" }}>{s.value}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AuditCompliance;
