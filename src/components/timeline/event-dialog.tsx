"use client";

import { useAccess } from "@/lib/access";
import { useGatedData } from "@/lib/use-gated";
import { ExternalLink } from "lucide-react";
import type { ReactNode } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EVENT_COLOR } from "@/lib/colors";
import { events } from "@/lib/data";
import { useFilters } from "@/lib/filters";
import { displayUrl, fmtDate, fmtUsdFull } from "@/lib/format";
import { isDirectSource, NO_DIRECT_SOURCE } from "@/lib/sources";
import { useEventDialog } from "@/lib/use-event";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_1fr] gap-x-3 text-sm">
      <dt className="text-ink-300">{label}</dt>
      <dd className="min-w-0 break-words text-ink-50">{children}</dd>
    </div>
  );
}

/**
 * Everything recorded about one timeline event: the amount, what it measures, the
 * detail and the source. Opened from a table row or a chart marker and kept in the
 * URL (?event=). A source link is offered only when it is direct (src/lib/sources.ts).
 */
export function EventDialog() {
  const { eventId, openEvent } = useEventDialog();
  const { openProject } = useFilters();
  const { ready } = useGatedData();
  const { openLogin } = useAccess();
  const ev = eventId ? events.find((e) => e.id === eventId) : undefined;
  return (
    <Dialog open={Boolean(ev)} onOpenChange={(o) => !o && openEvent(null)}>
      <DialogContent data-testid="event-dialog" className="sm:max-w-lg">
        {ev && (
          <>
            <DialogHeader className="gap-1 pr-8">
              <DialogDescription className="type-label inline-flex items-center gap-1.5 text-ink-300">
                <span aria-hidden="true" className="size-2 rounded-full" style={{ backgroundColor: EVENT_COLOR[ev.type] }} />
                {ev.type}, {fmtDate(ev.date)}
              </DialogDescription>
              <DialogTitle className="type-title text-ink-50">{ev.title}</DialogTitle>
            </DialogHeader>
            <dl className="space-y-2">
              <Row label="Projects">
                {ev.projects.length === 0 ? (
                  <span className="text-ink-300">none</span>
                ) : (
                  ev.projects.map((name, i) => {
                    const id = ev.projectIds[i];
                    return (
                      <span key={name}>
                        {i > 0 && ", "}
                        {id ? (
                          <button
                            type="button"
                            className="underline decoration-ink-500 underline-offset-2 hover:decoration-ink-50"
                            onClick={() => {
                              openEvent(null);
                              openProject(id);
                            }}
                          >
                            {name}
                          </button>
                        ) : (
                          name
                        )}
                      </span>
                    );
                  })
                )}
              </Row>
              <Row label="Amount">{ev.amount === null ? <span className="text-ink-300">undisclosed</span> : <span className="tabular">{fmtUsdFull(ev.amount)}</span>}</Row>
              {ev.amountNote && <Row label="Amount note">{ev.amountNote}</Row>}
              {ev.detail ? (
                <Row label="Detail">{ev.detail}</Row>
              ) : (
                // A Funding event's detail names investors, so it loads with the gated data.
                ev.type === "Funding" &&
                !ready && (
                  <Row label="Detail">
                    <button type="button" onClick={() => openLogin("event")} className="text-left text-ink-300 underline underline-offset-2 hover:text-ink-50" data-testid="event-detail-login">
                      Log in for free access to see who invested
                    </button>
                  </Row>
                )
              )}
              <Row label="Source">
                {ev.type === "Funding" && !ev.sourceUrl && !ready ? (
                  // A Funding event's source link can name investors in its URL, so it loads with the gated data.
                  <button type="button" onClick={() => openLogin("event")} className="text-left text-ink-300 underline underline-offset-2 hover:text-ink-50" data-testid="event-source-login">
                    Log in for free access to see the source
                  </button>
                ) : isDirectSource(ev.sourceUrl) ? (
                  <a href={ev.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-center gap-1 text-ink-50 underline decoration-ink-500 underline-offset-2 hover:decoration-ink-50">
                    <span className="break-all">{displayUrl(ev.sourceUrl)}</span>
                    <ExternalLink className="size-3 shrink-0 text-ink-300" />
                  </a>
                ) : (
                  <span className="text-ink-300">{NO_DIRECT_SOURCE}</span>
                )}
              </Row>
            </dl>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
