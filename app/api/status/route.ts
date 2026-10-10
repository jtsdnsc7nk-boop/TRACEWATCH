import { checkSources } from "@/lib/server/dashboard";
import { ok, rateLimit, tooManyRequests } from "@/lib/server/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const limit = rateLimit(request, "status", 30);
  if (!limit.allowed) return tooManyRequests(limit.retryAfter);
  return ok(await checkSources());
}
