import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Sparkles, CheckSquare, Mail, FileText, CalendarPlus } from "lucide-react";

/**
 * QuickCreateMenu (Phase 16) — a global "＋ New": start any action from anywhere,
 * the way an OS lets you create from a single affordance. Reuses the existing
 * flow:* events and routes — no new backend, no new flows.
 */
export default function QuickCreateMenu() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onEsc = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onEsc);
    return () => { document.removeEventListener("mousedown", onDoc); window.removeEventListener("keydown", onEsc); };
  }, [open]);

  const fire = (name) => { window.dispatchEvent(new CustomEvent(name)); setOpen(false); };
  const go = (route) => { navigate(route); setOpen(false); };

  const items = [
    { icon: Sparkles,     label: "Ask FLOW",         hint: "⌘K", run: () => go("/brain") },
    { icon: CheckSquare,  label: "Create Jira issue", run: () => fire("flow:create-jira") },
    { icon: Mail,         label: "Compose email",     hint: "⌘E", run: () => fire("flow:open-compose") },
    { icon: FileText,     label: "New note",          hint: "⌘N", run: () => fire("flow:open-note") },
    { icon: CalendarPlus, label: "Schedule meeting",  run: () => go("/meetings") },
  ];

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Create new"
        style={{
          display: "inline-flex", alignItems: "center", gap: 5, height: 30, padding: "0 11px", borderRadius: 5,
          background: open ? "rgba(232,103,43,0.12)" : "rgba(232,103,43,0.06)",
          border: `1px solid ${open ? "rgba(232,103,43,0.35)" : "var(--brand-line)"}`,
          color: "var(--brand-text)", fontSize: 12, fontWeight: 500, cursor: "pointer", transition: "all 100ms",
        }}
      >
        <Plus style={{ width: 13, height: 13 }} /> New
      </button>

      {open && (
        <div style={{
          position: "absolute", right: 0, top: "100%", marginTop: 6, width: 216, zIndex: 60,
          background: "var(--bg-sidebar)", border: "1px solid var(--border-strong)", borderRadius: 8,
          boxShadow: "0 18px 50px rgba(31,27,22,0.12)", overflow: "hidden", padding: 4,
        }}>
          {items.map((it) => {
            const Icon = it.icon;
            return (
              <button key={it.label} onClick={it.run}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 5, background: "transparent", border: "none", color: "var(--t2)", cursor: "pointer", fontSize: 13, textAlign: "left" }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(31,27,22,0.05)"; e.currentTarget.style.color = "var(--t1)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--t2)"; }}>
                <Icon style={{ width: 14, height: 14, color: "var(--brand)", flexShrink: 0 }} />
                <span style={{ flex: 1 }}>{it.label}</span>
                {it.hint && <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: "var(--t5)" }}>{it.hint}</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
