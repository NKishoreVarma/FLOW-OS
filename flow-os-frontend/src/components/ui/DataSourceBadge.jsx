/**
 * DataSourceBadge — one honest indicator of where the data on screen came from.
 *
 * Replaces the ad-hoc "Demo" chips scattered across feature pages so every surface
 * tells the user the same thing the same way: is this LIVE from a connected
 * backend, seeded DEMO data (connector not linked), STALE (last good fetch failed),
 * or OFFLINE/ERROR. No new data — it only surfaces state the pages already track.
 */
const MODES = {
  live:    { color: "var(--p-normal)", label: "Live",    title: "Live data from a connected source" },
  demo:    { color: "var(--t5)",       label: "Demo",    title: "Sample data — connect this source to see live data" },
  stale:   { color: "var(--p-high)",   label: "Stale",   title: "Showing last known data — a refresh failed" },
  offline: { color: "var(--t4)",       label: "Offline", title: "No connection to the backend" },
  error:   { color: "var(--p-critical)", label: "Error", title: "The backend returned an error" },
};

export default function DataSourceBadge({ mode = "demo", label, title }) {
  const cfg = MODES[String(mode).toLowerCase()] || MODES.demo;
  return (
    <span
      title={title || cfg.title}
      style={{
        display:        "inline-flex",
        alignItems:     "center",
        gap:            5,
        padding:        "2px 7px",
        borderRadius:   3,
        fontSize:       9,
        fontWeight:     600,
        letterSpacing:  "0.06em",
        textTransform:  "uppercase",
        color:          cfg.color,
        background:    `color-mix(in srgb, ${cfg.color} 10%, transparent)`,
        border:        `1px solid color-mix(in srgb, ${cfg.color} 25%, transparent)`,
        cursor:         "default",
      }}
    >
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: cfg.color, flexShrink: 0 }} />
      {label || cfg.label}
    </span>
  );
}
