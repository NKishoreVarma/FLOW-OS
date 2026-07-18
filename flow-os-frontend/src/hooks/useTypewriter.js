import { useState, useEffect, useRef } from "react";

/**
 * Reveals `fullText` character by character at `speed` ms/char.
 * Returns { displayed, done }.
 * Restarts whenever `fullText` changes.
 */
export function useTypewriter(fullText = "", { speed = 14, enabled = true } = {}) {
  const [displayed, setDisplayed] = useState(enabled ? "" : fullText);
  const intervalRef = useRef(null);

  useEffect(() => {
    if (!enabled || !fullText) {
      setDisplayed(fullText);
      return;
    }

    setDisplayed("");
    let i = 0;

    intervalRef.current = setInterval(() => {
      i += 1;
      setDisplayed(fullText.slice(0, i));
      if (i >= fullText.length) clearInterval(intervalRef.current);
    }, speed);

    return () => clearInterval(intervalRef.current);
  }, [fullText, speed, enabled]);

  return { displayed, done: displayed.length >= fullText.length };
}
