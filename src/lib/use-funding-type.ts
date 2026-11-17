"use client";

import { parseAsString, useQueryState } from "nuqs";
import { useCallback } from "react";

/** Which funding type is open in its modal, kept in the URL as ?fundingType=<bucket> so it can be shared. */
export function useFundingType() {
  const [fundingType, set] = useQueryState("fundingType", parseAsString.withOptions({ history: "replace", clearOnDefault: true }));
  const openFundingType = useCallback((t: string | null) => void set(t), [set]);
  return { fundingType, openFundingType };
}
