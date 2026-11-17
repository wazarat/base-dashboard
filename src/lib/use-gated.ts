"use client";

import { useSyncExternalStore } from "react";
import { gatedStatus, gatedVersion, subscribeGated, type GatedStatus } from "./data";

/** Re-renders when gated data arrives; put `version` in the memo dependencies of anything that reads gated fields. */
export function useGatedData(): { status: GatedStatus; ready: boolean; version: number } {
  const version = useSyncExternalStore(subscribeGated, gatedVersion, () => 0);
  const status = gatedStatus();
  return { status, ready: status === "ready", version };
}
