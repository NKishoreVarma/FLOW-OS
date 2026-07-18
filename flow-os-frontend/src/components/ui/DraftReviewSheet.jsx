import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, Sparkles, BookOpen, Clock, Check, Copy } from "lucide-react";
import Button from "./Button";
import { useToast } from "./ToastProvider";

export const DraftReviewSheet = ({ isOpen, onClose, approvalItem, onApprove, onReject }) => {
  const { showToast } = useToast();
  const [draftText, setDraftText] = useState("");

  useEffect(() => {
    if (approvalItem) {
      const timer = setTimeout(() => {
        setDraftText(approvalItem.details || "");
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [approvalItem]);

  const handleCopy = () => {
    navigator.clipboard.writeText(draftText);
    showToast("Draft copied to clipboard!", "success");
  };

  const localApprove = () => {
    if (onApprove) onApprove(approvalItem.id, draftText);
    onClose();
  };

  const localReject = () => {
    if (onReject) onReject(approvalItem.id);
    onClose();
  };

  if (!approvalItem) return null;

  const confidence = approvalItem.confidence || "94%";
  const readingTime = "1m";

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop blur overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50"
            onClick={onClose}
          />

          {/* Slide-over panel */}
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 220 }}
            className="fixed inset-y-0 right-0 w-full max-w-lg bg-bg-card border-l border-white/10 z-50 flex flex-col shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="px-6 py-4 border-b border-border-flow/80 flex items-center justify-between bg-bg-secondary/40">
              <div className="flex items-center space-x-2">
                <Sparkles className="w-4 h-4 text-flow-purple animate-pulse" />
                <span className="text-ui-sm font-semibold text-text-primary">Draft Review & Dispatch</span>
              </div>
              <button
                onClick={onClose}
                className="p-1 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              
              {/* Context Summary Box */}
              <div className="space-y-1.5">
                <span className="block text-[9px] font-bold text-text-muted uppercase tracking-wider">Original Context / Prompt</span>
                <div className="bg-bg-primary/50 border border-border-flow/60 rounded-xl p-3 text-ui-sm text-text-secondary leading-relaxed font-light">
                  {approvalItem.recipe === 'INCIDENT_ALERT' 
                    ? "Dispatch notification alert warning active developers regarding Postgres users table transaction deadlocks." 
                    : approvalItem.recipe === 'EMERGENCY_HUDDLE'
                    ? "Schedule alignment session regarding sectors drop below 70 health score."
                    : `Draft responsive contextual email addressing client ticket details.`}
                </div>
              </div>

              {/* Rationale & Analytics Box */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-bg-secondary/35 border border-border-flow rounded-xl p-3">
                  <span className="block text-[9px] font-bold text-text-muted uppercase tracking-wider flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-flow-purple" />
                    Confidence
                  </span>
                  <span className="block text-ui-md font-bold text-success mt-1">{confidence}</span>
                </div>
                <div className="bg-bg-secondary/35 border border-border-flow rounded-xl p-3">
                  <span className="block text-[9px] font-bold text-text-muted uppercase tracking-wider flex items-center gap-1">
                    <Clock className="w-3 h-3 text-text-muted" />
                    Read Time
                  </span>
                  <span className="block text-ui-md font-bold text-text-primary mt-1">{readingTime}</span>
                </div>
              </div>

              {/* AI generated text editor input */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="block text-[9px] font-bold text-text-muted uppercase tracking-wider">AI Generated Draft</span>
                  <button
                    onClick={handleCopy}
                    className="inline-flex items-center text-[10px] text-flow-purple font-semibold hover:text-white transition-colors cursor-pointer select-none"
                  >
                    <Copy className="w-3 h-3 mr-1" />
                    Copy Draft
                  </button>
                </div>
                <textarea
                  value={draftText}
                  onChange={(e) => setDraftText(e.target.value)}
                  rows={8}
                  className="w-full bg-bg-primary border border-border-flow focus:border-flow-purple/60 rounded-xl p-3.5 text-ui-sm text-text-primary font-mono leading-relaxed focus:outline-none focus:ring-1 focus:ring-flow-purple/35 resize-none"
                />
              </div>

              {/* References citations list */}
              <div className="space-y-2">
                <span className="block text-[9px] font-bold text-text-muted uppercase tracking-wider flex items-center gap-1 select-none">
                  <BookOpen className="w-3.5 h-3.5 text-text-muted" />
                  Referenced Context Sources
                </span>
                <div className="space-y-2">
                  <div className="p-3 bg-bg-secondary border border-border-flow rounded-xl flex items-center justify-between text-ui-xs">
                    <div className="flex flex-col min-w-0">
                      <span className="font-semibold text-text-primary truncate">Obsidian vault: workspace-corp-alpha</span>
                      <span className="text-text-muted text-[10px]">Weighted RAG Context Coefficient: 1.5</span>
                    </div>
                    <span className="text-[10px] text-success font-semibold">VERIFIED</span>
                  </div>
                </div>
              </div>

            </div>

            {/* Footer buttons row */}
            <div className="px-6 py-4 border-t border-border-flow/80 bg-bg-secondary/40 flex items-center justify-between">
              <Button
                variant="danger"
                size="sm"
                onClick={localReject}
                className="text-ui-xs"
              >
                Reject Draft
              </Button>

              <div className="flex items-center space-x-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={onClose}
                  className="text-ui-xs"
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={localApprove}
                  className="text-ui-xs"
                >
                  <Check className="w-3.5 h-3.5 mr-1" />
                  Approve & Dispatch
                </Button>
              </div>
            </div>

          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default DraftReviewSheet;
