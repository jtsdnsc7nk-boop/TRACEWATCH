import { cliLaunchAvailable, launchCliTerminal } from "@/lib/server/terminal";
import { fail, ok, rateLimit, tooManyRequests } from "@/lib/server/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const LOOPBACK_HOST = /^(127\.0\.0\.1|localhost|\[::1\])(:\d{1,5})?$/;

export async function GET() {
  const availability = cliLaunchAvailable();
  return ok(availability.ok ? { available: true } : { available: false, reason: availability.reason });
}

export async function POST(request: Request) {
  const limit = rateLimit(request, "cli-launch", 5);
  if (!limit.allowed) return tooManyRequests(limit.retryAfter);

  // A custom header forces a CORS preflight, which this server never approves, so other websites
  // cannot trigger this from your browser. Origin and Host must both be this machine.
  const host = request.headers.get("host") ?? "";
  const origin = request.headers.get("origin");
  if (request.headers.get("x-tracewatch-action") !== "launch-cli") return fail(400, "Missing launch header.");
  if (!LOOPBACK_HOST.test(host)) return fail(403, "The CLI can only be opened from the computer TraceWatch runs on.");
  if (!origin || new URL(origin).host !== host) return fail(403, "Cross-origin requests are not allowed.");

  const result = await launchCliTerminal(`http://${host}`);
  return ok(result);
}
