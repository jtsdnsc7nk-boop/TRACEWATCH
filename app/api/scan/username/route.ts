import { isValidUsername, searchUsername } from "@/lib/server/usernames";
import { fail, ok, rateLimit, readJsonBody, tooManyRequests } from "@/lib/server/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: Request) {
  // Each search fans out to dozens of sites, so keep the per-client budget small.
  const limit = rateLimit(request, "username", 6);
  if (!limit.allowed) return tooManyRequests(limit.retryAfter);

  const body = await readJsonBody(request);
  const username = typeof body?.username === "string" ? body.username.trim().replace(/^@/, "") : "";
  if (!isValidUsername(username)) {
    return fail(400, "Enter a username of 2 to 40 letters, digits, dots, underscores or hyphens.");
  }
  return ok(await searchUsername(username));
}
