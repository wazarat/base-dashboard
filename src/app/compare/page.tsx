import type { Metadata } from "next";
import { pageMeta } from "@/lib/site";
import { CompareView } from "@/components/compare/compare-view";

export const metadata: Metadata = pageMeta("Compare", "/compare/");

export default function ComparePage() {
  return <CompareView />;
}
