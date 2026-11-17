"use client";

import { useEffect, useState } from "react";

/**
 * Resolves CSS custom properties from the document root, re-reading when the
 * theme class changes. Returns an empty object before mount, so callers fall
 * back to a safe default on the server.
 */
export function useCssVars(names: readonly string[]): Record<string, string> {
  const [vars, setVars] = useState<Record<string, string>>({});
  const key = names.join("|");
  useEffect(() => {
    const read = () => {
      const cs = getComputedStyle(document.documentElement);
      const out: Record<string, string> = {};
      for (const n of key.split("|")) out[n] = cs.getPropertyValue(n).trim();
      setVars(out);
    };
    read();
    const mo = new MutationObserver(read);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style"] });
    return () => mo.disconnect();
  }, [key]);
  return vars;
}
