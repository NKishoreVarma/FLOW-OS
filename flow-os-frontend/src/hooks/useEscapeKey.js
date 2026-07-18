import { useEffect } from "react";

/**
 * useEscapeKey — call `handler` when Escape is pressed while `active` is true.
 * Used by overlays (modals, slide-over panels) so they're dismissable from the
 * keyboard, not just the mouse — a basic accessibility expectation.
 */
export function useEscapeKey(handler, active = true) {
  useEffect(() => {
    if (!active) return;
    const onKey = (e) => { if (e.key === "Escape") handler?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handler, active]);
}

export default useEscapeKey;
