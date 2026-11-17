/**
 * The login wall is on only when Clerk's keys are present (Vercel). Local runs and CI
 * without keys build and run with the wall off, and say so once.
 */
export const CLERK_PUBLISHABLE_KEY = (process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "").trim();
export const AUTH_ENABLED = CLERK_PUBLISHABLE_KEY.length > 0;

let warned = false;
export function warnIfAuthOff(): void {
  if (AUTH_ENABLED || warned) return;
  warned = true;
  console.warn("[atlas] Clerk keys are not set, so the login wall is off. Set NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY to turn it on.");
}
