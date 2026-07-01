import { useNavigate } from "react-router-dom";
import { Pencil, Search, CheckSquare, Upload, Calendar, FileText } from "lucide-react";

const ACTIONS = [
  { label: "Compose",  icon: Pencil,      event: "flow:open-compose" },
  { label: "Ask FLOW", icon: Search,      event: "flow:open-search"  },
  { label: "Task",     icon: CheckSquare, route: "/projects"         },
  { label: "Upload",   icon: Upload,      route: "/platform/import"  },
  { label: "Meeting",  icon: Calendar,    route: "/meetings"         },
  { label: "Note",     icon: FileText,    event: "flow:open-note"    },
];

export function QuickActionGrid() {
  const navigate = useNavigate();

  const handleAction = (action) => {
    if (action.route) {
      navigate(action.route);
    } else if (action.event) {
      window.dispatchEvent(new CustomEvent(action.event));
    }
  };

  return (
    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
      {ACTIONS.map(({ label, icon: Icon, ...action }) => (
        <button
          key={label}
          onClick={() => handleAction({ label, icon: Icon, ...action })}
          className="flex flex-col items-center justify-center gap-1.5 py-3 px-2 rounded-xl bg-bg-secondary border border-border-flow hover:border-flow-purple/30 hover:bg-bg-hover transition-apple cursor-pointer group"
        >
          <div className="w-7 h-7 rounded-lg bg-bg-hover group-hover:bg-flow-purple/10 flex items-center justify-center transition-colors">
            <Icon className="w-3.5 h-3.5 text-text-muted group-hover:text-flow-purple transition-colors" />
          </div>
          <span className="text-[10px] font-medium text-text-muted group-hover:text-text-secondary transition-colors">
            {label}
          </span>
        </button>
      ))}
    </div>
  );
}

export default QuickActionGrid;
