import type { EmailScanResult } from "@/lib/types";
import { assessBreaches } from "@/lib/risk";
import { hibpConfigured, lookupAccount } from "@/lib/server/breaches";
import { fail, handleRouteError, ok, rateLimit, readJsonBody, tooManyRequests } from "@/lib/server/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function POST(request: Request) {
  const limit = rateLimit(request, "email", 10);
  if (!limit.allowed) return tooManyRequests(limit.retryAfter);

  const body = await readJsonBody(request);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email || email.length > 254 || !EMAIL_PATTERN.test(email)) {
    return fail(400, "Enter a valid email address.");
  }

  try {
    const lookup = await lookupAccount(email);
    const notices: string[] = [];
    if (!hibpConfigured()) {
      notices.push(
        "Have I Been Pwned account search is off. Set HIBP_API_KEY in .env.local to add it as a fourth breach source with sensitive-breach flags and paste data.",
      );
    }
    const result: EmailScanResult = {
      email,
      breaches: lookup.breaches,
      pasteCount: lookup.pasteCount,
      infostealers: lookup.infostealers,
      exposedFields: lookup.exposedFields,
      sources: lookup.sources,
      risk: assessBreaches(lookup.breaches, lookup.pasteCount, lookup.infostealers.length),
      notices,
    };
    return ok(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
