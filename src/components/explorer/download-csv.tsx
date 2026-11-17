"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { meta } from "@/lib/data";
import { tierLabel } from "@/lib/tier";
import type { Project } from "@/lib/types";

const COLUMNS: Array<[string, (p: Project) => string | number | null]> = [
  ["Project/Company Name", (p) => p.name],
  ["Website", (p) => p.website],
  ["Sector/Category", (p) => p.sector],
  ["Subcategory", (p) => p.subcategory],
  ["Native Chain", (p) => p.chain],
  ["Native Chain Detail", (p) => p.chainDetail],
  ["Native Chain Confidence", (p) => p.chainConfidence],
  ["Traction Tier", (p) => tierLabel(p.tier)],
  ["TVL on Base (USD)", (p) => p.tvl],
  ["30d DEX Volume (USD)", (p) => p.volume],
  ["30d Fees (USD)", (p) => p.fees],
  ["30d Revenue (USD)", (p) => p.revenue],
  ["Revenue Capture", (p) => (p.revenueCapture === null ? null : Math.round(p.revenueCapture * 1000) / 1000)],
  ["Other Traction Signal", (p) => p.otherTraction],
  ["Traction Source", (p) => p.tractionSources.join(" ; ")],
  ["Funding Type", (p) => p.fundingType],
  ["Investors / Backers", (p) => p.investors],
  ["Amount Raised", (p) => p.amountRaised],
  ["Token", (p) => p.tokenRaw],
  ["Funding Source URL", (p) => p.fundingSourceUrl],
  ["Audits", (p) => p.audits],
  ["Incidents", (p) => p.incidents],
  ["Red Flags", (p) => p.redFlags],
  ["Security Source URL", (p) => p.securitySourceUrl],
  ["Description", (p) => p.description],
  ["Status", (p) => p.status],
  ["X Handle", (p) => p.xHandle],
  ["Discovered Via", (p) => p.discoveredVia],
  ["Source URL", (p) => p.sourceUrl],
];

function esc(v: string | number | null): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: Project[]): string {
  const head = COLUMNS.map(([h]) => esc(h)).join(",");
  const body = rows.map((p) => COLUMNS.map(([, f]) => esc(f(p))).join(","));
  return [head, ...body].join("\r\n");
}

export function DownloadCsv({ rows }: { rows: Project[] }) {
  const download = () => {
    const blob = new Blob(["﻿" + toCsv(rows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `robinhood-chain-atlas-${meta.asOf}-${rows.length}-projects.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };
  return (
    <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={download} disabled={rows.length === 0}>
      <Download className="size-3.5" /> Download filtered CSV ({rows.length})
    </Button>
  );
}
