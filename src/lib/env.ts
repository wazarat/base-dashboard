/**
 * Public form links. Both are optional: when unset the buttons do not render.
 * Set NEXT_PUBLIC_TALLY_SUBMIT_URL and NEXT_PUBLIC_TALLY_CORRECT_URL in .env.local and in the Vercel project.
 */
export const clean = (v: string | undefined) => {
  const t = (v ?? "").trim();
  return /^https?:\/\//.test(t) ? t : null;
};

export const TALLY_SUBMIT_URL = clean(process.env.NEXT_PUBLIC_TALLY_SUBMIT_URL);
export const TALLY_CORRECT_URL = clean(process.env.NEXT_PUBLIC_TALLY_CORRECT_URL);

/** Correction form link with the project name and the current page prefilled as Tally hidden fields. */
export function tallyCorrectUrl(base: string | null, project: string, page: string): string | null {
  if (!base) return null;
  const url = new URL(base);
  url.searchParams.set("project", project);
  url.searchParams.set("page", page);
  return url.toString();
}
