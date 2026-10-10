import { NextResponse } from "next/server";
import type { ApiError } from "@/lib/types";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, private",
  Pragma: "no-cache",
  "X-Content-Type-Options": "nosniff",
};

export const USER_AGENT = "TraceWatch/1.0 (self-hosted exposure checker)";

export function ok<T>(body: T, extraHeaders: Record<string, string> = {}): NextResponse<T> {
  return NextResponse.json(body, { status: 200, headers: { ...NO_STORE_HEADERS, ...extraHeaders } });
}

export function fail(status: number, message: string, extraHeaders: Record<string, string> = {}): NextResponse<ApiError> {
  return NextResponse.json({ error: message }, { status, headers: { ...NO_STORE_HEADERS, ...extraHeaders } });
}

export class UpstreamError extends Error {
  constructor(
    message: string,
    public readonly status: number = 502,
  ) {
    super(message);
    this.name = "UpstreamError";
  }
}

export async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = 10_000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal, cache: "no-store" });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new UpstreamError("The upstream intelligence source timed out.", 504);
    }
    throw new UpstreamError("The upstream intelligence source could not be reached.", 502);
  } finally {
    clearTimeout(timer);
  }
}

export async function readJsonBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const text = await request.text();
    if (text.length > 4096) return null;
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "local";
}

interface Bucket {
  count: number;
  resetAt: number;
}

// In-memory only: counters hold a client key and a number, never the queried value,
// and vanish on restart.
const buckets = new Map<string, Bucket>();

export function rateLimit(
  request: Request,
  scope: string,
  limit: number,
  windowMs = 60_000,
): { allowed: boolean; retryAfter: number } {
  const now = Date.now();
  if (buckets.size > 5000) {
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  }
  const key = `${scope}:${clientKey(request)}`;
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfter: 0 };
  }
  if (bucket.count >= limit) {
    return { allowed: false, retryAfter: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  bucket.count += 1;
  return { allowed: true, retryAfter: 0 };
}

export function tooManyRequests(retryAfter: number): NextResponse<ApiError> {
  return fail(429, `Too many requests. Try again in ${retryAfter}s.`, { "Retry-After": String(retryAfter) });
}

export function handleRouteError(error: unknown): NextResponse<ApiError> {
  if (error instanceof UpstreamError) return fail(error.status, error.message);
  return fail(500, "Unexpected server error.");
}
