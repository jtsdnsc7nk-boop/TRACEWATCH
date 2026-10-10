import type { PasswordRangeResult } from "@/lib/types";
import {
  fail,
  fetchWithTimeout,
  handleRouteError,
  ok,
  rateLimit,
  readJsonBody,
  tooManyRequests,
  UpstreamError,
  USER_AGENT,
} from "@/lib/server/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// k-anonymity: the browser sends only the first 5 hex characters of the SHA-1 hash.
// The password and the full hash never leave the user's device.
export async function POST(request: Request) {
  const limit = rateLimit(request, "password", 30);
  if (!limit.allowed) return tooManyRequests(limit.retryAfter);

  const body = await readJsonBody(request);
  const prefix = typeof body?.prefix === "string" ? body.prefix.toUpperCase() : "";
  if (!/^[0-9A-F]{5}$/.test(prefix)) {
    return fail(400, "Expected a 5-character hexadecimal hash prefix.");
  }

  try {
    const response = await fetchWithTimeout(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { "Add-Padding": "true", "User-Agent": USER_AGENT },
    });
    if (!response.ok) throw new UpstreamError(`Pwned Passwords returned HTTP ${response.status}.`);
    const result: PasswordRangeResult = { prefix, range: await response.text() };
    return ok(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
