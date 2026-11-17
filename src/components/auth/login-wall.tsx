"use client";

import { Lock } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useAccess } from "@/lib/access";
import { isGatedPath } from "@/lib/gate";
import { useGatedData } from "@/lib/use-gated";
import { LOGIN_TITLE } from "./login-dialog";
import { PagePlaceholder } from "./page-placeholder";

/**
 * A gated page. Logged out, it shows placeholder shapes (never the real page) with the
 * login pop-up over them, and keeps the URL so the page loads as soon as the reader logs
 * in. Signed in (or with the wall off), it shows the same shapes until the gated data has
 * arrived from /api/data/gated, then mounts the page.
 */
export function LoginWall({ pathname, children }: { pathname: string; children: React.ReactNode }) {
  const { enabled, loaded, signedIn, openLogin, loginOpen } = useAccess();
  const { ready, status } = useGatedData();
  const gated = isGatedPath(pathname);
  const walled = enabled && gated && !signedIn;
  const askLogin = walled && loaded;

  useEffect(() => {
    if (askLogin) openLogin("tab");
  }, [askLogin, pathname, openLogin]);

  if (!gated || (ready && !walled)) return <>{children}</>;
  return (
    <div className="relative" data-testid={walled ? "login-wall" : "gated-loading"}>
      <PagePlaceholder label={walled ? LOGIN_TITLE : "Loading"} />
      {askLogin && !loginOpen && (
        <div className="absolute inset-x-0 top-24 flex justify-center">
          <Button onClick={() => openLogin("tab")} className="gap-1.5 shadow-popover">
            <Lock className="size-3.5" /> {LOGIN_TITLE}
          </Button>
        </div>
      )}
      {!walled && status === "error" && <p className="mt-4 text-center text-sm text-ink-300">The data did not load. Reload the page to try again.</p>}
    </div>
  );
}
