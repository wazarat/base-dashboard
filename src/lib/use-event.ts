"use client";

import { parseAsString, useQueryState } from "nuqs";
import { useCallback } from "react";

/** Which timeline event is open in the detail popup, kept in the URL as ?event=<id> so it can be shared. */
export function useEventDialog() {
  const [eventId, setEvent] = useQueryState("event", parseAsString.withOptions({ history: "replace", clearOnDefault: true }));
  const openEvent = useCallback((id: string | null) => void setEvent(id), [setEvent]);
  return { eventId, openEvent };
}
