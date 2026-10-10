import type { CatalogueSort } from "@/lib/types";
import { queryCatalogue } from "@/lib/server/breaches";
import { handleRouteError, ok, rateLimit, tooManyRequests } from "@/lib/server/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SORTS: CatalogueSort[] = ["added", "date", "size"];

function intParam(value: string | null, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

export async function GET(request: Request) {
  const limit = rateLimit(request, "catalogue", 60);
  if (!limit.allowed) return tooManyRequests(limit.retryAfter);

  const params = new URL(request.url).searchParams;
  const sortParam = params.get("sort") as CatalogueSort | null;
  try {
    return ok(
      await queryCatalogue({
        query: (params.get("q") ?? "").slice(0, 80),
        sort: sortParam && SORTS.includes(sortParam) ? sortParam : "added",
        offset: intParam(params.get("offset"), 0, 0, 100_000),
        limit: intParam(params.get("limit"), 24, 1, 60),
      }),
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
