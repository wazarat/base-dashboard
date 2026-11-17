"use client";

import { parseAsString, useQueryState } from "nuqs";
import { useCallback } from "react";

/** Which chart card is open full screen, kept in the URL as ?expand=<chartId> so the view can be shared (docs/ATLAS-UI.md, section 6). */
export function useExpand(id: string) {
  const [expand, setExpand] = useQueryState("expand", parseAsString.withOptions({ history: "replace", clearOnDefault: true }));
  const setOpen = useCallback((open: boolean) => void setExpand(open ? id : null), [id, setExpand]);
  return { open: expand === id, setOpen };
}
