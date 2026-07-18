import { AnimatePresence, motion } from "framer-motion";
import { X, Command } from "lucide-react";

export const ShortcutModal = ({ isOpen, onClose }) => {
  const shortcutList = [
    { keys: ["⌘", "K"], desc: "Global Search / Command Menu" },
    { keys: ["⌘", "N"], desc: "Create new Quick Note in Obsidian" },
    { keys: ["⌘", "E"], desc: "Compose Gmail Outbound Response" },
    { keys: ["⌘", "/"], desc: "Toggle Keyboard Shortcuts Help Panel" },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(31,27,22,0.35)", backdropFilter: "blur(8px)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            onClick={e => e.stopPropagation()}
            style={{ width: "100%", maxWidth: 360, background: "var(--bg-sidebar)", border: "1px solid var(--border-strong)", borderRadius: 6, boxShadow: "0 24px 64px rgba(31,27,22,0.35)", overflow: "hidden" }}
          >
            {/* Header */}
            <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", background: "rgba(31,27,22,0.01)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Command style={{ width: 13, height: 13, color: "var(--brand)" }} />
                <span style={{ fontSize: 13, fontWeight: 500, color: "var(--t1)" }}>Keyboard Shortcuts</span>
              </div>
              <button
                onClick={onClose}
                style={{ padding: "4px", borderRadius: 4, background: "transparent", border: "none", color: "var(--t5)", cursor: "pointer", display: "flex", alignItems: "center" }}
              >
                <X style={{ width: 14, height: 14 }} />
              </button>
            </div>

            {/* List */}
            <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
              {shortcutList.map((sc, idx) => (
                <div key={idx} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 12, color: "var(--t3)", fontWeight: 300 }}>{sc.desc}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    {sc.keys.map((key, kIdx) => (
                      <kbd key={kIdx} style={{ padding: "2px 6px", borderRadius: 3, fontSize: 10, fontWeight: 500, color: "var(--t4)", background: "rgba(31,27,22,0.06)", border: "1px solid var(--border-strong)", fontFamily: "'IBM Plex Mono', monospace" }}>
                        {key}
                      </kbd>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div style={{ padding: "8px 16px", borderTop: "1px solid var(--border)", background: "rgba(31,27,22,0.01)", textAlign: "center" }}>
              <span style={{ fontSize: 9, fontWeight: 500, color: "var(--t5)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                FLOW OS Keyboard Navigation Map
              </span>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default ShortcutModal;
