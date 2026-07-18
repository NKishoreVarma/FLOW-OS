import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle } from "lucide-react";

export default function ConfirmDialog({
  isOpen,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel  = "Cancel",
  danger       = false,
  onConfirm,
  onCancel,
}) {
  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => { if (e.key === "Escape") onCancel(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onCancel]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={onCancel}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 6 }}
            transition={{ duration: 0.15 }}
            className="w-full max-w-sm bg-bg-card border border-border-flow rounded-xl p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              {danger && (
                <div className="w-8 h-8 rounded-lg bg-critical/10 border border-critical/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <AlertTriangle className="w-4 h-4 text-critical" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-ui-sm font-medium text-text-primary">{title}</p>
                {description && (
                  <p className="text-ui-xs text-text-secondary mt-1.5 leading-relaxed">{description}</p>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={onCancel}
                className="px-3.5 py-1.5 rounded-lg border border-border-flow text-ui-xs text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors"
              >
                {cancelLabel}
              </button>
              <button
                onClick={onConfirm}
                className={`px-3.5 py-1.5 rounded-lg text-ui-xs font-medium text-white transition-colors ${
                  danger
                    ? "bg-critical hover:bg-critical/90"
                    : "bg-flow-purple hover:bg-flow-purple/90"
                }`}
              >
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
