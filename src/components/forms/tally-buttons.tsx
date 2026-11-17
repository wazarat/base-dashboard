"use client";

import { ExternalLink, MessageSquareWarning, PlusCircle } from "lucide-react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { TALLY_CORRECT_URL, TALLY_SUBMIT_URL, tallyCorrectUrl } from "@/lib/env";
import { trackCorrectionClick, trackSubmitProjectClick } from "@/lib/track";
import { cn } from "@/lib/utils";

/** "Submit a project" link to the Tally form; renders nothing when the env var is missing. */
export function SubmitProjectButton({ variant = "outline", size = "sm", iconOnlyBelowSm, className }: { variant?: "default" | "outline" | "ghost" | "secondary"; size?: "sm" | "icon"; iconOnlyBelowSm?: boolean; className?: string }) {
  const pathname = usePathname();
  if (!TALLY_SUBMIT_URL) return null;
  return (
    <Button asChild variant={variant} size={size} className={cn("h-8 gap-1.5 text-xs", className)}>
      <a href={TALLY_SUBMIT_URL} target="_blank" rel="noopener noreferrer" aria-label="Submit a project" data-testid="submit-project" onClick={() => trackSubmitProjectClick(pathname)}>
        <PlusCircle className="size-3.5" />
        <span className={cn(iconOnlyBelowSm && "hidden sm:inline")}>Submit a project</span>
        <ExternalLink className={cn("size-3 text-ink-300", iconOnlyBelowSm && "hidden sm:inline")} />
      </a>
    </Button>
  );
}

/** "Suggest a correction" for one project, opened from the drawer with the project and page prefilled. */
export function SuggestCorrectionButton({ projectName }: { projectName: string }) {
  const pathname = usePathname();
  if (!TALLY_CORRECT_URL) return null;
  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-7 gap-1 text-xs"
      data-testid="suggest-correction"
      onClick={() => {
        trackCorrectionClick(pathname);
        const href = tallyCorrectUrl(TALLY_CORRECT_URL, projectName, window.location.href);
        if (href) window.open(href, "_blank", "noopener,noreferrer");
      }}
    >
      <MessageSquareWarning className="size-3.5" /> Suggest a correction
    </Button>
  );
}
