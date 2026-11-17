"use client";

import { useEffect } from "react";
import { useAccess } from "@/lib/access";
import { loadGated } from "@/lib/data";

/**
 * Fetches the gated set once the reader is signed in, or straight away with the wall
 * off (no Clerk keys). Logged out it fetches nothing, so no gated response exists.
 * Signed in, a 401 is retried briefly: after an in-page login the session cookie can
 * reach the server a moment after the browser reports the session.
 */
export function GatedDataLoader() {
  const { enabled, loaded, signedIn } = useAccess();
  useEffect(() => {
    if (!enabled) void loadGated();
    else if (loaded && signedIn) void loadGated({ signedIn: true });
  }, [enabled, loaded, signedIn]);
  return null;
}
