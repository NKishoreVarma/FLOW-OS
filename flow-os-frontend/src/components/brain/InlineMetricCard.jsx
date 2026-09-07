const STATUS_COLORS = {
  info:     "var(--p-info)",
  success:  "var(--p-normal)",
  warning:  "var(--p-high)",
  critical: "var(--p-critical)",
};

export default function InlineMetricCard({ title, value, delta, unit = "", status = "info" }) {
  const color = STATUS_COLORS[status] || STATUS_COLORS.info;
  const deltaSign = delta > 0 ? "+" : "";
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 4, padding: "10px 12px", background: "var(--bg-card)", display: "inline-flex", flexDirection: "column", gap: 4, minWidth: 112 }}>
      <p style={{ fontSize: 10, color: "var(--t4)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{title}</p>
      <p style={{ fontSize: 20, fontWeight: 500, color, letterSpacing: "-0.5px" }}>{value}{unit}</p>
      {delta !== undefined && (
        <p style={{ fontSize: 10, color: "var(--t3)" }}>
          {deltaSign}{delta}{unit} <span style={{ color: "var(--t5)" }}>vs last period</span>
        </p>
      )}
    </div>
  );
}
