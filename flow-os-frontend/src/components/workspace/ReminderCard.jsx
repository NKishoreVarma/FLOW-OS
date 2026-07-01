import { useState, useEffect } from "react";
import { Clock } from "lucide-react";
import { useWebSocket } from "../../hooks/useWebSocket";
import Card from "../ui/Card";

const DEMO_REMINDERS = [
  { id: 1, text: "Review Q3 OKRs", due: "Today" },
  { id: 2, text: "Approve pending PRs", due: "Today" },
  { id: 3, text: "Weekly team retrospective", due: "Tomorrow" },
];

export function ReminderCard() {
  const { token, workspaceId } = useWebSocket();
  const [reminders, setReminders] = useState(DEMO_REMINDERS);

  useEffect(() => {
    if (!token || !workspaceId) return;
    fetch('/api/brain/goals', {
      headers: { Authorization: `Bearer ${token}`, 'workspace-id': workspaceId },
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        const goals = data?.goals || data?.milestones || [];
        if (Array.isArray(goals) && goals.length > 0) {
          setReminders(goals.slice(0, 4).map((g, i) => ({
            id: g.id || i,
            text: g.title || g.name || 'Goal',
            due: g.targetDate
              ? new Date(g.targetDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
              : 'Soon',
          })));
        }
      })
      .catch(() => {});
  }, [token, workspaceId]);

  return (
    <Card className="p-4">
      <Card.Header className="mb-3">
        <Card.Title className="text-ui-sm font-semibold text-text-primary flex items-center space-x-2">
          <Clock className="w-3.5 h-3.5 text-flow-purple" />
          <span>Reminders</span>
        </Card.Title>
      </Card.Header>
      <ul className="space-y-2.5">
        {reminders.map(r => (
          <li key={r.id} className="flex items-center justify-between">
            <span className="text-ui-xs text-text-secondary truncate">{r.text}</span>
            <span className="text-[10px] text-text-muted ml-2 flex-shrink-0">{r.due}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export default ReminderCard;
