export const SectionHeader = ({ title, count, actions, className = "" }) => {
  return (
    <div className={`flex items-center justify-between border-b border-border-flow/80 pb-2 mb-4 ${className}`}>
      {/* Title & Count Badge */}
      <div className="flex items-center space-x-2">
        <h2 className="text-ui-sm font-semibold tracking-wider uppercase text-text-secondary">
          {title}
        </h2>
        {count !== undefined && count > 0 && (
          <span className="bg-bg-hover text-text-secondary text-[10px] font-bold px-2 py-0.5 rounded-full border border-border-flow">
            {count}
          </span>
        )}
      </div>

      {/* Right Aligned Actions */}
      {actions && (
        <div className="flex items-center space-x-2">
          {actions}
        </div>
      )}
    </div>
  );
};

export default SectionHeader;
