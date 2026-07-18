import { Zap } from "lucide-react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";

export const ComingSoon = ({ pageName = "Module" }) => {
  const navigate = useNavigate();

  return (
    <div style={{
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      minHeight: "60vh", padding: "48px 24px", textAlign: "center",
    }}>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
        style={{ display: "flex", flexDirection: "column", alignItems: "center" }}
      >
        {/* Icon */}
        <div style={{
          width: 44, height: 44, borderRadius: 8,
          background: "var(--brand-dim)",
          border: "1px solid var(--brand-line)",
          display: "flex", alignItems: "center", justifyContent: "center",
          marginBottom: 20,
        }}>
          <Zap style={{ width: 18, height: 18, color: "var(--brand)" }} />
        </div>

        {/* Title */}
        <h2 style={{
          fontSize: 20, fontWeight: 500,
          color: "var(--t1)", letterSpacing: "-0.4px",
          marginBottom: 8, lineHeight: 1.2,
        }}>
          {pageName}
        </h2>

        {/* Description */}
        <p style={{
          fontSize: 13, color: "var(--t3)",
          maxWidth: 320, lineHeight: 1.6,
          marginBottom: 24,
        }}>
          This module is scheduled for the next sprint. Everything routes through the core intelligence layer first.
        </p>

        {/* Tag */}
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{
            fontSize:      10,
            fontWeight:    600,
            color:        "var(--t5)",
            background:   "rgba(31,27,22,0.05)",
            border:       "1px solid var(--border)",
            borderRadius:  3,
            padding:      "3px 8px",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}>
            Coming soon
          </span>
          <button
            onClick={() => navigate("/")}
            style={{
              fontSize:      10,
              fontWeight:    500,
              color:        "var(--t4)",
              background:   "transparent",
              border:       "none",
              cursor:       "pointer",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              transition:   "color 100ms",
            }}
            onMouseEnter={e => e.currentTarget.style.color = "var(--t2)"}
            onMouseLeave={e => e.currentTarget.style.color = "var(--t4)"}
          >
            ← Return home
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default ComingSoon;
