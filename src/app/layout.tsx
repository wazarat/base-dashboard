import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import { Suspense } from "react";
import "./globals.css";
import { Providers } from "./providers";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { AtlasShell } from "@/components/layout/atlas-shell";
import { PrerenderedShell } from "@/components/layout/prerendered-shell";
import { ClerkProvider } from "@clerk/nextjs";
import { Analytics } from "@vercel/analytics/next";
import { AccessProvider } from "@/lib/access";
import { AUTH_ENABLED, CLERK_PUBLISHABLE_KEY, warnIfAuthOff } from "@/lib/auth-config";
import { clerkAppearance } from "@/lib/clerk-appearance";
import { meta } from "@/lib/data";
import { OG_BASE, SITE, SITE_URL } from "@/lib/site";

const sans = Inter({ subsets: ["latin"], display: "swap", variable: "--font-inter" });
const display = Space_Grotesk({ subsets: ["latin"], display: "swap", variable: "--font-space-grotesk" });
const mono = JetBrains_Mono({ subsets: ["latin"], display: "swap", variable: "--font-jetbrains-mono" });

const description = `Independent research by CanHav Research on ${meta.counts.projects} projects in the Base ecosystem, covering traction, funding and security. Data as of ${meta.asOfLabel}.`;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: SITE.title, template: SITE.template },
  description,
  alternates: { canonical: "/" },
  openGraph: { ...OG_BASE, title: SITE.title, description, url: "/" },
  twitter: { card: "summary_large_image", title: SITE.title, description, images: ["/og.png"] },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#05060a" }, // copy-ok
    { media: "(prefers-color-scheme: light)", color: "#f5f5f7" }, // copy-ok
  ],
};

/**
 * Runs before the first paint. The export holds each page's default view; a link that
 * carries a query string (filters, a range, an open drawer) would show those default
 * numbers for a moment before the live view replaces them, so globals.css keeps the
 * prerendered view out of sight on such links until then.
 */
const MARK_QUERY = `if(location.search.length>1)document.documentElement.setAttribute("data-query","")`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  warnIfAuthOff();
  const page = (
    <Providers>
      <AccessProvider>
        <SiteHeader />
        {/* AtlasShell reads the query string, so the prerendered HTML carries the fallback. See prerendered-shell.tsx. */}
        <Suspense fallback={<PrerenderedShell>{children}</PrerenderedShell>}>
          <AtlasShell>{children}</AtlasShell>
        </Suspense>
        <SiteFooter />
      </AccessProvider>
    </Providers>
  );
  return (
    <html lang="en" suppressHydrationWarning className={`${sans.variable} ${display.variable} ${mono.variable} h-full antialiased`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: MARK_QUERY }} />
      </head>
      <body className="flex min-h-full flex-col bg-ink-950 text-ink-50">
        {AUTH_ENABLED ? (
          <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY} appearance={clerkAppearance} afterSignOutUrl="/">
            {page}
          </ClerkProvider>
        ) : (
          page
        )}
        {/* Vercel Web Analytics: page views plus the custom events in src/lib/track.ts. Cookieless. Only on Vercel
            (VERCEL=1 at build): elsewhere its script path does not exist and the 404 breaks local and CI checks.
            It reads the search params to name the route, so it has its own Suspense boundary for static pages. */}
        {process.env.VERCEL && (
          <Suspense fallback={null}>
            <Analytics />
          </Suspense>
        )}
      </body>
    </html>
  );
}
