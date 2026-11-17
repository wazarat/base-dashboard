import Link from "next/link";
import { displayUrl } from "@/lib/format";
import { NOT_AFFILIATED } from "@/lib/chain";
import { SIBLING_ATLAS_URLS } from "@/lib/site";
import { Container } from "./container";
import { DataNote } from "./data-note";

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-ink-700/60 bg-ink-950">
      <Container className="grid gap-8 py-12 text-sm text-ink-300 md:grid-cols-[1fr_auto]">
        <div className="max-w-2xl space-y-3">
          <DataNote />
          <p>Sources are DefiLlama, Morpho, GeckoTerminal, Blockscout and growthepie, all on their free tiers.</p>
          <p className="text-xs">{NOT_AFFILIATED}. Not endorsed or sponsored by Coinbase, Inc.</p>
          <p className="text-xs">Research preview, not financial advice.</p>
        </div>
        <ul className="type-label flex flex-wrap gap-x-5 gap-y-2 md:flex-col md:items-end md:text-right">
          <li>
            <Link href="/methodology/" className="text-ink-300 underline-offset-2 hover:text-ink-50 hover:underline">
              Methodology
            </Link>
          </li>
          {SIBLING_ATLAS_URLS.map((url) => (
            <li key={url}>
              <a href={url} className="text-ink-300 underline-offset-2 hover:text-ink-50 hover:underline">
                {displayUrl(url)}
              </a>
            </li>
          ))}
          <li>
            <a href="https://canhav.com" target="_blank" rel="noopener noreferrer" className="text-ink-300 underline-offset-2 hover:text-ink-50 hover:underline">
              canhav.com
            </a>
          </li>
        </ul>
      </Container>
    </footer>
  );
}
