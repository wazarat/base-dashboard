import "server-only";
import { auth } from "@clerk/nextjs/server";
import gated from "@/data/gated/gated.json";
import { gatedResponse, serverAuthEnabled } from "@/lib/gated-response";

/** Everything a logged-out visitor may not download, for signed-in readers only. */
export const dynamic = "force-dynamic";

export async function GET() {
  const enabled = serverAuthEnabled();
  const userId = enabled ? (await auth()).userId : null;
  return gatedResponse(userId, enabled, gated);
}
