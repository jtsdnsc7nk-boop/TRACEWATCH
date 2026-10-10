import { analyseDiscord, isSnowflake } from "@/lib/server/discord";
import { fail, handleRouteError, ok, rateLimit, readJsonBody, tooManyRequests } from "@/lib/server/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const limit = rateLimit(request, "discord", 20);
  if (!limit.allowed) return tooManyRequests(limit.retryAfter);

  const body = await readJsonBody(request);
  const id = typeof body?.id === "string" ? body.id.trim() : "";
  if (!isSnowflake(id)) {
    return fail(400, "Enter a numeric Discord user ID (17 to 20 digits).");
  }

  try {
    return ok(await analyseDiscord(id));
  } catch (error) {
    return handleRouteError(error);
  }
}
