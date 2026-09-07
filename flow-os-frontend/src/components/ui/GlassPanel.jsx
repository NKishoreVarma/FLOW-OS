export const GlassPanel = ({ children, className = "", as: Component = "div", ...props }) => {
  return (
    <Component
      className={`backdrop-blur-md bg-bg-secondary/45 border border-white/5 shadow-xl transition-apple ${className}`}
      {...props}
    >
      {children}
    </Component>
  );
};

export default GlassPanel;
