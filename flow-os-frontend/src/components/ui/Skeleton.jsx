const shimmerStyle = {
  background: "linear-gradient(90deg, var(--bg-card) 25%, var(--bg-hover) 50%, var(--bg-card) 75%)",
  backgroundSize: "200% 100%",
  animation: "shimmer-sweep 1.6s ease-in-out infinite",
};

export function Skeleton({ className = "", width, height, style = {} }) {
  return (
    <div
      className={className}
      style={{ borderRadius: 3, height: height || 12, width: width || "100%", ...shimmerStyle, ...style }}
    />
  );
}

Skeleton.Text = function SkeletonText({ lines = 3, className = "" }) {
  return (
    <div className={className} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} style={{ width: i === lines - 1 ? "66%" : "100%", height: 11 }} />
      ))}
    </div>
  );
};

Skeleton.Card = function SkeletonCard({ className = "" }) {
  return (
    <div
      className={className}
      style={{
        background:   "var(--bg-card)",
        border:       "1px solid var(--border)",
        borderRadius:  4,
        padding:       16,
        display:      "flex",
        flexDirection: "column",
        gap:           12,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Skeleton style={{ width: 32, height: 32, borderRadius: 4, flexShrink: 0 }} />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 5 }}>
          <Skeleton style={{ width: "50%", height: 11 }} />
          <Skeleton style={{ width: "35%", height: 10 }} />
        </div>
      </div>
      <Skeleton.Text lines={2} />
    </div>
  );
};

Skeleton.Header = function SkeletonHeader() {
  return (
    <div style={{
      height: 48, borderBottom: "1px solid var(--border)",
      padding: "0 20px", display: "flex", alignItems: "center", justifyContent: "space-between",
      background: "var(--bg-sidebar)",
    }}>
      <Skeleton style={{ width: 120, height: 13 }} />
      <div style={{ display: "flex", gap: 8 }}>
        <Skeleton style={{ width: 80, height: 28, borderRadius: 4 }} />
        <Skeleton style={{ width: 28, height: 28, borderRadius: 4 }} />
      </div>
    </div>
  );
};

export default Skeleton;
