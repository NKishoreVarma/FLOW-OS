export function Tabs({ tabs, activeTab, onTabChange, className = "" }) {
  return (
    <div className={`flex border-b border-border-flow/40 ${className}`}>
      {tabs.map(tab => {
        const label = typeof tab === 'string' ? tab : tab.label;
        const count = typeof tab === 'object' ? tab.count : undefined;
        return (
          <button
            key={label}
            onClick={() => onTabChange(label)}
            className={`px-4 py-2.5 text-ui-sm font-medium border-b-2 transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === label
                ? 'border-flow-purple text-flow-purple'
                : 'border-transparent text-text-muted hover:text-text-secondary'
            }`}
          >
            {label}
            {count !== undefined && count > 0 && (
              <span className="text-[10px] bg-flow-purple/10 text-flow-purple px-1.5 py-0.5 rounded-full font-semibold">
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default Tabs;
