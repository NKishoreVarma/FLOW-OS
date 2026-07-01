import { CheckCircle, Search, Inbox, Calendar, Briefcase, BookOpen, Activity, Bell } from "lucide-react";

const VARIANTS = {
  default:       { icon: CheckCircle, title: "All clear",             desc: "Nothing needs your attention right now." },
  search:        { icon: Search,      title: "No results found",      desc: "Try adjusting your search terms or filters." },
  inbox:         { icon: Inbox,       title: "Inbox is empty",        desc: "No messages require your attention." },
  meetings:      { icon: Calendar,    title: "No meetings",           desc: "Your calendar is clear for this period." },
  projects:      { icon: Briefcase,   title: "No projects",           desc: "Connect GitHub to see your projects here." },
  knowledge:     { icon: BookOpen,    title: "No documents",          desc: "Connect Notion or Drive to explore your knowledge base." },
  activity:      { icon: Activity,    title: "No activity yet",       desc: "Activity will appear here as FLOW processes intelligence." },
  notifications: { icon: Bell,        title: "No notifications",      desc: "You're all caught up." },
};

export function EmptyState({ variant = "default", message, description, icon: CustomIcon, action }) {
  const v = VARIANTS[variant] || VARIANTS.default;
  const Icon = CustomIcon || v.icon;
  const title = message || v.title;
  const desc = description || v.desc;

  return (
    <div className="flex flex-col items-center justify-center py-12 text-center px-6">
      <div className="w-12 h-12 rounded-2xl bg-bg-secondary border border-border-flow flex items-center justify-center mb-4">
        <Icon className="w-5 h-5 text-text-muted" />
      </div>
      <p className="text-ui-sm font-semibold text-text-secondary">{title}</p>
      <p className="text-ui-xs text-text-muted mt-1.5 max-w-xs leading-relaxed">{desc}</p>
      {action && (
        <button
          onClick={action.onClick}
          className="mt-4 px-4 py-2 text-ui-sm font-semibold text-flow-purple hover:text-white hover:bg-flow-purple rounded-lg border border-flow-purple/30 hover:border-flow-purple transition-apple cursor-pointer"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

export default EmptyState;
