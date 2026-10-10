import { acknowledgeCurrentRelease } from "@/lib/server/updates";
import { fail, ok, rateLimit, tooManyRequests } from "@/lib/server/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const limit = rateLimit(request, "updates-ack", 10);
  if (!limit.allowed) return tooManyRequests(limit.retryAfter);
  try {
    await acknowledgeCurrentRelease();
    return ok({ acknowledged: true });
  } catch {
    return fail(500, "Could not save that the release notes were seen.");
  }
}
