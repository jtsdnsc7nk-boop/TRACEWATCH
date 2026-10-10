import { analysePhone, isSupportedRegion } from "@/lib/server/phone";
import { fail, ok, rateLimit, readJsonBody, tooManyRequests } from "@/lib/server/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const limit = rateLimit(request, "phone", 30);
  if (!limit.allowed) return tooManyRequests(limit.retryAfter);

  const body = await readJsonBody(request);
  const phone = typeof body?.phone === "string" ? body.phone.trim() : "";
  const regionInput = typeof body?.region === "string" ? body.region.trim().toUpperCase() : "";
  if (!phone || phone.length > 32 || !/^[+\d\s().\-/]+$/.test(phone)) {
    return fail(400, "Enter a phone number using digits, spaces and + ( ) - only.");
  }
  if (regionInput && !isSupportedRegion(regionInput)) {
    return fail(400, "Unknown default region. Use a two-letter country code such as US, GB or PL.");
  }
  if (!phone.startsWith("+") && !regionInput) {
    return fail(400, "Include the country code (for example +48...) or choose a default region.");
  }

  const result = analysePhone(phone, regionInput || null);
  if (!result) return fail(400, "That input could not be parsed as a phone number.");
  return ok(result);
}
