import { buildDashboard } from "@/lib/server/dashboard";
import { handleRouteError, ok, rateLimit, tooManyRequests } from "@/lib/server/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const limit = rateLimit(request, "dashboard", 30);
  if (!limit.allowed) return tooManyRequests(limit.retryAfter);
  try {
    return ok(await buildDashboard());
  } catch (error) {
    return handleRouteError(error);
  }
}
