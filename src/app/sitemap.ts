import type { MetadataRoute } from "next";
import { NAV } from "@/lib/nav";
import { meta } from "@/lib/data";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const paths = [...NAV.map((n) => n.href), "/methodology/"];
  return paths.map((p) => ({ url: `${SITE_URL}${p}`, lastModified: meta.asOf, changeFrequency: "daily" as const, priority: p === "/" ? 1 : 0.7 }));
}
