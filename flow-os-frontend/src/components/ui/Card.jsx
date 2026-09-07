import { useState } from "react";

export const Card = ({ children, className = "", hoverable = false, ...props }) => {
  const [h, setH] = useState(false);
  return (
    <div
      onMouseEnter={() => hoverable && setH(true)}
      onMouseLeave={() => hoverable && setH(false)}
      style={{
        background:   h ? "var(--bg-hover)" : "var(--bg-card)",
        border:       `1px solid ${h ? "var(--border-strong)" : "var(--border)"}`,
        borderRadius:  4,
        padding:       "16px",
        transition:   "background 120ms, border-color 120ms",
      }}
      className={className}
      {...props}
    >
      {children}
    </div>
  );
};

export const CardHeader = ({ children, className = "", ...props }) => (
  <div style={{ paddingBottom: 12, borderBottom: "1px solid var(--border)", marginBottom: 12 }} className={className} {...props}>
    {children}
  </div>
);

export const CardTitle = ({ children, className = "", ...props }) => (
  <h3 style={{ fontSize: 14, fontWeight: 500, color: "var(--t1)", letterSpacing: "-0.2px", lineHeight: 1.3 }} className={className} {...props}>
    {children}
  </h3>
);

export const CardDescription = ({ children, className = "", ...props }) => (
  <p style={{ fontSize: 13, color: "var(--t3)", lineHeight: 1.55, marginTop: 3 }} className={className} {...props}>
    {children}
  </p>
);

export const CardContent = ({ children, className = "", ...props }) => (
  <div style={{ fontSize: 13, color: "var(--t2)", lineHeight: 1.6 }} className={className} {...props}>
    {children}
  </div>
);

export const CardFooter = ({ children, className = "", ...props }) => (
  <div style={{ display: "flex", alignItems: "center", paddingTop: 12, borderTop: "1px solid var(--border)", marginTop: 12, gap: 8 }} className={className} {...props}>
    {children}
  </div>
);

Card.Header  = CardHeader;
Card.Title   = CardTitle;
Card.Description = CardDescription;
Card.Content = CardContent;
Card.Footer  = CardFooter;

export default Card;
