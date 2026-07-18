export const LoadingSpinner = ({ size = "md", className = "" }) => {
  const sizeClasses = {
    xs: "w-3 h-3 border",
    sm: "w-4 h-4 border-2",
    md: "w-5 h-5 border-2",
    lg: "w-6 h-6 border-2",
  };

  const selectedSize = sizeClasses[size] || sizeClasses.md;

  return (
    <div
      className={`rounded-full border-white/20 border-t-white animate-spin ${selectedSize} ${className}`}
      style={{ borderStyle: "solid" }}
    />
  );
};

export default LoadingSpinner;
