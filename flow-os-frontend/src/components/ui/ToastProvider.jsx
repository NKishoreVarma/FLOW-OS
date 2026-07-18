/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";

const ToastContext = createContext({
  showToast: () => {},
});

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  const showToast = useCallback((message, type = "info") => {
    const id = String(Math.random());
    setToasts((prev) => [...prev, { id, message, type }]);
    
    // Auto remove after 3.5 seconds
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  }, []);

  const removeToast = (id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const icons = {
    success: <CheckCircle2 className="w-4 h-4 text-success" />,
    error: <AlertCircle className="w-4 h-4 text-critical" />,
    warning: <AlertCircle className="w-4 h-4 text-warning" />,
    info: <Info className="w-4 h-4 text-info" />,
  };

  const borders = {
    success: "border-success/20 bg-success/5",
    error: "border-critical/20 bg-critical/5",
    warning: "border-warning/20 bg-warning/5",
    info: "border-info/20 bg-info/5",
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}

      {/* Glass Toasts List Container */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col space-y-3 pointer-events-none select-none max-w-sm w-full">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 20, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className={`pointer-events-auto flex items-center justify-between p-4 rounded-xl border backdrop-blur-md shadow-lg ${borders[t.type] || borders.info}`}
            >
              <div className="flex items-center space-x-3 text-ui-sm font-medium text-text-primary">
                {icons[t.type] || icons.info}
                <span>{t.message}</span>
              </div>
              <button
                onClick={() => removeToast(t.id)}
                className="p-1 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors ml-4 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => useContext(ToastContext);
export default ToastProvider;
