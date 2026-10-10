import type { DiscordBadge, DiscordScanResult, RiskAssessment } from "@/lib/types";
import { levelForScore } from "@/lib/risk";
import { fetchWithTimeout, UpstreamError, USER_AGENT } from "@/lib/server/http";

const DISCORD_EPOCH_MS = 1420070400000;
const JAPI_BASE = "https://japi.rest/discord/v1/user";

const PUBLIC_FLAGS: { bit: number; key: string; label: string }[] = [
  { bit: 0, key: "staff", label: "Discord Staff" },
  { bit: 1, key: "partner", label: "Partnered Server Owner" },
  { bit: 2, key: "hypesquad", label: "HypeSquad Events" },
  { bit: 3, key: "bug_hunter_1", label: "Bug Hunter Level 1" },
  { bit: 6, key: "bravery", label: "HypeSquad Bravery" },
  { bit: 7, key: "brilliance", label: "HypeSquad Brilliance" },
  { bit: 8, key: "balance", label: "HypeSquad Balance" },
  { bit: 9, key: "early_supporter", label: "Early Supporter" },
  { bit: 14, key: "bug_hunter_2", label: "Bug Hunter Level 2" },
  { bit: 16, key: "verified_bot", label: "Verified Bot" },
  { bit: 17, key: "verified_developer", label: "Early Verified Bot Developer" },
  { bit: 18, key: "certified_moderator", label: "Moderator Programs Alumni" },
  { bit: 19, key: "http_interactions", label: "HTTP Interactions Bot" },
  { bit: 20, key: "spammer", label: "Flagged as likely spammer" },
  { bit: 22, key: "active_developer", label: "Active Developer" },
];

interface DiscordUser {
  id: string;
  username: string;
  global_name?: string | null;
  discriminator?: string;
  avatar?: string | null;
  banner?: string | null;
  accent_color?: number | null;
  public_flags?: number;
  bot?: boolean;
  system?: boolean;
  avatar_decoration_data?: { asset?: string | null } | null;
  primary_guild?: { tag?: string | null; identity_enabled?: boolean | null } | null;
  clan?: { tag?: string | null; identity_enabled?: boolean | null } | null;
}

interface JapiResponse {
  data?: (DiscordUser & { message?: string; code?: number }) | null;
}

type LookupOutcome =
  | { kind: "found"; user: DiscordUser; source: "discord" | "japi" }
  | { kind: "missing"; source: "discord" | "japi" };

export function isSnowflake(value: string): boolean {
  return /^\d{17,20}$/.test(value);
}

function snowflakeTimestamp(id: string): number {
  return Number(BigInt(id) >> BigInt(22)) + DISCORD_EPOCH_MS;
}

/** Same-origin URL for a Discord CDN asset, served through the no-store media proxy. */
function mediaUrl(path: string, size: number): string {
  return `/api/discord/media?p=${encodeURIComponent(path)}&size=${size}`;
}

function defaultAvatar(id: string): string {
  const index = Number((BigInt(id) >> BigInt(22)) % BigInt(6));
  return mediaUrl(`embed/avatars/${index}.png`, 256);
}

function assetUrl(kind: "avatars" | "banners", id: string, hash: string, size: number): string {
  const extension = hash.startsWith("a_") ? "gif" : "png";
  return mediaUrl(`${kind}/${id}/${hash}.${extension}`, size);
}

function decodeBadges(flags: number): DiscordBadge[] {
  return PUBLIC_FLAGS.filter(({ bit }) => (flags & (1 << bit)) !== 0).map(({ key, label }) => ({ key, label }));
}

async function fetchFromDiscord(id: string, token: string): Promise<LookupOutcome> {
  const response = await fetchWithTimeout(`https://discord.com/api/v10/users/${id}`, {
    headers: { Authorization: `Bot ${token}`, "User-Agent": USER_AGENT },
  });
  if (response.status === 404) return { kind: "missing", source: "discord" };
  if (response.status === 401) throw new UpstreamError("Discord rejected the configured DISCORD_BOT_TOKEN.", 502);
  if (response.status === 429) throw new UpstreamError("Discord rate limit reached. Wait a moment and retry.", 429);
  if (!response.ok) throw new UpstreamError(`Discord returned HTTP ${response.status}.`);
  return { kind: "found", user: (await response.json()) as DiscordUser, source: "discord" };
}

/** Keyless fallback: japi.rest proxies Discord's public user object (cached up to an hour). */
async function fetchFromJapi(id: string): Promise<LookupOutcome> {
  const response = await fetchWithTimeout(`${JAPI_BASE}/${id}`, { headers: { "User-Agent": USER_AGENT } });
  if (response.status === 429) throw new UpstreamError("The public Discord lookup is rate limited. Retry shortly.", 429);
  const body = (await response.json().catch(() => null)) as JapiResponse | null;
  const data = body?.data;
  if (data && data.code === 10013) return { kind: "missing", source: "japi" };
  if (!response.ok || !data || typeof data.username !== "string") {
    throw new UpstreamError(`The public Discord lookup returned HTTP ${response.status}.`);
  }
  return { kind: "found", user: data, source: "japi" };
}

function assess(ageDays: number, user: DiscordUser | null, badges: DiscordBadge[], looked: boolean): RiskAssessment {
  const factors: string[] = [];
  const recommendations: string[] = [];
  let score = 0;

  if (ageDays < 7) {
    score += 45;
    factors.push("Account is less than a week old, typical of throwaway and raid accounts.");
  } else if (ageDays < 30) {
    score += 30;
    factors.push("Account is less than a month old.");
  } else if (ageDays < 180) {
    score += 12;
    factors.push("Account is less than six months old.");
  } else {
    factors.push(`Account has existed for ${(ageDays / 365).toFixed(1)} years.`);
  }

  if (user) {
    if (badges.some((badge) => badge.key === "spammer")) {
      score += 45;
      factors.push("Discord has flagged this account as a likely spammer.");
    }
    if (!user.avatar) {
      score += 10;
      factors.push("Account uses a default avatar.");
    }
    if (user.bot) {
      const verified = badges.some((badge) => badge.key === "verified_bot");
      score += verified ? 0 : 10;
      factors.push(verified ? "Verified bot application." : "Unverified bot application.");
    }
  } else if (looked) {
    score += 20;
    factors.push("Discord has no user with this ID: it may be deleted, or the ID belongs to another object type.");
  }

  score = Math.min(100, score);
  if (score >= 25) {
    recommendations.push("Be cautious with links, files, QR codes and 'verification' requests from this account.");
    recommendations.push("Never share login tokens or run code in the browser console at someone's request.");
  }
  recommendations.push("Account age and badges are public signals only: they indicate, not prove, trustworthiness.");

  return { score, level: levelForScore(score), factors, recommendations };
}

export async function analyseDiscord(id: string): Promise<DiscordScanResult> {
  const createdMs = snowflakeTimestamp(id);
  const ageDays = Math.max(0, Math.floor((Date.now() - createdMs) / 86_400_000));
  const token = process.env.DISCORD_BOT_TOKEN?.trim();
  const notices: string[] = [];

  let outcome: LookupOutcome | null = null;
  try {
    outcome = token ? await fetchFromDiscord(id, token) : await fetchFromJapi(id);
  } catch (error) {
    // A broken token should surface; a flaky public mirror degrades to ID-only data instead.
    if (token) throw error;
    notices.push(
      `${error instanceof Error ? error.message : "The public Discord lookup failed."} Showing data derived from the ID only.`,
    );
  }

  if (outcome?.source === "japi") {
    notices.push(
      "Profile fetched through the public japi.rest mirror and may be up to an hour old. Set DISCORD_BOT_TOKEN for direct lookups.",
    );
  }

  const user = outcome?.kind === "found" ? outcome.user : null;
  const badges = user ? decodeBadges(user.public_flags ?? 0) : [];
  const discriminator = user?.discriminator && user.discriminator !== "0" ? user.discriminator : null;
  const guild = user?.primary_guild ?? user?.clan ?? null;
  const decoration = user?.avatar_decoration_data?.asset ?? null;

  return {
    id,
    createdAt: new Date(createdMs).toISOString(),
    accountAgeDays: ageDays,
    defaultAvatarUrl: defaultAvatar(id),
    live: outcome !== null,
    dataSource: outcome?.source ?? "offline",
    profile: user
      ? {
          username: user.username,
          globalName: user.global_name ?? null,
          discriminator,
          isBot: Boolean(user.bot),
          isSystem: Boolean(user.system),
          avatarUrl: user.avatar ? assetUrl("avatars", id, user.avatar, 256) : defaultAvatar(id),
          bannerUrl: user.banner ? assetUrl("banners", id, user.banner, 600) : null,
          accentColor:
            typeof user.accent_color === "number" ? `#${user.accent_color.toString(16).padStart(6, "0")}` : null,
          serverTag: guild?.identity_enabled !== false && guild?.tag ? guild.tag : null,
          decorationUrl: decoration ? mediaUrl(`avatar-decoration-presets/${decoration}.png`, 160) : null,
          badges,
        }
      : null,
    risk: assess(ageDays, user, badges, outcome !== null),
    notices,
  };
}
