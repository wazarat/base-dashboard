"use client";

import { useCallback, useSyncExternalStore } from "react";

/** True while the media query matches; false on the server and during hydration. */
export function useMedia(query: string): boolean {
  const subscribe = useCallback(
    (on: () => void) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", on);
      return () => mq.removeEventListener("change", on);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}
