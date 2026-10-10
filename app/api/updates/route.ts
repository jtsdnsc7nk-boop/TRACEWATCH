import { getUpdateStatus } from "@/lib/server/updates";
import { ok, rateLimit, tooManyRequests } from "@/lib/server/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const limit = rateLimit(request, "updates", 30);
  if (!limit.allowed) return tooManyRequests(limit.retryAfter);
  return ok(await getUpdateStatus());
}
