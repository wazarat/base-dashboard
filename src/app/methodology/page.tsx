import type { Metadata } from "next";
import { pageMeta } from "@/lib/site";
import { Methodology } from "@/components/layout/methodology";

export const metadata: Metadata = pageMeta("Methodology", "/methodology/");

export default function MethodologyPage() {
  return <Methodology />;
}
