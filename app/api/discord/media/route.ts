import { fail, fetchWithTimeout, rateLimit, tooManyRequests, USER_AGENT } from "@/lib/server/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Only these Discord CDN asset shapes can be proxied; the host is fixed, so this cannot be used to fetch arbitrary URLs.
const ALLOWED_PATH =
  /^(?:(?:avatars|banners)\/\d{17,20}\/(?:a_)?[0-9a-f]{32}\.(?:png|gif)|embed\/avatars\/[0-5]\.png|avatar-decoration-presets\/(?:a_)?[0-9a-f]{32}\.png)$/;
const ALLOWED_SIZES = new Set(["16", "32", "64", "128", "160", "256", "512", "600", "1024"]);
const MAX_BYTES = 8 * 1024 * 1024;

/**
 * Streams a Discord avatar/banner through TraceWatch with `no-store`, so the viewer's browser never caches
 * which profiles were looked up and Discord's CDN never sees the viewer's IP address.
 */
export async function GET(request: Request) {
  const limit = rateLimit(request, "discord-media", 120);
  if (!limit.allowed) return tooManyRequests(limit.retryAfter);

  const params = new URL(request.url).searchParams;
  const path = params.get("p") ?? "";
  const size = params.get("size") ?? "256";
  if (!ALLOWED_PATH.test(path) || !ALLOWED_SIZES.has(size)) return fail(400, "Unsupported media path.");

  const upstream = new URL(`https://cdn.discordapp.com/${path}`);
  upstream.searchParams.set("size", size);
  if (path.startsWith("avatar-decoration-presets/")) upstream.searchParams.set("passthrough", "true");

  try {
    const response = await fetchWithTimeout(upstream.toString(), { headers: { "User-Agent": USER_AGENT } });
    const type = response.headers.get("content-type") ?? "";
    if (!response.ok || !type.startsWith("image/")) return fail(404, "Image not available.");
    const body = await response.arrayBuffer();
    if (body.byteLength > MAX_BYTES) return fail(502, "Image too large.");
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": type,
        "Cache-Control": "no-store, no-cache, must-revalidate, private",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return fail(502, "Image not available.");
  }
}
