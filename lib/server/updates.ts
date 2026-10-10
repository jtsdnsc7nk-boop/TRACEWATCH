import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import changelog from "@/changelog.json";
import type { Release, UpdateStatus } from "@/lib/types";
import { fetchWithTimeout, USER_AGENT } from "@/lib/server/http";

const RELEASES = changelog.releases as Release[];
const CURRENT = RELEASES[0];
const DEFAULT_UPDATE_URL = "https://raw.githubusercontent.com/jtsdnsc7nk-boop/TRACEWATCH/main/changelog.json";

// The only thing TraceWatch ever writes to disk: which release notes the operator has already seen.
// It holds a version string, never anything that was searched.
const STATE_DIR = path.join(process.cwd(), ".tracewatch");
const STATE_FILE = path.join(STATE_DIR, "state.json");

/** Compares dotted numeric versions: negative if a < b, positive if a > b. */
export function compareVersions(a: string, b: string): number {
  const left = a.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const right = b.split(".").map((part) => Number.parseInt(part, 10) || 0);
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function updateCheckEnabled(): boolean {
  return (process.env.TRACEWATCH_UPDATE_CHECK ?? "on").toLowerCase() !== "off";
}

let remoteCache: { expiresAt: number; latest: Release | null } | null = null;

/** Remote release notes are untrusted input: keep only well-formed text and https links. */
function sanitizeRelease(raw: unknown): Release | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  if (typeof value.version !== "string" || !/^\d+(\.\d+){0,3}$/.test(value.version)) return null;
  const text = (input: unknown, max: number) => (typeof input === "string" ? input.slice(0, max) : "");
  const changes = Array.isArray(value.changes)
    ? value.changes.filter((change): change is string => typeof change === "string").slice(0, 20).map((c) => c.slice(0, 300))
    : [];
  const link = value.link as { label?: unknown; url?: unknown } | undefined;
  const linkUrl = typeof link?.url === "string" && /^https:\/\/[^\s]+$/.test(link.url) ? link.url : null;
  return {
    version: value.version,
    date: text(value.date, 20),
    title: text(value.title, 120) || `Version ${value.version}`,
    changes,
    ...(linkUrl ? { link: { label: text(link?.label, 40) || "Learn more", url: linkUrl } } : {}),
  };
}

async function fetchLatestRelease(): Promise<Release | null> {
  const now = Date.now();
  if (remoteCache && remoteCache.expiresAt > now) return remoteCache.latest;
  let latest: Release | null = null;
  try {
    const response = await fetchWithTimeout(process.env.TRACEWATCH_UPDATE_URL || DEFAULT_UPDATE_URL, {
      headers: { "User-Agent": USER_AGENT },
    });
    if (response.ok) {
      const data = (await response.json()) as { releases?: unknown[] };
      const releases = (Array.isArray(data.releases) ? data.releases : [])
        .map(sanitizeRelease)
        .filter((release): release is Release => release !== null);
      latest = releases.reduce<Release | null>(
        (best, release) => (!best || compareVersions(release.version, best.version) > 0 ? release : best),
        null,
      );
    }
  } catch {
    latest = null;
  }
  // Check at most every 30 minutes; a private or unreachable repository simply means "no update".
  remoteCache = { expiresAt: now + 30 * 60 * 1000, latest };
  return latest;
}

async function readAcknowledged(): Promise<string | null> {
  try {
    const state = JSON.parse(await readFile(STATE_FILE, "utf8")) as { acknowledgedVersion?: unknown };
    return typeof state.acknowledgedVersion === "string" ? state.acknowledgedVersion : null;
  } catch {
    return null;
  }
}

export async function acknowledgeCurrentRelease(): Promise<void> {
  await mkdir(STATE_DIR, { recursive: true });
  await writeFile(STATE_FILE, `${JSON.stringify({ acknowledgedVersion: CURRENT.version }, null, 2)}\n`, "utf8");
}

export async function getUpdateStatus(): Promise<UpdateStatus> {
  const enabled = updateCheckEnabled();
  const [latest, acknowledged] = await Promise.all([enabled ? fetchLatestRelease() : null, readAcknowledged()]);

  let whatsNew: Release[] = [];
  if (acknowledged === null) {
    // First run of this install: introduce the current release only.
    whatsNew = [CURRENT];
  } else if (compareVersions(CURRENT.version, acknowledged) > 0) {
    whatsNew = RELEASES.filter((release) => compareVersions(release.version, acknowledged) > 0);
  }

  return {
    current: CURRENT.version,
    repository: changelog.repository,
    update: latest && compareVersions(latest.version, CURRENT.version) > 0 ? latest : null,
    whatsNew,
    checkEnabled: enabled,
  };
}
