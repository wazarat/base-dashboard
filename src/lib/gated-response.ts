/**
 * The one rule for gated data (owner prompt, login wall phase 2): with the wall on,
 * no session means 401 and no data; a session gets the data with Cache-Control
 * private, so no shared cache keeps a copy. With the wall off (no Clerk keys, local
 * and CI) everyone gets it, as phase 1 behaves. Pure, so it is unit-tested.
 */
export const GATED_HEADERS = { "Cache-Control": "private, no-store", Vary: "Cookie" } as const;

export function gatedResponse(userId: string | null | undefined, authEnabled: boolean, body: unknown): Response {
  if (authEnabled && !userId) {
    return Response.json({ error: "login required" }, { status: 401, headers: GATED_HEADERS });
  }
  return Response.json(body, { status: 200, headers: GATED_HEADERS });
}

/** Server side the wall is on only when both Clerk keys are present (the proxy follows the same rule). */
export function serverAuthEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && env.CLERK_SECRET_KEY);
}
