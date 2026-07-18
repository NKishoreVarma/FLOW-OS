import { Search } from "lucide-react";

export const SearchInput = ({
  value,
  onChange,
  placeholder = "Search workspace intelligence...",
  className = "",
  ...props
}) => {
  return (
    <div className={`relative w-full ${className}`}>
      {/* Left Search Icon */}
      <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-text-muted">
        <Search className="w-4 h-4" />
      </div>

      {/* Input Field */}
      <input
        type="text"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="w-full bg-bg-primary hover:bg-bg-primary/80 focus:bg-bg-primary border border-border-flow focus:border-flow-purple/60 rounded-lg pl-9 pr-12 py-2 text-ui-base text-text-primary placeholder:text-text-muted transition-apple focus:outline-none focus:ring-1 focus:ring-flow-purple/35"
        {...props}
      />

      {/* Right Shortcut Badge */}
      <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none select-none">
        <kbd className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold text-text-muted bg-bg-secondary border border-border-flow">
          <span>⌘</span>
          <span>K</span>
        </kbd>
      </div>
    </div>
  );
};

export default SearchInput;
