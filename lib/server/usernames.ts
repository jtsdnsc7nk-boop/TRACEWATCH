import type { UsernameCategory, UsernameScanResult, UsernameSiteResult } from "@/lib/types";

// Each site was verified against a known-existing and a known-missing username. Sites that block automated
// checks or answer every name the same way (Instagram, TikTok, Reddit, Twitch, Threads, Pinterest, Spotify,
// Snapchat, Letterboxd...) are deliberately left out: a false "found" is worse than no answer.

const BROWSER_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";
const MAX_BODY_BYTES = 3 * 1024 * 1024;
const TIMEOUT_MS = 9_000;
const CONCURRENCY = 12;

type Verdict = "found" | "not_found" | "unknown";

interface ProbeResponse {
  status: number;
  body: string;
}

interface SiteDefinition {
  id: string;
  name: string;
  category: UsernameCategory;
  profileUrl: (user: string) => string;
  probeUrl: (user: string) => string;
  /** Usernames the site cannot have; checked locally so we never send impossible names. */
  pattern?: RegExp;
  method?: "GET" | "POST";
  body?: (user: string) => string;
  headers?: Record<string, string>;
  follow?: boolean;
  readBody?: boolean;
  detect: (response: ProbeResponse) => Verdict;
}

const byStatus =
  (missing: number[] = [404, 410]) =>
  ({ status }: ProbeResponse): Verdict =>
    status === 200 ? "found" : missing.includes(status) ? "not_found" : "unknown";

const bodyHas =
  (marker: string) =>
  ({ status, body }: ProbeResponse): Verdict => {
    if (status === 404 || status === 204) return "not_found";
    if (status !== 200) return "unknown";
    return body.includes(marker) ? "found" : "not_found";
  };

const bodyLacks =
  (marker: string) =>
  ({ status, body }: ProbeResponse): Verdict => {
    if (status === 404) return "not_found";
    if (status !== 200) return "unknown";
    return body.includes(marker) ? "not_found" : "found";
  };

const e = encodeURIComponent;
const HANDLE = /^[A-Za-z0-9-]+$/;

const SITES: SiteDefinition[] = [
  // Social
  { id: "x", name: "X (Twitter)", category: "social", pattern: /^[A-Za-z0-9_]{1,15}$/, profileUrl: (u) => `https://x.com/${e(u)}`, probeUrl: (u) => `https://x.com/${e(u)}`, detect: byStatus() },
  { id: "youtube", name: "YouTube", category: "social", profileUrl: (u) => `https://www.youtube.com/@${e(u)}`, probeUrl: (u) => `https://www.youtube.com/@${e(u)}`, headers: { Cookie: "SOCS=CAI" }, detect: byStatus() },
  { id: "telegram", name: "Telegram", category: "social", pattern: /^[A-Za-z0-9_]{5,32}$/, profileUrl: (u) => `https://t.me/${e(u)}`, probeUrl: (u) => `https://t.me/${e(u)}`, readBody: true, detect: bodyHas("tgme_page_title") },
  { id: "mastodon", name: "Mastodon (mastodon.social)", category: "social", pattern: /^[A-Za-z0-9_]+$/, profileUrl: (u) => `https://mastodon.social/@${e(u)}`, probeUrl: (u) => `https://mastodon.social/api/v1/accounts/lookup?acct=${e(u)}`, detect: byStatus() },
  { id: "bluesky", name: "Bluesky", category: "social", pattern: HANDLE, profileUrl: (u) => `https://bsky.app/profile/${e(u)}.bsky.social`, probeUrl: (u) => `https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${e(u)}.bsky.social`, detect: byStatus([400, 404]) },
  { id: "tumblr", name: "Tumblr", category: "social", profileUrl: (u) => `https://www.tumblr.com/${e(u)}`, probeUrl: (u) => `https://www.tumblr.com/${e(u)}`, follow: true, detect: byStatus() },
  { id: "linktree", name: "Linktree", category: "social", profileUrl: (u) => `https://linktr.ee/${e(u)}`, probeUrl: (u) => `https://linktr.ee/${e(u)}`, detect: byStatus() },
  { id: "aboutme", name: "About.me", category: "social", profileUrl: (u) => `https://about.me/${e(u)}`, probeUrl: (u) => `https://about.me/${e(u)}`, detect: byStatus() },
  { id: "gravatar", name: "Gravatar", category: "social", profileUrl: (u) => `https://gravatar.com/${e(u)}`, probeUrl: (u) => `https://en.gravatar.com/${e(u)}.json`, detect: byStatus() },
  // Developer
  { id: "github", name: "GitHub", category: "developer", pattern: /^[A-Za-z0-9-]{1,39}$/, profileUrl: (u) => `https://github.com/${e(u)}`, probeUrl: (u) => `https://api.github.com/users/${e(u)}`, headers: { Accept: "application/vnd.github+json" }, detect: byStatus() },
  { id: "gitlab", name: "GitLab", category: "developer", profileUrl: (u) => `https://gitlab.com/${e(u)}`, probeUrl: (u) => `https://gitlab.com/api/v4/users?username=${e(u)}`, readBody: true, detect: bodyHas('"username"') },
  { id: "codeberg", name: "Codeberg", category: "developer", profileUrl: (u) => `https://codeberg.org/${e(u)}`, probeUrl: (u) => `https://codeberg.org/api/v1/users/${e(u)}`, detect: byStatus() },
  { id: "dockerhub", name: "Docker Hub", category: "developer", profileUrl: (u) => `https://hub.docker.com/u/${e(u)}`, probeUrl: (u) => `https://hub.docker.com/v2/users/${e(u)}`, follow: true, detect: byStatus() },
  { id: "npm", name: "npm (package maintainers)", category: "developer", profileUrl: (u) => `https://www.npmjs.com/~${e(u)}`, probeUrl: (u) => `https://registry.npmjs.org/-/v1/search?text=maintainer:${e(u)}&size=1`, readBody: true, detect: ({ status, body }) => (status !== 200 ? "unknown" : /"total":\s*0\b/.test(body) ? "not_found" : body.includes('"total"') ? "found" : "unknown") },
  { id: "huggingface", name: "Hugging Face", category: "developer", profileUrl: (u) => `https://huggingface.co/${e(u)}`, probeUrl: (u) => `https://huggingface.co/${e(u)}`, detect: byStatus() },
  { id: "kaggle", name: "Kaggle", category: "developer", profileUrl: (u) => `https://www.kaggle.com/${e(u)}`, probeUrl: (u) => `https://www.kaggle.com/${e(u)}`, detect: byStatus() },
  { id: "devto", name: "DEV Community", category: "developer", profileUrl: (u) => `https://dev.to/${e(u)}`, probeUrl: (u) => `https://dev.to/api/users/by_username?url=${e(u)}`, detect: byStatus() },
  { id: "hackernews", name: "Hacker News", category: "developer", profileUrl: (u) => `https://news.ycombinator.com/user?id=${e(u)}`, probeUrl: (u) => `https://hacker-news.firebaseio.com/v0/user/${e(u)}.json`, readBody: true, detect: bodyHas('"id"') },
  { id: "keybase", name: "Keybase", category: "developer", profileUrl: (u) => `https://keybase.io/${e(u)}`, probeUrl: (u) => `https://keybase.io/_/api/1.0/user/lookup.json?usernames=${e(u)}&fields=basics`, readBody: true, detect: bodyHas('"basics"') },
  { id: "codeforces", name: "Codeforces", category: "developer", profileUrl: (u) => `https://codeforces.com/profile/${e(u)}`, probeUrl: (u) => `https://codeforces.com/api/user.info?handles=${e(u)}`, detect: byStatus([400, 404]) },
  { id: "monkeytype", name: "Monkeytype", category: "developer", profileUrl: (u) => `https://monkeytype.com/profile/${e(u)}`, probeUrl: (u) => `https://api.monkeytype.com/users/${e(u)}/profile`, detect: byStatus() },
  { id: "pastebin", name: "Pastebin", category: "developer", profileUrl: (u) => `https://pastebin.com/u/${e(u)}`, probeUrl: (u) => `https://pastebin.com/u/${e(u)}`, detect: byStatus() },
  { id: "scratch", name: "Scratch", category: "developer", profileUrl: (u) => `https://scratch.mit.edu/users/${e(u)}`, probeUrl: (u) => `https://api.scratch.mit.edu/users/${e(u)}`, detect: byStatus() },
  // Gaming
  { id: "steam", name: "Steam", category: "gaming", profileUrl: (u) => `https://steamcommunity.com/id/${e(u)}`, probeUrl: (u) => `https://steamcommunity.com/id/${e(u)}`, readBody: true, detect: bodyLacks("The specified profile could not be found") },
  { id: "minecraft", name: "Minecraft", category: "gaming", pattern: /^[A-Za-z0-9_]{3,16}$/, profileUrl: (u) => `https://namemc.com/profile/${e(u)}`, probeUrl: (u) => `https://api.mojang.com/users/profiles/minecraft/${e(u)}`, readBody: true, detect: bodyHas('"id"') },
  { id: "roblox", name: "Roblox", category: "gaming", profileUrl: (u) => `https://www.roblox.com/user.aspx?username=${e(u)}`, probeUrl: () => "https://users.roblox.com/v1/usernames/users", method: "POST", body: (u) => JSON.stringify({ usernames: [u], excludeBannedUsers: false }), headers: { "Content-Type": "application/json" }, readBody: true, detect: bodyHas('"name"') },
  { id: "chesscom", name: "Chess.com", category: "gaming", profileUrl: (u) => `https://www.chess.com/member/${e(u)}`, probeUrl: (u) => `https://api.chess.com/pub/player/${e(u.toLowerCase())}`, detect: byStatus() },
  { id: "lichess", name: "Lichess", category: "gaming", profileUrl: (u) => `https://lichess.org/@/${e(u)}`, probeUrl: (u) => `https://lichess.org/api/user/${e(u)}`, detect: byStatus() },
  { id: "osu", name: "osu!", category: "gaming", profileUrl: (u) => `https://osu.ppy.sh/users/${e(u)}`, probeUrl: (u) => `https://osu.ppy.sh/users/${e(u)}`, follow: true, detect: byStatus() },
  { id: "itchio", name: "itch.io", category: "gaming", pattern: HANDLE, profileUrl: (u) => `https://${u.toLowerCase()}.itch.io`, probeUrl: (u) => `https://${u.toLowerCase()}.itch.io`, detect: byStatus() },
  { id: "duolingo", name: "Duolingo", category: "gaming", profileUrl: (u) => `https://www.duolingo.com/profile/${e(u)}`, probeUrl: (u) => `https://www.duolingo.com/2017-06-30/users?username=${e(u)}&fields=users`, readBody: true, detect: bodyHas('"users":[{') },
  // Creative
  { id: "soundcloud", name: "SoundCloud", category: "creative", profileUrl: (u) => `https://soundcloud.com/${e(u)}`, probeUrl: (u) => `https://soundcloud.com/${e(u)}`, detect: byStatus() },
  { id: "vimeo", name: "Vimeo", category: "creative", profileUrl: (u) => `https://vimeo.com/${e(u)}`, probeUrl: (u) => `https://vimeo.com/${e(u)}`, follow: true, detect: byStatus() },
  { id: "flickr", name: "Flickr", category: "creative", profileUrl: (u) => `https://www.flickr.com/people/${e(u)}`, probeUrl: (u) => `https://www.flickr.com/people/${e(u)}`, detect: byStatus() },
  { id: "dribbble", name: "Dribbble", category: "creative", profileUrl: (u) => `https://dribbble.com/${e(u)}`, probeUrl: (u) => `https://dribbble.com/${e(u)}`, detect: byStatus() },
  { id: "sketchfab", name: "Sketchfab", category: "creative", profileUrl: (u) => `https://sketchfab.com/${e(u)}`, probeUrl: (u) => `https://sketchfab.com/${e(u)}`, follow: true, detect: byStatus() },
  { id: "medium", name: "Medium", category: "creative", profileUrl: (u) => `https://medium.com/@${e(u)}`, probeUrl: (u) => `https://medium.com/feed/@${e(u)}`, detect: byStatus() },
  { id: "wattpad", name: "Wattpad", category: "creative", profileUrl: (u) => `https://www.wattpad.com/user/${e(u)}`, probeUrl: (u) => `https://www.wattpad.com/user/${e(u)}`, follow: true, detect: byStatus() },
  { id: "patreon", name: "Patreon", category: "creative", profileUrl: (u) => `https://www.patreon.com/${e(u)}`, probeUrl: (u) => `https://www.patreon.com/${e(u)}`, follow: true, detect: byStatus() },
  // Community
  { id: "wikipedia", name: "Wikipedia", category: "community", profileUrl: (u) => `https://en.wikipedia.org/wiki/User:${e(u)}`, probeUrl: (u) => `https://en.wikipedia.org/w/api.php?action=query&list=users&ususers=${e(u)}&format=json`, readBody: true, detect: ({ status, body }) => (status !== 200 ? "unknown" : /"(missing|invalid)"/.test(body) ? "not_found" : body.includes('"userid"') ? "found" : "unknown") },
  { id: "disqus", name: "Disqus", category: "community", profileUrl: (u) => `https://disqus.com/by/${e(u)}/`, probeUrl: (u) => `https://disqus.com/by/${e(u)}/`, detect: byStatus() },
  { id: "untappd", name: "Untappd", category: "community", profileUrl: (u) => `https://untappd.com/user/${e(u)}`, probeUrl: (u) => `https://untappd.com/user/${e(u)}`, detect: byStatus() },
];

export function isValidUsername(value: string): boolean {
  return /^[A-Za-z0-9._-]{2,40}$/.test(value);
}

async function readCapped(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let text = "";
  let bytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    text += decoder.decode(value, { stream: true });
    if (bytes >= MAX_BODY_BYTES) {
      await reader.cancel();
      break;
    }
  }
  return text;
}

async function checkSite(site: SiteDefinition, username: string): Promise<UsernameSiteResult> {
  const base = { id: site.id, name: site.name, category: site.category, profileUrl: site.profileUrl(username) };
  if (site.pattern && !site.pattern.test(username)) {
    return { ...base, status: "invalid", detail: "Not a valid username on this site." };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(site.probeUrl(username), {
      method: site.method ?? "GET",
      body: site.body?.(username),
      headers: {
        "User-Agent": BROWSER_UA,
        Accept: "text/html,application/json;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        ...site.headers,
      },
      redirect: site.follow ? "follow" : "manual",
      signal: controller.signal,
      cache: "no-store",
    });
    const body = site.readBody ? await readCapped(response) : "";
    if (!site.readBody) await response.body?.cancel().catch(() => undefined);
    const verdict = site.detect({ status: response.status, body });
    return {
      ...base,
      status: verdict,
      detail:
        verdict === "unknown"
          ? response.status === 429
            ? "Rate limited by the site."
            : response.status === 403
              ? "The site blocked the check."
              : `Unexpected HTTP ${response.status}.`
          : undefined,
    };
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    return { ...base, status: "unknown", detail: timedOut ? "Timed out." : "Could not reach the site." };
  } finally {
    clearTimeout(timer);
  }
}

/** Checks every site with bounded concurrency. Results keep the catalogue order. */
export async function searchUsername(username: string): Promise<UsernameScanResult> {
  const started = Date.now();
  const results: UsernameSiteResult[] = new Array(SITES.length);
  let next = 0;
  async function worker() {
    while (next < SITES.length) {
      const index = next++;
      results[index] = await checkSite(SITES[index], username);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, SITES.length) }, worker));
  return {
    username,
    results,
    found: results.filter((result) => result.status === "found").length,
    checked: results.filter((result) => result.status !== "invalid").length,
    durationMs: Date.now() - started,
  };
}
