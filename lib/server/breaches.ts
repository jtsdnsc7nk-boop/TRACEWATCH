import type {
  Breach,
  BreachSource,
  CatalogueResult,
  CatalogueSort,
  InfostealerHit,
  SourceStatus,
} from "@/lib/types";
import { fetchWithTimeout, UpstreamError, USER_AGENT } from "@/lib/server/http";

const HIBP_BASE = "https://haveibeenpwned.com/api/v3";
const XON_BASE = "https://api.xposedornot.com/v1";
const LEAKCHECK_BASE = "https://leakcheck.io/api/public";
const HUDSONROCK_BASE = "https://cavalier.hudsonrock.com/api/json/v2/osint-tools";

interface HibpBreach {
  Name: string;
  Title: string;
  Domain: string;
  BreachDate: string;
  AddedDate?: string;
  PwnCount: number;
  Description: string;
  DataClasses: string[];
  IsVerified: boolean;
  IsSensitive: boolean;
}

interface XonBreach {
  breach?: string;
  details?: string;
  domain?: string;
  verified?: string;
  xposed_data?: string;
  xposed_date?: string;
  xposed_records?: number;
}

interface XonAnalytics {
  ExposedBreaches?: { breaches_details?: XonBreach[] } | null;
  PastesSummary?: { cnt?: number } | null;
}

interface LeakCheckResponse {
  success?: boolean;
  found?: number;
  fields?: string[];
  sources?: { name?: string; date?: string }[];
  error?: string;
}

interface HudsonRockStealer {
  date_compromised?: string;
  operating_system?: string;
  total_corporate_services?: number;
  total_user_services?: number;
  antiviruses?: unknown[] | string;
}

interface HudsonRockResponse {
  stealers?: HudsonRockStealer[];
}

interface SourceLookup {
  breaches: Breach[];
  pasteCount?: number;
  fields?: string[];
}

export interface AccountLookup {
  breaches: Breach[];
  pasteCount: number;
  infostealers: InfostealerHit[];
  exposedFields: string[];
  sources: SourceStatus[];
}

const SOURCE_PRIORITY: BreachSource[] = ["hibp", "xposedornot", "leakcheck"];

// LeakCheck reports field names in snake_case; map them onto the HIBP vocabulary used elsewhere.
const LEAKCHECK_FIELDS: Record<string, string> = {
  password: "Passwords",
  username: "Usernames",
  name: "Names",
  first_name: "Names",
  last_name: "Names",
  middle_name: "Names",
  profile_name: "Usernames",
  phone: "Phone numbers",
  address: "Physical addresses",
  city: "Physical addresses",
  state: "Physical addresses",
  zip: "Physical addresses",
  country: "Geographic locations",
  ip: "IP addresses",
  ip1: "IP addresses",
  ip2: "IP addresses",
  dob: "Dates of birth",
  gender: "Genders",
  ssn: "Social security numbers",
  company_name: "Employers",
};

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/** Normalises a breach name or domain so "Dubsmash", "Dubsmash.com" and "dubsmash.com" compare equal. */
function breachKey(value: string | null | undefined): string | null {
  if (!value) return null;
  let key = value.toLowerCase().trim();
  for (let i = 0; i < 2; i += 1) {
    key = key.replace(/\.(com|net|org|io|co|ru|de|fr|uk|us|info|biz|me|tv|cc|gg|in|cd|br|pl|jp|cn|kr|es|it|nl|ca|au)$/, "");
  }
  key = key.replace(/[^a-z0-9]/g, "");
  return key.length >= 2 ? key : null;
}

function keysFor(breach: Breach): string[] {
  return [breachKey(breach.name), breachKey(breach.title), breachKey(breach.domain)].filter(
    (key): key is string => key !== null,
  );
}

function fromHibp(raw: HibpBreach): Breach {
  return {
    name: raw.Name,
    title: raw.Title || raw.Name,
    domain: raw.Domain || null,
    date: raw.BreachDate || null,
    records: typeof raw.PwnCount === "number" ? raw.PwnCount : null,
    dataClasses: Array.isArray(raw.DataClasses) ? raw.DataClasses : [],
    description: stripHtml(raw.Description ?? ""),
    verified: Boolean(raw.IsVerified),
    sensitive: Boolean(raw.IsSensitive),
    sources: ["hibp"],
  };
}

function fromXon(raw: XonBreach): Breach {
  const name = raw.breach ?? "Unknown breach";
  return {
    name,
    title: name,
    domain: raw.domain ? raw.domain : null,
    date: raw.xposed_date ? String(raw.xposed_date) : null,
    records: typeof raw.xposed_records === "number" ? raw.xposed_records : null,
    dataClasses: (raw.xposed_data ?? "")
      .split(";")
      .map((item) => item.trim())
      .filter(Boolean),
    description: stripHtml(raw.details ?? ""),
    verified: (raw.verified ?? "").toLowerCase() === "yes",
    sensitive: false,
    sources: ["xposedornot"],
  };
}

function fromLeakCheck(raw: { name?: string; date?: string }): Breach {
  const name = raw.name?.trim() || "Unknown source";
  const looksLikeDomain = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(name);
  return {
    name,
    title: looksLikeDomain ? name.replace(/\.[a-z]{2,}$/i, "") : name,
    domain: looksLikeDomain ? name.toLowerCase() : null,
    date: raw.date?.trim() || null,
    records: null,
    dataClasses: [],
    description: "",
    verified: false,
    sensitive: false,
    sources: ["leakcheck"],
  };
}

function datePrecision(date: string | null): number {
  return date ? date.length : 0;
}

/** Folds `incoming` into `base`; `base` is assumed to come from an equal or higher-priority source. */
function mergeBreach(base: Breach, incoming: Breach): Breach {
  const sources = SOURCE_PRIORITY.filter((s) => base.sources.includes(s) || incoming.sources.includes(s));
  return {
    name: base.name,
    title: base.title,
    domain: base.domain ?? incoming.domain,
    date: datePrecision(incoming.date) > datePrecision(base.date) ? incoming.date : base.date,
    records:
      base.records !== null || incoming.records !== null ? Math.max(base.records ?? 0, incoming.records ?? 0) : null,
    dataClasses: Array.from(new Set([...base.dataClasses, ...incoming.dataClasses])).sort(),
    description: base.description || incoming.description,
    verified: base.verified || incoming.verified,
    sensitive: base.sensitive || incoming.sensitive,
    sources,
  };
}

function sortNewestFirst(breaches: Breach[]): Breach[] {
  return [...breaches].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
}

/** Merges per-source results into one de-duplicated list, preferring richer sources' metadata. */
function mergeAll(lists: Breach[][], catalogue: Map<string, Breach> | null): Breach[] {
  const merged: Breach[] = [];
  const index = new Map<string, number>();
  const ordered = lists.flat().sort((a, b) => SOURCE_PRIORITY.indexOf(a.sources[0]) - SOURCE_PRIORITY.indexOf(b.sources[0]));

  for (const breach of ordered) {
    const keys = keysFor(breach);
    const existing = keys.map((key) => index.get(key)).find((i): i is number => i !== undefined);
    if (existing !== undefined) {
      merged[existing] = mergeBreach(merged[existing], breach);
      for (const key of keys) index.set(key, existing);
      continue;
    }
    let entry = breach;
    // Enrich thin records (no description, data classes or size) with the public HIBP catalogue entry.
    if (catalogue && !entry.sources.includes("hibp")) {
      const match = keys.map((key) => catalogue.get(key)).find(Boolean);
      if (match) {
        entry = {
          ...mergeBreach({ ...match, sources: [] }, entry),
          sources: entry.sources,
        };
      }
    }
    index.set(keys[0] ?? `${merged.length}`, merged.length);
    for (const key of keys) index.set(key, merged.length);
    merged.push(entry);
  }
  return sortNewestFirst(merged);
}

async function lookupHibp(email: string, apiKey: string): Promise<SourceLookup> {
  const headers = { "hibp-api-key": apiKey, "User-Agent": USER_AGENT };
  const response = await fetchWithTimeout(
    `${HIBP_BASE}/breachedaccount/${encodeURIComponent(email)}?truncateResponse=false`,
    { headers },
  );
  if (response.status === 401 || response.status === 403) {
    throw new UpstreamError("Rejected the configured HIBP_API_KEY.");
  }
  if (response.status === 429) throw new UpstreamError("Rate limited. Retry in a few seconds.", 429);
  let breaches: Breach[] = [];
  if (response.status !== 404) {
    if (!response.ok) throw new UpstreamError(`HTTP ${response.status}.`);
    breaches = ((await response.json()) as HibpBreach[]).map(fromHibp);
  }

  // Pastes are best-effort: the breach result is still useful if this call fails.
  let pasteCount = 0;
  try {
    const pasteResponse = await fetchWithTimeout(`${HIBP_BASE}/pasteaccount/${encodeURIComponent(email)}`, {
      headers,
    });
    if (pasteResponse.ok) {
      const pastes: unknown = await pasteResponse.json();
      if (Array.isArray(pastes)) pasteCount = pastes.length;
    }
  } catch {
    pasteCount = 0;
  }
  return { breaches, pasteCount };
}

async function lookupXon(email: string): Promise<SourceLookup> {
  const response = await fetchWithTimeout(`${XON_BASE}/breach-analytics?email=${encodeURIComponent(email)}`, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (response.status === 404) return { breaches: [], pasteCount: 0 };
  if (response.status === 429) throw new UpstreamError("Rate limited. Retry in a few seconds.", 429);
  if (!response.ok) throw new UpstreamError(`HTTP ${response.status}.`);
  const data = (await response.json()) as XonAnalytics;
  const details = data.ExposedBreaches?.breaches_details;
  return {
    breaches: Array.isArray(details) ? details.map(fromXon) : [],
    pasteCount: typeof data.PastesSummary?.cnt === "number" ? data.PastesSummary.cnt : 0,
  };
}

async function lookupLeakCheck(email: string): Promise<SourceLookup> {
  const response = await fetchWithTimeout(`${LEAKCHECK_BASE}?check=${encodeURIComponent(email)}`, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (response.status === 429) throw new UpstreamError("Rate limited. Retry in a few seconds.", 429);
  const data = (await response.json().catch(() => null)) as LeakCheckResponse | null;
  if (!data) throw new UpstreamError(`HTTP ${response.status}.`);
  if (!data.success) {
    if ((data.error ?? "").toLowerCase().includes("not found")) return { breaches: [] };
    throw new UpstreamError(data.error ? `${data.error}.` : `HTTP ${response.status}.`);
  }
  const fields = Array.from(
    new Set((data.fields ?? []).map((field) => LEAKCHECK_FIELDS[field]).filter((field): field is string => Boolean(field))),
  );
  return { breaches: (data.sources ?? []).map(fromLeakCheck), fields };
}

async function lookupInfostealers(email: string): Promise<InfostealerHit[]> {
  const response = await fetchWithTimeout(`${HUDSONROCK_BASE}/search-by-email?email=${encodeURIComponent(email)}`, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (response.status === 404) return [];
  if (response.status === 429) throw new UpstreamError("Rate limited. Retry in a few seconds.", 429);
  if (!response.ok) throw new UpstreamError(`HTTP ${response.status}.`);
  const data = (await response.json()) as HudsonRockResponse;
  const known = (value: string | undefined) => (value && value !== "Not Found" ? value : null);
  return (data.stealers ?? [])
    .map((stealer) => ({
      dateCompromised: known(stealer.date_compromised),
      operatingSystem: known(stealer.operating_system),
      corporateServices: stealer.total_corporate_services ?? 0,
      userServices: stealer.total_user_services ?? 0,
      antivirusCount: Array.isArray(stealer.antiviruses) ? stealer.antiviruses.length : 0,
    }))
    .sort((a, b) => (b.dateCompromised ?? "").localeCompare(a.dateCompromised ?? ""));
}

export function hibpConfigured(): boolean {
  return Boolean(process.env.HIBP_API_KEY?.trim());
}

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : "Unavailable.";
}

/** Queries every configured source in parallel; one failing source never fails the whole scan. */
export async function lookupAccount(email: string): Promise<AccountLookup> {
  const apiKey = process.env.HIBP_API_KEY?.trim();
  const [hibp, xon, leakcheck, stealers, catalogue] = await Promise.allSettled([
    apiKey ? lookupHibp(email, apiKey) : Promise.resolve(null),
    lookupXon(email),
    lookupLeakCheck(email),
    lookupInfostealers(email),
    loadCatalogueIndex(),
  ]);

  const sources: SourceStatus[] = [];
  const lists: Breach[][] = [];
  const fields = new Set<string>();
  let pasteCount = 0;

  const record = (id: BreachSource, label: string, result: PromiseSettledResult<SourceLookup | null>) => {
    if (result.status === "rejected") {
      sources.push({ id, label, status: "error", found: 0, message: errorMessage(result.reason) });
      return;
    }
    if (result.value === null) {
      sources.push({ id, label, status: "skipped", found: 0, message: "Set HIBP_API_KEY to enable." });
      return;
    }
    lists.push(result.value.breaches);
    pasteCount = Math.max(pasteCount, result.value.pasteCount ?? 0);
    for (const field of result.value.fields ?? []) fields.add(field);
    sources.push({ id, label, status: "ok", found: result.value.breaches.length });
  };

  record("hibp", "Have I Been Pwned", hibp);
  record("xposedornot", "XposedOrNot", xon);
  record("leakcheck", "LeakCheck", leakcheck);

  const infostealers = stealers.status === "fulfilled" ? stealers.value : [];
  sources.push(
    stealers.status === "fulfilled"
      ? { id: "hudsonrock", label: "Hudson Rock (infostealers)", status: "ok", found: infostealers.length }
      : { id: "hudsonrock", label: "Hudson Rock (infostealers)", status: "error", found: 0, message: errorMessage(stealers.reason) },
  );

  const breachSourcesOk = sources.some((source) => source.id !== "hudsonrock" && source.status === "ok");
  if (!breachSourcesOk && stealers.status === "rejected") {
    throw new UpstreamError("Every intelligence source failed. Try again shortly.", 502);
  }

  const breaches = mergeAll(lists, catalogue.status === "fulfilled" ? catalogue.value : null);
  for (const breach of breaches) for (const dataClass of breach.dataClasses) fields.add(dataClass);

  return {
    breaches,
    pasteCount,
    infostealers,
    exposedFields: Array.from(fields).sort(),
    sources,
  };
}

// The breach catalogue is public, non-personal data, so a short in-memory cache is safe.
let catalogueCache: { expiresAt: number; breaches: Breach[]; index: Map<string, Breach>; added: Map<string, string> } | null =
  null;

export async function loadCatalogueData() {
  const now = Date.now();
  if (catalogueCache && catalogueCache.expiresAt > now) return catalogueCache;
  const response = await fetchWithTimeout(`${HIBP_BASE}/breaches`, { headers: { "User-Agent": USER_AGENT } }, 15_000);
  if (!response.ok) throw new UpstreamError(`Have I Been Pwned returned HTTP ${response.status}.`);
  const raw = (await response.json()) as HibpBreach[];
  const breaches = raw.map(fromHibp);
  const index = new Map<string, Breach>();
  const added = new Map<string, string>();
  raw.forEach((item, i) => added.set(breaches[i].name, item.AddedDate ?? ""));
  for (const breach of breaches) {
    for (const key of keysFor(breach)) if (!index.has(key)) index.set(key, breach);
  }
  catalogueCache = { expiresAt: now + 60 * 60 * 1000, breaches, index, added };
  return catalogueCache;
}

async function loadCatalogueIndex(): Promise<Map<string, Breach>> {
  return (await loadCatalogueData()).index;
}

export async function queryCatalogue(options: {
  query: string;
  sort: CatalogueSort;
  offset: number;
  limit: number;
}): Promise<CatalogueResult> {
  const { breaches, added } = await loadCatalogueData();
  const needle = options.query.trim().toLowerCase();
  const matches = needle
    ? breaches.filter(
        (breach) =>
          breach.title.toLowerCase().includes(needle) ||
          (breach.domain ?? "").toLowerCase().includes(needle) ||
          breach.dataClasses.some((dataClass) => dataClass.toLowerCase().includes(needle)),
      )
    : breaches;

  const sorted = [...matches].sort((a, b) => {
    if (options.sort === "size") return (b.records ?? 0) - (a.records ?? 0);
    if (options.sort === "date") return (b.date ?? "").localeCompare(a.date ?? "");
    return (added.get(b.name) ?? "").localeCompare(added.get(a.name) ?? "");
  });

  return {
    breaches: sorted.slice(options.offset, options.offset + options.limit),
    matching: matches.length,
    total: breaches.length,
    totalRecords: breaches.reduce((sum, breach) => sum + (breach.records ?? 0), 0),
    offset: options.offset,
  };
}
