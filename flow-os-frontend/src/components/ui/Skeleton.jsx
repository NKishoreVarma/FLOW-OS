export function Skeleton({ className = "", width, height }) {
  const style = {};
  if (width) style.width = width;
  if (height) style.height = height;
  return (
    <div
      className={`bg-bg-hover rounded animate-pulse ${className}`}
      style={style}
    />
  );
}

Skeleton.Text = function SkeletonText({ lines = 3, className = "" }) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={`h-3 rounded ${i === lines - 1 ? 'w-2/3' : 'w-full'}`}
        />
      ))}
    </div>
  );
};

Skeleton.Card = function SkeletonCard({ className = "" }) {
  return (
    <div className={`bg-bg-card border border-border-flow rounded-xl p-4 space-y-3 ${className}`}>
      <div className="flex items-center space-x-3">
        <Skeleton className="w-8 h-8 rounded-lg flex-shrink-0" />
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="h-2.5 w-1/3" />
        </div>
      </div>
      <Skeleton.Text lines={2} />
    </div>
  );
};

Skeleton.Header = function SkeletonHeader() {
  return (
    <div className="h-16 border-b border-border-flow/80 px-6 flex items-center justify-between bg-bg-primary/60">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-8 w-48 rounded-lg" />
      <div className="flex items-center space-x-3">
        <Skeleton className="h-6 w-24 rounded-full" />
        <Skeleton className="h-8 w-8 rounded-full" />
      </div>
    </div>
  );
};

export default Skeleton;
