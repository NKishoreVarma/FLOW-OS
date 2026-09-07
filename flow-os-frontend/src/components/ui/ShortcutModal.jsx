import { AnimatePresence, motion } from "framer-motion";
import { X, Command } from "lucide-react";
import { useLocation } from "react-router-dom";

const GLOBAL_SHORTCUTS = [
  { keys: ["⌘", "K"], desc: "Open Command Palette" },
  { keys: ["⌘", "/"], desc: "Focus Command Center" },
  { keys: ["⌘", "."], desc: "Cancel AI request" },
  { keys: ["⌘", "N"], desc: "New note" },
  { keys: ["⌘", "E"], desc: "Compose email" },
  { keys: ["⌘", "B"], desc: "Toggle sidebar" },
  { keys: ["?"],       desc: "This reference" },
  { keys: ["Esc"],     desc: "Dismiss / close innermost layer" },
];

// Per-page shortcuts shown when the modal is open on that route
const PAGE_SHORTCUTS = {
  "/":           { label: "Home", items: [{ keys: ["↓", "↑"], desc: "Navigate cards" }, { keys: ["E"], desc: "Expand evidence" }, { keys: ["D"], desc: "Dismiss card" }, { keys: ["Space"], desc: "Execute primary action" }] },
  "/inbox":      { label: "Inbox", items: [{ keys: ["↓", "↑"], desc: "Navigate items" }, { keys: ["A"], desc: "Approve (approval items)" }, { keys: ["R"], desc: "Reject (approval items)" }, { keys: ["Enter"], desc: "Open detail" }] },
  "/projects":   { label: "Engineering", items: [{ keys: ["↓", "↑"], desc: "Navigate PR list" }, { keys: ["Enter"], desc: "Open PR" }, { keys: ["M"], desc: "Merge (when ready)" }] },
  "/meetings":   { label: "Meetings", items: [{ keys: ["↓", "↑"], desc: "Navigate meetings" }, { keys: ["P"], desc: "Go to prep" }, { keys: ["L"], desc: "Go to live meeting" }] },
  "/knowledge":  { label: "Knowledge", items: [{ keys: ["⌘", "F"], desc: "Focus entity search" }, { keys: ["+"], desc: "Zoom in on graph" }, { keys: ["-"], desc: "Zoom out" }, { keys: ["0"], desc: "Reset zoom" }] },
  "/chief":      { label: "Chief of Staff", items: [{ keys: ["↓", "↑"], desc: "Navigate cards" }, { keys: ["Space"], desc: "Execute primary action" }, { keys: ["E"], desc: "Expand evidence" }, { keys: ["D"], desc: "Dismiss card" }, { keys: ["N"], desc: "Toggle NEXT section" }] },
  "/review":     { label: "Weekly Review", items: [{ keys: ["↓", "↑"], desc: "Navigate sections" }, { keys: ["E"], desc: "Expand / collapse section" }, { keys: ["⌘", "P"], desc: "Print / export" }] },
  "/people":     { label: "People", items: [{ keys: ["⌘", "F"], desc: "Focus search" }, { keys: ["Enter"], desc: "Open person detail" }, { keys: ["S"], desc: "Run departure simulation" }] },
  "/customers":  { label: "Customers", items: [{ keys: ["⌘", "F"], desc: "Focus search" }, { keys: ["Enter"], desc: "Open customer detail" }, { keys: ["S"], desc: "Run churn simulation" }] },
  "/council":    { label: "Executive Council", items: [{ keys: ["⌘", "Enter"], desc: "Submit question" }, { keys: ["⌘", "."], desc: "Cancel analysis" }, { keys: ["1–6"], desc: "Focus agent card by position" }] },
  "/activity":   { label: "Activity", items: [{ keys: ["R"], desc: "Toggle Replay mode" }, { keys: ["Space"], desc: "Play / pause (Replay)" }, { keys: ["←", "→"], desc: "Step events (Replay)" }, { keys: ["1", "2", "5"], desc: "Set replay speed" }] },
  "/integrations": { label: "Integrations", items: [{ keys: ["⌘", "F"], desc: "Focus resource search" }, { keys: ["Space"], desc: "Toggle resource allow/hide" }, { keys: ["D"], desc: "Trigger discovery" }] },
};

function ShortcutRow({ keys, desc }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
      <span style={{ fontSize: 12, color: "var(--t3)", fontWeight: 300, flex: 1 }}>{desc}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 3, flexShrink: 0 }}>
        {keys.map((key, i) => (
          <kbd key={i} style={{ padding: "2px 6px", borderRadius: 3, fontSize: 10, fontWeight: 500, color: "var(--t4)", background: "rgba(31,27,22,0.06)", border: "1px solid var(--border-strong)", fontFamily: "'IBM Plex Mono', monospace" }}>
            {key}
          </kbd>
        ))}
      </div>
    </div>
  );
}

function SectionLabel({ label }) {
  return (
    <div style={{ fontSize: 9, fontWeight: 500, color: "var(--t5)", textTransform: "uppercase", letterSpacing: "0.09em", paddingTop: 4, paddingBottom: 2 }}>
      {label}
    </div>
  );
}

export const ShortcutModal = ({ isOpen, onClose }) => {
  const location = useLocation();
  const basePath = "/" + (location.pathname.split("/")[1] || "");
  const pageShortcuts = PAGE_SHORTCUTS[basePath] || null;

  return (
    <AnimatePresence>
      {isOpen && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(31,27,22,0.35)", backdropFilter: "blur(8px)", zIndex: 3000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            onClick={e => e.stopPropagation()}
            style={{ width: "100%", maxWidth: 380, background: "var(--surface-1)", border: "1px solid var(--line-1)", borderRadius: 6, boxShadow: "0 24px 64px rgba(31,27,22,0.35)", overflow: "hidden" }}
          >
            {/* Header */}
            <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--line-0)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Command style={{ width: 13, height: 13, color: "var(--accent)" }} />
                <span style={{ fontSize: 13, fontWeight: 500, color: "var(--t1)" }}>Keyboard Shortcuts</span>
              </div>
              <button
                onClick={onClose}
                style={{ padding: "4px", borderRadius: 4, background: "transparent", border: "none", color: "var(--t5)", cursor: "pointer", display: "flex", alignItems: "center" }}
              >
                <X style={{ width: 14, height: 14 }} />
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 6, maxHeight: "70vh", overflowY: "auto" }}>
              <SectionLabel label="Global" />
              {GLOBAL_SHORTCUTS.map((sc, i) => <ShortcutRow key={i} keys={sc.keys} desc={sc.desc} />)}

              {pageShortcuts && (
                <>
                  <SectionLabel label={`This page: ${pageShortcuts.label}`} />
                  {pageShortcuts.items.map((sc, i) => <ShortcutRow key={i} keys={sc.keys} desc={sc.desc} />)}
                </>
              )}

              <SectionLabel label="Navigation" />
              <ShortcutRow keys={["↓", "↑"]} desc="Navigate results" />
              <ShortcutRow keys={["Enter"]} desc="Execute / open" />
              <ShortcutRow keys={["Esc"]} desc="Close / dismiss" />
            </div>

            {/* Footer */}
            <div style={{ padding: "8px 16px", borderTop: "1px solid var(--line-0)", textAlign: "center" }}>
              <span style={{ fontSize: 9, fontWeight: 500, color: "var(--t5)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Press ? anywhere to show this reference
              </span>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default ShortcutModal;
