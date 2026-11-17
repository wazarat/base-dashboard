/**
 * A source is direct when a reader who opens it lands on the claim itself: one
 * article, one post, one page about the subject. A profile, a home page or an
 * unparseable link is not a source (docs/ATLAS-UI.md, section 8); the UI then
 * says "No direct source yet" and offers no link.
 */
const SOCIAL_HOSTS = new Set(["x.com", "twitter.com", "mobile.twitter.com"]);

export function isDirectSource(url: string | null | undefined): url is string {
  if (!url) return false;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  const segments = u.pathname.split("/").filter(Boolean);
  // A site root counts only when it points at a named section of the page (a docs home with an anchor).
  if (segments.length === 0) return u.hash.length > 1;
  // On X only a single post counts, never a profile, a search or a list.
  if (SOCIAL_HOSTS.has(host)) return segments.length >= 3 && segments[1] === "status" && /^\d+$/.test(segments[2]);
  return true;
}

export const NO_DIRECT_SOURCE = "No direct source yet";
