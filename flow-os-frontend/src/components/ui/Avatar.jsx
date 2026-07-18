import { useState } from "react";

export const Avatar = ({ src, name = "User", size = "md", className = "" }) => {
  const [imageError, setImageError] = useState(false);

  const getInitials = (fullName) => {
    const parts = String(fullName).trim().split(/\s+/);
    if (parts.length === 0 || !parts[0]) return "U";
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  };

  const sizeClasses = {
    sm: "w-6 h-6 text-ui-xs",
    md: "w-8 h-8 text-ui-sm",
    lg: "w-12 h-12 text-ui-lg",
  };

  const selectedSize = sizeClasses[size] || sizeClasses.md;
  const initials = getInitials(name);

  return (
    <div
      className={`rounded-full overflow-hidden flex items-center justify-center font-bold select-none border border-border-flow bg-flow-purple/20 text-flow-purple flex-shrink-0 ${selectedSize} ${className}`}
    >
      {src && !imageError ? (
        <img
          src={src}
          alt={name}
          onError={() => setImageError(true)}
          className="w-full h-full object-cover"
        />
      ) : (
        <span>{initials}</span>
      )}
    </div>
  );
};

export default Avatar;
