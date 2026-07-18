const STATUS = {
  online:       { color: "var(--p-normal)", pulse: true },
  active:       { color: "var(--p-normal)", pulse: true },
  success:      { color: "var(--p-normal)", pulse: true },
  connecting:   { color: "var(--p-high)", pulse: true },
  reconnecting: { color: "var(--p-high)", pulse: true },
  warning:      { color: "var(--p-high)", pulse: false },
  offline:      { color: "var(--t4)", pulse: false },
  error:        { color: "var(--p-critical)", pulse: false },
  critical:     { color: "var(--p-critical)", pulse: true },
};

export const StatusDot = ({ status = "offline", size = 6, className = "" }) => {
  const s = STATUS[String(status).toLowerCase()] || STATUS.offline;
  return (
    <span className={className} style={{ position: "relative", display: "inline-flex", width: size, height: size, flexShrink: 0 }}>
      {s.pulse && (
        <span style={{
          position: "absolute", inset: 0, borderRadius: "50%",
          background: s.color, opacity: 0.4,
          animation: "pulse-dot 2s ease-in-out infinite",
        }} />
      )}
      <span style={{
        position: "relative", display: "inline-block",
        width: size, height: size, borderRadius: "50%",
        background: s.color,
      }} />
    </span>
  );
};

export default StatusDot;
