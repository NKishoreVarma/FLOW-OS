import { Inbox } from "lucide-react";

export function EmptyState({ title = "Nothing here yet", description = "Check back after FLOW processes more intelligence.", icon: Icon = Inbox }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center px-4">
      <div className="w-12 h-12 rounded-2xl bg-bg-secondary border border-border-flow flex items-center justify-center mb-4">
        <Icon className="w-5 h-5 text-text-muted" />
      </div>
      <p className="text-ui-sm font-semibold text-text-secondary">{title}</p>
      {description && <p className="text-ui-xs text-text-muted mt-1.5 max-w-xs">{description}</p>}
    </div>
  );
}

export default EmptyState;
