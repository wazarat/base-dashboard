/**
 * Who sees what (owner prompt, login wall phase 1, 2026-11-09). Pure, so the
 * table is tested. With the wall off (no Clerk keys) everything is allowed.
 *
 * | Area                                   | Logged out                           | Logged in |
 * | Overview, Methodology, footer pages    | Full                                 | Full      |
 * | Sectors, Traction, Funding, Explorer,  | Login pop-up over a blurred preview  | Full      |
 * |   and hidden Security, Stocks, Investors|                                     |           |
 * | Compare                                | Full view of a comparison in the URL | Full      |
 * | Add to compare (anywhere)              | Opens the login pop-up               | Works     |
 * | Project pop-up                         | Header, Overview and Traction        | Full      |
 * | Submit a project, Suggest a correction | Open                                 | Open      |
 */
import { NAV_ALL } from "./nav";

export const PUBLIC_PATHS = ["/", "/methodology/", "/compare/"] as const;
export const GATED_PATHS = ["/sectors/", "/traction/", "/funding/", "/explorer/", "/security/", "/investors/"] as const;

export type GatedAction = "compare-add" | "project-detail";

function normalize(path: string): string {
  const p = path.split(/[?#]/)[0] || "/";
  return p.endsWith("/") ? p : `${p}/`;
}

/** A page that shows the login pop-up over a blurred preview when logged out. */
export function isGatedPath(path: string): boolean {
  return (GATED_PATHS as readonly string[]).includes(normalize(path));
}

/** Can a reader do this? `signedIn` is ignored when the wall is off. */
export function allowed(target: { path: string } | { action: GatedAction }, signedIn: boolean, enabled: boolean): boolean {
  if (!enabled || signedIn) return true;
  if ("path" in target) return !isGatedPath(target.path);
  return false;
}

/** Project modal sections a logged-out reader sees; the rest sits behind one login panel. */
export const PUBLIC_PROJECT_SECTIONS = ["header", "overview", "traction"] as const;

/** Every tab in the nav list is either public or gated, so a new tab cannot slip through unclassified. */
export function unclassifiedTabs(): string[] {
  return NAV_ALL.map((n) => n.href).filter((h) => !(PUBLIC_PATHS as readonly string[]).includes(h) && !(GATED_PATHS as readonly string[]).includes(h));
}

/** Projects a logged-out reader may hold in compare: one, so a comparison needs a login. */
export const PUBLIC_COMPARE_MAX = 1;

/** An action saved before the login pop-up, replayed once the reader is signed in. */
export type PendingAction = { type: "compare-add"; id: string };
export const PENDING_KEY = "atlas:pending-action";

export function encodePending(a: PendingAction): string {
  return JSON.stringify(a);
}

export function decodePending(raw: string | null): PendingAction | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<PendingAction>;
    return v && v.type === "compare-add" && typeof v.id === "string" ? { type: "compare-add", id: v.id } : null;
  } catch {
    return null;
  }
}

/**
 * What a change to the compare selection does: write it, or (an addition while logged out)
 * save the addition and ask for login instead. Removing never needs a login.
 */
export function compareChange(current: string[], next: string[], canAdd: boolean): { write: string[] } | { login: PendingAction } {
  const added = next.find((id) => !current.includes(id));
  // Logged out, a reader may pick one project; a second one (an actual comparison) asks for login.
  if (added && !canAdd && next.length > PUBLIC_COMPARE_MAX) return { login: { type: "compare-add", id: added } };
  return { write: next };
}

/** After login: the project id to add to compare, if a saved action asks for one not already there. */
export function replayPending(raw: string | null, alreadyIn: (id: string) => boolean): string | null {
  const p = decodePending(raw);
  return p?.type === "compare-add" && !alreadyIn(p.id) ? p.id : null;
}
