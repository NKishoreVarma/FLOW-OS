import { Calendar, Clock, Users } from "lucide-react";

function fmtTime(iso) {
  if (!iso) return "";
  try { return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }
  catch { return iso; }
}

export default function InlineMeetingCard({ event }) {
  const attendeeCount = event.attendees?.length ?? 0;
  return (
    <div style={{ border: "1px solid var(--border-strong)", borderRadius: 4, padding: "10px 12px", background: "var(--bg-card)" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        <Calendar style={{ width: 14, height: 14, color: "var(--p-normal)", marginTop: 2, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 12, fontWeight: 500, color: "var(--t1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {event.title || event.summary}
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 4 }}>
            {event.start && (
              <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--t4)" }}>
                <Clock style={{ width: 10, height: 10 }} />
                {fmtTime(event.start)}{event.end && ` – ${fmtTime(event.end)}`}
              </span>
            )}
            {attendeeCount > 0 && (
              <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--t4)" }}>
                <Users style={{ width: 10, height: 10 }} />
                {attendeeCount} attendees
              </span>
            )}
          </div>
        </div>
        {event.videoUrl && (
          <a
            href={event.videoUrl}
            target="_blank"
            rel="noreferrer"
            style={{ flexShrink: 0, padding: "3px 8px", borderRadius: 3, background: "rgba(76,175,130,0.08)", border: "1px solid rgba(76,175,130,0.22)", color: "var(--p-normal)", fontSize: 10, fontWeight: 500, textDecoration: "none" }}
          >
            Join
          </a>
        )}
      </div>
    </div>
  );
}
