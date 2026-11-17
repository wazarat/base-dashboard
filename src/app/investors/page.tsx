import type { Metadata } from "next";
import { pageMeta } from "@/lib/site";
import { InvestorsView } from "@/components/investors/investors-view";

export const metadata: Metadata = pageMeta("Investors", "/investors/");

export default function InvestorsPage() {
  return <InvestorsView />;
}
